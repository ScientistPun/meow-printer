# Meow Printer 打印喵

🌐 局域网打印机控制服务，通过 Web 界面上传文件并发送到 CUPS 打印机打印。支持移动端适配，随时随地打印文件。

## 特性

- **移动端适配**: 专为手机和平板优化的卡片式界面，随时随地打印
- **中文支持**: 完整的 UTF-8 locale 支持，中文文件名无乱码
- **多格式支持**: PDF、JPG、PNG、DOC、DOCX
- **文本创建**: 内置文本编辑器，支持创建纯文本文件并生成 PDF
- **N-up 打印**: 每张纸打印 2、4、6、9 页
- **自定义页面范围**: 支持指定页面（如 1,3,5-10）
- **页面缩放**: 适应页面或自定义百分比（10%-200%滑块）
- **方向模式**: 支持纵向和横向
- **字体管理**: 自动检测字体目录中的字体
- **历史文件**: 上传过的文件自动保存，随时重新打印
- **日志查看**: 实时查看应用运行日志

## 快速开始

### 开发模式

```bash
npm install
npm start
```

访问 http://localhost:3000

### Docker 部署

```bash
docker-compose up -d
```

## 项目结构

```
meow-printer/
├── src/
│   ├── app.js           # Express 服务入口
│   ├── config/          # 配置目录
│   │   ├── config.js    # 后端配置
│   │   └── global.js    # 全局共享配置
│   ├── controller/      # 控制器
│   ├── service/         # 服务层 (cups.js, pdf.js)
│   ├── utils/           # 工具函数
│   └── view/            # 前端视图 (index.html 移动端, old.html 桌面端)
├── public/
│   ├── cache/           # 缓存目录
│   ├── fonts/           # 字体目录
│   └── uploads/         # 上传目录
├── logs/                 # 日志目录
├── docker-compose.yml
├── Dockerfile
└── README.md
```

## 配置说明

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| CUPS_HOST | 192.168.10.1 | CUPS 服务器地址 |
| CUPS_PORT | 631 | CUPS 服务器端口 |
| DEV | false | 调试模式（开启时输出详细日志） |
| PORT | 3000 | 服务端口 |

### 目录说明

- `public/` - 静态资源目录（缓存、字体、上传文件）
- `logs/` - 日志文件目录
- `src/view/` - 前端页面（index.html 移动端，old.html 桌面端）

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/printers | 获取打印机列表 |
| POST | /api/print | 提交打印任务 |
| GET | /api/jobs | 获取打印任务列表 |
| DELETE | /api/jobs/:id | 取消打印任务 |
| GET | /api/fonts | 获取可用字体 |
| POST | /api/files | 上传文件 |
| POST | /api/textfile | 创建文本文件 |
| GET | /api/history | 获取历史文件 |
| DELETE | /api/history/:name | 删除历史文件 |
| GET | /api/logs | 获取日志列表 |
| GET | /api/settings | 获取设置 |
| POST | /api/settings | 保存设置 |

## 部署说明

### 前置要求

本应用为局域网打印机控制服务，部署前需要：

1. **CUPS 服务器** - 局域网内已部署并配置好打印机的 CUPS 服务器
2. **AirPrint 功能** - CUPS 服务器需启用 AirPrint（Bonjour/mDNS 广播）
3. **网络互通** - 部署机器与 CUPS 服务器网络相通

### Docker 部署

```bash
docker-compose up -d
```

### 环境变量配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| CUPS_HOST | 192.168.10.1 | CUPS 服务器地址 |
| CUPS_PORT | 631 | CUPS 服务器端口 |
| DEV | false | 调试模式 |
| TZ | Asia/Shanghai | 时区 |

### AirPrint 配置

确保 CUPS 已启用 Bonjour 广播，容器通过网络访问 CUPS:

```yaml
environment:
  - CUPS_HOST=192.168.10.1
  - CUPS_PORT=631
```

## License

MIT
