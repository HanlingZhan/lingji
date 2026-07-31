// ============ 英语单词巧记与艾宾浩斯复习 ============
import { store, S } from '../store.js';
import { $, esc, ymd, addDays, diffDays, startOfDay, download, pick } from '../utils.js';
import { formModal, toast, confirmDlg, emptyBox, modal } from '../ui.js';
import { DECKS, EBBINGHAUS } from '../data/words.js';

let host = null, tab = 'today', idx = 0;

function allWords(deck = S().words.deck) {
  if (deck === 'custom') return S().words.custom || [];
  return DECKS[deck]?.words || [];
}
const keyOf = (deck, w) => `${deck}:${w}`;

export function ensureToday() {
  const st = S(); const w = st.words; const today = ymd(new Date());
  if (w.lastPush === today && w.todayList?.length) return;
  const deck = w.deck;
  let pool = allWords(deck).filter(x => !Object.keys(w.records).includes(keyOf(deck, x.w)));
  // 随机打乱（Fisher-Yates），避免每天从 a 顺序开始
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const news = pool.slice(0, w.perDay).map(x => keyOf(deck, x.w));
  store.update(s => { s.words.lastPush = today; s.words.todayList = news; });
}
export function dueReviews() {
  const w = S().words; const today = ymd(new Date());
  return Object.entries(w.records).filter(([k, r]) => r.status !== 'mastered' && r.next && r.next <= today).map(([k]) => k);
}
export function wordOf(key) {
  const [deck, ...rest] = key.split(':'); const w = rest.join(':');
  return (deck === 'custom' ? S().words.custom : DECKS[deck]?.words || []).find(x => x.w === w);
}
export function todayStats() {
  const w = S().words;
  const total = allWords().length;
  const learned = Object.keys(w.records).filter(k => k.startsWith(w.deck + ':')).length;
  return { total, learned, newToday: (w.todayList || []).length, due: dueReviews().length, mastered: Object.values(w.records).filter(r => r.status === 'mastered').length, hard: Object.values(w.records).filter(r => r.status === 'difficult').length };
}

function mark(key, level) { // level: know / vague / forget
  const st = S(); const rec = st.words.records[key] || { stage: 0, status: 'learning', createdAt: Date.now() };
  let stage = rec.stage ?? 0;
  if (level === 'know') stage += 1;
  else if (level === 'vague') stage = Math.max(0, stage);
  else stage = 0;
  const status = stage >= EBBINGHAUS.length - 1 ? 'mastered' : (level === 'forget' ? 'difficult' : 'learning');
  const next = ymd(addDays(new Date(), EBBINGHAUS[Math.min(stage, EBBINGHAUS.length - 1)] || 1));
  store.update(s => { s.words.records[key] = { ...rec, stage, status, next, lastAt: Date.now() }; });
}

export function render(el) { host = el; ensureToday(); rerender(); }

function rerender() {
  if (!host) return;
  const w = S().words, st = todayStats();
  host.innerHTML = `
  <div class="row" style="margin-bottom:14px">
    <div class="seg" id="wTab">${[['today', '📖 今日学习'], ['book', '📕 生词本'], ['all', '📚 词库总览'], ['set', '⚙️ 设置']].map(([v, t]) => `<button data-v="${v}" class="${tab === v ? 'active' : ''}">${t}</button>`).join('')}</div>
    <div class="spacer"></div>
    <span class="chip">${DECKS[w.deck]?.name || '自定义词库'}</span>
    <span class="chip gray">已学 ${st.learned}/${st.total}</span>
    <span class="chip ok">已掌握 ${st.mastered}</span>
    ${st.due ? `<span class="chip warn">待复习 ${st.due}</span>` : ''}
  </div>
  <div id="wBody"></div>`;
  $('#wTab').onclick = e => { const b = e.target.closest('[data-v]'); if (b) { tab = b.dataset.v; idx = 0; rerender(); } };
  if (tab === 'today') drawToday();
  else if (tab === 'book') drawBook();
  else if (tab === 'all') drawAll();
  else drawSet();
}

function drawToday() {
  const w = S().words;
  const news = (w.todayList || []).filter(k => !w.records[k]);
  const dues = dueReviews();
  const queue = [...news.map(k => ({ k, type: 'new' })), ...dues.map(k => ({ k, type: 'review' }))];
  const total = queue.length;
  if (!total) {
    $('#wBody').innerHTML = `<div class="card"><div class="card-body">${emptyBox('今日任务已全部完成！明天继续 💪', '🎉')}
      <div class="row" style="justify-content:center"><button class="btn" id="more">再学 ${w.perDay} 个新词</button></div></div></div>` + progressCard();
    $('#more').onclick = () => {
      const deck = w.deck; let pool = allWords(deck).filter(x => !Object.keys(S().words.records).includes(keyOf(deck, x.w)));
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      const extra = pool.slice(0, w.perDay).map(x => keyOf(deck, x.w));
      if (!extra.length) return toast('本词库已全部学完 🎓', 'ok');
      store.update(s => s.words.todayList = [...(s.words.todayList || []), ...extra]); rerender();
    };
    return;
  }
  idx = Math.min(idx, total - 1);
  const cur = queue[idx]; const word = wordOf(cur.k);
  if (!word) { idx++; return drawToday(); }
  const rec = w.records[cur.k];
  $('#wBody').innerHTML = `
  <div class="row" style="margin-bottom:10px">
    <div class="progress" style="flex:1"><i style="width:${(idx / total * 100).toFixed(1)}%"></i></div>
    <span class="small muted">${idx + 1} / ${total}</span>
    <span class="chip ${cur.type === 'new' ? 'purple' : 'warn'}">${cur.type === 'new' ? '新词' : '复习 · 第 ' + ((rec?.stage || 0) + 1) + ' 轮'}</span>
  </div>
  <div class="word-card">
    <div class="row"><span class="w">${esc(word.w)}</span><span class="ph">${esc(word.p || '')}</span>
      <div class="spacer"></div><button class="btn sm" id="spk">🔊 发音</button></div>
    <div class="mean" id="meanBox" style="${cur.type === 'review' ? 'filter:blur(6px);cursor:pointer' : ''}">${esc(word.m)}</div>
    <div class="mnemonic"><b>词根词缀：</b>${esc(word.r || '—')}<br><b>联想巧记：</b>${esc(word.n || '—')}</div>
    <div class="example">${esc(word.e || '')}<div class="small muted">${esc(word.c || '')}</div></div>
  </div>
  <div class="row" style="justify-content:center;gap:10px;margin-top:6px">
    <button class="btn" data-mk="forget">😵 忘记了</button>
    <button class="btn" data-mk="vague">🤔 有点模糊</button>
    <button class="btn solid" data-mk="know">😃 认识</button>
    <button class="btn" id="addBook">📕 加入生词本</button>
    <button class="btn" id="skip">跳过 ›</button>
  </div>
  ${progressCard()}`;
  $('#meanBox').onclick = e => e.target.style.filter = 'none';
  $('#spk').onclick = () => speak(word.w);
  $('#skip').onclick = () => { idx = Math.min(idx + 1, total - 1); drawToday(); };
  $('#addBook').onclick = () => { store.update(s => { s.words.records[cur.k] = { ...(s.words.records[cur.k] || { stage: 0 }), status: 'difficult', next: ymd(addDays(new Date(), 1)) }; }); toast('已加入生词本'); idx++; drawToday(); };
  $('#wBody').querySelectorAll('[data-mk]').forEach(b => b.onclick = () => {
    mark(cur.k, b.dataset.mk);
    if (idx >= total - 1) { idx = 0; drawToday(); } else { idx++; drawToday(); }
  });
}

function progressCard() {
  const s = todayStats();
  return `<div class="stat-row" style="margin-top:16px">
    <div class="stat"><b>${s.newToday}</b><span>今日新词</span></div>
    <div class="stat"><b>${s.due}</b><span>待复习</span></div>
    <div class="stat"><b>${s.learned}</b><span>累计学习</span></div>
    <div class="stat"><b>${s.mastered}</b><span>已掌握</span></div>
    <div class="stat"><b>${s.hard}</b><span>生词本</span></div>
    <div class="stat"><b>${((s.learned / Math.max(1, s.total)) * 100).toFixed(0)}%</b><span>词库进度</span></div>
  </div>`;
}

function drawBook() {
  const w = S().words;
  const items = Object.entries(w.records).filter(([, r]) => r.status === 'difficult');
  const mastered = Object.entries(w.records).filter(([, r]) => r.status === 'mastered');
  $('#wBody').innerHTML = `
  <div class="grid" style="grid-template-columns:1fr 1fr">
    <div class="card"><div class="card-head"><h3>📕 生词本</h3><span class="chip gray">${items.length}</span>
      <div class="actions"><button class="btn sm" id="expBook">导出</button></div></div>
      <div class="card-body" style="max-height:520px;overflow:auto">
      ${items.length ? items.map(([k, r]) => { const x = wordOf(k); if (!x) return ''; return `
        <div class="list-item"><div style="flex:1">
          <div class="t">${esc(x.w)} <span class="small muted">${esc(x.p || '')}</span></div>
          <div class="s">${esc(x.m)}</div>
          <div class="s" style="color:var(--blue-600)">${esc(x.n || '')}</div>
          <div class="s muted">下次复习 ${r.next}</div>
        </div><button class="btn sm" data-mst="${esc(k)}">标记已掌握</button></div>`; }).join('') : emptyBox('生词本为空')}
      </div></div>
    <div class="card"><div class="card-head"><h3>✅ 已掌握</h3><span class="chip ok">${mastered.length}</span></div>
      <div class="card-body" style="max-height:520px;overflow:auto">
      ${mastered.length ? `<div class="row">${mastered.map(([k]) => { const x = wordOf(k); return x ? `<span class="chip ok" title="${esc(x.m)}">${esc(x.w)}</span>` : ''; }).join('')}</div>` : emptyBox('还没有已掌握的单词')}
      </div></div>
  </div>`;
  $('#wBody').onclick = e => {
    const m = e.target.closest('[data-mst]');
    if (m) { store.update(s => { s.words.records[m.dataset.mst].status = 'mastered'; s.words.records[m.dataset.mst].stage = EBBINGHAUS.length - 1; }); drawBook(); }
  };
  $('#expBook').onclick = () => {
    const rows = items.map(([k, r]) => { const x = wordOf(k); return x ? `${x.w},${x.p},"${x.m}","${x.n}",${r.next}` : ''; }).filter(Boolean);
    download('生词本.csv', '\ufeff单词,音标,释义,巧记,下次复习\n' + rows.join('\n'), 'text/csv');
  };
}

function drawAll() {
  const w = S().words; const list = allWords();
  $('#wBody').innerHTML = `<div class="card"><div class="card-head"><h3>${DECKS[w.deck]?.name || '自定义词库'}（${list.length} 词）</h3>
    <div class="actions"><input type="text" id="q" placeholder="搜索单词…" style="width:160px"></div></div>
    <div class="card-body"><div id="allList" class="grid" style="grid-template-columns:repeat(auto-fill,minmax(280px,1fr))">${list.map(cardMini).join('')}</div></div></div>`;
  $('#q').oninput = e => {
    const q = e.target.value.toLowerCase();
    $('#allList').innerHTML = list.filter(x => x.w.toLowerCase().includes(q) || x.m.includes(q)).map(cardMini).join('');
  };
}
function cardMini(x) {
  const st = S().words.records[keyOf(S().words.deck, x.w)];
  return `<div class="card" style="padding:11px 13px">
    <div class="row"><b style="color:var(--blue-700)">${esc(x.w)}</b><span class="small muted">${esc(x.p || '')}</span>
    ${st ? `<span class="chip ${st.status === 'mastered' ? 'ok' : st.status === 'difficult' ? 'danger' : 'gray'}">${st.status === 'mastered' ? '已掌握' : st.status === 'difficult' ? '生词' : '学习中'}</span>` : ''}</div>
    <div class="small">${esc(x.m)}</div>
    <div class="small muted" style="margin-top:4px">${esc(x.n || '')}</div>
  </div>`;
}

function drawSet() {
  const w = S().words;
  $('#wBody').innerHTML = `<div class="grid" style="grid-template-columns:1fr 1fr">
    <div class="card"><div class="card-head"><h3>⚙️ 学习设置</h3></div><div class="card-body">
      <label class="fld" style="margin-bottom:12px"><span>目标词库</span>
        <select id="deckSel">${[...Object.entries(DECKS).map(([v, d]) => [v, d.name + `（${d.words.length} 词）`]), ['custom', `自定义导入（${(w.custom || []).length} 词）`]].map(([v, t]) => `<option value="${v}" ${w.deck === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="fld" style="margin-bottom:12px"><span>每日新词数量：<b id="pdV">${w.perDay}</b></span>
        <input type="range" id="perDay" min="3" max="40" value="${w.perDay}"></label>
      <p class="small muted">复习计划基于艾宾浩斯记忆曲线：间隔 ${EBBINGHAUS.slice(1).join('、')} 天。标记「认识」进入下一轮，「忘记了」重置并归入生词本。</p>
      <button class="btn solid" id="saveW" style="margin-top:10px">保存设置</button>
    </div></div>
    <div class="card"><div class="card-head"><h3>📥 自定义词库导入</h3></div><div class="card-body">
      <p class="small muted">CSV 格式：单词,音标,释义,词根词缀,巧记,例句,例句译文（每行一词，首行可为表头）</p>
      <textarea id="impW" style="min-height:140px;margin:8px 0" placeholder="ubiquitous,/juːˈbɪkwɪtəs/,adj. 无处不在的,ubique(到处)+ous,优比鬼→到处都是,Attention is ubiquitous.,注意力无处不在。"></textarea>
      <div class="row"><input type="file" id="impFileW" accept=".csv,.txt"><button class="btn solid" id="doImpW">导入</button>
      <button class="btn" id="tplW">下载模板</button>
      <button class="btn danger" id="clrW">清空自定义词库</button></div>
      <p class="small muted" style="margin-top:8px">当前自定义词库：${(w.custom || []).length} 词</p>
    </div></div>
    <div class="card"><div class="card-head"><h3>🗑️ 学习记录</h3></div><div class="card-body">
      <p class="small muted">已记录 ${Object.keys(w.records).length} 个单词的学习状态。</p>
      <button class="btn danger" id="resetW" style="margin-top:8px">重置全部学习进度</button>
    </div></div>
  </div>`;
  $('#perDay').oninput = e => $('#pdV').textContent = e.target.value;
  $('#saveW').onclick = () => {
    store.update(s => { s.words.deck = $('#deckSel').value; s.words.perDay = Number($('#perDay').value); s.words.lastPush = null; s.words.todayList = []; });
    ensureToday(); toast('已保存', 'ok'); rerender();
  };
  $('#tplW').onclick = () => download('词库导入模板.csv', '\ufeff单词,音标,释义,词根词缀,巧记,例句,例句译文\nubiquitous,/juːˈbɪkwɪtəs/,adj. 无处不在的,ubique(到处)+ous,优比鬼→到处都是,Attention is ubiquitous.,注意力无处不在。\n', 'text/csv');
  $('#impFileW').onchange = async e => { const f = e.target.files[0]; if (f) $('#impW').value = await f.text(); };
  $('#doImpW').onclick = () => {
    const txt = $('#impW').value.trim(); if (!txt) return toast('请先粘贴或上传内容', 'err');
    const list = [];
    txt.split(/\r?\n/).forEach((line, i) => {
      const c = line.split(/[,\t]/).map(x => x.trim().replace(/^"|"$/g, ''));
      if (!c[0] || (i === 0 && /单词|word/i.test(c[0]))) return;
      list.push({ w: c[0], p: c[1] || '', m: c[2] || '', r: c[3] || '', n: c[4] || '', e: c[5] || '', c: c[6] || '' });
    });
    if (!list.length) return toast('未解析到有效词条', 'err');
    store.update(s => { s.words.custom = [...(s.words.custom || []), ...list]; s.words.deck = 'custom'; s.words.lastPush = null; });
    ensureToday(); toast(`导入 ${list.length} 词`, 'ok'); rerender();
  };
  $('#clrW').onclick = () => confirmDlg('清空自定义词库？', () => { store.update(s => s.words.custom = []); rerender(); });
  $('#resetW').onclick = () => confirmDlg('确定重置所有单词学习进度？不可恢复。', () => { store.update(s => { s.words.records = {}; s.words.lastPush = null; s.words.todayList = []; }); ensureToday(); rerender(); });
}

function speak(text) {
  if (!('speechSynthesis' in window)) return toast('当前浏览器不支持语音朗读', 'err');
  const u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; u.rate = .9;
  speechSynthesis.cancel(); speechSynthesis.speak(u);
}

// 首页调用
export function todayCards(n = 3) {
  ensureToday();
  const w = S().words;
  return (w.todayList || []).slice(0, n).map(k => ({ key: k, word: wordOf(k) })).filter(x => x.word);
}
