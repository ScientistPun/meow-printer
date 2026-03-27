import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 日志目录（相对于 server 目录）
const LOG_DIR = path.join(__dirname, 'logs');

// 确保日志目录存在
try {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
} catch (e) {}

// 获取日志文件名
function getLogFilename() {
  const now = new Date();
  const date = now.toISOString().split('T')[0];
  return path.join(LOG_DIR, `${date}.log`);
}

// 日志函数
function formatTime(date) {
  return date.toISOString();
}

function log(level, message, data = null) {
  const timestamp = formatTime(new Date());
  let logEntry = `[${timestamp}] [${level}] ${message}`;
  if (data) {
    if (typeof data === 'object') {
      logEntry += ` ${JSON.stringify(data)}`;
    } else {
      logEntry += ` ${data}`;
    }
  }
  logEntry += '\n';

  // 写入文件
  fs.appendFileSync(getLogFilename(), logEntry);

  // 同时输出到控制台
  if (level === 'ERROR') {
    console.error(logEntry.trim());
  } else {
    console.log(logEntry.trim());
  }
}

// 导出的 logger 对象
const logger = {
  info: (msg, data) => log('INFO', msg, data),
  warn: (msg, data) => log('WARN', msg, data),
  error: (msg, data) => log('ERROR', msg, data),
  debug: (msg, data) => log('DEBUG', msg, data),
  // 通用日志方法，支持多参数
  log: (...args) => {
    const timestamp = formatTime(new Date());
    const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
    const logEntry = `[${timestamp}] [LOG] ${message}\n`;
    fs.appendFileSync(getLogFilename(), logEntry);
    console.log(logEntry.trim());
  }
};

export default logger;
