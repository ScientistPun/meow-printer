/**
 * 项目路径配置
 * 所有路径常量集中管理
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==================== 服务器配置 ====================

/** 服务器端口 */
const PORT = process.env.PORT || 3000;

// ==================== 目录配置 ====================

// 项目根目录 (src 的上级)
const ROOT_DIR = path.join(__dirname, '../..');

// 公开目录
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

// 日志目录
const LOG_DIR = path.join(ROOT_DIR, 'logs');

// 缓存目录
const CACHE_DIR = path.join(PUBLIC_DIR, 'cache');


// ==================== 上传配置 ====================

// 上传目录
const UPLOAD_DIR = path.join(PUBLIC_DIR, 'uploads');

/** 支持的文件类型 */
const SUPPORTED_FILE_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx'];

/** 最大文件大小（字节），默认 50MB */
const MAX_FILE_SIZE = 50 * 1024 * 1024;


// ==================== 字体配置 ====================

// 字体目录
const FONTS_DIR = path.join(PUBLIC_DIR, 'fonts');

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

// ==================== CUPS 打印服务器配置 ====================

/** CUPS 打印服务器地址（支持局域网远程打印） */
const CUPS_HOST = process.env.CUPS_HOST || '192.168.10.1';

/** CUPS 打印服务器端口 */
const CUPS_PORT = process.env.CUPS_PORT || '631';

/** 是否启用远程 CUPS */
const USE_REMOTE = CUPS_HOST && CUPS_HOST !== 'localhost';

// 确保必要的目录存在
[CACHE_DIR, FONTS_DIR, UPLOAD_DIR, LOG_DIR].forEach(dir => {
  fs.mkdirSync(dir, { recursive: true });
});

export {
  PORT,
  SUPPORTED_FILE_EXTENSIONS,
  MAX_FILE_SIZE,
  ROOT_DIR,
  PUBLIC_DIR,
  LOG_DIR,
  CACHE_DIR,
  FONTS_DIR,
  FONTS_MAP,
  UPLOAD_DIR,
  CUPS_HOST,
  CUPS_PORT,
  USE_REMOTE
};
