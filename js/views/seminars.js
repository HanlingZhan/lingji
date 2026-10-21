// ============ 交大计算机系讲座（GitHub Actions 自动抓取） ============
import { $, esc, fmtAgo } from '../utils.js';
import { emptyBox } from '../ui.js';

let host = null, cache = { seminars: [], at: 0 }, loading = false, scope = 'all';

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

function rerender() {
  if (!host) return;
  const all = cache.seminars;
  const DAY = 86400000;
  const now = Date.now();
  const upcoming = all.filter(s => { const d = toDate(s.date); return d ? d.getTime() >= now - DAY : false; });
  const list = scope === 'upcoming' ? upcoming : all;
  const latest = all.map(s => s.date).filter(Boolean).sort().pop() || '';
  const latestStale = latest && (now - ((toDate(latest) || new Date(0)).getTime())) > 2 * DAY;

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

  ${latestStale ? `<div class="card" style="margin-bottom:14px"><div class="card-body small muted" style="padding:10px 16px">
    ℹ️ 官网最新一条讲座为 <b>${esc(latest)}</b>，此后暂无新发布——数据已是实时抓取的最新状态，不是同步延迟。</div></div>` : ''}

  <div class="card"><div class="card-head"><h3>🎓 上海交通大学 · 计算机系讲座</h3><span class="chip gray">${scope === 'upcoming' ? '即将开始 ' + list.length : '共 ' + list.length + ' 条'}</span></div>
    <div class="card-body" style="max-height:72vh;overflow:auto;display:flex;flex-direction:column;gap:10px">
      ${list.length ? list.map(s => {
        const d = toDate(s.date);
        const up = d ? d.getTime() >= now - DAY : false;
        return `
      <div class="list-item" style="align-items:center;gap:14px;padding:12px 14px;border-radius:16px${up ? ';border:1px solid rgba(61,111,242,.35)' : ''}">
        ${s.poster ? `<a href="${esc(s.link)}" target="_blank" rel="noopener" style="flex:0 0 132px;display:block;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)"><img src="${esc(s.poster)}" loading="lazy" style="width:132px;height:90px;object-fit:cover;display:block"></a>` : ''}
        <div style="flex:1;min-width:0">
          <div class="t" style="font-size:15px;line-height:1.45"><a href="${esc(s.link)}" target="_blank" rel="noopener">${esc(s.title)}</a></div>
          <div class="s" style="margin-top:5px">🗓 <b>${esc(s.time || s.date || '时间待定')}</b>${s.location ? ' &nbsp;📍 ' + esc(s.location) : ''}</div>
          ${s.speaker ? `<div class="s" style="margin-top:2px">🎤 ${esc(s.speaker)}</div>` : ''}
        </div>
        <span class="chip ${up ? 'ok' : 'gray'}" style="flex:0 0 auto">${up ? '即将开始' : '已结束'}</span>
      </div>`;
      }).join('') : (loading
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
