/**
 * 公共工具函数
 */

import { DEFAULT_MEDIA_OPTIONS } from '../config/global.js';

// ==================== 纸张尺寸 ====================

/**
 * 纸张尺寸名称映射表（毫米）
 */
export const PAPER_SIZES = {
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

/**
 * 格式化时间显示
 * @param {string} isoString - ISO 格式时间字符串
 * @returns {string} 格式化的日期时间 (YYYY-MM-DD HH:mm)
 */
export function formatTime(isoString) {
  const d = new Date(isoString);
  const date = d.toLocaleDateString('zh-CN');
  const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
}

/**
 * 格式化文件大小显示
 * @param {number} bytes - 字节数
 * @returns {string} 格式化的大小 (B/KB/MB)
 */
export function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

/**
 * 匹配文件尺寸到标准纸张尺寸
 * @param {number} width - 文件宽度(mm)
 * @param {number} height - 文件高度(mm)
 * @returns {string|null} 匹配的纸张尺寸名称，无匹配返回 null
 */
export function matchFileToMedia(width, height) {
  return matchToMediaSize(width, height, DEFAULT_MEDIA_OPTIONS);
}

/**
 * 处理打印选项中的纸张尺寸
 * 根据 media 名称或宽度高度确定最终的纸张尺寸
 * @param {Object} options - 打印选项
 * @param {Function} getFileDimensions - 获取文件尺寸的函数
 * @param {string} filePath - 文件路径
 * @returns {Promise<Object>} 新的选项对象（不修改原对象）
 */
export async function processPrintOptions(options, getFileDimensions, filePath) {
  // 深拷贝原选项，避免修改原对象
  const result = { ...options };

  // 如果指定了 media 名称但没有宽度高度，从 getMediaSizeMM 获取
  if (result.media && (!result.mediaWidth || !result.mediaHeight)) {
    const size = getMediaSizeMM(result.media);
    if (size) {
      result.mediaWidth = size.width;
      result.mediaHeight = size.height;
    }
  }

  // 如果没有指定纸张尺寸，检测文件尺寸并匹配标准纸张
  if (!result.media && (!result.mediaWidth || !result.mediaHeight)) {
    const dims = await getFileDimensions(filePath);
    if (dims) {
      const matched = matchToMediaSize(dims.width, dims.height, DEFAULT_MEDIA_OPTIONS);
      if (matched) {
        result.media = matched;
        const size = getMediaSizeMM(matched);
        if (size) {
          result.mediaWidth = size.width;
          result.mediaHeight = size.height;
        }
      } else {
        // 无匹配，默认 A4
        const defaultSize = PAPER_SIZES['A4'];
        result.media = 'A4';
        result.mediaWidth = defaultSize.width;
        result.mediaHeight = defaultSize.height;
      }
    }
  }

  return result;
}

// ==================== HTTP 响应辅助 ====================

/**
 * 发送错误响应
 */
export function sendError(res, statusCode, message) {
  return res.status(statusCode).json({ error: message });
}

/**
 * 发送成功响应（带可选数据）
 */
export function sendSuccess(res, data = {}) {
  return res.json({ success: true, ...data });
}

// ==================== 打印选项构建 ====================

/**
 * 从请求体构建打印选项
 * @param {Object} body - 请求体对象
 * @param {boolean} isPreview - 是否为预览模式（copies 固定为 1）
 * @returns {Object} 打印选项对象
 */
export function buildPrintOptions(body, isPreview = false) {
  return {
    copies: isPreview ? 1 : (parseInt(body.copies) || 1),
    media: body.media || undefined,
    mediaWidth: body.mediaWidth ? parseInt(body.mediaWidth) : null,
    mediaHeight: body.mediaHeight ? parseInt(body.mediaHeight) : null,
    orientation: body.orientation || 'portrait',
    pageSet: body.pageSet || 'all',
    customPages: body.customPages || '',
    nup: parseInt(body.nup) || 1,
    scaling: body.scaling,
    noHeaderFooter: body.noHeaderFooter === 'true' || body.noHeaderFooter === true,
    addPageNumber: body.addPageNumber === 'true' || body.addPageNumber === true
  };
}

// ==================== 文件类型常量 ====================

/** 文件 MIME 类型映射 */
export const CONTENT_TYPES = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};
