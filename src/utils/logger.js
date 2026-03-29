import path from 'path';
import fs from 'fs';
import { LOG_DIR, DEV } from '../config/config.js';

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

function shouldOutput(level) {
  // error 任何时候都输出
  if (level === 'ERROR') return true;
  // log 任何时候都不输出
  if (level === 'LOG') return false;
  // dev 模式开启时全部输出
  if (DEV) return true;
  // dev 关闭时 info 和 warn 不输出
  if (level === 'INFO' || level === 'WARN') return false;
  if (level === 'DEBUG') return false;
  return false;
}

function shouldRecord(level) {
  // log 任何时候都不记录
  if (level === 'LOG') return false;
  // dev 关闭时 debug 不记录
  if (!DEV && level === 'DEBUG') return false;
  return true;
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

  // 记录到文件
  if (shouldRecord(level)) {
    logEntry += '\n';
    fs.appendFileSync(getLogFilename(), logEntry);
  }

  // 输出到控制台
  if (shouldOutput(level)) {
    if (level === 'ERROR') {
      console.error(logEntry);
    } else {
      console.log(logEntry);
    }
  }
}

// 导出的 logger 对象
const logger = {
  info: (msg, data) => log('INFO', msg, data),
  warn: (msg, data) => log('WARN', msg, data),
  error: (msg, data) => log('ERROR', msg, data),
  debug: (msg, data) => log('DEBUG', msg, data),
  // 通用日志方法，任何时候都只记录不输出
  log: (...args) => {
    const timestamp = formatTime(new Date());
    const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
    const logEntry = `[${timestamp}] [LOG] ${message}\n`;
    fs.appendFileSync(getLogFilename(), logEntry);
  }
};

// 覆盖全局 console 方法（可选，方便替换所有 console）
if (DEV) {
  console.log = (...args) => logger.log(...args);
  console.info = (...args) => logger.info(args.join(' '));
  console.warn = (...args) => logger.warn(args.join(' '));
  console.error = (...args) => logger.error(args.join(' '));
  console.debug = (...args) => logger.debug(...args);
}

export default logger;
