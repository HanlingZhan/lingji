// 灵记 Service Worker —— 缓存应用壳，支持离线使用。
const CACHE = 'lingji-v36';
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  'assets/css/app.css',
  'assets/icon.svg', 'assets/icon-192.png', 'assets/icon-512.png', 'assets/apple-touch-icon.png',
  'js/app.js', 'js/store.js', 'js/ui.js', 'js/utils.js', 'js/notify.js', 'js/push.js',
  'js/data/gifts.js', 'js/data/jobs.js', 'js/data/venues.js', 'js/data/words.js',
  'js/views/anniversary.js', 'js/views/board.js', 'js/views/calendar.js', 'js/views/dashboard.js',
  'js/views/fitness.js', 'js/views/jobs.js', 'js/views/news.js', 'js/views/papers.js',
  'js/views/schedule.js', 'js/views/settings.js', 'js/views/words.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return; // 云同步请求不拦截
  // 导航请求：网络优先，失败回退缓存
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('./index.html')));
    return;
  }
  // 静态资源：网络优先，成功补缓存；离线时回退缓存
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
      return res;
    }).catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
  );
});

// ---- 系统推送（手机 / iPad 提醒事项到期通知） ----
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { title: '灵记', body: e.data ? e.data.text() : '' }; }
  const opts = {
    body: data.body || '',
    icon: './assets/icon-192.png',
    badge: './assets/icon-192.png',
    tag: data.tag || undefined,
    data: { url: data.url || './#/calendar' },
    vibrate: [100, 50, 100]
  };
  e.waitUntil(self.registration.showNotification(data.title || '灵记', opts));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './#/calendar';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) {
      if ('focus' in c) { c.navigate(url); return c.focus(); }
    }
    return clients.openWindow(url);
  }));
});
