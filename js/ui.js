// ============ 通用 UI 组件 ============
import { $, esc } from './utils.js';

export function toast(msg, type = '') {
  const w = $('#toastWrap');
  const el = document.createElement('div');
  el.className = 'toast ' + type; el.textContent = msg;
  w.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = '.3s'; setTimeout(() => el.remove(), 300); }, 2200);
}

let closer = null;
export function modal({ title, body, foot, wide = false, onOpen }) {
  const mask = $('#modalMask'), m = $('#modal');
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = body;
  $('#modalFoot').innerHTML = foot || '<button class="btn" data-close>关闭</button>';
  m.classList.toggle('wide', wide);
  mask.hidden = false;
  closer = () => { mask.hidden = true; closer = null; };
  $$$('[data-close]').forEach(b => b.onclick = closer);
  onOpen && onOpen($('#modalBody'), closer);
  return closer;
}
const $$$ = s => Array.from(document.querySelectorAll('#modal ' + s));
export function closeModal() { closer && closer(); $('#modalMask').hidden = true; }

export function confirmDlg(msg, onYes, yesText = '确定') {
  modal({
    title: '请确认', body: `<p style="font-size:14px">${esc(msg)}</p>`,
    foot: `<button class="btn" data-close>取消</button><button class="btn solid" id="cfmYes">${esc(yesText)}</button>`,
    onOpen: (b, close) => { document.getElementById('cfmYes').onclick = () => { close(); onYes(); }; }
  });
}

// 表单模态：fields = [{key,label,type,value,options,required,span,placeholder,hint}]
export function formModal({ title, fields, submitText = '保存', wide = false, onSubmit, extra = '' }) {
  const html = `<div class="form-grid">${fields.map(f => fieldHTML(f)).join('')}</div>${extra}`;
  modal({
    title, body: html, wide,
    foot: `<button class="btn" data-close>取消</button><button class="btn solid" id="fmOK">${esc(submitText)}</button>`,
    onOpen: (body, close) => {
      const ok = document.getElementById('fmOK');
      const submit = () => {
        const data = {};
        for (const f of fields) {
          const el = body.querySelector(`[name="${f.key}"]`);
          if (!el) continue;
          let v = f.type === 'checkbox' ? el.checked : el.value;
          if (f.type === 'number') v = v === '' ? null : Number(v);
          if (f.type === 'tags' || f.type === 'tagpick') v = (el.value || '').split(/[,，;；\n]/).map(s => s.trim()).filter(Boolean);
          if (f.required && (v === '' || v === null)) { el.focus(); toast('请填写「' + f.label + '」', 'err'); return; }
          data[f.key] = v;
        }
        const r = onSubmit(data, close);
        if (r !== false) close();
      };
      ok.onclick = submit;
      // 标签点选组件（兴趣 / 风格 / 自定义添加）
      body.addEventListener('click', e => {
        const pk = e.target.closest('.tagpick'); if (!pk) return;
        const hidden = pk.querySelector('input[type=hidden]');
        const selBox = pk.querySelector('[data-sel]');
        const sugBox = pk.querySelector('[data-sug]');
        const input = pk.querySelector('.tp-input');
        const x = e.target.closest('.tp-x');
        if (x) { tpSet(hidden, selBox, sugBox, tpGet(hidden).filter(s => s !== x.dataset.t)); return; }
        const chip = e.target.closest('.tp-chip');
        if (chip) { const t = chip.dataset.t; const cur = tpGet(hidden); tpSet(hidden, selBox, sugBox, cur.includes(t) ? cur.filter(s => s !== t) : [...cur, t]); return; }
        if (e.target.closest('.tp-addbtn')) { const val = input.value.trim(); if (val) { const cur = tpGet(hidden); if (!cur.includes(val)) tpSet(hidden, selBox, sugBox, [...cur, val]); input.value = ''; } return; }
      });
      body.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        const input = e.target.closest && e.target.closest('.tp-input'); if (!input) return;
        e.preventDefault(); e.stopImmediatePropagation();
        const pk = input.closest('.tagpick');
        const hidden = pk.querySelector('input[type=hidden]');
        const selBox = pk.querySelector('[data-sel]');
        const sugBox = pk.querySelector('[data-sug]');
        const val = input.value.trim();
        if (val) { const cur = tpGet(hidden); if (!cur.includes(val)) tpSet(hidden, selBox, sugBox, [...cur, val]); input.value = ''; }
      }, true);
      body.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.ctrlKey !== undefined && e.target.tagName === 'INPUT') submit(); });
      const first = body.querySelector('input,select,textarea'); first && first.focus();
    }
  });
}

export function fieldHTML(f) {
  const span = f.span === 'full' ? ' full' : '';
  const v = f.value ?? '';
  let inner = '';
  switch (f.type) {
    case 'select':
      inner = `<select name="${f.key}">${f.options.map(o => `<option value="${esc(o.v)}"${String(o.v) === String(v) ? ' selected' : ''}>${esc(o.t)}</option>`).join('')}</select>`; break;
    case 'textarea':
      inner = `<textarea name="${f.key}" placeholder="${esc(f.placeholder || '')}">${esc(v)}</textarea>`; break;
    case 'checkbox':
      return `<label class="fld${span}" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="${f.key}"${v ? ' checked' : ''}><span>${esc(f.label)}</span></label>`;
    case 'tags':
      inner = `<input type="text" name="${f.key}" value="${esc(Array.isArray(v) ? v.join(', ') : v)}" placeholder="${esc(f.placeholder || '逗号分隔')}">`; break;
    case 'tagpick': {
      const tv = Array.isArray(v) ? v : String(v).split(',').map(s => s.trim()).filter(Boolean);
      const sug = (f.suggest || []).map(t => `<span class="tp-chip sug${tv.includes(t) ? ' active' : ''}" data-t="${esc(t)}">${esc(t)}</span>`).join('');
      const sel = tv.length ? tv.map(t => `<span class="tp-chip sel" data-t="${esc(t)}">${esc(t)}<span class="tp-x" data-t="${esc(t)}">×</span></span>`).join('') : '<span class="small muted">尚未选择</span>';
      inner = `<div class="tagpick" data-key="${f.key}">
        <div class="tp-selected" data-sel>${sel}</div>
        <div class="tp-add"><input type="text" class="tp-input" placeholder="自定义标签，回车或点添加"><button type="button" class="tp-addbtn">+ 添加</button></div>
        ${f.suggest && f.suggest.length ? `<div class="tp-suggest" data-sug>${sug}</div>` : ''}
        <input type="hidden" name="${f.key}" value="${esc(tv.join(','))}">
      </div>`; break;
    }
    default:
      inner = `<input type="${f.type || 'text'}" name="${f.key}" value="${esc(v)}" placeholder="${esc(f.placeholder || '')}"${f.min !== undefined ? ` min="${f.min}"` : ''}${f.max !== undefined ? ` max="${f.max}"` : ''}${f.step ? ` step="${f.step}"` : ''}>`;
  }
  return `<label class="fld${span}"><span>${esc(f.label)}${f.required ? ' <em style="color:var(--danger);font-style:normal">*</em>' : ''}</span>${inner}${f.hint ? `<span class="small muted">${f.hint}</span>` : ''}</label>`;
}

// 标签点选组件：读取 / 写入隐藏域，并同步已选与建议高亮
function tpGet(hidden) { return (hidden.value || '').split(',').map(s => s.trim()).filter(Boolean); }
function tpSet(hidden, selBox, sugBox, arr) {
  hidden.value = arr.join(',');
  // 用 DOM API 构建，避免 innerHTML 解析 <button> 在 click 上下文中被浏览器当成新 click 自动派发
  selBox.textContent = '';
  if (!arr.length) {
    const s = document.createElement('span');
    s.className = 'small muted';
    s.textContent = '尚未选择';
    selBox.appendChild(s);
  } else {
    arr.forEach(t => {
      const chip = document.createElement('span');
      chip.className = 'tp-chip sel';
      chip.dataset.t = t;
      chip.append(document.createTextNode(t));
      const x = document.createElement('span');
      x.className = 'tp-x';
      x.dataset.t = t;
      x.textContent = '×';
      chip.appendChild(x);
      selBox.appendChild(chip);
    });
  }
  sugBox.querySelectorAll('.tp-chip').forEach(c => c.classList.toggle('active', arr.includes(c.dataset.t)));
}

// 简易拖拽排序：容器内 [draggable] 元素
export function enableSort(container, itemSel, onDrop) {
  let dragEl = null;
  container.addEventListener('dragstart', e => {
    const t = e.target.closest(itemSel); if (!t) return;
    dragEl = t; t.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', t.dataset.id || ''); } catch { }
  });
  container.addEventListener('dragend', e => { dragEl && dragEl.classList.remove('dragging'); dragEl = null; });
  container.addEventListener('dragover', e => {
    if (!dragEl) return; e.preventDefault();
    const t = e.target.closest(itemSel);
    if (!t || t === dragEl || !container.contains(t)) return;
    const r = t.getBoundingClientRect();
    const after = (e.clientY - r.top) / r.height > .5;
    t.parentNode.insertBefore(dragEl, after ? t.nextSibling : t);
  });
  container.addEventListener('drop', e => {
    e.preventDefault();
    if (onDrop) onDrop(Array.from(container.querySelectorAll(itemSel)).map(x => x.dataset.id));
  });
}

export function emptyBox(text, icon = '📭') { return `<div class="empty"><span class="big">${icon}</span>${esc(text)}</div>`; }
