/**
 * 全局配置文件
 * 可同时被后端和前端使用
 */

/** 默认纸张尺寸列表 */
export const DEFAULT_MEDIA_OPTIONS = ['A4', 'A5', 'A6', 'B5', 'Letter', 'Legal', '4x6'];

/** 页面方向 */
export const PRINT_ORIENTATION = {
  PORTRAIT: 'portrait',
  LANDSCAPE: 'landscape'
};

/** 缩放模式 */
export const PRINT_SCALING = {
  FIT: 'fit'
};

/** 页面设置 */
export const PRINT_PAGE_SET = {
  ALL: 'all',
  ODD: 'odd',
  EVEN: 'even',
  CUSTOM: 'custom'
};
