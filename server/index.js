import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getPrinters, printFile, getJobs, cancelJob, getPrinterCapabilities } from './cups.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// 支持的文件类型
const SUPPORTED_FILE_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx'];

// 缓存目录（存放临时 PDF 文件）
const CACHE_DIR = path.join(__dirname, 'cache');
fs.mkdirSync(CACHE_DIR, { recursive: true });

// 日志配置
const LOG_DIR = path.join(__dirname, 'logs');
fs.mkdirSync(LOG_DIR, { recursive: true });

function getLogFilename() {
  const now = new Date();
  const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
  return path.join(LOG_DIR, `${date}.log`);
}

function formatTime(date) {
  return date.toISOString();
}

function log(level, message, data = null) {
  const timestamp = formatTime(new Date());
  let logEntry = `[${timestamp}] [${level}] ${message}`;
  if (data) {
    logEntry += ` ${JSON.stringify(data)}`;
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

const logger = {
  info: (msg, data) => log('INFO', msg, data),
  warn: (msg, data) => log('WARN', msg, data),
  error: (msg, data) => log('ERROR', msg, data)
};

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
app.use(express.static(path.join(__dirname, 'public')));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const uploadDir = path.join(__dirname, 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    // 保留原始文件名，添加时间戳前缀避免冲突
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }
});

// 获取打印机列表
app.get('/api/printers', async (req, res) => {
  try {
    const printers = await getPrinters();
    logger.info('获取打印机列表', { count: printers.length, requestId: req.requestId });
    res.json({ printers });
  } catch (error) {
    logger.error('获取打印机列表失败', { error: error.message, requestId: req.requestId });
    res.status(500).json({ error: error.message });
  }
});

// 获取打印机支持的纸张尺寸
app.get('/api/printers/capabilities', async (req, res) => {
  try {
    const printer = req.query.printer;
    if (!printer) {
      return res.status(400).json({ error: '缺少打印机参数' });
    }
    const mediaOptions = await getPrinterCapabilities(printer);
    logger.info('获取打印机纸张尺寸', { printer, mediaOptions, requestId: req.requestId });
    res.json({ mediaOptions });
  } catch (error) {
    logger.error('获取打印机纸张尺寸失败', { error: error.message, requestId: req.requestId });
    res.status(500).json({ error: error.message });
  }
});

// 提交打印任务
app.post('/api/print', upload.single('file'), async (req, res) => {
  try {
    let filePath, originalName;

    // 判断是新上传文件还是历史文件
    if (req.file) {
      // 新上传的文件
      filePath = req.file.path;
      originalName = req.file.originalname;
    } else if (req.body.filePath) {
      // 历史文件（已存在于 uploads 目录）
      filePath = path.join(uploadDir, req.body.filePath);
      originalName = req.body.originalName || req.body.filePath;
      if (!fs.existsSync(filePath)) {
        logger.warn('打印请求失败：历史文件不存在', { requestId: req.requestId, filePath });
        return res.status(400).json({ success: false, error: '历史文件不存在' });
      }
    } else {
      logger.warn('打印请求失败：未上传文件', { requestId: req.requestId });
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const printer = req.body.printer || 'default';
    const options = {
      copies: parseInt(req.body.copies) || 1,
      media: req.body.media || 'A4',
      mediaWidth: req.body.mediaWidth ? parseInt(req.body.mediaWidth) : null,
      mediaHeight: req.body.mediaHeight ? parseInt(req.body.mediaHeight) : null,
      orientation: req.body.orientation || 'portrait',
      pageSet: req.body.pageSet || 'all',
      nup: parseInt(req.body.nup) || 1,
      scaling: req.body.scaling,
      noHeaderFooter: req.body.noHeaderFooter === 'true' || req.body.noHeaderFooter === true
    };

    logger.info('收到打印请求', {
      requestId: req.requestId,
      file: originalName,
      printer,
      options
    });

    const result = await printFile(filePath, printer, options);

    if (result.success) {
      logger.info('打印任务提交成功', {
        requestId: req.requestId,
        jobId: result.jobId,
        file: originalName
      });
    } else {
      logger.error('打印任务提交失败', {
        requestId: req.requestId,
        error: result.error
      });
    }

    res.json(result);
  } catch (error) {
    logger.error('打印请求异常', { error: error.message, requestId: req.requestId });
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取打印任务
app.get('/api/jobs', async (req, res) => {
  try {
    const printer = req.query.printer;
    const jobs = await getJobs(printer);
    logger.info('获取打印任务列表', { printer: printer || 'all', count: jobs.length });
    res.json({ jobs });
  } catch (error) {
    logger.error('获取打印任务列表失败', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 取消打印任务
app.delete('/api/jobs/:id', async (req, res) => {
  try {
    const result = await cancelJob(req.params.id);
    if (result.success) {
      logger.info('取消打印任务成功', { jobId: req.params.id });
    } else {
      logger.warn('取消打印任务失败', { jobId: req.params.id, error: result.error });
    }
    res.json(result);
  } catch (error) {
    logger.error('取消打印任务异常', { error: error.message, jobId: req.params.id });
    res.status(500).json({ error: error.message });
  }
});

// 获取日志列表和内容
app.get('/api/logs', async (req, res) => {
  try {
    const date = req.query.date; // 可选，指定日期 YYYY-MM-DD

    if (date) {
      // 返回指定日期的日志
      const logFile = path.join(LOG_DIR, `${date}.log`);
      if (fs.existsSync(logFile)) {
        const content = fs.readFileSync(logFile, 'utf-8');
        res.json({ logs: content.split('\n').filter(line => line.trim()) });
      } else {
        res.json({ logs: [] });
      }
    } else {
      // 返回所有日志文件列表
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
        .sort((a, b) => b.date.localeCompare(a.date)); // 最新日期排前面

      // 如果请求包含 content=true，返回今日日志内容
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
});

// 清空日志
app.delete('/api/logs', async (req, res) => {
  try {
    const date = req.query.date; // 可选，指定日期

    if (date) {
      // 删除指定日期的日志
      const logFile = path.join(LOG_DIR, `${date}.log`);
      if (fs.existsSync(logFile)) {
        fs.unlinkSync(logFile);
        logger.info('删除日志', { date });
        res.json({ success: true, message: `已删除 ${date} 的日志` });
      } else {
        res.json({ success: false, message: '日志文件不存在' });
      }
    } else {
      // 删除所有日志
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
});

// 获取上传文件列表（历史文件）
app.get('/api/history', async (req, res) => {
  try {
    const files = fs.readdirSync(uploadDir)
      .filter(f => SUPPORTED_FILE_EXTENSIONS.includes(path.extname(f).toLowerCase()))
      .map(f => {
        const stats = fs.statSync(path.join(uploadDir, f));
        return {
          name: f,
          originalName: f.replace(/^\d+-/, ''), // 去掉时间戳前缀
          size: stats.size,
          modified: stats.mtime.toISOString()
        };
      })
      .sort((a, b) => new Date(b.modified) - new Date(a.modified)); // 最新在前

    res.json({ files });
  } catch (error) {
    logger.error('获取历史文件失败', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 删除历史文件
app.delete('/api/history/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(uploadDir, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info('删除历史文件', { filename });
      res.json({ success: true, message: '已删除' });
    } else {
      res.status(404).json({ success: false, error: '文件不存在' });
    }
  } catch (error) {
    logger.error('删除历史文件失败', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 预览打印效果（生成预览PDF）
app.post('/api/preview', upload.single('file'), async (req, res) => {
  try {
    let filePath;

    if (req.file) {
      filePath = req.file.path;
    } else if (req.body.filePath) {
      filePath = path.join(uploadDir, req.body.filePath);
      if (!fs.existsSync(filePath)) {
        return res.status(400).json({ error: '历史文件不存在' });
      }
    } else {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const options = {
      copies: 1,
      media: req.body.media || 'A4',
      mediaWidth: req.body.mediaWidth ? parseInt(req.body.mediaWidth) : null,
      mediaHeight: req.body.mediaHeight ? parseInt(req.body.mediaHeight) : null,
      orientation: req.body.orientation || 'portrait',
      scaling: req.body.scaling
    };

    // 如果没有指定自定义尺寸，从纸张名称获取尺寸
    if (!options.mediaWidth || !options.mediaHeight) {
      const { getMediaSizeMM } = await import('./cups.js');
      const mediaSize = getMediaSizeMM(options.media);
      if (mediaSize) {
        options.mediaWidth = mediaSize.width;
        options.mediaHeight = mediaSize.height;
      }
    }

    // 处理文件方向和尺寸
    const ext = path.extname(filePath).toLowerCase();
    let previewFilePath;

    if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.tiff', '.bmp'].includes(ext)) {
      const { imageToPdfPortrait, imageToPdfLandscape } = await import('./cups.js');
      if (options.orientation === 'portrait') {
        previewFilePath = await imageToPdfPortrait(filePath, options);
      } else {
        previewFilePath = await imageToPdfLandscape(filePath, options);
      }
    } else if (ext === '.pdf') {
      const { setPdfPortrait, setPdfLandscape } = await import('./cups.js');
      if (options.orientation === 'portrait') {
        previewFilePath = await setPdfPortrait(filePath, options);
      } else {
        previewFilePath = await setPdfLandscape(filePath, options);
      }
    } else {
      return res.status(400).json({ error: '不支持的文件类型' });
    }

    // 返回预览文件
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    fs.createReadStream(previewFilePath).pipe(res);
  } catch (error) {
    logger.error('预览生成失败', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 获取历史文件内容（用于预览）
app.get('/api/preview', async (req, res) => {
  try {
    const filename = req.query.filename;
    if (!filename) {
      return res.status(400).json({ error: '缺少文件名参数' });
    }

    // 在 uploads 目录中查找匹配的文件
    const files = fs.readdirSync(uploadDir);
    const matchedFile = files.find(f => f.endsWith(filename) || f.includes(filename));

    if (!matchedFile) {
      return res.status(404).json({ error: '文件不存在' });
    }

    const filePath = path.join(uploadDir, matchedFile);
    const ext = path.extname(matchedFile).toLowerCase();

    const contentTypes = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    };

    const contentType = contentTypes[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', 'inline');
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    logger.error('预览文件失败', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 清空所有历史文件
app.delete('/api/history', async (req, res) => {
  try {
    const files = fs.readdirSync(uploadDir).filter(f =>
      SUPPORTED_FILE_EXTENSIONS.includes(path.extname(f).toLowerCase())
    );
    files.forEach(f => {
      fs.unlinkSync(path.join(uploadDir, f));
    });
    logger.info('清空所有历史文件', { count: files.length });
    res.json({ success: true, message: `已删除 ${files.length} 个文件` });
  } catch (error) {
    logger.error('清空历史文件失败', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 清空缓存文件
app.delete('/api/cache', async (req, res) => {
  try {
    const files = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.pdf'));
    files.forEach(f => {
      fs.unlinkSync(path.join(CACHE_DIR, f));
    });
    logger.info('清空缓存文件', { count: files.length });
    res.json({ success: true, message: `已删除 ${files.length} 个缓存文件` });
  } catch (error) {
    logger.error('清空缓存文件失败', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Meow Printer server started on http://0.0.0.0:${PORT}`);
});
