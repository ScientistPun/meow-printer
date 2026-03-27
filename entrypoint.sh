#!/bin/sh
# 首次部署时安装依赖（构建工具 + npm 包）
if [ ! -f "/app/node_modules/.installed" ]; then
    echo "首次部署，正在安装依赖..."

    # 安装编译工具（canvas/sharp 等原生模块需要）
    apt-get update && apt-get install -y --no-install-recommends \
        python3 make g++ pkg-config \
        libpixman-1-dev libcairo2-dev libpango1.0-dev \
        libjpeg-dev libpng-dev

    # 安装 npm 依赖
    npm install --omit=dev

    # 标记已安装
    touch /app/node_modules/.installed

    # 移除编译工具以减小运行体积
    apt-get purge -y python3 make g++ pkg-config \
        libpixman-1-dev libcairo2-dev libpango1.0-dev \
        libjpeg-dev libpng-dev
    apt-get autoremove -y
    apt-get clean
    rm -rf /var/lib/apt/lists/*

    echo "依赖安装完成"
fi

exec "$@"
