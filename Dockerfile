FROM node:20-alpine

RUN apk add --no-cache cups cups-client lp-solve libcups2

WORKDIR /app

COPY server/package*.json ./
RUN npm install

COPY server/ ./

EXPOSE 3000

# CUPS 配置
ENV CUPS_HOST=192.168.10.1
ENV CUPS_PORT=631
ENV CUPS_USER=root
ENV CUPS_PASS=

CMD ["node", "index.js"]
