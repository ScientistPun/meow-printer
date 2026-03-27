#!/bin/sh
# 首次部署时安装依赖（构建工具 + npm 包）

# 检查 node_modules 是否存在且有内容
need_install=false
if [ ! -d "/app/node_modules" ] || [ -z "$(ls -A /app/node_modules 2>/dev/null)" ]; then
    need_install=true
fi

# 也检查标记文件
if [ ! -f "/app/node_modules/.installed" ]; then
    need_install=true
fi

if [ "$need_install" = true ]; then
    echo "首次部署，正在安装依赖..."

    # 安装编译工具（canvas/sharp 等原生模块需要）
    apt-get update && apt-get install -y --no-install-recommends \
        python3 make g++ pkg-config \
        libpixman-1-dev libcairo2-dev libpango1.0-dev \
        libjpeg-dev libpng-dev

    # 安装 npm 依赖
    if npm install --omit=dev 2>&1 | tee /tmp/npm-install.log; then
        # 标记已安装
        touch /app/node_modules/.installed
        echo "依赖安装成功"
    else
        echo "=== npm 安装失败，错误日志 ==="
        cat /tmp/npm-install.log
        echo "================================"
        # 不删除编译工具以便调试
        exit 1
    fi

    # 移除编译工具以减小运行体积
    apt-get purge -y python3 make g++ pkg-config \
        libpixman-1-dev libcairo2-dev libpango1.0-dev \
        libjpeg-dev libpng-dev
    apt-get autoremove -y
    apt-get clean
    rm -rf /var/lib/apt/lists/*
fi

exec "$@"
