// ============ AI 领域科技前沿资讯 ============
import { store, S } from '../store.js';
import { $, esc, ymd, addDays, diffDays, fmtAgo, fmtRel, startOfDay, uid } from '../utils.js';
import { toast, emptyBox, modal, confirmDlg } from '../ui.js';
import { VENUES, BLOG_LINKS } from '../data/venues.js';
import { quickCreate } from './calendar.js';
import { translate } from './papers.js';

let host = null, cache = { hn: [], gh: [], at: 0 }, loading = false, area = 'all';

export function render(el) { host = el; rerender(); if (!cache.at) load(); }

export function venueDeadlines() {
  const N = startOfDay(new Date());
  return VENUES.filter(v => v.deadline).map(v => {
    const next = startOfDay(new Date(`${v.deadline}T23:59`));
    const notifyDate = v.notify ? startOfDay(new Date(`${v.notify}T12:00`)) : null;
    return { ...v, next, left: diffDays(next, N), notifyDate };
  }).sort((a, b) => a.left - b.left);
}

async function load() {
  loading = true; rerender();
  const jobs = [];
  jobs.push(fetch('https://hn.algolia.com/api/v1/search?query=AI%20OR%20LLM%20OR%20%22machine%20learning%22&tags=story&hitsPerPage=25&numericFilters=points%3E30')
    .then(r => r.json()).then(j => (j.hits || []).map(h => ({
      id: 'hn' + h.objectID, title: h.title, url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      points: h.points, comments: h.num_comments, at: h.created_at, by: h.author
    }))).catch(() => []));
  const since = ymd(addDays(new Date(), -21));
  jobs.push(fetch(`https://api.github.com/search/repositories?q=topic:llm+OR+topic:computer-vision+OR+topic:robotics+pushed:>${since}&sort=stars&order=desc&per_page=15`)
    .then(r => r.json()).then(j => (j.items || []).map(x => ({
      id: 'gh' + x.id, title: x.full_name, desc: x.description || '', url: x.html_url,
      stars: x.stargazers_count, lang: x.language, at: x.pushed_at, topics: x.topics || []
    }))).catch(() => []));
  const [hn, gh] = await Promise.all(jobs);
  cache = { hn, gh, at: Date.now() };
  loading = false; rerender();
}

function rerender() {
  if (!host) return;
  const dls = venueDeadlines();
  host.innerHTML = `
  <div class="row" style="margin-bottom:14px">
    <div class="seg" id="areaSeg">
      ${[['all', '全部'], ['计算机视觉', 'CV'], ['机器学习', 'ML'], ['自然语言处理', 'NLP'], ['机器人', '机器人']].map(([v, t]) => `<button data-a="${v}" class="${area === v ? 'active' : ''}">${t}</button>`).join('')}
    </div>
    <span class="small muted">${cache.at ? '更新于 ' + fmtAgo(cache.at) : ''}</span>
    <div class="spacer"></div>
    <button class="primary-btn" id="reload" ${loading ? 'disabled' : ''}>${loading ? '加载中…' : '⟳ 刷新资讯'}</button>
  </div>

  <div class="grid" style="grid-template-columns:1fr 1fr">
    <div class="card"><div class="card-head"><h3>⏰ 顶会截稿与放榜倒计时</h3><span class="chip gray">${dls.length}</span></div>
      <div class="card-body" style="max-height:480px;overflow:auto">
        ${dls.filter(v => area === 'all' || v.area.includes(area.slice(0, 2))).map(v => `
        <div class="list-item">
          <div style="flex:1">
            <div class="t">${v.id} <span class="chip gray">${esc(v.area)}</span></div>
            <div class="s">截稿 ${ymd(v.next)}（${fmtRel(v.next)}）${v.notifyDate ? ` · 放榜约 ${ymd(v.notifyDate)}` : ''}${v.conf ? ` · 会期 ${v.conf}` : ''}</div>
            <div class="progress" style="margin-top:5px"><i style="width:${Math.max(3, 100 - Math.min(100, v.left / 3.65))}%"></i></div>
          </div>
          <div class="chip ${v.left <= 14 ? 'danger' : v.left <= 45 ? 'warn' : 'gray'}">${v.left} 天</div>
          <button class="btn sm" data-sync="${v.id}">同步日历</button>
          <a class="btn sm" href="${v.site}" target="_blank" rel="noopener">官网</a>
        </div>`).join('')}
        <p class="small muted" style="margin-top:8px">日期依据 CCF DDL 等公开汇总整理（下一轮投稿周期），实际以官网公告为准；同步后可在「日历与提醒」中调整。</p>
      </div>
    </div>

    <div class="card"><div class="card-head"><h3>🔥 Hacker News · AI 热帖</h3></div>
      <div class="card-body" style="max-height:480px;overflow:auto">
        ${cache.hn.length ? cache.hn.map(h => `<div class="list-item">
          <div style="flex:1"><div class="t"><a href="${esc(h.url)}" target="_blank" rel="noopener">${esc(h.title)}</a></div>
          <div class="s">▲ ${h.points} · 💬 ${h.comments} · ${fmtAgo(new Date(h.at).getTime())}</div></div>
          <button class="btn sm" data-tr="${esc(h.id)}">译</button>
        </div>`).join('') : (loading ? '<div class="empty">加载中…</div>' : emptyBox('暂无数据，点击右上角刷新'))}
      </div>
    </div>

    <div class="card"><div class="card-head"><h3>⭐ GitHub · 近期活跃 AI 项目</h3></div>
      <div class="card-body" style="max-height:420px;overflow:auto">
        ${cache.gh.length ? cache.gh.map(g => `<div class="list-item">
          <div style="flex:1"><div class="t"><a href="${esc(g.url)}" target="_blank" rel="noopener">${esc(g.title)}</a></div>
          <div class="s">${esc((g.desc || '').slice(0, 110))}</div>
          <div class="s">⭐ ${g.stars.toLocaleString()} · ${esc(g.lang || '—')} · ${g.topics.slice(0, 3).map(t => `<span class="chip gray">${esc(t)}</span>`).join(' ')}</div></div>
        </div>`).join('') : (loading ? '<div class="empty">加载中…</div>' : emptyBox('暂无数据'))}
      </div>
    </div>

    <div class="card"><div class="card-head"><h3>📰 技术解读与官方博客</h3></div>
      <div class="card-body"><div class="row">
        ${BLOG_LINKS.map(b => `<a class="btn" href="${b.url}" target="_blank" rel="noopener">${esc(b.name)} ↗</a>`).join('')}
      </div>
      <p class="small muted" style="margin-top:10px">这些站点未提供跨域 RSS 接口，此处提供一键直达。若需自动聚合，可在设置中配置自建 RSS 代理。</p>
      </div>
    </div>
  </div>`;

  $('#reload').onclick = load;
  $('#areaSeg').onclick = e => { const b = e.target.closest('[data-a]'); if (b) { area = b.dataset.a; rerender(); } };
  host.onclick = async e => {
    const s = e.target.closest('[data-sync]');
    if (s) {
      const v = venueDeadlines().find(x => x.id === s.dataset.sync);
      quickCreate(`${v.id} 投稿截止`, v.next, 'research', { level: 'high', advance: 10080, note: `${v.full}\n官网：${v.site}` });
      if (v.notifyDate) quickCreate(`${v.id} 放榜（预计）`, v.notifyDate, 'research', { level: 'mid', advance: 1440 });
      toast(`已将 ${v.id} 关键节点同步到日历`, 'ok');
      return;
    }
    const t = e.target.closest('[data-tr]');
    if (t) {
      const item = cache.hn.find(x => x.id === t.dataset.tr); if (!item) return;
      t.textContent = '…';
      const zh = await translate(item.title);
      modal({ title: '中英对照', body: `<p><b>EN:</b> ${esc(item.title)}</p><p style="margin-top:8px"><b>中:</b> ${esc(zh)}</p>`, foot: `<a class="btn solid" href="${esc(item.url)}" target="_blank" rel="noopener">阅读原文</a><button class="btn" data-close>关闭</button>` });
      t.textContent = '译';
    }
  };
}

export function topNews(n = 4) { return cache.hn.slice(0, n); }
export function nearestDeadlines(n = 3) { return venueDeadlines().slice(0, n); }
export function ensureLoaded() { if (!cache.at && !loading) load(); }
