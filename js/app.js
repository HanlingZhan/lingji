// ============ 应用入口：路由 / 导航 / 通知引擎 ============
import { $, $$, esc, fmtAgo, uid } from './utils.js';
import { store, S } from './store.js';
import { toast, modal } from './ui.js';
import { checkAll } from './notify.js';

import * as Dashboard from './views/dashboard.js';
import * as Calendar from './views/calendar.js';
import * as Anniversary from './views/anniversary.js';
import * as Papers from './views/papers.js';
import * as News from './views/news.js';
import * as Words from './views/words.js';
import * as Board from './views/board.js';
import * as Schedule from './views/schedule.js';
import * as Fitness from './views/fitness.js';
import * as Jobs from './views/jobs.js';
import * as Settings from './views/settings.js';
import { applyBg } from './views/settings.js';

export const ROUTES = {
  dashboard: { icon: '🏠', name: '工作台', sub: '你的一站式科研与生活中枢', mod: Dashboard, group: '概览', tab: true },
  calendar: { icon: '📅', name: '日历与提醒', sub: '日 / 周 / 月 / 年多视图 · 无限期远期提醒', mod: Calendar, group: '概览', tab: true },
  board: { icon: '🗂️', name: '事项看板', sub: '个人事务 · 课程任务 · 科研进度 · JK', mod: Board, group: '概览', tab: true },
  papers: { icon: '📄', name: '论文抓取', sub: 'arXiv / CVF / OpenReview / PwC / Scholar 定向聚合', mod: Papers, group: '科研', tab: true },
  news: { icon: '📡', name: 'AI 前沿资讯', sub: '行业动态 · 顶会节点 · 开源项目', mod: News, group: '科研' },
  schedule: { icon: '📚', name: '课程表', sub: '按周次录入 · Excel 批量导入 · 冲突检测', mod: Schedule, group: '学习' },
  jobs: { icon: '💼', name: '招聘资讯', sub: '日常大厂实习 · 2029 校招 · 我的追踪', mod: Jobs, group: '学习' },
  words: { icon: '🔤', name: '单词巧记', sub: '六级 / 雅思 / 托福 · 艾宾浩斯复习', mod: Words, group: '学习' },
  anniversary: { icon: '💝', name: '纪念日与礼物', sub: '倒计时 · 生理周期 · 智能礼物推荐', mod: Anniversary, group: '生活', tab: true },
  fitness: { icon: '💪', name: '健身计划', sub: '分阶段减脂 · 食谱与追踪 · 跟练链接', mod: Fitness, group: '生活', tab: true },
  settings: { icon: '⚙️', name: '设置与同步', sub: '多端同步 · 数据备份 · 提醒偏好', mod: Settings, group: '生活' }
};

let current = '';

function renderNav() {
  const groups = {};
  Object.entries(ROUTES).forEach(([k, v]) => { (groups[v.group] = groups[v.group] || []).push([k, v]); });
  $('#mainNav').innerHTML = Object.entries(groups).map(([g, items]) => `
    <div class="nav-group">${g}</div>
    ${items.map(([k, v]) => `<button class="nav-item" data-route="${k}"><span class="ico">${v.icon}</span><span>${v.name}</span><span class="cnt" data-cnt="${k}" hidden></span></button>`).join('')}
  `).join('');
  $('#tabbar').innerHTML = Object.entries(ROUTES).filter(([, v]) => v.tab)
    .map(([k, v]) => `<button data-route="${k}"><span class="ico">${v.icon}</span>${v.name.replace('与提醒', '').replace('事项', '')}</button>`).join('')
    + `<button data-route="more"><span class="ico">⋯</span>更多</button>`;
}

function updateBadges() {
  const st = S();
  const todo = st.reminders.filter(r => !r.done && new Date(r.at) <= Date.now() + 3 * 86400000).length;
  const tasks = st.board.tasks.filter(t => !t.done).length;
  const setCnt = (k, n) => { const e = $(`[data-cnt="${k}"]`); if (!e) return; e.hidden = !n; e.textContent = n; };
  setCnt('calendar', todo); setCnt('board', tasks);
  const unread = st.notifications.filter(n => !n.read).length;
  const b = $('#bellBadge'); b.hidden = !unread; b.textContent = unread > 99 ? '99+' : unread;
}

export function go(route, params = {}) {
  if (route === 'more') { openMore(); return; }
  if (!ROUTES[route]) route = 'dashboard';
  current = route;
  location.hash = '#/' + route;
  const r = ROUTES[route];
  $('#pageTitle').textContent = r.name;
  $('#pageSub').textContent = r.sub;
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.route === route));
  $$('#tabbar button').forEach(b => b.classList.toggle('active', b.dataset.route === route));
  const view = $('#view'); view.innerHTML = '';
  r.mod.render(view, params);
  view.scrollTop = 0; window.scrollTo(0, 0);
  closeDrawer();
}

function openMore() {
  modal({
    title: '全部功能', body: `<div class="grid" style="grid-template-columns:repeat(3,1fr)">${Object.entries(ROUTES).map(([k, v]) =>
      `<button class="btn" data-go="${k}" style="flex-direction:column;padding:14px 8px;display:flex;gap:6px"><span style="font-size:22px">${v.icon}</span>${v.name}</button>`).join('')}</div>`,
    foot: '<button class="btn" data-close>关闭</button>',
    onOpen: (b, close) => b.querySelectorAll('[data-go]').forEach(x => x.onclick = () => { close(); go(x.dataset.go); })
  });
}

function openDrawer() { $('#sidebar').classList.add('open'); $('#drawerMask').classList.add('on'); }
function closeDrawer() { $('#sidebar').classList.remove('open'); $('#drawerMask').classList.remove('on'); }

// ---- 通知面板 ----
function renderNotif() {
  const list = S().notifications.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 40);
  $('#notifList').innerHTML = list.length ? list.map(n => `
    <div class="notif-item ${n.read ? '' : 'unread'}">
      <div><strong>${esc(n.title)}</strong></div>
      <div class="small muted">${esc(n.body || '')}</div>
      <div class="tm">${fmtAgo(n.createdAt)}</div>
    </div>`).join('') : '<div class="empty">暂无通知</div>';
}

function applyTheme() {
  document.documentElement.dataset.theme = S().settings.theme;
  $('#themeToggle').textContent = S().settings.theme === 'dark' ? '☀️ 浅色模式' : '🌗 深色模式';
}

function updateSyncChip() {
  const c = $('#syncChip'), s = S().settings.sync;
  c.classList.remove('off', 'err');
  if (!navigator.onLine) { c.classList.add('off'); $('#syncText').textContent = '离线 · 待同步'; return; }
  if (!s.enabled) { $('#syncText').textContent = '本地已保存'; return; }
  const t = S().meta.lastSync;
  $('#syncText').textContent = t ? '已同步 · ' + fmtAgo(t) : '云同步待首次运行';
}

// ---- 快速新建 ----
function quickAdd(kind) {
  const map = { reminder: () => Calendar.openReminderForm(), task: () => Board.openTaskForm(), anniversary: () => Anniversary.openAnniForm(), course: () => Schedule.openCourseForm() };
  map[kind] && map[kind]();
}

function bind() {
  document.addEventListener('click', e => {
    const nav = e.target.closest('[data-route]');
    if (nav) { go(nav.dataset.route); return; }
    if (!e.target.closest('.quick-add')) $('#quickMenu').classList.remove('open');
    if (!e.target.closest('#notifPanel') && !e.target.closest('#bellBtn')) $('#notifPanel').hidden = true;
  });
  $('#quickAddBtn').onclick = e => { e.stopPropagation(); $('#quickMenu').classList.toggle('open'); };
  $('#quickMenu').onclick = e => { const b = e.target.closest('[data-qa]'); if (b) { $('#quickMenu').classList.remove('open'); quickAdd(b.dataset.qa); } };
  $('#openDrawer').onclick = openDrawer;
  $('#closeDrawer').onclick = closeDrawer;
  $('#drawerMask').onclick = closeDrawer;
  $('#themeToggle').onclick = () => { store.update(s => { s.settings.theme = s.settings.theme === 'dark' ? 'light' : 'dark'; }); applyTheme(); };
  $('#bellBtn').onclick = e => {
    e.stopPropagation(); const p = $('#notifPanel'); p.hidden = !p.hidden; if (!p.hidden) renderNotif();
  };
  $('#clearNotif').onclick = () => { store.update(s => s.notifications.forEach(n => n.read = true)); renderNotif(); updateBadges(); };
  $('#syncChip').onclick = async () => {
    if (!S().settings.sync.enabled) { go('settings'); return; }
    toast('正在同步…'); const r = await store.push();
    toast(r.ok ? '同步完成' : '同步失败：' + r.msg, r.ok ? 'ok' : 'err'); updateSyncChip();
  };
  $('#modalClose').onclick = () => $('#modalMask').hidden = true;
  $('#modalMask').onclick = e => { if (e.target.id === 'modalMask') $('#modalMask').hidden = true; };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') $('#modalMask').hidden = true; });
  window.addEventListener('hashchange', () => {
    const r = location.hash.replace('#/', '');
    if (r && r !== current) go(r);
  });
  window.addEventListener('online', updateSyncChip);
  window.addEventListener('offline', updateSyncChip);
  store.addEventListener('change', () => { updateBadges(); updateSyncChip(); });
}

async function boot() {
  renderNav(); bind(); applyTheme(); applyBg(); updateBadges(); updateSyncChip();
  const start = location.hash.replace('#/', '') || 'dashboard';
  go(ROUTES[start] ? start : 'dashboard');
  // 通知调度
  checkAll();
  setInterval(checkAll, 60 * 1000);
  setInterval(updateSyncChip, 60 * 1000);
  // 首次拉取云端
  if (S().settings.sync.enabled && navigator.onLine) {
    try { await store.pull(); toast('已从云端同步最新数据', 'ok'); go(current); } catch { }
  }
  // 注册 Service Worker（PWA：可「添加到主屏幕」、离线可用）。仅 http(s)/localhost。
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    try { await navigator.serviceWorker.register('./sw.js'); } catch (e) { console.warn('SW 注册失败', e); }
  }
}
boot();

window.SH = { store, go, toast };
