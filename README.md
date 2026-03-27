# Meow Printer

局域网打印机控制服务，通过 Web 界面上传文件并发送到 CUPS 打印机打印。

## 快速开始

### 开发模式

```bash
npm install
npm start
```

访问 http://localhost:3000

### Docker 部署 (OpenWrt)

```bash
docker-compose up -d
```

## 项目结构

```
meow-printer/
├── src/
│   ├── app.js           # Express 服务入口
│   ├── config.js        # 配置常量
│   ├── controller/      # 前端控制器
│   ├── service/         # 服务层 (cups.js, pdf.js)
│   ├── utils/           # 工具函数 (logger.js)
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
