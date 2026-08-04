// ============ 健身减脂计划（针对 胯宽臀丰 / 肩颈不适 的从零开始方案） ============
// 内容依据公开健康科普（39 健康、人民网健康、减脂案例等）整理，仅供参考；医学问题请遵医嘱。
import { store, S } from '../store.js';
import { $, $$, esc, ymd, fmtAgo, download } from '../utils.js';
import { toast, emptyBox, formModal, confirmDlg } from '../ui.js';

let host = null, tab = 'plan';

export function render(el) { host = el; rerender(); }

function rerender() {
  if (!host) return;
  const f = S().fitness;
  const logs = (f.logs || []).slice().sort((a, b) => a.date < b.date ? 1 : -1);
  const last = logs[0];
  const first = (f.logs || []).slice().sort((a, b) => a.date < b.date ? -1 : 1)[0];
  const lost = (first && last) ? (first.weight - last.weight) : 0;
  const toGoal = last ? (last.weight - (f.goal || 0)) : 0;
  host.innerHTML = `
  <div class="hero" style="background:linear-gradient(120deg,var(--primary-050),color-mix(in srgb,var(--accent) 22%,var(--surface)))">
    <div class="hero-main">
      <h2>💪 温和减脂 · 从零开始的安全计划</h2>
      <p>胯宽臀丰多为遗传 + 久坐，无法「局部减脂」，但可全身减脂 + 紧致线条；肩颈不适需避开过顶负重与颈部受力的动作。本方案以「爬坡走」为主力有氧，帮你 3–6 个月逐步、可持续地瘦下来。</p>
    </div>
    <div class="hero-stats">
      <div><b>${last ? last.weight : '—'}</b><span>当前体重(斤)</span></div>
      <div><b style="color:${lost > 0 ? '#1f9d55' : 'var(--ink)'}">${lost ? (lost > 0 ? '−' : '+') + Math.abs(lost).toFixed(1) : '0'}</b><span>较起始变化</span></div>
      <div><b>${toGoal > 0 ? toGoal.toFixed(1) : '0'}</b><span>距目标(斤)</span></div>
    </div>
  </div>

  <div class="row" style="margin:14px 0">
    <div class="seg" id="fTab">
      ${[['plan', '🗓️ 分阶段计划'], ['safe', '🛡️ 安全须知'], ['move', '🤸 运动清单'], ['diet', '🥗 每日食谱'], ['log', '📈 我的进度']].map(([v, t]) => `<button data-v="${v}" class="${tab === v ? 'active' : ''}">${t}</button>`).join('')}
    </div>
  </div>
  <div id="fBody"></div>`;
  $('#fTab').onclick = e => { const b = e.target.closest('[data-v]'); if (b) { tab = b.dataset.v; rerender(); } };
  if (tab === 'plan') drawPlan();
  else if (tab === 'safe') drawSafe();
  else if (tab === 'move') drawMove();
  else if (tab === 'diet') drawDiet();
  else drawLog();
}

/* ---------- 分阶段计划 ---------- */
function drawPlan() {
  const phases = [
    { w: '第 1–2 周 · 适应期', t: '建立习惯，不追求强度', items: ['每日爬坡走 / 快走 40–60 分钟（跑步机坡度 6–10、速度 4–5 km/h 最护膝；可分 2 段）', '饭前一杯温水，主食减半、蔬菜加倍，八分饱', '学会健康饮食、戒零食与含糖饮料', '目标：体重下降约 4–6 斤'] },
    { w: '第 3–6 周 · 加量期', t: '有氧 + 轻断食', items: ['爬坡走 + 慢跑交替 50 分钟/天，每周 4–5 次（爬坡走优先：对肩颈零冲击、对臀腿更友好）', '每周一、四执行 5:2 轻断食（断食日约 800 kcal）', '非断食日继续 1500–1600 kcal 均衡饮食', '目标：再降约 8–10 斤'] },
    { w: '第 7–10 周 · 提升期', t: '16:8 + 力量 + 有氧', items: ['16:8 进食窗口（8 小时内吃完三餐）', '力量日：深蹲 / 臀桥 / 死虫 / 鸟狗，每动作 15 次 ×4 组', '有氧日：爬坡走 30 分钟 + 居家健身操（参考欧阳春晓等跟练）', '目标：再降约 8–10 斤'] },
    { w: '第 11–12 周+ · 维持期', t: '生活化减脂，防反弹', items: ['恢复较均衡饮食，保持自律', '每周 3 次爬坡走 / 慢跑 40 分钟 + 居家健身操', '每月测腰 / 臀围，体脂率比体重更重要', '目标：稳步接近目标体重并长期保持'] }
  ];
  $('#fBody').innerHTML = `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">
    ${phases.map(p => `<div class="card"><div class="card-head"><h3>${esc(p.w)}</h3></div><div class="card-body">
      <p class="small muted" style="margin-bottom:8px">${esc(p.t)}</p>
      <ul style="margin:0;padding-left:18px;line-height:1.9">${p.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
    </div></div>`).join('')}
  </div>
  <p class="small muted" style="margin-top:10px">原则：每周减重不超过体重的 1%（约 0.5–1 kg/周）；睡眠 7–8 小时；每日饮水 1.5–2L；平台期可安排 1 天轻断食或调整运动。</p>`;
}

/* ---------- 安全须知（肩颈重点） ---------- */
function drawSafe() {
  $('#fBody').innerHTML = `
  <div class="grid" style="grid-template-columns:1fr 1fr">
    <div class="card"><div class="card-head"><h3>🛡️ 开始前必读</h3></div><div class="card-body">
      <ul style="margin:0;padding-left:18px;line-height:1.9">
        <li>先做体态 / 颈椎评估，肩颈有明确疼痛或手麻请先就医，排除器质问题再运动。</li>
        <li>胯宽臀丰多为遗传 + 久坐，<b>无法局部减脂</b>；但臀桥 / 深蹲可紧致线条，并强化后链缓解腰颈负担。</li>
        <li>每周减重 ≤ 体重 1%，避免快速减肥导致皮肤松弛、代谢下降、反弹。</li>
        <li>任何上肢动作保持<b>肩胛下沉、收下巴、颈中立</b>，避免头前伸。</li>
      </ul>
    </div></div>
    <div class="card" style="border-color:#ffd54f"><div class="card-head"><h3>⚠️ 肩颈不适需避免 / 改良</h3></div><div class="card-body">
      <ul style="margin:0;padding-left:18px;line-height:1.9">
        <li>过顶杠铃 / 哑铃推举、颈后臂屈伸</li>
        <li>引体向上、大重量俯身划船（易含胸耸肩）</li>
        <li>传统仰卧起坐（颈部受力）——改「死虫式 / 卷腹替代」</li>
        <li>长时间低头看手机、圆肩驼背久坐</li>
      </ul>
      <p class="small muted" style="margin-top:8px">改良：用弹力带肩外旋、靠墙滑动、YTWL 肩袖训练代替过顶负重；核心用「死虫 / 鸟狗 / 平板（颈中立）」。</p>
    </div></div>
  </div>`;
}

/* ---------- 运动清单 ---------- */
function drawMove() {
  const ok = [
    ['爬坡走（跑步机坡度 6–10）', '护膝又练臀腿的有氧首选：坡度 8、速度 4–5 km/h，扶腰不扶把手，每次 40 分钟', 'https://search.bilibili.com/all?keyword=跑步机爬坡走'],
    ['靠墙站立', '每日 5 分钟，后脑/肩背/臀/脚跟贴墙，纠正头前伸'],
    ['散步 / 椭圆机 / 游泳', '低冲击有氧，不伤肩颈，全身燃脂'],
    ['臀桥', '强化臀大肌与后链，改善骨盆前倾，缓解腰颈'],
    ['死虫式 / 鸟狗式', '核心训练且颈部零受力'],
    ['弹力带髋外展', '紧致髋臀线条，改善「宽胯」视觉'],
    ['平板支撑（颈中立）', '收紧核心，注意下巴微收、不塌腰'],
    ['泡沫轴放松', '放松胸小肌 / 上斜方肌，减轻圆肩与颈紧张']
  ];
  const avoid = ['过顶杠铃推举', '引体向上', '颈后臂屈伸', '传统仰卧起坐', '大重量含胸俯身划船', '长时间低头久坐'];
  $('#fBody').innerHTML = `
  <div class="grid" style="grid-template-columns:1fr 1fr">
    <div class="card"><div class="card-head"><h3>✅ 肩颈友好 · 推荐</h3></div><div class="card-body">
      ${ok.map(([n, d, u]) => `<div class="list-item"><div style="flex:1"><div class="t">${esc(n)}${u ? ` <a class="small" href="${u}" target="_blank" rel="noopener">跟练 ↗</a>` : ''}</div><div class="s">${esc(d)}</div></div></div>`).join('')}
    </div></div>
    <div class="card" style="border-color:#ef9a9a"><div class="card-head"><h3>⚠️ 需避免 / 改良</h3></div><div class="card-body">
      ${avoid.map(a => `<div class="list-item"><div style="flex:1"><div class="t">${esc(a)}</div></div></div>`).join('')}
      <p class="small muted" style="margin-top:8px">建议每周：3 天有氧（以爬坡走为主）+ 2 天力量 + 每天 5 分钟靠墙站立 + 训练后拉伸。</p>
    </div></div>
  </div>
  <div class="card" style="margin-top:14px"><div class="card-head"><h3>🎬 推荐跟练（动作参考 · 点击直达）</h3><span class="chip gray">外部视频，按需取舍</span></div><div class="card-body">
    <div class="row" style="flex-wrap:wrap;gap:10px">
      <a class="btn" href="https://space.bilibili.com/493570956/" target="_blank" rel="noopener">欧阳春晓 主页 ↗</a>
      <a class="btn" href="https://www.bilibili.com/video/BV15r421F7wD/" target="_blank" rel="noopener">欧阳春晓 · 躺练普拉提虐臀100次（省膝盖）↗</a>
      <a class="btn" href="https://www.bilibili.com/video/BV1Qb4y1q7bU/" target="_blank" rel="noopener">欧阳春晓 · 告别假胯宽 骨盆矫正 ↗</a>
      <a class="btn" href="https://www.bilibili.com/video/BV13DJVzsEkK/" target="_blank" rel="noopener">欧阳春晓 · 沙漏腰3.0 站立无跑跳核心 ↗</a>
      <a class="btn" href="https://space.bilibili.com/489117797/" target="_blank" rel="noopener">C戈体态矫正（肩颈/体态）↗</a>
      <a class="btn" href="https://space.bilibili.com/62540916/" target="_blank" rel="noopener">周六野 Zoey（新手有氧）↗</a>
    </div>
    <p class="small muted" style="margin-top:10px">说明：欧阳春晓的跟练以「无跑跳、站立/躺姿、口令带练」为主，对肩颈和膝盖友好；C戈侧重体态矫正（圆肩驼背、头前伸、富贵包）。请按自身情况退阶，疼痛即停。</p>
  </div></div>`;
}

/* ---------- 食谱 ---------- */
function drawDiet() {
  $('#fBody').innerHTML = `
  <div class="grid" style="grid-template-columns:1fr 1fr">
    <div class="card"><div class="card-head"><h3>🥗 常规日（约 1500–1600 kcal）</h3></div><div class="card-body">
      <div class="list-item"><div style="flex:1"><div class="t">🥣 早餐</div><div class="s">水煮蛋 2 个 + 纯牛奶 1 杯 + 全麦面包 2 片 + 苹果 1 个</div></div></div>
      <div class="list-item"><div style="flex:1"><div class="t">🍱 午餐</div><div class="s">杂粮饭 100g + 清蒸鱼 / 鸡胸 100g + 清炒时蔬 200g</div></div></div>
      <div class="list-item"><div style="flex:1"><div class="t">🥘 晚餐</div><div class="s">玉米 / 红薯 150g + 西兰花炒胡萝卜 250g + 白灼虾 / 鸡胸 100g</div></div></div>
      <div class="list-item"><div style="flex:1"><div class="t">🥜 加餐</div><div class="s">无糖酸奶 1 杯 或 一小把原味坚果</div></div></div>
    </div></div>
    <div class="card" style="border-color:#90caf9"><div class="card-head"><h3>🍃 轻断食日（约 800 kcal）</h3></div><div class="card-body">
      <div class="list-item"><div style="flex:1"><div class="t">🥣 早餐</div><div class="s">黑咖啡 1 杯 + 水煮玉米 1 根 + 水煮蛋 2 个</div></div></div>
      <div class="list-item"><div style="flex:1"><div class="t">🍱 午餐</div><div class="s">蒸红薯 1 个 + 水煮时蔬 1 份</div></div></div>
      <div class="list-item"><div style="flex:1"><div class="t">🥘 晚餐</div><div class="s">黄瓜 1 根 + 香煎鸡胸肉 1 块</div></div></div>
      <p class="small muted" style="margin-top:8px">原则：高蛋白（≥1.2g/kg）、高纤维、低 GI、少油盐；每周 1–2 天轻断食即可，不必每天。</p>
    </div></div>
  </div>
  <p class="small muted" style="margin-top:10px">参考案例：多位实践者配合每日 40–60 分钟快走 / 爬坡走，约 3 个月实现体脂率明显下降且未反弹；体脂率与围度比体重数字更值得关注。</p>`;
}

/* ---------- 我的进度（记录 + 趋势） ---------- */
function drawLog() {
  const f = S().fitness;
  const logs = (f.logs || []).slice().sort((a, b) => a.date < b.date ? 1 : -1);
  const sorted = (f.logs || []).slice().sort((a, b) => a.date < b.date ? -1 : 1);
  $('#fBody').innerHTML = `
  <div class="grid" style="grid-template-columns:1fr 1fr">
    <div class="card"><div class="card-head"><h3>➕ 记录今日身体数据</h3></div><div class="card-body">
      <label class="fld" style="margin-bottom:10px"><span>日期</span><input type="date" id="lgDate" value="${ymd(new Date())}"></label>
      <label class="fld" style="margin-bottom:10px"><span>体重（斤）</span><input type="number" id="lgW" step="0.1" placeholder="如 128.5"></label>
      <label class="fld" style="margin-bottom:10px"><span>腰围（cm，可选）</span><input type="number" id="lgWaist" step="0.1" placeholder="如 82"></label>
      <label class="fld" style="margin-bottom:10px"><span>臀围（cm，可选）</span><input type="number" id="lgHip" step="0.1" placeholder="如 100"></label>
      <label class="fld" style="margin-bottom:10px"><span>备注（可选）</span><input type="text" id="lgNote" placeholder="如 今天快走 50 分钟"></label>
      <div class="row" style="gap:8px">
        <button class="btn solid" id="saveLog">保存记录</button>
        <button class="btn" id="editGoal">设置目标体重</button>
        <button class="btn danger" id="clrLog">清空记录</button>
      </div>
      <p class="small muted" style="margin-top:8px">目标体重：<b>${f.goal || 0}</b> 斤 · 起始：<b>${f.startWeight || 0}</b> 斤</p>
    </div></div>
    <div class="card"><div class="card-head"><h3>📈 体重趋势</h3>
      <span class="chip gray">${logs.length} 条</span>
      <div class="actions"><button class="btn sm" id="expLog">导出</button></div></div>
      <div class="card-body">${trendSVG(sorted)}</div></div>
  </div>
  <div class="card" style="margin-top:14px"><div class="card-head"><h3>📋 历史记录</h3></div><div class="card-body" style="max-height:360px;overflow:auto">
    ${logs.length ? logs.map((l, i) => {
      const whr = (l.waist && l.hip) ? (l.waist / l.hip).toFixed(2) : '—';
      return `<div class="list-item"><div style="flex:1">
        <div class="t">${esc(l.date)} <span class="chip gray">${esc(l.weight)} 斤</span> ${l.waist ? `<span class="chip gray">腰 ${l.waist}</span>` : ''} ${l.hip ? `<span class="chip gray">臀 ${l.hip}</span>` : ''} ${whr !== '—' ? `<span class="chip gray">腰臀比 ${whr}</span>` : ''}</div>
        ${l.note ? `<div class="s">${esc(l.note)}</div>` : ''}
      </div><button class="btn sm danger" data-del="${i}">删除</button></div>`;
    }).join('') : emptyBox('还没有记录，先在左侧添加第一条吧')}
  </div></div>`;

  $('#saveLog').onclick = () => {
    const w = parseFloat($('#lgW').value); if (!w) return toast('请填写体重', 'err');
    const rec = { date: $('#lgDate').value || ymd(new Date()), weight: w, waist: parseFloat($('#lgWaist').value) || 0, hip: parseFloat($('#lgHip').value) || 0, note: $('#lgNote').value.trim() };
    store.update(s => {
      s.fitness.logs = s.fitness.logs.filter(x => x.date !== rec.date).concat(rec);
    });
    toast('已保存', 'ok'); rerender();
  };
  $('#editGoal').onclick = () => formModal({
    title: '设置目标体重', fields: [
      { key: 'goal', label: '目标体重（斤）', type: 'number', value: f.goal || 105 },
      { key: 'start', label: '起始体重（斤）', type: 'number', value: f.startWeight || '' }
    ], onSubmit: d => { store.update(s => { s.fitness.goal = +d.goal; s.fitness.startWeight = +d.start; }); toast('已保存', 'ok'); rerender(); }
  });
  $('#clrLog').onclick = () => confirmDlg('确定清空所有体重记录？', () => { store.update(s => s.fitness.logs = []); rerender(); });
  $('#expLog').onclick = () => {
    const rows = sorted.map(l => `${l.date},${l.weight},${l.waist || ''},${l.hip || ''},"${l.note || ''}"`);
    download('健身记录.csv', '\ufeff日期,体重(斤),腰围(cm),臀围(cm),备注\n' + rows.join('\n'), 'text/csv');
  };
  host.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    const i = +b.dataset.del; store.update(s => s.fitness.logs.splice(s.fitness.logs.findIndex(x => (x.date === logs[i].date && x.weight === logs[i].weight)), 1)); rerender();
  });
}

function trendSVG(logs) {
  if (logs.length < 2) return '<p class="small muted" style="padding:20px 0">记录满 2 条后即可显示趋势曲线。</p>';
  const w = 560, h = 180, pad = 30;
  const ws = logs.map(l => l.weight);
  const minW = Math.min(...ws) - 1, maxW = Math.max(...ws) + 1;
  const X = i => pad + i * ((w - 2 * pad) / (logs.length - 1));
  const Y = v => h - pad - ((v - minW) / (maxW - minW)) * (h - 2 * pad);
  const line = logs.map((l, i) => `${X(i).toFixed(1)},${Y(l.weight).toFixed(1)}`).join(' ');
  const dots = logs.map((l, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(l.weight).toFixed(1)}" r="3.5" fill="#1565c0"/>`).join('');
  const labels = logs.map((l, i) => (i % Math.ceil(logs.length / 6) === 0) ? `<text x="${X(i).toFixed(1)}" y="${h - 8}" font-size="10" fill="#90a4ae" text-anchor="middle">${l.date.slice(5)}</text>` : '').join('');
  const grid = [minW, (minW + maxW) / 2, maxW].map(v => `<text x="4" y="${(Y(v) + 3).toFixed(1)}" font-size="10" fill="#90a4ae">${v.toFixed(0)}</text>`).join('');
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" style="max-width:560px;display:block;margin:auto">
    <line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" stroke="#e3e9f2"/>
    ${grid}${labels}
    <polyline points="${line}" fill="none" stroke="#1565c0" stroke-width="2.5"/>
    ${dots}
  </svg>`;
}
