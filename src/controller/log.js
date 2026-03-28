/**
 * 日志控制器
 */
import fs from 'fs';
import path from 'path';
import { LOG_DIR } from '../config/config.js';
import logger from '../utils/logger.js';

// 获取日志列表和内容
export async function getLogs(req, res) {
  try {
    const date = req.query.date;

    if (date) {
      const logFile = path.join(LOG_DIR, `${date}.log`);
      if (fs.existsSync(logFile)) {
        const content = fs.readFileSync(logFile, 'utf-8');
        res.json({ logs: content.split('\n').filter(line => line.trim()) });
      } else {
        res.json({ logs: [] });
      }
    } else {
      const files = fs.readdirSync(LOG_DIR)
        .filter(f => f.endsWith('.log'))
        .map(f => {
          const stats = fs.statSync(path.join(LOG_DIR, f));
          return {
            name: f,
            date: f.replace('.log', ''),
            size: stats.size,
            modified: stats.mtime.toISOString()
          };
        })
        .sort((a, b) => b.date.localeCompare(a.date));

      let todayLogs = [];
      if (req.query.content === 'true') {
        const today = new Date().toISOString().split('T')[0];
        const todayFile = path.join(LOG_DIR, `${today}.log`);
        if (fs.existsSync(todayFile)) {
          todayLogs = fs.readFileSync(todayFile, 'utf-8')
            .split('\n')
            .filter(line => line.trim());
        }
      }

      res.json({ files, todayLogs });
    }
  } catch (error) {
    logger.error('获取日志失败', { error: error.message });
    res.status(500).json({ error: error.message });
  }
}

// 清空日志
export async function clearLogs(req, res) {
  try {
    const date = req.query.date;

    if (date) {
      const logFile = path.join(LOG_DIR, `${date}.log`);
      if (fs.existsSync(logFile)) {
        fs.unlinkSync(logFile);
        logger.info('删除日志', { date });
        res.json({ success: true, message: `已删除 ${date} 的日志` });
      } else {
        res.json({ success: false, message: '日志文件不存在' });
      }
    } else {
      const files = fs.readdirSync(LOG_DIR).filter(f => f.endsWith('.log'));
      files.forEach(f => {
        fs.unlinkSync(path.join(LOG_DIR, f));
      });
      logger.info('删除所有日志', { count: files.length });
      res.json({ success: true, message: `已删除 ${files.length} 个日志文件` });
    }
  } catch (error) {
    logger.error('清空日志失败', { error: error.message });
    res.status(500).json({ error: error.message });
  }
}
