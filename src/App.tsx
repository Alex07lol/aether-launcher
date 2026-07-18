import React, { useEffect, useState, useRef } from 'react';
import { useLauncherStore } from './services/state/useLauncherStore';
import downloaderService from './services/downloader/downloaderService';
import versionManager from './services/versions/versionManager';
import authService from './services/auth/authService';
import settingsService from './services/settings/settingsService';
import TitleBar from './components/TitleBar';
import GlassCard from './components/GlassCard';
import Button from './components/Button';
import Input from './components/Input';
import Checkbox from './components/Checkbox';
import VersionSelector from './components/VersionSelector';
import LaunchButton from './components/LaunchButton';
import ModManager from './components/ModManager';
import { UserIcon } from './components/Icons';
import { listen } from '@tauri-apps/api/event';
import { invoke, isTauri as checkIsTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { AlertTriangle, Copy, Check, Terminal, X } from 'lucide-react';
import './App.css';

// Detect if running inside Tauri environment using the official API
const isTauri = checkIsTauri();

const translations = {
  en: {
    selectVersion: 'Select Version',
    microsoftLogin: 'Microsoft Login',
    offlineLogin: 'Offline Login',
    switchAccount: 'Switch Account',
    deleteAccount: 'Delete Account',
    rememberLogin: 'Remember Login',
    installPlay: 'INSTALL & PLAY',
    launchGame: 'LAUNCH MINECRAFT',
    gameRunning: 'GAME RUNNING...',
    retryDownload: 'RETRY DOWNLOAD',
    repair: 'Repair Installation',
    clearCache: 'Clear Cache',
    maxMemory: 'Max Memory Allocation',
    jvmArgs: 'JVM Launch Arguments',
    javaPath: 'Java Executable Path',
    theme: 'UI Theme Mode',
    language: 'System Language',
    launchForge: 'Launch Forge Modded',
    displayLogs: 'Display Output Logs',
    verifying: 'Verifying SHA-256 Signature...',
    connecting: 'Connecting...',
    settingUp: 'Setting up client folders...',
    onlineMode: 'Microsoft Online Mode',
    offlineMode: 'Offline Mode Active'
  },
  es: {
    selectVersion: 'Seleccionar Versión',
    microsoftLogin: 'Iniciar con Microsoft',
    offlineLogin: 'Inicio sin Conexión',
    switchAccount: 'Cambiar Cuenta',
    deleteAccount: 'Eliminar Cuenta',
    rememberLogin: 'Recordar Sesión',
    installPlay: 'INSTALAR Y JUGAR',
    launchGame: 'INICIAR MINECRAFT',
    gameRunning: 'JUEGO EN EJECUCIÓN...',
    retryDownload: 'REINTENTAR DESCARGA',
    repair: 'Reparar Instalación',
    clearCache: 'Limpiar Caché',
    maxMemory: 'Memoria RAM Máxima',
    jvmArgs: 'Argumentos de JVM',
    javaPath: 'Ruta del Ejecutable Java',
    theme: 'Tema de la Interfaz',
    language: 'Idioma del Sistema',
    launchForge: 'Iniciar con Forge',
    displayLogs: 'Mostrar Registro de Consola',
    verifying: 'Verificando firma SHA-256...',
    connecting: 'Conectando...',
    settingUp: 'Configurando directorios...',
    onlineMode: 'Modo Microsoft en Línea',
    offlineMode: 'Modo sin Conexión Activo'
  },
  de: {
    selectVersion: 'Version Auswählen',
    microsoftLogin: 'Microsoft Anmeldung',
    offlineLogin: 'Offline Anmeldung',
    switchAccount: 'Konto Wechseln',
    deleteAccount: 'Konto Löschen',
    rememberLogin: 'Anmeldung Speichern',
    installPlay: 'INSTALLIEREN & SPIELEN',
    launchGame: 'MINECRAFT STARTEN',
    gameRunning: 'SPIEL LÄUFT...',
    retryDownload: 'DOWNLOAD WIEDERHOLEN',
    repair: 'Installation Reparieren',
    clearCache: 'Cache Leeren',
    maxMemory: 'Maximale Speicherzuweisung',
    jvmArgs: 'JVM Startargumente',
    javaPath: 'Java Ausführungspfad',
    theme: 'UI-Thema Modus',
    language: 'Systemsprache',
    launchForge: 'Forge Modded Starten',
    displayLogs: 'Ausgabeprotokoll Anzeigen',
    verifying: 'SHA-256 Signatur Überprüfen...',
    connecting: 'Verbinden...',
    settingUp: 'Client-Ordner Einrichten...',
    onlineMode: 'Microsoft Online-Modus',
    offlineMode: 'Offline-Modus Aktiv'
  }
};

export const App: React.FC = () => {
  const { 
    currentUser, 
    selectedVersion, 
    setSelectedVersion, 
    downloadStatus,
    settings
  } = useLauncherStore();

  const currentLang = settings.language || 'en';
  const t = (key: keyof typeof translations['en']) => {
    return translations[currentLang][key] || translations['en'][key];
  };

  const [offlineName, setOfflineName] = useState('');
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [rememberLogin, setRememberLogin] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [customJvmArgs, setCustomJvmArgs] = useState('-XX:+UseG1GC -XX:+UnlockExperimentalVMOptions -XX:G1NewSizePercent=20 -XX:G1ReservePercent=20 -XX:MaxGCPauseMillis=50 -XX:G1HeapRegionSize=32M -XX:+AlwaysPreTouch -XX:+DisableExplicitGC');
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [isIntelCpuDetected, setIsIntelCpuDetected] = useState(false);
  const [systemRam, setSystemRam] = useState<{ total_mb: number; available_mb: number }>({ total_mb: 8192, available_mb: 4096 });
  const [gameLogs, setGameLogs] = useState<string[]>([]);
  const [isGameRunning, setIsGameRunning] = useState(false);
  const [showLogsConsole, setShowLogsConsole] = useState(false);
  const [crashData, setCrashData] = useState<{ exitCode: number; logs: string[] } | null>(null);
  const [copiedLogs, setCopiedLogs] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    versionManager.fetchVersions();
    settingsService.loadSettings();

    if (isTauri) {
      setUpdateStatus('Checking for updates...');
      invoke<string>('check_and_update_launcher').then((res) => {
        console.log('[Updater]', res);
        setUpdateStatus(null);
      }).catch((err) => {
        console.error('[Updater]', err);
        setUpdateStatus(null);
      });

      invoke<boolean>('detect_intel_cpu').then((detected) => {
        setIsIntelCpuDetected(detected);
      }).catch(console.error);

      invoke<{ total_mb: number; available_mb: number }>('get_system_ram').then((ramInfo) => {
        setSystemRam(ramInfo);
      }).catch(console.error);
    } else if (typeof navigator !== 'undefined' && (navigator as any).deviceMemory) {
      const devMemGb = (navigator as any).deviceMemory;
      setSystemRam({
        total_mb: devMemGb * 1024,
        available_mb: Math.round(devMemGb * 1024 * 0.6),
      });
    }

    // Load remembered user on mount
    const savedUser = localStorage.getItem('aether_remembered_user');
    if (savedUser) {
      try {
        const profile = JSON.parse(savedUser);
        if (profile.userType === 'microsoft') {
          // Attempt Microsoft token refresh securely via Rust backend
          authService.loginRefresh()
            .then(refreshedProfile => {
              useLauncherStore.getState().setCurrentUser(refreshedProfile);
              localStorage.setItem('aether_remembered_user', JSON.stringify(refreshedProfile));
            })
            .catch(err => {
              console.warn('[Auth] Failed to auto-refresh Microsoft credentials:', err);
              // Clean up state if token is expired/invalid
              localStorage.removeItem('aether_remembered_user');
              authService.logout();
            });
        } else {
          // Offline mode
          useLauncherStore.getState().setCurrentUser(profile);
        }
      } catch (e) {
        console.error('Failed to parse saved user:', e);
      }
    }

    if (isTauri) {
      const unlistenLog = listen<string>('game-log', (event) => {
        setGameLogs((prev) => [...prev.slice(-250), event.payload]);
      });
      const unlistenExit = listen<number>('game-exit', (event) => {
        setIsGameRunning(false);
        const exitCode = event.payload;
        const exitMsg = `[Launcher] Process exited with status code: ${exitCode}`;
        setGameLogs((prev) => {
          const updatedLogs = [...prev, exitMsg];
          if (exitCode !== 0) {
            setCrashData({ exitCode, logs: updatedLogs });
          }
          return updatedLogs;
        });
      });
      const unlistenUpdate = listen<{status: string; message: string}>('launcher-update-progress', (event) => {
        setUpdateStatus(event.payload.message);
      });

      return () => {
        unlistenLog.then(fn => fn());
        unlistenExit.then(fn => fn());
        unlistenUpdate.then(fn => fn());
      };
    }
  }, []);

  // Show the window after React has mounted and painted (prevents white flash on Linux)
  useEffect(() => {
    if (isTauri) {
      getCurrentWindow().show();
    }
  }, []);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [gameLogs]);

  const handleLaunchOrInstall = async () => {
    if (!currentUser) {
      handleOfflineLoginSubmit(new Event('submit') as any);
      return;
    }
    
    if (downloadStatus.status === 'completed') {
      setIsGameRunning(true);
      setGameLogs(['[Launcher] Preparing JVM sandbox and folders...']);

      try {
        let minecraftDir = settings.minecraftDir;
        if (isTauri && (!minecraftDir || minecraftDir.includes('/home/aether'))) {
          try {
            minecraftDir = await invoke<string>('get_minecraft_dir');
          } catch (e) {
            minecraftDir = '/home/aether/.aether-launcher';
          }
        }
        if (!minecraftDir) minecraftDir = '/home/aether/.aether-launcher';
        const minMemory = settings.minMemory || 1024;
        const maxMemory = settings.maxMemory || 4096;
        const combinedJvmArgs = `${settings.jvmArgs || ''} ${customJvmArgs || ''}`.trim();
        
        console.log(`[Launcher] Launching Minecraft: version=${selectedVersion}, RAM=${minMemory}-${maxMemory}MB, IntelPerf=${settings.enableIntelPerf}`);
        
        if (isTauri) {
          try {
            setGameLogs((prev) => [...prev, '[Launcher] Checking latest Alex07lol/aether release mod...']);
            const updateRes = await invoke<string>('check_and_update_aether_mod', {
              baseDir: minecraftDir,
              versionId: selectedVersion || '1.8.9',
            });
            setGameLogs((prev) => [...prev, `[Launcher] ${updateRes}`]);
          } catch (e) {
            console.warn('[Launcher] Mod update check notice:', e);
          }

          try {
            setGameLogs((prev) => [...prev, '[Launcher] Ensuring Forge is installed...']);
            const recommendedForge = await invoke<string>('get_forge_version', { mcVersion: selectedVersion || '1.8.9' });
            await invoke('install_forge', {
              mcVersion: selectedVersion || '1.8.9',
              forgeVersion: recommendedForge,
              minecraftDir: minecraftDir,
            });
            setGameLogs((prev) => [...prev, '[Launcher] Forge installation verified.']);
          } catch (e) {
            setGameLogs((prev) => [...prev, `[Launcher] Forge check failed: ${e}`]);
            setIsGameRunning(false);
            return;
          }
        }

        await invoke('launch_game', {
          versionId: selectedVersion,
          minecraftDir,
          javaPath: settings.javaPath || '',
          minMemory,
          maxMemory,
          customArgs: combinedJvmArgs,
          enableIntelPerf: settings.enableIntelPerf ?? true,
          width: settings.width || 854,
          height: settings.height || 480,
          fullScreen: settings.fullScreen || false,
          isForge: true,
          username: currentUser.username,
          uuid: currentUser.uuid,
          accessToken: currentUser.accessToken,
        });
      } catch (err: any) {
        console.error('Launch failed:', err);
        setIsGameRunning(false);
        const errorMsg = `[Launcher] Launch Error: ${err}`;
        setGameLogs((prev) => {
          const updatedLogs = [...prev, errorMsg];
          setCrashData({ exitCode: -1, logs: updatedLogs });
          return updatedLogs;
        });
      }
    } else {
      if (selectedVersion) {
        downloaderService.startDownload(selectedVersion);
      }
    }
  };

  const handleCopyFullLogs = async () => {
    if (!crashData || crashData.logs.length === 0) return;
    const fullLogsText = crashData.logs.join('\n');
    try {
      await navigator.clipboard.writeText(fullLogsText);
      setCopiedLogs(true);
      setTimeout(() => setCopiedLogs(false), 2500);
    } catch (e) {
      const textArea = document.createElement('textarea');
      textArea.value = fullLogsText;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopiedLogs(true);
      setTimeout(() => setCopiedLogs(false), 2500);
    }
  };

  const handleCancelDownload = () => {
    if (selectedVersion) {
      downloaderService.cancelDownload(selectedVersion);
    }
  };

  const handleRepairInstallation = () => {
    if (selectedVersion) {
      downloaderService.repairInstallation(selectedVersion);
    }
  };

  const handleClearCache = async () => {
    const confirmClear = window.confirm(
      settings.language === 'es'
        ? '¿Estás seguro de que deseas limpiar la caché? Esto eliminará todos los archivos del juego.'
        : settings.language === 'de'
        ? 'Sind Sie sicher, dass Sie den Cache leeren möchten? Dadurch werden alle Spieldateien gelöscht.'
        : 'Are you sure you want to clear the cache? This will delete all downloaded game files.'
    );
    if (!confirmClear) return;

    try {
      let minecraftDir = settings.minecraftDir;
      if (isTauri && (!minecraftDir || minecraftDir.includes('/home/aether'))) {
        try {
          minecraftDir = await invoke<string>('get_minecraft_dir');
        } catch (e) {
          minecraftDir = '/home/aether/.aether-launcher';
        }
      }
      if (!minecraftDir) minecraftDir = '/home/aether/.aether-launcher';
      if (isTauri) {
        await invoke('clear_minecraft_cache', { baseDir: minecraftDir });
      }
      
      // Clear localStorage
      localStorage.removeItem('aether_launcher_settings');
      localStorage.removeItem('aether_remembered_user');

      // Logout user
      await authService.logout();

      // Reset settings to defaults
      await settingsService.loadSettings();

      alert(
        settings.language === 'es'
          ? '¡Caché limpiada con éxito!'
          : settings.language === 'de'
          ? 'Cache erfolgreich geleert!'
          : 'Cache cleared successfully!'
      );
    } catch (e) {
      console.error('Clear cache failed:', e);
    }
  };

  const handleOfflineLoginSubmit = async (e: React.FormEvent) => {
    if (e && e.preventDefault) e.preventDefault();
    const finalName = offlineName.trim() || 'AetherPlayer';
    const profile = await authService.loginOffline(finalName);
    if (rememberLogin) {
      localStorage.setItem('aether_remembered_user', JSON.stringify(profile));
    }
  };

  const handleMicrosoftLogin = async () => {
    setAuthError(null);
    setIsAuthenticating(true);
    try {
      const profile = await authService.loginMicrosoft();
      if (rememberLogin) {
        localStorage.setItem('aether_remembered_user', JSON.stringify(profile));
      }
    } catch (e: any) {
      setAuthError(e?.message || 'Microsoft login failed. Please try again.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleLogout = () => {
    authService.logout();
    setOfflineName('');
  };

  const handleDeleteAccount = () => {
    authService.logout();
    setOfflineName('');
    localStorage.removeItem('aether_remembered_user');
  };

  const toggleSettings = () => {
    setIsSettingsOpen(!isSettingsOpen);
  };

  return (
    <div className={`app-container ${settings.theme || 'blue-glass'}`}>
      {/* Background container layout with blur, overlay and radial gradient */}
      <div className="aether-bg-container">
        <img src="/background.png" className="aether-bg-img" alt="Background" />
        <div className="aether-bg-overlay" />
        <div className="aether-bg-radial" />
      </div>

      {/* Draggable Title bar */}
      <TitleBar onSettingsClick={toggleSettings} />

      {/* Main Glass Panel */}
      <GlassCard className="launcher-main-card">
        
        {/* Logo Section */}
        <div className="launcher-logo-section">
          <img src="/logo.png" alt="Aether Logo" className="launcher-logo-img" />
          <h1 className="launcher-logo-title">AETHER</h1>
          <p className="launcher-logo-subtitle">NEXT-GENERATION GAMING ENVIRONMENT</p>
          {updateStatus && <div className="launcher-update-status" style={{color: '#0ff', fontSize: '12px', marginTop: '4px'}}>{updateStatus}</div>}
        </div>

        {/* Dynamic Authentication Section */}
        <div className="launcher-auth-section">
          {currentUser ? (
            <div className="user-profile-card">
              <div className="user-profile-header">
                <div className="user-avatar">
                  {currentUser.username.substring(0, 2).toUpperCase()}
                </div>
                <div className="user-details">
                  <span className="user-name">{currentUser.username}</span>
                  <span className="user-status-text">
                    {currentUser.userType === 'microsoft' ? t('onlineMode') : t('offlineMode')}
                  </span>
                </div>
              </div>
              <div className="user-controls-row">
                <Button variant="secondary" onClick={handleLogout}>
                  {t('switchAccount')}
                </Button>
                <Button variant="danger" onClick={handleDeleteAccount}>
                  {t('deleteAccount')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="auth-login-flow">
              {/* Microsoft Login Button */}
              <Button
                variant="microsoft"
                onClick={handleMicrosoftLogin}
                className="ms-login-btn"
                disabled={isAuthenticating}
              >
                {isAuthenticating ? 'Opening browser...' : 'Microsoft Login'}
              </Button>

              {/* Auth error feedback */}
              {authError && (
                <div className="auth-error-msg">
                  <span>⚠ {authError}</span>
                  <button onClick={() => setAuthError(null)} className="auth-error-dismiss" type="button">✕</button>
                </div>
              )}

              {isAuthenticating && (
                <p className="auth-loading-hint">A browser window has opened. Complete login there...</p>
              )}

              {/* OR Divider */}
              <div className="auth-divider">
                <span>OR</span>
              </div>

              {/* Offline Username Row */}
              <form onSubmit={handleOfflineLoginSubmit} className="offline-login-row">
                <Input
                  type="text"
                  placeholder={currentLang === 'es' ? 'Nombre de usuario' : currentLang === 'de' ? 'Benutzername' : 'Enter Username (3-16 chars)'}
                  value={offlineName}
                  onChange={e => {
                    const val = e.target.value;
                    if (/^[a-zA-Z0-9_]*$/.test(val)) {
                      setOfflineName(val);
                    }
                  }}
                  maxLength={16}
                  icon={<UserIcon size={14} />}
                />
                <Button 
                  type="submit" 
                  variant="secondary" 
                  disabled={offlineName.length < 3 || offlineName.length > 16}
                  className="offline-submit-btn"
                >
                  {t('offlineLogin')}
                </Button>
              </form>

              {/* Remember Login Checkbox */}
              <div className="remember-checkbox-wrapper">
                <Checkbox
                  label={t('rememberLogin')}
                  checked={rememberLogin}
                  onChange={e => setRememberLogin(e.target.checked)}
                />
              </div>
            </div>
          )}
        </div>

        {/* Version Selector Section */}
        <div className="launcher-version-section">
          <VersionSelector
            selectedVersion={selectedVersion || '1.8.9'}
            isSelectorOpen={isSelectorOpen}
            onTriggerClick={() => setIsSelectorOpen(!isSelectorOpen)}
            onVersionSelect={(ver) => {
              setSelectedVersion(ver);
              setIsSelectorOpen(false);
            }}
            disabled={isGameRunning}
          />
        </div>

        {/* Mod Manager - drag-and-drop, collapsible */}
        <div className="launcher-addon-section">
          <ModManager />
        </div>

        {/* Settings Drawer Panel */}
        {isSettingsOpen && (
          <div className="launcher-settings-drawer">
            {/* Memory Slider */}
            <div className="settings-field">
              <div className="settings-field-header">
                <span className="settings-label">{t('maxMemory')}</span>
                <span className="settings-value">
                  {((settings.maxMemory || 4096) / 1024).toFixed(1)} GB / {((systemRam.total_mb || 8192) / 1024).toFixed(1)} GB Total (Avail: {((systemRam.available_mb || 4096) / 1024).toFixed(1)} GB)
                </span>
              </div>
              <input 
                type="range" 
                min={1024} 
                max={Math.max(1024, (systemRam.total_mb || 8192) - 512)} 
                step={256}
                value={Math.min(settings.maxMemory || 4096, systemRam.total_mb || 8192)}
                onChange={(e) => {
                  settingsService.saveSettings({
                    ...settings,
                    maxMemory: parseInt(e.target.value, 10),
                  });
                }}
                className="memory-slider"
              />
            </div>

            {/* Java Path */}
            <div className="settings-field">
              <span className="settings-label">{t('javaPath')}</span>
              <input 
                type="text" 
                value={settings.javaPath || ''}
                onChange={(e) => {
                  settingsService.saveSettings({
                    ...settings,
                    javaPath: e.target.value,
                  });
                }}
                className="jvm-args-input"
                placeholder="Detected Automatically"
              />
            </div>

            {/* Theme Selector */}
            <div className="settings-field">
              <span className="settings-label">{t('theme')}</span>
              <select
                value={settings.theme || 'blue-glass'}
                onChange={(e) => {
                  settingsService.saveSettings({
                    ...settings,
                    theme: e.target.value as any,
                  });
                }}
                className="settings-select-dropdown"
              >
                <option value="blue-glass">Blue Glass</option>
                <option value="carbon-black">Carbon Black</option>
                <option value="nebula-purple">Nebula Purple</option>
              </select>
            </div>

            {/* Language Selector */}
            <div className="settings-field">
              <span className="settings-label">{t('language')}</span>
              <select
                value={settings.language || 'en'}
                onChange={(e) => {
                  settingsService.saveSettings({
                    ...settings,
                    language: e.target.value as any,
                  });
                }}
                className="settings-select-dropdown"
              >
                <option value="en">English</option>
                <option value="es">Español</option>
                <option value="de">Deutsch</option>
              </select>
            </div>

            {/* JVM arguments */}
            <div className="settings-field">
              <span className="settings-label">{t('jvmArgs')}</span>
              <input 
                type="text" 
                value={customJvmArgs}
                onChange={e => setCustomJvmArgs(e.target.value)}
                className="jvm-args-input"
                placeholder="Custom Java launch parameters"
              />
            </div>

            <div className="settings-options-row">
              <label className="checkbox-option">
                <input 
                  type="checkbox" 
                  checked={settings.enableIntelPerf ?? true}
                  onChange={e => {
                    settingsService.saveSettings({
                      ...settings,
                      enableIntelPerf: e.target.checked,
                    });
                  }}
                  className="option-checkbox"
                />
                <span>Intel CPU Performance {isIntelCpuDetected ? '(Intel CPU Detected)' : ''}</span>
              </label>

              <label className="checkbox-option">
                <input 
                  type="checkbox" 
                  checked={showLogsConsole}
                  onChange={e => setShowLogsConsole(e.target.checked)}
                  className="option-checkbox"
                />
                <span>{t('displayLogs')}</span>
              </label>
            </div>

            {/* Repair & Clear Cache Buttons */}
            <div className="settings-actions-grid">
              <button
                onClick={handleRepairInstallation}
                className="settings-action-btn repair"
                type="button"
              >
                {t('repair')}
              </button>
              <button
                onClick={handleClearCache}
                className="settings-action-btn clear"
                type="button"
              >
                {t('clearCache')}
              </button>
            </div>
          </div>
        )}

        {/* Primary Action Section */}
        <div className="launcher-action-section">
          <LaunchButton
            status={downloadStatus.status}
            progress={downloadStatus.progress}
            speed={downloadStatus.speed}
            isGameRunning={isGameRunning}
            onLaunchClick={handleLaunchOrInstall}
            onCancelDownload={handleCancelDownload}
            hasUser={!!currentUser}
          />
        </div>

        {/* Console Log output drawer */}
        {showLogsConsole && (
          <div className="game-console-drawer">
            <div className="console-header">
              <span className="console-title">Minecraft Console Output</span>
              <button 
                onClick={() => setShowLogsConsole(false)} 
                className="console-close-btn"
                aria-label="Hide Console"
                type="button"
              >
                Hide Console
              </button>
            </div>
            <div className="console-output scroll-container">
              {gameLogs.map((log, index) => (
                <div key={index} className="console-line">
                  {log}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        )}

      </GlassCard>

      {/* Minimal subtle version tag at footer */}
      <span className="launcher-version-tag">Aether v1.0.0-Beta</span>

      {/* Game Crash Modal Display */}
      {crashData && (
        <div className="crash-modal-overlay">
          <div className="crash-modal-card">
            <div className="crash-modal-header">
              <div className="crash-title-group">
                <AlertTriangle className="crash-alert-icon" size={20} />
                <h3>Minecraft Crashed</h3>
                <span className="crash-exit-code-badge">Exit Code: {crashData.exitCode}</span>
              </div>
              <button
                onClick={() => setCrashData(null)}
                className="crash-close-btn"
                type="button"
                aria-label="Close crash report"
              >
                <X size={16} />
              </button>
            </div>

            <p className="crash-modal-desc">
              The game session terminated unexpectedly (exit code {crashData.exitCode}). Here is a snippet of recent log activity:
            </p>

            <div className="crash-log-preview-box">
              <div className="crash-log-preview-header">Log Preview (Recent Session Activity)</div>
              <div className="crash-log-preview-content scroll-container">
                {crashData.logs.slice(-12).map((logLine, idx) => (
                  <div key={idx} className="crash-log-line">
                    {logLine}
                  </div>
                ))}
              </div>
            </div>

            <div className="crash-modal-footer">
              <button
                onClick={handleCopyFullLogs}
                className={`crash-copy-btn ${copiedLogs ? 'copied' : ''}`}
                type="button"
              >
                {copiedLogs ? <Check size={15} /> : <Copy size={15} />}
                <span>{copiedLogs ? 'Copied Full Logs!' : 'Copy Entire Session Logs'}</span>
              </button>

              <div className="crash-footer-right">
                <button
                  onClick={() => {
                    setShowLogsConsole(true);
                    setCrashData(null);
                  }}
                  className="crash-console-btn"
                  type="button"
                >
                  <Terminal size={14} />
                  <span>View Full Console</span>
                </button>

                <button
                  onClick={() => setCrashData(null)}
                  className="crash-dismiss-btn"
                  type="button"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
