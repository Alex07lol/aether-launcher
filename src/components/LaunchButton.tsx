import React from 'react';
import { RocketIcon } from './Icons';
import { XCircle, Loader2, AlertCircle } from 'lucide-react';

interface LaunchButtonProps {
  status: 'idle' | 'checking' | 'downloading' | 'extracting' | 'verifying' | 'completed' | 'failed';
  progress: number;
  speed?: string;
  isGameRunning: boolean;
  onLaunchClick: () => void;
  onCancelDownload: () => void;
  hasUser: boolean;
}

export const LaunchButton: React.FC<LaunchButtonProps> = ({
  status,
  progress,
  speed,
  isGameRunning,
  onLaunchClick,
  onCancelDownload,
  hasUser,
}) => {
  // If game is running
  if (isGameRunning) {
    return (
      <button className="aether-launch-btn running" disabled type="button">
        <Loader2 className="spinner-icon animate-spin" size={20} />
        <span>GAME RUNNING...</span>
      </button>
    );
  }

  // If downloading
  if (status === 'downloading') {
    return (
      <div className="aether-launch-btn-container downloading">
        <div className="download-progress-fill" style={{ width: `${progress}%` }} />
        <div className="download-progress-content">
          <Loader2 className="spinner-icon animate-spin" size={16} />
          <span className="progress-info">DOWNLOADING {progress}% {speed ? `(${speed})` : ''}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCancelDownload();
            }}
            className="cancel-download-action-btn"
            title="Cancel Download"
            type="button"
          >
            <XCircle size={16} />
          </button>
        </div>
      </div>
    );
  }

  // If checking, extracting, verifying
  if (status === 'checking' || status === 'extracting' || status === 'verifying') {
    const labelMap = {
      checking: 'VERIFYING SIGNATURES...',
      extracting: 'SETTING UP CLIENT...',
      verifying: 'VERIFYING SHA-256...',
    };
    const label = labelMap[status] || 'PREPARING...';

    return (
      <button className="aether-launch-btn loading" disabled type="button">
        <Loader2 className="spinner-icon animate-spin" size={20} />
        <span>{label}</span>
      </button>
    );
  }

  // If failed
  if (status === 'failed') {
    return (
      <button 
        onClick={onLaunchClick} 
        className="aether-launch-btn failed"
        type="button"
      >
        <AlertCircle size={20} />
        <span>RETRY DOWNLOAD</span>
      </button>
    );
  }

  // Normal Ready / Launch state
  let btnText = 'SIGN IN & LAUNCH';
  if (hasUser) {
    if (status === 'completed') {
      btnText = 'LAUNCH MINECRAFT';
    } else {
      btnText = 'INSTALL & PLAY';
    }
  }

  return (
    <button 
      onClick={onLaunchClick} 
      className="aether-launch-btn ready"
      type="button"
    >
      <RocketIcon className="rocket-icon" />
      <span>{btnText}</span>
    </button>
  );
};

export default LaunchButton;
