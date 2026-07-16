import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Hammer, CheckCircle, AlertCircle, Loader2, ChevronDown } from 'lucide-react';
import { useLauncherStore } from '../services/state/useLauncherStore';

interface ForgeProgress {
  status: 'downloading' | 'installing' | 'completed' | 'failed';
  message: string;
  progress: number;
}

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export const ForgeInstaller: React.FC = () => {
  const { settings, selectedVersion } = useLauncherStore();
  const minecraftDir = settings.minecraftDir || '/home/aether/.minecraft';
  const versionId = selectedVersion || '1.8.9';

  const [recommendedVersion, setRecommendedVersion] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [progress, setProgress] = useState<ForgeProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Fetch recommended Forge version when expanded or version changes
  useEffect(() => {
    if (!isExpanded || !isTauri) return;

    const fetchVersion = async () => {
      setIsFetching(true);
      setRecommendedVersion(null);
      setError(null);
      try {
        const version = await invoke<string>('get_forge_version', { mcVersion: versionId });
        setRecommendedVersion(version);
      } catch (e: any) {
        setError(`${e}`);
      } finally {
        setIsFetching(false);
      }
    };

    fetchVersion();
  }, [isExpanded, versionId]);

  // Listen to forge-progress events from Rust
  useEffect(() => {
    if (!isTauri) return;
    const unlisten = listen<ForgeProgress>('forge-progress', event => {
      setProgress(event.payload);
      if (event.payload.status === 'completed' || event.payload.status === 'failed') {
        setIsInstalling(false);
        if (event.payload.status === 'failed') {
          setError(event.payload.message);
        }
      }
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  const handleInstallForge = async () => {
    if (!recommendedVersion || !isTauri) return;
    setIsInstalling(true);
    setProgress(null);
    setError(null);
    try {
      await invoke('install_forge', {
        mcVersion: versionId,
        forgeVersion: recommendedVersion,
        minecraftDir,
      });
    } catch (e: any) {
      setError(`${e}`);
      setIsInstalling(false);
    }
  };

  const isCompleted = progress?.status === 'completed';

  return (
    <div className="forge-installer-container">
      {/* Header toggle */}
      <button
        className="forge-installer-header"
        onClick={() => setIsExpanded(!isExpanded)}
        type="button"
      >
        <div className="forge-header-left">
          <Hammer size={15} className="forge-header-icon" />
          <span>Forge Modloader</span>
          {isCompleted && (
            <CheckCircle size={13} className="forge-installed-badge" />
          )}
        </div>
        <ChevronDown size={14} className={`forge-expand-arrow ${isExpanded ? 'open' : ''}`} />
      </button>

      {isExpanded && (
        <div className="forge-installer-body">
          {/* Version info */}
          <div className="forge-version-row">
            <span className="forge-version-label">Recommended version:</span>
            {isFetching ? (
              <Loader2 size={13} className="forge-spin" />
            ) : recommendedVersion ? (
              <span className="forge-version-value">{versionId}-{recommendedVersion}</span>
            ) : error ? (
              <span className="forge-no-support">Not available for this version</span>
            ) : null}
          </div>

          {/* Error */}
          {error && !isFetching && (
            <div className="forge-error-msg">
              <AlertCircle size={13} />
              <span>{error}</span>
            </div>
          )}

          {/* Progress bar */}
          {isInstalling && progress && (
            <div className="forge-progress-container">
              <div className="forge-progress-bar-track">
                <div
                  className="forge-progress-bar-fill"
                  style={{ width: `${Math.round(progress.progress * 100)}%` }}
                />
              </div>
              <span className="forge-progress-message">{progress.message}</span>
            </div>
          )}

          {/* Success */}
          {isCompleted && (
            <div className="forge-success-msg">
              <CheckCircle size={13} />
              <span>{progress?.message}</span>
            </div>
          )}

          {/* Install button */}
          {!isCompleted && (
            <button
              className="forge-install-btn"
              onClick={handleInstallForge}
              disabled={!recommendedVersion || isInstalling || isFetching}
              type="button"
            >
              {isInstalling ? (
                <>
                  <Loader2 size={14} className="forge-spin" />
                  <span>Installing...</span>
                </>
              ) : (
                <>
                  <Hammer size={14} />
                  <span>Install Forge {recommendedVersion ? `(${recommendedVersion})` : ''}</span>
                </>
              )}
            </button>
          )}

          {isCompleted && (
            <button
              className="forge-reinstall-btn"
              onClick={() => { setProgress(null); }}
              type="button"
            >
              Reinstall Forge
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ForgeInstaller;
