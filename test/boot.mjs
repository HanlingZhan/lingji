// jsdom boot harness: actually executes the SPA boot path and reports runtime errors.
// Run with: node --experimental-default-type=module test/boot.mjs
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const require = createRequire('C:/Users/zhl/.workbuddy/binaries/node/workspace/package.json');
const { JSDOM } = require('jsdom');

const APP_DIR = resolve(process.cwd());

// ---- Build a DOM from the real index.html ----
const html = readFileSync(resolve(APP_DIR, 'index.html'), 'utf8');
const dom = new JSDOM(html, {
  url: 'http://localhost:8080/',
  pretendToBeVisual: true,
  runScripts: 'outside-only'
});
const { window } = dom;

// ---- Expose browser globals to the ES module scope (modules use bare identifiers) ----
const g = globalThis;
g.window = window;
g.document = window.document;
// navigator is a read-only global in Node 22; augment it instead of replacing
try { Object.defineProperty(g.navigator, 'onLine', { get: () => true, configurable: true }); } catch { /* leave as-is */ }
g.location = window.location;
g.localStorage = window.localStorage;
g.sessionStorage = window.sessionStorage;
// NOTE: keep Node's native CustomEvent/Event — Store extends Node's EventTarget and
// dispatchEvent only accepts Node Event instances, not jsdom's.
g.Node = window.Node;
g.HTMLElement = window.HTMLElement;
g.getComputedStyle = window.getComputedStyle.bind(window);
g.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
g.cancelAnimationFrame = (id) => clearTimeout(id);

// stub things jsdom doesn't implement
window.scrollTo = () => {};
g.scrollTo = window.scrollTo;
window.requestAnimationFrame = g.requestAnimationFrame;

// Notification stub (so the desktop-notify branch can be exercised safely)
class NotificationStub {
  static permission = 'default';
  static requestPermission() { return Promise.resolve('default'); }
  constructor(title, opts) { this.title = title; this.opts = opts; }
}
g.Notification = NotificationStub;
window.Notification = NotificationStub;

// fetch stub (sync disabled by default, but guard anyway)
g.fetch = async () => ({ ok: false, status: 0, json: async () => ({}), text: async () => '' });
window.fetch = g.fetch;

// ---- Capture errors ----
const errors = [];
const origErr = console.error;
console.error = (...a) => { errors.push('console.error: ' + a.map(String).join(' ')); origErr(...a); };
window.addEventListener('error', e => errors.push('window.error: ' + (e.error?.stack || e.message)));
window.addEventListener('unhandledrejection', e => errors.push('unhandledrejection: ' + (e.reason?.stack || e.reason)));

// ---- Load and boot the app ----
const appPath = resolve(APP_DIR, 'js/app.js');
try {
  await import('file://' + appPath);
  // give microtasks / intervals a moment
  await new Promise(r => setTimeout(r, 300));
} catch (e) {
  errors.push('IMPORT/B OOT THREW: ' + (e?.stack || e?.message || String(e)));
}

// ---- Assertions ----
const view = window.document.querySelector('#view');
const navCount = window.document.querySelectorAll('#mainNav .nav-item').length;
const tabCount = window.document.querySelectorAll('#tabbar button').length;
const widgetCount = window.document.querySelectorAll('#dash .widget').length;
const title = window.document.querySelector('#pageTitle')?.textContent;

console.log('--- BOOT REPORT ---');
console.log('page title      :', title);
console.log('#mainNav items  :', navCount);
console.log('#tabbar buttons :', tabCount);
console.log('#dash widgets   :', widgetCount);
console.log('#view children  :', view ? view.children.length : 'NO #view');
console.log('localStorage KEY present:', !!window.localStorage.getItem('scholarhub.state.v1'));
console.log('errors captured :', errors.length);

// ---- Exercise every route's render() to catch view-level runtime errors ----
const SH = window.SH;
const routes = ['dashboard', 'calendar', 'board', 'papers', 'news', 'schedule', 'jobs', 'words', 'anniversary', 'fitness', 'settings'];
const routeReport = [];
for (const r of routes) {
  try {
    SH.go(r);
    await new Promise(res => setTimeout(res, 40));
    const kids = window.document.querySelector('#view')?.children.length || 0;
    routeReport.push(`${r}:${kids}`);
  } catch (e) {
    errors.push(`ROUTE ${r} THREW: ` + (e?.stack || e?.message || String(e)));
    routeReport.push(`${r}:THREW`);
  }
}
console.log('\n--- ROUTE RENDER (route:childCount) ---');
console.log(routeReport.join('  '));

// ---- Data-layer logic checks (store CRUD + last-write-wins merge + export/import) ----
const storeMod = await import('file://' + resolve(APP_DIR, 'js/store.js'));
const store = window.SH.store;
const assert = (cond, msg) => { if (!cond) errors.push('ASSERT FAIL: ' + msg); };
const before = store.state.reminders.length;
const rec = store.add('reminders', { title: '验证提醒', at: Date.now() + 86400000, tag: 'research', level: 'high' });
assert(rec && rec.id, 'add() returns record with id');
assert(store.state.reminders.length === before + 1, 'reminders length incremented after add');
const patched = store.patch('reminders', rec.id, { done: true });
assert(patched && patched.done === true, 'patch() applies update');
store.remove('reminders', rec.id);
assert(store.state.reminders.length === before, 'remove() restores length');

const merged = storeMod.mergeStates(
  { reminders: [{ id: 'x', updatedAt: 100, v: 1 }] },
  { reminders: [{ id: 'x', updatedAt: 200, v: 2 }] }
);
assert(merged.reminders.find(r => r.id === 'x').v === 2, 'mergeStates last-write-wins by updatedAt');
const exp = JSON.parse(store.export());
assert(exp && Array.isArray(exp.reminders), 'export() returns serializable state');
store.import(JSON.stringify(exp), 'replace');
assert(store.state.reminders.length === before, 'import(replace) round-trips');
console.log('\n--- DATA-LAYER CHECKS ---');
console.log('CRUD + merge + export/import: done (assertions above, if any printed = FAIL)');

if (errors.length) {
  console.log('\n--- ERRORS ---');
  errors.slice(0, 20).forEach(e => console.log('•', e.slice(0, 600)));
}

const ok = errors.length === 0 && widgetCount > 0 && navCount > 0;
console.log('\nRESULT:', ok ? 'PASS ✅' : 'FAIL ❌');
process.exit(ok ? 0 : 1);
