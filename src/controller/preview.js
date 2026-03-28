/**
 * 预览控制器
 */
import fs from 'fs';
import path from 'path';
import { UPLOAD_DIR } from '../config/config.js';
import logger from '../utils/logger.js';
import { processPrintOptions, buildPrintOptions } from '../utils/common.js';
import pdfService from '../service/pdf.js';

// 预览打印效果（生成预览PDF）
export async function previewPrint(req, res) {
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

    const options = buildPrintOptions(req.body, true);

    logger.info('Preview options', { body: req.body, options });

    // 处理纸张尺寸
    await processPrintOptions(options, pdfService.getFileDimensions.bind(pdfService), filePath);

    // 处理文件方向和尺寸
    const ext = path.extname(filePath).toLowerCase();
    let previewFilePath;

    // PDF 文件：使用 scalePdf 处理
    if (ext === '.pdf') {
      previewFilePath = await pdfService.scalePdf(filePath, options);
    } else if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.tiff', '.bmp'].includes(ext)) {
      // 图片：图片独立处理缩放，仅 n-up/pageSet 需要额外处理
      const tempPdfPath = await (options.orientation === 'landscape'
        ? pdfService.imageToPdfLandscape(filePath, options)
        : pdfService.imageToPdfPortrait(filePath, options));

      if (options.nup > 1 || (options.pageSet && options.pageSet !== 'all')) {
        previewFilePath = await pdfService.scalePdf(tempPdfPath, options);
        try { fs.unlinkSync(tempPdfPath); } catch (e) {}
      } else {
        previewFilePath = tempPdfPath;
      }
    } else {
      return res.status(400).json({ error: '不支持的文件类型' });
    }

    // 返回预览文件
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');

    // 响应完成后清理临时预览文件
    res.on('finish', () => {
      if (previewFilePath && previewFilePath !== filePath) {
        try {
          fs.unlinkSync(previewFilePath);
        } catch (e) {
          logger.warn('清理预览临时文件失败', { path: previewFilePath });
        }
      }
    });

    fs.createReadStream(previewFilePath).pipe(res);
  } catch (error) {
    logger.error('预览生成失败', { error: error.message });
    res.status(500).json({ error: error.message });
  }
}
