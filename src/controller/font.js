/**
 * 字体控制器
 */
import logger from '../utils/logger.js';
import pdfService from '../service/pdf.js';

// 获取可用字体列表
export async function getFonts(req, res) {
  try {
    const fonts = pdfService.getAvailableFonts();
    res.json({ fonts });
  } catch (error) {
    logger.error('获取字体列表失败', { error: error.message });
    res.status(500).json({ error: error.message });
  }
}

// 添加字体文件并自动注册
export async function addFont(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: '没有上传字体文件' });
    }

    const { fontId, fontName } = req.body;
    if (!fontId || !fontName) {
      return res.status(400).json({ success: false, error: '缺少 fontId 或 fontName 参数' });
    }

    const result = pdfService.addFontFile(fontId, fontName, req.file.buffer, req.file.originalname);
    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    logger.error('添加字体失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
}

// 注册已存在的字体文件
export async function registerFont(req, res) {
  try {
    const { fontId, fontName, filename } = req.body;
    if (!fontId || !fontName || !filename) {
      return res.status(400).json({ success: false, error: '缺少必要参数' });
    }

    const result = pdfService.registerFont(fontId, fontName, filename);
    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    logger.error('注册字体失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
}
