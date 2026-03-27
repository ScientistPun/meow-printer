FROM node:20

# 安装运行时依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    cups-client \
    fonts-noto-cjk \
    fontconfig \
    && rm -rf /var/lib/apt/lists/* \
    && fc-cache -f

WORKDIR /app

COPY package*.json ./
COPY src/ ./src/
COPY public/ ./public/
COPY entrypoint.sh /entrypoint.sh

# 挂载目录（避免数据写入镜像，占用空间）
VOLUME ["/app/logs"]

RUN chmod +x /entrypoint.sh

EXPOSE 3000

ENV TZ=Asia/Shanghai
ENV CUPS_HOST=192.168.10.1
ENV CUPS_PORT=631

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "src/app.js"]
