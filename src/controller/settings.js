/**
 * 设置控制器
 */
import fs from 'fs';
import { SETTINGS_FILE } from '../config/config.js';
import { DEFAULT_SETTINGS } from '../config/global.js';

/**
 * 读取设置
 */
export async function getSettings(req, res) {
  try {
    const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    const settings = JSON.parse(data);
    res.json(settings);
  } catch (error) {
    // 如果文件不存在，返回默认设置
    res.json(DEFAULT_SETTINGS);
  }
}

/**
 * 保存设置
 */
export async function saveSettings(req, res) {
  try {
    const settings = req.body;

    // 验证并合并设置
    const validSettings = {
      defaultMedia: settings.defaultMedia || 'A4',
      customWidth: Number(settings.customWidth) || 100,
      customHeight: Number(settings.customHeight) || 150,
      fontFamily: settings.fontFamily || 'SourceHanSans',
      fontSize: Number(settings.fontSize) || 12,
      marginTop: Number(settings.marginTop) || 20,
      marginRight: Number(settings.marginRight) || 20,
      marginBottom: Number(settings.marginBottom) || 20,
      marginLeft: Number(settings.marginLeft) || 20,
      gridLines: Boolean(settings.gridLines),
      addHeader: Boolean(settings.addHeader)
    };

    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(validSettings, null, 2), 'utf-8');
    res.json({ success: true });
  } catch (error) {
    console.error('保存设置失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}
