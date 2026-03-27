import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as fontkit from 'fontkit';
import { fileURLToPath } from 'url';
import logger from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execAsync = promisify(exec);

// ==================== 常量定义 ====================

/** PDF 缓存目录，用于存储生成的临时 PDF 文件 */
const CACHE_DIR = path.join(process.cwd(), 'cache');

/** CUPS 打印服务器配置（支持局域网远程打印） */
const CUPS_HOST = process.env.CUPS_HOST || '192.168.10.1';
const CUPS_PORT = process.env.CUPS_PORT || '631';

/** 是否启用远程 CUPS */
const USE_REMOTE = CUPS_HOST && CUPS_HOST !== 'localhost';

/** 内嵌字体目录路径 */
const FONTS_DIR = path.join(__dirname, 'fonts');

/**
 * 可用字体映射表
 * - id: 字体唯一标识符
 * - file: 字体文件名
 * - name: 显示名称
 */
const FONTS_MAP = {
  'SourceHanSans': { file: 'SourceHanSans.otf', name: '思源黑体' },
  'ZiTiGuanJiaFangSongTi': { file: 'ZiTiGuanJiaFangSongTi-2.ttf', name: '仿宋体' },
  'AaMingTianHuiYouHaoShiFaSheng': { file: 'AaMingTianHuiYouHaoShiFaSheng-2.ttf', name: '喵呜体' }
};

/** PDF 文件名计数器，确保并发生成时文件名唯一 */
let pdfCounter = 0;

// ==================== 初始化 ====================

// 确保缓存目录存在
try {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
} catch (e) {}

// ==================== 工具函数 ====================

/**
 * 毫米转点数 (1 inch = 72 points, 1 inch = 25.4mm)
 * @param {number} mm - 毫米值
 * @returns {number} 点数
 */
function mmToPoints(mm) {
  return mm * 72 / 25.4;
}

/**
 * 点转毫米
 * @param {number} points - 点数
 * @returns {number} 毫米值
 */
function pointsToMm(points) {
  return points * 25.4 / 72;
}

/**
 * 从 lp 命令输出中提取打印任务 ID
 * @param {string} output - lp 命令的输出内容
 * @returns {string} 任务 ID，如果提取失败则返回当前时间戳
 */
function extractJobId(output) {
  const jobMatch = output.match(/id[是为\s:]+(.+?)(?:\s|$)/i);
  return jobMatch ? jobMatch[1].trim() : Date.now().toString();
}

/**
 * 生成唯一的 PDF 文件名
 * @returns {string} 文件名，格式：时间戳_序号.pdf
 */
function generatePdfFilename() {
  return `${Date.now()}_${++pdfCounter}.pdf`;
}

/**
 * 加载自定义字体
 * @param {PDFDocument} pdfDoc - PDF 文档实例
 * @param {string} fontName - 字体名称（FONTS_MAP 中的键）
 * @returns {Promise<PDFDocument's font|null>} 加载的字体，失败返回 null
 */
async function loadFont(pdfDoc, fontName) {
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
    const font = await pdfDoc.embedFont(fontBytes);
    logger.log('loadFont: 字体加载成功:', fontName);
    return font;
  } catch (e) {
    logger.log('loadFont: 字体加载失败:', fontName, e.message);
    return null;
  }
}

// ==================== LP 命令构建 ====================

/**
 * 构建 CUPS lp 命令选项
 * @param {Object} options - 打印选项
 * @param {number} [options.copies] - 打印份数
 * @param {string} [options.media] - 纸张尺寸名称
 * @param {number} [options.mediaWidth] - 自定义纸张宽度(mm)
 * @param {number} [options.mediaHeight] - 自定义纸张高度(mm)
 * @param {string} [options.pageSet] - 页面范围 ('all', 'odd', 'even')
 * @param {number} [options.nup] - 每版页数
 * @param {string} [options.scaling] - 缩放模式 ('fit' 或百分比数值)
 * @param {boolean} [options.noHeaderFooter] - 是否隐藏页眉页脚
 * @returns {string[]} lp 命令选项数组
 */
function buildLpOptions(options) {
  const opts = [];

  // 打印份数
  if (options.copies && options.copies > 1) {
    opts.push(`-n ${options.copies}`);
  }

  // 纸张尺寸
  if (options.media) {
    if (options.media === 'Custom' && options.mediaWidth && options.mediaHeight) {
      opts.push(`-o media=${options.mediaWidth}x${options.mediaHeight}mm`);
    } else {
      opts.push(`-o media=${options.media}`);
    }
  }

  // 页面范围（奇偶页）
  if (options.pageSet && options.pageSet !== 'all') {
    opts.push(`-o page-set=${options.pageSet}`);
  }

  // 每版页数
  if (options.nup && options.nup > 1) {
    opts.push(`-o number-up=${options.nup}`);
  }

  // 缩放模式
  if (options.scaling === 'fit') {
    opts.push('-o fitplot');
  } else if (options.scaling && options.scaling !== 100) {
    opts.push(`-o scaling=${options.scaling}`);
  }

  // 隐藏页眉页脚
  if (options.noHeaderFooter === true) {
    opts.push('-o nohdr');
  }

  return opts;
}

// ==================== 文件尺寸相关 ====================

/**
 * 获取图片文件的物理尺寸（毫米）
 * 使用图片的 DPI 信息计算实际打印尺寸
 * @param {string} imagePath - 图片文件路径
 * @returns {Promise<{width: number, height: number}|null>} 宽度和高度（毫米），失败返回 null
 */
async function getImageDimensions(imagePath) {
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
export async function getFileDimensions(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.tiff', '.bmp'].includes(ext)) {
    return await getImageDimensions(filePath);
  } else if (ext === '.pdf') {
    const pdfBytes = fs.readFileSync(filePath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const page = pdfDoc.getPages()[0];
    if (page) {
      const { width, height } = page.getSize();
      return { width: pointsToMm(width), height: pointsToMm(height) };
    }
  }
  return null;
}

/**
 * 纸张尺寸名称映射表（毫米）
 */
const PAPER_SIZES = {
  'A4': { width: 210, height: 297 },
  'A5': { width: 148, height: 210 },
  'A6': { width: 105, height: 148 },
  'B5': { width: 176, height: 250 },
  'Letter': { width: 215.9, height: 279.4 },
  'Legal': { width: 215.9, height: 355.6 },
  '4x6': { width: 101.6, height: 152.4 },
  '4x6photo': { width: 101.6, height: 152.4 },
  '100x150': { width: 100, height: 150 },
  '100x150mm': { width: 100, height: 150 },
  'L': { width: 89, height: 127 },
  '2L': { width: 127, height: 178 }
};

/**
 * 将纸张尺寸名称转换为毫米尺寸
 * @param {string} media - 纸张尺寸名称（如 'A4', 'Letter', 'Custom'）
 * @returns {{width: number, height: number}|null} 宽度和高度（毫米），未知尺寸返回 null
 */
export function getMediaSizeMM(media) {
  if (!media) return null;

  // 直接匹配（大小写敏感）
  if (PAPER_SIZES[media]) return PAPER_SIZES[media];

  // 大小写不敏感匹配
  const upper = media.toUpperCase();
  for (const key of Object.keys(PAPER_SIZES)) {
    if (key.toUpperCase() === upper) return PAPER_SIZES[key];
  }

  // 解析自定义格式，如 "210x297mm" 或 "Custom"
  if (media.includes('x')) {
    const match = media.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
    if (match) {
      return { width: parseFloat(match[1]), height: parseFloat(match[2]) };
    }
  }

  return null;
}

/**
 * 匹配文件尺寸到最接近的标准纸张尺寸
 * @param {number} widthMm - 文件宽度（毫米）
 * @param {number} heightMm - 文件高度（毫米）
 * @param {string[]} mediaOptions - 可选的纸张尺寸列表
 * @returns {string|null} 匹配到的纸张尺寸名称，未匹配返回 null
 */
export function matchToMediaSize(widthMm, heightMm, mediaOptions) {
  if (!mediaOptions || mediaOptions.length === 0) return null;

  const tolerance = 5; // 容差 5mm

  for (const media of mediaOptions) {
    const size = getMediaSizeMM(media);
    if (!size) continue;

    // 检查正常方向是否匹配
    const matchNormal = Math.abs(widthMm - size.width) <= tolerance &&
                        Math.abs(heightMm - size.height) <= tolerance;
    // 检查旋转方向是否匹配
    const matchRotated = Math.abs(widthMm - size.height) <= tolerance &&
                         Math.abs(heightMm - size.width) <= tolerance;

    if (matchNormal || matchRotated) {
      return media;
    }
  }
  return null;
}

// ==================== 打印机相关 ====================

/**
 * 获取可用的打印机列表
 * @returns {Promise<Array<{id: string, name: string}>>} 打印机列表
 */
export async function getPrinters() {
  try {
    const cmd = USE_REMOTE
      ? `lpstat -h ${CUPS_HOST}:${CUPS_PORT} -a`
      : 'lpstat -a';

    const { stdout } = await execAsync(cmd);
    const printers = stdout
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        let printerName = line.trim();
        // 处理中文 "正在接受请求" 提示
        if (printerName.includes('正在接受请求')) {
          printerName = printerName.split('正在接受请求')[0].trim();
        }
        // 取第一个空格前的部分作为打印机名
        if (printerName.includes(' ')) {
          printerName = printerName.split(' ')[0].trim();
        }
        if (!printerName) return null;
        return { id: printerName, name: printerName };
      })
      .filter(p => p && p.id);

    return printers.length > 0 ? printers : [{ id: 'default', name: '默认打印机' }];
  } catch (error) {
    console.error('获取打印机列表失败:', error);
    return [{ id: 'default', name: '默认打印机' }];
  }
}

/**
 * 获取打印机的能力选项（如支持的纸张尺寸）
 * @param {string} printerName - 打印机名称
 * @returns {Promise<string[]>} 支持的纸张尺寸列表
 */
export async function getPrinterCapabilities(printerName) {
  try {
    const cmdBase = USE_REMOTE ? `-h ${CUPS_HOST}:${CUPS_PORT}` : '';
    const cmd = `lpoptions ${cmdBase} -p "${printerName}" -l`.trim();

    const { stdout } = await execAsync(cmd);

    // 从输出中提取 media 选项
    const mediaMatch = stdout.match(/media\s*:\s*(.+)/i);
    if (!mediaMatch) {
      return getDefaultMediaOptions();
    }

    const mediaOptions = mediaMatch[1]
      .split(/[,;]/)
      .map(m => m.trim())
      .filter(m => m && !m.includes('unknown'));

    return normalizeMediaOptions(mediaOptions);
  } catch (error) {
    console.error('获取打印机能力失败:', error);
    return getDefaultMediaOptions();
  }
}

/**
 * 标准化媒体选项列表
 * @param {string[]} mediaOptions - 原始媒体选项列表
 * @returns {string[]} 标准化后的媒体选项列表
 */
function normalizeMediaOptions(mediaOptions) {
  const normalized = [];
  const knownSizes = {
    'a4': 'A4', 'a5': 'A5', 'a6': 'A6', 'b5': 'B5',
    'letter': 'Letter', 'legal': 'Legal', '4x6': '4x6',
    '4x6photo': '4x6', '100x150mm': '100x150',
    'photo_l': 'L', 'photo_2l': '2L',
    'env_10': 'Envelope #10', 'env_dl': 'Envelope DL', 'env_c5': 'Envelope C5'
  };

  mediaOptions.forEach(media => {
    const lower = media.toLowerCase();
    let displayName = knownSizes[lower];

    if (!displayName) {
      // 匹配 "210x297mm" 格式
      if (/^\d+x\d+/i.test(media)) {
        displayName = media.replace(/mm$/i, '').toUpperCase();
      } else {
        displayName = media;
      }
    }

    if (!normalized.includes(displayName)) {
      normalized.push(displayName);
    }
  });

  return normalized.length > 0 ? normalized : getDefaultMediaOptions();
}

/**
 * 获取默认的媒体选项列表
 * @returns {string[]} 默认支持的纸张尺寸列表
 */
function getDefaultMediaOptions() {
  return ['A4', 'A5', 'A6', 'B5', 'Letter', 'Legal', '4x6photo', '100x150mm'];
}

/**
 * 获取打印任务列表
 * @param {string} [printer] - 打印机名称，不指定则获取所有打印机的任务
 * @returns {Promise<Array>} 打印任务列表
 */
export async function getJobs(printer) {
  try {
    const cmd = USE_REMOTE
      ? `lpstat -h ${CUPS_HOST}:${CUPS_PORT} -W not-completed ${printer ? `-P "${printer}"` : ''}`
      : (printer ? `lpstat -W not-completed -P "${printer}"` : 'lpstat -W not-completed');

    const { stdout } = await execAsync(cmd);
    const jobs = stdout
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        const parts = line.split(/\s+/);
        return {
          id: parts[0],
          printer: parts[1],
          name: parts[2] || 'Unknown',
          state: 'pending'
        };
      });
    return jobs;
  } catch (error) {
    console.error('获取打印任务失败:', error);
    return [];
  }
}

/**
 * 取消指定的打印任务
 * @param {string} jobId - 打印任务 ID
 * @returns {{success: boolean, error?: string}} 取消结果
 */
export async function cancelJob(jobId) {
  try {
    const cmd = USE_REMOTE
      ? `lprm -h ${CUPS_HOST}:${CUPS_PORT} ${jobId}`
      : `lprm ${jobId}`;

    await execAsync(cmd);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==================== 字体相关 ====================

/**
 * 获取可用的字体列表
 * @returns {Array<{id: string, name: string, file: string}>} 字体列表
 */
export function getAvailableFonts() {
  return Object.keys(FONTS_MAP).map(id => ({
    id,
    name: FONTS_MAP[id].name,
    file: FONTS_MAP[id].file
  })).filter(font => {
    const fontPath = path.join(FONTS_DIR, font.file);
    return fs.existsSync(fontPath);
  });
}

// ==================== 图片转 PDF ====================

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
export async function imageToPdfPortrait(imagePath, options = {}) {
  logger.log('=== imageToPdfPortrait ===');

  const image = sharp(imagePath);
  const metadata = await image.metadata();
  const imageWidth = metadata.width;
  const imageHeight = metadata.height;

  const pdfDoc = await PDFDocument.create();
  const imageBuffer = await image.toBuffer();

  // 假设 96 DPI（大多数显示器的 DPI）
  const DPI = 96;
  const pixelToPoints = 72 / DPI;

  // 计算图片的点尺寸
  const imgPointsWidth = imageWidth * pixelToPoints;
  const imgPointsHeight = imageHeight * pixelToPoints;

  // 根据格式嵌入图片
  let pdfImage;
  if (metadata.format === 'png') {
    pdfImage = await pdfDoc.embedPng(imageBuffer);
  } else {
    pdfImage = await pdfDoc.embedJpg(imageBuffer);
  }

  // 计算缩放后的尺寸
  let scaledWidth, scaledHeight;
  const scalingVal = options.scaling;

  if (scalingVal === 'fit' || !scalingVal) {
    // 自适应模式：内容填满纸张（可能裁剪）
    const targetWidth = options.mediaWidth ? mmToPoints(options.mediaWidth) : imgPointsWidth;
    const targetHeight = options.mediaHeight ? mmToPoints(options.mediaHeight) : imgPointsHeight;
    const fitScaleX = targetWidth / imgPointsWidth;
    const fitScaleY = targetHeight / imgPointsHeight;
    const fitScale = Math.max(fitScaleX, fitScaleY); // 取较大值确保填满
    scaledWidth = imgPointsWidth * fitScale;
    scaledHeight = imgPointsHeight * fitScale;
    logger.log('使用 FIT 缩放模式, 缩放比例:', fitScale);
  } else {
    // 直接缩放：用户输入的缩放比例（50 = 50%, 100 = 100%, 200 = 200%）
    const userScale = parseFloat(scalingVal) / 100;
    scaledWidth = imgPointsWidth * userScale;
    scaledHeight = imgPointsHeight * userScale;
    logger.log('使用直接缩放模式, 缩放比例:', userScale);
  }

  // 页面尺寸使用目标纸张尺寸
  const finalPageWidth = options.mediaWidth ? mmToPoints(options.mediaWidth) : imgPointsWidth;
  const finalPageHeight = options.mediaHeight ? mmToPoints(options.mediaHeight) : imgPointsHeight;

  // 图片放置位置（左上角）
  const x = 0;
  const y = 0;

  logger.log('目标纸张尺寸 (mm):', options.mediaWidth, 'x', options.mediaHeight);
  logger.log('图片点尺寸:', imgPointsWidth, 'x', imgPointsHeight);
  logger.log('缩放后尺寸:', scaledWidth, 'x', scaledHeight);

  const page = pdfDoc.addPage([finalPageWidth, finalPageHeight]);
  page.drawImage(pdfImage, { x, y, width: scaledWidth, height: scaledHeight });

  const pdfBytes = await pdfDoc.save();
  const fileName = path.basename(imagePath);
  const outPath = path.join(CACHE_DIR, `${fileName}_portrait.pdf`);
  fs.writeFileSync(outPath, pdfBytes);
  logger.log('生成竖排 PDF:', outPath);
  return outPath;
}

/**
 * 将图片转换为 PDF（横排模式）
 * @param {string} imagePath - 图片文件路径
 * @param {Object} [options] - 选项（同 imageToPdfPortrait）
 * @returns {Promise<string>} 生成 PDF 的路径
 */
export async function imageToPdfLandscape(imagePath, options = {}) {
  const image = sharp(imagePath);
  const metadata = await image.metadata();
  const imageWidth = metadata.width;
  const imageHeight = metadata.height;

  const pdfDoc = await PDFDocument.create();
  const imageBuffer = await image.toBuffer();

  const DPI = 96;
  const pixelToPoints = 72 / DPI;

  const imgPointsWidth = imageWidth * pixelToPoints;
  const imgPointsHeight = imageHeight * pixelToPoints;

  let pdfImage;
  if (metadata.format === 'png') {
    pdfImage = await pdfDoc.embedPng(imageBuffer);
  } else {
    pdfImage = await pdfDoc.embedJpg(imageBuffer);
  }

  let scaledWidth, scaledHeight;
  const scalingVal = options.scaling;

  if (scalingVal === 'fit' || !scalingVal) {
    const targetWidth = options.mediaWidth ? mmToPoints(options.mediaWidth) : imgPointsWidth;
    const targetHeight = options.mediaHeight ? mmToPoints(options.mediaHeight) : imgPointsHeight;
    const fitScaleX = targetWidth / imgPointsWidth;
    const fitScaleY = targetHeight / imgPointsHeight;
    const fitScale = Math.max(fitScaleX, fitScaleY);
    scaledWidth = imgPointsWidth * fitScale;
    scaledHeight = imgPointsHeight * fitScale;
  } else {
    const userScale = parseFloat(scalingVal) / 100;
    scaledWidth = imgPointsWidth * userScale;
    scaledHeight = imgPointsHeight * userScale;
  }

  const finalPageWidth = options.mediaWidth ? mmToPoints(options.mediaWidth) : imgPointsWidth;
  const finalPageHeight = options.mediaHeight ? mmToPoints(options.mediaHeight) : imgPointsHeight;

  const x = 0;
  const y = 0;

  const page = pdfDoc.addPage([finalPageWidth, finalPageHeight]);
  page.drawImage(pdfImage, { x, y, width: scaledWidth, height: scaledHeight });

  const pdfBytes = await pdfDoc.save();
  const fileName = path.basename(imagePath);
  const outPath = path.join(CACHE_DIR, `${fileName}_landscape.pdf`);
  fs.writeFileSync(outPath, pdfBytes);
  logger.log('生成横排 PDF:', outPath);
  return outPath;
}

// ==================== PDF 处理 ====================

/**
 * 设置 PDF 为竖排方向（不旋转，仅交换宽高）
 * @param {string} filePath - PDF 文件路径
 * @param {Object} [options] - 选项
 * @param {number} [options.mediaWidth] - 目标纸张宽度（毫米）
 * @param {number} [options.mediaHeight] - 目标纸张高度（毫米）
 * @returns {Promise<string>} 生成 PDF 的路径
 */
export async function setPdfPortrait(filePath, options = {}) {
  const pdfBytes = fs.readFileSync(filePath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();

  let targetWidth, targetHeight;
  if (options.mediaWidth && options.mediaHeight) {
    targetWidth = mmToPoints(options.mediaWidth);
    targetHeight = mmToPoints(options.mediaHeight);
  }

  for (const page of pages) {
    const { width, height } = page.getSize();
    if (targetWidth && targetHeight) {
      page.setSize(targetWidth, targetHeight);
    } else if (width > height) {
      page.setSize(height, width);
    }
  }

  const modifiedPdfBytes = await pdfDoc.save();
  const fileName = path.basename(filePath);
  const outPath = path.join(CACHE_DIR, `${fileName}_portrait.pdf`);
  fs.writeFileSync(outPath, modifiedPdfBytes);
  logger.log('生成竖排 PDF:', outPath);
  return outPath;
}

/**
 * 设置 PDF 为横排方向（不旋转，仅交换宽高）
 * @param {string} filePath - PDF 文件路径
 * @param {Object} [options] - 选项
 * @param {number} [options.mediaWidth] - 目标纸张宽度（毫米）
 * @param {number} [options.mediaHeight] - 目标纸张高度（毫米）
 * @returns {Promise<string>} 生成 PDF 的路径
 */
export async function setPdfLandscape(filePath, options = {}) {
  const pdfBytes = fs.readFileSync(filePath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();

  let targetWidth, targetHeight;
  if (options.mediaWidth && options.mediaHeight) {
    targetWidth = mmToPoints(options.mediaWidth);
    targetHeight = mmToPoints(options.mediaHeight);
  }

  for (const page of pages) {
    const { width, height } = page.getSize();
    if (targetWidth && targetHeight) {
      page.setSize(targetWidth, targetHeight);
    } else if (width < height) {
      page.setSize(height, width);
    }
  }

  const modifiedPdfBytes = await pdfDoc.save();
  const fileName = path.basename(filePath);
  const outPath = path.join(CACHE_DIR, `${fileName}_landscape.pdf`);
  fs.writeFileSync(outPath, modifiedPdfBytes);
  logger.log('生成横排 PDF:', outPath);
  return outPath;
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
async function createNupPdf(srcPages, nup, pageWidth, pageHeight, filePath, scaling) {
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
  if (scaling === 'fit' || !scaling) {
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
function parseCustomPages(customPagesStr, totalPages) {
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
export async function scalePdf(filePath, options = {}) {
  const orientation = options.orientation || 'portrait';
  const nup = options.nup || 1;
  const pageSet = options.pageSet || 'all';
  const customPages = options.customPages || '';
  const scaling = options.scaling;

  // 加载源 PDF
  const srcPdf = await PDFDocument.load(fs.readFileSync(filePath));
  let srcPages = srcPdf.getPages();

  // 处理页面范围筛选
  if (pageSet === 'odd') {
    // 奇数页（页码 1,3,5,... 对应索引 0,2,4,...）
    srcPages = srcPages.filter((_, i) => i % 2 === 0);
  } else if (pageSet === 'even') {
    // 偶数页（页码 2,4,6,... 对应索引 1,3,5,...）
    srcPages = srcPages.filter((_, i) => i % 2 === 1);
  } else if (pageSet === 'custom' && customPages) {
    // 自定义页数
    const indices = parseCustomPages(customPages, srcPdf.getPages().length);
    srcPages = indices.map(i => srcPdf.getPages()[i]);
  }

  // 确定目标纸张尺寸
  let targetWidthMM = options.mediaWidth;
  let targetHeightMM = options.mediaHeight;

  // 如果没有指定尺寸，使用源 PDF 第一页的尺寸
  if (!targetWidthMM || !targetHeightMM) {
    const { width: origW, height: origH } = srcPages[0].getSize();
    targetWidthMM = pointsToMm(origW);
    targetHeightMM = pointsToMm(origH);
  }

  // 横排模式下交换宽高
  if (orientation === 'landscape') {
    [targetWidthMM, targetHeightMM] = [targetHeightMM, targetWidthMM];
  }

  // 转换为点
  const pageWidth = mmToPoints(targetWidthMM);
  const pageHeight = mmToPoints(targetHeightMM);

  // n-up 模式
  if (nup > 1) {
    return await createNupPdf(srcPages, nup, pageWidth, pageHeight, filePath, scaling);
  }

  // 单页模式：将源 PDF 的每一页都缩放到目标页面尺寸
  const newPdf = await PDFDocument.create();

  for (const srcPage of srcPages) {
    const { width: origW, height: origH } = srcPage.getSize();

    // 计算缩放比例
    let scale;
    if (scaling === 'fit' || !scaling) {
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
async function processFileForOrientation(filePath, orientation, options = {}) {
  const ext = path.extname(filePath).toLowerCase();
  const pdfOptions = {
    scaling: options.scaling
  };

  // 传递纸张尺寸
  if (options.mediaWidth && options.mediaHeight) {
    pdfOptions.mediaWidth = options.mediaWidth;
    pdfOptions.mediaHeight = options.mediaHeight;
  }

  // 传递 n-up 设置
  if (options.nup && options.nup > 1) {
    pdfOptions.nup = options.nup;
  }

  // 传递 pageSet 设置
  if (options.pageSet && options.pageSet !== 'all') {
    pdfOptions.pageSet = options.pageSet;
    // 传递自定义页数
    if (options.pageSet === 'custom' && options.customPages) {
      pdfOptions.customPages = options.customPages;
    }
  }

  // PDF 文件使用 scalePdf 处理
  if (ext === '.pdf') {
    pdfOptions.orientation = orientation;
    return await scalePdf(filePath, pdfOptions);
  }

  // 图片文件根据方向处理
  if (orientation === 'portrait') {
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.tiff', '.bmp'].includes(ext)) {
      return await imageToPdfPortrait(filePath, pdfOptions);
    }
  } else if (orientation === 'landscape') {
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.tiff', '.bmp'].includes(ext)) {
      return await imageToPdfLandscape(filePath, pdfOptions);
    }
  }

  return filePath;
}

// ==================== 打印执行 ====================

/**
 * 执行打印任务
 * @param {string} filePath - 要打印的文件路径
 * @param {string} printer - 打印机名称
 * @param {Object} options - 打印选项
 * @param {number} [options.copies] - 打印份数
 * @param {string} [options.media] - 纸张尺寸
 * @param {number} [options.mediaWidth] - 自定义纸张宽度（毫米）
 * @param {number} [options.mediaHeight] - 自定义纸张高度（毫米）
 * @param {string} [options.orientation] - 方向 ('portrait' 或 'landscape')
 * @param {string} [options.pageSet] - 页面范围 ('all', 'odd', 'even', 'custom')
 * @param {string} [options.customPages] - 自定义页数字符串 (如 "1,3,5-10")
 * @param {number} [options.nup] - 每版页数
 * @param {string} [options.scaling] - 缩放模式
 * @param {boolean} [options.noHeaderFooter] - 是否隐藏页眉页脚
 * @returns {Promise<{success: boolean, jobId?: string, error?: string}>} 打印结果
 */
export async function printFile(filePath, printer, options = {}) {
  try {
    // 处理文件方向、尺寸、n-up 等
    if (options.orientation) {
      filePath = await processFileForOrientation(filePath, options.orientation, {
        mediaWidth: options.mediaWidth,
        mediaHeight: options.mediaHeight,
        scaling: options.scaling,
        nup: options.nup,
        pageSet: options.pageSet,
        customPages: options.customPages
      });
    }

    // 构建 lp 命令
    const baseCmd = USE_REMOTE ? `lp -h ${CUPS_HOST}:${CUPS_PORT}` : 'lp';
    const opts = buildLpOptions(options);
    const cmd = `${baseCmd} -d "${printer}" ${opts.join(' ')} "${filePath}"`;

    logger.log('打印命令:', cmd);

    const { stdout, stderr } = await execAsync(cmd);
    const output = stdout + stderr;
    logger.log('打印输出:', output);

    // 检查是否有错误
    if (output.toLowerCase().includes('error') || output.toLowerCase().includes('失败')) {
      return { success: false, error: output || '打印失败' };
    }

    return { success: true, jobId: extractJobId(output) };
  } catch (error) {
    console.error('打印失败:', error);
    return { success: false, error: error.message || '打印命令执行失败' };
  }
}

// ==================== 文本 PDF 创建 ====================

/**
 * 从文本内容创建 PDF
 * 支持中文自动换行、字体选择、边距设置、网格线
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
 * @returns {Promise<string>} 生成 PDF 的路径
 */
export async function createTextPdf(text, fontSize = 12, fontFamily = 'SourceHanSans', mediaWidth = 210, mediaHeight = 297, margins = null, gridLines = false) {
  try {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    const pageWidth = mmToPoints(mediaWidth);
    const pageHeight = mmToPoints(mediaHeight);

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
      // 尝试加载自定义字体
      font = await loadFont(pdfDoc, fontFamily);

      // 降级：尝试思源黑体
      if (!font) {
        font = await loadFont(pdfDoc, 'SourceHanSans');
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

    // 绘制网格横线（可选）
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
    const filename = generatePdfFilename();
    const outPath = path.join(CACHE_DIR, filename);
    fs.writeFileSync(outPath, pdfBytes);

    return outPath;
  } catch (error) {
    console.error('createTextPdf 错误:', error);
    throw error;
  }
}
