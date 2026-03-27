const { createApp, ref, reactive, onMounted } = Vue;

createApp({
  setup() {
    const file = ref(null);
    const fileName = ref('');
    const loading = ref(false);
    const previewLoading = ref(false); // 预览专用 loading
    const message = ref('');
    const messageType = ref('');
    const showMore = ref(false);
    const mediaSelected = ref(false); // 标记用户是否主动选择了纸张尺寸
    const printers = ref([]);
    const printersLoading = ref(true);
    const activeTab = ref('print');

    const logFiles = ref([]);
    const logContent = ref([]);
    const selectedLogDate = ref('');
    const logsLoading = ref(false);

    const history = ref([]);
    const historyLoading = ref(false);


    const clearingCache = ref(false);
    const creatingFile = ref(false);

    const showSettings = ref(false);
    const availableFonts = ref([]);
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

    const showCreateFile = ref(false);
    const createFile = reactive({
      name: '',
      paperSize: 'A4',
      fontSize: 12,
      fontFamily: 'SourceHanSans',
      customWidth: 100,
      customHeight: 150,
      content: '',
      marginTop: 20,
      marginRight: 20,
      marginBottom: 20,
      marginLeft: 20,
      gridLines: false,
      addHeader: false,
      showMore: false
    });

    const mediaOptions = ref(['A4', 'A5', 'A6', 'B5', 'Letter', 'Legal', '4x6']);

    // 从 localStorage 加载设置
    const loadSettings = () => {
      const saved = localStorage.getItem('printerSettings');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          settings.defaultMedia = parsed.defaultMedia || 'A4';
          settings.customWidth = parsed.customWidth || 100;
          settings.customHeight = parsed.customHeight || 150;
          settings.fontFamily = parsed.fontFamily || 'SourceHanSans';
          settings.fontSize = parsed.fontSize || 12;
          settings.marginTop = parsed.marginTop ?? 20;
          settings.marginRight = parsed.marginRight ?? 20;
          settings.marginBottom = parsed.marginBottom ?? 20;
          settings.marginLeft = parsed.marginLeft ?? 20;
          settings.gridLines = parsed.gridLines ?? false;
          settings.addHeader = parsed.addHeader ?? false;
        } catch (e) {}
      }
    };
    loadSettings();

    const options = reactive({
      printer: '',
      copies: 1,
      orientation: 'portrait',
      pageSet: 'all',
      customPages: '',
      nup: 1,
      scaling: 'fit',
      media: settings.defaultMedia || 'A4',
      customWidth: 100,
      customHeight: 150,
    });

    const API_BASE = '/api';

    const showMessage = (text, type) => {
      message.value = text;
      messageType.value = type;
      if (type === 'success') {
        setTimeout(() => { message.value = ''; }, 3000);
      }
    };

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

    const onPrinterChange = () => {
      loadPrinterCapabilities(options.printer);
    };

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

    const formatTime = (isoString) => {
      const d = new Date(isoString);
      const date = d.toLocaleDateString('zh-CN');
      const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      return `${date} ${time}`;
    };

    const formatSize = (bytes) => {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    };

    const switchToLogs = () => {
      activeTab.value = 'logs';
      loadLogs();
    };

    // 匹配文件尺寸到标准纸张尺寸
    const matchFileToMedia = (width, height) => {
      const tolerance = 10; // 容差 10mm
      const mediaSizes = {
        'A4': { width: 210, height: 297 },
        'A5': { width: 148, height: 210 },
        'A6': { width: 105, height: 148 },
        'B5': { width: 176, height: 250 },
        'Letter': { width: 215.9, height: 279.4 },
        'Legal': { width: 215.9, height: 355.6 },
        '4x6': { width: 101.6, height: 152.4 }
      };

      for (const media of Object.keys(mediaSizes)) {
        const size = mediaSizes[media];

        const matchNormal = Math.abs(width - size.width) <= tolerance &&
                            Math.abs(height - size.height) <= tolerance;
        const matchRotated = Math.abs(width - size.height) <= tolerance &&
                             Math.abs(height - size.width) <= tolerance;

        if (matchNormal || matchRotated) {
          return media;
        }
      }
      return settings.defaultMedia || 'A4'; // 无匹配使用设置的默认值
    };

    // 选择文件后自动检测尺寸并匹配纸张
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
          options.media = matched;
        } else {
          console.error('Failed to get dimensions, status:', res.status);
          options.media = settings.defaultMedia || 'A4';
        }
      } catch (e) {
        console.error('Failed to detect file dimensions:', e);
        options.media = settings.defaultMedia || 'A4';
      }
    };

    const onFileChange = (e) => {
      const f = e.target.files[0];
      if (f) {
        file.value = f;
        fileName.value = f.name;
        // 只有在用户没有手动选择纸张尺寸时才自动检测
        if (!mediaSelected.value) {
          autoSelectMedia(f);
        }
      }
    };

    const removeFile = () => {
      file.value = null;
      fileName.value = '';
      mediaSelected.value = false;
    };

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

    const openSettings = () => {
      loadAvailableFonts();
      showSettings.value = true;
    };

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
      if (file.value.isHistoryFile) {
        formData.append('filePath', file.value.path);
        formData.append('originalName', file.value.name);
      } else {
        formData.append('file', file.value);
      }
      formData.append('printer', options.printer);
      formData.append('copies', options.copies);
      formData.append('orientation', options.orientation);
      formData.append('pageSet', options.pageSet);
      if (options.pageSet === 'custom' && options.customPages) {
        formData.append('customPages', options.customPages);
      }
      formData.append('nup', options.nup);
      formData.append('scaling', options.scaling);
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

    const previewPrint = async () => {
      if (!file.value) {
        showMessage('请先选择文件', 'error');
        return;
      }

      previewLoading.value = true;

      const formData = new FormData();
      if (file.value.isHistoryFile) {
        formData.append('filePath', file.value.path);
        formData.append('originalName', file.value.name);
      } else {
        formData.append('file', file.value);
      }
      formData.append('printer', options.printer);
      formData.append('copies', options.copies);
      formData.append('orientation', options.orientation);
      formData.append('pageSet', options.pageSet);
      if (options.pageSet === 'custom' && options.customPages) {
        formData.append('customPages', options.customPages);
      }
      formData.append('nup', options.nup);
      formData.append('scaling', options.scaling);
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

    onMounted(() => {
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
