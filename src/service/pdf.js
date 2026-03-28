/**
 * PDF 处理模块
 * 包含所有与 PDF 文件操作相关的功能
 */
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as fontkit from 'fontkit';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { CACHE_DIR, FONTS_DIR, FONTS_MAP } from '../config/config.js';
import logger from '../utils/logger.js';
import { PRINT_ORIENTATION, PRINT_SCALING, PRINT_PAGE_SET } from '../config/global.js';

/**
 * PDF 服务类
 * 封装所有 PDF 处理、图片转换、字体管理功能
 */
export class Pdf {
  constructor() {
    /** PDF 文件名计数器，确保并发生成时文件名唯一 */
    this.pdfCounter = 0;

    // 确保缓存目录存在
    this._ensureCacheDir();

    // 启动时自动扫描字体目录
    this._autoLoadFonts();
  }

  // ==================== 私有方法 ====================

  /** 确保缓存目录存在 */
  _ensureCacheDir() {
    try {
      if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
      }
    } catch (e) {}
  }

  /**
   * 自动扫描字体目录并注册字体
   * - 如果字体已在 FONTS_MAP 中登记，使用登记的名称
   * - 否则使用文件名作为显示名称
   */
  _autoLoadFonts() {
    try {
      if (!fs.existsSync(FONTS_DIR)) {
        fs.mkdirSync(FONTS_DIR, { recursive: true });
        return;
      }

      const files = fs.readdirSync(FONTS_DIR);
      const fontExtensions = ['.ttf', '.otf', '.ttc'];
      // 已注册的字体文件（用于去重）
      const registeredFiles = new Set(Object.values(FONTS_MAP).map(f => f.file));

      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (!fontExtensions.includes(ext)) continue;

        // 跳过已注册的字体文件
        if (registeredFiles.has(file)) continue;

        // 从文件名生成字体 ID（去掉扩展名）
        const fontId = path.basename(file, ext);
        // 使用 FONTS_MAP 中的名称，否则使用文件名
        const fontName = FONTS_MAP[fontId]?.name || fontId;

        // 注册新字体
        FONTS_MAP[fontId] = { file, name: fontName };
        logger.info('自动加载字体', { fontId, name: fontName, file });
      }
    } catch (e) {
      logger.error('自动加载字体失败', { error: e.message });
    }
  }

  /**
   * 毫米转点数 (1 inch = 72 points, 1 inch = 25.4mm)
   * @param {number} mm - 毫米值
   * @returns {number} 点数
   */
  _mmToPoints(mm) {
    return mm * 72 / 25.4;
  }

  /**
   * 点转毫米
   * @param {number} points - 点数
   * @returns {number} 毫米值
   */
  _pointsToMm(points) {
    return points * 25.4 / 72;
  }

  /**
   * 生成唯一的 PDF 文件名
   * @returns {string} 文件名，格式：时间戳_序号.pdf
   */
  _generatePdfFilename() {
    return `${Date.now()}_${++this.pdfCounter}.pdf`;
  }

  /**
   * 加载自定义字体
   * @param {PDFDocument} pdfDoc - PDF 文档实例
   * @param {string} fontName - 字体名称（FONTS_MAP 中的键）
   * @returns {Promise<PDFDocument's font|null>} 加载的字体，失败返回 null
   */
  async _loadFont(pdfDoc, fontName) {
    const fontEntry = FONTS_MAP[fontName];
    if (!fontEntry) {
      logger.log('loadFont: 未找到字体配置:', fontName);
      return null;
    }

    const fontPath = path.join(FONTS_DIR, fontEntry.file);
    if (!fs.existsSync(fontPath)) {
      logger.log('loadFont: 字体文件不存在:', fontPath);
      return null;
    }

    try {
      const fontBytes = fs.readFileSync(fontPath);
      logger.log('loadFont: 字体文件大小:', fontBytes.length, fontName);
      pdfDoc.registerFontkit(fontkit);
      const font = await pdfDoc.embedFont(fontBytes);
      logger.log('loadFont: 字体加载成功:', fontName, 'hasLayout:', typeof font.layout);
      return font;
    } catch (e) {
      logger.log('loadFont: 字体加载失败:', fontName, e.message);
      return null;
    }
  }

  // ==================== 文件尺寸相关 ====================

  /**
   * 获取图片文件的物理尺寸（毫米）
   * 使用图片的 DPI 信息计算实际打印尺寸
   * @param {string} imagePath - 图片文件路径
   * @returns {Promise<{width: number, height: number}|null>} 宽度和高度（毫米），失败返回 null
   */
  async getImageDimensions(imagePath) {
    const metadata = await sharp(imagePath).metadata();
    // 如果 DPI 为 0 或不存在，假设为 72 DPI
    const dpi = metadata.density || 72;
    const widthMm = (metadata.width / dpi) * 25.4;
    const heightMm = (metadata.height / dpi) * 25.4;
    return { width: widthMm, height: heightMm };
  }

  /**
   * 获取文件的打印尺寸（毫米）
   * 支持图片格式（JPG, PNG, GIF, WebP, TIFF, BMP）和 PDF
   * @param {string} filePath - 文件路径
   * @returns {Promise<{width: number, height: number}|null>} 宽度和高度（毫米）
   */
  async getFileDimensions(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.tiff', '.bmp'].includes(ext)) {
      return await this.getImageDimensions(filePath);
    } else if (ext === '.pdf') {
      const pdfBytes = fs.readFileSync(filePath);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const page = pdfDoc.getPages()[0];
      if (page) {
        const { width, height } = page.getSize();
        return { width: this._pointsToMm(width), height: this._pointsToMm(height) };
      }
    }
    return null;
  }

  // ==================== 字体相关 ====================

  /**
   * 获取可用的字体列表
   * @returns {Array<{id: string, name: string, file: string}>} 字体列表
   */
  getAvailableFonts() {
    return Object.keys(FONTS_MAP).map(id => ({
      id,
      name: FONTS_MAP[id].name,
      file: FONTS_MAP[id].file
    })).filter(font => {
      const fontPath = path.join(FONTS_DIR, font.file);
      return fs.existsSync(fontPath);
    });
  }

  /**
   * 注册已存在的字体文件
   * @param {string} fontId - 字体唯一标识符
   * @param {string} fontName - 字体显示名称
   * @param {string} filename - 字体文件名
   * @returns {{success: boolean, message: string}}
   */
  registerFont(fontId, fontName, filename) {
    const fontPath = path.join(FONTS_DIR, filename);
    if (!fs.existsSync(fontPath)) {
      return { success: false, message: `字体文件不存在: ${filename}` };
    }
    if (FONTS_MAP[fontId]) {
      return { success: false, message: `字体 ID 已存在: ${fontId}` };
    }
    FONTS_MAP[fontId] = { file: filename, name: fontName };
    return { success: true, message: `字体 "${fontName}" 注册成功` };
  }

  /**
   * 添加字体文件并注册
   * @param {string} fontId - 字体唯一标识符
   * @param {string} fontName - 字体显示名称
   * @param {Buffer} fileBuffer - 字体文件内容
   * @param {string} originalName - 原始文件名
   * @returns {{success: boolean, message: string, filename?: string}}
   */
  addFontFile(fontId, fontName, fileBuffer, originalName) {
    const ext = path.extname(originalName).toLowerCase();
    if (!['.ttf', '.otf', '.ttc'].includes(ext)) {
      return { success: false, message: '不支持的字体格式，仅支持 .ttf, .otf, .ttc' };
    }
    const filename = `${fontId}${ext}`;
    const fontPath = path.join(FONTS_DIR, filename);
    if (fs.existsSync(fontPath)) {
      return { success: false, message: `字体文件已存在: ${filename}` };
    }
    try {
      fs.writeFileSync(fontPath, fileBuffer);
    } catch (e) {
      return { success: false, message: `写入字体文件失败: ${e.message}` };
    }
    FONTS_MAP[fontId] = { file: filename, name: fontName };
    return { success: true, message: `字体 "${fontName}" 添加成功`, filename };
  }

  // ==================== 图片转 PDF ====================

  /**
   * 将图片转换为 PDF
   * @param {string} imagePath - 图片文件路径
   * @param {Object} options - 选项
   * @param {number} options.mediaWidth - 目标纸张宽度（毫米）
   * @param {number} options.mediaHeight - 目标纸张高度（毫米）
   * @param {string|number} options.scaling - 缩放模式：'fit' 自适应，或数值百分比
   * @param {boolean} isLandscape - 是否为横排模式
   * @returns {Promise<string>} 生成 PDF 的路径
   */
  async _imageToPdf(imagePath, options, isLandscape) {
    // 横排模式：交换纸张宽高
    const targetWidth = isLandscape ? options.mediaHeight : options.mediaWidth;
    const targetHeight = isLandscape ? options.mediaWidth : options.mediaHeight;

    logger.log(`=== _imageToPdf (${isLandscape ? PRINT_ORIENTATION.LANDSCAPE : PRINT_ORIENTATION.PORTRAIT}) ===`);

    // 读取图片元数据
    const image = sharp(imagePath);
    const metadata = await image.metadata();
    const imageWidth = metadata.width;
    const imageHeight = metadata.height;

    // 创建 PDF 文档
    const pdfDoc = await PDFDocument.create();
    const imageBuffer = await image.toBuffer();

    // DPI 转换（假设 96 DPI）
    const DPI = 96;
    const pixelToPoints = 72 / DPI;

    // 计算图片的点尺寸
    const imgPointsWidth = imageWidth * pixelToPoints;
    const imgPointsHeight = imageHeight * pixelToPoints;

    // 根据格式嵌入图片
    const pdfImage = metadata.format === 'png'
      ? await pdfDoc.embedPng(imageBuffer)
      : await pdfDoc.embedJpg(imageBuffer);

    // 计算缩放后的尺寸
    let scaledWidth, scaledHeight;
    const scalingVal = options.scaling;

    if (scalingVal === PRINTER.PRINT_PRINT_SCALING.FIT || !scalingVal) {
      // 自适应模式：图片完整显示在纸张内（不裁剪）
      const targetW = targetWidth ? this._mmToPoints(targetWidth) : imgPointsWidth;
      const targetH = targetHeight ? this._mmToPoints(targetHeight) : imgPointsHeight;
      const fitScaleX = targetW / imgPointsWidth;
      const fitScaleY = targetH / imgPointsHeight;
      const fitScale = Math.min(fitScaleX, fitScaleY);
      scaledWidth = imgPointsWidth * fitScale;
      scaledHeight = imgPointsHeight * fitScale;
      logger.log('FIT 缩放比例:', fitScale);
    } else {
      // 直接缩放：用户输入的缩放比例（50 = 50%, 100 = 100%, 200 = 200%）
      const userScale = parseFloat(scalingVal) / 100;
      scaledWidth = imgPointsWidth * userScale;
      scaledHeight = imgPointsHeight * userScale;
      logger.log('直接缩放比例:', userScale);
    }

    // 计算页面尺寸（横排模式交换宽高）
    const finalPageWidth = targetWidth ? this._mmToPoints(targetWidth) : imgPointsWidth;
    const finalPageHeight = targetHeight ? this._mmToPoints(targetHeight) : imgPointsHeight;

    // 图片居中放置
    const x = (finalPageWidth - scaledWidth) / 2;
    const y = (finalPageHeight - scaledHeight) / 2;

    logger.log(`目标纸张: ${finalPageWidth}x${finalPageHeight} (点), 图片: ${scaledWidth}x${scaledHeight} (点)`);

    // 创建页面并绘制图片
    const page = pdfDoc.addPage([finalPageWidth, finalPageHeight]);
    page.drawImage(pdfImage, { x, y, width: scaledWidth, height: scaledHeight });

    // 保存 PDF
    const pdfBytes = await pdfDoc.save();
    const fileName = path.basename(imagePath);
    const suffix = isLandscape ? PRINT_ORIENTATION.LANDSCAPE : PRINT_ORIENTATION.PORTRAIT;
    const outPath = path.join(CACHE_DIR, `${fileName}_${suffix}.pdf`);
    fs.writeFileSync(outPath, pdfBytes);
    logger.log(`生成 ${suffix} PDF:`, outPath);

    return outPath;
  }

  /**
   * 将图片转换为 PDF（竖排模式）
   * 图片不旋转，仅适应纸张尺寸
   * @param {string} imagePath - 图片文件路径
   * @param {Object} [options] - 选项
   * @param {number} [options.mediaWidth] - 目标纸张宽度（毫米）
   * @param {number} [options.mediaHeight] - 目标纸张高度（毫米）
   * @param {string|number} [options.scaling] - 缩放模式：'fit' 自适应，或数值百分比
   * @returns {Promise<string>} 生成 PDF 的路径
   */
  async imageToPdfPortrait(imagePath, options = {}) {
    return this._imageToPdf(imagePath, options, false);
  }

  /**
   * 将图片转换为 PDF（横排模式）
   * @param {string} imagePath - 图片文件路径
   * @param {Object} [options] - 选项
   * @returns {Promise<string>} 生成 PDF 的路径
   */
  async imageToPdfLandscape(imagePath, options = {}) {
    return this._imageToPdf(imagePath, options, true);
  }

  // ==================== PDF 处理 ====================

  /**
   * 设置 PDF 页面方向（不旋转，仅交换宽高）
   * @param {string} filePath - PDF 文件路径
   * @param {Object} options - 选项
   * @param {number} options.mediaWidth - 目标纸张宽度（毫米）
   * @param {number} options.mediaHeight - 目标纸张高度（毫米）
   * @param {boolean} isLandscape - 是否为横排模式
   * @returns {Promise<string>} 生成 PDF 的路径
   */
  async _setPdfOrientation(filePath, options, isLandscape) {
    logger.log(`=== _setPdfOrientation (${isLandscape ? PRINT_ORIENTATION.LANDSCAPE : PRINT_ORIENTATION.PORTRAIT}) ===`);

    // 加载 PDF
    const pdfBytes = fs.readFileSync(filePath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();

    // 计算目标尺寸
    let targetWidth, targetHeight;
    if (options.mediaWidth && options.mediaHeight) {
      // 横排模式：交换宽高
      targetWidth = isLandscape ? this._mmToPoints(options.mediaHeight) : this._mmToPoints(options.mediaWidth);
      targetHeight = isLandscape ? this._mmToPoints(options.mediaWidth) : this._mmToPoints(options.mediaHeight);
    }

    // 调整每页方向
    for (const page of pages) {
      const { width, height } = page.getSize();
      if (targetWidth && targetHeight) {
        // 指定了目标尺寸，直接设置
        page.setSize(targetWidth, targetHeight);
      } else {
        // 未指定尺寸，根据模式旋转
        if (isLandscape && width < height) {
          page.setSize(height, width);
        } else if (!isLandscape && width > height) {
          page.setSize(height, width);
        }
      }
    }

    // 保存 PDF
    const modifiedPdfBytes = await pdfDoc.save();
    const fileName = path.basename(filePath);
    const suffix = isLandscape ? PRINT_ORIENTATION.LANDSCAPE : PRINT_ORIENTATION.PORTRAIT;
    const outPath = path.join(CACHE_DIR, `${fileName}_${suffix}.pdf`);
    fs.writeFileSync(outPath, modifiedPdfBytes);
    logger.log(`生成 ${suffix} PDF:`, outPath);

    return outPath;
  }

  /**
   * 设置 PDF 为竖排方向（不旋转，仅交换宽高）
   * @param {string} filePath - PDF 文件路径
   * @param {Object} [options] - 选项
   * @param {number} [options.mediaWidth] - 目标纸张宽度（毫米）
   * @param {number} [options.mediaHeight] - 目标纸张高度（毫米）
   * @returns {Promise<string>} 生成 PDF 的路径
   */
  async setPdfPortrait(filePath, options = {}) {
    return this._setPdfOrientation(filePath, options, false);
  }

  /**
   * 设置 PDF 为横排方向（不旋转，仅交换宽高）
   * @param {string} filePath - PDF 文件路径
   * @param {Object} [options] - 选项
   * @param {number} [options.mediaWidth] - 目标纸张宽度（毫米）
   * @param {number} [options.mediaHeight] - 目标纸张高度（毫米）
   * @returns {Promise<string>} 生成 PDF 的路径
   */
  async setPdfLandscape(filePath, options = {}) {
    return this._setPdfOrientation(filePath, options, true);
  }

  /**
   * 创建 n-up PDF（每版多页）
   * 将源 PDF 的多页内容合并到一张纸上
   * @param {Array} srcPages - 源 PDF 页面数组
   * @param {number} nup - 每版页数（2, 4, 6, 9, 16 等）
   * @param {number} pageWidth - 目标页面宽度（点）
   * @param {number} pageHeight - 目标页面高度（点）
   * @param {string} filePath - 源文件路径（用于生成输出文件名）
   * @param {string|number} [scaling] - 缩放模式：'fit' 自适应，或数值百分比（100=原始尺寸）
   * @returns {Promise<string>} 生成 PDF 的路径
   */
  async _createNupPdf(srcPages, nup, pageWidth, pageHeight, filePath, scaling) {
    // 计算网格布局
    // n-up 布局规则：2=2x1, 3=3x1, 4=2x2, 6=3x2, 9=3x3, 16=4x4
    let cols, rows;
    if (nup === 2) {
      cols = 2; rows = 1;
    } else if (nup === 3) {
      cols = 3; rows = 1;
    } else if (nup === 4) {
      cols = 2; rows = 2;
    } else if (nup <= 6) {
      cols = 3; rows = 2;
    } else if (nup <= 9) {
      cols = 3; rows = 3;
    } else {
      cols = 4; rows = Math.ceil(nup / 4);
    }

    // 计算每个单元格的尺寸
    const margin = 10; // 页面边距（点）
    const gap = 6; // 页面间距（点）
    const cellWidth = (pageWidth - margin * 2 - gap * (cols - 1)) / cols;
    const cellHeight = (pageHeight - margin * 2 - gap * (rows - 1)) / rows;

    // 获取源 PDF 第一页的尺寸作为缩放参考
    const { width: origW, height: origH } = srcPages[0].getSize();

    // 计算缩放比例
    let scale;
    if (scaling === PRINT_SCALING.FIT || !scaling) {
      // 自适应模式：内容填满单元格（可能裁剪）
      const scaleX = cellWidth / origW;
      const scaleY = cellHeight / origH;
      scale = Math.min(scaleX, scaleY);
    } else {
      // 百分比模式：用户指定缩放比例（100 = 原始尺寸）
      scale = parseFloat(scaling) / 100;
    }

    const scaledW = origW * scale;
    const scaledH = origH * scale;

    // 创建新 PDF
    const newPdf = await PDFDocument.create();

    // 计算需要多少页
    const numPages = srcPages.length;
    const pagesNeeded = Math.ceil(numPages / nup);

    for (let pageIdx = 0; pageIdx < pagesNeeded; pageIdx++) {
      const newPage = newPdf.addPage([pageWidth, pageHeight]);

      // 在每一页上放置 n-up 内容
      for (let i = 0; i < nup; i++) {
        const srcPageIdx = pageIdx * nup + i;
        if (srcPageIdx >= numPages) break;

        const col = i % cols;
        const row = Math.floor(i / cols);

        // 计算单元格内偏移（居中）
        const offsetX = (cellWidth - scaledW) / 2;
        const offsetY = (cellHeight - scaledH) / 2;

        // 计算页面位置（PDF 坐标系统以左下角为原点）
        const x = margin + col * (cellWidth + gap) + offsetX;
        const y = margin + (rows - 1 - row) * (cellHeight + gap) + offsetY;

        // 嵌入源页面
        const [embedded] = await newPdf.embedPages([srcPages[srcPageIdx]]);

        // 绘制页面
        newPage.drawPage(embedded, {
          x: x,
          y: y,
          width: scaledW,
          height: scaledH
        });
      }
    }

    const outPath = path.join(CACHE_DIR, `${path.basename(filePath)}_${nup}up.pdf`);
    const pdfBytes = await newPdf.save();
    fs.writeFileSync(outPath, pdfBytes);
    logger.log(`生成 ${nup}-up PDF: ${outPath}, 页数: ${pagesNeeded}, 缩放: ${scale}`);

    return outPath;
  }

  /**
   * 解析自定义页数字符串
   * 支持格式: "1,3,5-10" 表示第1、3、5到10页
   * @param {string} customPagesStr - 自定义页数字符串
   * @param {number} totalPages - PDF 总页数
   * @returns {number[]} 页码索引数组（0-based）
   */
  _parseCustomPages(customPagesStr, totalPages) {
    if (!customPagesStr || !customPagesStr.trim()) {
      return [];
    }

    const pageSet = new Set();
    const parts = customPagesStr.split(',');

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      if (trimmed.includes('-')) {
        // 范围格式，如 "5-10"
        const [start, end] = trimmed.split('-').map(s => parseInt(s.trim()));
        if (!isNaN(start) && !isNaN(end) && start >= 1 && end >= start) {
          for (let i = start; i <= Math.min(end, totalPages); i++) {
            pageSet.add(i - 1); // 转换为 0-based 索引
          }
        }
      } else {
        // 单页格式，如 "3"
        const page = parseInt(trimmed);
        if (!isNaN(page) && page >= 1 && page <= totalPages) {
          pageSet.add(page - 1); // 转换为 0-based 索引
        }
      }
    }

    // 排序返回
    return Array.from(pageSet).sort((a, b) => a - b);
  }

  /**
   * 处理 PDF 缩放、方向、n-up 和页面筛选
   * @param {string} filePath - PDF 文件路径
   * @param {Object} options - 选项
   * @param {string} [options.orientation] - 方向 ('portrait' 或 'landscape')
   * @param {number} [options.mediaWidth] - 目标纸张宽度（毫米）
   * @param {number} [options.mediaHeight] - 目标纸张高度（毫米）
   * @param {number} [options.nup] - 每版页数
   * @param {string} [options.pageSet] - 页面范围 ('all', 'odd', 'even', 'custom')
   * @param {string} [options.customPages] - 自定义页数字符串 (如 "1,3,5-10")
   * @param {string|number} [options.scaling] - 缩放模式：'fit' 自适应，或数值百分比
   * @returns {Promise<string>} 处理后 PDF 的路径
   */
  async scalePdf(filePath, options = {}) {
    const orientation = options.orientation || PRINT_ORIENTATION.PORTRAIT;
    const nup = options.nup || 1;
    const pageSet = options.pageSet || PRINT_PAGE_SET.ALL;
    const customPages = options.customPages || '';
    const scaling = options.scaling;

    // 加载源 PDF
    const srcPdf = await PDFDocument.load(fs.readFileSync(filePath));
    let srcPages = srcPdf.getPages();

    // 处理页面范围筛选
    if (pageSet === PRINT_PAGE_SET.ODD) {
      // 奇数页（页码 1,3,5,... 对应索引 0,2,4,...）
      srcPages = srcPages.filter((_, i) => i % 2 === 0);
    } else if (pageSet === PRINT_PAGE_SET.EVEN) {
      // 偶数页（页码 2,4,6,... 对应索引 1,3,5,...）
      srcPages = srcPages.filter((_, i) => i % 2 === 1);
    } else if (pageSet === PRINT_PAGE_SET.CUSTOM && customPages) {
      // 自定义页数
      const indices = this._parseCustomPages(customPages, srcPdf.getPages().length);
      srcPages = indices.map(i => srcPdf.getPages()[i]);
    }

    // 确定目标纸张尺寸
    let targetWidthMM = options.mediaWidth;
    let targetHeightMM = options.mediaHeight;

    // 如果没有指定尺寸，使用源 PDF 第一页的尺寸
    if (!targetWidthMM || !targetHeightMM) {
      const { width: origW, height: origH } = srcPages[0].getSize();
      targetWidthMM = this._pointsToMm(origW);
      targetHeightMM = this._pointsToMm(origH);
    }

    // 横排模式下交换宽高
    if (orientation === PRINT_ORIENTATION.LANDSCAPE) {
      [targetWidthMM, targetHeightMM] = [targetHeightMM, targetWidthMM];
    }

    // 转换为点
    const pageWidth = this._mmToPoints(targetWidthMM);
    const pageHeight = this._mmToPoints(targetHeightMM);

    // n-up 模式
    if (nup > 1) {
      return await this._createNupPdf(srcPages, nup, pageWidth, pageHeight, filePath, scaling);
    }

    // 单页模式：将源 PDF 的每一页都缩放到目标页面尺寸
    const newPdf = await PDFDocument.create();

    for (const srcPage of srcPages) {
      const { width: origW, height: origH } = srcPage.getSize();

      // 计算缩放比例
      let scale;
      if (scaling === PRINT_SCALING.FIT || !scaling) {
        // 自适应模式：内容填满页面（可能裁剪）
        const scaleX = pageWidth / origW;
        const scaleY = pageHeight / origH;
        scale = Math.min(scaleX, scaleY);
      } else {
        // 百分比模式：用户指定缩放比例（100 = 原始尺寸）
        scale = parseFloat(scaling) / 100;
      }

      const scaledW = origW * scale;
      const scaledH = origH * scale;

      const newPage = newPdf.addPage([pageWidth, pageHeight]);

      // 嵌入源 PDF 页面
      const [embedded] = await newPdf.embedPages([srcPage]);

      // 绘制到新页面（居左上角）
      newPage.drawPage(embedded, {
        x: 0,
        y: pageHeight - scaledH,
        width: scaledW,
        height: scaledH
      });
    }

    const outPath = path.join(CACHE_DIR, `${path.basename(filePath)}_scaled.pdf`);
    const pdfBytes = await newPdf.save();
    fs.writeFileSync(outPath, pdfBytes);

    return outPath;
  }

  /**
   * 根据方向处理文件（PDF 或图片）
   * @param {string} filePath - 文件路径
   * @param {string} orientation - 方向 ('portrait' 或 'landscape')
   * @param {Object} options - 选项
   * @returns {Promise<string>} 处理后文件的路径
   */
  async processFileForOrientation(filePath, orientation, options = {}) {
    const ext = path.extname(filePath).toLowerCase();
    const pdfOptions = {
      scaling: options.scaling,
      orientation: orientation,
      mediaWidth: options.mediaWidth,
      mediaHeight: options.mediaHeight,
      nup: options.nup,
      pageSet: options.pageSet,
      customPages: options.customPages
    };

    // PDF 文件：使用 scalePdf 处理（支持 fit、百分比缩放）
    if (ext === '.pdf') {
      return await this.scalePdf(filePath, pdfOptions);
    }

    // 图片文件：图片独立处理缩放和方向，不走 scalePdf
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.tiff', '.bmp'].includes(ext)) {
      // 图片直接根据 orientation 和 scaling 生成 PDF
      const tempPdfPath = await (orientation === PRINT_ORIENTATION.LANDSCAPE
        ? this.imageToPdfLandscape(filePath, pdfOptions)
        : this.imageToPdfPortrait(filePath, pdfOptions));

      // n-up 和 pageSet 需要额外处理
      if (options.nup > 1 || (options.pageSet && options.pageSet !== PRINT_PAGE_SET.ALL)) {
        const finalPdfPath = await this.scalePdf(tempPdfPath, pdfOptions);
        try { fs.unlinkSync(tempPdfPath); } catch (e) {}
        return finalPdfPath;
      }

      return tempPdfPath;
    }

    return filePath;
  }

  // ==================== 文本 PDF 创建 ====================

  /**
   * 从文本内容创建 PDF
   * 支持中文自动换行、字体选择、边距设置、网格线、页眉页脚
   * @param {string} text - 文本内容
   * @param {number} [fontSize=12] - 字体大小（磅）
   * @param {string} [fontFamily='SourceHanSans'] - 字体名称
   * @param {number} [mediaWidth=210] - 纸张宽度（毫米）
   * @param {number} [mediaHeight=297] - 纸张高度（毫米）
   * @param {Object} [margins] - 边距设置
   * @param {number} [margins.top=20] - 上边距（点）
   * @param {number} [margins.right=20] - 右边距（点）
   * @param {number} [margins.bottom=20] - 下边距（点）
   * @param {number} [margins.left=20] - 左边距（点）
   * @param {boolean} [gridLines=false] - 是否绘制网格横线
   * @param {boolean} [addHeader=false] - 是否在页眉添加 No. 和 Date
   * @returns {Promise<string>} 生成 PDF 的路径
   */
  async createTextPdf(text, fontSize = 12, fontFamily = 'SourceHanSans', mediaWidth = 210, mediaHeight = 297, margins = null, gridLines = false, addHeader = false) {
    try {
      const pdfDoc = await PDFDocument.create();
      logger.log('createTextPdf: 字体族:', fontFamily);

      const pageWidth = this._mmToPoints(mediaWidth);
      const pageHeight = this._mmToPoints(mediaHeight);

      // 默认边距
      const margin = {
        top: margins?.top ?? 20,
        right: margins?.right ?? 20,
        bottom: margins?.bottom ?? 20,
        left: margins?.left ?? 20
      };

      // 检测是否包含非 ASCII 字符（判断是否需要中文字体）
      const hasNonAscii = /[^\x00-\x7F]/.test(text);

      let font;

      if (hasNonAscii) {
        logger.log('createTextPdf: 检测到非ASCII字符，需要中文字体');
        // 尝试加载自定义字体
        font = await this._loadFont(pdfDoc, fontFamily);

        // 降级：尝试思源黑体
        if (!font) {
          font = await this._loadFont(pdfDoc, 'SourceHanSans');
        }

        // 降级：尝试系统字体
        if (!font) {
          const systemFontPaths = [
            '/System/Library/Fonts/STHeiti Light.ttc',
            '/System/Library/Fonts/STHeiti Medium.ttc',
            '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.otf'
          ];

          for (const fontPath of systemFontPaths) {
            try {
              if (fs.existsSync(fontPath)) {
                const fontBytes = fs.readFileSync(fontPath);
                font = await pdfDoc.embedFont(fontBytes);
                logger.log('加载系统字体:', fontPath);
                break;
              }
            } catch (e) {
              logger.log('加载系统字体失败:', fontPath);
            }
          }
        }

        if (!font) {
          throw new Error('需要中文字体来生成包含中文的 PDF');
        }
        if (typeof font.widthOfTextAtSize !== 'function') {
          logger.error('createTextPdf: 字体对象无效，缺少 widthOfTextAtSize 方法');
          throw new Error('字体加载失败，无效的字体对象');
        }
        logger.log('createTextPdf: 字体验证通过');
      } else {
        // 纯 ASCII 文本使用 Helvetica
        font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      }

      // 计算行高和内容宽度
      const lineHeight = fontSize * 1.5;
      const contentWidth = pageWidth - margin.left - margin.right;

      // 文本分词（处理自动换行）
      const lines = [];
      const paragraphs = text.split('\n');

      for (const paragraph of paragraphs) {
        if (paragraph.trim() === '') {
          lines.push(''); // 空行
          continue;
        }

        let currentLine = '';
        const chars = paragraph.split('');

        for (const char of chars) {
          const testLine = currentLine + char;
          const testWidth = font.widthOfTextAtSize(testLine, fontSize);

          if (testWidth > contentWidth) {
            if (currentLine) {
              lines.push(currentLine);
              currentLine = char;
            } else {
              lines.push(char);
              currentLine = '';
            }
          } else {
            currentLine = testLine;
          }
        }

        if (currentLine) {
          lines.push(currentLine);
        }
      }

      // 创建第一页
      let currentY = pageHeight - margin.top - fontSize;
      let page = pdfDoc.addPage([pageWidth, pageHeight]);

      // 绘制页眉（可选）- No. 和 Date
      if (addHeader) {
        const today = new Date().toISOString().split('T')[0];
        const headerFontSize = fontSize * 0.8;
        const headerY = pageHeight - margin.top + headerFontSize * 0.3;

        // No. 在左侧
        page.drawText(`No.`, {
          x: margin.left,
          y: headerY,
          size: headerFontSize,
          font: font,
          color: rgb(0.8, 0.8, 0.8)
        });

        // Date 在右侧
        const dateText = `Date: ${today}`;
        const dateWidth = font.widthOfTextAtSize(dateText, headerFontSize);
        page.drawText(dateText, {
          x: pageWidth - margin.right - dateWidth,
          y: headerY,
          size: headerFontSize,
          font: font,
          color: rgb(0.8, 0.8, 0.8)
        });

        // No. 和 Date 下方加一条横线（距底部 2mm）
        const lineY = headerY - (2 * 72 / 25.4);
        page.drawLine({
          start: { x: margin.left, y: lineY },
          end: { x: pageWidth - margin.right, y: lineY },
          color: rgb(0.8, 0.8, 0.8),
          thickness: 0.5
        });

        // 标题和正文贴近横线下方（距横线 2mm）
        currentY = lineY - (fontSize + 2 * 72 / 25.4);
      }

      // 绘制网格横线（可选）
      if (gridLines) {
        const gridColor = rgb(0.8, 0.8, 0.8);
        let gridY = pageHeight - margin.top;

        // 如果没有页眉，第一行文字距第一条横线 2mm
        if (!addHeader) {
          currentY = gridY - lineHeight - (2 * 72 / 25.4);
        }

        while (gridY > margin.bottom) {
          page.drawLine({
            start: { x: margin.left, y: gridY },
            end: { x: pageWidth - margin.right, y: gridY },
            color: gridColor,
            thickness: 0.25
          });
          gridY -= lineHeight;
        }
      }

      // 绘制文本行
      for (const line of lines) {
        if (line === '') {
          currentY -= lineHeight * 0.5; // 空行间距
          continue;
        }

        // 检查是否需要新的一页
        if (currentY < margin.bottom + lineHeight) {
          page = pdfDoc.addPage([pageWidth, pageHeight]);
          currentY = pageHeight - margin.top - fontSize;

          // 绘制网格横线（在新页面上）
          if (gridLines) {
            const gridColor = rgb(0.85, 0.85, 0.85);
            let gridY = pageHeight - margin.top;

            while (gridY > margin.bottom) {
              page.drawLine({
                start: { x: margin.left, y: gridY },
                end: { x: pageWidth - margin.right, y: gridY },
                color: gridColor,
                thickness: 0.25
              });
              gridY -= lineHeight;
            }
          }
        }

        page.drawText(line, {
          x: margin.left,
          y: currentY,
          size: fontSize,
          font: font,
          color: rgb(0, 0, 0)
        });

        currentY -= lineHeight;
      }

      // 保存 PDF
      const pdfBytes = await pdfDoc.save();
      const filename = this._generatePdfFilename();
      const outPath = path.join(CACHE_DIR, filename);
      fs.writeFileSync(outPath, pdfBytes);

      return outPath;
    } catch (error) {
      console.error('createTextPdf 错误:', error);
      throw error;
    }
  }
}

// 创建单例实例
const pdf = new Pdf();

export default pdf;
