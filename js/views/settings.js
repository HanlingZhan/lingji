// ============ 设置 · 多端同步 · 数据安全 ============
import { store, S } from '../store.js';
import { $, esc, ymd, fmtAgo, download } from '../utils.js';
import { formModal, toast, confirmDlg, modal } from '../ui.js';
import { requestPermission, pushNotif } from '../notify.js';

let host = null;
export function render(el) { host = el; rerender(); }

// 应用 / 清除首页背景图片（DataURL 存于 settings.bg）
export function applyBg() {
  const bg = (S().settings.bg || '').trim();
  const b = document.body;
  if (bg) { b.classList.add('has-bg'); b.style.backgroundImage = `url("${bg}")`; }
  else { b.classList.remove('has-bg'); b.style.backgroundImage = ''; }
}

function storageSize() {
  let n = 0; for (const k in localStorage) if (localStorage.hasOwnProperty(k)) n += (localStorage[k].length + k.length);
  return (n / 1024).toFixed(1);
}

function rerender() {
  if (!host) return;
  const st = S(), sy = st.settings.sync, nt = st.settings.notify;
  host.innerHTML = `
  <div class="grid" style="grid-template-columns:1fr 1fr">
    <div class="card"><div class="card-head"><h3>👤 个人信息</h3></div><div class="card-body">
      <div class="form-grid">
        <label class="fld"><span>昵称</span><input type="text" id="nick" value="${esc(st.profile.nickname)}"></label>
        <label class="fld"><span>研究方向</span><input type="text" id="field" value="${esc(st.profile.field)}"></label>
      </div>
      <div class="row" style="margin-top:10px">
        <label class="fld" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="darkChk" ${st.settings.theme === 'dark' ? 'checked' : ''}><span>深色模式</span></label>
        <button class="btn solid" id="saveProfile">保存</button>
      </div>
    </div></div>

    <div class="card"><div class="card-head"><h3>🔔 提醒偏好</h3></div><div class="card-body">
      <label class="fld" style="flex-direction:row;align-items:center;gap:8px;margin-bottom:8px"><input type="checkbox" id="ntDesk" ${nt.desktop ? 'checked' : ''}><span>桌面弹窗提醒（需授权）</span>
        <span class="chip ${notifPermChip()}">${notifPermText()}</span></label>
      <label class="fld" style="flex-direction:row;align-items:center;gap:8px;margin-bottom:12px"><input type="checkbox" id="ntApp" ${nt.inApp ? 'checked' : ''}><span>站内通知中心</span></label>
      <div class="form-grid">
        <label class="fld"><span>每日论文推送时间</span><input type="number" id="ph" min="0" max="23" value="${nt.dailyPaperHour}"><span class="small muted">点（0-23）</span></label>
        <label class="fld"><span>每日单词推送时间</span><input type="number" id="wh" min="0" max="23" value="${nt.wordHour}"><span class="small muted">点（0-23）</span></label>
      </div>
      <div class="row" style="margin-top:10px">
        <button class="btn" id="reqPerm">申请桌面通知权限</button>
        <button class="btn" id="testNotif">发送测试通知</button>
        <button class="btn solid" id="saveNotif">保存</button>
      </div>
      <p class="small muted" style="margin-top:8px">重要等级为「紧急重要」的事项会在标题前加醒目标识并优先弹窗。</p>
    </div></div>

    <div class="card"><div class="card-head"><h3>☁️ 多端云同步</h3>
      <span class="chip ${sy.enabled ? 'ok' : 'gray'}">${sy.enabled ? '已启用' : '未启用'}</span></div><div class="card-body">
      <label class="fld" style="flex-direction:row;align-items:center;gap:8px;margin-bottom:10px"><input type="checkbox" id="syEn" ${sy.enabled ? 'checked' : ''}><span>启用云端同步</span></label>
      <label class="fld" style="margin-bottom:10px"><span>同步后端类型</span>
        <select id="syType">
          <option value="generic" ${sy.type === 'generic' ? 'selected' : ''}>通用 JSON 端点（GET/PUT）</option>
          <option value="github" ${sy.type === 'github' ? 'selected' : ''}>GitHub 仓库文件（自带托管+同步）</option>
          <option value="webdav" ${sy.type === 'webdav' ? 'selected' : ''}>WebDAV（Nextcloud / 群晖等）</option>
        </select></label>
      <label class="fld" style="margin-bottom:10px"><span>同步端点 / 路径</span>
        <input type="url" id="syUrl" value="${esc(sy.endpoint)}" placeholder="取决于后端类型，见下方说明"></label>
      <label class="fld" style="margin-bottom:10px"><span>访问令牌 / 凭据</span>
        <input type="text" id="syTk" value="${esc(sy.token)}" placeholder="取决于后端类型，见下方说明"></label>
      <p class="small muted" id="syHint" style="margin-bottom:10px"></p>
      <label class="fld" style="flex-direction:row;align-items:center;gap:8px;margin-bottom:10px"><input type="checkbox" id="syAuto" ${sy.auto ? 'checked' : ''}><span>数据变更后自动推送（防抖 2.5 秒）</span></label>
      <div class="row">
        <button class="btn solid" id="saveSync">保存配置</button>
        <button class="btn" id="pullBtn">⬇ 从云端拉取</button>
        <button class="btn" id="pushBtn">⬆ 推送到云端</button>
        <span class="small muted">${st.meta.lastSync ? '上次同步 ' + fmtAgo(st.meta.lastSync) : '尚未同步'}</span>
      </div>
      <p class="small muted" style="margin-top:10px">
        同步策略：按记录级 <b>最后写入优先</b> 合并，Windows 网页端 / 安卓 / iPad 三端数据自动汇总，不会互相覆盖。<br>
        离线时所有操作照常保存在本地并进入待同步队列，恢复网络后自动合并上传。<br>
        可用方案示例：自建 Nginx + WebDAV、Cloudflare Workers KV、jsonbin.io、Supabase Storage 等任何支持 GET/PUT 的地址。
      </p>
    </div></div>

    <div class="card"><div class="card-head"><h3>🖼️ 首页背景图片</h3></div><div class="card-body">
      <p class="small muted" style="margin-bottom:8px">上传一张图片作为应用背景，仅保存在本机浏览器（转为 DataURL，建议 ≤ 1.5MB）。</p>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <input type="file" id="bgFile" accept="image/*">
        <button class="btn solid" id="saveBg">应用背景</button>
        <button class="btn" id="clearBg">恢复默认</button>
      </div>
      <p class="small muted" style="margin-top:8px">背景上方会自动叠加一层半透明蒙版，保证卡片与文字清晰可读；切换深色模式时蒙版自动加深。</p>
    </div></div>

    <div class="card"><div class="card-head"><h3>🔐 数据安全与备份</h3></div><div class="card-body">
      <div class="row" style="margin-bottom:10px">
        <button class="btn solid" id="expAll">⬇ 一键导出全部数据</button>
        <button class="btn" id="impAll">⬆ 导入备份</button>
        <button class="btn danger" id="resetAll">清空所有数据</button>
      </div>
      <div class="stat-row">
        <div class="stat"><b>${st.reminders.length}</b><span>提醒事项</span></div>
        <div class="stat"><b>${st.board.tasks.length}</b><span>看板任务</span></div>
        <div class="stat"><b>${st.courses.length}</b><span>课程</span></div>
        <div class="stat"><b>${st.paperLib.length}</b><span>文库论文</span></div>
        <div class="stat"><b>${st.anniversaries.length}</b><span>纪念日</span></div>
        <div class="stat"><b>${storageSize()} KB</b><span>本地占用</span></div>
      </div>
      <p class="small muted" style="margin-top:10px">数据默认仅保存在本机浏览器，不上传任何第三方服务器；启用云同步后仅发送到你自己配置的端点。建议定期导出 JSON 备份。</p>
    </div></div>

    <div class="card w12"><div class="card-head"><h3>📱 多端使用说明</h3></div><div class="card-body">
      <div class="grid" style="grid-template-columns:repeat(3,1fr)">
        <div><b>🖥️ Windows 网页端</b><p class="small muted">Chrome / Edge 打开即用，侧边栏常驻导航，桌面端高信息密度布局；建议「安装为应用」以获得独立窗口与桌面通知。</p></div>
        <div><b>📱 vivo iQOO Neo7</b><p class="small muted">竖屏单手操作，底部标签栏直达高频功能；浏览器菜单选择「添加到主屏幕」即可像 App 一样启动。</p></div>
        <div><b>📖 iPad 8</b><p class="small muted">横屏自动切换分栏布局，支持与其他应用分屏；Safari「添加到主屏幕」后支持全屏使用。</p></div>
      </div>
    </div></div>
  </div>`;

  $('#saveProfile').onclick = () => {
    store.update(s => { s.profile.nickname = $('#nick').value; s.profile.field = $('#field').value; s.settings.theme = $('#darkChk').checked ? 'dark' : 'light'; });
    document.documentElement.dataset.theme = S().settings.theme;
    toast('已保存', 'ok');
  };
  $('#saveNotif').onclick = () => {
    store.update(s => Object.assign(s.settings.notify, { desktop: $('#ntDesk').checked, inApp: $('#ntApp').checked, dailyPaperHour: +$('#ph').value, wordHour: +$('#wh').value }));
    toast('已保存', 'ok'); rerender();
  };
  $('#reqPerm').onclick = async () => { await requestPermission(); rerender(); };
  $('#testNotif').onclick = () => { pushNotif('🔔 测试通知', '如果你看到系统弹窗，说明桌面提醒已生效', 'test', true); toast('已发送'); };
  $('#saveSync').onclick = () => {
    store.update(s => Object.assign(s.settings.sync, { enabled: $('#syEn').checked, type: $('#syType').value, endpoint: $('#syUrl').value.trim(), token: $('#syTk').value.trim(), auto: $('#syAuto').checked }));
    toast('同步配置已保存', 'ok'); rerender();
  };
  const hints = {
    generic: '端点填任意支持 GET 拉取 / PUT 推送 JSON 的地址（如 Cloudflare Workers KV、Supabase Storage、jsonbin）。令牌作为 Bearer 发送，可留空。',
    github: '端点填仓库数据文件地址：https://api.github.com/repos/你的用户名/仓库名/contents/data/state.json （需先建仓库并建 data/ 目录）。令牌填有 repo 权限的 GitHub Personal Access Token。同一仓库也可开启 GitHub Pages 托管本应用，实现「托管+同步」一体。',
    webdav: '端点填完整文件路径，如 https://dav.example.com/scholarhub/state.json 。令牌填 Basic 凭据：先把「用户名:密码」用 Base64 编码后填入（Windows 可用 certutil，mac/Linux 用 base64 命令）。'
  };
  const updHint = () => { const t = $('#syType').value; $('#syHint').textContent = hints[t] || ''; };
  $('#syType').onchange = updHint; updHint();
  $('#pullBtn').onclick = async () => { try { await store.pull(); toast('已从云端拉取并合并', 'ok'); rerender(); } catch (e) { toast('拉取失败：' + e.message, 'err'); } };
  $('#pushBtn').onclick = async () => { const r = await store.push(); toast(r.ok ? '已推送到云端' : '推送失败：' + r.msg, r.ok ? 'ok' : 'err'); rerender(); };
  $('#expAll').onclick = () => { download(`ScholarHub备份_${ymd(new Date())}.json`, store.export()); toast('备份已导出', 'ok'); };
  $('#impAll').onclick = () => {
    modal({
      title: '导入备份', body: `<input type="file" id="impFile" accept=".json">
      <label class="fld" style="flex-direction:row;align-items:center;gap:8px;margin-top:10px"><input type="radio" name="impMode" value="merge" checked><span>与现有数据合并（推荐）</span></label>
      <label class="fld" style="flex-direction:row;align-items:center;gap:8px"><input type="radio" name="impMode" value="replace"><span>完全覆盖现有数据</span></label>`,
      foot: '<button class="btn" data-close>取消</button><button class="btn solid" id="doImp">导入</button>',
      onOpen: (b, close) => {
        b.querySelector('#doImp').onclick = async () => {
          const f = b.querySelector('#impFile').files[0]; if (!f) return toast('请选择文件', 'err');
          try {
            store.import(await f.text(), b.querySelector('[name=impMode]:checked').value);
            close(); toast('导入成功', 'ok'); rerender();
          } catch (e) { toast('导入失败：' + e.message, 'err'); }
        };
      }
    });
  };
  $('#resetAll').onclick = () => confirmDlg('⚠️ 将清空本机全部数据（提醒、看板、课表、文库、单词进度等），且不可恢复。建议先导出备份。确定继续？', () => { store.reset(); toast('已清空'); rerender(); }, '确认清空');
  $('#saveBg').onclick = async () => {
    const f = $('#bgFile').files[0]; if (!f) return toast('请先选择一张图片', 'err');
    if (f.size > 2 * 1024 * 1024) return toast('图片超过 2MB，请压缩后再上传', 'err');
    const data = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); });
    store.update(s => { s.settings.bg = data; }); applyBg(); toast('已应用背景', 'ok'); rerender();
  };
  $('#clearBg').onclick = () => { store.update(s => { s.settings.bg = ''; }); applyBg(); toast('已恢复默认背景'); rerender(); };
}

function notifPermText() {
  if (!('Notification' in window)) return '浏览器不支持';
  return { granted: '已授权', denied: '已拒绝', default: '未授权' }[Notification.permission];
}
function notifPermChip() {
  if (!('Notification' in window)) return 'gray';
  return { granted: 'ok', denied: 'danger', default: 'warn' }[Notification.permission];
}
