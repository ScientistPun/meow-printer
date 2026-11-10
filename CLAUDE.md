# CLAUDE.md

本文件为 Claude Code 在本仓库工作时提供指引。

## 项目简介

**Meow Printer** —— 一个自托管的网页打印服务。通过 CUPS 协议管理局域网打印机，提供移动端友好的 Web 界面：上传图片/PDF、转换为 PDF、设置纸张/方向/缩放/页面范围/每版页数、添加页码、长图拼接、文本 PDF 生成、历史文件管理、打印任务管理、运行日志查看。

- 仓库：https://github.com/ScientistPun/meow-printer
- Docker 镜像：`scientistpun/meow-printer`（Docker Hub）

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Node.js 20 + Express 4，**ESM**（`package.json` 中 `"type": "module"`），无 TypeScript、无构建步骤 |
| PDF 处理 | `pdf-lib`（生成/编辑 PDF）、`sharp`（图片元数据与转换）、`fontkit`（自定义字体嵌入） |
| 打印 | `child_process` 调用 CUPS 客户端命令（`lp` / `lpstat`），支持远程 CUPS 主机 |
| 上传 | `multer`（磁盘存储） |
| 前端 | Vue 3（**本地引入 `lib/vue.min.js`，无打包器**）、单页应用，`src/web/index.html` 内联模板 + `src/web/lib/functions.js` 共享状态库 |

> 前端没有打包器：改完 `src/web/` 下的文件刷新浏览器即可，不需要 npm build。`index.html` 用 `<script type="module">` 引入 `index.js`，后者调用 `createSharedState()` 拿到全部状态与函数。

## 目录结构

```
src/
├── app.js                  # Express 入口：中间件、静态资源、全部路由注册
├── config/
│   ├── config.js           # 路径/端口/CUPS/字体等环境与路径常量
│   └── global.js           # 前后端共用的业务常量（DEFAULT_SETTINGS、PRINT_ORIENTATION 等）
├── controller/             # HTTP 控制器：file / printer / log / settings / font
├── service/
│   ├── pdf.js              # 全部 PDF 处理（PDF 类单例）：图片转 PDF、缩放、n-up、页码、拼接、文本 PDF
│   └── cups.js             # CUPS 服务类单例：打印机列表、任务、提交打印
├── utils/
│   ├── common.js           # 通用工具 + buildPrintOptions（请求体 → 打印选项）
│   └── logger.js           # 日志器（写文件 + 可选输出控制台）
└── web/                    # 前端静态资源
    ├── index.html          # 页面模板 + 全部 CSS（底部三个 Tab：打印/历史/日志；设置为弹窗）
    ├── index.js            # Vue 应用入口，调用 createSharedState
    └── lib/functions.js    # 共享状态与全部前端交互逻辑
public/                     # 运行时数据（uploads 用户文件、cache 中间产物、fonts 字体、settings.json）
logs/                       # 按天分文件的运行日志
```

## 常用命令

```bash
npm start                          # 启动服务（默认 http://localhost:3000）
docker compose up -d              # 以容器方式运行
docker buildx build --platform linux/amd64,linux/arm64 \
  -t scientistpun/meow-printer:<版本> -t scientistpun/meow-printer:latest --push .
```

## 核心流程：打印管线

`src/controller/printer.js` 的 `generatePrintPdf()` 是打印/预览共用的主管道，顺序固定：

1. **多文件合并** → `pdfService.mergePdfs()`（图片先经 `imageToPdf*` 转 PDF）
2. **纸张尺寸解析** → `processPrintOptions()`（`utils/common.js`）
3. **记录原始页数** `originalTotalPages`（合并后文档的总页数）
4. **页面处理** → `pdfService.scalePdf()`：按页面范围筛选 → 按方向/缩放适配纸张 → n-up 合版
5. **添加页码** → `pdfService.addPageNumbers()`

预览（`/api/preview`）复用同一条管线，只是 `copies` 固定为 1。

### 页面范围筛选的唯一来源

`pdfService.getFilteredPageIndices(totalPages, pageSet, customPages)` 返回「筛选后按输出顺序排列的源页索引（0-based）」。`scalePdf()` 和控制器都用它，保证筛选结果与页码映射永远一致。**不要在别处另写一份筛选逻辑。**

### 页码语义（分子/分母各自独立）

`addPageNumbers()` 接收两个基准参数：

| 参数 | 取值 | 含义 |
|---|---|---|
| `pageNumberBase` | `print`（默认）/ `file` | **分母**：打印总页数 / 文件总页数 |
| `currentPageBase` | `print`（默认）/ `file` | **分子**：该页是打印序列的第几页 / 是原文件中的第几页 |

例：10 页文件打印第 3-7 页 → 分子按文件页数时分母为 5 时显示 `3/5`、`4/5`…`7/5`；分子分母都按文件则为 `3/10`…`7/10`。

n-up 模式下页码标注在每个单元格（页）上，因此分母取**实际打印的页数**（与分子同单位），末版补齐的空单元格不编号。

## 新增一个前端选项的同步点

前端选项（如页码基准、纸张设置）需要在这几处保持一致，漏一处就会静默失效：

1. `src/web/lib/functions.js` —— `options` 响应式状态里的默认值
2. `src/web/lib/functions.js` —— 提交时 `formData.append(...)`（`printFile` 与 `previewPrint` 两处）
3. `src/utils/common.js` —— `buildPrintOptions()` 解析请求体（做类型归一，如 `body.x === 'file' ? 'file' : 'print'`）
4. `src/service/pdf.js` 或对应 service —— 消费该选项的逻辑
5. `src/web/index.html` —— 选项控件（`.option-chip` + `v-model`）

## 约定与坑

- **中文注释**：所有代码注释、日志文案、界面文案使用中文。
- **`console.log` 会被吞**：`src/config/config.js` 中 `DEV` 默认为 `true`，`utils/logger.js` 在 DEV 模式下会**覆盖全局 `console.log`**（改为写日志文件）。写临时脚本调试时请用 `process.stdout.write(...)`，否则看不到任何输出。
- **单例 service**：`pdf.js`、`cups.js` 导出的是单例实例，控制器里直接 `import pdfService from '../service/pdf.js'`。
- **路径常量集中在 `src/config/config.js`**，不要在业务代码里硬编码路径。
- **生成物不入库**：`public/uploads`、`public/cache`、`logs` 均在 `.gitignore` 中；中间 PDF 写在 `CACHE_DIR`。
- **文件名编码修复**：`app.js` 的 multer `filename` 里有一段 Latin-1 → UTF-8 的纠正逻辑（浏览器把中文名当 Latin-1 传回），改上传相关代码时别删。
- **单位换算**：`pdf.js` 里毫米/点/像素的换算统一走 `_mmToPoints` / `_pointsToMm` / `_mmToPixels` 等私有方法。
- **提交信息**：功能用 `feat:`，版本号用 `chore: bump version to vX.Y.Z`；由 Claude 完成的提交在正文末尾附 `Co-Authored-By: Claude <noreply@anthropic.com>`。
- **版本号三处同步**：`package.json`、`docker-compose.yml` 的镜像标签、`README.md` 的「历史变更」条目。

## 发布流程

发布新版本走项目自带的 skill：`/publish-new-version`（`.claude/skills/publish-new-version/SKILL.md`），它会依次处理版本号计算、README 变更记录、Git 提交与打标签、推送 GitHub、构建并推送 Docker Hub 多架构镜像。

提交与推送需要本机具备：git 推送权限、已登录的 Docker Hub（凭据由 Docker Desktop 的 credsStore 保管）、可用的 buildx builder（需支持 `linux/amd64` 与 `linux/arm64`）。

## 配置项（环境变量）

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | 3000 | 服务端口 |
| `DEV` | `true` | 调试模式（会覆盖 console 输出到日志文件） |
| `CUPS_HOST` | 192.168.10.1 | CUPS 服务器地址（非 localhost 时启用远程打印） |
| `CUPS_PORT` | 631 | CUPS 端口 |
| `CUPS_USER` / `CUPS_PWD` | print / print | CUPS 账号密码 |

用户级设置（默认纸张、字体、边距、网格线等）存在 `public/settings.json`，默认值见 `src/config/global.js` 的 `DEFAULT_SETTINGS`。
