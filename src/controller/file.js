/**
 * 文件控制器
 */
import fs from 'fs';
import path from 'path';
import { UPLOAD_DIR, CACHE_DIR, SUPPORTED_FILE_EXTENSIONS } from '../config/config.js';
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
    const pdfFiles = allFiles.filter(f => f.endsWith('.pdf'));
    await Promise.all(pdfFiles.map(f => fs.promises.unlink(path.join(CACHE_DIR, f))));
    logger.info('清空缓存文件', { count: pdfFiles.length });
    res.json({ success: true, message: `已成功清空缓存文件` });
  } catch (error) {
    logger.error('清空缓存文件失败', { error: error.message });
    res.status(500).json({ error: error.message });
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
