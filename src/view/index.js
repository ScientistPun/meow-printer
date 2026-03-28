const { createApp, ref, reactive, onMounted } = Vue;
import { formatTime, formatSize, matchFileToMedia } from '/utils/common.js';
import { DEFAULT_MEDIA_OPTIONS } from '/config/global.js';

createApp({
  setup() {
    // ==================== 文件相关状态 ====================
    const file = ref(null);           // 当前选择的文件（File对象或历史文件信息）
    const fileName = ref('');         // 显示的文件名
    const loading = ref(false);       // 打印按钮 loading
    const previewLoading = ref(false); // 预览按钮 loading
    const message = ref('');          // 提示消息
    const messageType = ref('');       // 提示消息类型（success/error）
    const showMore = ref(false);       // 是否显示更多选项
    const mediaSelected = ref(false);  // 用户是否手动选择了纸张尺寸

    // ==================== 打印机相关状态 ====================
    const printers = ref([]);          // 打印机列表
    const printersLoading = ref(true); // 打印机加载状态
    const activeTab = ref('print');    // 当前活动标签页

    // ==================== 日志相关状态 ====================
    const logFiles = ref([]);          // 日志文件列表
    const logContent = ref([]);        // 日志内容
    const selectedLogDate = ref('');   // 选择的日志日期
    const logsLoading = ref(false);    // 日志加载状态

    // ==================== 历史文件相关状态 ====================
    const history = ref([]);           // 历史文件列表
    const historyLoading = ref(false); // 历史文件加载状态

    // ==================== 其他状态 ====================
    const clearingCache = ref(false);  // 清空缓存按钮状态
    const creatingFile = ref(false);    // 创建文本文件按钮状态

    // ==================== 设置相关状态 ====================
    const showSettings = ref(false);    // 是否显示设置弹窗
    const availableFonts = ref([]);     // 可用字体列表

    /**
     * 用户设置（持久化到 localStorage）
     * - defaultMedia: 默认纸张尺寸
     * - customWidth/customHeight: 自定义纸张尺寸
     * - fontFamily/fontSize: 字体设置
     * - marginTop/Right/Bottom/Left: 边距设置
     * - gridLines: 是否显示网格线
     * - addHeader: 是否添加页眉（No.、Date）
     */
    const settings = reactive({
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
    });

    // ==================== 文本文件创建相关状态 ====================
    const showCreateFile = ref(false);  // 是否显示创建文件弹窗
    const createFile = reactive({
      name: '',             // 文件名
      paperSize: 'A4',      // 纸张尺寸
      fontSize: 12,         // 字体大小
      fontFamily: 'SourceHanSans', // 字体
      customWidth: 100,     // 自定义宽度
      customHeight: 150,    // 自定义高度
      content: '',          // 文件内容
      marginTop: 20,        // 上边距
      marginRight: 20,      // 右边距
      marginBottom: 20,     // 下边距
      marginLeft: 20,       // 左边距
      gridLines: false,     // 网格线
      addHeader: false,     // 页眉
      showMore: false       // 显示更多选项
    });

    // 支持的纸张尺寸选项
    const mediaOptions = ref([...DEFAULT_MEDIA_OPTIONS]);

    // ==================== 打印选项状态 ====================
    /**
     * 打印选项
     * - printer: 选择的打印机
     * - copies: 打印份数
     * - orientation: 方向（portrait/landscape）
     * - pageSet: 页面设置（all/custom/even/odd）
     * - customPages: 自定义页面范围
     * - nup: 每张纸打印的页数
     * - scaling: 缩放模式（fit/percentage）
     * - scalingPercent: 缩放百分比
     * - media: 纸张尺寸
     * - customWidth/customHeight: 自定义尺寸
     */
    const options = reactive({
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
    });

    const API_BASE = '/api';

    // ==================== 消息提示 ====================
    const showMessage = (text, type) => {
      message.value = text;
      messageType.value = type;
      if (type === 'success') {
        setTimeout(() => { message.value = ''; }, 3000);
      }
    };

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
        console.error('Failed to load printers:', e);
      } finally {
        printersLoading.value = false;
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
        console.error('Failed to load printer capabilities:', e);
      }
    };

    // 打印机变更时重新加载能力
    const onPrinterChange = () => {
      loadPrinterCapabilities(options.printer);
    };

    // ==================== 日志相关函数 ====================

    /**
     * 加载日志文件列表
     * @see loadLogs 获取今天日志内容
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
        console.error('Failed to load logs:', e);
      } finally {
        logsLoading.value = false;
      }
    };

    /**
     * 选择日志日期，加载该日期的日志内容
     * @param {string} date - 日期字符串 (YYYY-MM-DD)
     */
    const selectLog = async (date) => {
      selectedLogDate.value = date;
      logsLoading.value = true;
      try {
        const res = await fetch(`${API_BASE}/logs?date=${date}`);
        const data = await res.json();
        logContent.value = data.logs || [];
      } catch (e) {
        console.error('Failed to load log:', e);
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
        console.error('Failed to load history:', e);
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
      createFile.paperSize = settings.defaultMedia || 'A4';
      createFile.fontSize = settings.fontSize || 12;
      createFile.fontFamily = settings.fontFamily || 'SourceHanSans';
      createFile.customWidth = settings.customWidth || 100;
      createFile.customHeight = settings.customHeight || 150;
      createFile.marginTop = settings.marginTop ?? 20;
      createFile.marginRight = settings.marginRight ?? 20;
      createFile.marginBottom = settings.marginBottom ?? 20;
      createFile.marginLeft = settings.marginLeft ?? 20;
      createFile.gridLines = settings.gridLines ?? false;
      createFile.addHeader = settings.addHeader ?? false;
      createFile.showMore = false;
      createFile.content = '';
      // 加载字体列表
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
          createFile.paperSize = 'A4';
          createFile.fontSize = 12;
          createFile.customWidth = 100;
          createFile.customHeight = 150;
          createFile.content = '';
          createFile.marginTop = 20;
          createFile.marginRight = 20;
          createFile.marginBottom = 20;
          createFile.marginLeft = 20;
          createFile.gridLines = false;
          createFile.addHeader = false;
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
          showMessage(`❌ 预览失败${errData.error ? ': ' + errData.error : ''}`, 'error');
          loading.value = false;
          return;
        }

        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);

        // 创建全屏预览容器
        const container = document.createElement('div');
        container.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;background:#000;';

        // 创建关闭按钮
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕ 关闭';
        closeBtn.style.cssText = 'position:absolute;bottom:20px;left:20px;z-index:10000;padding:10px 20px;background:rgba(0,0,0,0.7);color:#fff;border:none;border-radius:8px;font-size:16px;cursor:pointer;';

        // 创建 iframe
        const iframe = document.createElement('iframe');
        iframe.src = blobUrl;
        iframe.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border:none;';
        iframe.setAttribute('allowfullscreen', 'true');

        container.appendChild(iframe);
        container.appendChild(closeBtn);
        document.body.appendChild(container);

        // 关闭预览
        const closePreview = () => {
          if (container.parentNode) {
            document.body.removeChild(container);
          }
          URL.revokeObjectURL(blobUrl);
        };

        closeBtn.addEventListener('click', closePreview);
        container.addEventListener('click', (e) => {
          if (e.target === container) closePreview();
        });
      } catch (e) {
        showMessage(`❌ 请求失败: ${e.message}`, 'error');
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
      file.value = { path: item.name, name: item.originalName, isHistoryFile: true };
      mediaSelected.value = false;
      autoSelectMedia({ path: item.name, isHistoryFile: true });
      showMessage('已选择文件：' + item.originalName, 'success');
    };

    const switchToHistory = () => {
      activeTab.value = 'history';
      loadHistory();
    };

    const switchToLogs = () => {
      activeTab.value = 'logs';
      loadLogs();
    };

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
          loadJobs();
        } else {
          showMessage(data.error || '取消失败', 'error');
        }
      } catch (e) {
        showMessage('取消失败', 'error');
      }
    };

    // ==================== 文件上传与处理 ====================

    /**
     * 自动检测文件尺寸并匹配纸张
     * 调用 /api/file/dimensions 接口获取文件尺寸
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
          console.log('Detected dimensions:', dims);
          const matched = matchFileToMedia(dims.width, dims.height);
          console.log('Matched media:', matched);
          options.media = matched || settings.defaultMedia || 'A4';
        } else {
          console.error('Failed to get dimensions, status:', res.status);
          options.media = settings.defaultMedia || 'A4';
        }
      } catch (e) {
        console.error('Failed to detect file dimensions:', e);
        options.media = settings.defaultMedia || 'A4';
      }
    };

    /**
     * 文件选择变更处理
     * @param {Event} e - input change 事件
     *
     * 上传逻辑：
     * 1. 用户通过 <input type="file"> 选择文件
     * 2. 文件立即上传到后端，保存到 uploads 目录
     * 3. 后端返回保存的文件名，前端设置为已上传文件
     * 4. 自动检测文件尺寸并匹配纸张（仅当用户未手动选择时）
     * 5. 后续预览/打印操作使用已保存的文件
     */

    /**
     * 上传文件到服务器
     * @param {File} f - File 对象
     * @returns {Promise<{path: string, name: string}>} 上传后的文件信息
     */
    const uploadFile = async (f) => {
      const formData = new FormData();
      formData.append('file', f);
      const res = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || '上传失败');
      }
      return { path: data.filename, name: data.originalName };
    };

    /**
     * 选择文件后上传并选中
     */
    const onFileChange = async (e) => {
      const f = e.target.files[0];
      if (f) {
        try {
          // 上传文件到服务器
          const uploaded = await uploadFile(f);
          // 选中已上传的文件（作为历史文件处理）
          file.value = { path: uploaded.path, name: uploaded.name, isHistoryFile: true };
          fileName.value = uploaded.name;
          // 自动检测文件尺寸并匹配纸张
          if (!mediaSelected.value) {
            autoSelectMedia(file.value);
          }
          showMessage('文件已上传', 'success');
        } catch (err) {
          showMessage('上传失败: ' + err.message, 'error');
          file.value = null;
          fileName.value = '';
        }
      }
    };

    /**
     * 移除当前选择的文件
     */
    const removeFile = () => {
      file.value = null;
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
     * 保存设置到 localStorage
     */
    const saveSettings = () => {
      localStorage.setItem('printerSettings', JSON.stringify({
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
      }));
      showSettings.value = false;
      showMessage('设置已保存', 'success');
    };

    /**
     * 清空缓存目录（/app/public/cache/）
     * 缓存目录存放预览和打印处理后的临时 PDF 文件
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
     * 打印文件
     *
     * 打印文件（文件已通过上传 API 保存到 uploads 目录）
     */
    const printFile = async () => {
      if (!file.value) {
        showMessage('请先选择文件', 'error');
        return;
      }
      if (!options.printer) {
        showMessage('请选择打印机', 'error');
        return;
      }

      loading.value = true;
      message.value = '';

      const formData = new FormData();
      // 文件已上传，传递文件路径
      formData.append('filePath', file.value.path);
      formData.append('originalName', file.value.name);
      formData.append('printer', options.printer);
      formData.append('copies', options.copies);
      formData.append('orientation', options.orientation);
      formData.append('pageSet', options.pageSet);
      if (options.pageSet === 'custom' && options.customPages) {
        formData.append('customPages', options.customPages);
      }
      formData.append('nup', options.nup);
      // 当选择"自定义"时，使用滑块的百分比值作为 scaling
      const scalingValue = options.scaling === 'custom' ? options.scalingPercent : options.scaling;
      formData.append('scaling', scalingValue);
      // 传递纸张尺寸参数
      formData.append('media', options.media);
      if (options.media === 'Custom') {
        formData.append('mediaWidth', options.customWidth);
        formData.append('mediaHeight', options.customHeight);
      }

      try {
        const res = await fetch(`${API_BASE}/print`, {
          method: 'POST',
          body: formData
        });
        const data = await res.json();

        if (data.success) {
          showMessage(`✅ 打印任务已提交 (Job ID: ${data.jobId})`, 'success');
        } else {
          showMessage(`❌ 打印失败${data.error ? ': ' + data.error : ''}`, 'error');
        }
      } catch (e) {
        showMessage(`❌ 请求失败: ${e.message}`, 'error');
      } finally {
        loading.value = false;
      }
    };

    /**
     * 预览打印效果
     *
     * 预览逻辑：
     * 1. 新上传文件：通过 FormData 上传到 /api/preview
     * 2. 后端处理文件，生成预览 PDF 保存在 cache 目录
     * 3. 返回预览 PDF 流，前端通过 iframe 显示
     * 4. 上传的原始文件保留在 uploads 目录
     *
     * 预览完成后不自动清理 cache 文件，由用户手动清空
     */
    const previewPrint = async () => {
      if (!file.value) {
        showMessage('请先选择文件', 'error');
        return;
      }

      previewLoading.value = true;

      const formData = new FormData();
      // 文件已上传，传递文件路径
      formData.append('filePath', file.value.path);
      formData.append('originalName', file.value.name);
      formData.append('printer', options.printer);
      formData.append('copies', options.copies);
      formData.append('orientation', options.orientation);
      formData.append('pageSet', options.pageSet);
      if (options.pageSet === 'custom' && options.customPages) {
        formData.append('customPages', options.customPages);
      }
      formData.append('nup', options.nup);
      // 当选择"自定义"时，使用滑块的百分比值作为 scaling
      const scalingValue = options.scaling === 'custom' ? options.scalingPercent : options.scaling;
      formData.append('scaling', scalingValue);
      // 传递纸张尺寸参数
      formData.append('media', options.media);
      if (options.media === 'Custom') {
        formData.append('mediaWidth', options.customWidth);
        formData.append('mediaHeight', options.customHeight);
      }

      try {
        const res = await fetch(`${API_BASE}/preview`, {
          method: 'POST',
          body: formData
        });

        if (!res.ok) {
          const errData = await res.json();
          showMessage(`❌ 预览失败${errData.error ? ': ' + errData.error : ''}`, 'error');
          previewLoading.value = false;
          return;
        }

        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);

        const container = document.createElement('div');
        container.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:998;background:#000;';

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕ 关闭';
        closeBtn.style.cssText = 'position:absolute;bottom:20px;left:20px;z-index:999;padding:10px 20px;background:rgba(0,0,0,0.7);color:#fff;border:none;border-radius:8px;font-size:16px;cursor:pointer;';

        const iframe = document.createElement('iframe');
        iframe.src = blobUrl;
        iframe.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border:none;';
        iframe.setAttribute('allowfullscreen', 'true');

        container.appendChild(iframe);
        container.appendChild(closeBtn);
        document.body.appendChild(container);

        const closePreview = () => {
          if (container.parentNode) {
            document.body.removeChild(container);
          }
          URL.revokeObjectURL(blobUrl);
        };

        closeBtn.addEventListener('click', closePreview);
        container.addEventListener('click', (e) => {
          if (e.target === container) closePreview();
        });

        previewLoading.value = false;
      } catch (e) {
        showMessage(`❌ 请求失败: ${e.message}`, 'error');
        previewLoading.value = false;
      }
    };

    // 页面加载时获取打印机列表
    onMounted(() => {
      // 从 localStorage 加载保存的设置
      const saved = localStorage.getItem('printerSettings');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          Object.assign(settings, parsed);
        } catch (e) {
          console.error('Failed to load settings:', e);
        }
      }
      loadPrinters();
    });

    return {
      API_BASE,
      fileName,
      loading,
      previewLoading,
      message,
      messageType,
      showMore,
      mediaSelected,
      printers,
      printersLoading,
      options,
      activeTab,
      logFiles,
      logContent,
      selectedLogDate,
      logsLoading,
      history,
      historyLoading,
      clearingCache,
      creatingFile,
      showSettings,
      settings,
      availableFonts,
      openSettings,
      saveSettings,
      showCreateFile,
      createFile,
      mediaOptions,
      onFileChange,
      removeFile,
      printFile,
      previewPrint,
      switchToLogs,
      switchToHistory,
      selectLog,
      clearLog,
      clearAllLogs,
      clearHistory,
      deleteHistoryFile,
      openCreateFile,
      createTextFile,
      viewHistoryFile,
      reprintFile,
      formatSize,
      formatTime,
      onPrinterChange,
      clearCache,
      cancelJobItem
    };
  }
}).mount('#app');
