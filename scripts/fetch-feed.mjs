#!/usr/bin/env node
/**
 * 灵记 · 服务端自动抓取
 * 在 GitHub Actions 的服务器上运行（海外网络、无 CORS 限制、可自定义 UA），
 * 把论文与资讯抓好后写成静态文件，前端打开即用，无需本地再去请求外网。
 *
 * 产出：
 *   data/feed.json  论文候选集（前端再按用户阈值本地评分过滤）
 *   data/news.json  Hacker News 热帖 + GitHub 活跃项目
 *
 * 抓取规则来源：优先读 data/state.json（即多端同步的云端数据）里的 paperRules，
 * 读不到则用内置默认方向。这样你在 App 里改关键词，第二天自动抓取就会跟着变。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'data');
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 LingjiBot/1.0';
const MAX_ITEMS = 300;          // feed.json 最多保留多少篇，控制文件体积（手机流量友好）
const ABS_LIMIT = 1000;         // 摘要截断长度，读全文可点「原文 / PDF」
const log = (...a) => console.log('[lingji]', ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const DEFAULT_RULES = {
  groups: [
    { name: '手部姿态估计', on: true, kw: ['hand pose estimation', 'hand mesh', '3D hand reconstruction'] },
    { name: '多模态大模型', on: true, kw: ['multimodal large language model', 'vision language model'] },
    { name: '具身智能', on: true, kw: ['embodied AI', 'vision language action', 'robot manipulation'] },
    { name: '人体姿态估计', on: true, kw: ['human pose estimation', 'human mesh recovery'] },
    { name: '灵巧手', on: true, kw: ['dexterous hand', 'dexterous grasping', 'dexterous manipulation'] }
  ],
  categories: ['cs.CV', 'cs.AI', 'cs.RO', 'cs.LG', 'cs.CL'],
  sources: { arxiv: true, openreview: true, pwc: true, hf: true },
  maxPerDay: 60
};

// ---------------------------------------------------------------- 工具
function readRules() {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'state.json'), 'utf8'));
    const r = j && j.paperRules;
    if (r && Array.isArray(r.groups) && r.groups.some(g => g.on && (g.kw || []).length)) {
      log('已读取云端同步的抓取规则：' + r.groups.filter(g => g.on).map(g => g.name).join('、'));
      return { ...DEFAULT_RULES, ...r, sources: { ...DEFAULT_RULES.sources, ...(r.sources || {}) } };
    }
  } catch { }
  log('未读到云端规则，使用内置默认方向');
  return DEFAULT_RULES;
}

async function get(url, { headers = {}, timeout = 30000, retry = 2, json = false } = {}) {
  for (let i = 0; i <= retry; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', ...headers },
        signal: AbortSignal.timeout(timeout),
        redirect: 'follow'
      });
      if (res.ok) return json ? await res.json() : await res.text();
      if (res.status === 429 || res.status >= 500) { await sleep(2500 * (i + 1)); continue; }
      throw new Error('HTTP ' + res.status);
    } catch (e) {
      if (i === retry) throw e;
      await sleep(2000 * (i + 1));
    }
  }
}

const decodeXml = s => String(s)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&amp;/g, '&');

const oneLine = s => String(s || '').replace(/\s+/g, ' ').trim();
const cut = s => oneLine(s).slice(0, ABS_LIMIT);

function xTag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? decodeXml(m[1]) : '';
}
function xTagAll(block, name) {
  return [...block.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'g'))].map(m => decodeXml(m[1]));
}

function activeGroups(rules) {
  return (rules.groups || []).filter(g => g.on !== false && (g.kw || []).length);
}

// ---------------------------------------------------------------- arXiv
async function fetchArxiv(rules, errs) {
  const groups = activeGroups(rules);
  if (!groups.length) return [];
  const cats = (rules.categories || []).map(c => `cat:${c}`).join('+OR+');
  const perGroup = Math.max(20, Math.min(80, Number(rules.maxPerDay) || 60));
  const out = [];
  for (const g of groups.slice(0, 8)) {
    const kwQuery = g.kw.slice(0, 8).map(k => `all:"${String(k).replace(/"/g, '')}"`).join('+OR+');
    const q = cats ? `(${kwQuery})+AND+(${cats})` : `(${kwQuery})`;
    const url = `https://export.arxiv.org/api/query?search_query=${q.replace(/ /g, '+')}` +
      `&start=0&max_results=${perGroup}&sortBy=submittedDate&sortOrder=descending`;
    try {
      const xml = await get(url, { timeout: 40000 });
      const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m => m[1]);
      entries.forEach(e => {
        const id = oneLine(xTag(e, 'id'));
        if (!id.includes('/abs/')) return;
        out.push({
          id: 'arxiv:' + id.split('/abs/')[1],
          source: 'arXiv',
          title: oneLine(xTag(e, 'title')),
          authors: xTagAll(e, 'name').map(oneLine).slice(0, 25),
          abs: cut(xTag(e, 'summary')),
          url: id,
          pdf: id.replace('/abs/', '/pdf/'),
          published: xTag(e, 'published').slice(0, 10),
          updated: xTag(e, 'updated').slice(0, 10),
          primary: (e.match(/<arxiv:primary_category[^>]*term="([^"]+)"/) || [])[1] || '',
          comment: oneLine(xTag(e, 'arxiv:comment'))
        });
      });
      log(`arXiv「${g.name}」→ ${entries.length} 篇`);
    } catch (e) {
      errs.push(`arXiv「${g.name}」抓取失败：${e.message}`);
    }
    await sleep(3200); // arXiv 官方要求请求间隔 ≥3 秒
  }
  return out;
}

// ---------------------------------------------------------------- OpenReview
async function fetchOpenReview(rules, errs) {
  const kws = activeGroups(rules).flatMap(g => g.kw.slice(0, 2)).slice(0, 6);
  const out = [];
  for (const k of kws) {
    try {
      const j = await get(`https://api2.openreview.net/notes/search?term=${encodeURIComponent(k)}&limit=25&type=terms&source=forum`,
        { json: true, timeout: 25000, retry: 1 });
      const val = x => (x && typeof x === 'object' && 'value' in x ? x.value : x) || '';
      (j.notes || []).forEach(n => {
        const c = n.content || {};
        const title = oneLine(val(c.title));
        if (!title) return;
        out.push({
          id: 'or:' + n.id, source: 'OpenReview', title,
          authors: [].concat(val(c.authors) || []).map(oneLine).slice(0, 25),
          abs: cut(val(c.abstract)),
          url: 'https://openreview.net/forum?id=' + n.id,
          pdf: 'https://openreview.net/pdf?id=' + n.id,
          published: n.cdate ? new Date(n.cdate).toISOString().slice(0, 10) : '',
          venue: oneLine(val(c.venue))
        });
      });
    } catch (e) {
      errs.push(`OpenReview「${k}」：${e.message}`);
    }
    await sleep(1200);
  }
  if (out.length) log(`OpenReview → ${out.length} 篇`);
  return out;
}

// ---------------------------------------------------------------- HuggingFace 每日精选
async function fetchHFDaily(errs) {
  const out = [];
  try {
    const j = await get('https://huggingface.co/api/daily_papers?limit=60', { json: true, timeout: 25000 });
    (Array.isArray(j) ? j : []).forEach(x => {
      const p = x.paper || x;
      const aid = p.id || x.id;
      if (!p.title || !aid) return;
      out.push({
        id: 'arxiv:' + aid, source: 'HF 每日精选',
        title: oneLine(p.title),
        authors: (p.authors || []).map(a => oneLine(a.name || a)).slice(0, 25),
        abs: cut(p.summary || p.abstract || ''),
        url: 'https://arxiv.org/abs/' + aid,
        pdf: 'https://arxiv.org/pdf/' + aid,
        published: (p.publishedAt || x.publishedAt || '').slice(0, 10),
        upvotes: p.upvotes || 0,
        hot: true
      });
    });
    log(`HuggingFace 每日精选 → ${out.length} 篇`);
  } catch (e) {
    errs.push('HuggingFace 每日精选：' + e.message);
  }
  return out;
}

// ---------------------------------------------------------------- Papers with Code（站点可能已下线，失败即跳过）
async function fetchPwC(rules, errs) {
  const kws = activeGroups(rules).map(g => g.kw[0]).filter(Boolean).slice(0, 3);
  const out = [];
  for (const k of kws) {
    try {
      const j = await get(`https://paperswithcode.com/api/v1/papers/?q=${encodeURIComponent(k)}&items_per_page=20`,
        { json: true, timeout: 20000, retry: 0 });
      (j.results || []).forEach(p => out.push({
        id: 'pwc:' + p.id, source: 'Papers with Code', title: oneLine(p.title),
        authors: (p.authors || []).slice(0, 25), abs: cut(p.abstract),
        url: p.url_abs || p.url_pdf, pdf: p.url_pdf, published: (p.published || '').slice(0, 10), code: true
      }));
    } catch (e) {
      errs.push('Papers with Code 不可用（站点已停止服务，可在规则里关掉该源）');
      break;
    }
    await sleep(800);
  }
  if (out.length) log(`Papers with Code → ${out.length} 篇`);
  return out;
}

// ---------------------------------------------------------------- 资讯
async function fetchNews(errs) {
  const news = { hn: [], gh: [] };
  try {
    // 用 search_by_date 端点按时间排序（/search 按热度，老高分帖会永远排前）；
    // 关键词只用单个广覆盖词 AI —— Algolia 的「OR 多词」查询会塌缩成个位数结果。
    const j = await get('https://hn.algolia.com/api/v1/search_by_date?query=AI&tags=story&hitsPerPage=30&numericFilters=points%3E30',
      { json: true, timeout: 20000 });
    news.hn = (j.hits || []).map(h => ({
      id: 'hn' + h.objectID, title: oneLine(h.title),
      url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      points: h.points, comments: h.num_comments, at: h.created_at, by: h.author
    })).filter(x => x.title);
    log(`Hacker News → ${news.hn.length} 条`);
  } catch (e) { errs.push('Hacker News：' + e.message); }

  // GitHub 搜索不支持把多个 topic 用 OR 串在一起再叠加限定符（会返回 422），必须逐个 topic 查询后合并
  const since = new Date(Date.now() - 21 * 864e5).toISOString().slice(0, 10);
  const auth = process.env.GITHUB_TOKEN ? { Authorization: 'Bearer ' + process.env.GITHUB_TOKEN } : {};
  const seenRepo = new Set();
  for (const topic of ['llm', 'computer-vision', 'robotics', 'multimodal']) {
    try {
      const j = await get(`https://api.github.com/search/repositories?q=topic%3A${topic}+pushed%3A%3E${since}&sort=stars&order=desc&per_page=10`,
        { json: true, timeout: 20000, retry: 1, headers: { Accept: 'application/vnd.github+json', ...auth } });
      (j.items || []).forEach(x => {
        if (seenRepo.has(x.id)) return; seenRepo.add(x.id);
        news.gh.push({
          id: 'gh' + x.id, title: x.full_name, desc: oneLine(x.description).slice(0, 200), url: x.html_url,
          stars: x.stargazers_count, lang: x.language, at: x.pushed_at, topics: (x.topics || []).slice(0, 5)
        });
      });
    } catch (e) { errs.push(`GitHub 项目「${topic}」：${e.message}`); }
    await sleep(1200);
  }
  news.gh.sort((a, b) => b.stars - a.stars);
  news.gh = news.gh.slice(0, 20);
  log(`GitHub 活跃项目 → ${news.gh.length} 个`);

  return news;
}

// ---------------------------------------------------------------- 主流程
async function main() {
  const rules = readRules();
  const errs = [];
  const src = rules.sources || {};

  const jobs = [];
  if (src.arxiv !== false) jobs.push(fetchArxiv(rules, errs));
  if (src.hf !== false) jobs.push(fetchHFDaily(errs));
  if (src.openreview) jobs.push(fetchOpenReview(rules, errs));
  if (src.pwc) jobs.push(fetchPwC(rules, errs));

  const [papersArr, news] = await Promise.all([
    Promise.all(jobs).then(r => r.flat()),
    fetchNews(errs)
  ]);

  // 去重：标题归一化后取首次出现（保留 upvotes 更高的）
  const map = new Map();
  papersArr.forEach(p => {
    if (!p.title) return;
    const key = p.title.toLowerCase().replace(/\W+/g, '').slice(0, 60);
    const old = map.get(key);
    if (!old) return void map.set(key, p);
    // 合并：优先保留有摘要 / 有 upvotes 的那条
    if ((p.abs || '').length > (old.abs || '').length) map.set(key, { ...old, ...p });
    else if (p.hot) map.set(key, { ...p, ...old, hot: true, upvotes: Math.max(p.upvotes || 0, old.upvotes || 0) });
  });

  const items = [...map.values()]
    .sort((a, b) => (b.published || '').localeCompare(a.published || '') || (b.upvotes || 0) - (a.upvotes || 0))
    .slice(0, MAX_ITEMS);

  const bySource = {};
  items.forEach(p => { bySource[p.source] = (bySource[p.source] || 0) + 1; });

  const feed = {
    generatedAt: Date.now(),
    generatedAtISO: new Date().toISOString(),
    total: items.length,
    bySource,
    keywords: activeGroups(rules).map(g => ({ name: g.name, kw: g.kw })),
    errors: [...new Set(errs)],
    items
  };
  const newsOut = { generatedAt: Date.now(), generatedAtISO: new Date().toISOString(), errors: [...new Set(errs)], ...news };

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, 'feed.json'), JSON.stringify(feed));
  fs.writeFileSync(path.join(DATA_DIR, 'news.json'), JSON.stringify(newsOut));

  const kb = n => (fs.statSync(path.join(DATA_DIR, n)).size / 1024).toFixed(0);
  log(`完成：feed.json ${items.length} 篇 / ${kb('feed.json')} KB，news.json ${news.hn.length}+${news.gh.length} 条 / ${kb('news.json')} KB`);
  if (errs.length) log('受限的源：\n  - ' + [...new Set(errs)].join('\n  - '));
  if (!items.length) { console.error('[lingji] 所有论文源均无数据，判定为失败'); process.exit(1); }
}

main().catch(e => { console.error('[lingji] 抓取失败：', e); process.exit(1); });
