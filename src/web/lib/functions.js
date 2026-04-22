/**
 * 共享函数库
 * 提供前端页面通用的函数和数据
 */

// ==================== 工具函数 ====================

/**
 * 格式化时间
 * @param {string} dateStr - ISO 日期字符串
 * @returns {string} 格式化后的时间字符串
 */
function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;

  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`;

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}`;
}

/**
 * 格式化文件大小
 * @param {number} bytes - 字节数
 * @returns {string} 格式化后的大小字符串
 */
function formatSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  return `${bytes.toFixed(1)} ${units[i]}`;
}

/**
 * 根据文件尺寸匹配纸张
 * @param {number} width - 宽度(mm)
 * @param {number} height - 高度(mm)
 * @returns {string|null} 匹配的纸张名称或 null
 */
function matchFileToMedia(width, height) {
  const PAPER_SIZES = {
    'A4': { w: 210, h: 297 },
    'A5': { w: 148, h: 210 },
    'A6': { w: 105, h: 148 },
    'B5': { w: 176, h: 250 },
    'Letter': { w: 216, h: 279 },
    'Legal': { w: 216, h: 356 }
  };

  const tolerance = 5;
  for (const [name, size] of Object.entries(PAPER_SIZES)) {
    if ((Math.abs(width - size.w) <= tolerance && Math.abs(height - size.h) <= tolerance) ||
        (Math.abs(width - size.h) <= tolerance && Math.abs(height - size.w) <= tolerance)) {
      return name;
    }
  }
  return null;
}

// ==================== 默认配置（内联 from /config/global.js） ====================

const DEFAULT_MEDIA_OPTIONS = ['A4', 'A5', 'A6', 'B5', 'Letter', 'Legal'];

const DEFAULT_SETTINGS = {
  defaultMedia: 'A4',
  customWidth: 100,
  customHeight: 150,
  fontFamily: 'SourceHanSans',
  fontSize: 12,
  marginTop: 20,
  marginRight: 20,
  marginBottom: 20,
  marginLeft: 20,
  gridLines: false,
  addHeader: false
};

const logger = {
  debug: (...args) => console.debug('[DEBUG]', ...args),
  info: (...args) => console.info('[INFO]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  error: (...args) => console.error('[ERROR]', ...args)
};

// ==================== 创建共享状态工厂函数 ====================

/**
 * 创建共享的响应式状态和API函数
 * @param {string} API_BASE - API基础路径
 * @param {Function} showMessage - 消息提示函数
 * @returns {Object} 包含所有共享状态和函数的对象
 */
function createSharedState(API_BASE, showMessage) {
  // ==================== 状态定义 ====================

  // 文件相关状态
  const files = Vue.ref([]);
  const fileName = Vue.ref('');
  const loading = Vue.ref(false);
  const previewLoading = Vue.ref(false);
  const stitching = Vue.ref(false);
  const mediaSelected = Vue.ref(false);

  // 打印机相关状态
  const printers = Vue.ref([]);
  const printersLoading = Vue.ref(true);
  const activeTab = Vue.ref('print');

  // 日志相关状态
  const logFiles = Vue.ref([]);
  const logContent = Vue.ref([]);
  const selectedLogDate = Vue.ref('');
  const logsLoading = Vue.ref(false);

  // 历史文件相关状态
  const history = Vue.ref([]);
  const historyLoading = Vue.ref(false);
  const selectMode = Vue.ref(false);
  const selectedHistoryFiles = Vue.ref([]);
  const selectedFilesCollapsed = Vue.ref(false);

  // 其他状态
  const clearingCache = Vue.ref(false);
  const creatingFile = Vue.ref(false);
  const showSettings = Vue.ref(false);
  const showStitchModal = Vue.ref(false);
  const stitchPaperSize = Vue.ref('A4');
  const stitchMarginTop = Vue.ref(20);
  const stitchMarginRight = Vue.ref(20);
  const stitchMarginBottom = Vue.ref(20);
  const stitchMarginLeft = Vue.ref(20);

  // 生成默认文件名：yyyymmddhhii_长图
  const getDefaultStitchFilename = () => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const ii = String(now.getMinutes()).padStart(2, '0');
    return `${yyyy}${mm}${dd}${hh}${ii}_长图`;
  };

  const stitchFileName = Vue.ref(getDefaultStitchFilename());
  const availableFonts = Vue.ref([]);

  // 设置状态
  const settings = Vue.reactive({ ...DEFAULT_SETTINGS });

  // 文本文件创建状态
  const showCreateFile = Vue.ref(false);
  const createFile = Vue.reactive({
    name: '',
    paperSize: settings.defaultMedia,
    fontSize: settings.fontSize,
    fontFamily: settings.fontFamily,
    customWidth: settings.customWidth,
    customHeight: settings.customHeight,
    content: '',
    marginTop: settings.marginTop,
    marginRight: settings.marginRight,
    marginBottom: settings.marginBottom,
    marginLeft: settings.marginLeft,
    gridLines: settings.gridLines,
    addHeader: settings.addHeader,
    showMore: false
  });

  // 纸张尺寸选项
  const mediaOptions = Vue.ref([...DEFAULT_MEDIA_OPTIONS]);

  // 打印选项
  const options = Vue.reactive({
    printer: '',
    copies: 1,
    orientation: 'portrait',
    pageSet: 'all',
    customPages: '',
    nup: 1,
    scaling: 'fit',
    scalingPercent: 100,
    media: settings.defaultMedia || 'A4',
    customWidth: 100,
    customHeight: 150,
    addPageNumber: false,
  });

  // ==================== 打印机相关函数 ====================

  /**
   * 加载打印机列表
   * 从 /api/printers 获取可用打印机，并自动选择第一个
   */
  const loadPrinters = async () => {
    printersLoading.value = true;
    try {
      const res = await fetch(`${API_BASE}/printers`);
      const data = await res.json();
      printers.value = data.printers || [];
      if (printers.value.length > 0) {
        options.printer = printers.value[0].id;
        loadPrinterCapabilities(options.printer);
      }
    } catch (e) {
      logger.error('Failed to load printers:', e);
    } finally {
      printersLoading.value = false;
    }
  };

  /**
   * 双击打印机选择器时调用：重新连接当前选中的打印机
   */
  const reconnectPrinterAndReload = async () => {
    if (!confirm('确定要重新连接当前打印机吗？')) return;
    try {
      const res = await fetch(`${API_BASE}/printer/reconnect?printer=${encodeURIComponent(options.printer)}`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        showMessage('打印机重新连接成功，正在重新加载...', 'success');
        setTimeout(() => {
          loadPrinters();
        }, 2000);
      } else {
        showMessage(`重新连接失败: ${data.error || '未知错误'}`, 'error');
      }
    } catch (e) {
      showMessage(`请求失败: ${e.message}`, 'error');
    }
  };

  /**
   * 加载指定打印机的能力（如支持的纸张尺寸）
   * @param {string} printer - 打印机名称
   */
  const loadPrinterCapabilities = async (printer) => {
    if (!printer) return;
    try {
      const res = await fetch(`${API_BASE}/printers/capabilities?printer=${encodeURIComponent(printer)}`);
      const data = await res.json();
      if (data.mediaOptions && data.mediaOptions.length > 0) {
        mediaOptions.value = data.mediaOptions;
        if (!mediaOptions.value.includes(options.media)) {
          options.media = mediaOptions.value[0];
        }
      }
    } catch (e) {
      logger.error('Failed to load printer capabilities:', e);
    }
  };

  /**
   * 打印机变更时重新加载能力
   */
  const onPrinterChange = () => {
    loadPrinterCapabilities(options.printer);
  };

  // ==================== 日志相关函数 ====================

  /**
   * 加载日志文件列表
   */
  const loadLogs = async () => {
    logsLoading.value = true;
    try {
      const res = await fetch(`${API_BASE}/logs?content=true`);
      const data = await res.json();
      logFiles.value = data.files || [];
      if (selectedLogDate.value && data.todayLogs && data.todayLogs.length > 0) {
        logContent.value = data.todayLogs;
      } else if (data.todayLogs && data.todayLogs.length > 0) {
        logContent.value = data.todayLogs;
        selectedLogDate.value = new Date().toISOString().split('T')[0];
      } else {
        logContent.value = [];
      }
    } catch (e) {
      logger.error('Failed to load logs:', e);
    } finally {
      logsLoading.value = false;
    }
  };

  /**
   * 切换日志日期，加载/收起该日期的日志内容
   * @param {string} date - 日期字符串 (YYYY-MM-DD)
   */
  const toggleLog = async (date) => {
    if (selectedLogDate.value === date) {
      selectedLogDate.value = '';
      logContent.value = [];
      return;
    }
    selectedLogDate.value = date;
    logsLoading.value = true;
    try {
      const res = await fetch(`${API_BASE}/logs?date=${date}`);
      const data = await res.json();
      logContent.value = data.logs || [];
    } catch (e) {
      logger.error('Failed to load log:', e);
    } finally {
      logsLoading.value = false;
    }
  };

  /**
   * 清空指定日期的日志
   * @param {string} date - 日期字符串
   */
  const clearLog = async (date) => {
    if (!confirm(`确定要清空 ${date} 的日志吗？`)) return;
    try {
      const res = await fetch(`${API_BASE}/logs?date=${date}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showMessage(data.message, 'success');
        loadLogs();
        if (selectedLogDate.value === date) {
          logContent.value = [];
          selectedLogDate.value = '';
        }
      } else {
        showMessage(data.message || '清空失败', 'error');
      }
    } catch (e) {
      showMessage('清空失败', 'error');
    }
  };

  /**
   * 清空所有日志文件
   */
  const clearAllLogs = async () => {
    if (!confirm('确定要清空所有日志吗？')) return;
    try {
      const res = await fetch(`${API_BASE}/logs`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showMessage(data.message, 'success');
        logFiles.value = [];
        logContent.value = [];
        selectedLogDate.value = '';
      } else {
        showMessage(data.message || '清空失败', 'error');
      }
    } catch (e) {
      showMessage('清空失败', 'error');
    }
  };

  // ==================== 历史文件相关函数 ====================

  /**
   * 加载历史文件列表（从 uploads 目录）
   */
  const loadHistory = async () => {
    historyLoading.value = true;
    try {
      const res = await fetch(`${API_BASE}/history`);
      const data = await res.json();
      history.value = data.files || [];
    } catch (e) {
      logger.error('Failed to load history:', e);
    } finally {
      historyLoading.value = false;
    }
  };

  /**
   * 清空所有历史文件
   */
  const clearHistory = async () => {
    if (!confirm('确定要清空所有历史文件吗？')) return;
    try {
      const res = await fetch(`${API_BASE}/history`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showMessage(data.message, 'success');
        history.value = [];
      } else {
        showMessage(data.message || '清空失败', 'error');
      }
    } catch (e) {
      showMessage('清空失败', 'error');
    }
  };

  /**
   * 删除单个历史文件
   * @param {string} filename - 文件名
   */
  const deleteHistoryFile = async (filename) => {
    if (!confirm('确定要删除这个文件吗？')) return;
    try {
      const res = await fetch(`${API_BASE}/history/${encodeURIComponent(filename)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showMessage('已删除', 'success');
        loadHistory();
      } else {
        showMessage(data.error || '删除失败', 'error');
      }
    } catch (e) {
      showMessage('删除失败', 'error');
    }
  };

  // ==================== 文本文件创建相关函数 ====================

  /**
   * 打开发创建文件弹窗
   * 初始化文件名（当前日期时间）和默认设置
   */
  const openCreateFile = () => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const HH = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    createFile.name = `${yyyy}${MM}${dd}_${HH}${mm}`;
    createFile.paperSize = settings.defaultMedia;
    createFile.fontSize = settings.fontSize;
    createFile.fontFamily = settings.fontFamily;
    createFile.customWidth = settings.customWidth;
    createFile.customHeight = settings.customHeight;
    createFile.marginTop = settings.marginTop;
    createFile.marginRight = settings.marginRight;
    createFile.marginBottom = settings.marginBottom;
    createFile.marginLeft = settings.marginLeft;
    createFile.gridLines = settings.gridLines;
    createFile.addHeader = settings.addHeader;
    createFile.showMore = false;
    createFile.content = '';
    if (availableFonts.value.length === 0) {
      loadAvailableFonts();
    }
    showCreateFile.value = true;
  };

  /**
   * 创建文本文件
   * 发送内容到后端生成 PDF，保存到 uploads 目录
   */
  const createTextFile = async () => {
    const name = String(createFile.name || '').trim();
    const content = String(createFile.content || '').trim();
    if (!name) {
      showMessage('请输入文件名', 'error');
      return;
    }
    if (!content) {
      showMessage('请输入文件内容', 'error');
      return;
    }

    creatingFile.value = true;
    try {
      const formData = new FormData();
      formData.append('name', createFile.name);
      formData.append('paperSize', createFile.paperSize);
      formData.append('fontSize', createFile.fontSize);
      formData.append('fontFamily', createFile.fontFamily);
      formData.append('content', createFile.content);
      if (createFile.paperSize === 'Custom') {
        formData.append('customWidth', createFile.customWidth);
        formData.append('customHeight', createFile.customHeight);
      }
      formData.append('marginTop', createFile.marginTop || 0);
      formData.append('marginRight', createFile.marginRight || 0);
      formData.append('marginBottom', createFile.marginBottom || 0);
      formData.append('marginLeft', createFile.marginLeft || 0);
      formData.append('gridLines', createFile.gridLines ? 'true' : 'false');
      formData.append('addHeader', createFile.addHeader ? 'true' : 'false');

      const res = await fetch(`${API_BASE}/files`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      if (data.success) {
        showMessage('文件创建成功', 'success');
        showCreateFile.value = false;
        createFile.name = '';
        createFile.paperSize = settings.defaultMedia;
        createFile.fontSize = settings.fontSize;
        createFile.customWidth = settings.customWidth;
        createFile.customHeight = settings.customHeight;
        createFile.content = '';
        createFile.marginTop = settings.marginTop;
        createFile.marginRight = settings.marginRight;
        createFile.marginBottom = settings.marginBottom;
        createFile.marginLeft = settings.marginLeft;
        createFile.gridLines = settings.gridLines;
        createFile.addHeader = settings.addHeader;
        createFile.showMore = false;
        loadHistory();
      } else {
        showMessage(data.error || '创建失败', 'error');
      }
    } catch (e) {
      showMessage('创建失败', 'error');
    } finally {
      creatingFile.value = false;
    }
  };

  // ==================== 文件预览相关函数 ====================

  /**
   * 使用 pdfh5 打开 PDF 预览
   * @param {ArrayBuffer|Uint8Array} pdfData - PDF 的二进制数据
   * @param {Function} onClose - 关闭时的回调
   */
  const openPdfPreview = (pdfData, onClose) => {
    console.log('openPdfPreview 被调用, 数据长度:', pdfData.byteLength);
    const container = document.getElementById('pdfh5-viewer');
    if (!container) {
      showMessage('预览容器不存在', 'error');
      return;
    }

    // 检查 pdfh5 是否已加载
    if (typeof window.Pdfh5 === 'undefined') {
      showMessage('PDF预览库未加载', 'error');
      return;
    }

    // 显示预览容器
    container.style.display = 'block';
    container.style.height = '100vh';
    container.style.background = '#1a1a1a';

    // 清空容器
    container.innerHTML = '';

    // 添加关闭按钮（右下角，圆形）
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:10001;width:36px;height:36px;background:rgba(80,80,80,0.85);color:#fff;border:none;border-radius:50%;font-size:16px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;';
    closeBtn.onmouseover = () => { closeBtn.style.background = 'rgba(60,60,60,0.9)'; };
    closeBtn.onmouseout = () => { closeBtn.style.background = 'rgba(80,80,80,0.85)'; };
    container.appendChild(closeBtn);

    // 设置 PDF.js worker src 和 cMapUrl
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = './lib/pdfh5/js/pdf.worker.js';
      window.pdfjsLib.cMapUrl = './lib/pdfh5/cmaps/';
      window.pdfjsLib.cMapPacked = true;
    }

    // 创建 pdfh5 实例
    let pdfh5Instance;
    try {
      pdfh5Instance = new window.Pdfh5(container, {
        data: pdfData,
        zoomEnable: true,
        scrollEnable: true,
        progressiveLoading: true,
        
        loadingBar: true,
        pageNum: true,
        backTop: true
      });
    } catch (e) {
      console.error('创建 Pdfh5 实例失败:', e);
      showMessage(`预览初始化失败: ${e.message}`, 'error');
      return;
    }

    pdfh5Instance.on("ready", function () {
      console.log("PDF加载完成，总页数：" + this.totalNum);
    });

    pdfh5Instance.on("error", function (msg, time) {
      console.error("PDF加载错误:", msg, time);
      showMessage(`PDF加载失败: ${msg}`, 'error');
    });

    pdfh5Instance.on("success", function (msg, time) {
      console.log("PDF渲染成功:", msg, time);
    });

    const closePreview = () => {
      container.style.display = 'none';
      container.innerHTML = '';
      if (pdfh5Instance) {
        pdfh5Instance.destroy();
      }
      if (onClose) onClose();
    };

    closeBtn.addEventListener('click', closePreview);
  };

  /**
   * 打开图片预览
   * @param {Blob} blob - 图片的 Blob 数据
   */
  const openImagePreview = (blob) => {
    const container = document.getElementById('pdfh5-viewer');
    if (!container) {
      showMessage('预览容器不存在', 'error');
      return;
    }

    // 显示预览容器
    container.style.display = 'block';
    container.style.height = '100vh';
    container.style.background = '#1a1a1a';

    // 清空容器
    container.innerHTML = '';

    // 添加关闭按钮（右下角，圆形）
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:10001;width:36px;height:36px;background:rgba(80,80,80,0.85);color:#fff;border:none;border-radius:50%;font-size:16px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;';
    closeBtn.onmouseover = () => { closeBtn.style.background = 'rgba(60,60,60,0.9)'; };
    closeBtn.onmouseout = () => { closeBtn.style.background = 'rgba(80,80,80,0.85)'; };
    container.appendChild(closeBtn);

    // 创建图片元素
    const img = document.createElement('img');
    img.style.cssText = 'max-width:100%;max-height:100%;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);';
    const blobUrl = URL.createObjectURL(blob);
    img.src = blobUrl;

    img.onload = () => {
      console.log('图片加载成功:', img.naturalWidth, 'x', img.naturalHeight);
    };

    img.onerror = () => {
      showMessage('图片加载失败', 'error');
      URL.revokeObjectURL(blobUrl);
    };

    container.appendChild(img);

    const closePreview = () => {
      container.style.display = 'none';
      container.style.background = '#fff';
      container.innerHTML = '';
      URL.revokeObjectURL(blobUrl);
    };

    closeBtn.addEventListener('click', closePreview);
  };

  /**
   * 判断是否为图片文件
   * @param {string} filename - 文件名
   * @returns {boolean}
   */
  const isImageFile = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext);
  };

  /**
   * 预览历史文件
   * @param {Object} item - 历史文件项 { name, originalName, ... }
   */
  const viewHistoryFile = async (item) => {
    loading.value = true;
    try {
      const res = await fetch(`${API_BASE}/preview?filename=${encodeURIComponent(item.name)}`);
      if (!res.ok) {
        const errData = await res.json();
        showMessage(`预览失败${errData.error ? ': ' + errData.error : ''}`, 'error');
        loading.value = false;
        return;
      }

      const blob = await res.blob();

      // 如果是图片文件，直接用图片预览
      if (isImageFile(item.name)) {
        openImagePreview(blob);
        loading.value = false;
        return;
      }

      // 否则用 PDF 预览
      const arrayBuffer = await blob.arrayBuffer();
      openPdfPreview(arrayBuffer, null);
    } catch (e) {
      showMessage(`请求失败: ${e.message}`, 'error');
    } finally {
      loading.value = false;
    }
  };

  /**
   * 重新打印历史文件
   * 切换到打印标签页，并选中该历史文件
   * @param {Object} item - 历史文件项
   */
  const reprintFile = (item) => {
    activeTab.value = 'print';
    fileName.value = item.originalName;
    files.value = [{ path: item.name, name: item.originalName, isHistoryFile: true }];
    mediaSelected.value = false;
    autoSelectMedia({ path: item.name, isHistoryFile: true });
    showMessage('已选择文件：' + item.originalName, 'success');
  };

  // ==================== 多选相关函数 ====================

  /**
   * 切换多选模式
   */
  const toggleSelectMode = () => {
    selectMode.value = !selectMode.value;
    if (!selectMode.value) {
      selectedHistoryFiles.value = [];
    }
  };

  /**
   * 切换已选文件列表折叠状态
   */
  const toggleSelectedFilesCollapse = () => {
    selectedFilesCollapsed.value = !selectedFilesCollapsed.value;
  };

  /**
   * 切换历史文件选中状态
   * @param {Object} item - 历史文件项
   */
  const toggleHistoryFileSelection = (item) => {
    const idx = selectedHistoryFiles.value.indexOf(item.name);
    if (idx >= 0) {
      selectedHistoryFiles.value.splice(idx, 1);
    } else {
      selectedHistoryFiles.value.push(item.name);
    }
  };

  /**
   * 确认多选，切换到打印页面
   */
  const confirmMultiSelect = () => {
    if (selectedHistoryFiles.value.length === 0) {
      showMessage('请先选择文件', 'error');
      return;
    }
    const selectedItems = history.value.filter(item => selectedHistoryFiles.value.includes(item.name));
    activeTab.value = 'print';
    files.value = selectedItems.map(item => ({
      path: item.name,
      name: item.originalName,
      isHistoryFile: true
    }));
    fileName.value = selectedItems.length === 1
      ? selectedItems[0].originalName
      : `${selectedItems.length} 个文件`;
    selectedHistoryFiles.value = [];
    selectMode.value = false;
    if (selectedItems.length > 0) {
      mediaSelected.value = false;
      autoSelectMedia({ path: selectedItems[0].name, isHistoryFile: true });
    }
    showMessage(`已选择 ${selectedItems.length} 个文件`, 'success');
  };

  /**
   * 长图拼接 - 显示弹窗选择纸张
   */
  const stitchImages = () => {
    if (selectedHistoryFiles.value.length < 2) {
      showMessage('请至少选择2张图片', 'error');
      return;
    }

    // 检查是否为图片文件
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
    const selectedItems = history.value.filter(item => selectedHistoryFiles.value.includes(item.name));
    const nonImageFiles = selectedItems.filter(item => {
      const ext = item.name.split('.').pop().toLowerCase();
      return !imageExtensions.includes(ext);
    });

    if (nonImageFiles.length > 0) {
      showMessage('请只选择图片文件', 'error');
      return;
    }

    stitchPaperSize.value = settings.defaultMedia || 'A4';
    stitchMarginTop.value = settings.marginTop || 20;
    stitchMarginRight.value = settings.marginRight || 20;
    stitchMarginBottom.value = settings.marginBottom || 20;
    stitchMarginLeft.value = settings.marginLeft || 20;
    stitchFileName.value = getDefaultStitchFilename();
    showStitchModal.value = true;
  };

  /**
   * 执行长图拼接
   */
  const doStitchImages = async () => {
    showStitchModal.value = false;

    stitching.value = true;
    try {
      const res = await fetch(`${API_BASE}/stitch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: selectedHistoryFiles.value,
          fileName: stitchFileName.value,
          paperSize: stitchPaperSize.value,
          marginTop: stitchMarginTop.value,
          marginRight: stitchMarginRight.value,
          marginBottom: stitchMarginBottom.value,
          marginLeft: stitchMarginLeft.value
        })
      });
      const data = await res.json();

      if (data.success) {
        showMessage(`长图拼接成功 (${data.pages} 页)`, 'success');
        selectedHistoryFiles.value = [];
        selectMode.value = false;
        loadHistory();
      } else {
        showMessage(data.error || '拼接失败', 'error');
      }
    } catch (e) {
      showMessage('拼接失败', 'error');
    } finally {
      stitching.value = false;
    }
  };

  /**
   * 切换到历史文件标签页
   */
  const switchToHistory = () => {
    activeTab.value = 'history';
    loadHistory();
  };

  /**
   * 切换到日志标签页
   */
  const switchToLogs = () => {
    activeTab.value = 'logs';
    loadLogs();
  };

  // ==================== 文件上传与处理 ====================

  /**
   * 上传文件到服务器
   * @param {File[]} flist - File 对象数组
   * @returns {Promise<Array<{path: string, name: string}>>} 上传后的文件信息数组
   */
  const uploadFile = async (flist) => {
    const formData = new FormData();
    for (const f of flist) {
      formData.append('files', f);
    }
    const res = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || '上传失败');
    }
    return data.files.map(f => ({ path: f.filename, name: f.originalName }));
  };

  /**
   * 获取文件图标
   * @param {string} filename - 文件名
   * @returns {string} 文件对应的 emoji 图标
   */
  const getFileIcon = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) {
      return '🖼️';
    }
    if (ext === 'pdf') {
      return '📄';
    }
    if (['doc', 'docx'].includes(ext)) {
      return '📝';
    }
    return '📁';
  };

  /**
   * 触发文件选择
   */
  const triggerFileInput = () => {
    const input = document.querySelector('input[type="file"]');
    if (input) input.click();
  };

  /**
   * 自动检测文件尺寸并匹配纸张
   * @param {Object} fileData - 文件数据（File对象或历史文件路径）
   * @param {boolean} fileData.isHistoryFile - 是否为历史文件
   * @param {File} fileData - 文件对象（isHistoryFile=false时）
   * @param {string} fileData.path - 文件路径（isHistoryFile=true时）
   */
  const autoSelectMedia = async (fileData) => {
    try {
      const formData = new FormData();
      if (fileData.isHistoryFile) {
        formData.append('path', fileData.path);
      } else {
        formData.append('file', fileData);
      }

      let url, fetchOptions;
      if (fileData.isHistoryFile) {
        url = `${API_BASE}/file/dimensions?path=${encodeURIComponent(fileData.path)}`;
        fetchOptions = { method: 'GET' };
      } else {
        url = `${API_BASE}/file/dimensions`;
        fetchOptions = { method: 'POST', body: formData };
      }

      const res = await fetch(url, fetchOptions);
      if (res.ok) {
        const dims = await res.json();
        logger.debug('Detected dimensions:', dims);
        const matched = matchFileToMedia(dims.width, dims.height);
        logger.debug('Matched media:', matched);
        options.media = matched || settings.defaultMedia || 'A4';
      } else {
        logger.error('Failed to get dimensions, status:', res.status);
        options.media = settings.defaultMedia || 'A4';
      }
    } catch (e) {
      logger.error('Failed to detect file dimensions:', e);
      options.media = settings.defaultMedia || 'A4';
    }
  };

  /**
   * 文件选择变更处理
   * @param {Event} e - input change 事件
   */
  const onFileChange = async (e) => {
    const flist = Array.from(e.target.files);
    if (flist.length > 0) {
      try {
        const uploaded = await uploadFile(flist);
        files.value = uploaded.map(f => ({ ...f, isHistoryFile: true }));
        fileName.value = uploaded.length === 1 ? uploaded[0].name : `${uploaded.length} 个文件`;
        if (!mediaSelected.value && uploaded.length > 0) {
          autoSelectMedia(files.value[0]);
        }
        showMessage('文件已上传', 'success');
      } catch (err) {
        showMessage('上传失败: ' + err.message, 'error');
        files.value = [];
        fileName.value = '';
      }
    }
  };

  /**
   * 移除指定索引的文件
   * @param {number} index - 文件索引
   */
  const removeFile = (index) => {
    files.value.splice(index, 1);
    if (files.value.length === 0) {
      fileName.value = '';
      mediaSelected.value = false;
    } else {
      fileName.value = `${files.value.length} 个文件`;
    }
  };

  /**
   * 清除所有已选择的文件
   */
  const clearFiles = () => {
    files.value = [];
    fileName.value = '';
    mediaSelected.value = false;
  };

  // ==================== 字体相关函数 ====================

  /**
   * 加载可用的字体列表
   */
  const loadAvailableFonts = async () => {
    try {
      const res = await fetch(`${API_BASE}/fonts`);
      const data = await res.json();
      if (data.fonts && data.fonts.length > 0) {
        availableFonts.value = data.fonts;
      } else {
        availableFonts.value = [{ id: 'SourceHanSans', name: '思源黑体' }];
      }
    } catch (e) {
      availableFonts.value = [{ id: 'SourceHanSans', name: '思源黑体' }];
    }
  };

  /**
   * 打开发设置弹窗
   */
  const openSettings = () => {
    loadAvailableFonts();
    showSettings.value = true;
  };

  /**
   * 保存设置到服务器
   */
  const saveSettings = async () => {
    try {
      const res = await fetch(`${API_BASE}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          defaultMedia: settings.defaultMedia,
          customWidth: settings.customWidth,
          customHeight: settings.customHeight,
          fontFamily: settings.fontFamily,
          fontSize: settings.fontSize,
          marginTop: settings.marginTop,
          marginRight: settings.marginRight,
          marginBottom: settings.marginBottom,
          marginLeft: settings.marginLeft,
          gridLines: settings.gridLines,
          addHeader: settings.addHeader
        })
      });
      const data = await res.json();
      if (data.success) {
        showSettings.value = false;
        showMessage('设置已保存', 'success');
      } else {
        showMessage('保存失败', 'error');
      }
    } catch (e) {
      showMessage('保存失败', 'error');
    }
  };

  /**
   * 清空缓存目录
   */
  const clearCache = async () => {
    if (!confirm('确定要清空缓存文件吗？')) return;
    clearingCache.value = true;
    try {
      const res = await fetch(`${API_BASE}/cache`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showMessage(data.message, 'success');
      } else {
        showMessage(data.message || '清空失败', 'error');
      }
    } catch (e) {
      showMessage('清空失败', 'error');
    } finally {
      clearingCache.value = false;
    }
  };

  // ==================== 打印相关函数 ====================

  /**
   * 取消指定的打印任务
   * @param {string} jobId - 打印任务 ID
   */
  const cancelJobItem = async (jobId) => {
    if (!confirm('确定要取消这个打印任务吗？')) return;
    try {
      const res = await fetch(`${API_BASE}/jobs/${jobId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showMessage('已取消任务', 'success');
      } else {
        showMessage(data.error || '取消失败', 'error');
      }
    } catch (e) {
      showMessage('取消失败', 'error');
    }
  };

  /**
   * 打印文件
   */
  const printFile = async () => {
    if (!files.value || files.value.length === 0) {
      showMessage('请先选择文件', 'error');
      return;
    }
    if (!options.printer) {
      showMessage('请选择打印机', 'error');
      return;
    }

    loading.value = true;
    try {
      const formData = new FormData();
      if (files.value.length === 1) {
        formData.append('filePath', files.value[0].path);
        formData.append('originalName', files.value[0].name);
      } else {
        formData.append('filePath', files.value.map(f => f.path).join(','));
        formData.append('originalName', `${files.value.length} 个文件`);
      }
      formData.append('printer', options.printer);
      formData.append('copies', options.copies);
      formData.append('orientation', options.orientation);
      formData.append('pageSet', options.pageSet);
      if (options.pageSet === 'custom' && options.customPages) {
        formData.append('customPages', options.customPages);
      }
      formData.append('nup', options.nup);
      const scalingValue = options.scaling === 'custom' ? options.scalingPercent : options.scaling;
      formData.append('scaling', scalingValue);
      formData.append('media', options.media);
      if (options.media === 'Custom') {
        formData.append('mediaWidth', options.customWidth);
        formData.append('mediaHeight', options.customHeight);
      }
      if (options.addPageNumber) {
        formData.append('addPageNumber', 'true');
      }

      const res = await fetch(`${API_BASE}/print`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      if (data.success) {
        showMessage(`打印任务已提交 (Job ID: ${data.jobId})`, 'success');
      } else {
        showMessage(`打印失败${data.error ? ': ' + data.error : ''}`, 'error');
      }
    } catch (e) {
      showMessage(`请求失败: ${e.message}`, 'error');
    }
    loading.value = false;
  };

  /**
   * 预览打印效果
   */
  const previewPrint = async () => {
    if (!files.value || files.value.length === 0) {
      showMessage('请先选择文件', 'error');
      return;
    }

    previewLoading.value = true;

    const formData = new FormData();
    if (files.value.length === 1) {
      formData.append('filePath', files.value[0].path);
      formData.append('originalName', files.value[0].name);
    } else {
      formData.append('filePath', files.value.map(f => f.path).join(','));
      formData.append('originalName', `${files.value.length} 个文件`);
    }
    formData.append('printer', options.printer);
    formData.append('copies', options.copies);
    formData.append('orientation', options.orientation);
    formData.append('pageSet', options.pageSet);
    if (options.pageSet === 'custom' && options.customPages) {
      formData.append('customPages', options.customPages);
    }
    formData.append('nup', options.nup);
    const scalingValue = options.scaling === 'custom' ? options.scalingPercent : options.scaling;
    formData.append('scaling', scalingValue);
    formData.append('media', options.media);
    if (options.media === 'Custom') {
      formData.append('mediaWidth', options.customWidth);
      formData.append('mediaHeight', options.customHeight);
    }
    if (options.addPageNumber) {
      formData.append('addPageNumber', 'true');
    }

    try {
      const res = await fetch(`${API_BASE}/preview`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const errData = await res.json();
        showMessage(`预览失败${errData.error ? ': ' + errData.error : ''}`, 'error');
        previewLoading.value = false;
        return;
      }

      const blob = await res.blob();
      const arrayBuffer = await blob.arrayBuffer();

      openPdfPreview(arrayBuffer, null);

      previewLoading.value = false;
    } catch (e) {
      showMessage(`请求失败: ${e.message}`, 'error');
      previewLoading.value = false;
    }
  };

  // 返回所有状态和函数
  return {
    // 状态
    files,
    fileName,
    loading,
    previewLoading,
    mediaSelected,
    printers,
    printersLoading,
    activeTab,
    logFiles,
    logContent,
    selectedLogDate,
    logsLoading,
    history,
    historyLoading,
    selectMode,
    selectedHistoryFiles,
    selectedFilesCollapsed,
    clearingCache,
    creatingFile,
    showSettings,
    settings,
    availableFonts,
    showCreateFile,
    createFile,
    mediaOptions,
    options,
    // 函数
    loadPrinters,
    loadPrinterCapabilities,
    onPrinterChange,
    reconnectPrinterAndReload,
    loadLogs,
    toggleLog,
    clearLog,
    clearAllLogs,
    loadHistory,
    clearHistory,
    deleteHistoryFile,
    openCreateFile,
    createTextFile,
    viewHistoryFile,
    reprintFile,
    toggleSelectMode,
    toggleSelectedFilesCollapse,
    toggleHistoryFileSelection,
    confirmMultiSelect,
    stitchImages,
    doStitchImages,
    stitching,
    showStitchModal,
    stitchPaperSize,
    stitchFileName,
    stitchMarginTop,
    stitchMarginRight,
    stitchMarginBottom,
    stitchMarginLeft,
    switchToHistory,
    switchToLogs,
    uploadFile,
    getFileIcon,
    triggerFileInput,
    autoSelectMedia,
    onFileChange,
    removeFile,
    clearFiles,
    loadAvailableFonts,
    openSettings,
    saveSettings,
    clearCache,
    cancelJobItem,
    printFile,
    previewPrint,
    // 工具函数
    formatSize,
    formatTime
  };
}

// ES6 模块导出
export { createSharedState, formatTime, formatSize };
