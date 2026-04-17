/**
 * 打印机控制器
 */
import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import { UPLOAD_DIR, IMAGE_EXTENSIONS, CUPS_USER, CUPS_PWD } from '../config/config.js';
import cupsService from '../service/cups.js';
import pdfService from '../service/pdf.js';
import logger from '../utils/logger.js';
import { processPrintOptions, buildPrintOptions } from '../utils/common.js';

// 获取打印机列表
export async function getPrinters(req, res) {
  try {
    const printers = await cupsService.getPrinters();
    logger.info('获取打印机列表', { count: printers.length, requestId: req.requestId });
    res.json({ printers });
  } catch (error) {
    logger.error('获取打印机列表失败', { error: error.message, requestId: req.requestId });
    res.status(500).json({ error: error.message });
  }
}

// 重启 CUPS 服务
export async function restartCups(req, res) {
  try {
    logger.info('收到重启 CUPS 请求', { requestId: req.requestId });

    const result = await cupsService.restartCups();

    if (result.success) {
      res.json({ success: true, message: result.message });
    } else {
      // 检测认证失败
      if (result.message.includes('Unauthorized') || result.message.includes('HTML')) {
        res.status(500).json({ success: false, error: 'CUPS 认证失败，请检查配置中的 CUPS_USER 和 CUPS_PWD' });
      } else {
        res.status(500).json({ success: false, error: result.message });
      }
    }
  } catch (error) {
    logger.error('重启 CUPS 失败', { error: error.message, requestId: req.requestId });
    res.status(500).json({ success: false, error: error.message });
  }
}

// 获取打印机支持的纸张尺寸
export async function getPrinterCapabilities(req, res) {
  try {
    const printer = req.query.printer;
    if (!printer) {
      return res.status(400).json({ error: '缺少打印机参数' });
    }
    const mediaOptions = await cupsService.getPrinterCapabilities(printer);
    logger.info('获取打印机纸张尺寸', { printer, mediaOptions, requestId: req.requestId });
    res.json({ mediaOptions });
  } catch (error) {
    logger.error('获取打印机纸张尺寸失败', { error: error.message, requestId: req.requestId });
    res.status(500).json({ error: error.message });
  }
}

// 获取打印任务列表
export async function getJobs(req, res) {
  try {
    const printer = req.query.printer;
    const jobs = await cupsService.getJobs(printer);
    logger.info('获取打印任务列表', { printer: printer || 'all', count: jobs.length });
    res.json({ jobs });
  } catch (error) {
    logger.error('获取打印任务列表失败', { error: error.message });
    res.status(500).json({ error: error.message });
  }
}

// 取消打印任务
export async function cancelJob(req, res) {
  try {
    const result = await cupsService.cancelJob(req.params.id);
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
}

// 提交打印任务
export async function printFile(req, res) {
  try {
    let filePaths = [];
    let originalName;

    // 判断是新上传文件还是历史文件
    if (req.file) {
      filePaths.push(req.file.path);
      originalName = req.file.originalname;
    } else if (req.body.filePath) {
      const paths = req.body.filePath.split(',');
      for (const p of paths) {
        const fullPath = path.join(UPLOAD_DIR, p.trim());
        if (!fs.existsSync(fullPath)) {
          logger.warn('打印请求失败：历史文件不存在', { requestId: req.requestId, filePath: fullPath });
          return res.status(400).json({ success: false, error: '历史文件不存在' });
        }
        filePaths.push(fullPath);
      }
      originalName = req.body.originalName || req.body.filePath;
    } else {
      logger.warn('打印请求失败：未上传文件', { requestId: req.requestId });
      return res.status(400).json({ success: false, error: '没有上传文件' });
    }

    const printer = req.body.printer || 'default';
    const options = buildPrintOptions(req.body);

    // 生成打印 PDF
    const filePath = await generatePrintPdf(filePaths, options);

    logger.info('收到打印请求', {
      requestId: req.requestId,
      file: originalName,
      printer,
      options
    });
    
    // 生成打印的pdf时已经将页面设计好了
    const printerOptions = { 
      copies: options.copies,
      scaling: 'fit'
    }

    const result = await cupsService.printFile(filePath, printer, printerOptions);

    logger.info('发送打印请求', {
      requestId: req.requestId,
      file: originalName,
      printer,
      printerOptions
    });

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
}

/**
 * 生成打印/预览用的 PDF
 * @param {string[]} filePaths - 文件路径数组
 * @param {Object} options - 打印选项
 * @returns {Promise<string>} 生成的 PDF 文件路径
 */
export async function generatePrintPdf(filePaths, options) {
  let filePath;

  // 多文件：先合并为一个 PDF
  if (filePaths.length > 1) {
    const pdfPaths = [];
    for (const fp of filePaths) {
      const ext = path.extname(fp).toLowerCase();
      if (ext === '.pdf') {
        pdfPaths.push(fp);
      } else if (IMAGE_EXTENSIONS.includes(ext)) {
        const tempPdfPath = await (options.orientation === 'landscape'
          ? pdfService.imageToPdfLandscape(fp, options)
          : pdfService.imageToPdfPortrait(fp, options));
        pdfPaths.push(tempPdfPath);
      }
    }
    // 合并所有 PDF
    filePath = await pdfService.mergePdfs(pdfPaths);
    // 清理临时的图片 PDF
    for (const p of pdfPaths) {
      if (!filePaths.includes(p)) {
        try { fs.unlinkSync(p); } catch (e) {}
      }
    }
    filePaths = [filePath];
  }

  // 单文件处理
  filePath = filePaths[0];
  const processedOptions = await processPrintOptions(options, pdfService.getFileDimensions.bind(pdfService), filePath);

  // 获取原始 PDF 总页数（在处理之前）
  let originalTotalPages = 0;
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') {
    const srcPdf = await PDFDocument.load(fs.readFileSync(filePath));
    originalTotalPages = srcPdf.getPages().length;
  } else if (IMAGE_EXTENSIONS.includes(ext)) {
    // 图片转 PDF 后的页数就是 1
    originalTotalPages = 1;
  }

  if (ext === '.pdf') {
    filePath = await pdfService.scalePdf(filePath, processedOptions);
  } else if (IMAGE_EXTENSIONS.includes(ext)) {
    const tempPdfPath = await (processedOptions.orientation === 'landscape'
      ? pdfService.imageToPdfLandscape(filePath, processedOptions)
      : pdfService.imageToPdfPortrait(filePath, processedOptions));

    if (processedOptions.nup > 1 || (processedOptions.pageSet && processedOptions.pageSet !== 'all')) {
      filePath = await pdfService.scalePdf(tempPdfPath, processedOptions);
      try { fs.unlinkSync(tempPdfPath); } catch (e) {}
    } else {
      filePath = tempPdfPath;
    }
  }

  // 添加页码
  if (options.addPageNumber) {
    const pdfBytes = fs.readFileSync(filePath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const totalOutputPages = pdfDoc.getPages().length;

    // n-up 模式下 totalSrcPages 应该是原始总页数，用于显示 "第 X-Y 页 / 共 Z 页"
    const numberedPath = await pdfService.addPageNumbers(filePath, {
      nup: options.nup || 1,
      totalSrcPages: originalTotalPages,
      totalOutputPages: totalOutputPages
    });
    // try { fs.unlinkSync(filePath); } catch (e) {}
    filePath = numberedPath;
  }

  return filePath;
}

// 预览打印效果（生成预览PDF）
export async function previewPrint(req, res) {
  let filePaths = [];
  let previewFilePath;

  try {
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

    // 复用 generatePrintPdf 生成预览 PDF
    previewFilePath = await generatePrintPdf(filePaths, options);

    // 返回预览文件
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');

    // 检查文件是否存在
    if (!previewFilePath || !fs.existsSync(previewFilePath)) {
      logger.error('预览文件不存在', { path: previewFilePath });
      return res.status(500).json({ error: '预览文件生成失败' });
    }

    const stats = fs.statSync(previewFilePath);
    if (stats.size === 0) {
      logger.error('预览文件为空', { path: previewFilePath });
      return res.status(500).json({ error: '预览文件生成失败' });
    }

    // 响应完成后清理临时预览文件
    res.on('finish', () => {
      if (previewFilePath) {
        try {
          fs.unlinkSync(previewFilePath);
        } catch (e) {
          logger.warn('清理预览临时文件失败', { path: previewFilePath });
        }
      }
    });

    const readStream = fs.createReadStream(previewFilePath);
    readStream.on('error', (err) => {
      logger.error('读取预览文件失败', { error: err.message, path: previewFilePath });
      if (!res.headersSent) {
        res.status(500).json({ error: '预览文件读取失败' });
      }
    });
    readStream.pipe(res);
  } catch (error) {
    logger.error('预览生成失败', { error: error.message, stack: error.stack });
    // 清理可能生成的临时文件
    if (previewFilePath) {
      try { fs.unlinkSync(previewFilePath); } catch (e) {}
    }
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
}
