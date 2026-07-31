// ============ 招聘资讯收集：日常实习 / 校招 / 我的追踪 ============
import { store, S } from '../store.js';
import { $, $$, esc, ymd, uid } from '../utils.js';
import { formModal, toast, confirmDlg, emptyBox, modal } from '../ui.js';
import { JOB_PLATFORMS, DAILY_INTERNS, CAMPUS_TARGETS, TENCENT_SNAPSHOT, XHS_KEYWORDS, XHS_SEARCH } from '../data/jobs.js';

let host = null, tab = 'daily', city = '上海', kind = 'all', q = '';
const STATUS = ['关注中', '已投递', '面试中', '已过', '已拿offer'];

export function render(el) { host = el; rerender(); }

function rerender() {
  if (!host) return;
  host.innerHTML = `
  <div class="row" style="margin-bottom:14px">
    <div class="seg" id="jobTabs">
      <button data-t="daily" class="${tab === 'daily' ? 'active' : ''}">🔥 日常实习</button>
      <button data-t="campus" class="${tab === 'campus' ? 'active' : ''}">🎓 校招（2029）</button>
      <button data-t="track" class="${tab === 'track' ? 'active' : ''}">📌 我的追踪</button>
    </div>
    <div class="spacer"></div>
    ${tab === 'track' ? '<button class="primary-btn" id="addTrack">＋ 添加追踪</button>' : ''}
  </div>
  <div id="jobBody"></div>`;
  $('#jobTabs').onclick = e => { const b = e.target.closest('[data-t]'); if (b) { tab = b.dataset.t; rerender(); } };
  if (tab === 'track') $('#addTrack').onclick = openTrackForm;
  const body = $('#jobBody');
  if (tab === 'daily') renderDaily(body);
  else if (tab === 'campus') renderCampus(body);
  else renderTrack(body);
}

// ---------- 信息源卡片 ----------
function platformsCard() {
  return `<div class="card" style="margin-bottom:14px"><div class="card-head"><h3>🔗 招聘信息源</h3></div><div class="card-body" style="display:flex;flex-wrap:wrap;gap:8px">
    ${JOB_PLATFORMS.map(p => `<a class="chip gray" href="${p.url}" target="_blank" rel="noopener" title="${esc(p.note)}" style="text-decoration:none">${esc(p.name)} ↗</a>`).join('')}
  </div></div>`;
}

// 腾讯实时岗位快照（来自 tencent-campus-recruit 技能抓取）
function tencentCard() {
  const t = TENCENT_SNAPSHOT;
  return `<div class="card" style="margin-bottom:14px;border-color:#0d47a1;background:linear-gradient(135deg,#eaf1ff,var(--card))">
    <div class="card-head"><h3>🐧 腾讯实时岗位快照</h3><span class="chip gray">${t.items.length} 个 · 快照 ${t.fetchedAt}</span></div>
    <div class="card-body" style="font-size:13px">
      <div class="small muted" style="margin-bottom:8px">${esc(t.note)}</div>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px">
        ${t.items.map(it => `<div class="list-item" style="padding:8px 10px">
          <div style="flex:1;min-width:0">
            <div class="t" style="font-size:13px">${esc(it.title)}</div>
            <div class="s" style="font-size:12px">${esc(it.unit)} · ${esc(it.dir)} · ${esc(it.cities)}</div>
          </div>
          <a class="btn sm solid" href="${it.url}" target="_blank" rel="noopener">官网 ↗</a>
        </div>`).join('')}
      </div>
      <p class="small muted" style="margin-top:8px">数据为快照，真实岗位以 <a href="https://join.qq.com" target="_blank" rel="noopener">join.qq.com</a> 为准；后续可接后端代理实时拉取。</p>
    </div>
  </div>`;
}

// 小红书求职关键词检索直达
function xhsCard() {
  return `<div class="card" style="margin-bottom:14px">
    <div class="card-head"><h3>📕 小红书求职关键词</h3><span class="chip gray">检索直达</span></div>
    <div class="card-body">
      <div class="small muted" style="margin-bottom:8px">小红书是实习/校招经验、内推、面经高频内容源（静态站无法实时抓取，点关键词直达站内搜索）：</div>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        ${XHS_KEYWORDS.map(x => `<a class="chip" title="${esc(x.note)}" style="text-decoration:none;cursor:pointer" href="${XHS_SEARCH(x.kw)}" target="_blank" rel="noopener">🔍 ${esc(x.kw)}</a>`).join('')}
      </div>
    </div>
  </div>`;
}

function companyCard(c) {
  return `<div class="card" style="margin-bottom:10px${c.hot ? ';border-color:#e0a800;box-shadow:0 0 0 2px rgba(224,168,0,.15)' : ''}">
    <div class="card-head" style="padding:11px 13px"><h3 style="font-size:14px">${c.hot ? '★ ' : ''}${esc(c.company)}</h3>
      <span class="chip ${c.type === '国企' ? 'purple' : 'blue'}">${esc(c.type)}</span>
      <span class="chip gray">${esc(c.city)}</span>
      <div class="spacer"></div>
      <a class="btn sm solid" href="${c.url}" target="_blank" rel="noopener" onclick="event.stopPropagation()">官网 ↗</a>
    </div>
    <div class="card-body" style="padding:10px 13px;font-size:13px">
      <div class="small" style="margin-bottom:4px"><b>方向：</b>${esc(c.tag)}</div>
      <div class="muted" style="font-size:12.5px">${esc(c.note)}</div>
    </div>
  </div>`;
}

// ---------- 日常实习 ----------
function renderDaily(body) {
  const list = DAILY_INTERNS.filter(c => (city === 'all' || c.city === city) && (!q || (c.company + c.tag + c.note).toLowerCase().includes(q.toLowerCase())));
  body.innerHTML = `
  <div class="card" style="margin-bottom:14px;border-color:var(--blue-300);background:linear-gradient(135deg,var(--blue-050),var(--card))">
    <div class="card-body" style="padding:13px 15px">
      <b>博一 · 计划 2027 上半年上海实习 · 重点大厂日常实习</b>
      <div class="small muted" style="margin-top:4px">以下为上海（及少量北京）AI / 算法方向的日常实习重点目标，建议每周刷一次官网与内推群；提前批多在 1–2 月启动。</div>
    </div>
  </div>
  ${platformsCard()}
  ${tencentCard()}
  ${xhsCard()}
  <div class="row" style="margin-bottom:12px">
    <div class="seg" id="citySeg">
      ${[['上海', '上海'], ['北京', '北京'], ['all', '全部']].map(([v, t]) => `<button data-c="${v}" class="${city === v ? 'active' : ''}">${t}</button>`).join('')}
    </div>
    <input class="input" id="q" placeholder="搜索公司 / 方向…" value="${esc(q)}" style="max-width:240px">
    <span class="small muted">共 ${list.length} 家</span>
  </div>
  <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">${list.map(companyCard).join('') || emptyBox('没有匹配的企业', '🔍')}</div>`;
  $('#citySeg').onclick = e => { const b = e.target.closest('[data-c]'); if (b) { city = b.dataset.c; rerender(); } };
  $('#q').oninput = e => { q = e.target.value; renderDaily($('#jobBody')); };
}

// ---------- 校招 ----------
function renderCampus(body) {
  const list = CAMPUS_TARGETS.filter(c => (city === 'all' || c.city === city) && (kind === 'all' || c.type === kind) && (!q || (c.company + c.tag + c.note).toLowerCase().includes(q.toLowerCase())));
  body.innerHTML = `
  <div class="card" style="margin-bottom:14px;border-color:#e0a800;background:linear-gradient(135deg,#fff8e6,var(--card))">
    <div class="card-body" style="padding:13px 15px">
      <b>2029 届校招 · 主战场 北京 / 天津 · 大厂 + 优质国企</b>
      <div class="small muted" style="margin-top:4px">提前批约 2028 年 8–9 月启动、正式批 2028 年 9–11 月、2029 年春招补录；天津重点看待遇优厚的国企（★ 中海油天津分等）。</div>
    </div>
  </div>
  ${platformsCard()}
  ${tencentCard()}
  ${xhsCard()}
  <div class="row" style="margin-bottom:12px">
    <div class="seg" id="citySeg">
      ${[['all', '全部'], ['北京', '北京'], ['天津', '天津']].map(([v, t]) => `<button data-c="${v}" class="${city === v ? 'active' : ''}">${t}</button>`).join('')}
    </div>
    <div class="seg" id="kindSeg">
      ${[['all', '全部'], ['大厂', '大厂'], ['国企', '国企']].map(([v, t]) => `<button data-k="${v}" class="${kind === v ? 'active' : ''}">${t}</button>`).join('')}
    </div>
    <input class="input" id="q" placeholder="搜索公司 / 方向…" value="${esc(q)}" style="max-width:220px">
    <span class="small muted">共 ${list.length} 家</span>
  </div>
  <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">${list.map(companyCard).join('') || emptyBox('没有匹配的企业', '🔍')}</div>`;
  $('#citySeg').onclick = e => { const b = e.target.closest('[data-c]'); if (b) { city = b.dataset.c; rerender(); } };
  $('#kindSeg').onclick = e => { const b = e.target.closest('[data-k]'); if (b) { kind = b.dataset.k; renderCampus($('#jobBody')); } };
  $('#q').oninput = e => { q = e.target.value; renderCampus($('#jobBody')); };
}

// ---------- 我的追踪 ----------
function renderTrack(body) {
  const items = S().jobTracking.slice().sort((a, b) => STATUS.indexOf(a.status) - STATUS.indexOf(b.status));
  const fType = $('#tfType')?.value || 'all', fCity = $('#tfCity')?.value || 'all', fStatus = $('#tfStat')?.value || 'all';
  const shown = items.filter(t => (fType === 'all' || t.type === fType) && (fCity === 'all' || t.city === fCity) && (fStatus === 'all' || t.status === fStatus));
  body.innerHTML = `
  <div class="row" style="margin-bottom:12px;flex-wrap:wrap;gap:8px">
    <select class="input" id="tfType" style="max-width:130px">
      ${['all', '日常实习', '校招'].map(v => `<option value="${v}" ${fType === v ? 'selected' : ''}>${v === 'all' ? '全部类型' : v}</option>`).join('')}
    </select>
    <select class="input" id="tfCity" style="max-width:130px">
      ${['all', '上海', '北京', '天津', '其他'].map(v => `<option value="${v}" ${fCity === v ? 'selected' : ''}>${v === 'all' ? '全部城市' : v}</option>`).join('')}
    </select>
    <select class="input" id="tfStat" style="max-width:130px">
      ${['all', ...STATUS].map(v => `<option value="${v}" ${fStatus === v ? 'selected' : ''}>${v === 'all' ? '全部状态' : v}</option>`).join('')}
    </select>
    <span class="small muted">${shown.length} / ${items.length} 条</span>
  </div>
  <div class="list">
    ${shown.map(t => `
      <div class="list-item">
        <span style="width:8px;height:38px;border-radius:4px;background:${t.status === '已拿offer' ? '#1aa06d' : t.status === '已过' ? '#bbb' : '#1565c0'}"></span>
        <div style="flex:1;min-width:0">
          <div class="t">${esc(t.company)} · ${esc(t.role || '—')}
            <span class="chip ${t.type === '国企' ? 'purple' : 'blue'}">${esc(t.type)}</span>
            <span class="chip gray">${esc(t.city)}</span>
            <span class="chip ${t.status === '已拿offer' ? 'ok' : t.status === '已过' ? 'gray' : 'orange'}">${esc(t.status)}</span>
          </div>
          <div class="s">${t.url ? `<a href="${esc(t.url)}" target="_blank" rel="noopener">链接 ↗</a> · ` : ''}${t.deadline ? '截止 ' + ymd(new Date(t.deadline)) + ' · ' : ''}${esc(t.note || '')}</div>
        </div>
        <button class="btn sm" data-edit="${t.id}">编辑</button>
        <button class="btn sm danger" data-del="${t.id}">删除</button>
      </div>`).join('') || emptyBox('还没有追踪记录，点右上角「添加追踪」', '📌')}
  </div>`;
  $('#tfType').onchange = renderTrackRefresh; $('#tfCity').onchange = renderTrackRefresh; $('#tfStat').onchange = renderTrackRefresh;
  body.onclick = e => {
    const ed = e.target.closest('[data-edit]'); if (ed) return openTrackForm(S().jobTracking.find(x => x.id === ed.dataset.edit));
    const dl = e.target.closest('[data-del]'); if (dl) return confirmDlg('删除该追踪记录？', () => { store.remove('jobTracking', dl.dataset.del); rerender(); });
  };
}
function renderTrackRefresh() { rerender(); }

function openTrackForm(rec = null) {
  formModal({
    title: rec ? '编辑追踪' : '添加追踪',
    fields: [
      { key: 'company', label: '公司 / 单位', required: true, value: rec?.company || '', span: 'full' },
      { key: 'role', label: '岗位 / 方向', value: rec?.role || '' },
      { key: 'type', label: '类型', type: 'select', value: rec?.type || '日常实习', options: [{ v: '日常实习', t: '日常实习' }, { v: '校招', t: '校招' }] },
      { key: 'city', label: '城市', type: 'select', value: rec?.city || '上海', options: ['上海', '北京', '天津', '其他'].map(v => ({ v, t: v })) },
      { key: 'status', label: '状态', type: 'select', value: rec?.status || '关注中', options: STATUS.map(v => ({ v, t: v })) },
      { key: 'deadline', label: '截止日期', type: 'date', value: rec?.deadline || '' },
      { key: 'url', label: '招聘链接', value: rec?.url || '', span: 'full', placeholder: 'https://…' },
      { key: 'note', label: '备注', type: 'textarea', span: 'full', value: rec?.note || '' }
    ],
    onSubmit: d => {
      const data = { company: d.company, role: d.role, type: d.type, city: d.city, status: d.status, url: d.url, deadline: d.deadline || '', note: d.note };
      if (rec) store.patch('jobTracking', rec.id, data); else store.add('jobTracking', data);
      toast('已保存', 'ok'); rerender();
    }
  });
}
