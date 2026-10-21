// ============ 交大计算机系讲座（GitHub Actions 自动抓取） ============
import { $, esc, fmtAgo } from '../utils.js';
import { emptyBox } from '../ui.js';

let host = null, cache = { seminars: [], at: 0 }, loading = false, scope = 'upcoming';

export function render(el) { host = el; rerender(); if (!cache.at) load(); }

// 同源静态文件 data/seminars.json，由 GitHub Actions 定时写好，秒开
async function load() {
  loading = true; rerender();
  try {
    const u = new URL('data/seminars.json', document.baseURI);
    u.searchParams.set('t', Math.floor(Date.now() / 3e5));
    const r = await fetch(u.href, { cache: 'no-cache' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (!j || !Array.isArray(j.seminars)) throw new Error('数据格式异常');
    cache = { seminars: j.seminars || [], at: j.generatedAt || Date.now(), source: j.source || '' };
  } catch (e) {
    if (!cache.seminars.length) cache = { seminars: [], at: Date.now(), source: '', err: e.message };
  }
  loading = false; rerender();
}

function isUpcoming(s) {
  const d = new Date((s.date || '').replace(/\./g, '-'));
  if (isNaN(d)) return true;
  return d.getTime() >= Date.now() - 86400000; // 过期不到 1 天仍算“即将/进行中”
}

function rerender() {
  if (!host) return;
  const all = cache.seminars;
  const list = scope === 'upcoming' ? all.filter(isUpcoming) : all;
  host.innerHTML = `
  <div class="row" style="margin-bottom:14px">
    <div class="seg" id="scopeSeg">
      ${[['upcoming', '即将开始'], ['all', '全部']].map(([v, t]) => `<button data-s="${v}" class="${scope === v ? 'active' : ''}">${t}</button>`).join('')}
    </div>
    <span class="chip ok" title="由 GitHub 服务器定时抓取，不受本机网络限制">☁️ 云端自动抓取</span>
    <span class="small muted">${cache.at ? '更新于 ' + fmtAgo(cache.at) : ''}</span>
    <div class="spacer"></div>
    <button class="primary-btn" id="reload" ${loading ? 'disabled' : ''}>${loading ? '加载中…' : '⟳ 刷新'}</button>
  </div>

  <div class="card"><div class="card-head"><h3>🎓 上海交通大学 · 计算机系讲座</h3><span class="chip gray">${list.length}</span></div>
    <div class="card-body" style="max-height:72vh;overflow:auto">
      ${list.length ? list.map(s => `
      <div class="list-item" style="align-items:flex-start">
        ${s.poster ? `<a href="${esc(s.link)}" target="_blank" rel="noopener"><img src="${esc(s.poster)}" loading="lazy" style="width:96px;height:66px;object-fit:cover;border-radius:10px;margin-right:12px;flex:0 0 auto"></a>` : ''}
        <div style="flex:1;min-width:0">
          <div class="t"><a href="${esc(s.link)}" target="_blank" rel="noopener">${esc(s.title)}</a></div>
          <div class="s">🗓 ${esc(s.time || s.date)}${s.location ? ' · 📍 ' + esc(s.location) : ''}</div>
          ${s.speaker ? `<div class="s">🎤 ${esc(s.speaker)}</div>` : ''}
        </div>
      </div>`).join('') : (loading ? '<div class="empty">加载中…</div>' : emptyBox(cache.err ? '加载失败：' + esc(cache.err) : '暂时没有讲座数据'))}
    </div>
  </div>
  <p class="small muted" style="margin-top:10px">数据来源：<a href="https://cs.sjtu.edu.cn/xshd.html" target="_blank" rel="noopener">上海交通大学计算机系官网 · 学术活动</a>，由 GitHub Actions 每约 6 小时自动更新。</p>`;

  const reload = $('#reload'); if (reload) reload.onclick = load;
  const seg = $('#scopeSeg'); if (seg) seg.onclick = e => { const b = e.target.closest('[data-s]'); if (b) { scope = b.dataset.s; rerender(); } };
}

export function ensureLoaded() { if (!cache.at && !loading) load(); }
