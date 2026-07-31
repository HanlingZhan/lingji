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
      sync: { enabled: false, type: 'generic', endpoint: '', token: '', auto: true },
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
  async pull() {
    const s = this.state.settings.sync;
    if (!s.enabled || !s.endpoint) throw new Error('未配置同步端点');
    const remote = await fetchRemote(s, this);
    this.state = mergeStates(this.state, remote);
    localStorage.setItem(KEY, JSON.stringify(this.state));
    this.emit('sync'); return { ok: true };
  }
  async push() {
    const s = this.state.settings.sync;
    if (!s.enabled) return { ok: false, msg: '请先在上方勾选「启用云端同步」并填写端点/令牌后点保存' };
    if (!s.endpoint) return { ok: false, msg: '请填写同步端点' };
    if (!navigator.onLine) return { ok: false, msg: '离线，已加入待同步队列' };
    if (this._pushing) return this._pushing;              // 同一时刻只允许一个推送，避免版本冲突
    clearTimeout(this._t);                                // 取消排队中的自动推送
    this._pushing = (async () => {
      try {
        try { await this.pull(); } catch (e) { /* 远端可能为空 */ }
        await pushRemote(s, this);
        this.state.meta.lastSync = now();
        this.queue = []; localStorage.setItem(QKEY, '[]');
        localStorage.setItem(KEY, JSON.stringify(this.state));
        this.emit('sync'); return { ok: true };
      } catch (e) { this.emit('syncerr'); return { ok: false, msg: e.message }; }
      finally { this._pushing = null; }
    })();
    return this._pushing;
  }
  // 连通性自检：返回可读的诊断结论
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
      return { ok: true, msg: '连接正常，云端数据文件可读写' };
    } catch (e) {
      const net = /Failed to fetch|NetworkError|Load failed/i.test(e.message);
      return { ok: false, msg: net ? '网络请求被拦截（可能是断网、代理或浏览器插件拦截了跨域请求）' : e.message };
    }
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
async function genGet(s) {
  const r = await fetch(s.endpoint, { headers: s.token ? { Authorization: 'Bearer ' + s.token } : {} });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
async function genPut(s, state) {
  const r = await fetch(s.endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(s.token ? { Authorization: 'Bearer ' + s.token } : {}) }, body: JSON.stringify(state) });
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
  try { return JSON.parse(text); } catch { throw new Error('云端数据不是合法 JSON，已跳过合并'); }
}
async function ghPut(s, state, store) {
  const payload = JSON.stringify(state, (k, v) => k === '_ghSha' ? undefined : v);
  const body = { message: 'sync 灵记 ' + new Date().toISOString().slice(0, 19), content: b64encodeUnicode(payload) };
  // sha 优先用上次写入/读取返回的值：GitHub 写入后短时间内 GET 可能仍返回旧 sha
  let sha = store.state.meta._ghSha || await ghSha(s);
  let r;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (sha) body.sha = sha; else delete body.sha;
    r = await fetch(s.endpoint, { method: 'PUT', headers: { Authorization: 'Bearer ' + s.token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.ok) break;
    if (r.status !== 409 && r.status !== 422) break;
    // 版本冲突：等待远端一致性收敛后重取 sha 再试
    await new Promise(res => setTimeout(res, 400 * (attempt + 1)));
    sha = await ghSha(s);
  }
  if (!r.ok) throw await ghError(r);
  try { store.state.meta._ghSha = (await r.json()).content.sha; } catch { }
}
async function wdGet(s) {
  const r = await fetch(s.endpoint, { headers: { Authorization: 'Basic ' + s.token } });
  if (!r.ok) throw new Error('WebDAV HTTP ' + r.status);
  return r.json();
}
async function wdPut(s, state) {
  const r = await fetch(s.endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + s.token }, body: JSON.stringify(state) });
  if (!r.ok) throw new Error('WebDAV HTTP ' + r.status);
}
async function fetchRemote(s, store) {
  if (s.type === 'github') return ghGet(s, store);
  if (s.type === 'webdav') return wdGet(s);
  return genGet(s);
}
async function pushRemote(s, store) {
  if (s.type === 'github') return ghPut(s, store.state, store);
  if (s.type === 'webdav') return wdPut(s, store.state);
  return genPut(s, store.state);
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
  // 看板任务
  const tm = new Map();
  [...(local.board?.tasks || []), ...(remote.board?.tasks || [])].forEach(t => {
    const p = tm.get(t.id); if (!p || (t.updatedAt || 0) >= (p.updatedAt || 0)) tm.set(t.id, t);
  });
  out.board = { ...deepMerge(local.board, remote.board || {}), tasks: [...tm.values()] };
  // 标量配置：取更新更晚的一端
  const remoteNewer = (remote.meta?.lastLocal || 0) > (local.meta?.lastLocal || 0);
  ['settings', 'paperRules', 'words', 'semester', 'dashboard', 'cycle', 'profile'].forEach(k => {
    if (remoteNewer && remote[k]) out[k] = deepMerge(local[k], remote[k]);
  });
  out.meta = { ...local.meta, lastSync: now() };
  return out;
}

export const store = new Store();
export const S = () => store.state;
