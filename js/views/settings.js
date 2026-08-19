// ============ 设置 · 多端同步 · 数据安全 ============
import { store, S } from '../store.js';
import { $, esc, ymd, fmtAgo, download } from '../utils.js';
import { formModal, toast, confirmDlg, modal } from '../ui.js';
import { requestPermission, pushNotif } from '../notify.js';
import { pushSupported, pushBlockedReason, pushState, pushStateChip, enablePush, disablePush, testPush } from '../push.js';

let host = null;
export function render(el) { host = el; rerender(); }

// 应用 / 清除首页背景图片（DataURL 存于 settings.bg）
export function applyBg() {
  const bg = (S().settings.bg || '').trim();
  const b = document.body;
  if (bg) { b.classList.add('has-bg'); b.style.backgroundImage = `url("${bg}")`; }
  else { b.classList.remove('has-bg'); b.style.backgroundImage = ''; }
}

// 应用界面透明度：背景透明度（极光/背景图蒙版）+ 小块透明度（浮层玻璃），存于 settings.appearance
export function applyAppearance() {
  const a = (S().settings && S().settings.appearance) || {};
  const root = document.documentElement.style;
  const v = Math.max(0, Math.min(100, +a.bgOpacity || 50)) / 100;
  const p = Math.max(30, Math.min(100, +a.panelOpacity || 85)) / 100;
  root.setProperty('--aurora-op', v.toFixed(3));
  root.setProperty('--bg-mask', (1 - v * 0.85).toFixed(3));
  root.setProperty('--bg-mask-dark', (1 - v * 0.85).toFixed(3));
  root.setProperty('--panel-alpha', p.toFixed(3));
}

function storageSize() {
  let n = 0; for (const k in localStorage) if (localStorage.hasOwnProperty(k)) n += (localStorage[k].length + k.length);
  return (n / 1024).toFixed(1);
}

function rerender() {
  if (!host) return;
  const st = S(), sy = st.settings.sync, nt = st.settings.notify;
  const ap = (st.settings.appearance) || {};
  const bgOp = (+ap.bgOpacity || 50), pnOp = (+ap.panelOpacity || 85);
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

    <div class="card"><div class="card-head"><h3>📲 系统推送（手机 / iPad）</h3>
      <span class="chip ${pushStateChip()}">${pushState().text}</span></div><div class="card-body">
      ${pushSupported() ? `
      <p class="small muted">提醒事项到期时，通过系统通知推送到手机 / iPad，锁屏也能看到，点通知直接打开灵记。${st.settings.backendProxy ? '' : '⚠️ 需要先在下方「☁️ 多端云同步」里填写后端代理 URL（Cloudflare Worker 地址）并保存。'}</p>
      <div class="row">
        <button class="btn solid" id="pushEnable">开启推送</button>
        <button class="btn" id="pushDisable">关闭推送</button>
        <button class="btn" id="pushTest">发送测试推送</button>
      </div>
      <p class="small muted" style="margin-top:8px">iOS / iPadOS 需 16.4+，且必须从<b>主屏幕图标</b>打开灵记后再点「开启推送」授权（Safari 标签页里没有授权入口）；安卓 Chrome 直接可用。提醒到期时云端每分钟检查一次并推送。</p>` : `<p class="small muted">${pushBlockedReason()}</p>`}
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
      <label class="fld" style="margin-bottom:10px"><span>轻量后端代理 URL（可选）</span>
        <input type="url" id="proxyUrl" value="${esc(st.settings.backendProxy)}" placeholder="留空=前端直连；填 Cloudflare Workers 地址可解锁论文/资讯实时抓取+逐段翻译"></label>
      <div style="height:1px;background:var(--line);margin:12px 0 10px"></div>
      <label class="fld" style="flex-direction:row;align-items:center;gap:8px;margin-bottom:8px"><input type="checkbox" id="syEnc" ${sy.crypto?.enabled ? 'checked' : ''}><span>🔐 启用端到端加密（数据上传前用密码加密，云端只存密文，仓库公开也读不出）</span></label>
      <label class="fld" style="margin-bottom:8px"><span>加密密码</span><input type="password" id="syPass" placeholder="设置一道只有你知道的密码" autocomplete="new-password"></label>
      <label class="fld" style="margin-bottom:8px"><span>确认密码</span><input type="password" id="syPass2" placeholder="再输入一次" autocomplete="new-password"></label>
      <p class="small muted">⚠️ 密码仅保存在你本机浏览器，且无法找回。忘记密码将无法解密云端数据，请务必牢记；多端同步需在各端设置<b>相同密码</b>。</p>
      <div class="row">
        <button class="btn solid" id="saveSync">保存配置</button>
        <button class="btn" id="copySync">📋 复制配置</button>
        <button class="btn" id="pasteSync">📥 粘贴配置</button>
        <button class="btn" id="testSync">🔍 测试连接</button>
        <button class="btn" id="selfChk">🩺 一键自检</button>
        <button class="btn" id="pullBtn">⬇ 仅从云端拉取</button>
        <button class="btn solid" id="pushBtn">🔄 立即双向同步</button>
        <span class="small muted">${st.meta.lastSync ? '上次同步 ' + fmtAgo(st.meta.lastSync) : '尚未同步'}</span>
      </div>
      <p class="small muted" style="margin-top:10px">
        同步策略：按记录级 <b>最后写入优先</b> 合并，Windows 网页端 / 安卓 / iPad 三端数据自动汇总，不会互相覆盖。<br>
        <b>首次让两端互通的做法</b>：在「有数据那台设备」上点「保存配置」（会自动把本机现有数据连同以前的内容一起上传），再到另一台点「🔄 立即双向同步」即可拉到对方数据。<br>
        离线时所有操作照常保存在本地并进入待同步队列，恢复网络后自动合并上传。
      </p>
    </div></div>

    <div class="card"><div class="card-head"><h3>🖼️ 背景与透明度</h3></div><div class="card-body">
      <p class="small muted" style="margin-bottom:8px">上传一张图片作为应用背景，仅保存在本机浏览器（转为 DataURL，建议 ≤ 1.5MB）。</p>
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:14px">
        <input type="file" id="bgFile" accept="image/*">
        <button class="btn solid" id="saveBg">应用背景</button>
        <button class="btn" id="clearBg">恢复默认</button>
      </div>
      <p class="small muted" style="margin-top:0;margin-bottom:14px">背景上方会自动叠加一层半透明蒙版，保证卡片与文字清晰可读；切换深色模式时蒙版自动加深。</p>
      <div style="display:flex;flex-direction:column;gap:14px;margin-bottom:4px">
        <label class="fld" style="margin:0"><span>背景透明度 <b id="bgOpVal">${bgOp}%</b></span>
          <input type="range" id="bgOp" min="0" max="100" value="${bgOp}"></label>
        <label class="fld" style="margin:0"><span>小块透明度 <b id="pnOpVal">${pnOp}%</b></span>
          <input type="range" id="pnOp" min="30" max="100" value="${pnOp}"></label>
      </div>
      <p class="small muted" style="margin-top:12px">背景透明度控制极光背景的浓淡（使用自定义背景图时控制蒙版浓淡）；小块透明度控制侧边栏、顶栏与卡片等浮层的通透程度。拖动即时预览，松手自动保存。</p>
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
      <p class="small muted" style="margin-top:10px">数据默认仅保存在本机浏览器，不上传任何第三方服务器；启用云同步后仅发送到你自己配置的端点${sy.crypto?.enabled ? '，且已启用端到端加密（云端只存密文，仓库公开也读不出）' : '（建议到「多端云同步」中启用端到端加密，防止同步到的仓库被公开读取）'}。建议定期导出 JSON 备份。</p>
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
  const pushEnBtn = $('#pushEnable'), pushDisBtn = $('#pushDisable'), pushTestBtn = $('#pushTest');
  if (pushEnBtn) pushEnBtn.onclick = async () => { await enablePush(); rerender(); };
  if (pushDisBtn) pushDisBtn.onclick = async () => { await disablePush(); rerender(); };
  if (pushTestBtn) pushTestBtn.onclick = async () => { await testPush(); };
  const saveSyncCfg = () => {
    const en = $('#syEnc').checked;
    let pass = '';
    if (en) {
      pass = $('#syPass').value;
      const pass2 = $('#syPass2').value;
      if (!pass) { toast('启用加密需填写加密密码', 'err'); return false; }
      if (pass !== pass2) { toast('两次输入的密码不一致', 'err'); return false; }
    }
    store.update(s => { Object.assign(s.settings.sync, { enabled: $('#syEn').checked, type: $('#syType').value, endpoint: $('#syUrl').value.trim(), token: $('#syTk').value.trim(), auto: $('#syAuto').checked, crypto: { enabled: en, pass } }); s.settings.backendProxy = $('#proxyUrl').value.trim(); });
    return true;
  };
  $('#saveSync').onclick = async () => {
    if (!saveSyncCfg()) return;
    toast('同步配置已保存', 'ok');
    if ($('#syEn').checked) {
      const b = $('#saveSync'); const old = b.textContent;
      b.disabled = true; b.textContent = '正在上传本机数据…';
      const r = await store.push();   // 保存即触发一次完整双向同步：把开启同步前就有的旧数据也上传到云端
      b.disabled = false; b.textContent = old;
      if (r.ok) { toast(`已保存并上传本机数据到云端（本次新增拉取 ${r.pulled || 0} 条）`, 'ok'); rerender(); }
      else toast('保存成功，但上传失败：' + r.msg, 'err');
    } else rerender();
  };
  const hints = {
    generic: '端点填任意支持 GET 拉取 / PUT 推送 JSON 的地址（如 Cloudflare Workers KV、Supabase Storage、jsonbin）。令牌作为 Bearer 发送，可留空。',
    github: '端点填仓库数据文件地址：https://api.github.com/repos/你的用户名/仓库名/contents/data/state.json （需先建仓库并建 data/ 目录）。令牌填有 repo 权限的 GitHub Personal Access Token。⚠️ 若同步目标仓库是「公开」的，你的数据会被任何人读取——请务必勾选下方「启用端到端加密」，或改用私有仓库。不要直接把数据同步到托管本应用的公开仓库。',
    webdav: '端点填完整文件路径，如 https://dav.example.com/scholarhub/state.json 。令牌填 Basic 凭据：先把「用户名:密码」用 Base64 编码后填入（Windows 可用 certutil，mac/Linux 用 base64 命令）。'
  };
  const updHint = () => { const t = $('#syType').value; $('#syHint').textContent = hints[t] || ''; };
  $('#syType').onchange = () => { updHint(); if ($('#syType').value === 'github' && !$('#syUrl').value.trim()) $('#syUrl').value = 'https://api.github.com/repos/你的用户名/你的仓库/contents/data/state.json'; };
  updHint();
  $('#testSync').onclick = async () => {
    if (!saveSyncCfg()) return; const b = $('#testSync'); const old = b.textContent;
    b.disabled = true; b.textContent = '检测中…';
    const r = await store.diagnose();
    b.disabled = false; b.textContent = old;
    toast((r.ok ? '✅ ' : '❌ ') + r.msg, r.ok ? 'ok' : 'err');
  };
  // 一键自检：把本机配置 + 云端真实状态逐项打印出来，方便定位「保存成功却同步不上」
  $('#selfChk').onclick = async () => {
    if (!saveSyncCfg()) return;
    const b = $('#selfChk'); const old = b.textContent;
    b.disabled = true; b.textContent = '检测中…';
    const rep = await store.selfCheck();
    b.disabled = false; b.textContent = old;
    modal({
      title: '🩺 同步自检报告',
      body: `<textarea id="chkBox" rows="16" readonly style="width:100%;font-family:monospace;font-size:12px;line-height:1.6">${esc(rep)}</textarea>
             <p class="small muted" style="margin-top:8px">令牌已自动脱敏，可整段复制发给开发者协助排查。</p>`,
      foot: '<button class="btn" id="copyChk">📋 复制报告</button><button class="btn solid" data-close>关闭</button>',
      onOpen: () => {
        document.getElementById('copyChk').onclick = () => {
          const t = document.getElementById('chkBox');
          t.removeAttribute('readonly'); t.select(); t.setSelectionRange(0, 99999);
          const done = () => { t.setAttribute('readonly', ''); toast('报告已复制', 'ok'); };
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t.value).then(done, () => { document.execCommand('copy'); done(); });
          else { document.execCommand('copy'); done(); }
        };
      }
    });
  };
  // 复制本端同步配置（端点+类型+令牌），便于在手机/iPad 上「粘贴配置」保证三端连同一个云端
  const encodeCfg = cfg => btoa(unescape(encodeURIComponent(JSON.stringify(cfg))));
  const decodeCfg = code => JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
  $('#copySync').onclick = () => {
    if (!saveSyncCfg()) return;
    const s = S().settings.sync;
    if (!s.endpoint) return toast('请先填写同步端点再复制', 'err');
    const code = encodeCfg({ t: s.type, e: s.endpoint, k: s.token, c: s.crypto || { enabled: false, pass: '' } });
    const show = () => modal({ title: '复制同步配置', body: `<p class="small muted">复制下面这串配置码，到手机/iPad 设置页点「📥 粘贴配置」即可一键对齐云端。也可发给其他设备。</p><textarea id="cfgBox" rows="3" style="width:100%;font-family:monospace">${code}</textarea>`, foot: '<button class="btn" data-close>关闭</button>', onOpen: (b) => { const t = b.querySelector('#cfgBox'); t.select(); } });
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(() => toast('同步配置已复制到剪贴板，去其他设备「粘贴配置」', 'ok'), show);
    else show();
  };
  $('#pasteSync').onclick = () => {
    modal({
      title: '粘贴同步配置',
      body: `<p class="small muted">把另一台设备「📋 复制配置」得到的配置码粘贴到这里，会自动填入并立即同步：</p><textarea id="cfgIn" rows="3" style="width:100%;font-family:monospace" placeholder="粘贴配置码"></textarea>`,
      foot: '<button class="btn" data-close>取消</button><button class="btn solid" id="doPaste">填入并同步</button>',
      onOpen: (b, close) => {
        document.getElementById('doPaste').onclick = async () => {
          try {
            const cfg = decodeCfg(b.querySelector('#cfgIn').value);
            store.update(s => { Object.assign(s.settings.sync, { enabled: true, type: cfg.t, endpoint: cfg.e, token: cfg.k, auto: true, crypto: cfg.c || { enabled: false, pass: '' } }); });
            close();
            toast('已填入云端配置，开始同步…', 'ok');
            const r = await store.push();
            if (r.ok) toast(`已与云端合并（拉取 ${r.pulled || 0} 条并上传本机数据）`, 'ok'); else toast('同步失败：' + r.msg, 'err');
            rerender();
          } catch (e) { toast('配置码无效：' + e.message, 'err'); }
        };
      }
    });
  };
  $('#pullBtn').onclick = async () => {
    if (!saveSyncCfg()) return; const b = $('#pullBtn'); b.disabled = true;
    const r = await store.pull();
    b.disabled = false;
    if (r.ok) toast(`已从云端拉取并合并（新增 ${r.added || 0} 条）`, 'ok'); else toast('拉取失败：' + r.msg, 'err');
    rerender();
  };
  $('#pushBtn').onclick = async () => {
    if (!saveSyncCfg()) return; const b = $('#pushBtn'); b.disabled = true;
    const r = await store.push();
    b.disabled = false;
    if (r.ok) toast(`双向同步完成：已合并云端 ${r.pulled || 0} 条并上传本机数据`, 'ok'); else toast('同步失败：' + r.msg, 'err');
    rerender();
  };
  $('#expAll').onclick = () => { download(`ScholarHub备份_${ymd(new Date())}.json`, store.export()); toast('备份已导出', 'ok'); };
  $('#impAll').onclick = () => {
    modal({
      title: '导入备份', body: `<input type="file" id="impFile" accept=".json">
      <label class="fld" style="flex-direction:row;align-items:center;gap:8px;margin-top:10px"><input type="radio" name="impMode" value="merge" checked><span>与现有数据合并（推荐）</span></label>
      <label class="fld" style="flex-direction:row;align-items:center;gap:8px"><input type="radio" name="impMode" value="replace"><span>完全覆盖现有数据</span></label>`,
      foot: '<button class="btn" data-close>取消</button><button class="btn solid" id="doImp">导入</button>',
      onOpen: (b, close) => {
        document.getElementById('doImp').onclick = async () => {
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
  // 界面透明度：拖动即时改 CSS 变量，松手才写库（避免频繁 rerender 打断拖动）
  const bgOpEl = $('#bgOp'), pnOpEl = $('#pnOp');
  if (bgOpEl && pnOpEl) {
    const preview = () => {
      $('#bgOpVal').textContent = bgOpEl.value + '%';
      $('#pnOpVal').textContent = pnOpEl.value + '%';
      const root = document.documentElement.style;
      const v = Math.max(0, Math.min(100, +bgOpEl.value)) / 100;
      const p = Math.max(30, Math.min(100, +pnOpEl.value)) / 100;
      root.setProperty('--aurora-op', v.toFixed(3));
      root.setProperty('--bg-mask', (1 - v * 0.85).toFixed(3));
      root.setProperty('--bg-mask-dark', (1 - v * 0.85).toFixed(3));
      root.setProperty('--panel-alpha', p.toFixed(3));
    };
    bgOpEl.oninput = preview;
    pnOpEl.oninput = preview;
    const saveOpacity = () => { store.update(s => { s.settings.appearance = { bgOpacity: +bgOpEl.value, panelOpacity: +pnOpEl.value }; }); toast('外观已保存', 'ok'); };
    bgOpEl.onchange = saveOpacity;
    pnOpEl.onchange = saveOpacity;
  }
}

function notifPermText() {
  if (!('Notification' in window)) return '浏览器不支持';
  return { granted: '已授权', denied: '已拒绝', default: '未授权' }[Notification.permission];
}
function notifPermChip() {
  if (!('Notification' in window)) return 'gray';
  return { granted: 'ok', denied: 'danger', default: 'warn' }[Notification.permission];
}
