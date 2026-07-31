// ============ 通用工具 ============
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const now = () => Date.now();

export const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---- 日期 ----
export const pad = n => String(n).padStart(2, '0');
export function ymd(d) { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function hm(d) { d = new Date(d); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
export function ymdhm(d) { return `${ymd(d)} ${hm(d)}`; }
export function toLocalInput(d) { d = new Date(d); return `${ymd(d)}T${hm(d)}`; }
export function parseDate(s) { return s ? new Date(s) : null; }
export function startOfDay(d) { d = new Date(d); d.setHours(0, 0, 0, 0); return d; }
export function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function addMonths(d, n) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }
export function diffDays(a, b) { return Math.round((startOfDay(a) - startOfDay(b)) / 86400000); }
export const WEEK_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
export function weekdayCN(d) { return WEEK_CN[new Date(d).getDay()]; }
export function isSameDay(a, b) { return ymd(a) === ymd(b); }
export function startOfWeek(d) { const x = startOfDay(d); const w = (x.getDay() + 6) % 7; return addDays(x, -w); } // 周一为首
export function fmtRel(d) {
  const dd = diffDays(d, new Date());
  if (dd === 0) return '今天';
  if (dd === 1) return '明天';
  if (dd === 2) return '后天';
  if (dd === -1) return '昨天';
  if (dd < 0) return `已过 ${-dd} 天`;
  if (dd < 30) return `${dd} 天后`;
  if (dd < 365) return `${Math.round(dd / 30)} 个月后`;
  return `${(dd / 365).toFixed(1)} 年后`;
}
export function fmtAgo(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return '刚刚';
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  return `${Math.floor(s / 86400)} 天前`;
}

// ---- 重复规则：返回给定基准时间之后的下一次发生 ----
export function nextOccurrence(item, from = new Date()) {
  const base = new Date(item.at);
  if (!item.repeat || item.repeat === 'none') return base;
  let d = new Date(base);
  let guard = 0;
  while (d < from && guard++ < 4000) {
    switch (item.repeat) {
      case 'daily': d = addDays(d, 1); break;
      case 'weekly': d = addDays(d, 7); break;
      case 'biweekly': d = addDays(d, 14); break;
      case 'monthly': d = addMonths(d, 1); break;
      case 'yearly': d = addMonths(d, 12); break;
      default: return base;
    }
  }
  return d;
}

// ---- 其他 ----
export function download(filename, content, type = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: type + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
export function debounce(fn, ms = 300) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
export function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
export function pick(arr, n) { const c = [...arr]; const out = []; while (out.length < n && c.length) out.push(...c.splice(Math.floor(Math.random() * c.length), 1)); return out; }
export function groupBy(arr, fn) { return arr.reduce((m, x) => { const k = fn(x); (m[k] = m[k] || []).push(x); return m; }, {}); }
export const TAGS = { research: { label: '科研', cls: 'purple' }, course: { label: '课程', cls: 'teal' }, life: { label: '生活', cls: 'pink' }, other: { label: '其他', cls: 'gray' } };
export const LEVELS = { high: { label: '紧急重要', cls: 'danger' }, mid: { label: '一般', cls: 'warn' }, low: { label: '低优先', cls: 'ok' } };
