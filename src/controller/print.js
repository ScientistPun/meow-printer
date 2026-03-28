/**
 * 打印控制器
 */
import fs from 'fs';
import path from 'path';
import { UPLOAD_DIR } from '../config/config.js';
import logger from '../utils/logger.js';
import { processPrintOptions, buildPrintOptions, sendError } from '../utils/common.js';

let cupsService;

/**
 * 初始化控制器（注入依赖）
 */
export function initPrintController(cupsInstance) {
  cupsService = cupsInstance;
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
    await processPrintOptions(options, cupsService.getFileDimensions.bind(cupsService), filePath);

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
