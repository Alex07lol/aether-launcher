import { useLauncherStore } from '../state/useLauncherStore';
import type { LauncherSettings } from '../state/useLauncherStore';
import { invoke } from '@tauri-apps/api/core';

// Detect if running inside Tauri environment
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export interface ISettingsService {
  loadSettings(): Promise<LauncherSettings>;
  saveSettings(settings: LauncherSettings): Promise<void>;
}

class SettingsService implements ISettingsService {
  async loadSettings(): Promise<LauncherSettings> {
    const store = useLauncherStore.getState();
    
    // Simulate loading configuration from local storage or Tauri FS
    const localData = localStorage.getItem('aether_launcher_settings');
    
    if (localData) {
      try {
        const parsed = JSON.parse(localData) as LauncherSettings;
        store.updateSettings(parsed);
        return parsed;
      } catch (e) {
        console.error('Failed to parse settings:', e);
      }
    }
    
    const defaultDir = await this.getDefaultMinecraftDir();

    // Fallback/Default settings path (mock paths based on Platform)
    const defaults: LauncherSettings = {
      minecraftDir: defaultDir,
      javaPath: 'Detected Automatically (OpenJDK 17)',
      maxMemory: 4096,
      minMemory: 1024,
      width: 854,
      height: 480,
      fullScreen: false,
      theme: 'blue-glass',
      enableBetaVersions: false,
      language: 'en',
    };
    
    store.updateSettings(defaults);
    return defaults;
  }

  async saveSettings(settings: LauncherSettings): Promise<void> {
    const store = useLauncherStore.getState();
    store.updateSettings(settings);
    
    // Persist in localStorage (fallback) or Tauri config file in production
    localStorage.setItem('aether_launcher_settings', JSON.stringify(settings));
  }

  private async getDefaultMinecraftDir(): Promise<string> {
    if (isTauri) {
      try {
        return await invoke<string>('get_minecraft_dir');
      } catch (e) {
        console.error('Failed to auto-detect default Minecraft directory:', e);
      }
    }
    // Fallback/Browser path
    return '/home/aether/.aether-launcher';
  }
}

export const settingsService = new SettingsService();
export default settingsService;
