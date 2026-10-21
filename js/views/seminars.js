// ============ 交大计算机系讲座（GitHub Actions 自动抓取） ============
import { $, esc, fmtAgo } from '../utils.js';
import { emptyBox } from '../ui.js';

let host = null, cache = { seminars: [], at: 0 }, loading = false, scope = 'all', styled = false;

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

function toDate(s) {
  const d = new Date(String(s || '').replace(/\./g, '-'));
  return isNaN(d) ? null : d;
}

function card(s, now) {
  const d = toDate(s.date);
  const up = d ? d.getTime() >= now - 86400000 : false;
  const poster = s.poster
    ? `<img src="${esc(s.poster)}" loading="lazy" alt="${esc(s.title)}">`
    : `<div class="sm-noposter">🗓️</div>`;
  return `
  <a class="sm-card" href="${esc(s.link)}" target="_blank" rel="noopener" ${up ? 'data-up' : ''}>
    <div class="sm-poster">${poster}<span class="sm-badge ${up ? 'up' : 'done'}">${up ? '即将开始' : '已结束'}</span></div>
    <div class="sm-body">
      <div class="sm-title">${esc(s.title)}</div>
      <div class="sm-meta">🗓️ <b>${esc(s.time || s.date || '时间待定')}</b></div>
      ${s.location ? `<div class="sm-meta">📍 ${esc(s.location)}</div>` : ''}
      ${s.speaker ? `<div class="sm-meta">🎤 ${esc(s.speaker)}</div>` : ''}
    </div>
  </a>`;
}

function rerender() {
  if (!host) return;
  // 样式必须挂在 document.head（而非视图容器内）——容器会被 innerHTML 重建，挂里面会被一并清掉导致样式全部失效
  if (!styled) {
    if (!document.getElementById('sm-style')) {
      const st = document.createElement('style');
      st.id = 'sm-style';
      st.textContent = `
.sm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
.sm-card{display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg);overflow:hidden;box-shadow:var(--sh);text-decoration:none;color:inherit;transition:transform .28s var(--out),box-shadow .28s var(--out)}
.sm-card:hover{transform:translateY(-5px);box-shadow:var(--sh-lg)}
.sm-card[data-up]{border-color:rgba(255,138,61,.55);box-shadow:0 2px 6px rgba(20,40,90,.05),0 14px 34px rgba(255,138,61,.16)}
.sm-poster{position:relative;aspect-ratio:16/9;background:linear-gradient(135deg,var(--primary-100),var(--accent-050));overflow:hidden}
.sm-poster img{width:100%;height:100%;object-fit:cover;display:block}
.sm-noposter{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:40px;opacity:.5}
.sm-badge{position:absolute;top:10px;right:10px;padding:4px 11px;border-radius:999px;font-size:11.5px;font-weight:600;letter-spacing:.3px;backdrop-filter:blur(6px);box-shadow:0 2px 8px rgba(0,0,0,.12)}
.sm-badge.up{background:var(--accent);color:#fff}
.sm-badge.done{background:rgba(31,36,51,.5);color:#fff}
.sm-body{padding:14px 16px 16px;display:flex;flex-direction:column;gap:6px}
.sm-title{font-weight:600;font-size:15px;line-height:1.45;color:var(--ink);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.sm-meta{font-size:12.5px;color:var(--ink-2);display:flex;gap:6px;align-items:flex-start;line-height:1.5}
.sm-meta b{color:var(--ink-1);font-weight:600}
@media (max-width:640px){.sm-grid{grid-template-columns:1fr 1fr;gap:10px}.sm-title{font-size:13.5px}}
`;
      document.head.appendChild(st);
    }
    styled = true;
  }
  const all = cache.seminars;
  const now = Date.now();
  const upcoming = all.filter(s => { const d = toDate(s.date); return d ? d.getTime() >= now - 86400000 : false; });
  const list = scope === 'upcoming' ? upcoming : all;
  const latest = all.map(s => s.date).filter(Boolean).sort().pop() || '';
  const latestStale = latest && (now - ((toDate(latest) || new Date(0)).getTime())) > 2 * 86400000;

  host.innerHTML = `
  <div class="row" style="margin-bottom:14px">
    <div class="seg" id="scopeSeg">
      ${[['all', `全部 ${all.length}`], ['upcoming', `即将开始 ${upcoming.length}`]].map(([v, t]) => `<button data-s="${v}" class="${scope === v ? 'active' : ''}">${t}</button>`).join('')}
    </div>
    <span class="chip ok" title="由 GitHub 服务器定时抓取，不受本机网络限制">☁️ 云端自动抓取</span>
    <span class="small muted">${cache.at ? '更新于 ' + fmtAgo(cache.at) : ''}</span>
    <div class="spacer"></div>
    <button class="primary-btn" id="reload" ${loading ? 'disabled' : ''}>${loading ? '加载中…' : '⟳ 刷新'}</button>
  </div>

  ${latestStale ? `<div class="card" style="margin-bottom:14px;border-color:var(--accent-100);background:var(--accent-050)"><div class="card-body small" style="padding:11px 16px;color:var(--ink-1)">
    ℹ️ 官网最新一条讲座为 <b>${esc(latest)}</b>，此后暂无新发布——数据已是实时抓取的最新状态，并非同步延迟。</div></div>` : ''}

  <div class="card"><div class="card-head"><h3>🎓 上海交通大学 · 计算机系讲座</h3><span class="chip gray">${scope === 'upcoming' ? '即将开始 ' + list.length : '共 ' + list.length + ' 条'}</span></div>
    <div class="card-body" style="max-height:74vh;overflow:auto">
      ${list.length ? `<div class="sm-grid">${list.map(s => card(s, now)).join('')}</div>` : (loading
        ? '<div class="empty">加载中…</div>'
        : scope === 'upcoming'
          ? `<div class="empty">近期没有新讲座（官网最新：${esc(latest || '—')}）<br><button class="btn sm" id="seeAll" style="margin-top:10px">查看全部 ${all.length} 条</button></div>`
          : emptyBox(cache.err ? '加载失败：' + esc(cache.err) : '暂时没有讲座数据'))}
    </div>
  </div>
  <p class="small muted" style="margin-top:10px">数据来源：<a href="https://cs.sjtu.edu.cn/xshd.html" target="_blank" rel="noopener">上海交通大学计算机系官网 · 学术活动</a>，由 GitHub Actions 每约 6 小时自动更新。</p>`;

  const reload = $('#reload'); if (reload) reload.onclick = load;
  const seg = $('#scopeSeg'); if (seg) seg.onclick = e => { const b = e.target.closest('[data-s]'); if (b) { scope = b.dataset.s; rerender(); } };
  const seeAll = $('#seeAll'); if (seeAll) seeAll.onclick = () => { scope = 'all'; rerender(); };
}

export function ensureLoaded() { if (!cache.at && !loading) load(); }
