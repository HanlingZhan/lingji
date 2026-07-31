// ============ 计算机 AI 方向定向论文抓取与文献管理 ============
import { store, S } from '../store.js';
import { $, $$, esc, ymd, uid, download, fmtAgo, groupBy } from '../utils.js';
import { formModal, toast, confirmDlg, emptyBox, modal } from '../ui.js';
import { VENUES } from '../data/venues.js';

const SOURCES = {
  arxiv: { name: 'arXiv', desc: '每日凌晨更新的预印本，实时 API 抓取', live: true },
  openreview: { name: 'OpenReview', desc: 'ICLR / NeurIPS / ICML 投稿与评审', live: true },
  pwc: { name: 'Papers with Code', desc: '带开源代码的论文与 SOTA 排行', live: true },
  cvf: { name: 'CVF Open Access', desc: 'CVPR / ICCV / WACV 正式录用论文', live: false },
  scholar: { name: 'Google Scholar', desc: '学者与机构追踪、引用检索', live: false }
};
export const READ_STATUS = { unread: '未读', reading: '在读', read: '已读' };
const DEFAULT_TAGS = ['待精读', '相关工作', '实验参考', '方法借鉴', '数据集'];

let tab = 'feed', host = null, loading = false, lastResult = [];

export function render(el) { host = el; rerender(); }

function rerender() {
  if (!host) return;
  const st = S();
  host.innerHTML = `
  <div class="row" style="margin-bottom:14px">
    <div class="seg" id="pTab">
      ${[['feed', '📥 论文推送'], ['lib', `📚 我的文库 (${st.paperLib.length})`], ['rules', '⚙️ 抓取规则']].map(([v, t]) => `<button data-v="${v}" class="${tab === v ? 'active' : ''}">${t}</button>`).join('')}
    </div>
    <div class="spacer"></div>
    <div id="pActions"></div>
  </div>
  <div id="pBody"></div>`;
  $('#pTab').onclick = e => { const b = e.target.closest('[data-v]'); if (b) { tab = b.dataset.v; rerender(); } };
  if (tab === 'feed') drawFeed();
  else if (tab === 'lib') drawLib();
  else drawRules();
}

// ---------------- 抓取 ----------------
function activeKeywords() {
  return S().paperRules.groups.filter(g => g.on).flatMap(g => g.kw.map(k => ({ k, group: g.name })));
}

export async function fetchArxiv(maxResults = 60) {
  const r = S().paperRules;
  const kws = activeKeywords().map(x => x.k);
  if (!kws.length) throw new Error('请先配置至少一组关键词');
  const kwQuery = kws.slice(0, 12).map(k => `all:"${k}"`).join('+OR+');
  const catQuery = (r.categories || []).map(c => `cat:${c}`).join('+OR+');
  const q = catQuery ? `(${kwQuery})+AND+(${catQuery})` : `(${kwQuery})`;
  const url = `https://export.arxiv.org/api/query?search_query=${q}&start=0&max_results=${maxResults}&sortBy=submittedDate&sortOrder=descending`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('arXiv HTTP ' + res.status);
  const xml = new DOMParser().parseFromString(await res.text(), 'text/xml');
  return Array.from(xml.querySelectorAll('entry')).map(e => {
    const get = t => e.querySelector(t)?.textContent?.trim() || '';
    const id = get('id');
    return {
      id: 'arxiv:' + id.split('/abs/')[1],
      source: 'arXiv',
      title: get('title').replace(/\s+/g, ' '),
      authors: Array.from(e.querySelectorAll('author name')).map(n => n.textContent),
      abs: get('summary').replace(/\s+/g, ' '),
      url: id,
      pdf: id.replace('/abs/', '/pdf/'),
      published: get('published').slice(0, 10),
      updated: get('updated').slice(0, 10),
      primary: e.querySelector('primary_category')?.getAttribute('term') || '',
      comment: e.getElementsByTagName('arxiv:comment')[0]?.textContent || ''
    };
  });
}

export async function fetchOpenReview(limit = 25) {
  const kws = activeKeywords().slice(0, 3).map(x => x.k);
  const out = [];
  for (const k of kws) {
    try {
      const res = await fetch(`https://api2.openreview.net/notes/search?term=${encodeURIComponent(k)}&limit=${limit}&type=terms`);
      if (!res.ok) continue;
      const j = await res.json();
      (j.notes || []).forEach(n => {
        const c = n.content || {};
        const val = x => (x && typeof x === 'object' ? x.value : x) || '';
        out.push({
          id: 'or:' + n.id, source: 'OpenReview', title: String(val(c.title)).replace(/\s+/g, ' '),
          authors: [].concat(val(c.authors) || []), abs: String(val(c.abstract) || ''),
          url: 'https://openreview.net/forum?id=' + n.id, pdf: 'https://openreview.net/pdf?id=' + n.id,
          published: n.cdate ? ymd(new Date(n.cdate)) : '', venue: String(val(c.venue) || '')
        });
      });
    } catch { }
  }
  return out;
}

export async function fetchPwC(limit = 20) {
  const kws = activeKeywords().slice(0, 3).map(x => x.k);
  const out = [];
  for (const k of kws) {
    try {
      const res = await fetch(`https://paperswithcode.com/api/v1/papers/?q=${encodeURIComponent(k)}&items_per_page=${limit}`);
      if (!res.ok) continue;
      const j = await res.json();
      (j.results || []).forEach(p => out.push({
        id: 'pwc:' + p.id, source: 'Papers with Code', title: p.title, authors: p.authors || [],
        abs: p.abstract || '', url: p.url_abs || p.url_pdf, pdf: p.url_pdf, published: p.published || '',
        code: true
      }));
    } catch { }
  }
  return out;
}

// 相关度评分 0-100
export function scorePaper(p) {
  const r = S().paperRules;
  const text = (p.title + ' ' + p.abs).toLowerCase();
  let score = 0; const hits = [];
  r.groups.filter(g => g.on).forEach(g => {
    let gh = 0;
    g.kw.forEach(k => {
      const kk = k.toLowerCase();
      if (!kk) return;
      const inTitle = p.title.toLowerCase().includes(kk);
      const n = (text.match(new RegExp(kk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      if (inTitle) { gh += 40; }
      if (n) { gh += Math.min(30, n * 12); }
    });
    if (gh) { score += Math.min(70, gh); hits.push(g.name); }
  });
  // 顶会/顶刊命中
  const vtext = (p.comment || '') + ' ' + (p.venue || '');
  const v = r.venues.find(x => new RegExp('\\b' + x + '\\b', 'i').test(vtext));
  if (v) { score += 20; hits.push(v); }
  if (p.code) score += 5;
  // 学者追踪
  const au = (p.authors || []).join(' ').toLowerCase();
  const a = (r.authors || []).find(x => x && au.includes(x.toLowerCase()));
  if (a) { score += 25; hits.push('👤 ' + a); }
  // 排除词
  if ((r.exclude || []).some(x => x && text.includes(x.toLowerCase()))) score = 0;
  return { score: Math.min(100, Math.round(score)), hits, venueHit: v, authorHit: a };
}

async function runFetch() {
  if (loading) return;
  loading = true; rerenderFeedHead();
  const r = S().paperRules; const errs = [];
  let all = [];
  const jobs = [];
  if (r.sources.arxiv) jobs.push(fetchArxiv(r.maxPerDay || 40).catch(e => { errs.push('arXiv: ' + e.message); return []; }));
  if (r.sources.openreview) jobs.push(fetchOpenReview().catch(e => { errs.push('OpenReview 抓取受限'); return []; }));
  if (r.sources.pwc) jobs.push(fetchPwC().catch(e => { errs.push('Papers with Code 抓取受限'); return []; }));
  const results = await Promise.all(jobs);
  results.forEach(x => all.push(...x));
  // 去重 + 评分 + 阈值过滤
  const seen = new Set(); const scored = [];
  all.forEach(p => {
    const key = p.title.toLowerCase().replace(/\W+/g, '').slice(0, 60);
    if (seen.has(key)) return; seen.add(key);
    const s = scorePaper(p);
    if (s.score >= (r.threshold || 30)) scored.push({ ...p, ...s });
  });
  scored.sort((a, b) => b.score - a.score || (b.published || '').localeCompare(a.published || ''));
  store.update(s => { s.paperCache = { at: Date.now(), items: scored.slice(0, 120), errs }; });
  lastResult = scored;
  loading = false;
  rerender();
  toast(errs.length ? `抓取完成 ${scored.length} 篇（${errs.length} 个源受限）` : `抓取完成，${scored.length} 篇达标`, errs.length ? '' : 'ok');
}

// ---------------- 视图：推送流 ----------------
function rerenderFeedHead() {
  const a = $('#pActions'); if (a) a.innerHTML = `<button class="btn" id="linkBtn">🔗 其他平台直达</button> <button class="primary-btn" id="fetchBtn" ${loading ? 'disabled' : ''}>${loading ? '抓取中…' : '⬇ 立即抓取'}</button>`;
  bindFeedHead();
}
function bindFeedHead() {
  const f = $('#fetchBtn'); if (f) f.onclick = runFetch;
  const l = $('#linkBtn'); if (l) l.onclick = openExternalLinks;
}

function drawFeed() {
  const st = S(); const cache = st.paperCache;
  rerenderFeedHead();
  const items = cache.items || [];
  const groups = groupBy(items, p => p.source);
  $('#pBody').innerHTML = `
    <div class="row" style="margin-bottom:12px">
      <span class="chip">${items.length} 篇达标（阈值 ${st.paperRules.threshold}）</span>
      ${Object.entries(groups).map(([k, v]) => `<span class="chip gray">${k} ${v.length}</span>`).join('')}
      <span class="small muted">${cache.at ? '上次抓取 ' + fmtAgo(cache.at) : '尚未抓取'}</span>
      ${(cache.errs || []).length ? `<span class="chip warn" title="${esc((cache.errs || []).join('；'))}">${cache.errs.length} 个源受限（点「其他平台直达」手动检索）</span>` : ''}
      <div class="spacer"></div>
      <input type="text" id="pSearch" placeholder="在结果中筛选…" style="width:190px">
      <button class="btn" id="bibAll">导出全部 BibTeX</button>
    </div>
    <div id="paperList">${items.length ? items.map(paperHTML).join('') : emptyBox('点击右上角「立即抓取」，按你的关键词 / 顶会 / 学者规则拉取最新论文', '📄')}</div>`;
  bindPaperList();
  const se = $('#pSearch');
  if (se) se.oninput = e => {
    const q = e.target.value.toLowerCase();
    $('#paperList').innerHTML = items.filter(p => (p.title + p.abs + p.authors.join(' ')).toLowerCase().includes(q)).map(paperHTML).join('') || emptyBox('无匹配结果');
    bindPaperList();
  };
  const b = $('#bibAll'); if (b) b.onclick = () => exportBib(items, 'arxiv_feed.bib');
}

function paperHTML(p, inLib = false) {
  const rec = S().paperLib.find(x => x.pid === p.id);
  return `<div class="paper" data-pid="${esc(p.id)}">
    <div class="row" style="gap:7px;margin-bottom:5px">
      <span class="score ${p.score >= 70 ? 'hi' : ''}">相关度 ${p.score ?? '—'}</span>
      <span class="source-tag">${esc(p.source)}</span>
      ${(p.hits || []).slice(0, 4).map(h => `<span class="chip">${esc(h)}</span>`).join('')}
      ${p.code ? '<span class="chip teal">有代码</span>' : ''}
      <span class="small muted">${esc(p.published || '')}${p.primary ? ' · ' + esc(p.primary) : ''}</span>
      ${rec ? `<span class="chip ok">已收藏 · ${READ_STATUS[rec.status]}</span>` : ''}
    </div>
    <h4>${esc(p.title)}</h4>
    <div class="au">${esc((p.authors || []).slice(0, 8).join(', '))}${(p.authors || []).length > 8 ? ' 等' : ''}</div>
    <div class="abs" data-abs>${esc(p.abs || '（无摘要）')}</div>
    <div class="zh small" style="margin-top:6px;color:var(--blue-700)" hidden></div>
    <div class="ops">
      <button class="btn sm" data-toggleabs>展开摘要</button>
      <button class="btn sm" data-tr>中英对照</button>
      <a class="btn sm" href="${esc(p.url)}" target="_blank" rel="noopener">原文</a>
      ${p.pdf ? `<a class="btn sm" href="${esc(p.pdf)}" target="_blank" rel="noopener">PDF</a>` : ''}
      <button class="btn sm" data-bib>BibTeX</button>
      ${inLib ? `<button class="btn sm" data-tag>标签/状态</button><button class="btn sm danger" data-remove>移出文库</button>`
      : `<button class="btn sm solid" data-fav>${rec ? '已在文库' : '⭐ 收藏到文库'}</button>`}
    </div>
  </div>`;
}

function findPaper(pid) {
  return (S().paperCache.items || []).find(p => p.id === pid) || S().paperLib.find(p => p.pid === pid);
}

function bindPaperList() {
  const list = $('#paperList'); if (!list) return;
  list.onclick = async e => {
    const card = e.target.closest('[data-pid]'); if (!card) return;
    const pid = card.dataset.pid; const p = findPaper(pid); if (!p) return;
    if (e.target.closest('[data-toggleabs]')) {
      const a = card.querySelector('[data-abs]'); a.classList.toggle('open');
      e.target.textContent = a.classList.contains('open') ? '收起摘要' : '展开摘要'; return;
    }
    if (e.target.closest('[data-tr]')) {
      const zh = card.querySelector('.zh');
      if (!zh.hidden) { zh.hidden = true; return; }
      zh.hidden = false; zh.textContent = '翻译中…';
      zh.textContent = await translate(p.abs || p.title);
      card.querySelector('[data-abs]').classList.add('open');
      return;
    }
    if (e.target.closest('[data-bib]')) { const bib = toBib(p); navigator.clipboard?.writeText(bib); modal({ title: 'BibTeX', body: `<textarea style="min-height:180px">${esc(bib)}</textarea><p class="small muted">已尝试复制到剪贴板</p>`, foot: '<button class="btn" data-close>关闭</button>' }); return; }
    if (e.target.closest('[data-fav]')) { addToLib(p); rerender(); return; }
    if (e.target.closest('[data-remove]')) { const rec = S().paperLib.find(x => x.pid === pid); confirmDlg('从文库移除该论文？', () => { store.remove('paperLib', rec.id); rerender(); }); return; }
    if (e.target.closest('[data-tag]')) { editLibItem(pid); return; }
  };
}

function addToLib(p) {
  if (S().paperLib.some(x => x.pid === p.id)) return toast('已在文库中');
  store.add('paperLib', {
    pid: p.id, title: p.title, authors: p.authors, abs: p.abs, url: p.url, pdf: p.pdf,
    published: p.published, source: p.source, score: p.score, tags: ['待精读'], status: 'unread', note: ''
  });
  toast('已收藏到文库', 'ok');
}

// ---------------- 视图：文库 ----------------
let libFilter = 'all', libStatus = 'all';
function drawLib() {
  const lib = S().paperLib;
  const allTags = [...new Set(lib.flatMap(x => x.tags || []))];
  $('#pActions').innerHTML = `<button class="btn" id="expBib">导出 BibTeX</button> <button class="btn" id="expJson">导出 JSON</button>`;
  const items = lib.filter(x => (libFilter === 'all' || (x.tags || []).includes(libFilter)) && (libStatus === 'all' || x.status === libStatus));
  $('#pBody').innerHTML = `
    <div class="row" style="margin-bottom:12px">
      <span class="small muted">标签：</span>
      <span class="chip sel ${libFilter === 'all' ? 'on' : ''}" data-lt="all">全部 ${lib.length}</span>
      ${allTags.map(t => `<span class="chip sel ${libFilter === t ? 'on' : ''}" data-lt="${esc(t)}">${esc(t)} ${lib.filter(x => (x.tags || []).includes(t)).length}</span>`).join('')}
      <div class="spacer"></div>
      <span class="small muted">阅读状态：</span>
      <div class="seg" id="stSeg">${[['all', '全部'], ...Object.entries(READ_STATUS)].map(([v, t]) => `<button data-st="${v}" class="${libStatus === v ? 'active' : ''}">${t}</button>`).join('')}</div>
    </div>
    <div id="paperList">${items.length ? items.map(x => paperHTML({ ...x, id: x.pid, hits: x.tags }, true)).join('') : emptyBox('文库为空，去「论文推送」收藏几篇吧', '📚')}</div>`;
  bindPaperList();
  $('#pBody').addEventListener('click', e => {
    const t = e.target.closest('[data-lt]'); if (t) { libFilter = t.dataset.lt; drawLib(); }
    const s = e.target.closest('[data-st]'); if (s) { libStatus = s.dataset.st; drawLib(); }
  });
  $('#expBib').onclick = () => exportBib(items.map(x => ({ ...x, id: x.pid })), 'my_library.bib');
  $('#expJson').onclick = () => download('paper_library.json', JSON.stringify(items, null, 2));
}

function editLibItem(pid) {
  const rec = S().paperLib.find(x => x.pid === pid); if (!rec) return;
  formModal({
    title: '标签与阅读状态',
    fields: [
      { key: 'tags', label: '标签', type: 'tags', span: 'full', value: rec.tags || [], hint: '常用：' + DEFAULT_TAGS.join('、') },
      { key: 'status', label: '阅读状态', type: 'select', value: rec.status, options: Object.entries(READ_STATUS).map(([v, t]) => ({ v, t })) },
      { key: 'note', label: '笔记', type: 'textarea', span: 'full', value: rec.note || '' }
    ],
    onSubmit: d => { store.patch('paperLib', rec.id, d); toast('已保存', 'ok'); rerender(); }
  });
}

// ---------------- 视图：规则 ----------------
function drawRules() {
  const r = S().paperRules;
  $('#pActions').innerHTML = `<button class="primary-btn" id="addGroup">＋ 关键词组</button>`;
  $('#pBody').innerHTML = `
  <div class="grid" style="grid-template-columns:1fr 1fr">
    <div class="card"><div class="card-head"><h3>🔍 关键词精准抓取</h3></div><div class="card-body">
      ${r.groups.map(g => `<div class="list-item">
        <input type="checkbox" data-gon="${g.id}" ${g.on ? 'checked' : ''}>
        <div style="flex:1"><div class="t">${esc(g.name)}</div><div class="s">${g.kw.map(k => `<span class="chip gray">${esc(k)}</span>`).join(' ')}</div></div>
        <button class="btn sm" data-geditid="${g.id}">编辑</button><button class="btn sm danger" data-gdel="${g.id}">删</button>
      </div>`).join('') || emptyBox('未配置关键词组')}
      <div style="margin-top:10px"><label class="fld"><span>排除关键词（命中即过滤）</span>
        <input type="text" id="exKw" value="${esc((r.exclude || []).join(', '))}" placeholder="逗号分隔"></label></div>
    </div></div>

    <div class="card"><div class="card-head"><h3>🏛️ 顶会 / 顶刊定向追踪</h3><span class="chip gray">已选 ${r.venues.length}</span></div>
      <div class="card-body"><div class="row">
        ${VENUES.map(v => `<span class="chip sel ${r.venues.includes(v.id) ? 'on' : ''}" data-venue="${v.id}" title="${esc(v.full)}">${v.id}</span>`).join('')}
      </div>
      <p class="small muted" style="margin-top:10px">命中所选会议/期刊的论文（含预印本 comment 字段标注）相关度 +20，并优先排序。</p>
      <div style="margin-top:10px"><label class="fld"><span>arXiv 学科类别</span>
        <input type="text" id="cats" value="${esc((r.categories || []).join(', '))}" placeholder="cs.CV, cs.AI, cs.RO, cs.LG, cs.CL"></label></div>
      </div></div>

    <div class="card"><div class="card-head"><h3>👤 学者 / 机构追踪</h3></div><div class="card-body">
      <label class="fld"><span>目标学者姓名或机构（逗号分隔）</span>
      <input type="text" id="authors" value="${esc((r.authors || []).join(', '))}" placeholder="如：Kaiming He, Angjoo Kanazawa, MPI-INF"></label>
      <p class="small muted" style="margin-top:8px">命中作者列表的论文相关度 +25。Google Scholar 无开放 API，可用下方「其他平台直达」一键跳转该学者主页检索。</p>
      <div class="row" style="margin-top:8px">${(r.authors || []).map(a => `<a class="chip" target="_blank" rel="noopener" href="https://scholar.google.com/scholar?q=${encodeURIComponent(a)}">${esc(a)} ↗</a>`).join('')}</div>
    </div></div>

    <div class="card"><div class="card-head"><h3>📡 数据源与推送策略</h3></div><div class="card-body">
      ${Object.entries(SOURCES).map(([k, s]) => `<div class="list-item">
        <input type="checkbox" data-src="${k}" ${r.sources[k] ? 'checked' : ''}>
        <div style="flex:1"><div class="t">${s.name} ${s.live ? '<span class="chip ok">API 实时</span>' : '<span class="chip gray">检索直达</span>'}</div><div class="s">${s.desc}</div></div>
      </div>`).join('')}
      <div class="form-grid" style="margin-top:12px">
        <label class="fld"><span>相关度阈值（0-100）</span><input type="number" id="thr" value="${r.threshold}" min="0" max="100"></label>
        <label class="fld"><span>arXiv 单次最大抓取量</span><input type="number" id="mpd" value="${r.maxPerDay}" min="10" max="200"></label>
      </div>
      <p class="small muted" style="margin-top:8px">arXiv 每日更新，建议每天上午抓取一次；OpenReview 与 Papers with Code 按周聚合更新即可。CVF 与 Scholar 无公开 API，提供检索直达。</p>
      <button class="btn solid" id="saveRules" style="margin-top:10px">保存规则</button>
    </div></div>
  </div>`;

  $('#addGroup').onclick = () => groupForm();
  $('#pBody').onclick = e => {
    const v = e.target.closest('[data-venue]');
    if (v) { store.update(s => { const i = s.paperRules.venues.indexOf(v.dataset.venue); i < 0 ? s.paperRules.venues.push(v.dataset.venue) : s.paperRules.venues.splice(i, 1); }); drawRules(); return; }
    const ge = e.target.closest('[data-geditid]'); if (ge) return groupForm(S().paperRules.groups.find(g => g.id === ge.dataset.geditid));
    const gd = e.target.closest('[data-gdel]'); if (gd) return confirmDlg('删除该关键词组？', () => { store.update(s => s.paperRules.groups = s.paperRules.groups.filter(g => g.id !== gd.dataset.gdel)); drawRules(); });
  };
  $('#pBody').onchange = e => {
    const g = e.target.closest('[data-gon]'); if (g) store.update(s => { const x = s.paperRules.groups.find(y => y.id === g.dataset.gon); x.on = g.checked; });
    const s2 = e.target.closest('[data-src]'); if (s2) store.update(s => s.paperRules.sources[s2.dataset.src] = s2.checked);
  };
  $('#saveRules').onclick = () => {
    store.update(s => {
      const r2 = s.paperRules;
      r2.exclude = $('#exKw').value.split(/[,，]/).map(x => x.trim()).filter(Boolean);
      r2.categories = $('#cats').value.split(/[,，\s]+/).map(x => x.trim()).filter(Boolean);
      r2.authors = $('#authors').value.split(/[,，]/).map(x => x.trim()).filter(Boolean);
      r2.threshold = Math.max(0, Math.min(100, Number($('#thr').value) || 30));
      r2.maxPerDay = Number($('#mpd').value) || 40;
    });
    toast('规则已保存', 'ok'); drawRules();
  };
}
function groupForm(rec = null) {
  formModal({
    title: rec ? '编辑关键词组' : '新建关键词组',
    fields: [
      { key: 'name', label: '研究方向名称', required: true, span: 'full', value: rec?.name || '' },
      { key: 'kw', label: '关键词（中英文均可，逗号分隔）', type: 'tags', span: 'full', value: rec?.kw || [], placeholder: 'hand pose estimation, 手部姿态估计' }
    ],
    onSubmit: d => {
      store.update(s => {
        if (rec) Object.assign(s.paperRules.groups.find(g => g.id === rec.id), d);
        else s.paperRules.groups.push({ id: uid(), on: true, ...d });
      });
      drawRules();
    }
  });
}

function openExternalLinks() {
  const kws = activeKeywords().map(x => x.k).slice(0, 6);
  const q = encodeURIComponent(kws[0] || 'hand pose estimation');
  modal({
    title: '其他平台检索直达', wide: true,
    body: `<p class="small muted">CVF Open Access 与 Google Scholar 未提供公开跨域 API，这里为你的关键词生成检索直达链接：</p>
    <div class="grid" style="grid-template-columns:1fr 1fr;margin-top:10px">
      ${kws.map(k => `<div class="card" style="padding:10px"><b class="small">${esc(k)}</b><div class="row" style="margin-top:6px">
        <a class="btn sm" target="_blank" rel="noopener" href="https://scholar.google.com/scholar?q=${encodeURIComponent(k)}&scisbd=1">Scholar 最新</a>
        <a class="btn sm" target="_blank" rel="noopener" href="https://www.google.com/search?q=site:openaccess.thecvf.com+${encodeURIComponent(k)}">CVF 检索</a>
        <a class="btn sm" target="_blank" rel="noopener" href="https://openreview.net/search?query=${encodeURIComponent(k)}">OpenReview</a>
        <a class="btn sm" target="_blank" rel="noopener" href="https://paperswithcode.com/search?q=${encodeURIComponent(k)}">PwC</a>
        <a class="btn sm" target="_blank" rel="noopener" href="https://arxiv.org/list/cs.CV/recent">arXiv</a>
      </div></div>`).join('')}
    </div>`,
    foot: '<button class="btn" data-close>关闭</button>'
  });
}

// ---------------- BibTeX / 翻译 ----------------
export function toBib(p) {
  const first = (p.authors?.[0] || 'Unknown').split(' ').pop();
  const year = (p.published || '').slice(0, 4) || new Date().getFullYear();
  const wordCandidate = p.title.split(/\s+/).find(w => w.length > 4) || 'paper';
  const key = `${first}${year}${wordCandidate.replace(/\W/g, '').toLowerCase()}`;
  const arxivId = (p.pid || p.id || '').startsWith('arxiv:') ? (p.pid || p.id).slice(6) : '';
  if (arxivId) {
    return `@article{${key},
  title   = {${p.title}},
  author  = {${(p.authors || []).join(' and ')}},
  journal = {arXiv preprint arXiv:${arxivId.replace(/v\d+$/, '')}},
  year    = {${year}},
  url     = {${p.url}}
}`;
  }
  return `@inproceedings{${key},
  title     = {${p.title}},
  author    = {${(p.authors || []).join(' and ')}},
  booktitle = {${p.venue || p.source || ''}},
  year      = {${year}},
  url       = {${p.url}}
}`;
}
function exportBib(items, name) {
  if (!items.length) return toast('没有可导出的条目', 'err');
  download(name, items.map(toBib).join('\n\n'), 'application/x-bibtex');
  toast(`已导出 ${items.length} 条题录`, 'ok');
}

const trCache = new Map();
export async function translate(text) {
  if (!text) return '';
  const t = text.slice(0, 1800);
  if (trCache.has(t)) return trCache.get(t);
  try {
    const r = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=${encodeURIComponent(t)}`);
    if (!r.ok) throw 0;
    const j = await r.json();
    const out = j[0].map(x => x[0]).join('');
    trCache.set(t, out); return out;
  } catch {
    try {
      const r2 = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(t.slice(0, 480))}&langpair=en|zh-CN`);
      const j2 = await r2.json();
      const out = j2.responseData?.translatedText || '（翻译服务暂不可用，可复制摘要到翻译工具）';
      trCache.set(t, out); return out;
    } catch { return '（翻译服务暂不可用：当前网络无法访问翻译接口）'; }
  }
}

// 供首页调用
export function todayFeed(n = 5) { return (S().paperCache.items || []).slice(0, n); }
export function feedMeta() { return { at: S().paperCache.at, total: (S().paperCache.items || []).length }; }
export { runFetch };
