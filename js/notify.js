// ============ 提醒调度引擎 ============
import { store, S } from './store.js';
import { uid, now, ymd, hm, diffDays, nextOccurrence, addDays, startOfDay } from './utils.js';
import { predictNext } from './views/anniversary.js';
import { courseOccursOn, currentWeek, SECTION_TIME } from './views/schedule.js';

export function pushNotif(title, body, kind = 'info', force = false) {
  const st = S();
  st.notifications.unshift({ id: uid(), title, body, kind, read: false, createdAt: now(), updatedAt: now() });
  if (st.notifications.length > 200) st.notifications.length = 200;
  store.save('notify');
  if (st.settings.notify.desktop && 'Notification' in window) {
    if (Notification.permission === 'granted') {
      try { new Notification(title, { body, icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Crect width="100" height="100" rx="24" fill="%231565c0"/%3E%3C/svg%3E' }); } catch { }
    } else if (Notification.permission === 'default' && force) {
      Notification.requestPermission();
    }
  }
}

export function requestPermission() {
  if ('Notification' in window && Notification.permission === 'default') return Notification.requestPermission();
  return Promise.resolve(Notification?.permission);
}

function fired(key) {
  const f = S().fired;
  if (f[key]) return true;
  f[key] = now();
  // 清理 30 天前记录
  const cut = now() - 30 * 86400000;
  Object.keys(f).forEach(k => { if (f[k] < cut) delete f[k]; });
  return false;
}

export function checkAll() {
  const st = S(); const N = new Date();
  // 1. 提醒事项
  st.reminders.filter(r => !r.done).forEach(r => {
    const at = nextOccurrence(r, startOfDay(addDays(N, -1)));
    const adv = (r.advance || 0) * 60000;
    const key = `rem:${r.id}:${ymd(at)}${hm(at)}`;
    if (N.getTime() >= at.getTime() - adv && N.getTime() <= at.getTime() + 12 * 3600000) {
      if (!fired(key)) {
        const lv = r.level === 'high' ? '【紧急重要】' : '';
        pushNotif(`${lv}⏰ ${r.title}`, `${ymd(at)} ${hm(at)}${r.note ? ' · ' + r.note : ''}`, 'reminder');
      }
    }
  });
  // 2. 纪念日
  st.anniversaries.forEach(a => {
    const next = nextAnniDate(a);
    if (!next) return;
    const d = diffDays(next, N);
    if (d >= 0 && d <= (a.advance ?? 3)) {
      const key = `anni:${a.id}:${ymd(next)}`;
      if (!fired(key)) pushNotif(`💝 ${a.title}${d === 0 ? ' 就是今天！' : ` 还有 ${d} 天`}`, `日期：${ymd(next)}${a.giftOn ? ' · 已为你准备礼物清单' : ''}`, 'anni');
    }
  });
  // 3. 生理周期
  const cy = st.cycle;
  if (cy.records && cy.records.length) {
    const p = predictNext(cy);
    if (p) {
      const d = diffDays(p.start, N);
      if (d >= 0 && d <= (cy.advance ?? 2)) {
        const key = `cycle:${ymd(p.start)}`;
        if (!fired(key)) pushNotif(`🌸 预计 ${d === 0 ? '今天' : d + ' 天后'}进入生理期`, `预测区间 ${ymd(p.start)} ~ ${ymd(p.end)}，注意保暖休息`, 'cycle');
      }
    }
  }
  // 4. 今日课程（当天首次打开时提醒）
  const wk = currentWeek(st.semester);
  if (wk > 0) {
    const todayCourses = st.courses.filter(c => courseOccursOn(c, N, wk));
    if (todayCourses.length) {
      const key = `course:${ymd(N)}`;
      if (!fired(key)) {
        const list = todayCourses.sort((a, b) => a.startSec - b.startSec)
          .map(c => `${SECTION_TIME[c.startSec - 1]?.[0] || ''} ${c.name}@${c.room || ''}`).join('；');
        pushNotif(`📚 今日 ${todayCourses.length} 门课（第 ${wk} 周）`, list, 'course');
      }
    }
  }
  // 5. 单词 / 论文每日推送提示
  const h = N.getHours();
  if (h >= (st.settings.notify.wordHour ?? 9)) {
    const key = `word:${ymd(N)}`;
    if (!fired(key)) pushNotif('🔤 今日单词已就绪', `词库：${st.words.deck.toUpperCase()} · ${st.words.perDay} 个新词 + 复习计划`, 'word');
  }
  if (h >= (st.settings.notify.dailyPaperHour ?? 8)) {
    const key = `paper:${ymd(N)}`;
    if (!fired(key)) pushNotif('📄 arXiv 每日论文可拉取', '进入「论文抓取」查看今日匹配你研究方向的最新预印本', 'paper');
  }
  store.save('notify-scan');
}

export function nextAnniDate(a) {
  const base = new Date(a.date);
  if (isNaN(base)) return null;
  const N = new Date();
  if (a.type === 'countdown' || a.repeat === 'none') return base >= startOfDay(N) ? base : null;
  if (a.type === 'days') { // 万天类：目标天数
    const target = addDays(base, a.targetDays || 10000);
    return target;
  }
  // 每年重复
  const y = N.getFullYear();
  let d = new Date(base); d.setFullYear(y);
  if (diffDays(d, N) < 0) d.setFullYear(y + 1);
  return d;
}
