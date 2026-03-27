FROM node:20

RUN apt-get update && apt-get install -y --no-install-recommends \
    cups-client \
    fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/* \
    && fc-cache -f

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY src/ ./src/
COPY public/ ./public/

EXPOSE 3000

# CUPS 配置
ENV CUPS_HOST=192.168.10.1
ENV CUPS_PORT=631

CMD ["node", "src/app.js"]
