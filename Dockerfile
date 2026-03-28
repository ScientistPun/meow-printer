FROM node:20-bullseye

# 只安装运行时必需的小工具
RUN apt-get update && apt-get install -y --no-install-recommends \
    cups-client \
    locales \
    && rm -rf /var/lib/apt/lists/*

# 设置 UTF-8 locale 支持中文文件名
RUN sed -i 's/# en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' /etc/locale.gen && \
    locale-gen en_US.UTF-8
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

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
