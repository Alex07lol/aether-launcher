import React, { useEffect } from 'react';
import { useLauncherStore } from '../services/state/useLauncherStore';
import type { GameVersion } from '../services/state/useLauncherStore';
import versionManager from '../services/versions/versionManager';
import GlassPanel from '../components/GlassPanel';
import { Sparkles, Hammer, Layers, RefreshCw } from 'lucide-react';

export const Library: React.FC = () => {
  const { 
    availableVersions, 
    selectedVersion, 
    setSelectedVersion, 
    isLoadingVersions 
  } = useLauncherStore();

  useEffect(() => {
    // If versions aren't loaded, trigger loading
    if (availableVersions.length === 0) {
      versionManager.fetchVersions();
    }
  }, [availableVersions.length]);

  const handleRefresh = async () => {
    await versionManager.fetchVersions();
  };

  const getFilteredVersions = (type: GameVersion['type']) => {
    return availableVersions.filter(v => v.type === type);
  };

  const renderVersionCard = (v: GameVersion) => {
    const isSelected = selectedVersion === v.id;
    return (
      <div 
        key={v.id}
        onClick={() => setSelectedVersion(v.id)}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          borderRadius: '8px',
          background: isSelected ? 'rgba(56, 189, 248, 0.15)' : 'rgba(2, 6, 23, 0.25)',
          border: '1px solid',
          borderColor: isSelected ? 'var(--accent-primary)' : 'var(--glass-border)',
          cursor: 'pointer',
          transition: 'var(--transition-fast)'
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
            {v.name}
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Released {v.releaseTime}
          </span>
        </div>
        <span style={{ 
          fontSize: '10px', 
          padding: '2px 8px', 
          borderRadius: '10px', 
          background: isSelected ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)',
          color: isSelected ? '#040814' : 'var(--text-muted)',
          fontWeight: 700,
          textTransform: 'uppercase'
        }}>
          {v.type}
        </span>
      </div>
    );
  };

  return (
    <div className="page-container scroll-container" style={{ gap: '24px', flexGrow: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 800 }}>Version Library</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
            Select your preferred game version or mod loader.
          </p>
        </div>
        <button 
          onClick={handleRefresh}
          className="glass-button" 
          style={{ padding: '8px 12px' }}
          disabled={isLoadingVersions}
          type="button"
        >
          <RefreshCw size={14} className={isLoadingVersions ? 'spinner' : ''} />
          Refresh
        </button>
      </div>

      {isLoadingVersions ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexGrow: 1, height: '200px' }}>
          <span className="spinner" style={{ fontSize: '24px' }}>⚡</span>
          <span style={{ marginLeft: '12px', color: 'var(--text-secondary)' }}>Loading versions index...</span>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
          {/* Releases */}
          <GlassPanel style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '12px' }}>
              <Sparkles size={16} color="var(--accent-primary)" />
              <h3 style={{ fontSize: '16px', fontWeight: 700 }}>Releases</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {getFilteredVersions('release').map(renderVersionCard)}
            </div>
          </GlassPanel>

          {/* Modded Loader */}
          <GlassPanel style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '12px' }}>
              <Hammer size={16} color="var(--accent-primary)" />
              <h3 style={{ fontSize: '16px', fontWeight: 700 }}>Modded Loaders</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {getFilteredVersions('modded').map(renderVersionCard)}
            </div>
          </GlassPanel>

          {/* Snapshots */}
          <GlassPanel style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '12px' }}>
              <Layers size={16} color="var(--accent-primary)" />
              <h3 style={{ fontSize: '16px', fontWeight: 700 }}>Snapshots</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {getFilteredVersions('snapshot').map(renderVersionCard)}
            </div>
          </GlassPanel>
        </div>
      )}
    </div>
  );
};

export default Library;
