// ============ 课程表：周次基准 · 录入 · 导入 · 冲突检测 ============
import { store, S } from '../store.js';
import { $, $$, esc, ymd, addDays, startOfWeek, startOfDay, diffDays, WEEK_CN, uid, download, clamp } from '../utils.js';
import { formModal, toast, confirmDlg, emptyBox, modal } from '../ui.js';

// 上海交通大学学生上课时间表（依据你上传的图片同步）
// 第 1–12 节，每节 45min，课间休息 10min；午休与晚间同样排课。
export const SECTION_TIME = [
  ['08:00', '08:45'], ['08:55', '09:40'], ['10:00', '10:45'], ['10:55', '11:40'],
  ['12:00', '12:45'], ['12:55', '13:40'], ['14:00', '14:45'], ['14:55', '15:40'],
  ['16:00', '16:45'], ['16:55', '17:40'], ['18:00', '18:45'], ['18:55', '19:40']
];
const COLORS = ['#1565c0', '#0e9a99', '#7a5af8', '#e0568b', '#d98314', '#1aa06d', '#4d9bea', '#c2410c'];

export function currentWeek(sem, date = new Date()) {
  if (!sem?.startDate) return 0;
  const s = startOfWeek(new Date(sem.startDate + 'T00:00'));
  const w = Math.floor(diffDays(date, s) / 7) + 1;
  return (w >= 1 && w <= (sem.weeks || 20)) ? w : (w < 1 ? 0 : -1);
}
export function weekRange(sem, w) {
  const s = addDays(startOfWeek(new Date(sem.startDate + 'T00:00')), (w - 1) * 7);
  return [s, addDays(s, 6)];
}
export function courseOccursOn(c, date, week) {
  const day = ((new Date(date).getDay() + 6) % 7) + 1; // 1=周一
  if (c.day !== day) return false;
  if (week < c.weekFrom || week > c.weekTo) return false;
  if (c.parity === 'odd' && week % 2 === 0) return false;
  if (c.parity === 'even' && week % 2 === 1) return false;
  return true;
}
export function conflicts(courses) {
  const bad = new Set();
  for (let i = 0; i < courses.length; i++) for (let j = i + 1; j < courses.length; j++) {
    const a = courses[i], b = courses[j];
    if (a.day !== b.day) continue;
    if (a.endSec < b.startSec || b.endSec < a.startSec) continue;
    if (a.weekTo < b.weekFrom || b.weekTo < a.weekFrom) continue;
    if ((a.parity === 'odd' && b.parity === 'even') || (a.parity === 'even' && b.parity === 'odd')) continue;
    bad.add(a.id); bad.add(b.id);
  }
  return bad;
}

let viewWeek = 0, host = null;
export function render(el) { host = el; viewWeek = viewWeek || Math.max(1, currentWeek(S().semester) || 1); rerender(); }

function rerender() {
  if (!host) return;
  const st = S(); const sem = st.semester;
  const cw = currentWeek(sem);
  const [ws, we] = sem.startDate ? weekRange(sem, viewWeek) : [null, null];
  const bad = conflicts(st.courses);
  host.innerHTML = `
  <div class="row" style="margin-bottom:14px">
    <div class="card" style="padding:10px 14px;display:flex;gap:14px;align-items:center;flex-wrap:wrap">
      <div><div class="small muted">当前学期</div><strong>${esc(sem.name || '未命名')}</strong></div>
      <div><div class="small muted">第一周起始（周一）</div><strong>${sem.startDate || '未设置'}</strong></div>
      <div><div class="small muted">总周数</div><strong>${sem.weeks} 周</strong></div>
      <div><div class="small muted">本周</div><strong>${cw > 0 ? '第 ' + cw + ' 周' : cw === 0 ? '学期未开始' : '学期已结束'}</strong></div>
      <button class="btn" id="semBtn">设置学期基准</button>
    </div>
    <div class="spacer"></div>
    <button class="btn" id="tplBtn">下载导入模板</button>
    <button class="btn" id="impBtn">批量导入</button>
    <button class="btn" id="syncBoardBtn">同步到看板</button>
    <button class="primary-btn" id="addBtn">＋ 添加课程</button>
  </div>

  <div class="row" style="margin-bottom:10px">
    <button class="btn" id="pw">‹ 上一周</button>
    <strong>第 ${viewWeek} 周${ws ? ` · ${ymd(ws)} ~ ${ymd(we)}` : ''}</strong>
    <button class="btn" id="nw">下一周 ›</button>
    <input type="range" min="1" max="${sem.weeks}" value="${viewWeek}" id="wkRange" style="width:180px">
    <button class="btn" id="cwBtn">回到本周</button>
    ${bad.size ? `<span class="chip danger">检测到 ${bad.size} 门课程时间冲突</span>` : '<span class="chip ok">无时间冲突</span>'}
  </div>

  <div class="tt-wrap">${tableHTML(viewWeek, bad)}</div>

  <div class="card" style="margin-top:16px">
    <div class="card-head"><h3>📋 全部课程（${st.courses.length}）</h3></div>
    <div class="card-body">${st.courses.length ? st.courses.slice().sort((a, b) => a.day - b.day || a.startSec - b.startSec).map(c => `
      <div class="list-item">
        <span style="width:8px;height:34px;border-radius:4px;background:${c.color || '#1565c0'}"></span>
        <div style="flex:1">
          <div class="t">${esc(c.name)} ${bad.has(c.id) ? '<span class="chip danger">冲突</span>' : ''}</div>
          <div class="s">${WEEK_CN[c.day % 7]} 第 ${c.startSec}-${c.endSec} 节 · ${SECTION_TIME[c.startSec - 1]?.[0]}-${SECTION_TIME[c.endSec - 1]?.[1]} · 第 ${c.weekFrom}-${c.weekTo} 周${c.parity === 'odd' ? '（单周）' : c.parity === 'even' ? '（双周）' : ''} · ${esc(c.teacher || '—')} · ${esc(c.room || '—')}</div>
        </div>
        <button class="btn sm" data-edit="${c.id}">编辑</button>
        <button class="btn sm danger" data-del="${c.id}">删除</button>
      </div>`).join('') : emptyBox('还没有课程，点击右上角「添加课程」或用模板批量导入', '📚')}
    </div>
  </div>`;

  $('#semBtn').onclick = openSemesterForm;
  $('#addBtn').onclick = () => openCourseForm();
  $('#tplBtn').onclick = downloadTemplate;
  $('#impBtn').onclick = openImport;
  $('#syncBoardBtn').onclick = () => { const n = syncToBoard(true); toast(`已同步 ${n} 条课程待办到看板`, 'ok'); };
  $('#pw').onclick = () => { viewWeek = clamp(viewWeek - 1, 1, sem.weeks); rerender(); };
  $('#nw').onclick = () => { viewWeek = clamp(viewWeek + 1, 1, sem.weeks); rerender(); };
  $('#cwBtn').onclick = () => { viewWeek = Math.max(1, cw || 1); rerender(); };
  $('#wkRange').oninput = e => { viewWeek = Number(e.target.value); rerender(); };
  host.onclick = e => {
    const ed = e.target.closest('[data-edit]'); if (ed) return openCourseForm(S().courses.find(c => c.id === ed.dataset.edit));
    const dl = e.target.closest('[data-del]'); if (dl) return confirmDlg('确定删除该课程？', () => { store.remove('courses', dl.dataset.del); rerender(); });
    const cc = e.target.closest('[data-course]'); if (cc) return openCourseForm(S().courses.find(c => c.id === cc.dataset.course));
  };
}

function tableHTML(week, bad) {
  const st = S();
  let html = `<table class="tt"><tr><th>节次</th>${WEEK_CN.slice(1).concat(WEEK_CN[0]).map((d, i) => {
    const dt = st.semester.startDate ? addDays(weekRange(st.semester, week)[0], i) : null;
    return `<th>${d}${dt ? `<div class="small muted" style="font-weight:400">${dt.getMonth() + 1}/${dt.getDate()}</div>` : ''}</th>`;
  }).join('')}</tr>`;
  for (let sec = 1; sec <= (st.semester.sections || 12); sec++) {
    const [s0, e0] = SECTION_TIME[sec - 1] || [];
    html += `<tr><td class="tt-sec"><b>第 ${sec} 节</b><span class="small">${s0 || '--'}<br>${e0 || '--'}</span></td>`;
    for (let day = 1; day <= 7; day++) {
      const cs = st.courses.filter(c => c.day === day && c.startSec === sec && week >= c.weekFrom && week <= c.weekTo
        && !(c.parity === 'odd' && week % 2 === 0) && !(c.parity === 'even' && week % 2 === 1));
      html += `<td>${cs.map(c => {
        const span = c.endSec - c.startSec + 1;
        return `<div class="tt-course ${bad.has(c.id) ? 'conflict' : ''}" data-course="${c.id}" style="border-left-color:${c.color};min-height:${span * 34}px">
          <b>${esc(c.name)}</b>${esc(c.room || '')}<br>${esc(c.teacher || '')}<div class="small">${SECTION_TIME[c.startSec - 1]?.[0]}-${SECTION_TIME[c.endSec - 1]?.[1]}</div></div>`;
      }).join('')}</td>`;
    }
    html += '</tr>';
  }
  return html + '</table>';
}

function openSemesterForm() {
  const sem = S().semester;
  formModal({
    title: '学期周次基准设置',
    fields: [
      { key: 'name', label: '学期名称', value: sem.name, span: 'full', placeholder: '如 2026 秋季学期' },
      { key: 'startDate', label: '第一周的周一日期', type: 'date', required: true, value: sem.startDate, hint: '系统据此自动推算全学期周次与日期的对应关系' },
      { key: 'weeks', label: '学期总周数', type: 'number', value: sem.weeks, min: 1, max: 40 },
      { key: 'sections', label: '每日节次数', type: 'number', value: sem.sections, min: 4, max: 12 }
    ],
    onSubmit: d => {
      store.update(s => { s.semester = { ...s.semester, ...d, weeks: Number(d.weeks) || 20, sections: Number(d.sections) || 12 }; });
      viewWeek = Math.max(1, currentWeek(S().semester) || 1);
      toast('学期基准已保存', 'ok'); rerender();
    }
  });
}

export function openCourseForm(rec = null) {
  const sem = S().semester;
  formModal({
    title: rec ? '编辑课程' : '添加课程',
    fields: [
      { key: 'name', label: '课程名称', required: true, value: rec?.name || '', span: 'full' },
      { key: 'teacher', label: '授课老师', value: rec?.teacher || '' },
      { key: 'room', label: '上课教室', value: rec?.room || '' },
      { key: 'day', label: '星期', type: 'select', value: rec?.day || 1, options: [1, 2, 3, 4, 5, 6, 7].map(v => ({ v, t: WEEK_CN[v % 7] })) },
      { key: 'parity', label: '单双周', type: 'select', value: rec?.parity || 'all', options: [{ v: 'all', t: '每周' }, { v: 'odd', t: '仅单周' }, { v: 'even', t: '仅双周' }] },
      { key: 'startSec', label: '开始节次', type: 'select', value: rec?.startSec || 1, options: SECTION_TIME.map((t, i) => ({ v: i + 1, t: `第 ${i + 1} 节 (${t[0]})` })) },
      { key: 'endSec', label: '结束节次', type: 'select', value: rec?.endSec || 2, options: SECTION_TIME.map((t, i) => ({ v: i + 1, t: `第 ${i + 1} 节 (${t[1]})` })) },
      { key: 'weekFrom', label: '起始周次', type: 'number', value: rec?.weekFrom || 1, min: 1, max: sem.weeks },
      { key: 'weekTo', label: '结束周次', type: 'number', value: rec?.weekTo || sem.weeks, min: 1, max: sem.weeks, hint: '短课程可设为如 3 - 6 周' },
      { key: 'note', label: '备注', type: 'textarea', span: 'full', value: rec?.note || '' }
    ],
    onSubmit: d => {
      const data = {
        ...d, day: Number(d.day), startSec: Number(d.startSec), endSec: Math.max(Number(d.startSec), Number(d.endSec)),
        weekFrom: Number(d.weekFrom), weekTo: Math.max(Number(d.weekFrom), Number(d.weekTo)),
        color: rec?.color || COLORS[S().courses.length % COLORS.length]
      };
      if (rec) store.patch('courses', rec.id, data); else store.add('courses', data);
      syncToBoard();
      toast('已保存', 'ok'); rerender();
    }
  });
}

// ---- 导入 / 模板 ----
const TPL_HEAD = '课程名称,授课老师,上课教室,星期(1-7),开始节次,结束节次,起始周次,结束周次,单双周(all/odd/even)';
function downloadTemplate() {
  const csv = '\ufeff' + TPL_HEAD + '\n' +
    '机器学习前沿,张老师,教三-402,1,3,4,1,16,all\n' +
    '学术英语写作,李老师,文科楼-201,3,5,6,3,8,all\n' +
    '三维视觉专题,王老师,信息楼-508,5,7,8,1,16,odd\n';
  download('课程表导入模板.csv', csv, 'text/csv');
  toast('模板已下载，可用 Excel 直接编辑', 'ok');
}
function openImport() {
  modal({
    title: '批量导入课程', wide: true,
    body: `<p class="small muted">支持三种方式：① 上传按模板填写的 CSV/Excel 文件；② 直接从 Excel 复制整块单元格粘贴到下方；③ 手动按格式输入。<br>列顺序：<code>${TPL_HEAD}</code></p>
      <div class="row" style="margin:10px 0"><input type="file" id="impFile" accept=".csv,.txt,.xlsx,.xls"><button class="btn" id="dlTpl">下载模板</button></div>
      <textarea id="impText" style="min-height:180px" placeholder="课程名称,授课老师,上课教室,星期,开始节次,结束节次,起始周次,结束周次,单双周&#10;机器学习前沿,张老师,教三-402,1,3,4,1,16,all"></textarea>
      <label class="fld" style="flex-direction:row;align-items:center;gap:8px;margin-top:8px"><input type="checkbox" id="impClear"><span>导入前清空现有课程</span></label>`,
    foot: '<button class="btn" data-close>取消</button><button class="btn solid" id="doImp">开始导入</button>',
    onOpen: (b, close) => {
      b.querySelector('#dlTpl').onclick = downloadTemplate;
      b.querySelector('#impFile').onchange = async e => {
        const f = e.target.files[0]; if (!f) return;
        if (/\.xlsx?$/i.test(f.name)) {
          try {
            const XLSX = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm');
            const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
            const rows = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]);
            b.querySelector('#impText').value = rows;
            toast('Excel 解析成功，请检查后导入', 'ok');
          } catch { toast('Excel 解析需要联网，请改用 CSV 模板', 'err'); }
        } else {
          b.querySelector('#impText').value = await f.text();
        }
      };
      b.querySelector('#doImp').onclick = () => {
        const txt = b.querySelector('#impText').value.trim();
        if (!txt) return toast('请先粘贴或上传数据', 'err');
        if (b.querySelector('#impClear').checked) store.update(s => s.courses = []);
        let ok = 0, fail = 0;
        txt.split(/\r?\n/).forEach((line, i) => {
          if (!line.trim()) return;
          const cells = line.split(/[,\t]/).map(x => x.trim().replace(/^"|"$/g, ''));
          if (i === 0 && /课程名称|name/i.test(cells[0])) return;
          const [name, teacher, room, day, s1, s2, w1, w2, parity] = cells;
          if (!name || !day) { fail++; return; }
          store.add('courses', {
            name, teacher: teacher || '', room: room || '',
            day: clamp(Number(day) || 1, 1, 7),
            startSec: clamp(Number(s1) || 1, 1, 12), endSec: clamp(Number(s2) || Number(s1) || 1, 1, 12),
            weekFrom: Number(w1) || 1, weekTo: Number(w2) || S().semester.weeks,
            parity: ['odd', 'even'].includes((parity || '').toLowerCase()) ? parity.toLowerCase() : 'all',
            color: COLORS[(ok + S().courses.length) % COLORS.length]
          });
          ok++;
        });
        close(); syncToBoard();
        toast(`导入完成：成功 ${ok} 条${fail ? `，失败 ${fail} 条` : ''}`, ok ? 'ok' : 'err');
        rerender();
      };
    }
  });
}

// ---- 同步到看板：为未来两周内的课程生成待办 ----
export function syncToBoard(manual = false) {
  const st = S(); const cw = currentWeek(st.semester);
  if (cw <= 0 || !st.courses.length) return 0;
  let n = 0;
  for (let w = cw; w <= Math.min(cw + 1, st.semester.weeks); w++) {
    const [ws] = weekRange(st.semester, w);
    st.courses.forEach(c => {
      for (let i = 0; i < 7; i++) {
        const d = addDays(ws, i);
        if (!courseOccursOn(c, d, w)) continue;
        if (d < startOfDay(new Date())) continue;
        const key = `course:${c.id}:${ymd(d)}`;
        if (st.board.tasks.some(t => t.srcKey === key)) continue;
        store.add('board.tasks', {
          col: 'course', title: `${c.name}（第 ${w} 周）`,
          note: `${WEEK_CN[c.day % 7]} 第 ${c.startSec}-${c.endSec} 节 ${SECTION_TIME[c.startSec - 1]?.[0]}-${SECTION_TIME[c.endSec - 1]?.[1]}｜${c.room || ''}｜${c.teacher || ''}`,
          due: `${ymd(d)}T${SECTION_TIME[c.startSec - 1]?.[0] || '08:00'}`,
          priority: 'mid', done: false, srcKey: key, auto: true
        });
        n++;
      }
    });
  }
  return n;
}
