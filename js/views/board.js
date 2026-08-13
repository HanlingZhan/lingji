// ============ 多分区个人事项看板 ============
import { store, S } from '../store.js';
import { $, $$, esc, ymd, hm, fmtRel, toLocalInput, diffDays, download, BOARD_TAGS } from '../utils.js';
import { formModal, toast, confirmDlg, emptyBox, modal } from '../ui.js';
import { quickCreate } from './calendar.js';

const PRI = { high: { t: '高', c: 'danger' }, mid: { t: '中', c: 'warn' }, low: { t: '低', c: 'ok' } };
let host = null, showDone = false, dragId = null;

export function render(el) { host = el; rerender(); }

function rerender() {
  if (!host) return;
  const st = S(), b = st.board;
  const stats = b.order.map(k => ({ k, n: b.tasks.filter(t => t.col === k && !t.done).length }));
  host.innerHTML = `
  <div class="row" style="margin-bottom:14px">
    <div class="stat-row" style="flex:1;display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr))">
      ${stats.map(s => `<div class="stat"><b>${s.n}</b><span>${b.cols[s.k].icon} ${b.cols[s.k].name}</span></div>`).join('')}
    </div>
  </div>
  <div class="row" style="margin-bottom:12px">
    <label class="row" style="gap:6px"><input type="checkbox" id="showDone" ${showDone ? 'checked' : ''}><span class="small">显示已归档</span></label>
    <span class="small muted">拖拽卡片可跨分区移动与排序；拖拽分区标题可调整板块顺序</span>
    <div class="spacer"></div>
    <button class="btn" id="expBtn">导出看板</button>
    <button class="btn" id="clearDone">清理已归档</button>
    <button class="primary-btn" id="addTask">＋ 新建任务</button>
  </div>
  <div class="board" id="board">
    ${b.order.map(k => colHTML(k)).join('')}
  </div>`;

  $('#addTask').onclick = () => openTaskForm();
  $('#showDone').onchange = e => { showDone = e.target.checked; rerender(); };
  $('#clearDone').onclick = () => confirmDlg('确定清理所有已归档任务？此操作不可撤销。', () => {
    store.update(s => s.board.tasks = s.board.tasks.filter(t => !t.done)); toast('已清理'); rerender();
  });
  $('#expBtn').onclick = () => {
    const lines = ['分区,任务,截止时间,优先级,状态,备注'];
    S().board.tasks.forEach(t => lines.push([S().board.cols[t.col].name, t.title, t.due || '', PRI[t.priority]?.t || '', t.done ? '已完成' : '进行中', (t.note || '').replace(/[\n,]/g, ' ')].map(x => `"${x}"`).join(',')));
    download('看板任务导出.csv', '\ufeff' + lines.join('\n'), 'text/csv');
  };
  bindDnD(); bindTouchDnD();
  host.onclick = e => {
    const c = e.target.closest('[data-chk]'); if (c) { toggle(c.dataset.chk); return; }
    const ed = e.target.closest('[data-open]'); if (ed) { openDetail(ed.dataset.open); return; }
    const ad = e.target.closest('[data-addcol]'); if (ad) { openTaskForm(null, ad.dataset.addcol); return; }
  };
}

function colHTML(k) {
  const b = S().board;
  const list = b.tasks.filter(t => t.col === k && (showDone || !t.done))
    .sort((a, b2) => (a.done - b2.done) || (a.order ?? 0) - (b2.order ?? 0) || (new Date(a.due || '2099') - new Date(b2.due || '2099')));
  return `<div class="board-col" data-col="${k}">
    <div class="board-col-head" draggable="true" data-colhead="${k}">
      <span>${b.cols[k].icon}</span><b>${b.cols[k].name}</b>
      <span class="chip gray">${list.filter(t => !t.done).length}</span>
      <div class="spacer"></div>
      <button class="btn sm" data-addcol="${k}">＋</button>
    </div>
    <div class="board-col-body" data-body="${k}">
      ${list.length ? list.map(taskHTML).join('') : `<div class="empty small">拖拽任务到此处</div>`}
    </div>
  </div>`;
}

function taskHTML(t) {
  const dd = t.due ? diffDays(new Date(t.due), new Date()) : null;
  const dueCls = dd === null ? 'gray' : dd < 0 ? 'danger' : dd <= 1 ? 'warn' : 'gray';
  return `<div class="task p-${t.priority || 'mid'} ${t.done ? 'finished' : ''}" draggable="true" data-task="${t.id}">
    <div class="tt"><input type="checkbox" data-chk="${t.id}" ${t.done ? 'checked' : ''}><span data-open="${t.id}" style="cursor:pointer;flex:1">${esc(t.title)}</span></div>
    <div class="meta">
      ${t.due ? `<span class="chip ${dueCls}">🕐 ${ymd(t.due)} ${hm(t.due)}${dd !== null ? ' · ' + fmtRel(t.due) : ''}</span>` : ''}
      <span class="chip ${PRI[t.priority]?.c || 'gray'}">${PRI[t.priority]?.t || '中'}优先</span>
      ${(t.tags || []).map(tg => `<span class="chip tag">#${esc(tg)}</span>`).join('')}
      ${t.files?.length ? `<span class="chip gray">📎 ${t.files.length}</span>` : ''}
      ${t.auto ? '<span class="chip teal">课表同步</span>' : ''}
      ${t.note ? '<span class="chip gray">📝</span>' : ''}
    </div>
  </div>`;
}

function toggle(id) {
  const t = S().board.tasks.find(x => x.id === id);
  store.patch('board.tasks', id, { done: !t.done, doneAt: !t.done ? Date.now() : null });
  rerender();
}

export function openTaskForm(rec = null, col = 'personal') {
  const b = S().board;
  formModal({
    title: rec ? '编辑任务' : '新建任务',
    fields: [
      { key: 'title', label: '任务名称', required: true, span: 'full', value: rec?.title || '' },
      { key: 'col', label: '所属分区', type: 'select', value: rec?.col || col, options: b.order.map(k => ({ v: k, t: b.cols[k].icon + ' ' + b.cols[k].name })) },
      { key: 'priority', label: '优先级', type: 'select', value: rec?.priority || 'mid', options: Object.entries(PRI).map(([v, o]) => ({ v, t: o.t + '优先级' })) },
      { key: 'due', label: '截止时间', type: 'datetime-local', value: rec?.due ? toLocalInput(rec.due) : '' },
      { key: 'remind', label: '同时创建日历提醒', type: 'checkbox', value: false },
      { key: 'tags', label: '标签（用于分类与筛选）', type: 'tagpick', span: 'full', suggest: BOARD_TAGS, value: rec?.tags || [] },
      { key: 'note', label: '详细备注', type: 'textarea', span: 'full', value: rec?.note || '' }
    ],
    extra: `<div style="margin-top:12px"><label class="fld"><span>附件（≤ 2MB / 个，本地保存）</span><input type="file" id="taskFiles" multiple></label>
      <div id="fileList" class="small muted" style="margin-top:6px">${(rec?.files || []).map(f => `📎 ${esc(f.name)}`).join('　') || '未添加附件'}</div></div>`,
    submitText: rec ? '保存' : '创建',
    onSubmit: (d, close) => {
      const files = pendingFiles.length ? [...(rec?.files || []), ...pendingFiles] : (rec?.files || []);
      const data = { title: d.title, col: d.col, priority: d.priority, due: d.due || '', note: d.note, tags: d.tags || [], files };
      if (rec) store.patch('board.tasks', rec.id, data);
      else store.add('board.tasks', { ...data, done: false, order: Date.now() });
      if (d.remind && d.due) quickCreate('【任务】' + d.title, d.due, d.col === 'course' ? 'course' : d.col === 'research' ? 'research' : 'life', { note: d.note });
      pendingFiles = [];
      toast('已保存', 'ok'); rerender();
    }
  });
  pendingFiles = [];
  setTimeout(() => {
    const inp = document.getElementById('taskFiles'); if (!inp) return;
    inp.onchange = async e => {
      for (const f of e.target.files) {
        if (f.size > 2 * 1024 * 1024) { toast(`${f.name} 超过 2MB，已跳过`, 'err'); continue; }
        pendingFiles.push({ name: f.name, type: f.type, data: await toDataURL(f) });
      }
      document.getElementById('fileList').textContent = pendingFiles.map(f => '📎 ' + f.name).join('　');
    };
  }, 50);
}
let pendingFiles = [];
const toDataURL = f => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });

function openDetail(id) {
  const t = S().board.tasks.find(x => x.id === id); if (!t) return;
  const b = S().board;
  modal({
    title: t.title,
    body: `<div class="row" style="gap:8px;margin-bottom:10px">
      <span class="chip">${b.cols[t.col].icon} ${b.cols[t.col].name}</span>
      <span class="chip ${PRI[t.priority]?.c}">${PRI[t.priority]?.t}优先级</span>
      ${t.due ? `<span class="chip gray">🕐 ${ymd(t.due)} ${hm(t.due)}（${fmtRel(t.due)}）</span>` : ''}
      ${t.done ? '<span class="chip ok">已归档</span>' : ''}</div>
      ${t.note ? `<p style="white-space:pre-wrap">${esc(t.note)}</p>` : '<p class="muted small">无备注</p>'}
      ${t.files?.length ? `<div style="margin-top:10px">${t.files.map(f => `<a class="chip" href="${f.data}" download="${esc(f.name)}">📎 ${esc(f.name)}</a>`).join(' ')}</div>` : ''}`,
    foot: `<button class="btn danger" id="delT">删除</button><div class="spacer"></div>
      <button class="btn" id="tgT">${t.done ? '恢复' : '标记完成'}</button><button class="btn solid" id="edT">编辑</button>`,
    onOpen: (bd, close) => {
      document.getElementById('delT').onclick = () => { close(); confirmDlg('删除该任务？', () => { store.remove('board.tasks', id); rerender(); }); };
      document.getElementById('tgT').onclick = () => { close(); toggle(id); };
      document.getElementById('edT').onclick = () => { close(); openTaskForm(t); };
    }
  });
}

// ---- 拖拽：任务跨列 + 列排序 ----
function bindDnD() {
  const board = $('#board'); if (!board) return;
  board.addEventListener('dragstart', e => {
    const t = e.target.closest('[data-task]');
    if (t) { dragId = t.dataset.task; t.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; return; }
    const c = e.target.closest('[data-colhead]');
    if (c) { dragId = 'col:' + c.dataset.colhead; e.dataTransfer.effectAllowed = 'move'; }
  });
  board.addEventListener('dragend', e => { $$('.dragging').forEach(x => x.classList.remove('dragging')); $$('.over').forEach(x => x.classList.remove('over')); dragId = null; });
  board.addEventListener('dragover', e => {
    if (!dragId) return; e.preventDefault();
    const col = e.target.closest('.board-col'); if (!col) return;
    $$('.board-col').forEach(c => c.classList.toggle('over', c === col));
  });
  board.addEventListener('drop', e => {
    e.preventDefault();
    const col = e.target.closest('.board-col'); if (!col || !dragId) return;
    if (dragId.startsWith('col:')) {
      const from = dragId.slice(4), to = col.dataset.col;
      store.update(s => {
        const o = s.board.order.filter(x => x !== from);
        o.splice(o.indexOf(to), 0, from); s.board.order = o;
      });
    } else {
      const target = e.target.closest('[data-task]');
      const list = S().board.tasks.filter(t => t.col === col.dataset.col && !t.done).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      let order = Date.now();
      if (target && target.dataset.task !== dragId) {
        const ti = list.findIndex(x => x.id === target.dataset.task);
        const prev = list[ti - 1]?.order ?? (list[ti]?.order ?? 0) - 1000;
        order = ((list[ti]?.order ?? 0) + prev) / 2;
      }
      store.patch('board.tasks', dragId, { col: col.dataset.col, order });
    }
    dragId = null; rerender();
  });
}

// ---- 触摸拖拽：触屏长按进入拖拽（HTML5 DnD 在手机上不生效） ----
function bindTouchDnD() {
  const board = $('#board'); if (!board) return;
  board.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;            // 桌面仍用 HTML5 DnD
    const task = e.target.closest('[data-task]'); if (!task) return;
    const pid = task.dataset.task, sx = e.clientX, sy = e.clientY;
    let timer = null, started = false, clone = null, offX = 0, offY = 0;
    const begin = () => {
      started = true;
      const r = task.getBoundingClientRect();
      offX = sx - r.left; offY = sy - r.top;
      task.classList.add('dragging');
      clone = task.cloneNode(true);
      clone.style.cssText = `position:fixed;width:${r.width}px;z-index:999;pointer-events:none;opacity:.92;left:${r.left}px;top:${r.top}px`;
      clone.classList.add('dragging');
      document.body.appendChild(clone);
    };
    const up = ev => {
      clearTimeout(timer);
      board.removeEventListener('pointermove', move);
      board.removeEventListener('pointerup', up);
      board.removeEventListener('pointercancel', up);
      if (!started) return;                          // 短按未触发拖拽 → 走原 click 打开详情
      $$('.board-col').forEach(c => c.classList.remove('over'));
      if (clone && clone.parentNode) clone.parentNode.removeChild(clone);
      board.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); }, { capture: true, once: true }); // 抑制拖完后的误触 click
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const col = el && el.closest('.board-col');
      if (col) {
        const target = el.closest('[data-task]');
        const list = S().board.tasks.filter(t => t.col === col.dataset.col && !t.done).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        let order = Date.now();
        if (target && target.dataset.task !== pid) {
          const ti = list.findIndex(x => x.id === target.dataset.task);
          const prev = list[ti - 1]?.order ?? (list[ti]?.order ?? 0) - 1000;
          order = ((list[ti]?.order ?? 0) + prev) / 2;
        }
        store.patch('board.tasks', pid, { col: col.dataset.col, order });
      }
      rerender();
    };
    const move = ev => {
      if (!started) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 8) { clearTimeout(timer); cleanup(); }
        return;
      }
      ev.preventDefault();
      clone.style.left = (ev.clientX - offX) + 'px';
      clone.style.top = (ev.clientY - offY) + 'px';
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const col = el && el.closest('.board-col');
      $$('.board-col').forEach(c => c.classList.toggle('over', c === col));
    };
    const cleanup = () => { board.removeEventListener('pointermove', move); board.removeEventListener('pointerup', up); board.removeEventListener('pointercancel', up); };
    timer = setTimeout(begin, 180);
    board.addEventListener('pointermove', move, { passive: false });
    board.addEventListener('pointerup', up);
    board.addEventListener('pointercancel', up);
  });
}

export function summary() {
  const b = S().board;
  return b.order.map(k => ({ key: k, ...b.cols[k], total: b.tasks.filter(t => t.col === k).length, open: b.tasks.filter(t => t.col === k && !t.done).length }));
}
