import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getPrinters, printFile, getJobs, cancelJob, getPrinterCapabilities, getMediaSizeMM, getAvailableFonts, createTextPdf, getFileDimensions, matchToMediaSize, imageToPdfPortrait, imageToPdfLandscape, scalePdf, registerFont, addFontFile } from './service/cups.js';
import { UPLOAD_DIR, CACHE_DIR, LOG_DIR } from './config.js';
import logger from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// 支持的文件类型
const SUPPORTED_FILE_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx'];

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
app.use(express.static(path.join(__dirname, 'view')));

// Serve controller files (Vue.js app)
app.use('/controller', express.static(path.join(__dirname, 'controller')));

// Serve uploaded files
app.use('/uploads', express.static(UPLOAD_DIR));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    // 保留原始文件名，添加时间戳前缀避免冲突
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }
});

// 获取可用字体列表
app.get('/api/fonts', async (req, res) => {
  try {
    const fonts = getAvailableFonts();
    res.json({ fonts });
  } catch (error) {
    logger.error('获取字体列表失败', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 添加字体文件并自动注册
app.post('/api/fonts', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: '没有上传字体文件' });
    }

    const { fontId, fontName } = req.body;
    if (!fontId || !fontName) {
      return res.status(400).json({ success: false, error: '缺少 fontId 或 fontName 参数' });
    }

    const result = addFontFile(fontId, fontName, req.file.buffer, req.file.originalname);
    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    logger.error('添加字体失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// 注册已存在的字体文件
app.post('/api/fonts/register', async (req, res) => {
  try {
    const { fontId, fontName, filename } = req.body;
    if (!fontId || !fontName || !filename) {
      return res.status(400).json({ success: false, error: '缺少必要参数' });
    }

    const result = registerFont(fontId, fontName, filename);
    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    logger.error('注册字体失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
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
      filePath = path.join(UPLOAD_DIR, req.body.filePath);
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
      media: req.body.media || undefined,
      mediaWidth: req.body.mediaWidth ? parseInt(req.body.mediaWidth) : null,
      mediaHeight: req.body.mediaHeight ? parseInt(req.body.mediaHeight) : null,
      orientation: req.body.orientation || 'portrait',
      pageSet: req.body.pageSet || 'all',
      customPages: req.body.customPages || '',
      nup: parseInt(req.body.nup) || 1,
      scaling: req.body.scaling,
      noHeaderFooter: req.body.noHeaderFooter === 'true' || req.body.noHeaderFooter === true
    };

    // 如果指定了 media 名称但没有宽度高度，从 getMediaSizeMM 获取
    if (options.media && (!options.mediaWidth || !options.mediaHeight)) {
      const size = getMediaSizeMM(options.media);
      if (size) {
        options.mediaWidth = size.width;
        options.mediaHeight = size.height;
      }
    }

    // 如果没有指定纸张尺寸，检测文件尺寸并匹配标准纸张
    if (!options.media && (!options.mediaWidth || !options.mediaHeight)) {
      const dims = await getFileDimensions(filePath);
      if (dims) {
        const mediaOptions = ['A4', 'A5', 'A6', 'B5', 'Letter', 'Legal', '4x6'];
        const matched = matchToMediaSize(dims.width, dims.height, mediaOptions);
        if (matched) {
          options.media = matched;
          const size = getMediaSizeMM(matched);
          if (size) {
            options.mediaWidth = size.width;
            options.mediaHeight = size.height;
          }
        } else {
          options.media = 'A4';
          options.mediaWidth = 210;
          options.mediaHeight = 297;
        }
      }
    }

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
    const files = fs.readdirSync(UPLOAD_DIR)
      .filter(f => SUPPORTED_FILE_EXTENSIONS.includes(path.extname(f).toLowerCase()))
      .map(f => {
        const stats = fs.statSync(path.join(UPLOAD_DIR, f));
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
    const filePath = path.join(UPLOAD_DIR, filename);
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
      filePath = path.join(UPLOAD_DIR, req.body.filePath);
      if (!fs.existsSync(filePath)) {
        return res.status(400).json({ error: '历史文件不存在' });
      }
    } else {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const options = {
      copies: 1,
      media: req.body.media || undefined,
      mediaWidth: req.body.mediaWidth ? parseInt(req.body.mediaWidth) : null,
      mediaHeight: req.body.mediaHeight ? parseInt(req.body.mediaHeight) : null,
      orientation: req.body.orientation || 'portrait',
      pageSet: req.body.pageSet || 'all',
      customPages: req.body.customPages || '',
      scaling: req.body.scaling,
      nup: parseInt(req.body.nup) || 1
    };

    logger.info('Preview options', { body: req.body, options: { ...options, scaling: options.scaling, mediaWidth: options.mediaWidth, mediaHeight: options.mediaHeight } });

    // 如果指定了 media 名称但没有宽度高度，从 getMediaSizeMM 获取
    if (options.media && (!options.mediaWidth || !options.mediaHeight)) {
      logger.info('Preview: Calling getMediaSizeMM with:', options.media);
      const size = getMediaSizeMM(options.media);
      logger.info('Preview: getMediaSizeMM result:', size);
      if (size) {
        options.mediaWidth = size.width;
        options.mediaHeight = size.height;
      }
      logger.info('After getMediaSizeMM, options:', { mediaWidth: options.mediaWidth, mediaHeight: options.mediaHeight });
    }

    // 如果没有指定纸张尺寸，检测文件尺寸并匹配标准纸张
    if (!options.media && (!options.mediaWidth || !options.mediaHeight)) {
      const dims = await getFileDimensions(filePath);
      if (dims) {
        // 从前端获取 mediaOptions，这里用默认值
        const mediaOptions = ['A4', 'A5', 'A6', 'B5', 'Letter', 'Legal', '4x6'];
        const matched = matchToMediaSize(dims.width, dims.height, mediaOptions);
        if (matched) {
          options.media = matched;
          const size = getMediaSizeMM(matched);
          if (size) {
            options.mediaWidth = size.width;
            options.mediaHeight = size.height;
          }
        } else {
          // 无匹配，默认 A4
          options.media = 'A4';
          options.mediaWidth = 210;
          options.mediaHeight = 297;
        }
      }
    }

    // 处理文件方向和尺寸
    const ext = path.extname(filePath).toLowerCase();
    let previewFilePath;

    logger.info('Calling with options:', JSON.stringify(options));

    if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.tiff', '.bmp'].includes(ext)) {
      if (options.orientation === 'portrait') {
        previewFilePath = await imageToPdfPortrait(filePath, options);
      } else {
        previewFilePath = await imageToPdfLandscape(filePath, options);
      }
    } else if (ext === '.pdf') {
      // 所有缩放模式都走 scalePdf（支持 fit 和自定义缩放）
      logger.info('Calling scalePdf for PDF, scaling:', options.scaling);
      previewFilePath = await scalePdf(filePath, options);
      logger.info('scalePdf returned:', previewFilePath);
    } else {
      return res.status(400).json({ error: '不支持的文件类型' });
    }

    // 检查返回的文件是否存在
    logger.info('Preview file path:', previewFilePath);
    logger.info('File exists:', fs.existsSync(previewFilePath));
    if (fs.existsSync(previewFilePath)) {
      const stats = fs.statSync(previewFilePath);
      logger.info('File size:', stats.size);
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

// 创建文本文件
app.post('/api/files', upload.none(), async (req, res) => {
  try {
    const { name, paperSize, fontFamily, fontSize, content, customWidth, customHeight, marginTop, marginRight, marginBottom, marginLeft, gridLines, addHeader } = req.body;

    if (!name || !content) {
      return res.status(400).json({ success: false, error: '文件名和内容不能为空' });
    }

    let mediaWidth, mediaHeight;

    if (paperSize === 'Custom' && customWidth && customHeight) {
      mediaWidth = parseInt(customWidth);
      mediaHeight = parseInt(customHeight);
    } else {
      const size = getMediaSizeMM(paperSize);
      if (size) {
        mediaWidth = size.width;
        mediaHeight = size.height;
      } else {
        mediaWidth = 210;
        mediaHeight = 297;
      }
    }

    const margins = {
      top: parseInt(marginTop) || 0,
      right: parseInt(marginRight) || 0,
      bottom: parseInt(marginBottom) || 0,
      left: parseInt(marginLeft) || 0
    };

    const pdfPath = await createTextPdf(content, parseInt(fontSize) || 12, fontFamily || 'SourceHanSans', mediaWidth, mediaHeight, margins, gridLines === 'true' || gridLines === true, addHeader === 'true' || addHeader === true);

    // 文件名直接使用前端传来的名称（前端已包含时间戳格式）
    const filename = `${name}.pdf`;
    const destPath = path.join(UPLOAD_DIR, filename);

    // 检查文件是否已存在
    if (fs.existsSync(destPath)) {
      // 删除临时PDF
      fs.unlinkSync(pdfPath);
      return res.status(400).json({ success: false, error: `文件 "${filename}" 已存在，请使用其他名称` });
    }

    fs.renameSync(pdfPath, destPath);

    logger.info('创建文件成功', { filename });
    res.json({ success: true, filename });
  } catch (error) {
    console.error('创建文件失败:', error);
    res.status(500).json({ success: false, error: '创建失败: ' + error.message });
  }
});

// 获取文件尺寸
app.get('/api/file/dimensions', async (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) {
      return res.status(400).json({ error: '缺少文件路径' });
    }

    const fullPath = path.join(UPLOAD_DIR, filePath);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: '文件不存在' });
    }

    const dims = await getFileDimensions(fullPath);
    if (dims) {
      res.json({ width: Math.round(dims.width), height: Math.round(dims.height) });
    } else {
      res.status(400).json({ error: '无法获取文件尺寸' });
    }
  } catch (error) {
    logger.error('获取文件尺寸失败', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 获取上传文件的尺寸（需要 multer 处理文件上传）
app.post('/api/file/dimensions', upload.single('file'), async (req, res) => {
  try {
    console.log('POST /api/file/dimensions - req.file:', req.file);
    if (!req.file) {
      return res.status(400).json({ error: '没有上传文件' });
    }

    const { getFileDimensions } = await import('./service/cups.js');
    const dims = await getFileDimensions(req.file.path);
    console.log('File dimensions:', dims);
    if (dims) {
      res.json({ width: Math.round(dims.width), height: Math.round(dims.height) });
    } else {
      res.status(400).json({ error: '无法获取文件尺寸' });
    }
  } catch (error) {
    logger.error('获取上传文件尺寸失败', { error: error.message });
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
    const files = fs.readdirSync(UPLOAD_DIR);
    const matchedFile = files.find(f => f.endsWith(filename) || f.includes(filename));

    if (!matchedFile) {
      return res.status(404).json({ error: '文件不存在' });
    }

    const filePath = path.join(UPLOAD_DIR, matchedFile);
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
    const files = fs.readdirSync(UPLOAD_DIR).filter(f =>
      SUPPORTED_FILE_EXTENSIONS.includes(path.extname(f).toLowerCase())
    );
    files.forEach(f => {
      fs.unlinkSync(path.join(UPLOAD_DIR, f));
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
    res.json({ success: true, message: `已成功清空缓存文件` });
  } catch (error) {
    logger.error('清空缓存文件失败', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Meow Printer server started on http://0.0.0.0:${PORT}`);
});
