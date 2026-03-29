/**
 * 预览控制器
 */
import fs from 'fs';
import path from 'path';
import { UPLOAD_DIR, IMAGE_EXTENSIONS } from '../config/config.js';
import logger from '../utils/logger.js';
import { processPrintOptions, buildPrintOptions } from '../utils/common.js';
import pdfService from '../service/pdf.js';

// 预览打印效果（生成预览PDF）
export async function previewPrint(req, res) {
  try {
    let filePaths = [];

    if (req.file) {
      filePaths.push(req.file.path);
    } else if (req.body.filePath) {
      const paths = req.body.filePath.split(',');
      for (const p of paths) {
        const fullPath = path.join(UPLOAD_DIR, p.trim());
        if (!fs.existsSync(fullPath)) {
          return res.status(400).json({ error: '历史文件不存在: ' + p });
        }
        filePaths.push(fullPath);
      }
    } else {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const options = buildPrintOptions(req.body, true);

    logger.info('Preview options', { body: req.body, options });

    let previewFilePath;

    // 多文件：先合并为一个 PDF
    if (filePaths.length > 1) {
      const pdfPaths = [];
      for (const filePath of filePaths) {
        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.pdf') {
          pdfPaths.push(filePath);
        } else if (IMAGE_EXTENSIONS.includes(ext)) {
          // 图片转为 PDF
          const tempPdfPath = await (options.orientation === 'landscape'
            ? pdfService.imageToPdfLandscape(filePath, options)
            : pdfService.imageToPdfPortrait(filePath, options));
          pdfPaths.push(tempPdfPath);
        } else {
          return res.status(400).json({ error: '不支持的文件类型: ' + ext });
        }
      }
      // 合并所有 PDF
      previewFilePath = await pdfService.mergePdfs(pdfPaths);
      // 清理临时的图片 PDF
      for (const p of pdfPaths) {
        if (!filePaths.includes(p)) {
          try { fs.unlinkSync(p); } catch (e) {}
        }
      }
      filePaths = [previewFilePath];
    }

    // 单文件处理（合并后也是单文件）
    const filePath = filePaths[0];
    const processedOptions = await processPrintOptions(options, pdfService.getFileDimensions.bind(pdfService), filePath);

    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.pdf') {
      previewFilePath = await pdfService.scalePdf(filePath, processedOptions);
    } else if (IMAGE_EXTENSIONS.includes(ext)) {
      const tempPdfPath = await (processedOptions.orientation === 'landscape'
        ? pdfService.imageToPdfLandscape(filePath, processedOptions)
        : pdfService.imageToPdfPortrait(filePath, processedOptions));

      if (processedOptions.nup > 1 || (processedOptions.pageSet && processedOptions.pageSet !== 'all')) {
        previewFilePath = await pdfService.scalePdf(tempPdfPath, processedOptions);
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
