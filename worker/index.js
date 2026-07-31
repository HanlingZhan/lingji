// 灵记 · 轻量后端代理（Cloudflare Workers）
// 作用：聚合可实时抓取的公开源并附加 CORS 头，供静态 GitHub Pages 站点跨域调用。
// 覆盖：arXiv / Hacker News / OpenReview / Papers with Code / Google 翻译 / 文章全文逐段翻译。
// 注：小红书、微信公众号、ScholarInbox 需登录或强反爬，无法在此实时抓取，改由前端"策展快照+检索直达"处理。

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': '*'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' }
  });
}
function textOut(t, status = 200) {
  return new Response(t, {
    status,
    headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' }
  });
}
function preflight() { return new Response(null, { status: 204, headers: CORS }); }

const enc = encodeURIComponent;

// ---------- arXiv（Workers 无 DOMParser，用正则解析 Atom） ----------
function parseArxiv(xml) {
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m => m[1]);
  return entries.map(e => {
    const g = (t) => (e.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)) || [,''])[1].trim();
    const id = g('id');
    const authors = [...e.matchAll(/<name>([\s\S]*?)<\/name>/g)].map(m => m[1].trim());
    return {
      id: 'arxiv:' + (id.split('/abs/')[1] || id),
      source: 'arXiv',
      title: g('title').replace(/\s+/g, ' '),
      authors,
      abs: g('summary').replace(/\s+/g, ' '),
      url: id,
      pdf: id.replace('/abs/', '/pdf/'),
      published: (g('published') || '').slice(0, 10),
      primary: (e.match(/<primary_category[^>]*term="([^"]+)"/) || [,''])[1],
      comment: (e.match(/<arxiv:comment[^>]*>([\s\S]*?)<\/arxiv:comment>/) || [,''])[1].trim()
    };
  });
}

// ---------- 文章全文逐段翻译 ----------
async function fetchArticle(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LingjiBot/1.0)' } });
  if (!r.ok) throw new Error('fetch ' + r.status);
  const html = await r.text();
  // 去掉 script/style
  const cleaned = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  // 提取段落文本
  const paras = [...cleaned.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(m => m[1].replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim())
    .filter(p => p.length > 30);
  // 兜底：按换行切
  const text = paras.length ? paras : [cleaned.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()];
  return text.slice(0, 40);
}

async function translate(text, tl = 'zh-CN') {
  const q = (text || '').slice(0, 4000);
  if (!q) return '';
  const u = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${tl}&dt=t&q=${enc(q)}`;
  const r = await fetch(u);
  if (!r.ok) throw new Error('tr ' + r.status);
  const j = await r.json();
  return (j[0] || []).map(x => x[0]).join('');
}

async function handleTranslate(text, tl) {
  try { return textOut(await translate(text, tl)); }
  catch { return textOut('（翻译失败）', 502); }
}

export default {
  async fetch(req) {
    const url = new URL(req.url);
    const p = url.pathname;
    if (req.method === 'OPTIONS') return preflight();
    try {
      // 翻译任意文本：GET /tr?text=...&tl=zh-CN
      if (p === '/tr') {
        const text = url.searchParams.get('text') || '';
        return await handleTranslate(text, url.searchParams.get('tl') || 'zh-CN');
      }
      // 文章全文逐段翻译：GET /article?url=...&tl=zh-CN -> [{orig,zh}]
      if (p === '/article') {
        const target = url.searchParams.get('url');
        if (!target) return json({ error: 'missing url' }, 400);
        const paras = await fetchArticle(target);
        const out = [];
        for (const para of paras) out.push({ orig: para, zh: await translate(para).catch(() => '') });
        return json(out);
      }
      // arXiv
      if (p === '/arxiv') {
        const q = url.searchParams.get('q') || 'cs.CV';
        const max = Math.min(Number(url.searchParams.get('max')) || 40, 100);
        const u = `https://export.arxiv.org/api/query?search_query=${enc(q)}&start=0&max_results=${max}&sortBy=submittedDate&sortOrder=descending`;
        const xml = await (await fetch(u)).text();
        return json(parseArxiv(xml));
      }
      // Hacker News
      if (p === '/hn') {
        const query = url.searchParams.get('query') || 'AI OR LLM';
        const u = `https://hn.algolia.com/api/v1/search?query=${enc(query)}&tags=story&hitsPerPage=25&numericFilters=points%3E30`;
        const j = await (await fetch(u)).json();
        return json(j.hits || []);
      }
      // OpenReview
      if (p === '/openreview') {
        const term = url.searchParams.get('term') || 'multimodal';
        const u = `https://api2.openreview.net/notes/search?term=${enc(term)}&limit=25&type=terms`;
        const j = await (await fetch(u)).json();
        const out = (j.notes || []).map(n => {
          const c = n.content || {};
          const val = x => (x && typeof x === 'object' ? x.value : x) || '';
          return { id: 'or:' + n.id, source: 'OpenReview', title: String(val(c.title)).replace(/\s+/g, ' '), authors: [].concat(val(c.authors) || []), abs: String(val(c.abstract) || ''), url: 'https://openreview.net/forum?id=' + n.id, pdf: 'https://openreview.net/pdf?id=' + n.id, published: n.cdate ? new Date(n.cdate).toISOString().slice(0, 10) : '', venue: String(val(c.venue) || '') };
        });
        return json(out);
      }
      // Papers with Code
      if (p === '/pwc') {
        const q = url.searchParams.get('q') || 'diffusion';
        const u = `https://paperswithcode.com/api/v1/papers/?q=${enc(q)}&items_per_page=20`;
        const j = await (await fetch(u)).json();
        const out = (j.results || []).map(pp => ({ id: 'pwc:' + pp.id, source: 'Papers with Code', title: pp.title, authors: pp.authors || [], abs: pp.abstract || '', url: pp.url_abs || pp.url_pdf, pdf: pp.url_pdf, published: pp.published || '', code: true }));
        return json(out);
      }
      return json({ error: 'unknown route', hint: '/arxiv /hn /openreview /pwc /tr /article' }, 404);
    } catch (e) {
      return json({ error: String(e.message || e) }, 502);
    }
  }
};
