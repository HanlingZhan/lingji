// ============ 系统推送（手机 / iPad）：提醒事项到期 → 锁屏系统通知 ============
// 工作原理：
//   1. 本机把「每一条未完成提醒的下一次触发时间窗」计算好（与站内提醒引擎同逻辑），
//      快照同步到你自己的 Cloudflare Worker（settings.backendProxy）。
//   2. Worker 每分钟检查一次，命中时间窗就通过 Web Push（VAPID）把系统通知推到本机。
//   3. 手机/平板即使没打开灵记，锁屏也会弹通知；点通知直接打开灵记。
// 仅手机 / iPad / 平板启用（桌面端跳过，保持原有桌面弹窗逻辑）。

import { store, S } from './store.js';
import { uid, nextOccurrence, addDays, startOfDay, ymd, hm } from './utils.js';
import { toast } from './ui.js';

const LS = 'lingji.push.v1';
// VAPID 公钥（无压缩点，base64url）。私钥只存在于 Cloudflare Worker 的 Secret 里。
const VAPID_PUBLIC = 'BN3YGwq-g9EGqZcXr5q0kJX7WlgN1qTE4KSRF-zxTY-ZPyrZt_kyzb8jH1eF7GOLF06z4ftdemBw7l6yM25kEv4';

const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent);
const isAndroid = /Android/i.test(navigator.userAgent);
const isIpadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
const isDesktopTouch = /Windows|CrOS|X11|Linux/i.test(navigator.userAgent) && !isAndroid;

function isMobileOrPad() {
  const touch = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
  if (!touch) return false;
  if (isIos || isAndroid || isIpadOs) return true;
  if (isDesktopTouch) return false; // 触屏笔记本 / 一体机不算
  return window.innerWidth <= 1024;
}

export function pushSupported() {
  return isMobileOrPad() && 'serviceWorker' in navigator && 'PushManager' in window &&
    'Notification' in window && location.protocol.startsWith('http');
}

export function pushBlockedReason() {
  if (isMobileOrPad() && isIos && !pushSupported()) {
    return 'iOS 需从主屏幕图标打开灵记（Safari「添加到主屏幕」后全屏使用）才会出现推送授权。';
  }
  if (!pushSupported()) return '当前设备为桌面端，推送功能仅手机 / iPad 可用。';
  return '';
}

const api = () => (S().settings.backendProxy || '').replace(/\/+$/, '');

function ls() {
  try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch { return {}; }
}
function saveLs(patch) {
  const cur = ls();
  localStorage.setItem(LS, JSON.stringify({ ...cur, ...patch }));
}

function urlB64ToUint8Array(b64) {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function deviceLabel() {
  if (isIos) return /iPad/i.test(navigator.userAgent) || isIpadOs ? 'iPad' : 'iPhone';
  if (isAndroid) return '安卓手机';
  return '平板/触屏设备';
}

async function post(path, data) {
  const base = api();
  if (!base) throw new Error('未配置后端代理 URL');
  const r = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!r.ok) {
    let msg = 'HTTP ' + r.status;
    try { const j = await r.json(); if (j.error) msg = j.error; } catch { }
    throw new Error(msg);
  }
  return r.json();
}

// 与 notify.js checkAll 相同的触发窗口：提前 advance 分钟开始，到提醒时间后 12 小时内有效。
export function buildSnapshot() {
  const N = new Date();
  const from = startOfDay(addDays(N, -1));
  const list = S().reminders.filter(r => !r.done).map(r => {
    const at = nextOccurrence(r, from);
    const adv = (r.advance || 0) * 60000;
    const dueAt = at.getTime() - adv;
    const windowEnd = at.getTime() + 12 * 3600000;
    const lv = r.level === 'high' ? '【紧急重要】' : '';
    return {
      id: r.id,
      dueAt,
      windowEnd,
      title: `${lv}⏰ ${r.title}`,
      body: `${ymd(at)} ${hm(at)}${r.note ? ' · ' + r.note : ''}`
    };
  }).filter(x => x.windowEnd > Date.now());
  return list.slice(0, 200);
}

async function syncSnapshot(quiet = true) {
  const s = ls();
  if (!s.enabled || !s.install) return false;
  try {
    await post('/push/sync', { install: s.install, device: deviceLabel(), reminders: buildSnapshot() });
    saveLs({ lastSyncAt: Date.now() });
    return true;
  } catch (e) {
    if (!quiet) toast('推送同步失败：' + e.message, 'err');
    return false;
  }
}

async function getRegistration() {
  if (!navigator.serviceWorker) return null;
  return navigator.serviceWorker.getRegistration() || navigator.serviceWorker.register('./sw.js');
}

export async function enablePush() {
  if (!pushSupported()) {
    toast(isIos && isMobileOrPad() ? '请从主屏幕图标打开灵记（添加到主屏幕后全屏使用），再开启推送' : '当前设备不支持系统推送（仅手机 / iPad）', 'err');
    return false;
  }
  if (!api()) { toast('请先在「多端云同步」中填写后端代理 URL（Worker 地址）', 'err'); return false; }
  let perm = Notification.permission;
  if (perm === 'denied') { toast('通知权限已被拒绝：请在系统设置/浏览器设置中允许本网站通知后重试', 'err'); return false; }
  try {
    if (perm === 'default') perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('未获得通知权限', 'err'); return false; }
    const reg = await getRegistration();
    if (!reg) throw new Error('Service Worker 未就绪');
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC) });
    const install = ls().install || uid();
    await post('/push/subscribe', { install, sub: sub.toJSON(), device: deviceLabel() });
    saveLs({ enabled: true, install });
    await syncSnapshot(false);
    toast('✅ 系统推送已开启：提醒到期时会推送到手机/iPad 锁屏', 'ok');
    return true;
  } catch (e) {
    toast('开启推送失败：' + e.message, 'err');
    return false;
  }
}

export async function disablePush() {
  const s = ls();
  if (s.install) { try { await post('/push/unsubscribe', { install: s.install }); } catch { } }
  try {
    const reg = await getRegistration();
    const sub = reg && await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
  } catch { }
  saveLs({ enabled: false });
  toast('已关闭系统推送', 'ok');
  return true;
}

export async function testPush() {
  const s = ls();
  if (!s.enabled || !s.install) { toast('请先开启推送', 'err'); return false; }
  try {
    await post('/push/test', { install: s.install });
    toast('测试推送已发出：锁屏或回到桌面，几秒内应看到「灵记」通知', 'ok');
    return true;
  } catch (e) { toast('测试推送失败：' + e.message, 'err'); return false; }
}

export function pushState() {
  const s = ls();
  if (!pushSupported()) {
    if (isIos && isMobileOrPad()) return { status: 'install', text: '待安装为App' };
    return { status: 'na', text: '仅手机/iPad' };
  }
  if (Notification.permission === 'denied') return { status: 'denied', text: '通知权限被拒' };
  if (s.enabled && Notification.permission === 'granted') return { status: 'on', text: '已开启' };
  if (Notification.permission === 'granted') return { status: 'sub', text: '已授权·未订阅' };
  return { status: 'off', text: '未开启' };
}

export function pushStateChip() {
  return { on: 'ok', off: 'warn', sub: 'warn', denied: 'danger', install: 'warn', na: 'gray' }[pushState().status] || 'gray';
}

// ---- 自动保持快照新鲜 ----
let t = null;
function scheduleSync() { clearTimeout(t); t = setTimeout(() => syncSnapshot(true), 3000); }

export function initPush() {
  if (!pushSupported()) return;
  // 已开启过：补订阅、补快照（换域名/清缓存后自动恢复）
  if (ls().enabled && Notification.permission === 'granted') {
    enablePush().catch(() => {});
  }
  store.addEventListener('change', () => { if (ls().enabled) scheduleSync(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && ls().enabled) syncSnapshot(true);
  });
  window.addEventListener('online', () => { if (ls().enabled) syncSnapshot(true); });
}
