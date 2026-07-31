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
          if (f.type === 'tags') v = el.value.split(/[,，;；\n]/).map(s => s.trim()).filter(Boolean);
          if (f.required && (v === '' || v === null)) { el.focus(); toast('请填写「' + f.label + '」', 'err'); return; }
          data[f.key] = v;
        }
        const r = onSubmit(data, close);
        if (r !== false) close();
      };
      ok.onclick = submit;
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
    default:
      inner = `<input type="${f.type || 'text'}" name="${f.key}" value="${esc(v)}" placeholder="${esc(f.placeholder || '')}"${f.min !== undefined ? ` min="${f.min}"` : ''}${f.max !== undefined ? ` max="${f.max}"` : ''}${f.step ? ` step="${f.step}"` : ''}>`;
  }
  return `<label class="fld${span}"><span>${esc(f.label)}${f.required ? ' <em style="color:var(--danger);font-style:normal">*</em>' : ''}</span>${inner}${f.hint ? `<span class="small muted">${f.hint}</span>` : ''}</label>`;
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
