/**
 * Meow Printer - 移动端打印应用
 * 使用共享状态库 functions.js
 */
import { createSharedState } from './lib/functions.js';

const { createApp, ref, onMounted } = Vue;

const API_BASE = '/api';

// ==================== 消息提示 ====================
const message = ref('');
const messageType = ref('');

const showMessage = (text, type) => {
  message.value = text;
  messageType.value = type;
  if (type === 'success') {
    setTimeout(() => { message.value = ''; }, 3000);
  }
};

// ==================== 创建应用 ====================
createApp({
  setup() {
    // 使用共享状态
    const state = createSharedState(API_BASE, showMessage);

    // 本地状态
    const showMore = ref(false);
    const showPageSettings = ref(false);

    // 生命周期
    onMounted(() => {
      // 从服务器加载设置
      fetch(`${API_BASE}/settings`)
        .then(res => res.json())
        .then(data => Object.assign(state.settings, data))
        .catch(e => console.error('Failed to load settings:', e));
      // 并行加载打印机列表
      state.loadPrinters();
    });

    // 返回所有状态和函数
    return {
      // 本地状态
      message,
      messageType,
      showMore,
      showPageSettings,
      // 共享状态
      ...state
    };
  }
}).mount('#app');
