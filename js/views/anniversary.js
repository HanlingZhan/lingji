// ============ 纪念日 / 生理周期 / 智能礼物推荐 ============
import { store, S } from '../store.js';
import { $, $$, esc, ymd, addDays, diffDays, startOfDay, fmtRel, uid, weekdayCN } from '../utils.js';
import { formModal, toast, confirmDlg, emptyBox, modal } from '../ui.js';
import { GIFT_DB, INTEREST_TAGS, STYLE_TAGS, OCCASIONS } from '../data/gifts.js';

const TYPES = [
  { v: 'yearly', t: '每年重复（生日 / 恋爱纪念日）' },
  { v: 'days', t: '天数里程碑（如 10000 天）' },
  { v: 'once', t: '单次节点（学术 / 事件）' }
];

// ---------- 计算 ----------
export function anniInfo(a) {
  const base = new Date(a.date + (a.date.length <= 10 ? 'T00:00' : ''));
  const N = startOfDay(new Date());
  const passed = diffDays(N, base);
  if (a.type === 'days') {
    const target = addDays(base, a.targetDays || 10000);
    return { base, passed, next: target, left: diffDays(target, N), label: `第 ${a.targetDays} 天` };
  }
  if (a.type === 'once') return { base, passed, next: base, left: diffDays(base, N), label: '' };
  let next = new Date(base); next.setFullYear(N.getFullYear());
  if (diffDays(next, N) < 0) next.setFullYear(N.getFullYear() + 1);
  const nth = next.getFullYear() - base.getFullYear();
  return { base, passed, next, left: diffDays(next, N), label: nth > 0 ? `第 ${nth} 周年` : '' };
}
export function upcomingAnnis(limit = 6) {
  return S().anniversaries.map(a => ({ a, i: anniInfo(a) }))
    .filter(x => x.i.left >= 0 || x.a.type === 'yearly')
    .sort((x, y) => (y.a.pinned ? 1 : 0) - (x.a.pinned ? 1 : 0) || x.i.left - y.i.left)
    .slice(0, limit);
}
export function predictNext(cy) {
  const recs = (cy.records || []).slice().sort((a, b) => new Date(a.start) - new Date(b.start));
  if (!recs.length) return null;
  let avg = cy.avgLen || 28;
  if (recs.length >= 2) {
    const gaps = [];
    for (let i = 1; i < recs.length; i++) gaps.push(diffDays(new Date(recs[i].start), new Date(recs[i - 1].start)));
    const valid = gaps.filter(g => g > 15 && g < 60).slice(-6);
    if (valid.length) avg = Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
  }
  const last = new Date(recs[recs.length - 1].start);
  let start = addDays(last, avg);
  const N = startOfDay(new Date());
  let guard = 0;
  while (diffDays(start, N) < -3 && guard++ < 24) start = addDays(start, avg);
  const dur = cy.duration || 5;
  return { start, end: addDays(start, dur - 1), avg, last, dur, ovulation: addDays(start, -14) };
}

// ---------- 礼物推荐引擎 ----------
export function recommend(person, occasion, budget) {
  const tags = new Set([...(person?.interests || []), ...(person?.style || [])]);
  const taboo = (person?.taboo || []).map(x => x.toLowerCase());
  const lo = budget?.lo ?? person?.budgetLo ?? 0, hi = budget?.hi ?? person?.budgetHi ?? 99999;
  return GIFT_DB.map(g => {
    let score = 0;
    const hitTags = g.tags.filter(t => tags.has(t));
    score += hitTags.length * 30;
    if (occasion && g.occ.includes(occasion)) score += 25;
    const mid = (g.lo + g.hi) / 2;
    if (g.lo <= hi && g.hi >= lo) score += 20; else score -= 25;
    if (mid >= lo && mid <= hi) score += 10;
    if (taboo.some(t => t && (g.n.toLowerCase().includes(t) || g.cat.toLowerCase().includes(t) || g.tags.some(x => x.toLowerCase() === t)))) score = -1000;
    return { ...g, score, hitTags };
  }).filter(g => g.score > 0).sort((a, b) => b.score - a.score);
}

let host = null, tab = 'anni';
export function render(el) { host = el; rerender(); }

function rerender() {
  if (!host) return;
  host.innerHTML = `
  <div class="row" style="margin-bottom:14px">
    <div class="seg" id="aTab">
      ${[['anni', '💝 纪念日'], ['cycle', '🌸 生理周期'], ['gift', '🎁 礼物推荐']].map(([v, t]) => `<button data-v="${v}" class="${tab === v ? 'active' : ''}">${t}</button>`).join('')}
    </div>
    <div class="spacer"></div>
    <div id="tabActions"></div>
  </div>
  <div id="aBody"></div>`;
  $('#aTab').onclick = e => { const b = e.target.closest('[data-v]'); if (b) { tab = b.dataset.v; rerender(); } };
  if (tab === 'anni') drawAnni();
  else if (tab === 'cycle') drawCycle();
  else drawGift();
}

// ---------- 纪念日 ----------
function drawAnni() {
  $('#tabActions').innerHTML = `<button class="primary-btn" id="addAnni">＋ 新建纪念日</button>`;
  const list = S().anniversaries.map(a => ({ a, i: anniInfo(a) }))
    .sort((x, y) => (y.a.pinned ? 1 : 0) - (x.a.pinned ? 1 : 0) || x.i.left - y.i.left);
  $('#aBody').innerHTML = list.length ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr))">
    ${list.map(({ a, i }) => `
      <div class="anni ${a.pinned ? 'pinned' : ''}">
        <div class="days"><b>${i.left >= 0 ? i.left : '—'}</b><span>${i.left >= 0 ? '天后' : '已过'}</span></div>
        <div style="flex:1">
          <div style="font-weight:700;font-size:14.5px">${a.pinned ? '📌 ' : ''}${esc(a.title)} ${i.label ? `<span class="chip">${i.label}</span>` : ''}</div>
          <div class="small muted">${ymd(i.next)} ${weekdayCN(i.next)} · ${fmtRel(i.next)}</div>
          <div class="small muted">起始 ${ymd(i.base)}${i.passed >= 0 ? ` · 已相伴 <b style="color:var(--blue-600)">${i.passed}</b> 天` : ''}</div>
          ${a.note ? `<div class="small" style="margin-top:4px">${esc(a.note)}</div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;gap:5px">
          <button class="btn sm" data-gift="${a.id}">🎁 礼物</button>
          <button class="btn sm" data-eda="${a.id}">编辑</button>
          <button class="btn sm" data-pin="${a.id}">${a.pinned ? '取消置顶' : '置顶'}</button>
        </div>
      </div>`).join('')}</div>
    <div class="card" style="margin-top:16px"><div class="card-head"><h3>📆 未来 12 个月纪念日时间线</h3></div><div class="card-body">
      ${timeline(list)}
    </div></div>` : emptyBox('还没有纪念日，点击右上角创建。支持恋爱纪念日、万天纪念日、生日、学术节点等', '💝');

  $('#addAnni') && ($('#addAnni').onclick = () => openAnniForm());
  $('#aBody').onclick = e => {
    const g = e.target.closest('[data-gift]'); if (g) { const a = S().anniversaries.find(x => x.id === g.dataset.gift); tab = 'gift'; rerender(); setTimeout(() => runRecommend(a), 30); return; }
    const ed = e.target.closest('[data-eda]'); if (ed) return openAnniForm(S().anniversaries.find(x => x.id === ed.dataset.eda));
    const p = e.target.closest('[data-pin]'); if (p) { const a = S().anniversaries.find(x => x.id === p.dataset.pin); store.patch('anniversaries', a.id, { pinned: !a.pinned }); rerender(); }
  };
}
function timeline(list) {
  const items = list.filter(x => x.i.left >= 0 && x.i.left <= 366).sort((a, b) => a.i.left - b.i.left);
  if (!items.length) return '<p class="muted small">未来一年内暂无纪念日</p>';
  return items.map(({ a, i }) => `<div class="list-item">
    <div style="width:74px" class="small muted">${ymd(i.next).slice(5)}</div>
    <div style="flex:1"><div class="t">${esc(a.title)} ${i.label ? `<span class="chip">${i.label}</span>` : ''}</div>
    <div class="progress" style="margin-top:5px"><i style="width:${Math.max(2, 100 - i.left / 3.66)}%"></i></div></div>
    <div class="chip ${i.left <= 7 ? 'danger' : i.left <= 30 ? 'warn' : 'gray'}">${i.left} 天</div>
  </div>`).join('');
}

export function openAnniForm(rec = null) {
  formModal({
    title: rec ? '编辑纪念日' : '新建纪念日',
    fields: [
      { key: 'title', label: '名称', required: true, span: 'full', value: rec?.title || '', placeholder: '如：与 TA 相识纪念日 / 10000 天纪念' },
      { key: 'type', label: '类型', type: 'select', value: rec?.type || 'yearly', options: TYPES },
      { key: 'date', label: '起始 / 目标日期', type: 'date', required: true, value: rec?.date || ymd(new Date()) },
      { key: 'targetDays', label: '目标天数（天数里程碑类型填写）', type: 'number', value: rec?.targetDays || 10000, min: 1 },
      { key: 'advance', label: '提前提醒天数', type: 'number', value: rec?.advance ?? 3, min: 0, max: 90 },
      { key: 'giftOn', label: '临近时自动生成礼物清单', type: 'checkbox', value: rec?.giftOn ?? true },
      { key: 'pinned', label: '置顶展示', type: 'checkbox', value: rec?.pinned ?? false },
      { key: 'note', label: '备注', type: 'textarea', span: 'full', value: rec?.note || '' }
    ],
    onSubmit: d => {
      const data = { ...d, targetDays: Number(d.targetDays) || 10000, advance: Number(d.advance) || 0 };
      if (rec) store.patch('anniversaries', rec.id, data); else store.add('anniversaries', data);
      toast('已保存', 'ok'); rerender();
    }
  });
}

// ---------- 生理周期 ----------
function drawCycle() {
  const cy = S().cycle; const p = predictNext(cy);
  const recs = (cy.records || []).slice().sort((a, b) => new Date(b.start) - new Date(a.start));
  $('#tabActions').innerHTML = `<button class="btn" id="cySet">周期设置</button> <button class="primary-btn" id="cyAdd">＋ 记录本次起始</button>`;
  $('#aBody').innerHTML = `
  <div class="grid" style="grid-template-columns:1.2fr 1fr">
    <div class="card"><div class="card-head"><h3>🌸 下次经期预测</h3><span class="chip">平均周期 ${p?.avg || cy.avgLen} 天</span></div>
      <div class="card-body">
        ${p ? `
        <div class="row" style="gap:22px;margin-bottom:14px">
          <div><div class="small muted">预计开始</div><b style="font-size:22px;color:var(--pink)">${ymd(p.start)}</b><div class="small">${fmtRel(p.start)} · ${weekdayCN(p.start)}</div></div>
          <div><div class="small muted">预计结束</div><b style="font-size:18px">${ymd(p.end)}</b><div class="small">持续 ${p.dur} 天</div></div>
          <div><div class="small muted">预计排卵日</div><b style="font-size:18px">${ymd(p.ovulation)}</b></div>
        </div>
        <div class="cycle-bar">${bar(p)}</div>
        <div class="row small muted" style="margin-top:6px;gap:14px"><span>🩸 经期</span><span>🌱 卵泡期</span><span>🥚 排卵期</span><span>🌙 黄体期</span></div>
        <p class="small muted" style="margin-top:10px">系统将在预计开始前 ${cy.advance} 天推送提醒。预测基于最近 ${Math.min(6, Math.max(1, recs.length))} 次记录的平均间隔，记录越多越准确；仅供参考，不作为医学依据。</p>
        ` : emptyBox('还没有记录，点击右上角「记录本次起始」开始追踪', '🌸')}
      </div>
    </div>
    <div class="card"><div class="card-head"><h3>📊 历史周期</h3><span class="chip gray">${recs.length} 次</span></div>
      <div class="card-body" style="max-height:420px;overflow:auto">
        ${recs.length ? recs.map((r, i) => {
    const nextR = recs[i - 1];
    const gap = nextR ? diffDays(new Date(nextR.start), new Date(r.start)) : null;
    return `<div class="list-item"><div style="flex:1"><div class="t">${r.start}${r.end ? ` ~ ${r.end}` : ''}</div>
        <div class="s">${gap ? `距下次 ${gap} 天` : '最近一次'}${r.note ? ' · ' + esc(r.note) : ''}</div></div>
        <button class="btn sm danger" data-delcy="${r.id}">删除</button></div>`;
  }).join('') : emptyBox('暂无记录')}
      </div>
    </div>
  </div>`;
  $('#cyAdd').onclick = () => cycleForm();
  $('#cySet').onclick = () => cycleSettings();
  $('#aBody').onclick = e => {
    const d = e.target.closest('[data-delcy]');
    if (d) confirmDlg('删除该条周期记录？', () => { store.update(s => s.cycle.records = s.cycle.records.filter(r => r.id !== d.dataset.delcy)); rerender(); });
  };
}
function bar(p) {
  const total = p.avg, dur = p.dur;
  const seg = [[dur, 'var(--pink)'], [Math.max(1, 14 - dur - 2), '#9ad0ff'], [3, 'var(--purple)'], [Math.max(1, total - 14 - 1), '#c9d8ee']];
  return seg.map(([n, c]) => `<i style="width:${(n / total * 100).toFixed(1)}%;background:${c}"></i>`).join('');
}
function cycleForm() {
  formModal({
    title: '记录经期', fields: [
      { key: 'start', label: '本次开始日期', type: 'date', required: true, value: ymd(new Date()) },
      { key: 'end', label: '结束日期（可后补）', type: 'date', value: '' },
      { key: 'note', label: '备注（症状 / 用药等）', type: 'textarea', span: 'full', value: '' }
    ],
    onSubmit: d => {
      store.update(s => { s.cycle.records.push({ id: uid(), ...d, updatedAt: Date.now() }); });
      toast('已记录', 'ok'); rerender();
    }
  });
}
function cycleSettings() {
  const cy = S().cycle;
  formModal({
    title: '生理周期设置', fields: [
      { key: 'avgLen', label: '平均周期长度（天）', type: 'number', value: cy.avgLen, min: 15, max: 60, hint: '有 2 次以上记录后系统会自动学习实际间隔' },
      { key: 'duration', label: '平均持续天数', type: 'number', value: cy.duration, min: 1, max: 15 },
      { key: 'advance', label: '提前提醒天数', type: 'number', value: cy.advance, min: 0, max: 10 }
    ],
    onSubmit: d => { store.update(s => { Object.assign(s.cycle, { avgLen: +d.avgLen, duration: +d.duration, advance: +d.advance }); }); toast('已保存', 'ok'); rerender(); }
  });
}

// ---------- 人物卡片（3D 立体小人 + 标签环绕） ----------
function avatarSVG(p) {
  const u = ((p && p.id) || 'x').replace(/[^a-z0-9]/gi, '') || 'x';
  const g = p && p.gender;
  const skin = '#ffd9b8';
  const hair = g === '女' ? '#6b3f2a' : g === '男' ? '#23252b' : '#4a4f5a';
  const top1 = g === '女' ? '#ff9ec0' : g === '男' ? '#4f8cff' : '#8a93a6';
  const top2 = g === '女' ? '#ff5e8a' : g === '男' ? '#2563eb' : '#5b6478';
  const hairFront = g === '女'
    ? `<path d="M34 70 C28 34 112 34 106 70 C108 92 98 104 94 104 L94 60 C94 42 84 36 70 36 C56 36 46 42 46 60 L46 104 C42 104 32 92 34 70 Z" fill="${hair}"/>`
    : `<path d="M40 58 C40 32 100 32 100 58 C100 46 88 38 70 38 C52 38 40 46 40 58 Z" fill="${hair}"/><path d="M40 58 C36 60 34 70 36 80 C40 74 42 66 42 58 Z" fill="${hair}"/><path d="M100 58 C104 60 106 70 104 80 C100 74 98 66 98 58 Z" fill="${hair}"/>`;
  return `<div class="pc-avatar"><svg class="pc-avatar-svg" viewBox="0 0 140 160" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="bg${u}" cx="50%" cy="36%" r="62%"><stop offset="0%" stop-color="#ffffff" stop-opacity=".95"/><stop offset="100%" stop-color="#dbe7ff" stop-opacity="0"/></radialGradient>
      <linearGradient id="top${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${top1}"/><stop offset="100%" stop-color="${top2}"/></linearGradient>
      <radialGradient id="sk${u}" cx="40%" cy="32%" r="72%"><stop offset="0%" stop-color="#ffe9d6"/><stop offset="100%" stop-color="${skin}"/></radialGradient>
    </defs>
    <ellipse cx="70" cy="60" rx="62" ry="66" fill="url(#bg${u})"/>
    <path d="M20 162 C22 120 44 102 70 102 C96 102 118 120 120 162 Z" fill="url(#top${u})"/>
    <rect x="60" y="84" width="20" height="24" rx="9" fill="${skin}"/>
    <circle cx="70" cy="58" r="30" fill="url(#sk${u})"/>
    ${hairFront}
    <circle cx="60" cy="58" r="3.3" fill="#3a2b22"/><circle cx="80" cy="58" r="3.3" fill="#3a2b22"/>
    <path d="M61 72 Q70 80 79 72" stroke="#c0556b" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <circle cx="54" cy="66" r="3" fill="#ff9aa8" opacity=".5"/><circle cx="86" cy="66" r="3" fill="#ff9aa8" opacity=".5"/>
  </svg></div>`;
}
function personCard(p, i) {
  const all = [...new Set([...(p.interests || []), ...(p.style || [])])];
  const orbitTags = all.slice(0, 14);
  const orbit = orbitTags.map((t, k) => {
    const a = (k * 360 / Math.max(1, orbitTags.length)).toFixed(1);
    return `<span class="orbit-tag" style="--a:${a}deg" data-rm="${esc(t)}" title="点击移除：${esc(t)}"><span class="orbit-tag-inner">${esc(t)}</span></span>`;
  }).join('');
  const tags = all.map(t => `<span class="pc-tag">${esc(t)}<span class="pc-x" data-rm="${esc(t)}">×</span></span>`).join('');
  return `<div class="person-card" data-pid="${p.id}" style="--d:${((i || 0) * 0.06).toFixed(2)}s">
    <div class="pc-top">
      <div class="pc-avatar-stage">${avatarSVG(p)}
        <div class="pc-orbit">${orbit}</div>
      </div>
      <div class="pc-info">
        <div class="pc-name">${esc(p.name)}${p.relation ? ` <span class="chip gray">${esc(p.relation)}</span>` : ''}${p.gender ? ` <span class="gender-ico" title="性别">${p.gender === '女' ? '♀' : '♂'}</span>` : ''}</div>
        <div class="pc-meta">${[p.occupation, p.age ? p.age + ' 岁' : ''].filter(Boolean).join(' · ') || '暂无更多信息'}</div>
        <div class="pc-tags">${tags || '<span class="small muted">未设置标签</span>'}</div>
      </div>
    </div>
    <div class="pc-actions">
      <button class="btn sm" data-rec="${p.id}">🎁 推荐</button>
      <button class="btn sm" data-edp="${p.id}">编辑</button>
    </div>
  </div>`;
}
function removeTag(pid, tag) {
  const p = S().people.find(x => x.id === pid); if (!p) return;
  store.patch('people', pid, {
    interests: (p.interests || []).filter(t => t !== tag),
    style: (p.style || []).filter(t => t !== tag)
  });
  toast('已移除标签：' + tag, 'ok'); rerender();
}
function bindAvatarTilt() {
  $$('.pc-avatar-stage').forEach(stage => {
    const av = stage.querySelector('.pc-avatar'); if (!av) return;
    stage.addEventListener('pointermove', e => {
      const r = stage.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      av.style.setProperty('--rx', ((x - 0.5) * 22).toFixed(1) + 'deg');
      av.style.setProperty('--ry', (-(y - 0.5) * 22).toFixed(1) + 'deg');
    });
    stage.addEventListener('pointerleave', () => { av.style.setProperty('--rx', '0deg'); av.style.setProperty('--ry', '0deg'); });
  });
}

// ---------- 礼物推荐 ----------
function drawGift() {
  const st = S();
  $('#tabActions').innerHTML = `<button class="btn" id="addPerson">＋ 人物标签</button> <button class="primary-btn" id="genGift">✨ 生成礼物清单</button>`;
  const saved = st.gifts;
  $('#aBody').innerHTML = `
  <div class="grid" style="grid-template-columns:320px 1fr">
    <div class="card"><div class="card-head"><h3>👤 人物档案</h3></div><div class="card-body">
      ${st.people.length ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px">${st.people.map((p, i) => personCard(p, i)).join('')}</div>` : emptyBox('先录入本人与对象的偏好标签', '👤')}
    </div></div>
    <div class="card"><div class="card-head"><h3>🎁 推荐清单</h3><div class="actions"><span class="small muted">按匹配度排序</span></div></div>
      <div class="card-body" id="giftList">${emptyBox('点击右上角「生成礼物清单」或对某个人物点「推荐」', '🎁')}</div>
    </div>
  </div>
  <div class="card" style="margin-top:16px"><div class="card-head"><h3>⭐ 我的收藏与购买记录</h3><span class="chip gray">${saved.length}</span></div>
    <div class="card-body"><div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr))">
      ${saved.length ? saved.map(g => `<div class="gift ${g.bought ? 'bought' : ''}">
        <h5>${g.bought ? '✅ ' : '⭐ '}${esc(g.name)}</h5>
        <div class="small muted">${esc(g.cat)} · 适用：${esc(g.forName || '—')}</div>
        <div class="price">¥${g.lo} - ${g.hi}</div>
        ${g.note ? `<div class="small" style="margin-top:4px">${esc(g.note)}</div>` : ''}
        <div class="row" style="margin-top:8px">
          <button class="btn sm" data-bought="${g.id}">${g.bought ? '取消已购' : '标记已购'}</button>
          <button class="btn sm" data-noteg="${g.id}">备注</button>
          <button class="btn sm danger" data-delg="${g.id}">移除</button>
        </div></div>`).join('') : emptyBox('还没有收藏的礼物')}
    </div></div>
  </div>`;
  $('#addPerson').onclick = () => personForm();
  $('#genGift').onclick = () => {
    const p = S().people[0];
    if (!p) return toast('请先录入人物档案', 'err');
    runRecommend(null, p);
  };
  $('#aBody').onclick = e => {
    const rm = e.target.closest('[data-rm]');
    if (rm) { const card = e.target.closest('.person-card'); if (card) return removeTag(card.dataset.pid, rm.dataset.rm); }
    const r = e.target.closest('[data-rec]'); if (r) return runRecommend(null, S().people.find(p => p.id === r.dataset.rec));
    const ed = e.target.closest('[data-edp]'); if (ed) return personForm(S().people.find(p => p.id === ed.dataset.edp));
    const b = e.target.closest('[data-bought]'); if (b) { const g = S().gifts.find(x => x.id === b.dataset.bought); store.patch('gifts', g.id, { bought: !g.bought }); return rerender(); }
    const dg = e.target.closest('[data-delg]'); if (dg) { store.remove('gifts', dg.dataset.delg); return rerender(); }
    const ng = e.target.closest('[data-noteg]'); if (ng) {
      const g = S().gifts.find(x => x.id === ng.dataset.noteg);
      formModal({ title: '补充备注', fields: [{ key: 'note', label: '备注', type: 'textarea', span: 'full', value: g.note || '' }], onSubmit: d => { store.patch('gifts', g.id, d); rerender(); } });
    }
    const sv = e.target.closest('[data-save]');
    if (sv) {
      const item = JSON.parse(decodeURIComponent(sv.dataset.save));
      store.add('gifts', { ...item, fav: true, bought: false });
      toast('已收藏', 'ok'); rerender();
    }
  };
  bindAvatarTilt();
}

function runRecommend(anni = null, person = null) {
  const st = S();
  person = person || st.people[0];
  if (!person) { toast('请先录入人物档案', 'err'); return personForm(); }
  const occDefault = anni ? (/万天|天纪念/.test(anni.title) ? '万天纪念日' : /生日/.test(anni.title) ? '生日' : /恋爱|相识|在一起/.test(anni.title) ? '恋爱纪念日' : '日常') : '恋爱纪念日';
  formModal({
    title: '生成个性化礼物清单',
    fields: [
      { key: 'pid', label: '送礼对象', type: 'select', value: person.id, options: st.people.map(p => ({ v: p.id, t: p.name })) },
      { key: 'occ', label: '场合', type: 'select', value: occDefault, options: OCCASIONS.map(o => ({ v: o, t: o })) },
      { key: 'lo', label: '预算下限 ¥', type: 'number', value: person.budgetLo ?? 100 },
      { key: 'hi', label: '预算上限 ¥', type: 'number', value: person.budgetHi ?? 800 }
    ],
    submitText: '生成清单',
    onSubmit: d => {
      const p = st.people.find(x => x.id === d.pid);
      const list = recommend(p, d.occ, { lo: +d.lo, hi: +d.hi });
      renderGiftList(list, p, d.occ);
      toast(`已为「${p.name}」生成 ${list.length} 条推荐`, 'ok');
    }
  });
}
// 电商直达搜索链接（根据礼物名生成淘宝 / 拼多多搜索 URL）
function shopUrl(plat, q) {
  const enc = encodeURIComponent(q);
  if (plat === 'tb') return `https://s.taobao.com/search?q=${enc}`;
  if (plat === 'pdd') return `https://mobile.yangkeduo.com/search_result.html?search_key=${enc}`;
  return '#';
}
function renderGiftList(list, person, occ) {
  const el = $('#giftList'); if (!el) return;
  const byCat = {};
  list.forEach(g => (byCat[g.cat] = byCat[g.cat] || []).push(g));
  el.innerHTML = `<div class="row small muted" style="margin-bottom:10px">对象：<b>${esc(person.name)}</b> · 场合：${esc(occ)} · 共 ${list.length} 条，按品类分组</div>` +
    Object.entries(byCat).map(([cat, items]) => `
    <div style="margin-bottom:14px"><div class="sec-title" style="font-size:13.5px">${esc(cat)} <span class="chip gray">${items.length}</span></div>
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(230px,1fr))">
      ${items.map(g => `<div class="gift">
        <h5>${esc(g.n)}</h5>
        <div class="price">¥${g.lo} - ${g.hi}</div>
        <div class="small muted" style="margin:4px 0">${esc(g.why)}</div>
        <div class="row">${g.hitTags.map(t => `<span class="chip">${esc(t)}</span>`).join('')}<span class="score ${g.score >= 80 ? 'hi' : ''}">匹配 ${Math.min(99, g.score)}</span></div>
        <div class="row" style="margin-top:8px;gap:6px">
          <a class="btn sm" target="_blank" rel="noopener" href="${shopUrl('tb', g.n)}">🛒 淘宝搜</a>
          <a class="btn sm" target="_blank" rel="noopener" href="${shopUrl('pdd', g.n)}">🛒 拼多多搜</a>
          <button class="btn sm" data-save="${encodeURIComponent(JSON.stringify({ name: g.n, cat: g.cat, lo: g.lo, hi: g.hi, forName: person.name, occ }))}">⭐ 收藏</button>
        </div>
      </div>`).join('')}
    </div></div>`).join('');
}

function personForm(rec = null) {
  formModal({
    title: rec ? '编辑人物档案' : '新建人物档案', wide: true,
    fields: [
      { key: 'name', label: '称呼', required: true, value: rec?.name || '' },
      { key: 'gender', label: '性别', type: 'select', value: rec?.gender || '', options: [{ v: '', t: '不填' }, { v: '男', t: '男' }, { v: '女', t: '女' }] },
      { key: 'relation', label: '关系', type: 'select', value: rec?.relation || '对象', options: ['对象', '本人', '家人', '朋友', '导师'].map(v => ({ v, t: v })) },
      { key: 'occupation', label: '职业（选填，可留空）', value: rec?.occupation || '', placeholder: '如：博士在读 / 设计师 / 教师' },
      { key: 'age', label: '年龄（选填，可留空）', type: 'number', value: rec?.age ?? '', min: 1, max: 120, placeholder: '如：24' },
      { key: 'interests', label: '兴趣偏好标签', type: 'tagpick', span: 'full', value: rec?.interests || [], suggest: INTEREST_TAGS, hint: '点击下方已有标签可选取/取消，也可自定义添加，数量不限（越准推荐越对）' },
      { key: 'style', label: '风格取向', type: 'tagpick', span: 'full', value: rec?.style || [], suggest: STYLE_TAGS, hint: '点击下方风格词选取，也可自定义，数量不限（越细定位越准）' },
      { key: 'taboo', label: '禁忌品类', type: 'tags', span: 'full', value: rec?.taboo || [], placeholder: '如：香水, 美妆（命中将直接排除）' },
      { key: 'budgetLo', label: '常用预算下限 ¥', type: 'number', value: rec?.budgetLo ?? 100 },
      { key: 'budgetHi', label: '常用预算上限 ¥', type: 'number', value: rec?.budgetHi ?? 800 },
      { key: 'sizes', label: '尺码信息', span: 'full', value: rec?.sizes || '', placeholder: '如：上衣 M / 裙腰 66cm / 鞋 37 / 戒指 12 号' },
      { key: 'note', label: '其他备注', type: 'textarea', span: 'full', value: rec?.note || '' }
    ],
    onSubmit: d => {
      const data = { ...d, budgetLo: +d.budgetLo, budgetHi: +d.budgetHi };
      if (rec) store.patch('people', rec.id, data); else store.add('people', data);
      toast('已保存', 'ok'); rerender();
    }
  });
}
