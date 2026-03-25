# Meow Printer

局域网打印机控制服务，通过 Web 界面上传文件并发送到 CUPS 打印机打印。

## 快速开始

### 开发模式

```bash
cd server
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
├── server/
│   ├── index.js       # Express 服务入口
│   ├── cups.js        # CUPS 打印功能
│   ├── public/        # 前端静态文件
│   │   └── index.html
│   ├── uploads/        # 上传临时文件
│   └── package.json
├── docker-compose.yml
├── Dockerfile
└── README.md
```

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
