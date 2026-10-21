#!/usr/bin/env node
/**
 * 灵记 · 交大计算机系讲座自动抓取
 * 在 GitHub Actions 的服务器上运行（海外网络、无 CORS 限制），
 * 抓取 https://cs.sjtu.edu.cn/xshd.html（学术活动）-> 写成 data/seminars.json，
 * 前端 seminars.html 直接读取渲染。
 *
 * 与 fetch-feed.mjs 同一套约定：Node 20 + 全局 fetch + 正则解析 + 提交回仓库。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'data');
const BASE = 'https://cs.sjtu.edu.cn';
const LIST = BASE + '/xshd.html';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 LingjiBot/1.0';
const log = (...a) => console.log('[seminars]', ...a);

function normDate(s) {
  const m = String(s || '').match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${y}-${String(+mo).padStart(2, '0')}-${String(+d).padStart(2, '0')}`;
}

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return await res.text();
}

function parseBlock(txt) {
  let title = txt, time = '', location = '', speaker = '';
  if (txt.includes('时间：')) {
    const [t, rest] = txt.split('时间：');
    title = t.trim();
    if (rest.includes('地点：')) {
      const [tt, rest2] = rest.split('地点：');
      time = tt.trim();
      if (rest2.includes('报告人：')) {
        const [loc, sp] = rest2.split('报告人：');
        location = loc.trim();
        speaker = sp.trim();
      } else location = rest2.trim();
    } else time = rest.trim();
  }
  return { title, time, location, speaker };
}

async function main() {
  const html = await get(LIST);
  const items = [];
  const seen = new Set();
  const aRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = aRe.exec(html))) {
    const attrs = m[1];
    const inner = m[2];
    const hrefM = attrs.match(/href="([^"]*)"/i);
    if (!hrefM) continue;
    const href = hrefM[1];
    if (!/\/xshd\//.test(href)) continue;
    const txt = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!txt) continue;
    const link = href.startsWith('http') ? href : BASE + '/' + href.replace(/^\//, '');
    if (seen.has(link)) continue;
    seen.add(link);
    const imgM = inner.match(/<img\b[^>]*src="([^"]*)"/i);
    const poster = imgM ? (imgM[1].startsWith('http') ? imgM[1] : BASE + imgM[1]) : '';
    const { title, time, location, speaker } = parseBlock(txt);
    const date = normDate(time || txt);
    items.push({ title, date, time, location, speaker, poster, link });
  }
  items.sort((a, b) => (b.date || '0000-00-00').localeCompare(a.date || '0000-00-00'));

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const out = {
    generatedAt: Date.now(),
    generatedAtISO: new Date().toISOString(),
    source: LIST,
    count: items.length,
    seminars: items
  };
  fs.writeFileSync(path.join(DATA_DIR, 'seminars.json'), JSON.stringify(out, null, 2));
  log(`完成：${items.length} 条 -> data/seminars.json`);
  if (!items.length) { console.error('[seminars] 无数据，判定为失败'); process.exit(1); }
}

main().catch(e => { console.error('[seminars] 抓取失败：', e); process.exit(1); });
