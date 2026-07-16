import React from 'react';
import { useLauncherStore } from '../services/state/useLauncherStore';
import GlassPanel from '../components/GlassPanel';
import downloaderService from '../services/downloader/downloaderService';
import { Play, Download, XCircle, ArrowUpRight, Flame } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const { selectedVersion, downloadStatus, currentUser, setActiveTab } = useLauncherStore();

  const handleLaunchOrDownload = () => {
    if (!currentUser) {
      setActiveTab('auth');
      return;
    }
    
    if (selectedVersion) {
      downloaderService.startDownload(selectedVersion);
    }
  };

  const handleCancelDownload = () => {
    downloaderService.cancelDownload();
  };

  // Determine button text and action
  const getLaunchButton = () => {
    const { status, progress } = downloadStatus;

    if (status === 'downloading') {
      return (
        <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
          <button 
            className="glass-button primary" 
            style={{ flexGrow: 1, justifyContent: 'center' }} 
            disabled
            type="button"
          >
            <span className="spinner" style={{ marginRight: '8px' }}>⚡</span>
            Downloading ({progress}%)
          </button>
          <button 
            onClick={handleCancelDownload} 
            className="glass-button" 
            style={{ borderColor: '#ef4444', color: '#ef4444' }}
            title="Cancel"
            type="button"
          >
            <XCircle size={18} />
          </button>
        </div>
      );
    }

    if (status === 'checking' || status === 'extracting') {
      return (
        <button 
          className="glass-button primary" 
          style={{ width: '100%', justifyContent: 'center' }} 
          disabled
          type="button"
        >
          {status === 'checking' ? 'Validating manifest...' : 'Extracting files...'}
        </button>
      );
    }

    if (status === 'completed') {
      return (
        <button 
          onClick={handleLaunchOrDownload} 
          className="glass-button primary" 
          style={{ width: '100%', justifyContent: 'center', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', borderColor: '#10b981' }}
          type="button"
        >
          <Play size={18} fill="currentColor" />
          Launch Minecraft
        </button>
      );
    }

    return (
      <button 
        onClick={handleLaunchOrDownload} 
        className="glass-button primary" 
        style={{ width: '100%', justifyContent: 'center' }}
        type="button"
      >
        <Download size={18} />
        {selectedVersion ? `Install & Play ${selectedVersion}` : 'Select a Version'}
      </button>
    );
  };

  return (
    <div className="page-container" style={{ gap: '24px' }}>
      <div 
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr',
          gap: '24px',
          flexGrow: 1,
          alignItems: 'stretch'
        }}
      >
        {/* Main News and Banner */}
        <GlassPanel style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative', overflow: 'hidden' }}>
          {/* Glowing background circle */}
          <div style={{
            position: 'absolute',
            top: '-20%',
            right: '-10%',
            width: '300px',
            height: '300px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(56, 189, 248, 0.12) 0%, transparent 70%)',
            zIndex: 0
          }} />

          <div style={{ zIndex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-primary)', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
              <Flame size={14} fill="currentColor" /> Update Alert
            </div>
            <h1 style={{ fontSize: '32px', fontWeight: 800, lineHeight: 1.2, marginBottom: '16px', background: 'linear-gradient(to right, #fff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Aether Launcher Foundation scaffolded successfully.
            </h1>
            <p style={{ color: 'var(--text-secondary)', maxWidth: '480px', fontSize: '15px' }}>
              Welcome to the Aether Launcher client workspace. All key modules are configured under clean folders, ready for Tauri desktop integration.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '16px', zIndex: 1, marginTop: '24px' }}>
            <a 
              href="https://github.com" 
              target="_blank" 
              rel="noreferrer" 
              className="glass-button"
              style={{ fontSize: '13px' }}
            >
              Launcher GitHub <ArrowUpRight size={14} />
            </a>
          </div>
        </GlassPanel>

        {/* Launch Control Panel */}
        <GlassPanel style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>Launch Panel</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '20px' }}>
              Choose your profile and click Launch to start playing.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
              <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(2, 6, 23, 0.3)', border: '1px solid var(--glass-border)' }}>
                <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Selected Version</span>
                <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {selectedVersion || 'None'}
                </span>
              </div>

              <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(2, 6, 23, 0.3)', border: '1px solid var(--glass-border)' }}>
                <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>User Profile</span>
                <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {currentUser ? currentUser.username : 'Not Authenticated'}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {downloadStatus.status === 'downloading' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ color: 'var(--text-muted)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '140px' }}>
                    {downloadStatus.currentFile}
                  </span>
                  <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>
                    {downloadStatus.speed}
                  </span>
                </div>
                <div style={{ width: '100%', height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                  <div style={{ width: `${downloadStatus.progress}%`, height: '100%', background: 'linear-gradient(to right, var(--accent-secondary), var(--accent-primary))', transition: 'width 0.2s ease' }} />
                </div>
              </div>
            )}
            
            {getLaunchButton()}
          </div>
        </GlassPanel>
      </div>
    </div>
  );
};

export default Dashboard;
