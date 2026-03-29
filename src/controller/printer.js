/**
 * 打印机控制器
 */
import fs from 'fs';
import path from 'path';
import { UPLOAD_DIR, IMAGE_EXTENSIONS } from '../config/config.js';
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

    const ext = path.extname(filePath).toLowerCase();

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

    logger.info('收到打印请求', {
      requestId: req.requestId,
      file: originalName,
      printer,
      options
    });

    const result = await cupsService.printFile(filePath, printer, options);

    // 清理合并后的临时文件
    if (filePath) {
      try { fs.unlinkSync(filePath); } catch (e) {}
    }

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
