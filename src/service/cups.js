/**
 * CUPS 打印模块
 * 包含与 CUPS 打印服务器交互的功能
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import { CUPS_HOST, CUPS_PORT, USE_REMOTE } from '../config/config.js';
import { DEFAULT_MEDIA_OPTIONS } from '../config/global.js';
import logger from '../utils/logger.js';
import pdfService from './pdf.js';

const execAsync = promisify(exec);

/**
 * CUPS 打印服务类
 * 封装打印机操作、lp 命令、打印功能
 */
export class Cups {
  // ==================== 工具函数 ====================

  /**
   * 从 lp 命令输出中提取打印任务 ID
   * @param {string} output - lp 命令的输出内容
   * @returns {string} 任务 ID，如果提取失败则返回当前时间戳
   */
  _extractJobId(output) {
    const jobMatch = output.match(/id[是为\s:]+(.+?)(?:\s|$)/i);
    return jobMatch ? jobMatch[1].trim() : Date.now().toString();
  }

  // ==================== LP 命令构建 ====================

  /**
   * 构建 CUPS lp 命令选项
   * @param {Object} options - 打印选项
   * @param {number} [options.copies] - 打印份数
   * @param {string} [options.media] - 纸张尺寸名称
   * @param {number} [options.mediaWidth] - 自定义纸张宽度(mm)
   * @param {number} [options.mediaHeight] - 自定义纸张高度(mm)
   * @param {string} [options.pageSet] - 页面范围 ('all', 'odd', 'even', 'custom')
   * @param {number} [options.nup] - 每版页数
   * @param {string} [options.scaling] - 缩放模式 ('fit' 或百分比数值)
   * @param {boolean} [options.noHeaderFooter] - 是否隐藏页眉页脚
   * @returns {string[]} lp 命令选项数组
   */
  _buildLpOptions(options) {
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

  // ==================== 打印机相关 ====================

  /**
   * 获取可用的打印机列表
   * @returns {Promise<Array<{id: string, name: string}>>} 打印机列表
   */
  async getPrinters() {
    try {
      const cmd = USE_REMOTE
        ? `lpstat -h ${CUPS_HOST}:${CUPS_PORT} -a`
        : 'lpstat -a';

      const { stdout } = await execAsync(cmd);
      const printers = stdout
        .split('\n')
        .filter(line => line.trim())
        .map((line, idx) => {
          let printerName = line.trim();
          logger.debug(`打印机(${idx}): `, printerName);
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
      logger.error('获取打印机列表失败:', error);
      return [{ id: 'default', name: '默认打印机' }];
    }
  }

  /**
   * 获取打印机的能力选项（如支持的纸张尺寸）
   * @param {string} printerName - 打印机名称
   * @returns {Promise<string[]>} 支持的纸张尺寸列表
   */
  async getPrinterCapabilities(printerName) {
    try {
      const cmdBase = USE_REMOTE ? `-h ${CUPS_HOST}:${CUPS_PORT}` : '';
      const cmd = `lpoptions ${cmdBase} -p "${printerName}" -l`.trim();

      const { stdout } = await execAsync(cmd);

      // 从输出中提取 media 选项
      const mediaMatch = stdout.match(/media\s*:\s*(.+)/i);
      if (!mediaMatch) {
        return DEFAULT_MEDIA_OPTIONS;
      }

      const mediaOptions = mediaMatch[1]
        .split(/[,;]/)
        .map(m => m.trim())
        .filter(m => m && !m.includes('unknown'));

      return this._normalizeMediaOptions(mediaOptions);
    } catch (error) {
      logger.error('获取打印机能力失败:', error);
      return DEFAULT_MEDIA_OPTIONS;
    }
  }

  /**
   * 标准化媒体选项列表
   * @param {string[]} mediaOptions - 原始媒体选项列表
   * @returns {string[]} 标准化后的媒体选项列表
   */
  _normalizeMediaOptions(mediaOptions) {
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

    return normalized.length > 0 ? normalized : DEFAULT_MEDIA_OPTIONS;
  }

  /**
   * 获取打印任务列表
   * @param {string} [printer] - 打印机名称，不指定则获取所有打印机的任务
   * @returns {Promise<Array>} 打印任务列表
   */
  async getJobs(printer) {
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
      logger.error('获取打印任务失败:', error);
      return [];
    }
  }

  /**
   * 取消指定的打印任务
   * @param {string} jobId - 打印任务 ID
   * @returns {{success: boolean, error?: string}} 取消结果
   */
  async cancelJob(jobId) {
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
  async printFile(filePath, printer, options = {}) {
    try {
      // 处理文件方向、尺寸、n-up 等
      if (options.orientation) {
        filePath = await pdfService.processFileForOrientation(filePath, options.orientation, {
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
      const opts = this._buildLpOptions(options);
      const cmd = `${baseCmd} -d "${printer}" ${opts.join(' ')} "${filePath}"`;

      logger.log('打印命令:', cmd);

      const { stdout, stderr } = await execAsync(cmd);
      const output = stdout + stderr;
      logger.log('打印输出:', output);

      // 检查是否有错误
      if (output.toLowerCase().includes('error') || output.toLowerCase().includes('失败')) {
        return { success: false, error: output || '打印失败' };
      }

      return { success: true, jobId: this._extractJobId(output) };
    } catch (error) {
      logger.error('打印失败:', error);
      return { success: false, error: error.message || '打印命令执行失败' };
    }
  }
}

// 创建单例实例
const cups = new Cups();

export default cups;
