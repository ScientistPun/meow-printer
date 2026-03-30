import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { PORT, MAX_FILE_SIZE, UPLOAD_DIR, LOG_DIR } from './config/config.js';
import logger from './utils/logger.js';

// 确保必要的目录存在
[UPLOAD_DIR, LOG_DIR].forEach(dir => {
  fs.mkdirSync(dir, { recursive: true });
});

// 导入控制器
import * as fontController from './controller/font.js';
import * as printerController from './controller/printer.js';
import * as fileController from './controller/file.js';
import * as logController from './controller/log.js';
import * as settingsController from './controller/settings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// 记录请求日志中间件
app.use((req, res, next) => {
  const start = Date.now();
  const requestId = Date.now().toString(36);

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.path}`, {
      requestId,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip
    });
  });

  req.requestId = requestId;
  next();
});

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'web')));

// Serve utils files (for ES modules)
app.use('/utils', express.static(path.join(__dirname, 'utils')));

// Serve config files (for ES modules)
app.use('/config', express.static(path.join(__dirname, 'config')));

// Serve fonts files
app.use('/fonts', express.static(path.join(__dirname, '../public/fonts')));

// Serve uploaded files
app.use('/uploads', express.static(UPLOAD_DIR));

// 初始化控制器

// 文件上传中间件
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    let filename = file.originalname;
    // 检测文件名是否是 Latin-1 编码（被错误解读为 UTF-8）
    // 特征：包含非 ASCII 字符，且转换后包含有效的中文字符
    if (/[^\x00-\x7F]/.test(filename)) {
      const latin1Converted = Buffer.from(filename, 'latin1').toString('utf8');
      // 检测转换后是否包含有效的中文字符（Unicode 范围 4E00-9FFF）
      const hasValidChinese = /[\u4E00-\u9FFF]/.test(latin1Converted);
      if (hasValidChinese) {
        filename = latin1Converted;
      }
    }
    // 移除非法的文件系统字符
    filename = filename.replace(/[\/\\:*?"<>|]/g, '_');
    cb(null, `${Date.now()}-${filename}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE }
});

// ==================== 字体相关 ====================

app.get('/api/fonts', fontController.getFonts);
app.post('/api/fonts', upload.single('file'), fontController.addFont);
app.post('/api/fonts/register', fontController.registerFont);

// ==================== 打印机相关 ====================

app.get('/api/printers', printerController.getPrinters);
app.get('/api/printers/capabilities', printerController.getPrinterCapabilities);
app.get('/api/jobs', printerController.getJobs);
app.delete('/api/jobs/:id', printerController.cancelJob);

// ==================== 文件相关 ====================

app.post('/api/upload', upload.array('files'), fileController.uploadFile);
app.get('/api/history', fileController.getHistory);
app.delete('/api/history/:filename', fileController.deleteHistoryFile);
app.delete('/api/history', fileController.clearHistory);
app.get('/api/file/dimensions', fileController.getFileDimensions);
app.post('/api/file/dimensions', upload.single('file'), fileController.getUploadedFileDimensions);
app.get('/api/preview', fileController.previewFile);
app.delete('/api/cache', fileController.clearCache);

// ==================== 打印相关 ====================

app.post('/api/print', upload.single('file'), printerController.printFile);

// ==================== 预览相关 ====================

app.post('/api/preview', upload.single('file'), printerController.previewPrint);

// ==================== 文本文件相关 ====================

app.post('/api/files', upload.none(), fileController.createTextFile);

// ==================== 日志相关 ====================

app.get('/api/logs', logController.getLogs);
app.delete('/api/logs', logController.clearLogs);

// ==================== 设置相关 ====================

app.get('/api/settings', settingsController.getSettings);
app.post('/api/settings', settingsController.saveSettings);

// ==================== 启动服务器 ====================

app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Meow Printer server started on http://0.0.0.0:${PORT}`);
});
