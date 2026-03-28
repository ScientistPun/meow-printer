/**
 * 文件控制器
 */
import fs from 'fs';
import path from 'path';
import { UPLOAD_DIR, CACHE_DIR, SUPPORTED_FILE_EXTENSIONS } from '../config/config.js';
import { CONTENT_TYPES } from '../utils/common.js';
import logger from '../utils/logger.js';

let cupsService;

/**
 * 初始化控制器（注入依赖）
 */
export function initFileController(cupsInstance) {
  cupsService = cupsInstance;
}

// 上传文件（仅保存，不处理）
export async function uploadFile(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: '没有上传文件' });
    }
    res.json({
      success: true,
      filename: req.file.filename,
      originalName: req.file.originalname
    });
  } catch (error) {
    logger.error('上传文件失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
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
        return {
          name: f,
          originalName: f.replace(/^\d+-/, ''),
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
    res.status(500).json({ error: error.message });
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

    const dims = await cupsService.getFileDimensions(fullPath);
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

    const dims = await cupsService.getFileDimensions(req.file.path);

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
