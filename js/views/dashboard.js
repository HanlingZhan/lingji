// ============ 首页工作台：可自由拖拽的模块化面板 ============
import { store, S, DEFAULT_DASH } from '../store.js';
import { $, $$, esc, ymd, hm, fmtRel, fmtAgo, diffDays, weekdayCN, TAGS, addDays } from '../utils.js';
import { modal, toast, emptyBox, enableSort, confirmDlg } from '../ui.js';
import { upcoming, longTerm, overdue, openReminderForm, openDetail } from './calendar.js';
import { upcomingAnnis, anniInfo, predictNext } from './anniversary.js';
import { todayFeed, feedMeta, runFetch } from './papers.js';
import { todayCards, todayStats, ensureToday } from './words.js';
import { summary as boardSummary, openTaskForm } from './board.js';
import { currentWeek, courseOccursOn, SECTION_TIME, weekRange } from './schedule.js';
import { nearestDeadlines, ensureLoaded, topNews } from './news.js';

let host = null;

export function render(el) {
  host = el; ensureToday(); ensureLoaded();
  const st = S();
  const hero = heroHTML(st);
  const order = st.dashboard.order.filter(id => DEFAULT_DASH.some(d => d.id === id));
  DEFAULT_DASH.forEach(d => { if (!order.includes(d.id)) order.push(d.id); });
  const hidden = st.dashboard.hidden || [];
  el.innerHTML = hero + `<div class="dash" id="dash">${order.filter(id => !hidden.includes(id)).map(id => widgetHTML(id)).join('')}</div>`;

  enableSort($('#dash'), '.widget', ids => {
    store.update(s => { s.dashboard.order = [...ids, ...(s.dashboard.hidden || [])]; });
    toast('布局已保存');
  });
  bindEvents(el);
}

function heroHTML(st) {
  const N = new Date();
  const h = N.getHours();
  const greet = h < 6 ? '凌晨还在忙，注意休息' : h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : h < 23 ? '晚上好' : '夜深了';
  const wk = currentWeek(st.semester);
  const up = upcoming(1).filter(x => !x.done).length;
  const od = overdue().length;
  const tasks = st.board.tasks.filter(t => !t.done).length;
  const ws = todayStats();
  return `<div class="hero">
    <div>
      <h2>${greet}，${esc(st.profile.nickname)} 👋</h2>
      <p>${ymd(N)} ${weekdayCN(N)}${wk > 0 ? ` · 教学第 ${wk} 周` : ''} · ${esc(st.profile.field)}</p>
      <div class="row" style="margin-top:10px">
        <button class="btn sm" data-act="newRem" style="background:rgba(255,255,255,.18);border:0;color:#fff">＋ 提醒</button>
        <button class="btn sm" data-act="newTask" style="background:rgba(255,255,255,.18);border:0;color:#fff">＋ 任务</button>
        <button class="btn sm" data-act="fetchPapers" style="background:rgba(255,255,255,.18);border:0;color:#fff">⬇ 抓取论文</button>
        <button class="btn sm" data-act="cfg" style="background:rgba(255,255,255,.18);border:0;color:#fff">⚙ 自定义首页</button>
      </div>
    </div>
    <div class="hero-stats">
      <div><b>${up}</b><span>今明待办</span></div>
      <div><b>${od}</b><span>已逾期</span></div>
      <div><b>${tasks}</b><span>进行中任务</span></div>
      <div><b>${ws.newToday + ws.due}</b><span>今日单词</span></div>
    </div>
  </div>`;
}

const W = {
  todo: () => {
    const items = upcoming(3).filter(x => !x.done);
    const od = overdue();
    return card('todo', '⏳ 近期待办', `<span class="chip ${od.length ? 'danger' : 'gray'}">${od.length ? od.length + ' 项逾期' : items.length + ' 项'}</span>`,
      [...od.map(r => row(r, true)), ...items.map(r => row(r))].join('') || emptyBox('近期没有待办，享受片刻轻松'),
      '<button class="btn sm" data-act="newRem">＋</button><button class="btn sm" data-go="calendar">全部</button>');
  },
  longterm: () => {
    const items = longTerm(7).slice(0, 8);
    return card('longterm', '🎯 远期重要事项', `<span class="chip gray">${items.length}</span>`,
      items.map(r => `<div class="list-item"><div style="flex:1;cursor:pointer" data-rem="${r.id}">
        <div class="t">${esc(r.title)}</div>
        <div class="s">${ymd(r.occAt)} · <b style="color:var(--blue-600)">${fmtRel(r.occAt)}</b>
        <span class="chip ${TAGS[r.tag]?.cls || 'gray'}">${TAGS[r.tag]?.label || ''}</span>
        ${r.level === 'high' ? '<span class="chip danger">重要</span>' : ''}</div></div></div>`).join('') || emptyBox('暂无远期事项'),
      '<button class="btn sm" data-go="calendar">日历</button>');
  },
  anni: () => {
    const list = upcomingAnnis(4);
    return card('anni', '💝 纪念日倒计时', '',
      list.map(({ a, i }) => `<div class="list-item"><div style="width:56px;text-align:center">
        <b style="font-size:20px;color:var(--pink)">${i.left}</b><div class="small muted">天后</div></div>
        <div style="flex:1"><div class="t">${a.pinned ? '📌 ' : ''}${esc(a.title)}</div>
        <div class="s">${ymd(i.next)} ${i.label ? '· ' + i.label : ''}${i.passed > 0 ? ` · 已相伴 ${i.passed} 天` : ''}</div></div></div>`).join('') || emptyBox('还没有纪念日', '💝'),
      '<button class="btn sm" data-go="anniversary">管理</button>');
  },
  cycle: () => {
    const p = predictNext(S().cycle);
    return card('cycle', '🌸 生理周期预测', p ? `<span class="chip pink">${fmtRel(p.start)}</span>` : '',
      p ? `<div style="text-align:center;padding:6px 0">
        <div style="font-size:26px;font-weight:700;color:var(--pink)">${ymd(p.start)}</div>
        <div class="small muted">预计开始 · 持续约 ${p.dur} 天 · 平均周期 ${p.avg} 天</div>
        <div class="progress" style="margin-top:10px"><i style="width:${Math.max(3, 100 - Math.min(100, Math.max(0, diffDays(p.start, new Date())) / p.avg * 100))}%;background:linear-gradient(90deg,var(--pink),#f7b0cd)"></i></div>
        <div class="small muted" style="margin-top:6px">预计排卵日 ${ymd(p.ovulation)}</div></div>`
        : emptyBox('记录一次起始日期即可开启预测', '🌸'),
      '<button class="btn sm" data-go="anniversary">记录</button>');
  },
  word: () => {
    const cards = todayCards(2); const s = todayStats();
    return card('word', '🔤 今日单词', `<span class="chip">${s.newToday} 新 · ${s.due} 复习</span>`,
      cards.map(({ word }) => `<div style="padding:8px 0;border-bottom:1px dashed var(--line)">
        <div class="row"><b style="font-size:16px;color:var(--blue-700)">${esc(word.w)}</b><span class="small muted">${esc(word.p || '')}</span></div>
        <div class="small">${esc(word.m)}</div>
        <div class="small" style="color:var(--blue-600)">💡 ${esc(word.n || word.r || '')}</div></div>`).join('') || emptyBox('今日单词已学完 🎉'),
      '<button class="btn sm solid" data-go="words">开始学习</button>');
  },
  papers: () => {
    const items = todayFeed(4); const meta = feedMeta();
    return card('papers', '📄 今日论文推送', `<span class="chip gray">${meta.at ? fmtAgo(meta.at) : '未抓取'}</span>`,
      items.map(p => `<div class="list-item"><div style="flex:1">
        <div class="t"><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.title)}</a></div>
        <div class="s"><span class="score ${p.score >= 70 ? 'hi' : ''}">${p.score}</span>
        <span class="source-tag">${esc(p.source)}</span> ${(p.hits || []).slice(0, 3).map(h => `<span class="chip">${esc(h)}</span>`).join('')}
        <span class="muted">${esc(p.published || '')}</span></div></div></div>`).join('') || emptyBox('点击「抓取」获取今日匹配论文', '📄'),
      '<button class="btn sm" data-act="fetchPapers">⬇ 更新</button><button class="btn sm" data-go="papers">全部</button>');
  },
  board: () => {
    const s = boardSummary();
    return card('board', '🗂️ 看板概览', '',
      `<div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
      ${s.map(c => `<div class="card" style="padding:10px 12px;cursor:pointer" data-go="board">
        <div class="small muted">${c.icon} ${c.name}</div>
        <div class="row" style="align-items:baseline"><b style="font-size:20px;color:var(--blue-700)">${c.open}</b><span class="small muted">/ ${c.total}</span></div>
        <div class="progress" style="margin-top:5px"><i style="width:${c.total ? ((c.total - c.open) / c.total * 100).toFixed(0) : 0}%"></i></div>
      </div>`).join('')}</div>`,
      '<button class="btn sm" data-act="newTask">＋</button>');
  },
  course: () => {
    const st = S(); const wk = currentWeek(st.semester); const N = new Date();
    const today = wk > 0 ? st.courses.filter(c => courseOccursOn(c, N, wk)).sort((a, b) => a.startSec - b.startSec) : [];
    const tomorrow = wk > 0 ? st.courses.filter(c => courseOccursOn(c, addDays(N, 1), currentWeek(st.semester, addDays(N, 1)))).sort((a, b) => a.startSec - b.startSec) : [];
    return card('course', '📚 今日课程', wk > 0 ? `<span class="chip teal">第 ${wk} 周</span>` : '<span class="chip gray">未在学期内</span>',
      (today.length ? today.map(c => `<div class="list-item">
        <div style="width:82px" class="small muted">${SECTION_TIME[c.startSec - 1]?.[0]}<br>${SECTION_TIME[c.endSec - 1]?.[1]}</div>
        <div style="flex:1"><div class="t">${esc(c.name)}</div><div class="s">${esc(c.room || '')} · ${esc(c.teacher || '')} · 第 ${c.startSec}-${c.endSec} 节</div></div></div>`).join('')
        : emptyBox('今天没有课 🎉', '📚'))
      + (tomorrow.length ? `<div class="small muted" style="margin-top:8px">明日：${tomorrow.map(c => esc(c.name)).join('、')}</div>` : ''),
      '<button class="btn sm" data-go="schedule">课表</button>');
  },
  news: () => {
    const dl = nearestDeadlines(3); const ns = topNews(3);
    return card('news', '📡 AI 前沿与顶会节点', '',
      `${dl.map(v => `<div class="list-item"><div style="flex:1"><div class="t">${v.id} 投稿截止</div>
        <div class="s">${ymd(v.next)} · ${esc(v.area)}</div></div><span class="chip ${v.left <= 14 ? 'danger' : v.left <= 45 ? 'warn' : 'gray'}">${v.left} 天</span></div>`).join('')}
       ${ns.map(h => `<div class="list-item"><div style="flex:1"><div class="t"><a href="${esc(h.url)}" target="_blank" rel="noopener">${esc(h.title)}</a></div>
        <div class="s">▲ ${h.points} · HN</div></div></div>`).join('')}`,
      '<button class="btn sm" data-go="news">更多</button>');
  },
  done: () => {
    const done = S().reminders.filter(r => r.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 6);
    const dt = S().board.tasks.filter(t => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 6);
    return card('done', '✅ 已完成事项', `<span class="chip ok">${done.length + dt.length}</span>`,
      [...done.map(r => `<div class="list-item done"><span>✅</span><div style="flex:1"><div class="t">${esc(r.title)}</div>
        <div class="s">${r.doneAt ? fmtAgo(r.doneAt) : ymd(r.at)} · 提醒</div></div></div>`),
      ...dt.map(t => `<div class="list-item done"><span>✅</span><div style="flex:1"><div class="t">${esc(t.title)}</div>
        <div class="s">${t.doneAt ? fmtAgo(t.doneAt) : ''} · ${S().board.cols?.[t.col]?.name || '个人事务'}</div></div></div>`)].join('') || emptyBox('还没有完成的事项'),
      '');
  }
};

function widgetHTML(id) {
  const def = DEFAULT_DASH.find(d => d.id === id);
  const w = S().dashboard.widths?.[id] || def?.w || 'w4';
  const inner = W[id] ? W[id]() : '';
  return inner.replace('<div class="widget"', `<div class="widget ${w}" draggable="true" data-id="${id}"`);
}
function card(id, title, badge, body, actions = '') {
  return `<div class="widget">
    <div class="card-head"><span class="drag" title="拖拽调整位置">⠿</span><h3>${title}</h3>${badge}
      <div class="actions">${actions}<button class="btn sm" data-hide="${id}" title="隐藏此模块">✕</button></div></div>
    <div class="card-body">${body}</div></div>`;
}
function row(r, isOverdue = false) {
  return `<div class="list-item"><input type="checkbox" data-done="${r.id}">
    <div style="flex:1;cursor:pointer" data-rem="${r.id}">
      <div class="t">${esc(r.title)}</div>
      <div class="s">${ymd(r.occAt)} ${hm(r.occAt)} · ${isOverdue ? '<b style="color:var(--danger)">已逾期</b>' : fmtRel(r.occAt)}
        <span class="chip ${TAGS[r.tag]?.cls || 'gray'}">${TAGS[r.tag]?.label || ''}</span>
        ${r.level === 'high' ? '<span class="chip danger">紧急</span>' : ''}</div>
    </div></div>`;
}

function bindEvents(el) {
  el.onclick = async e => {
    const act = e.target.closest('[data-act]');
    if (act) {
      const a = act.dataset.act;
      if (a === 'newRem') openReminderForm();
      if (a === 'newTask') openTaskForm();
      if (a === 'cfg') openConfig();
      if (a === 'fetchPapers') { toast('正在更新论文…'); await runFetch('cloud'); render(el); }
      return;
    }
    const go = e.target.closest('[data-go]'); if (go) { window.SH.go(go.dataset.go); return; }
    const hide = e.target.closest('[data-hide]');
    if (hide) { store.update(s => { s.dashboard.hidden = [...(s.dashboard.hidden || []), hide.dataset.hide]; }); toast('已隐藏，可在「自定义首页」恢复'); render(el); return; }
    const chk = e.target.closest('[data-done]');
    if (chk) { const r = S().reminders.find(x => x.id === chk.dataset.done); store.patch('reminders', r.id, { done: true, doneAt: Date.now() }); render(el); return; }
    const rem = e.target.closest('[data-rem]'); if (rem) openDetail(rem.dataset.rem);
  };
}

function openConfig() {
  const st = S(); const hidden = st.dashboard.hidden || [];
  const order = [...st.dashboard.order.filter(id => DEFAULT_DASH.some(d => d.id === id))];
  DEFAULT_DASH.forEach(d => { if (!order.includes(d.id)) order.push(d.id); });
  modal({
    title: '自定义首页布局',
    body: `<p class="small muted">拖拽调整顺序，勾选控制显示，右侧选择模块宽度。</p>
    <div id="cfgList" style="margin-top:10px">
      ${order.map(id => {
      const d = DEFAULT_DASH.find(x => x.id === id);
      const w = st.dashboard.widths?.[id] || d.w;
      return `<div class="w-cfg-item" draggable="true" data-id="${id}">
        <span class="drag">⠿</span>
        <input type="checkbox" data-vis="${id}" ${hidden.includes(id) ? '' : 'checked'}>
        <span style="flex:1">${esc(d.name)}</span>
        <select data-w="${id}" style="width:110px">
          ${[['w4', '1/3 宽'], ['w6', '1/2 宽'], ['w8', '2/3 宽'], ['w12', '整行']].map(([v, t]) => `<option value="${v}" ${w === v ? 'selected' : ''}>${t}</option>`).join('')}
        </select></div>`;
    }).join('')}
    </div>`,
    foot: '<button class="btn" id="cfgReset">恢复默认</button><div class="spacer"></div><button class="btn" data-close>取消</button><button class="btn solid" id="cfgSave">保存</button>',
    onOpen: (b, close) => {
      enableSort(b.querySelector('#cfgList'), '.w-cfg-item', () => { });
      b.querySelector('#cfgSave').onclick = () => {
        const ids = Array.from(b.querySelectorAll('.w-cfg-item')).map(x => x.dataset.id);
        const hid = ids.filter(id => !b.querySelector(`[data-vis="${id}"]`).checked);
        const widths = {}; ids.forEach(id => widths[id] = b.querySelector(`[data-w="${id}"]`).value);
        store.update(s => { s.dashboard = { order: ids, hidden: hid, widths }; });
        close(); toast('首页布局已更新', 'ok'); render(host);
      };
      b.querySelector('#cfgReset').onclick = () => {
        store.update(s => { s.dashboard = { order: DEFAULT_DASH.map(d => d.id), hidden: [], widths: {} }; });
        close(); render(host);
      };
    }
  });
}
