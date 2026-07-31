# 把「灵记」部署到你的 GitHub（永久托管 + 自带同步）

目标：把这套纯静态文件放到你自己的 GitHub 仓库并开启 Pages，这样网址永远在你手里、不会因沙箱被清而消失；同时把 GitHub 作为云同步后端，三端数据自动合并。

> 全程用 GitHub 网页操作，**不需要命令行**。若你有 `gh` 或愿意给我一个 PAT，我也可以直接帮你推上去。

## 一、上传文件并开启 Pages（约 2 分钟）

1. 登录 GitHub → 右上角 **New repository**，仓库名填 `lingji`，**Public**，**不要**勾选 Add README（勾了会产生冲突提交）。
2. 进入仓库 → **Add file → Upload files**，把这个目录里的**全部内容**拖进去上传：
   - `index.html`、`manifest.webmanifest`、`sw.js`、`.nojekyll`
   - `assets/`（含 css、生成的 png/svg 图标）
   - `js/`（含 app.js、store.js、views/、data/）
   - （`serve.js`、`tools/`、`test/` 是开发用，可不传，传了也无害）
3. 提交后 → **Settings → Pages** → Source 选 **Deploy from a branch** → Branch 选 **main / master**，目录 **/ (root)** → Save。
4. 等 1 分钟，访问 **https://hanlingzhan.github.io/lingji/** 即可。建议「添加到主屏幕」安装为 App。

### 命令行推送（本地仓库已初始化好，直接复制运行）

```bash
cd C:/Users/zhl/Desktop/work_zhl/workbench
git remote add origin https://github.com/HanlingZhan/lingji.git
git push -u origin main
```

推送时若弹窗要登录，选 **Sign in with your browser** 即可；或用 PAT 当密码。

## 二、用同一个仓库做云同步后端（数据也在你手里）

让同步端点指向仓库里的 `data/state.json`：

1. 在仓库里新建目录 `data/`，并在里面建一个文件 `state.json`，内容写 `{}` 并提交。
2. 打开「灵记 → 设置 → 多端云同步」：
   - 启用云端同步 ✅
   - 后端类型：**GitHub**
   - 端点：`https://api.github.com/repos/HanlingZhan/lingji/contents/data/state.json`
   - 令牌：GitHub **Personal Access Token**（勾 `repo` 权限，Fine-grained 也行，需有该仓库的 contents 读写）。生成地址：`GitHub → Settings → Developer settings → Personal access tokens`。
   - 保存 → 点「⬆ 推送到云端」测试。
3. Windows / 安卓 / iPad 三端都这样配同一个仓库，数据按「最后写入优先」自动合并。

> 注意：GitHub API 对匿名/低频调用够用；免费额度很大。令牌只存你本地浏览器，不上传第三方。

## 三、以后怎么更新

我每次帮你改完代码，会重新部署沙箱给你预览；你要把新版本落到 GitHub 时，把更新后的文件再 Upload 一次（覆盖同名文件）即可。需要我直接推，给我仓库写权限的 PAT 或让我连 GitHub 连接器都行。

## 四、备选：同步到其他自有云

- **WebDAV**（群晖/Nextcloud）：端点填完整文件路径 `https://你的dav域名/lingji/state.json`，令牌填 `用户名:密码` 的 Base64。
- **通用端点**（Cloudflare Workers KV / Supabase Storage / jsonbin）：端点填支持 GET/PUT 的地址，令牌作 Bearer 发送。
