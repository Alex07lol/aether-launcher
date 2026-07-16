import React, { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Trash2, FolderOpen, Package, Upload, X } from 'lucide-react';
import { useLauncherStore } from '../services/state/useLauncherStore';

interface ModEntry {
  filename: string;
  size: number;
  path: string;
}

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const ModManager: React.FC = () => {
  const { settings, selectedVersion } = useLauncherStore();
  const minecraftDir = settings.minecraftDir || `${window?.location?.origin ? '' : '/home/aether'}/.minecraft`;
  const versionId = selectedVersion || '1.8.9';

  const [mods, setMods] = useState<ModEntry[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installingName, setInstallingName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const refreshMods = useCallback(async () => {
    if (!isTauri) return;
    try {
      const list = await invoke<ModEntry[]>('list_mods', {
        baseDir: minecraftDir,
        versionId,
      });
      setMods(list);
    } catch (e: any) {
      console.error('[ModManager] Failed to list mods:', e);
    }
  }, [minecraftDir, versionId]);

  useEffect(() => {
    if (isExpanded) refreshMods();
  }, [isExpanded, refreshMods, versionId]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || !isTauri) return;

    const jarFiles = Array.from(files).filter(f => f.name.endsWith('.jar'));
    if (jarFiles.length === 0) {
      setError('Only .jar mod files are supported.');
      setTimeout(() => setError(null), 3000);
      return;
    }

    setIsInstalling(true);
    setError(null);

    for (const file of jarFiles) {
      setInstallingName(file.name);
      try {
        const buffer = await file.arrayBuffer();
        const bytes = Array.from(new Uint8Array(buffer));
        await invoke('install_mod_bytes', {
          baseDir: minecraftDir,
          versionId,
          filename: file.name,
          bytes,
        });
      } catch (e: any) {
        setError(`Failed to install ${file.name}: ${e}`);
      }
    }

    setIsInstalling(false);
    setInstallingName('');
    await refreshMods();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    await handleFiles(e.dataTransfer.files);
  };

  const handleRemoveMod = async (filename: string) => {
    if (!isTauri) return;
    try {
      await invoke('remove_mod', { baseDir: minecraftDir, versionId, filename });
      await refreshMods();
    } catch (e: any) {
      setError(`Failed to remove mod: ${e}`);
    }
  };

  const handleOpenFolder = async () => {
    if (!isTauri) return;
    try {
      await invoke('open_mods_folder', { baseDir: minecraftDir, versionId });
    } catch (e: any) {
      console.error('Failed to open mods folder:', e);
    }
  };

  return (
    <div className="mod-manager-container">
      {/* Header toggle */}
      <button
        className="mod-manager-header"
        onClick={() => setIsExpanded(!isExpanded)}
        type="button"
      >
        <div className="mod-manager-header-left">
          <Package size={15} className="mod-header-icon" />
          <span>Mods</span>
          {mods.length > 0 && (
            <span className="mod-count-badge">{mods.length}</span>
          )}
        </div>
        <span className={`mod-expand-arrow ${isExpanded ? 'open' : ''}`}>▾</span>
      </button>

      {isExpanded && (
        <div className="mod-manager-body">
          {/* Drop Zone */}
          <div
            className={`mod-drop-zone ${isDragging ? 'dragging' : ''} ${isInstalling ? 'installing' : ''}`}
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragEnter={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            {isInstalling ? (
              <div className="drop-zone-installing">
                <div className="installing-spinner" />
                <span>Installing {installingName}...</span>
              </div>
            ) : (
              <>
                <Upload size={20} className="drop-icon" />
                <span className="drop-hint-text">
                  {isDragging ? 'Drop .jar files here!' : 'Drag & drop .jar mod files'}
                </span>
                <label className="drop-browse-label">
                  <input
                    type="file"
                    accept=".jar"
                    multiple
                    className="drop-file-input"
                    onChange={e => handleFiles(e.target.files)}
                  />
                  Browse Files
                </label>
              </>
            )}
          </div>

          {/* Error message */}
          {error && (
            <div className="mod-error-banner">
              <span>{error}</span>
              <button onClick={() => setError(null)} type="button"><X size={12} /></button>
            </div>
          )}

          {/* Installed Mods List */}
          {mods.length > 0 ? (
            <div className="mod-list">
              {mods.map(mod => (
                <div key={mod.filename} className="mod-list-item">
                  <div className="mod-list-item-info">
                    <span className="mod-filename">{mod.filename}</span>
                    <span className="mod-filesize">{formatBytes(mod.size)}</span>
                  </div>
                  <button
                    className="mod-remove-btn"
                    onClick={() => handleRemoveMod(mod.filename)}
                    title={`Remove ${mod.filename}`}
                    type="button"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="mod-empty-text">No mods installed for Minecraft {versionId}</p>
          )}

          {/* Footer actions */}
          <div className="mod-manager-footer">
            <button
              className="mod-folder-btn"
              onClick={handleOpenFolder}
              type="button"
            >
              <FolderOpen size={13} />
              Open Mods Folder
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ModManager;
