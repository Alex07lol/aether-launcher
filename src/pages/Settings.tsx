import React, { useEffect, useState } from 'react';
import { useLauncherStore } from '../services/state/useLauncherStore';
import type { LauncherSettings } from '../services/state/useLauncherStore';
import settingsService from '../services/settings/settingsService';
import GlassPanel from '../components/GlassPanel';
import { getRamPresets } from '../services/utils';
import { Save, Folder, Cpu, Tv, RefreshCcw } from 'lucide-react';
import updaterService from '../services/updater/updaterService';

export const Settings: React.FC = () => {
  const { settings, updateStatus } = useLauncherStore();
  const [localSettings, setLocalSettings] = useState<LauncherSettings>({ ...settings });
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    // Sync settings on mount
    setLocalSettings({ ...settings });
  }, [settings]);

  const handleChange = <K extends keyof LauncherSettings>(key: K, value: LauncherSettings[K]) => {
    setLocalSettings(prev => ({
      ...prev,
      [key]: value
    }));
    setIsSaved(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await settingsService.saveSettings(localSettings);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleCheckUpdate = async () => {
    await updaterService.checkForUpdates();
  };

  const handleInstallUpdate = async () => {
    await updaterService.installUpdate();
  };

  return (
    <form onSubmit={handleSave} className="page-container scroll-container" style={{ gap: '24px', flexGrow: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 800 }}>Launcher Settings</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
            Configure game directories, memory settings, and display sizes.
          </p>
        </div>
        <button 
          type="submit" 
          className="glass-button primary"
          style={{ padding: '8px 16px' }}
        >
          <Save size={14} />
          {isSaved ? 'Saved Settings!' : 'Save Options'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
        {/* Core & Java Config */}
        <GlassPanel style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '12px' }}>
            <Cpu size={16} color="var(--accent-primary)" />
            <h3 style={{ fontSize: '16px', fontWeight: 700 }}>Java & Memory Configuration</h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Maximum Allocated Memory</label>
            <select 
              value={localSettings.maxMemory}
              onChange={e => handleChange('maxMemory', parseInt(e.target.value))}
              className="glass-input"
            >
              {getRamPresets().map(preset => (
                <option key={preset.value} value={preset.value} style={{ background: '#0b1528' }}>
                  {preset.label}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Minecraft Directory</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input 
                type="text" 
                value={localSettings.minecraftDir}
                onChange={e => handleChange('minecraftDir', e.target.value)}
                className="glass-input"
                style={{ flexGrow: 1 }}
              />
              <button 
                type="button" 
                className="glass-button" 
                style={{ padding: '0 12px' }}
                title="Browse Directory"
              >
                <Folder size={16} />
              </button>
            </div>
          </div>
        </GlassPanel>

        {/* Display Config */}
        <GlassPanel style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '12px' }}>
            <Tv size={16} color="var(--accent-primary)" />
            <h3 style={{ fontSize: '16px', fontWeight: 700 }}>Display Preferences</h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Width (px)</label>
              <input 
                type="number" 
                value={localSettings.width}
                onChange={e => handleChange('width', parseInt(e.target.value))}
                className="glass-input"
                disabled={localSettings.fullScreen}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Height (px)</label>
              <input 
                type="number" 
                value={localSettings.height}
                onChange={e => handleChange('height', parseInt(e.target.value))}
                className="glass-input"
                disabled={localSettings.fullScreen}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
            <input 
              type="checkbox" 
              id="fullScreen" 
              checked={localSettings.fullScreen}
              onChange={e => handleChange('fullScreen', e.target.checked)}
              style={{
                width: '16px',
                height: '16px',
                accentColor: 'var(--accent-primary)',
                cursor: 'pointer'
              }}
            />
            <label htmlFor="fullScreen" style={{ fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              Launch in Fullscreen Mode
            </label>
          </div>
        </GlassPanel>
      </div>

      {/* Updater and Diagnostics */}
      <GlassPanel style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '12px' }}>
          <RefreshCcw size={16} color="var(--accent-primary)" />
          <h3 style={{ fontSize: '16px', fontWeight: 700 }}>Launcher Self-Update</h3>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 600 }}>Aether Launcher Core</span>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Current Version: v1.0.0 (Alpha Build)
            </p>
          </div>

          {updateStatus.status === 'idle' && (
            <button 
              onClick={handleCheckUpdate} 
              className="glass-button" 
              type="button"
            >
              Check for Updates
            </button>
          )}

          {updateStatus.status === 'checking' && (
            <button className="glass-button" disabled type="button">
              Checking...
            </button>
          )}

          {updateStatus.status === 'available' && (
            <button 
              onClick={handleInstallUpdate} 
              className="glass-button primary" 
              type="button"
            >
              Install Version {updateStatus.version}
            </button>
          )}

          {updateStatus.status === 'downloading' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '200px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Downloading update</span>
                <span>{updateStatus.progress}%</span>
              </div>
              <div style={{ width: '100%', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                <div style={{ width: `${updateStatus.progress}%`, height: '100%', background: 'var(--accent-primary)' }} />
              </div>
            </div>
          )}

          {updateStatus.status === 'ready' && (
            <button className="glass-button primary" style={{ background: '#10b981', borderColor: '#10b981' }} disabled type="button">
              Restart to Apply
            </button>
          )}
        </div>
      </GlassPanel>
    </form>
  );
};

export default Settings;
