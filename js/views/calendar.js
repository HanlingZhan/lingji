// ============ 日历与长期提醒 ============
import { store, S } from '../store.js';
import { $, $$, esc, ymd, hm, pad, addDays, addMonths, startOfDay, startOfWeek, diffDays, isSameDay, weekdayCN, WEEK_CN, nextOccurrence, fmtRel, toLocalInput, TAGS, LEVELS, BOARD_TAGS, uid } from '../utils.js';
import { formModal, toast, confirmDlg, emptyBox, modal } from '../ui.js';
import { requestPermission } from '../notify.js';
import { courseOccursOn, currentWeek, SECTION_TIME } from './schedule.js';

let mode = 'month';
let cursor = new Date();
let filter = 'all';
let selected = new Date();

export const REPEATS = [
  { v: 'none', t: '不重复' }, { v: 'daily', t: '每天' }, { v: 'weekly', t: '每周' },
  { v: 'biweekly', t: '每两周' }, { v: 'monthly', t: '每月' }, { v: 'yearly', t: '每年' }
];
const ADVANCES = [
  { v: 0, t: '准时提醒' }, { v: 10, t: '提前 10 分钟' }, { v: 30, t: '提前 30 分钟' }, { v: 60, t: '提前 1 小时' },
  { v: 180, t: '提前 3 小时' }, { v: 1440, t: '提前 1 天' }, { v: 4320, t: '提前 3 天' }, { v: 10080, t: '提前 1 周' }, { v: 43200, t: '提前 30 天' }
];

// ---------- 数据查询 ----------
// 看板分区下拉：order 优先，缺失的 cols 补末尾，取不到回退 personal（防云同步残留缺分区卡死）
export function colOrderOpts(board = S().board) {
  const seen = new Set();
  const order = [];
  [...(board?.order || []), ...Object.keys(board?.cols || {})].forEach(k => {
    if (!k || seen.has(k)) return; seen.add(k); order.push(k);
  });
  return order.map(k => ({ v: k, t: (board?.cols?.[k]?.icon || '📌') + ' ' + (board?.cols?.[k]?.name || '未命名') }));
}
export function occurrencesOn(date, opt = {}) {
  const st = S(); const out = [];
  const d0 = startOfDay(date);
  st.reminders.forEach(r => {
    if (opt.tag && opt.tag !== 'all' && r.tag !== opt.tag) return;
    if (r.repeat && r.repeat !== 'none') {
      const occ = nextOccurrence(r, d0);
      if (isSameDay(occ, date)) out.push({ ...r, occAt: occ });
    } else if (isSameDay(r.at, date)) out.push({ ...r, occAt: new Date(r.at) });
  });
  return out.sort((a, b) => a.occAt - b.occAt);
}
export function upcoming(days = 7, includeDone = false) {
  const st = S(); const N = new Date(); const out = [];
  st.reminders.forEach(r => {
    if (!includeDone && r.done) return;
    const at = nextOccurrence(r, startOfDay(N));
    const dd = diffDays(at, N);
    if (dd >= -1 && dd <= days) out.push({ ...r, occAt: at });
  });
  return out.sort((a, b) => a.occAt - b.occAt);
}
export function longTerm(minDays = 7) {
  const N = new Date();
  return S().reminders.filter(r => !r.done)
    .map(r => ({ ...r, occAt: nextOccurrence(r, startOfDay(N)) }))
    .filter(r => diffDays(r.occAt, N) > minDays)
    .sort((a, b) => a.occAt - b.occAt);
}
export function overdue() {
  const N = new Date();
  return S().reminders.filter(r => !r.done && (!r.repeat || r.repeat === 'none') && new Date(r.at) < N)
    .map(r => ({ ...r, occAt: new Date(r.at) })).sort((a, b) => a.occAt - b.occAt);
}

// ---------- 表单 ----------
export function openReminderForm(rec = null, preset = {}) {
  const isEdit = !!rec;
  formModal({
    title: isEdit ? '编辑提醒事项' : '新建提醒事项',
    fields: [
      { key: 'title', label: '事项名称', required: true, span: 'full', value: rec?.title || '', placeholder: '例如：CVPR 2027 投稿截止' },
      { key: 'at', label: '时间（可精确到分，无年份上限）', type: 'datetime-local', required: true, value: rec ? toLocalInput(rec.at) : (preset.at ? toLocalInput(preset.at) : toLocalInput(new Date(Date.now() + 3600000))) },
      { key: 'tag', label: '标签分类', type: 'select', value: rec?.tag || preset.tag || 'research', options: Object.entries(TAGS).map(([v, o]) => ({ v, t: o.label })) },
      { key: 'level', label: '重要等级（决定提醒强度）', type: 'select', value: rec?.level || 'mid', options: Object.entries(LEVELS).map(([v, o]) => ({ v, t: o.label })) },
      { key: 'repeat', label: '重复规则', type: 'select', value: rec?.repeat || 'none', options: REPEATS },
      { key: 'advance', label: '提前提醒', type: 'select', value: String(rec?.advance ?? 60), options: ADVANCES.map(a => ({ v: String(a.v), t: a.t })) },
      { key: 'toBoard', label: '同时一键加入看板', type: 'checkbox', value: !!rec?.boardId, hint: isEdit && rec?.boardId ? '已关联看板任务，勾选后编辑会同步更新看板卡' : '创建/保存提醒时，在看板生成（或同步更新）一张同名任务卡' },
      { key: 'boardCol', label: '看板分区', type: 'select', value: rec?.boardCol || 'personal', options: colOrderOpts(S().board) },
      { key: 'note', label: '备注', type: 'textarea', span: 'full', value: rec?.note || '', placeholder: '补充说明、链接等' }
    ],
    submitText: isEdit ? '保存修改' : '创建',
    onSubmit: d => {
      const data = { ...d, at: new Date(d.at).toISOString(), advance: Number(d.advance) };
      let savedId = rec?.id;
      if (isEdit) { store.patch('reminders', rec.id, data); savedId = rec.id; }
      else savedId = store.add('reminders', { ...data, done: false }).id;
      // 一键加入看板：新建勾选→建卡；编辑勾选→若有对应卡则同步更新，没有则建卡（双向关联防重复）
      if (d.toBoard) {
        const tags = (d.boardTags && d.boardTags.length) ? d.boardTags : [TAGS[d.tag]?.label || '其他'];
        const taskData = { title: d.title, col: d.boardCol, priority: d.level === 'high' ? 'high' : d.level === 'low' ? 'low' : 'mid', due: d.at || '', note: d.note, tags, done: rec?.done || false, order: Date.now() };
        const existing = rec?.boardId ? S().board.tasks.find(t => t.id === rec.boardId) : null;
        if (existing) {
          store.patch('board.tasks', existing.id, taskData);
        } else {
          const task = store.add('board.tasks', { ...taskData, done: false, reminderId: savedId });
          const r = S().reminders.find(x => x.id === savedId);
          if (r) store.patch('reminders', savedId, { boardId: task.id });
        }
      }
      toast(isEdit ? '已更新' : (d.toBoard ? '提醒已创建并已加入看板' : '提醒已创建'), 'ok');
      requestPermission();
      rerender();
    }
  });
}

function toggleDone(id) {
  const r = S().reminders.find(x => x.id === id);
  store.patch('reminders', id, { done: !r.done, doneAt: !r.done ? Date.now() : null });
  rerender();
}

// ---------- 渲染 ----------
let host = null;
export function render(el) { host = el; rerender(); }
function rerender() {
  if (!host || !document.body.contains(host)) return;
  host.innerHTML = `
    <div class="row" style="margin-bottom:14px">
      <div class="seg" id="modeSeg">
        ${[['day', '日'], ['week', '周'], ['month', '月'], ['year', '年']].map(([v, t]) => `<button data-m="${v}" class="${mode === v ? 'active' : ''}">${t}视图</button>`).join('')}
      </div>
      <button class="btn" id="prevBtn">‹</button>
      <button class="btn" id="todayBtn">今天</button>
      <button class="btn" id="nextBtn">›</button>
      <strong id="curLabel" style="font-size:15px">${label()}</strong>
      <input type="date" id="jumpDate" value="${ymd(cursor)}" style="width:150px">
      <div class="spacer"></div>
      <div class="seg" id="tagSeg">
        ${[['all', '全部'], ...Object.entries(TAGS).map(([v, o]) => [v, o.label])].map(([v, t]) => `<button data-t="${v}" class="${filter === v ? 'active' : ''}">${t}</button>`).join('')}
      </div>
      <button class="primary-btn" id="newRem">＋ 新建提醒</button>
    </div>
    <div id="calBody"></div>
    <div class="grid" style="grid-template-columns:1fr 1fr;margin-top:16px" id="sideLists"></div>
  `;
  drawBody();
  drawSide();
  $('#modeSeg').onclick = e => { const b = e.target.closest('[data-m]'); if (b) { mode = b.dataset.m; rerender(); } };
  $('#tagSeg').onclick = e => { const b = e.target.closest('[data-t]'); if (b) { filter = b.dataset.t; rerender(); } };
  $('#prevBtn').onclick = () => { shift(-1); rerender(); };
  $('#nextBtn').onclick = () => { shift(1); rerender(); };
  $('#todayBtn').onclick = () => { cursor = new Date(); selected = new Date(); rerender(); };
  $('#jumpDate').onchange = e => { cursor = new Date(e.target.value + 'T12:00'); selected = new Date(cursor); rerender(); };
  $('#newRem').onclick = () => openReminderForm(null, { at: mode === 'day' ? selected : null });
}
function shift(n) {
  if (mode === 'day') cursor = addDays(cursor, n);
  else if (mode === 'week') cursor = addDays(cursor, 7 * n);
  else if (mode === 'month') cursor = addMonths(cursor, n);
  else cursor = addMonths(cursor, 12 * n);
}
function label() {
  const y = cursor.getFullYear(), m = cursor.getMonth() + 1;
  if (mode === 'day') return `${y} 年 ${m} 月 ${cursor.getDate()} 日 ${weekdayCN(cursor)}`;
  if (mode === 'week') { const s = startOfWeek(cursor); return `${ymd(s)} ~ ${ymd(addDays(s, 6))}`; }
  if (mode === 'month') return `${y} 年 ${m} 月`;
  return `${y} 年`;
}

function evChip(r) {
  const cls = r.tag === 'research' ? 'sci' : r.tag === 'course' ? 'course' : r.tag === 'life' ? 'life' : '';
  return `<div class="cal-ev ${cls} ${r.done ? 'done' : ''}" data-rem="${r.id}" title="${esc(r.title)}">${hm(r.occAt)} ${esc(r.title)}</div>`;
}

function drawBody() {
  const b = $('#calBody');
  if (mode === 'month') b.innerHTML = monthHTML(cursor);
  else if (mode === 'year') b.innerHTML = yearHTML(cursor);
  else if (mode === 'week') b.innerHTML = weekHTML(cursor);
  else b.innerHTML = dayHTML(cursor);
  b.onclick = e => {
    const ev = e.target.closest('[data-rem]');
    if (ev) { e.stopPropagation(); openDetail(ev.dataset.rem); return; }
    const cell = e.target.closest('[data-date]');
    if (cell) {
      const d = new Date(cell.dataset.date + 'T09:00');
      selected = d;
      if (mode === 'year') { cursor = d; mode = 'month'; rerender(); }
      else if (mode === 'month') { cursor = d; drawBody(); drawSide(); $$('.cal-cell').forEach(c => c.classList.toggle('sel', c.dataset.date === ymd(d))); }
      else openReminderForm(null, { at: d });
    }
  };
  b.ondblclick = e => { const cell = e.target.closest('[data-date]'); if (cell && mode === 'month') openReminderForm(null, { at: new Date(cell.dataset.date + 'T09:00') }); };
}

function monthHTML(c) {
  const first = new Date(c.getFullYear(), c.getMonth(), 1);
  const start = startOfWeek(first);
  let html = `<div class="cal-grid">${['一', '二', '三', '四', '五', '六', '日'].map(d => `<div class="cal-head">周${d}</div>`).join('')}`;
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i);
    const out = d.getMonth() !== c.getMonth();
    if (i >= 35 && out) break;
    const evs = occurrencesOn(d, { tag: filter });
    const cs = coursesOn(d);
    html += `<div class="cal-cell ${out ? 'out' : ''} ${isSameDay(d, new Date()) ? 'today' : ''} ${isSameDay(d, selected) ? 'sel' : ''}" data-date="${ymd(d)}">
      <span class="dnum">${d.getDate()}</span>
      <div class="cal-marks">
        ${evs.slice(0, 3).map(evChip).join('')}
        ${cs.slice(0, 2).map(x => `<div class="cal-ev course">📚 ${esc(x.name)}</div>`).join('')}
        ${evs.length > 3 ? `<div class="small muted">+${evs.length - 3} 项</div>` : ''}
      </div>
    </div>`;
  }
  return html + '</div>';
}
function weekHTML(c) {
  const s = startOfWeek(c);
  return `<div class="week-grid">${Array.from({ length: 7 }, (_, i) => {
    const d = addDays(s, i); const evs = occurrencesOn(d, { tag: filter }); const cs = coursesOn(d);
    return `<div class="week-col ${isSameDay(d, new Date()) ? 'today' : ''}" data-date="${ymd(d)}">
      <h5>${WEEK_CN[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}</h5>
      ${cs.map(x => `<div class="cal-ev course">${SECTION_TIME[x.startSec - 1]?.[0] || ''} ${esc(x.name)}</div>`).join('')}
      ${evs.length ? evs.map(evChip).join('') : '<div class="small muted" style="text-align:center;padding:8px 0">—</div>'}
    </div>`;
  }).join('')}</div>`;
}
function dayHTML(c) {
  const evs = occurrencesOn(c, { tag: filter }); const cs = coursesOn(c);
  let html = `<div class="card"><div class="card-head"><h3>${ymd(c)} ${weekdayCN(c)}</h3><div class="actions"><span class="chip">${evs.length} 项提醒</span><span class="chip teal">${cs.length} 门课</span></div></div><div class="card-body day-list" data-date="${ymd(c)}">`;
  for (let h = 7; h <= 23; h++) {
    const inHour = evs.filter(e => e.occAt.getHours() === h);
    const cHour = cs.filter(x => (SECTION_TIME[x.startSec - 1]?.[0] || '').startsWith(pad(h)));
    if (!inHour.length && !cHour.length && h > 22) continue;
    html += `<div class="hour-row"><div class="hh">${pad(h)}:00</div><div style="flex:1">
      ${cHour.map(x => `<div class="cal-ev course">📚 ${esc(x.name)} · ${esc(x.room || '')} · ${esc(x.teacher || '')}</div>`).join('')}
      ${inHour.map(evChip).join('')}
    </div></div>`;
  }
  return html + '</div></div>';
}
function yearHTML(c) {
  const y = c.getFullYear();
  let html = '<div class="year-grid">';
  for (let m = 0; m < 12; m++) {
    const first = new Date(y, m, 1), s = startOfWeek(first);
    let cells = '';
    for (let i = 0; i < 42; i++) {
      const d = addDays(s, i);
      if (d.getMonth() !== m) { cells += '<span class="h"></span>'; continue; }
      const has = occurrencesOn(d, { tag: filter }).length;
      cells += `<span class="${isSameDay(d, new Date()) ? 'today' : has ? 'has' : ''}" data-date="${ymd(d)}" title="${has ? has + ' 项' : ''}">${d.getDate()}</span>`;
    }
    html += `<div class="mini-month"><h4>${m + 1} 月</h4><div class="mini-grid">${['一', '二', '三', '四', '五', '六', '日'].map(x => `<span class="h">${x}</span>`).join('')}${cells}</div></div>`;
  }
  return html + '</div>';
}

function coursesOn(d) {
  const st = S(); const wk = currentWeek(st.semester, d);
  if (wk <= 0) return [];
  return st.courses.filter(c => courseOccursOn(c, d, wk)).sort((a, b) => a.startSec - b.startSec);
}

function drawSide() {
  const up = upcoming(7), lt = longTerm(7), od = overdue();
  const done = S().reminders.filter(r => r.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 12);
  $('#sideLists').innerHTML = `
    ${listCard('⏳ 近期待办（7 天内）', up.filter(x => !x.done), true)}
    ${listCard('🎯 远期重要事项', lt.slice(0, 20), true)}
    ${od.length ? listCard('⚠️ 已逾期', od, true) : ''}
    ${listCard('✅ 已完成事项', done.map(r => ({ ...r, occAt: new Date(r.at) })), false)}
  `;
  $('#sideLists').onclick = e => {
    const c = e.target.closest('[data-toggle]'); if (c) { toggleDone(c.dataset.toggle); return; }
    const d = e.target.closest('[data-open]'); if (d) openDetail(d.dataset.open);
  };
}
function listCard(title, items, showCheck) {
  return `<div class="card"><div class="card-head"><h3>${title}</h3><span class="chip gray">${items.length}</span></div>
  <div class="card-body" style="max-height:320px;overflow:auto">
  ${items.length ? items.map(r => `
    <div class="list-item ${r.done ? 'done' : ''}">
      ${showCheck ? `<input type="checkbox" data-toggle="${r.id}" ${r.done ? 'checked' : ''}>` : '<span>✅</span>'}
      <div style="flex:1;cursor:pointer" data-open="${r.id}">
        <div class="t">${esc(r.title)}</div>
        <div class="s">${ymd(r.occAt)} ${hm(r.occAt)} · ${fmtRel(r.occAt)}
          <span class="chip ${TAGS[r.tag]?.cls || 'gray'}">${TAGS[r.tag]?.label || '其他'}</span>
          ${r.level === 'high' ? '<span class="chip danger">紧急重要</span>' : ''}
          ${r.repeat && r.repeat !== 'none' ? `<span class="chip gray">${REPEATS.find(x => x.v === r.repeat)?.t}</span>` : ''}
        </div>
      </div>
    </div>`).join('') : emptyBox('暂无事项')}
  </div></div>`;
}

export function openDetail(id) {
  const r = S().reminders.find(x => x.id === id); if (!r) return;
  const at = nextOccurrence(r, startOfDay(new Date()));
  modal({
    title: r.title,
    body: `<div class="row" style="gap:8px;margin-bottom:10px">
        <span class="chip ${TAGS[r.tag]?.cls}">${TAGS[r.tag]?.label}</span>
        <span class="chip ${LEVELS[r.level]?.cls}">${LEVELS[r.level]?.label}</span>
        <span class="chip gray">${REPEATS.find(x => x.v === (r.repeat || 'none'))?.t}</span>
        ${r.done ? '<span class="chip ok">已完成</span>' : ''}
      </div>
      <p><strong>时间：</strong>${ymd(at)} ${hm(at)}（${fmtRel(at)}）</p>
      <p><strong>提前提醒：</strong>${ADVANCES.find(a => a.v === (r.advance ?? 0))?.t || r.advance + ' 分钟前'}</p>
      ${r.note ? `<p style="margin-top:8px;white-space:pre-wrap">${esc(r.note)}</p>` : ''}`,
    foot: `<button class="btn danger" id="delRem">删除</button><div class="spacer"></div>
      <button class="btn" id="toggleRem">${r.done ? '标记未完成' : '标记完成'}</button>
      <button class="btn solid" id="editRem">编辑</button>`,
    onOpen: (b, close) => {
      document.getElementById('delRem').onclick = () => { close(); confirmDlg('确定删除该提醒？', () => { store.remove('reminders', id); toast('已删除'); rerender(); }); };
      document.getElementById('toggleRem').onclick = () => { close(); toggleDone(id); };
      document.getElementById('editRem').onclick = () => { close(); openReminderForm(r); };
    }
  });
}

// 供其他模块创建提醒
export function quickCreate(title, at, tag = 'research', extra = {}) {
  return store.add('reminders', { title, at: new Date(at).toISOString(), tag, level: extra.level || 'mid', repeat: extra.repeat || 'none', advance: extra.advance ?? 1440, note: extra.note || '', done: false });
}
