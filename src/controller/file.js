/**
 * 文件控制器
 */
import fs from 'fs';
import path from 'path';
import { UPLOAD_DIR, CACHE_DIR, SETTINGS_FILE, SUPPORTED_FILE_EXTENSIONS } from '../config/config.js';
import { CONTENT_TYPES, getMediaSizeMM } from '../utils/common.js';
import logger from '../utils/logger.js';
import pdfService from '../service/pdf.js';

// 上传文件（仅保存，不处理）
export async function uploadFile(req, res) {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: '没有上传文件' });
    }
    const files = req.files.map(f => ({
      filename: f.filename,
      // 修复文件名编码：如果是 Latin-1 编码的乱码，转换回 UTF-8
      originalName: fixFilenameEncoding(f.originalname)
    }));
    res.json({
      success: true,
      files
    });
  } catch (error) {
    logger.error('上传文件失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * 修复文件名编码
 * 浏览器可能使用 Latin-1 发送中文文件名，需要转换回正确的 UTF-8
 */
function fixFilenameEncoding(filename) {
  // 如果包含非 ASCII 字符
  if (/[^\x00-\x7F]/.test(filename)) {
    // 检查是否已经是有效的中文 UTF-8（不需要转换）
    if (/[\u4E00-\u9FFF]/.test(filename)) {
      return filename; // 已经是有效的 UTF-8 中文
    }
    // 否则尝试从 Latin-1 转换
    try {
      const converted = Buffer.from(filename, 'latin1').toString('utf8');
      // 只有转换后产生有效中文才使用转换结果
      if (/[\u4E00-\u9FFF]/.test(converted)) {
        return converted;
      }
    } catch (e) {
      // 转换失败，返回原值
    }
  }
  return filename;
}

// 获取上传文件列表（历史文件）
export async function getHistory(req, res) {
  try {
    const allFiles = await fs.promises.readdir(UPLOAD_DIR);
    const supportedFiles = allFiles.filter(f =>
      SUPPORTED_FILE_EXTENSIONS.includes(path.extname(f).toLowerCase())
    );

    const files = await Promise.all(
      supportedFiles.map(async (f) => {
        const stats = await fs.promises.stat(path.join(UPLOAD_DIR, f));
        // 提取原始文件名（去掉时间戳前缀）
        const originalName = f.replace(/^\d+-/, '');
        return {
          name: f,
          // 修复文件名编码
          originalName: fixFilenameEncoding(originalName),
          size: stats.size,
          modified: stats.mtime.toISOString()
        };
      })
    );

    files.sort((a, b) => new Date(b.modified) - new Date(a.modified));
    res.json({ files });
  } catch (error) {
    logger.error('获取历史文件失败', { error: error.message });
    res.status(500).json({ error: error.message });
  }
}

// 删除历史文件
export async function deleteHistoryFile(req, res) {
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
    res.status(500).json({ success: false, error: error.message });
  }
}

// 清空所有历史文件
export async function clearHistory(req, res) {
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
}

// 获取文件尺寸（通过路径）
export async function getFileDimensions(req, res) {
  try {
    const filePath = req.query.path;
    if (!filePath) {
      return res.status(400).json({ error: '缺少文件路径' });
    }

    const fullPath = path.join(UPLOAD_DIR, filePath);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: '文件不存在' });
    }

    const dims = await pdfService.getFileDimensions(fullPath);
    if (dims) {
      res.json({ width: Math.round(dims.width), height: Math.round(dims.height) });
    } else {
      res.status(400).json({ error: '无法获取文件尺寸' });
    }
  } catch (error) {
    logger.error('获取文件尺寸失败', { error: error.message });
    res.status(500).json({ error: error.message });
  }
}

// 获取上传文件的尺寸
export async function getUploadedFileDimensions(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '没有上传文件' });
    }

    const dims = await pdfService.getFileDimensions(req.file.path);

    // 上传后自动删除临时文件
    try {
      fs.unlinkSync(req.file.path);
    } catch (e) {
      logger.warn('删除临时文件失败', { path: req.file.path, error: e.message });
    }

    if (dims) {
      res.json({ width: Math.round(dims.width), height: Math.round(dims.height) });
    } else {
      res.status(400).json({ error: '无法获取文件尺寸' });
    }
  } catch (error) {
    logger.error('获取上传文件尺寸失败', { error: error.message });
    res.status(500).json({ error: error.message });
  }
}

// 获取历史文件预览
export async function previewFile(req, res) {
  try {
    const filename = req.query.filename;
    if (!filename) {
      return res.status(400).json({ error: '缺少文件名参数' });
    }

    const files = fs.readdirSync(UPLOAD_DIR);
    const matchedFile = files.find(f => f.endsWith(filename) || f.includes(filename));

    if (!matchedFile) {
      return res.status(404).json({ error: '文件不存在' });
    }

    const filePath = path.join(UPLOAD_DIR, matchedFile);
    const ext = path.extname(matchedFile).toLowerCase();

    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', 'inline');
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    logger.error('预览文件失败', { error: error.message });
    res.status(500).json({ error: error.message });
  }
}

// 清空缓存文件
export async function clearCache(req, res) {
  try {
    const allFiles = await fs.promises.readdir(CACHE_DIR);
    await Promise.all(allFiles.map(f => fs.promises.unlink(path.join(CACHE_DIR, f))));
    logger.info('清空缓存文件', { count: allFiles.length });
    res.json({ success: true, message: `已成功清空缓存文件` });
  } catch (error) {
    logger.error('清空缓存文件失败', { error: error.message });
    res.status(500).json({ error: error.message });
  }
}

/**
 * 长图拼接：缩放→拼接→分页切割→生成 PDF
 *
 * @param {Object} req - Express 请求对象
 * @param {Object} req.body - 请求体参数
 * @param {string[]} req.body.files - 要拼接的图片文件名数组（按顺序拼接）
 * @param {string} req.body.paperSize - 纸张尺寸，如 'A4', 'A5', 'A6', 'B5', 'Letter', 'Legal'
 * @param {number} [req.body.marginTop] - 上边距（mm），不传则使用默认值 20
 * @param {number} [req.body.marginRight] - 右边距（mm），不传则使用默认值 20
 * @param {number} [req.body.marginBottom] - 下边距（mm），不传则使用默认值 20
 * @param {number} [req.body.marginLeft] - 左边距（mm），不传则使用默认值 20
 *
 * @param {Object} res - Express 响应对象
 *
 * @returns {Object} JSON 响应
 * @returns {boolean} success - 是否成功
 * @returns {string} filename - 生成的 PDF 文件名
 * @returns {string} originalName - 原始文件名
 * @returns {number} pages - 生成的页数
 *
 * 处理流程（由 pdfService 提供）：
 * 1. 缩放每张图片宽度 = 纸张宽度 - 左右边距（等比缩放）
 * 2. 垂直拼接所有图片（无白边）
 * 3. 保存长图到 cache 目录
 * 4. 按固定高度切割（切割高度 = 纸张长度 - 上下边距）
 * 5. 每页添加白边（左上角对齐），生成 PDF
 */
export async function stitchImages(req, res) {
  try {
    const { files, paperSize } = req.body;
    if (!paperSize) {
      return res.status(400).json({ success: false, error: '缺少纸张尺寸参数' });
    }

    if (!files || !Array.isArray(files) || files.length < 2) {
      return res.status(400).json({ success: false, error: '至少需要选择2张图片' });
    }

    let defaultSettings = {};
    try {
      const settingsData = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      defaultSettings = JSON.parse(settingsData);
    } catch (e) {
      // 忽略读取失败
    }

    const marginTop = req.body.marginTop !== undefined ? req.body.marginTop : (defaultSettings.marginTop || 20);
    const marginRight = req.body.marginRight !== undefined ? req.body.marginRight : (defaultSettings.marginRight || 20);
    const marginBottom = req.body.marginBottom !== undefined ? req.body.marginBottom : (defaultSettings.marginBottom || 20);
    const marginLeft = req.body.marginLeft !== undefined ? req.body.marginLeft : (defaultSettings.marginLeft || 20);

    const fullPaths = files.map(f => path.join(UPLOAD_DIR, f));
    for (let i = 0; i < fullPaths.length; i++) {
      if (!fs.existsSync(fullPaths[i])) {
        return res.status(400).json({ success: false, error: `文件不存在: ${files[i]}` });
      }
    }

    const paperSizeMm = getMediaSizeMM(paperSize);
    if (!paperSizeMm) {
      return res.status(400).json({ success: false, error: '不支持的纸张尺寸' });
    }

    logger.info('长图拼接开始', {
      fileCount: files.length,
      paperSize,
      margins: { top: marginTop, right: marginRight, bottom: marginBottom, left: marginLeft }
    });

    const { pdfPath, pageCount } = await pdfService.stitchImagesToPdf(
      fullPaths,
      paperSizeMm.width,
      paperSizeMm.height,
      marginTop,
      marginRight,
      marginBottom,
      marginLeft
    );

    // 使用传入的文件名
    let outputFilename = (req.body.fileName || `长图_${Date.now()}`) + '.pdf';
    outputFilename = outputFilename.replace(/[\\/:*?"<>|]/g, '_'); // 移除非法的文件系统字符
    const outputPath = path.join(UPLOAD_DIR, outputFilename);
    fs.renameSync(pdfPath, outputPath);

    logger.info('长图拼接 PDF 生成成功', {
      inputCount: files.length,
      outputPages: pageCount,
      output: outputFilename
    });

    res.json({
      success: true,
      filename: outputFilename,
      originalName: outputFilename,
      pages: pageCount
    });
  } catch (error) {
    logger.error('长图拼接失败', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: '拼接失败: ' + error.message });
  }
}

// 创建文本文件
export async function createTextFile(req, res) {
  try {
    let { name, paperSize, fontFamily, fontSize, content, customWidth, customHeight, marginTop, marginRight, marginBottom, marginLeft, gridLines, addHeader } = req.body;

    // express.json() 已经正确解析 UTF-8，如果 name 已经是有效的中文，不需要转换
    // 只有当 name 看起来像 Latin-1 编码被错误解读为 UTF-8 时才需要转换
    if (/[^\x00-\x7F]/.test(name)) {
      // 检查是否包含有效的中文字符（正确的 UTF-8）
      const hasValidChinese = /[\u4E00-\u9FFF]/.test(name);
      if (!hasValidChinese) {
        // 没有有效中文，可能是 Latin-1 误读为 UTF-8，尝试转换
        const latin1Converted = Buffer.from(name, 'latin1').toString('utf8');
        if (/[\u4E00-\u9FFF]/.test(latin1Converted)) {
          name = latin1Converted;
        }
      }
    }

    if (!name || !content) {
      return res.status(400).json({ success: false, error: '文件名和内容不能为空' });
    }

    // 移除非法的文件系统字符
    name = name.replace(/[\/\\:*?"<>|]/g, '_');

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

    const pdfPath = await pdfService.createTextPdf(
      content,
      parseInt(fontSize) || 12,
      fontFamily || 'SourceHanSans',
      mediaWidth,
      mediaHeight,
      margins,
      gridLines === 'true' || gridLines === true,
      addHeader === 'true' || addHeader === true
    );

    const filename = `${name}.pdf`;
    const destPath = path.join(UPLOAD_DIR, filename);

    // 如果目标文件已存在，先删除旧文件
    if (fs.existsSync(destPath)) {
      try {
        fs.unlinkSync(destPath);
      } catch (e) {
        // 忽略删除失败（文件可能被其他进程占用）
      }
    }

    fs.renameSync(pdfPath, destPath);

    logger.info('创建文件成功', { filename });
    res.json({ success: true, filename });
  } catch (error) {
    logger.error('创建文件失败:', error);
    res.status(500).json({ success: false, error: '创建失败: ' + error.message });
  }
}
