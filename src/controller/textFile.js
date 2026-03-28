/**
 * 文本文件控制器
 */
import fs from 'fs';
import path from 'path';
import { UPLOAD_DIR } from '../config/config.js';
import logger from '../utils/logger.js';
import { getMediaSizeMM } from '../utils/common.js';

let cupsService;

/**
 * 初始化控制器（注入依赖）
 */
export function initTextFileController(cupsInstance) {
  cupsService = cupsInstance;
}

// 创建文本文件
export async function createTextFile(req, res) {
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

    const pdfPath = await cupsService.createTextPdf(
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
    console.error('创建文件失败:', error);
    res.status(500).json({ success: false, error: '创建失败: ' + error.message });
  }
}
