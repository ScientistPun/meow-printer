import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';

const execAsync = promisify(exec);

// 缓存目录
const CACHE_DIR = path.join(process.cwd(), 'cache');

// 确保缓存目录存在
try {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
} catch (e) {}

// CUPS 服务器配置（局域网远程 CUPS）
const CUPS_HOST = process.env.CUPS_HOST || '192.168.10.1';
const CUPS_PORT = process.env.CUPS_PORT || '631';

// 是否使用远程 CUPS
const USE_REMOTE = CUPS_HOST && CUPS_HOST !== 'localhost';

// 构建 lp 命令选项
function buildLpOptions(options) {
  const opts = [];

  if (options.copies && options.copies > 1) {
    opts.push(`-n ${options.copies}`);
  }

  if (options.media) {
    if (options.media === 'Custom' && options.mediaWidth && options.mediaHeight) {
      opts.push(`-o media=${options.mediaWidth}x${options.mediaHeight}mm`);
    } else {
      opts.push(`-o media=${options.media}`);
    }
  }

  if (options.pageSet && options.pageSet !== 'all') {
    opts.push(`-o page-set=${options.pageSet}`);
  }

  if (options.nup && options.nup > 1) {
    opts.push(`-o number-up=${options.nup}`);
  }

  if (options.scaling === 'fit') {
    opts.push('-o fitplot');
  } else if (options.scaling && options.scaling !== 100) {
    opts.push(`-o scaling=${options.scaling}`);
  }

  return opts;
}

// 毫米转点数 (1 inch = 72 points, 1 inch = 25.4mm)
function mmToPoints(mm) {
  return mm * 72 / 25.4;
}

// 从 lp 输出中提取 job ID
function extractJobId(output) {
  const jobMatch = output.match(/id[是为\s:]+(.+?)(?:\s|$)/i);
  return jobMatch ? jobMatch[1].trim() : Date.now().toString();
}

// 将图片转换为 PDF（竖排模式：不旋转，只交换宽高）
export async function imageToPdfPortrait(imagePath, options = {}) {
  const image = sharp(imagePath);
  const metadata = await image.metadata();
  const imageWidth = metadata.width;
  const imageHeight = metadata.height;

  const pdfDoc = await PDFDocument.create();
  const imageBuffer = await image.toBuffer();

  let pageWidth, pageHeight;

  // 如果指定了纸张尺寸，使用纸张尺寸；否则使用图片尺寸
  if (options.mediaWidth && options.mediaHeight) {
    pageWidth = mmToPoints(options.mediaWidth);
    pageHeight = mmToPoints(options.mediaHeight);
  } else if (imageWidth <= imageHeight) {
    pageWidth = imageWidth;
    pageHeight = imageHeight;
  } else {
    pageWidth = imageHeight;
    pageHeight = imageWidth;
  }

  let pdfImage;
  if (metadata.format === 'png') {
    pdfImage = await pdfDoc.embedPng(imageBuffer);
  } else {
    pdfImage = await pdfDoc.embedJpg(imageBuffer);
  }

  // 计算缩放比例
  let scaledWidth, scaledHeight;
  if (options.scaling && options.scaling !== 100 && options.scaling !== 'fit') {
    // 按指定缩放比例缩放
    const scaleFactor = options.scaling / 100;
    scaledWidth = pdfImage.width * scaleFactor;
    scaledHeight = pdfImage.height * scaleFactor;
  } else if (options.scaling === 'fit' || (!options.mediaWidth && !options.mediaHeight)) {
    // 适应页面
    const scale = Math.min(pageWidth / pdfImage.width, pageHeight / pdfImage.height);
    scaledWidth = pdfImage.width * scale;
    scaledHeight = pdfImage.height * scale;
  } else {
    // 无缩放，使用图片原始尺寸
    scaledWidth = pdfImage.width;
    scaledHeight = pdfImage.height;
  }

  const x = (pageWidth - scaledWidth) / 2;
  const y = (pageHeight - scaledHeight) / 2;

  const page = pdfDoc.addPage([pageWidth, pageHeight]);
  page.drawImage(pdfImage, { x, y, width: scaledWidth, height: scaledHeight });

  const pdfBytes = await pdfDoc.save();
  const fileName = path.basename(imagePath);
  const outPath = path.join(CACHE_DIR, `${fileName}_portrait.pdf`);
  fs.writeFileSync(outPath, pdfBytes);
  console.log('Generated portrait PDF:', outPath);
  return outPath;
}

// 将图片转换为 PDF（横排模式：不旋转，只交换宽高）
export async function imageToPdfLandscape(imagePath, options = {}) {
  const image = sharp(imagePath);
  const metadata = await image.metadata();
  const imageWidth = metadata.width;
  const imageHeight = metadata.height;

  const pdfDoc = await PDFDocument.create();
  const imageBuffer = await image.toBuffer();

  let pageWidth, pageHeight;

  // 如果指定了纸张尺寸，使用纸张尺寸；否则使用图片尺寸
  if (options.mediaWidth && options.mediaHeight) {
    pageWidth = mmToPoints(options.mediaWidth);
    pageHeight = mmToPoints(options.mediaHeight);
  } else if (imageWidth >= imageHeight) {
    pageWidth = imageWidth;
    pageHeight = imageHeight;
  } else {
    pageWidth = imageHeight;
    pageHeight = imageWidth;
  }

  let pdfImage;
  if (metadata.format === 'png') {
    pdfImage = await pdfDoc.embedPng(imageBuffer);
  } else {
    pdfImage = await pdfDoc.embedJpg(imageBuffer);
  }

  // 计算缩放比例
  let scaledWidth, scaledHeight;
  if (options.scaling && options.scaling !== 100 && options.scaling !== 'fit') {
    const scaleFactor = options.scaling / 100;
    scaledWidth = pdfImage.width * scaleFactor;
    scaledHeight = pdfImage.height * scaleFactor;
  } else if (options.scaling === 'fit' || (!options.mediaWidth && !options.mediaHeight)) {
    const scale = Math.min(pageWidth / pdfImage.width, pageHeight / pdfImage.height);
    scaledWidth = pdfImage.width * scale;
    scaledHeight = pdfImage.height * scale;
  } else {
    scaledWidth = pdfImage.width;
    scaledHeight = pdfImage.height;
  }

  const x = (pageWidth - scaledWidth) / 2;
  const y = (pageHeight - scaledHeight) / 2;

  const page = pdfDoc.addPage([pageWidth, pageHeight]);
  page.drawImage(pdfImage, { x, y, width: scaledWidth, height: scaledHeight });

  const pdfBytes = await pdfDoc.save();
  const fileName = path.basename(imagePath);
  const outPath = path.join(CACHE_DIR, `${fileName}_landscape.pdf`);
  fs.writeFileSync(outPath, pdfBytes);
  console.log('Generated landscape PDF:', outPath);
  return outPath;
}

// 设置 PDF 竖排方向（不旋转，只交换页面宽高）
export async function setPdfPortrait(filePath, options = {}) {
  const pdfBytes = fs.readFileSync(filePath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();

  // 如果指定了纸张尺寸，设置页面尺寸
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
  console.log('Generated portrait PDF:', outPath);
  return outPath;
}

// 设置 PDF 横排方向（不旋转，只交换页面宽高）
export async function setPdfLandscape(filePath, options = {}) {
  const pdfBytes = fs.readFileSync(filePath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();

  // 如果指定了纸张尺寸，设置页面尺寸
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
  console.log('Generated landscape PDF:', outPath);
  return outPath;
}

// 处理文件方向打印
async function processFileForOrientation(filePath, orientation, options = {}) {
  const ext = path.extname(filePath).toLowerCase();
  const pdfOptions = {
    mediaWidth: options.mediaWidth,
    mediaHeight: options.mediaHeight,
    scaling: options.scaling
  };

  if (orientation === 'portrait') {
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.tiff', '.bmp'].includes(ext)) {
      return await imageToPdfPortrait(filePath, pdfOptions);
    } else if (ext === '.pdf') {
      return await setPdfPortrait(filePath, pdfOptions);
    }
  } else if (orientation === 'landscape') {
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.tiff', '.bmp'].includes(ext)) {
      return await imageToPdfLandscape(filePath, pdfOptions);
    } else if (ext === '.pdf') {
      return await setPdfLandscape(filePath, pdfOptions);
    }
  }

  return filePath;
}

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
        if (printerName.includes('正在接受请求')) {
          printerName = printerName.split('正在接受请求')[0].trim();
        }
        if (printerName.includes(' ')) {
          printerName = printerName.split(' ')[0].trim();
        }
        if (!printerName) return null;
        return { id: printerName, name: printerName };
      })
      .filter(p => p && p.id);

    return printers.length > 0 ? printers : [{ id: 'default', name: '默认打印机' }];
  } catch (error) {
    console.error('Failed to get printers:', error);
    return [{ id: 'default', name: '默认打印机' }];
  }
}

export async function printFile(filePath, printer, options = {}) {
  try {
    // 处理文件方向（竖排/横排），生成 PDF 保留用于调试
    if (options.orientation) {
      filePath = await processFileForOrientation(filePath, options.orientation, {
        mediaWidth: options.mediaWidth,
        mediaHeight: options.mediaHeight,
        scaling: options.scaling
      });
    }

    const baseCmd = USE_REMOTE ? `lp -h ${CUPS_HOST}:${CUPS_PORT}` : 'lp';
    const opts = buildLpOptions(options);
    const cmd = `${baseCmd} -d "${printer}" ${opts.join(' ')} "${filePath}"`;

    console.log('Print command:', cmd);

    const { stdout, stderr } = await execAsync(cmd);
    const output = stdout + stderr;
    console.log('Print output:', output);

    // 检查输出中是否有错误信息
    if (output.toLowerCase().includes('error') || output.toLowerCase().includes('失败')) {
      return { success: false, error: output || '打印失败' };
    }

    return { success: true, jobId: extractJobId(output) };
  } catch (error) {
    console.error('Print failed:', error);
    return { success: false, error: error.message || '打印命令执行失败' };
  }
}

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
    console.error('Failed to get jobs:', error);
    return [];
  }
}

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

export async function getPrinterCapabilities(printerName) {
  try {
    const cmdBase = USE_REMOTE ? `-h ${CUPS_HOST}:${CUPS_PORT}` : '';
    const cmd = `lpoptions ${cmdBase} -p "${printerName}" -l`.trim();

    const { stdout } = await execAsync(cmd);

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
    console.error('Failed to get printer capabilities:', error);
    return getDefaultMediaOptions();
  }
}

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

function getDefaultMediaOptions() {
  return ['A4', 'A5', 'B5', 'Letter', 'Legal', '4x6photo', '100x150mm'];
}

// 纸张尺寸名称转换为毫米尺寸
export function getMediaSizeMM(media) {
  const sizes = {
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

  if (!media) return null;

  const upper = media.toUpperCase();

  // 直接匹配
  if (sizes[media]) return sizes[media];

  // 大小写不敏感匹配
  for (const key of Object.keys(sizes)) {
    if (key.toUpperCase() === upper) return sizes[key];
  }

  // 解析自定义格式如 "Custom" 或 "210x297mm"
  if (media.includes('x')) {
    const match = media.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
    if (match) {
      return {
        width: parseFloat(match[1]),
        height: parseFloat(match[2])
      };
    }
  }

  return null;
}