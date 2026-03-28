#!/bin/sh
# 首次部署时安装依赖（字体 + npm 包）

# 检查是否需要安装字体
need_fonts=false
if [ ! -f "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc" ] && [ ! -f "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc" ]; then
    need_fonts=true
fi

# 检查 node_modules 是否存在且有内容
need_install=false
if [ ! -d "/app/node_modules" ] || [ -z "$(ls -A /app/node_modules 2>/dev/null)" ]; then
    need_install=true
fi

# 也检查标记文件
if [ ! -f "/app/node_modules/.installed" ]; then
    need_install=true
fi

if [ "$need_fonts" = true ] || [ "$need_install" = true ]; then
    echo "首次部署，正在安装依赖..."

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

fi

exec "$@"
