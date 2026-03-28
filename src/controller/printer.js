/**
 * 打印机控制器
 */
import fs from 'fs';
import path from 'path';
import { UPLOAD_DIR } from '../config/config.js';
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
    let filePath, originalName;

    // 判断是新上传文件还是历史文件
    if (req.file) {
      filePath = req.file.path;
      originalName = req.file.originalname;
    } else if (req.body.filePath) {
      filePath = path.join(UPLOAD_DIR, req.body.filePath);
      originalName = req.body.originalName || req.body.filePath;
      if (!fs.existsSync(filePath)) {
        logger.warn('打印请求失败：历史文件不存在', { requestId: req.requestId, filePath });
        return res.status(400).json({ success: false, error: '历史文件不存在' });
      }
    } else {
      logger.warn('打印请求失败：未上传文件', { requestId: req.requestId });
      return res.status(400).json({ success: false, error: '没有上传文件' });
    }

    const printer = req.body.printer || 'default';
    const options = buildPrintOptions(req.body);

    // 处理纸张尺寸
    await processPrintOptions(options, pdfService.getFileDimensions.bind(pdfService), filePath);

    logger.info('收到打印请求', {
      requestId: req.requestId,
      file: originalName,
      printer,
      options
    });

    const result = await cupsService.printFile(filePath, printer, options);

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
