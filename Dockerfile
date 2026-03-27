FROM node:20

# 只安装运行时必需的小工具（cups-client 很小）
RUN apt-get update && apt-get install -y --no-install-recommends \
    cups-client \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
COPY src/ ./src/
COPY public/ ./public/
COPY entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh

EXPOSE 3000

ENV TZ=Asia/Shanghai
ENV CUPS_HOST=192.168.10.1
ENV CUPS_PORT=631

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "src/app.js"]
