import React from 'react';
import { Minus, Square, X, Settings } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';

// Gracefully check if running inside Tauri environment
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const appWindow = isTauri ? getCurrentWindow() : null;

interface TitleBarProps {
  onSettingsClick?: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({ onSettingsClick }) => {
  const handleMinimize = async () => {
    if (appWindow) {
      await appWindow.minimize();
    } else {
      console.log('Mock Minimize: window.minimize()');
    }
  };

  const handleMaximize = async () => {
    if (appWindow) {
      await appWindow.toggleMaximize();
    } else {
      console.log('Mock Maximize: window.toggleMaximize()');
    }
  };

  const handleClose = async () => {
    if (appWindow) {
      await appWindow.close();
    } else {
      console.log('Mock Close: window.close()');
    }
  };

  const handleDrag = (e: React.MouseEvent) => {
    // Draggable only if left clicking on the titlebar area
    if (appWindow && e.buttons === 1) {
      appWindow.startDragging();
    }
  };

  return (
    <div className="window-titlebar" onMouseDown={handleDrag}>
      <div className="titlebar-left">
        <img src="/logo.png" alt="Aether" className="titlebar-logo" />
        <span className="titlebar-title">AETHER LAUNCHER</span>
      </div>
      <div className="titlebar-controls">
        {onSettingsClick && (
          <button 
            onClick={onSettingsClick} 
            className="titlebar-btn settings" 
            aria-label="Settings"
            type="button"
          >
            <Settings size={14} strokeWidth={1.5} />
          </button>
        )}
        <button 
          onClick={handleMinimize} 
          className="titlebar-btn" 
          aria-label="Minimize"
          type="button"
        >
          <Minus size={14} strokeWidth={1.5} />
        </button>
        <button 
          onClick={handleMaximize} 
          className="titlebar-btn" 
          aria-label="Maximize"
          type="button"
        >
          <Square size={12} strokeWidth={1.5} />
        </button>
        <button 
          onClick={handleClose} 
          className="titlebar-btn close" 
          aria-label="Close"
          type="button"
        >
          <X size={14} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
};

export default TitleBar;
