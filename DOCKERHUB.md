# Meow Printer

局域网打印机控制服务，通过 Web 界面上传文件并发送到 CUPS 打印机打印。

## 特性

- **中文支持**: 完整的 UTF-8 locale 支持，中文文件名无乱码
- **多格式支持**: PDF、JPG、PNG、DOC、DOCX
- **N-up 打印**: 每张纸打印 2、4、6、9 页
- **自定义页面范围**: 支持指定页面（如 1,3,5-10）
- **页面缩放**: 适应页面或自定义百分比（10%-200%滑块）
- **方向模式**: 支持纵向和横向
- **字体管理**: 自动检测字体目录中的字体
- **中文 PDF**: 内置思源黑体等中文字体

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
│   └── view/            # 前端视图
├── public/
│   ├── cache/           # 缓存目录
│   ├── fonts/           # 字体目录
│   └── uploads/         # 上传目录
├── logs/                # 日志目录
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

### 目录说明

- `public/` - 静态资源目录（缓存、字体、上传文件）
- `logs/` - 日志文件目录

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/printers | 获取打印机列表 |
| POST | /api/print | 提交打印任务 |
| GET | /api/jobs | 获取打印任务列表 |
| DELETE | /api/jobs/:id | 取消打印任务 |
| GET | /api/fonts | 获取可用字体 |
| POST | /api/fonts | 上传新字体 |
| POST | /api/files | 创建文本文件 |

## 部署说明

### OpenWrt Docker 部署

1. 确保 OpenWrt 已安装 Docker
2. 上传项目文件到 OpenWrt
3. 运行 `docker-compose up -d`
4. 配置 frp 将内网 3000 端口穿透到公网

### CUPS 配置

确保 CUPS 已正确配置打印机，容器需要访问 CUPS socket:

```yaml
volumes:
  - /var/run/cups.sock:/var/run/cups.sock:ro
```
