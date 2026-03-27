FROM debian:bookworm-slim

# 安装 Node.js 和运行时依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends \
    nodejs \
    cups-client \
    fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/* \
    && fc-cache -f

WORKDIR /app

COPY package*.json ./
COPY src/ ./src/
COPY public/ ./public/
COPY entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh

EXPOSE 3000

ENV CUPS_HOST=192.168.10.1
ENV CUPS_PORT=631

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "src/app.js"]
