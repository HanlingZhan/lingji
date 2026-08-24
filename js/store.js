// ============ 数据层：本地持久化 + 云同步 + 离线合并 ============
import { uid, now, ymd, addDays } from './utils.js';

const KEY = 'scholarhub.state.v1';
const QKEY = 'scholarhub.queue.v1';

export const DEFAULT_DASH = [
  { id: 'todo', name: '近期待办', w: 'w6' },
  { id: 'longterm', name: '远期重要事项', w: 'w6' },
  { id: 'anni', name: '纪念日倒计时', w: 'w4' },
  { id: 'cycle', name: '生理周期预测', w: 'w4' },
  { id: 'word', name: '今日单词', w: 'w4' },
  { id: 'papers', name: '今日论文推送', w: 'w8' },
  { id: 'board', name: '看板概览', w: 'w4' },
  { id: 'course', name: '今日课程', w: 'w6' },
  { id: 'news', name: 'AI 前沿资讯', w: 'w6' },
  { id: 'done', name: '已完成事项', w: 'w12' }
];

function defaults() {
  return {
    version: 1,
    profile: { nickname: '同学', field: '计算机视觉 / 具身智能' },
    reminders: [],
    anniversaries: [],
    cycle: { avgLen: 28, duration: 5, advance: 2, records: [] },
    people: [],
    gifts: [],
    paperRules: {
      groups: [
        { id: uid(), name: '手部姿态估计', on: true, kw: ['hand pose estimation', 'hand mesh', '3D hand reconstruction'] },
        { id: uid(), name: '多模态大模型', on: true, kw: ['multimodal large language model', 'vision language model', 'MLLM'] },
        { id: uid(), name: '具身智能', on: true, kw: ['embodied AI', 'vision language action', 'robot manipulation'] },
        { id: uid(), name: '人体姿态估计', on: true, kw: ['human pose estimation', 'human mesh recovery'] },
        { id: uid(), name: '灵巧手', on: true, kw: ['dexterous hand', 'dexterous grasping', 'dexterous manipulation'] }
      ],
      exclude: ['survey of medical'],
      venues: ['CVPR', 'NeurIPS', 'ICCV', 'ICLR'],
      authors: [],
      sources: { arxiv: true, scholar: true, cvf: true, openreview: true, pwc: true },
      threshold: 30, maxPerDay: 40, categories: ['cs.CV', 'cs.AI', 'cs.RO', 'cs.LG', 'cs.CL']
    },
    paperCache: { at: 0, items: [] },
    paperLib: [],
    newsRead: [],
    words: { deck: 'cet6', perDay: 22, records: {}, todayList: [], lastPush: null, custom: [] },
    board: {
      order: ['personal', 'course', 'research', 'jk'],
      cols: {
        personal: { name: '个人事务', icon: '🏠' }, course: { name: '课程任务', icon: '📚' },
        research: { name: '科研进度', icon: '🔬' }, jk: { name: 'JK', icon: '🎖️' }
      },
      tasks: []
    },
    semester: { name: '2026 秋季学期', startDate: ymd(new Date()), weeks: 20, sections: 12 },
    courses: [],
    jobTracking: [],
    fitness: { logs: [], goal: 105, startWeight: 132, height: 0 },
    dashboard: { order: DEFAULT_DASH.map(d => d.id), hidden: [], widths: {} },
    settings: {
      theme: 'light',
      sync: { enabled: false, type: 'generic', endpoint: '', token: '', auto: true, crypto: { enabled: false, pass: '' } },
      backendProxy: '',
      notify: { desktop: true, inApp: true, sound: false, dailyPaperHour: 8, wordHour: 9 }
    },
    notifications: [],
    fired: {},
    meta: { lastSync: 0, lastLocal: now(), device: navigator.userAgent.slice(0, 40) }
  };
}

function deepMerge(base, over) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return over === undefined ? base : over;
  const out = { ...base };
  for (const k of Object.keys(over || {})) {
    out[k] = (k in base) ? deepMerge(base[k], over[k]) : over[k];
  }
  return out;
}

class Store extends EventTarget {
  constructor() {
    super();
    this.state = this.load();
    this.queue = JSON.parse(localStorage.getItem(QKEY) || '[]');
    this._t = null;
    window.addEventListener('online', () => this.flush());
    window.addEventListener('storage', e => { if (e.key === KEY) { this.state = this.load(); this.emit(); } });
  }
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      return deepMerge(defaults(), JSON.parse(raw));
    } catch { return defaults(); }
  }
  emit(reason = 'change') { this.dispatchEvent(new CustomEvent('change', { detail: reason })); }
  save(reason = 'change') {
    this.state.meta.lastLocal = now();
    localStorage.setItem(KEY, JSON.stringify(this.state));
    this.emit(reason);
    if (this.state.settings.sync.enabled && this.state.settings.sync.auto) {
      clearTimeout(this._t); this._t = setTimeout(() => this.push(), 2500);
    }
  }
  update(fn, reason) { fn(this.state); this.save(reason); }

  // ---- 记录级 CRUD（带 updatedAt，便于多端合并） ----
  add(path, obj) {
    const arr = this.get(path);
    const rec = { id: uid(), createdAt: now(), updatedAt: now(), ...obj };
    arr.push(rec); this.save(); this.enqueue({ op: 'add', path, rec }); return rec;
  }
  patch(path, id, obj) {
    const arr = this.get(path); const i = arr.findIndex(x => x.id === id);
    if (i < 0) return null;
    arr[i] = { ...arr[i], ...obj, updatedAt: now() };
    this.save(); this.enqueue({ op: 'patch', path, rec: arr[i] }); return arr[i];
  }
  remove(path, id) {
    const arr = this.get(path); const i = arr.findIndex(x => x.id === id);
    if (i < 0) return; const [rec] = arr.splice(i, 1);
    this.save(); this.enqueue({ op: 'remove', path, rec: { id, updatedAt: now() } });
  }
  get(path) { return path.split('.').reduce((o, k) => o[k], this.state); }

  // ---- 离线队列 ----
  enqueue(op) {
    if (!this.state.settings.sync.enabled) return;
    this.queue.push({ ...op, ts: now() });
    if (this.queue.length > 500) this.queue = this.queue.slice(-500);
    localStorage.setItem(QKEY, JSON.stringify(this.queue));
  }
  flush() { if (navigator.onLine && this.state.settings.sync.enabled) this.push(); }

  // ---- 云同步（多后端：generic / github / webdav，记录级 last-write-wins 合并） ----
  _countRecords() {
    const st = this.state;
    return (st.reminders.length + st.anniversaries.length + st.board.tasks.length + st.courses.length +
      st.paperLib.length + st.people.length + st.gifts.length + st.jobTracking.length +
      (st.fitness?.logs?.length || 0) + (st.cycle?.records?.length || 0));
  }
  // 从云端拉取并合并到本机；返回本次新增的记录数（用于提示）
  async _doPull() {
    const s = this.state.settings.sync;
    if (!s.enabled || !s.endpoint) throw new Error('未配置同步端点');
    const before = this._countRecords();
    const remote = await fetchRemote(s, this);
    this.state = mergeStates(this.state, remote);
    const after = this._countRecords();
    localStorage.setItem(KEY, JSON.stringify(this.state));
    this.emit('sync');
    return { ok: true, added: Math.max(0, after - before) };
  }
  async pull() {
    try { const r = await this._doPull(); return r; }
    catch (e) { return { ok: false, msg: e.message }; }
  }
  async push() {
    const s = this.state.settings.sync;
    if (!s.enabled) return { ok: false, msg: '请先在上方勾选「启用云端同步」并保存配置' };
    if (!s.endpoint) return { ok: false, msg: '请填写同步端点' };
    if (!navigator.onLine) return { ok: false, msg: '离线，已加入待同步队列' };
    if (this._pushing) return this._pushing;              // 同一时刻只允许一个推送，避免版本冲突
    clearTimeout(this._t);                                // 取消排队中的自动推送
    this._pushing = (async () => {
      try {
        const r1 = await this._doPull().catch(() => ({ added: 0 }));   // ① 先把云端已有数据拉进来
        // 注意：_doPull 会用合并结果替换 this.state，必须重新取配置对象，不能复用旧引用
        await pushRemote(this.state.settings.sync, this);              // ② 把合并后的本机全量上传（含开启同步前的旧数据）
        await this._doPull().catch(() => {});                          // ③ 再拉一次，收下推期间其他端写入的数据
        this.state.meta.lastSync = now();
        this.queue = []; localStorage.setItem(QKEY, '[]');
        localStorage.setItem(KEY, JSON.stringify(this.state));
        this.emit('sync'); return { ok: true, pulled: r1.added || 0 };
      } catch (e) { this.emit('syncerr'); return { ok: false, msg: e.message }; }
      finally { this._pushing = null; }
    })();
    return this._pushing;
  }
  // 连通性自检：返回可读的诊断结论（含云端当前记录条数）
  async diagnose() {
    const s = this.state.settings.sync;
    if (!s.endpoint) return { ok: false, msg: '还没填写同步端点' };
    if (s.type === 'github') {
      const m = /^https:\/\/api\.github\.com\/repos\/[^/]+\/[^/]+\/contents\/.+/.test(s.endpoint);
      if (!m) return { ok: false, msg: '端点格式不对，应形如 https://api.github.com/repos/用户名/仓库名/contents/data/state.json' };
      if (!s.token) return { ok: false, msg: '还没填写访问令牌' };
    }
    try {
      const r = await fetch(s.endpoint, { headers: s.type === 'github' ? { Authorization: 'Bearer ' + s.token, Accept: 'application/vnd.github+json' } : (s.token ? { Authorization: (s.type === 'webdav' ? 'Basic ' : 'Bearer ') + s.token } : {}) });
      if (r.status === 404) return { ok: true, msg: '连接正常：云端数据文件还不存在，首次推送会自动创建' };
      if (!r.ok && s.type === 'github') throw await ghError(r);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const text = await r.text();
      if (s.type === 'github' && text.trim()) {
        try {
          const j = JSON.parse(text);
          const raw = b64decodeUnicode(j.content || '');
          const stj = raw.trim() ? JSON.parse(raw) : null;
          if (stj && stj._enc === 'v1') return { ok: true, msg: '连接正常：云端数据已启用端到端加密（密文存储，无法在此统计具体条数）' };
          if (stj) {
            const arrAt = (path) => { let o = stj; for (const p of path.split('.')) { o = o?.[p]; if (o === undefined) return []; } return Array.isArray(o) ? o : []; };
            const cnt = ['reminders', 'board.tasks', 'courses', 'paperLib', 'anniversaries', 'fitness.logs', 'cycle.records']
              .reduce((a, k) => a + arrAt(k).length, 0);
            const kb = (uploadSize(this.state) / 1024).toFixed(0);
            const warn = kb > 900 ? `　⚠️ 本机待上传 ${kb} KB，已超 GitHub 单文件上限，请先「恢复默认背景」` : `　本机待上传 ${kb} KB`;
            return { ok: kb <= 900, msg: `连接正常，云端目前有 ${cnt} 条记录（同步会与本地合并，不会丢数据）${warn}` };
          }
        } catch { /* 非标准 JSON，忽略统计 */ }
      }
      return { ok: true, msg: '连接正常，云端数据文件可读写' };
    } catch (e) {
      const net = /Failed to fetch|NetworkError|Load failed/i.test(e.message);
      return { ok: false, msg: net ? '网络请求被拦截（可能是断网、代理或浏览器插件拦截了跨域请求）' : e.message };
    }
  }

  // 一键自检：逐项输出可复制的排查报告（令牌自动脱敏）
  async selfCheck() {
    const s = this.state.settings.sync, st = this.state, L = [];
    const mask = t => !t ? '(空)' : `${t.slice(0, 8)}…${t.slice(-4)}（长度 ${t.length}）`;
    L.push('【灵记 · 同步自检】' + new Date().toLocaleString());
    L.push('设备：' + navigator.userAgent.slice(0, 70));
    L.push('网络：' + (navigator.onLine ? '在线' : '离线'));
    L.push('---- 本机配置 ----');
    L.push('同步开关：' + (s.enabled ? '✅ 已启用' : '❌ 未启用') + '　自动推送：' + (s.auto ? '开' : '关'));
    L.push('后端类型：' + s.type);
    L.push('端点：' + (s.endpoint || '❌ 空'));
    L.push('令牌：' + mask(s.token));
    L.push('---- 本机数据 ----');
    L.push(`提醒 ${st.reminders.length}｜看板 ${st.board.tasks.length}｜课程 ${st.courses.length}｜文库 ${st.paperLib.length}｜纪念日 ${st.anniversaries.length}｜健身 ${st.fitness?.logs?.length || 0}｜周期 ${st.cycle?.records?.length || 0}`);
    L.push('合计 ' + this._countRecords() + ' 条　待上传 ' + (uploadSize(st) / 1024).toFixed(0) + ' KB');
    L.push('上次同步：' + (st.meta.lastSync ? new Date(st.meta.lastSync).toLocaleString() : '从未成功同步'));
    L.push('---- 云端探测 ----');
    if (!s.endpoint) { L.push('❌ 未填端点，无法探测'); return L.join('\n'); }
    try {
      const hd = s.type === 'github' ? { Authorization: 'Bearer ' + s.token, Accept: 'application/vnd.github+json' }
        : (s.token ? { Authorization: (s.type === 'webdav' ? 'Basic ' : 'Bearer ') + s.token } : {});
      const r = await fetch(s.endpoint, { headers: hd });
      L.push('HTTP 状态：' + r.status + (r.ok ? ' ✅' : ' ❌'));
      const rl = r.headers.get('x-ratelimit-remaining');
      if (rl !== null) L.push('GitHub 接口剩余额度：' + rl);
      if (r.status === 404) L.push('云端数据文件不存在（首次推送会自动创建；若一直 404 请检查仓库名/路径/令牌授权范围）');
      else if (!r.ok) L.push('说明：' + (s.type === 'github' ? (await ghError(r)).message : 'HTTP ' + r.status));
      else {
        const txt = await r.text();
        if (s.type === 'github') {
          const j = JSON.parse(txt);
          L.push('云端文件体积：' + (j.size / 1024).toFixed(0) + ' KB　sha：' + String(j.sha).slice(0, 8));
          const raw = b64decodeUnicode(j.content || '');
          if (!raw.trim()) L.push('⚠️ 云端文件是空的（曾被空数据覆盖）→ 请在有数据的设备点「🔄 立即双向同步」');
          else {
            const o = JSON.parse(raw);
            if (o && o._enc === 'v1') {
              L.push('☁️ 云端数据已加密：以密文形式存储（端到端加密），本工具不解析具体内容');
            } else {
              const at = p => { let x = o; for (const k of p.split('.')) { x = x?.[k]; if (x === undefined) return []; } return Array.isArray(x) ? x : []; };
              L.push(`云端：提醒 ${at('reminders').length}｜看板 ${at('board.tasks').length}｜课程 ${at('courses').length}｜文库 ${at('paperLib').length}｜纪念日 ${at('anniversaries').length}｜健身 ${at('fitness.logs').length}｜周期 ${at('cycle.records').length}`);
              L.push('云端最后写入设备：' + String(o.meta?.device || '未知').slice(0, 40));
              L.push('云端最后写入时间：' + (o.meta?.lastLocal ? new Date(o.meta.lastLocal).toLocaleString() : '未知'));
            }
          }
        } else L.push('响应长度：' + txt.length + ' 字符');
      }
    } catch (e) {
      L.push('❌ 探测失败：' + e.message);
      if (/Failed to fetch|NetworkError|Load failed/i.test(e.message)) L.push('（多为断网、系统时间不对、浏览器插件或运营商拦截跨域请求）');
    }
    return L.join('\n');
  }

  export() { return JSON.stringify({ ...this.state, _exportedAt: new Date().toISOString() }, null, 2); }
  import(json, mode = 'merge') {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    this.state = mode === 'merge' ? mergeStates(this.state, data) : deepMerge(defaults(), data);
    this.save('import');
  }
  reset() { localStorage.removeItem(KEY); this.state = defaults(); this.save('reset'); }
}

// ============ 多后端云同步实现 ============
function b64encodeUnicode(str) {
  const bytes = new TextEncoder().encode(str); let bin = ''; const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(bin);
}
function b64decodeUnicode(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

// ============ 端到端加密（云端数据加密） ============
// 算法：PBKDF2(SHA-256, 10万次) 派生 AES-GCM 256 位密钥；密文结构 {_enc:'v1', salt, iv, data}（均 base64url）
// 数据库：Web Crypto（浏览器原生，仅 https / localhost 安全上下文可用）。密钥不存储，只存密码于本机。
function _b64u(bytes) { let bin = ''; const chunk = 0x8000; for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk)); return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function _fromB64u(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); const bin = atob(s + '==='.slice((s.length + 3) % 4)); return Uint8Array.from(bin, c => c.charCodeAt(0)); }
async function _deriveKey(pass, salt) {
  const enc = new TextEncoder();
  const mat = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, mat, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function encryptState(state, pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await _deriveKey(pass, salt);
  const pt = new TextEncoder().encode(JSON.stringify(state));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, pt));
  return { _enc: 'v1', salt: _b64u(salt), iv: _b64u(iv), data: _b64u(ct) };
}
export async function decryptState(obj, pass) {
  if (!obj || obj._enc !== 'v1') return obj;            // 明文兼容：无加密标记直接返回
  const key = await _deriveKey(pass, _fromB64u(obj.salt));
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: _fromB64u(obj.iv) }, key, _fromB64u(obj.data));
  return JSON.parse(new TextDecoder().decode(pt));
}
export function isEncrypted(obj) { return !!(obj && obj._enc === 'v1'); }
// 下载后按需解密：密文需用本机密码解；若加密但本机未设密码则报错提示
async function decryptIfNeeded(obj, store) {
  if (!isEncrypted(obj)) return obj;
  const c = store.state.settings.sync.crypto;
  if (!c || !c.enabled || !c.pass) throw new Error('云端数据已加密，但本机未设置加密密码，请在「设置 → 多端云同步」中填写相同密码');
  try { return await decryptState(obj, c.pass); }
  catch { throw new Error('解密失败：加密密码不正确（或云端密文已损坏）'); }
}
// 生成本次要上传的字符串：开启加密则输出密文 wrapper 的 JSON，否则输出明文 state JSON
async function payloadString(store, s) {
  const plain = uploadState(store.state);
  const c = store.state.settings.sync.crypto;
  if (c && c.enabled && c.pass) return JSON.stringify(await encryptState(plain, c.pass));
  return JSON.stringify(plain);
}
async function genGet(s, store) {
  const r = await fetch(s.endpoint, { headers: s.token ? { Authorization: 'Bearer ' + s.token } : {} });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return decryptIfNeeded(await r.json(), store);
}
async function genPut(s, store) {
  const payload = await payloadString(store, s);
  const r = await fetch(s.endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(s.token ? { Authorization: 'Bearer ' + s.token } : {}) }, body: payload });
  if (!r.ok) throw new Error('HTTP ' + r.status);
}
// GitHub 报错统一转成看得懂的中文
async function ghError(r) {
  let detail = '';
  try { const j = await r.json(); detail = j.message || ''; } catch { }
  const hint = {
    401: '令牌无效或已过期（请在 GitHub 重新生成 Fine-grained token）',
    403: '令牌权限不足，需要 Contents 的「Read and write」权限；或触发了接口限流',
    404: '仓库或文件路径不对（也可能是令牌未授权访问该仓库）',
    409: '云端版本已变化，冲突',
    422: '缺少文件版本号（sha）'
  }[r.status] || '请求失败';
  return new Error(`GitHub ${r.status}：${hint}${detail ? '（' + detail + '）' : ''}`);
}
// 取远端文件当前 sha；文件不存在返回 null
async function ghSha(s) {
  const r = await fetch(s.endpoint, { headers: { Authorization: 'Bearer ' + s.token, Accept: 'application/vnd.github+json' } });
  if (r.status === 404) return null;
  if (!r.ok) throw await ghError(r);
  return (await r.json()).sha;
}
async function ghGet(s, store) {
  const r = await fetch(s.endpoint, { headers: { Authorization: 'Bearer ' + s.token, Accept: 'application/vnd.github+json' } });
  if (r.status === 404) return null;               // 数据文件尚不存在
  if (!r.ok) throw await ghError(r);
  const j = await r.json();
  store.state.meta._ghSha = j.sha;
  const text = b64decodeUnicode(j.content || '');
  if (!text.trim()) return null;                   // 空文件视为无远端数据
  let obj;
  try { obj = JSON.parse(text); } catch { throw new Error('云端数据不是合法 JSON，已跳过合并'); }
  return decryptIfNeeded(obj, store);
}
async function ghPut(s, store) {
  let sha = store.state.meta._ghSha || await ghSha(s);
  let r;
  for (let attempt = 0; attempt < 8; attempt++) {
    // 每次都基于最新（可能已合并远端）的本机状态重新构建，确保不丢失其他端写入的数据
    const payload = await payloadString(store, s);
    if (payload.length > 900 * 1024) throw new Error('待上传数据约 ' + (payload.length / 1024).toFixed(0) + ' KB，超过 GitHub 单文件同步上限（约 1MB）。请在设置里「恢复默认背景」或清理文库后重试');
    const body = { message: 'sync 灵记 ' + new Date().toISOString().slice(0, 19), content: b64encodeUnicode(payload) };
    if (sha) body.sha = sha; else delete body.sha;
    r = await fetch(s.endpoint, { method: 'PUT', headers: { Authorization: 'Bearer ' + s.token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.ok) break;
    if (r.status !== 409 && r.status !== 422) break;
    // 版本冲突：云端已被其他端写入。重新拉取远端最新内容并与本地合并，再带新 sha 重试
    await new Promise(res => setTimeout(res, 500 * (attempt + 1)));
    const remote = await ghGet(s, store).catch(() => null);
    if (remote) store.state = mergeStates(store.state, remote);
    sha = store.state.meta._ghSha || await ghSha(s);
  }
  if (!r.ok) throw await ghError(r);
  try { store.state.meta._ghSha = (await r.json()).content.sha; } catch { }
}
async function wdGet(s, store) {
  const r = await fetch(s.endpoint, { headers: { Authorization: 'Basic ' + s.token } });
  if (!r.ok) throw new Error('WebDAV HTTP ' + r.status);
  return decryptIfNeeded(await r.json(), store);
}
async function wdPut(s, store) {
  const payload = await payloadString(store, s);
  const r = await fetch(s.endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + s.token }, body: payload });
  if (!r.ok) throw new Error('WebDAV HTTP ' + r.status);
}
async function fetchRemote(s, store) {
  if (s.type === 'github') return ghGet(s, store);
  if (s.type === 'webdav') return wdGet(s, store);
  return genGet(s, store);
}
async function pushRemote(s, store) {
  if (s.type === 'github') return ghPut(s, store);
  if (s.type === 'webdav') return wdPut(s, store);
  return genPut(s, store);
}
// 构造「上传到云端的净化版数据」：
// 1) 不上传同步端点与令牌（避免凭据进入仓库，也避免覆盖其他设备的配置）
// 2) 不上传背景图 DataURL 与论文抓取缓存（体积大，GitHub Contents API 单文件约 1MB 上限，超限会导致同步一直失败）
export function uploadState(state) {
  const out = JSON.parse(JSON.stringify(state, (k, v) => k === '_ghSha' ? undefined : v));
  out.settings = out.settings || {};
  delete out.settings.bg;
  out.settings.sync = { enabled: true, type: state.settings?.sync?.type || 'github', auto: true, endpoint: '', token: '' };
  out.paperCache = { at: 0, items: [] };
  return out;
}
// 估算本机待上传体积（字节）
export function uploadSize(state) {
  try { return new Blob([JSON.stringify(uploadState(state))]).size; } catch { return JSON.stringify(uploadState(state)).length; }
}

// 记录级 last-write-wins 合并
const LISTS = ['reminders', 'anniversaries', 'people', 'gifts', 'paperLib', 'courses', 'notifications', 'jobTracking'];
export function mergeStates(local, remote) {
  if (!remote || typeof remote !== 'object') return local;
  const out = deepMerge(local, {});
  for (const key of LISTS) {
    const a = local[key] || [], b = remote[key] || [];
    const m = new Map();
    [...a, ...b].forEach(r => {
      if (!r || !r.id) return;
      const prev = m.get(r.id);
      if (!prev || (r.updatedAt || 0) >= (prev.updatedAt || 0)) m.set(r.id, r);
    });
    out[key] = [...m.values()];
  }
  // 看板任务（按 id 合并，记录级 LWW）
  const tm = new Map();
  [...(local.board?.tasks || []), ...(remote.board?.tasks || [])].forEach(t => {
    const p = tm.get(t.id); if (!p || (t.updatedAt || 0) >= (p.updatedAt || 0)) tm.set(t.id, t);
  });
  // 看板分区：cols 做并集（远端优先，本地独有的新分区必须保留）；
  // order 取「远端顺序为准 + 本地多出的分区补末尾」，避免云端 pull 时把本地新建分区「吞噬」掉
  const lboard = local.board || {}, rboard = remote.board || {};
  const cols = {};
  Object.keys(rboard.cols || {}).forEach(k => cols[k] = rboard.cols[k]);
  Object.keys(lboard.cols || {}).forEach(k => { if (!cols[k]) cols[k] = lboard.cols[k]; });
  const order = [];
  const seen = new Set();
  [...(rboard.order || []), ...(lboard.order || []), ...Object.keys(cols)].forEach(k => {
    if (k === undefined || k === null || seen.has(k)) return;
    order.push(k); seen.add(k);
  });
  out.board = { order, cols, tasks: [...tm.values()] };
  // 健身记录 / 生理周期记录（按 id 或 date 去重合并）
  for (const key of ['fitness.logs', 'cycle.records']) {
    const [parent, child] = key.split('.');
    const la = (local[parent]?.[child]) || [], lb = (remote[parent]?.[child]) || [];
    const mm = new Map();
    const keyOf = r => { if (!r) return null; return r.id || r.date || JSON.stringify(r); };
    [...la, ...lb].forEach(r => { const k = keyOf(r); if (!k) return; const p = mm.get(k); if (!p || (r.updatedAt || 0) >= (p.updatedAt || 0)) mm.set(k, r); });
    out[parent] = { ...(out[parent] || {}), [child]: [...mm.values()] };
  }
  // 先记下上面按记录级合并好的结果，避免被下面的整体覆盖冲掉
  const mergedCycleRecords = out.cycle?.records;
  const mergedFitnessLogs = out.fitness?.logs;
  // 标量配置：取更新更晚的一端
  const remoteNewer = (remote.meta?.lastLocal || 0) > (local.meta?.lastLocal || 0);
  ['settings', 'paperRules', 'words', 'semester', 'dashboard', 'cycle', 'profile'].forEach(k => {
    if (remoteNewer && remote[k]) out[k] = deepMerge(local[k], remote[k]);
  });
  // ⚠️ 关键保护：同步端点/令牌、背景图、论文缓存永远以本机为准。
  // 否则云端一份 enabled:false 或 endpoint 为空的旧配置会在 pull 时把本机同步配置洗掉，
  // 造成「保存成功却再也同步不上」的自毁循环。
  out.settings = { ...(out.settings || {}) };
  out.settings.sync = { ...(local.settings?.sync || {}) };
  out.settings.bg = local.settings?.bg || '';
  out.settings.backendProxy = (local.settings?.backendProxy || remote.settings?.backendProxy || '');
  out.paperCache = local.paperCache;
  if (mergedCycleRecords) out.cycle = { ...out.cycle, records: mergedCycleRecords };
  if (mergedFitnessLogs) out.fitness = { ...out.fitness, logs: mergedFitnessLogs };
  out.meta = { ...local.meta, lastSync: now() };
  return out;
}

export const store = new Store();
export const S = () => store.state;
// 轻量后端代理基地址（Cloudflare Workers 等）；为空则用前端直连/快照
export function proxyBase() { return (S().settings.backendProxy || '').replace(/\/$/, ''); }
