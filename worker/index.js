// 灵记 · 轻量后端代理（Cloudflare Workers）
// 作用：聚合可实时抓取的公开源并附加 CORS 头，供静态 GitHub Pages 站点跨域调用。
// 覆盖：arXiv / Hacker News / OpenReview / Papers with Code / Google 翻译 / 文章全文逐段翻译。
// 注：小红书、微信公众号、ScholarInbox 需登录或强反爬，无法在此实时抓取，改由前端"策展快照+检索直达"处理。
//
// ★ 系统推送（手机 / iPad）：新增 /push/* 路由 + 每分钟 cron。
//   - 前端把「提醒事项下一次触发时间窗」快照同步过来（POST /push/sync）
//   - cron 每分钟检查，到期就通过 Web Push（RFC 8291 VAPID + RFC 8188 aes128gcm）推到设备
//   - 需要：KV 命名空间（binding: LINGJI_PUSH）、Secret（VAPID_PRIVATE_KEY，JWK JSON）
//     vars（VAPID_PUBLIC_KEY、VAPID_SUBJECT、SITE_URL）、Cron Triggers

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': '*'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' }
  });
}
function textOut(t, status = 200) {
  return new Response(t, {
    status,
    headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' }
  });
}
function preflight() { return new Response(null, { status: 204, headers: CORS }); }

const enc = encodeURIComponent;

// ---------- arXiv（Workers 无 DOMParser，用正则解析 Atom） ----------
function parseArxiv(xml) {
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m => m[1]);
  return entries.map(e => {
    const g = (t) => (e.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)) || [,''])[1].trim();
    const id = g('id');
    const authors = [...e.matchAll(/<name>([\s\S]*?)<\/name>/g)].map(m => m[1].trim());
    return {
      id: 'arxiv:' + (id.split('/abs/')[1] || id),
      source: 'arXiv',
      title: g('title').replace(/\s+/g, ' '),
      authors,
      abs: g('summary').replace(/\s+/g, ' '),
      url: id,
      pdf: id.replace('/abs/', '/pdf/'),
      published: (g('published') || '').slice(0, 10),
      primary: (e.match(/<primary_category[^>]*term="([^"]+)"/) || [,''])[1],
      comment: (e.match(/<arxiv:comment[^>]*>([\s\S]*?)<\/arxiv:comment>/) || [,''])[1].trim()
    };
  });
}

// ---------- 文章全文逐段翻译 ----------
async function fetchArticle(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LingjiBot/1.0)' } });
  if (!r.ok) throw new Error('fetch ' + r.status);
  const html = await r.text();
  // 去掉 script/style
  const cleaned = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  // 提取段落文本
  const paras = [...cleaned.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(m => m[1].replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim())
    .filter(p => p.length > 30);
  // 兜底：按换行切
  const text = paras.length ? paras : [cleaned.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()];
  return text.slice(0, 40);
}

async function translate(text, tl = 'zh-CN') {
  const q = (text || '').slice(0, 4000);
  if (!q) return '';
  const u = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${tl}&dt=t&q=${enc(q)}`;
  const r = await fetch(u);
  if (!r.ok) throw new Error('tr ' + r.status);
  const j = await r.json();
  return (j[0] || []).map(x => x[0]).join('');
}

async function handleTranslate(text, tl) {
  try { return textOut(await translate(text, tl)); }
  catch { return textOut('（翻译失败）', 502); }
}

// ==================== 系统推送：Web Push 加密（RFC 8291 / RFC 8188） ====================
const te = s => new TextEncoder().encode(s);
const td = b => new TextDecoder().decode(b);

function concat(...parts) {
  let len = 0; for (const p of parts) len += p.length;
  const out = new Uint8Array(len); let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}
function be32(n) { const o = new Uint8Array(4); o[0] = (n >>> 24) & 255; o[1] = (n >>> 16) & 255; o[2] = (n >>> 8) & 255; o[3] = n & 255; return o; }
function b64u(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64ud(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function hkdf(salt, ikm, info, lenBits) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, lenBits));
}
// ECDSA 签名 → JWT 需要的 raw R||S（64 字节）。
// 兼容两种实现：Node/部分运行时直接返回 raw（64B）；按 WebCrypto 规范的返回 DER（70-72B）。
function sigToRaw(sig) {
  if (sig.length === 64) return sig; // 已是 raw R||S
  const der = sig;
  const out = new Uint8Array(64);
  let pos = 2;                       // skip SEQUENCE tag+len（P-256 签名长度必为单字节）
  pos += 1;                          // INTEGER tag
  let rLen = der[pos]; pos += 1;
  let rStart = pos; pos += rLen;
  pos += 1;                          // INTEGER tag
  const sLen = der[pos]; pos += 1;
  const sStart = pos;
  const norm = (st, len) => { while (len > 32 && der[st] === 0) { st++; len--; } return { st, len }; };
  const r = norm(rStart, rLen), s = norm(sStart, sLen);
  out.set(der.subarray(r.st, r.st + r.len), 32 - r.len);
  out.set(der.subarray(s.st, s.st + s.len), 64 - s.len);
  return out;
}
async function makeVapidJwt(aud, env) {
  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = { aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT || 'mailto:admin@lingji.local' };
  const input = b64u(te(JSON.stringify(header))) + '.' + b64u(te(JSON.stringify(payload)));
  const priv = JSON.parse(env.VAPID_PRIVATE_KEY);
  const key = await crypto.subtle.importKey('jwk', priv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const der = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te(input)));
  return input + '.' + b64u(sigToRaw(der));
}
// 发送一条 Web Push。sub = PushSubscriptionJSON；失败时 throw {status}
async function sendPush(sub, payloadObj, env) {
  if (!sub || !sub.endpoint || !sub.keys) throw new Error('bad subscription');
  const userPub = b64ud(sub.keys.p256dh);
  const auth = b64ud(sub.keys.auth);
  const epk = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const localPub = new Uint8Array(await crypto.subtle.exportKey('raw', epk.publicKey));
  const ikm = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'ECDH', public: await crypto.subtle.importKey('raw', userPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []) },
    epk.privateKey, 256));
  const info = concat(te('WebPush: info'), new Uint8Array([0]), userPub, localPub);
  const prk = await hkdf(auth, ikm, info, 256);
  const cek = await hkdf(new Uint8Array(0), prk, concat(te('Content-Encoding: aes128gcm'), new Uint8Array([0])), 128);
  const nonce = await hkdf(new Uint8Array(0), prk, concat(te('Content-Encoding: nonce'), new Uint8Array([0])), 96);
  // 明文记录：JSON + 分隔符 + 0x00 padding（RFC 8188：分隔符紧跟内容，padding 在分隔符之后）
  const pt = te(JSON.stringify(payloadObj));
  const padLen = pt.length % 16 ? 16 - (pt.length % 16) : 0;
  const record = new Uint8Array(pt.length + 1 + padLen);
  record.set(pt, 0);
  record[pt.length] = padLen > 0 ? 2 : 1;
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: new Uint8Array(0), tagLength: 128 }, aesKey, record));
  const header = concat(crypto.getRandomValues(new Uint8Array(16)), be32(4096), new Uint8Array([65]), localPub);
  const body = concat(be32(ct.length), ct);
  const jwt = await makeVapidJwt(new URL(sub.endpoint).origin, env);
  const resp = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'TTL': '86400',
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'Authorization': `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`
    },
    body: new Uint8Array(concat(header, body))
  });
  if (!resp.ok) { const e = new Error('push endpoint ' + resp.status); e.status = resp.status; throw e; }
}

// ==================== KV 存取 ====================
const SUB_PREFIX = 'push:sub:';
const STATE_PREFIX = 'push:state:';
const INDEX_KEY = 'push:index';

async function getIndex(env) {
  try { return await env.LINGJI_PUSH.get(INDEX_KEY, 'json') || []; } catch { return []; }
}
async function addToIndex(env, install) {
  const list = await getIndex(env);
  if (!list.includes(install)) { list.push(install); await env.LINGJI_PUSH.put(INDEX_KEY, JSON.stringify(list)); }
}
async function cleanupInstall(env, install) {
  await Promise.allSettled([
    env.LINGJI_PUSH.delete(SUB_PREFIX + install),
    env.LINGJI_PUSH.delete(STATE_PREFIX + install)
  ]);
  const list = (await getIndex(env)).filter(x => x !== install);
  await env.LINGJI_PUSH.put(INDEX_KEY, JSON.stringify(list));
}

function originOk(req) {
  const origin = req.headers.get('Origin') || '';
  if (!origin) return true; // 无 Origin 的请求（本地调试）放行
  return /hanlingzhan\.github\.io$/.test(origin) ||
    /localhost(:\d+)?$/.test(origin) ||
    /127\.0\.0\.1(:\d+)?$/.test(origin) ||
    /workers\.dev$/.test(origin);
}

function sanitizeReminders(arr) {
  if (!Array.isArray(arr)) return [];
  const now = Date.now();
  return arr.filter(r => r && typeof r.id === 'string' && typeof r.dueAt === 'number' && typeof r.windowEnd === 'number')
    .slice(0, 200)
    .map(r => ({
      id: String(r.id).slice(0, 64),
      dueAt: Math.min(Math.max(r.dueAt, now - 3600000), now + 2 * 366 * 86400000),
      windowEnd: Math.min(Math.max(r.windowEnd, now), now + 2 * 366 * 86400000 + 43200000),
      title: String(r.title || '灵记提醒').slice(0, 80),
      body: String(r.body || '').slice(0, 200)
    }));
}

// ==================== push 路由 ====================
async function handlePushRoutes(req, url, env) {
  const p = url.pathname;
  const method = req.method;
  if (!env.LINGJI_PUSH) return json({ error: 'Worker 未绑定 KV 命名空间 LINGJI_PUSH，推送功能不可用' }, 500);

  // 测试推送（立即发一条到设备）
  if (p === '/push/test' && method === 'POST') {
    const b = await req.json().catch(() => ({}));
    const sub = await env.LINGJI_PUSH.get(SUB_PREFIX + String(b.install || ''), 'json');
    if (!sub) return json({ error: '该设备未订阅推送' }, 404);
    try {
      await sendPush(sub, {
        title: '📲 灵记 · 测试推送',
        body: '系统推送已就绪：提醒事项到期时会像这样弹出（锁屏也能看到）',
        tag: 'test',
        url: (env.SITE_URL || 'https://hanlingzhan.github.io/lingji') + '/#/calendar'
      }, env);
      return json({ ok: true });
    } catch (e) {
      if (e && (e.status === 410 || e.status === 404)) await cleanupInstall(env, String(b.install || ''));
      return json({ error: '发送失败：' + (e && e.message || e) }, 502);
    }
  }

  if (p === '/push/subscribe' && method === 'POST') {
    const b = await req.json().catch(() => ({}));
    const install = String(b.install || '').slice(0, 64);
    if (!install || !b.sub || !b.sub.endpoint || !b.sub.keys) return json({ error: '参数不完整' }, 400);
    await env.LINGJI_PUSH.put(SUB_PREFIX + install, JSON.stringify({ sub: b.sub, device: String(b.device || '').slice(0, 40), createdAt: Date.now() }));
    await addToIndex(env, install);
    return json({ ok: true });
  }

  if (p === '/push/sync' && method === 'POST') {
    const b = await req.json().catch(() => ({}));
    const install = String(b.install || '').slice(0, 64);
    if (!install) return json({ error: '缺少 install' }, 400);
    const reminders = sanitizeReminders(b.reminders);
    const prev = await env.LINGJI_PUSH.get(STATE_PREFIX + install, 'json') || {};
    prev.sent = prev.sent || {};
    const prevJson = JSON.stringify(prev.reminders || null);
    const nextJson = JSON.stringify(reminders);
    if (prevJson === nextJson && Date.now() - (prev.lastSeen || 0) < 30 * 60000) {
      return json({ ok: true, cached: true }); // 无变化且刚同步过：不写 KV（省免费额度）
    }
    await env.LINGJI_PUSH.put(STATE_PREFIX + install, JSON.stringify({
      reminders, sent: prev.sent, device: String(b.device || '').slice(0, 40), lastSeen: Date.now()
    }));
    return json({ ok: true, reminders: reminders.length });
  }

  if (p === '/push/unsubscribe' && method === 'POST') {
    const b = await req.json().catch(() => ({}));
    await cleanupInstall(env, String(b.install || '').slice(0, 64));
    return json({ ok: true });
  }

  if (p === '/push/status') {
    const install = String(url.searchParams.get('install') || '').slice(0, 64);
    const sub = await env.LINGJI_PUSH.get(SUB_PREFIX + install, 'json');
    const state = await env.LINGJI_PUSH.get(STATE_PREFIX + install, 'json') || {};
    return json({
      install,
      subscribed: !!sub,
      device: state.device || (sub && sub.device) || '',
      reminders: (state.reminders || []).length,
      sent: Object.keys(state.sent || {}).length,
      lastSeen: state.lastSeen || 0
    });
  }
  return null;
}

// ==================== cron：每分钟检查提醒并推送 ====================
async function pushCron(env) {
  if (!env.LINGJI_PUSH) return;
  const list = await getIndex(env);
  const now = Date.now();
  let sent = 0, errors = 0, cleaned = 0;
  await Promise.allSettled(list.map(async install => {
    const sub = await env.LINGJI_PUSH.get(SUB_PREFIX + install, 'json');
    const state = await env.LINGJI_PUSH.get(STATE_PREFIX + install, 'json');
    if (!sub || !state || !Array.isArray(state.reminders) || !state.reminders.length) return;
    state.sent = state.sent || {};
    let changed = false;
    for (const r of state.reminders) {
      const key = r.id + ':' + r.dueAt;
      if (state.sent[key]) continue;
      if (now < r.dueAt) continue;
      if (now > r.windowEnd) { state.sent[key] = now; changed = true; continue; } // 窗口已过，不再补发
      try {
        await sendPush(sub, {
          title: r.title,
          body: r.body,
          tag: r.id,
          url: (env.SITE_URL || 'https://hanlingzhan.github.io/lingji') + '/#/calendar'
        }, env);
        state.sent[key] = now; changed = true; sent++;
      } catch (e) {
        if (e && (e.status === 410 || e.status === 404)) { await cleanupInstall(env, install); cleaned++; return; }
        errors++; // 网络类错误：下一分钟重试
      }
    }
    // 清理：30 天前的发送记录；已过窗口 24 小时以上的提醒（客户端会重发新快照）
    const cut = now - 30 * 86400000;
    for (const k of Object.keys(state.sent)) if (state.sent[k] < cut) { delete state.sent[k]; changed = true; }
    const kept = state.reminders.filter(r => r.windowEnd > now - 86400000);
    if (kept.length !== state.reminders.length) { state.reminders = kept; changed = true; }
    if (changed) await env.LINGJI_PUSH.put(STATE_PREFIX + install, JSON.stringify(state));
  }));
  console.log(`[push-cron] installs=${list.length} sent=${sent} errors=${errors} cleaned=${cleaned}`);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const p = url.pathname;
    if (req.method === 'OPTIONS') return preflight();
    try {
      // ---- 系统推送路由 ----
      if (p.startsWith('/push/')) {
        if (!originOk(req)) return json({ error: 'Origin 不允许' }, 403);
        const r = await handlePushRoutes(req, url, env);
        if (r) return r;
        return json({ error: 'unknown push route', hint: '/push/subscribe /push/sync /push/unsubscribe /push/test /push/status' }, 404);
      }
      // 翻译任意文本：GET /tr?text=...&tl=zh-CN
      if (p === '/tr') {
        const text = url.searchParams.get('text') || '';
        return await handleTranslate(text, url.searchParams.get('tl') || 'zh-CN');
      }
      // 文章全文逐段翻译：GET /article?url=...&tl=zh-CN -> [{orig,zh}]
      if (p === '/article') {
        const target = url.searchParams.get('url');
        if (!target) return json({ error: 'missing url' }, 400);
        const paras = await fetchArticle(target);
        const out = [];
        for (const para of paras) out.push({ orig: para, zh: await translate(para).catch(() => '') });
        return json(out);
      }
      // arXiv
      if (p === '/arxiv') {
        const q = url.searchParams.get('q') || 'cs.CV';
        const max = Math.min(Number(url.searchParams.get('max')) || 40, 100);
        const u = `https://export.arxiv.org/api/query?search_query=${enc(q)}&start=0&max_results=${max}&sortBy=submittedDate&sortOrder=descending`;
        const xml = await (await fetch(u)).text();
        return json(parseArxiv(xml));
      }
      // Hacker News
      if (p === '/hn') {
        const query = url.searchParams.get('query') || 'AI OR LLM';
        const u = `https://hn.algolia.com/api/v1/search?query=${enc(query)}&tags=story&hitsPerPage=25&numericFilters=points%3E30`;
        const j = await (await fetch(u)).json();
        return json(j.hits || []);
      }
      // OpenReview
      if (p === '/openreview') {
        const term = url.searchParams.get('term') || 'multimodal';
        const u = `https://api2.openreview.net/notes/search?term=${enc(term)}&limit=25&type=terms`;
        const j = await (await fetch(u)).json();
        const out = (j.notes || []).map(n => {
          const c = n.content || {};
          const val = x => (x && typeof x === 'object' ? x.value : x) || '';
          return { id: 'or:' + n.id, source: 'OpenReview', title: String(val(c.title)).replace(/\s+/g, ' '), authors: [].concat(val(c.authors) || []), abs: String(val(c.abstract) || ''), url: 'https://openreview.net/forum?id=' + n.id, pdf: 'https://openreview.net/pdf?id=' + n.id, published: n.cdate ? new Date(n.cdate).toISOString().slice(0, 10) : '', venue: String(val(c.venue) || '') };
        });
        return json(out);
      }
      // Papers with Code
      if (p === '/pwc') {
        const q = url.searchParams.get('q') || 'diffusion';
        const u = `https://paperswithcode.com/api/v1/papers/?q=${enc(q)}&items_per_page=20`;
        const j = await (await fetch(u)).json();
        const out = (j.results || []).map(pp => ({ id: 'pwc:' + pp.id, source: 'Papers with Code', title: pp.title, authors: pp.authors || [], abs: pp.abstract || '', url: pp.url_abs || pp.url_pdf, pdf: pp.url_pdf, published: pp.published || '', code: true }));
        return json(out);
      }
      return json({ error: 'unknown route', hint: '/arxiv /hn /openreview /pwc /tr /article /push/*' }, 404);
    } catch (e) {
      return json({ error: String(e.message || e) }, 502);
    }
  },
  async scheduled(event, env) {
    try { await pushCron(env); } catch (e) { console.error('[push-cron] error', e.message || e); }
  }
};
