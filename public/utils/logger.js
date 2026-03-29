/**
 * 前端日志模块
 * 提供与后端 logger 类似的 API
 */

const logger = {
  debug: (...args) => console.debug('[DEBUG]', ...args),
  info: (...args) => console.info('[INFO]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  log: (...args) => console.log('[LOG]', ...args)
};

export default logger;
