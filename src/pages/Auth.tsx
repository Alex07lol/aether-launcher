import React, { useState, useEffect } from 'react';
import { useLauncherStore } from '../services/state/useLauncherStore';
import authService, { type DeviceCodeInfo } from '../services/auth/authService';
import GlassPanel from '../components/GlassPanel';
import { validateUsername } from '../services/utils';
import { ShieldCheck, User, Compass, Copy, Check, ExternalLink, Loader2, X } from 'lucide-react';
import { listen } from '@tauri-apps/api/event';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export const Auth: React.FC = () => {
  const { isAuthenticating } = useLauncherStore();
  const [offlineName, setOfflineName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deviceCodeInfo, setDeviceCodeInfo] = useState<DeviceCodeInfo | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  // Listen to device-code-info event from Rust backend
  useEffect(() => {
    if (!isTauri) return;
    const unlisten = listen<DeviceCodeInfo>('device-code-info', (event) => {
      setDeviceCodeInfo(event.payload);
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  const handleOfflineLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = offlineName.trim();
    if (!validateUsername(trimmedName)) {
      setError('Username must be 3-16 alphanumeric characters (underscores allowed)');
      return;
    }

    try {
      await authService.loginOffline(trimmedName);
    } catch (err: any) {
      setError(err?.message || 'Failed to authenticate');
    }
  };

  const handleMicrosoftLogin = async () => {
    setError(null);
    try {
      const info = await authService.initiateDeviceCode();
      setDeviceCodeInfo(info);

      // Open link in external browser if available
      if (typeof window !== 'undefined' && info.verification_uri) {
        window.open(info.verification_uri, '_blank');
      }

      // Start polling for user authorization
      await authService.pollDeviceCode(info.device_code, info.interval);
      setDeviceCodeInfo(null);
    } catch (err: any) {
      setError(err?.message || 'Microsoft Sign In failed');
      setDeviceCodeInfo(null);
    }
  };

  const handleCopyCode = () => {
    if (!deviceCodeInfo?.user_code) return;
    navigator.clipboard.writeText(deviceCodeInfo.user_code);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div 
      className="page-container" 
      style={{ 
        justifyContent: 'center', 
        alignItems: 'center',
        flexGrow: 1
      }}
    >
      <GlassPanel 
        glow 
        style={{ 
          width: '100%', 
          maxWidth: '440px', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '24px'
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 800 }}>Account Manager</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
            Choose an authentication method to launch.
          </p>
        </div>

        {error && (
          <div 
            style={{
              padding: '12px',
              borderRadius: '8px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#fca5a5',
              fontSize: '12px'
            }}
          >
            {error}
          </div>
        )}

        {/* Device Code Modal / Box */}
        {deviceCodeInfo ? (
          <div 
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              padding: '18px',
              borderRadius: '12px',
              background: 'rgba(56, 189, 248, 0.05)',
              border: '1px solid rgba(56, 189, 248, 0.25)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#38bdf8' }}>
                Microsoft Device Sign In
              </span>
              <button 
                onClick={() => setDeviceCodeInfo(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                type="button"
              >
                <X size={16} />
              </button>
            </div>

            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              1. Go to <strong style={{ color: '#ffffff' }}>microsoft.com/devicelogin</strong><br />
              2. Enter code:
            </p>

            <div 
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderRadius: '8px',
                background: 'rgba(0, 0, 0, 0.4)',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}
            >
              <span style={{ fontSize: '22px', fontWeight: 900, letterSpacing: '3px', color: '#38bdf8' }}>
                {deviceCodeInfo.user_code}
              </span>
              <button 
                onClick={handleCopyCode}
                className="glass-button"
                style={{ padding: '6px 12px', fontSize: '12px' }}
                type="button"
              >
                {isCopied ? <Check size={14} style={{ color: '#34d399' }} /> : <Copy size={14} />}
                <span>{isCopied ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>

            <a
              href={deviceCodeInfo.verification_uri}
              target="_blank"
              rel="noreferrer"
              className="glass-button primary"
              style={{ justifyContent: 'center', gap: '8px', marginTop: '4px' }}
            >
              <ExternalLink size={15} />
              <span>Open microsoft.com/devicelogin</span>
            </a>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '12px', marginTop: '6px' }}>
              <Loader2 size={14} className="forge-spin" />
              <span>Waiting for Microsoft authorization...</span>
            </div>
          </div>
        ) : (
          <>
            {/* Offline Login Form */}
            <form onSubmit={handleOfflineLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Offline Username</label>
                <div style={{ position: 'relative' }}>
                  <input 
                    type="text" 
                    placeholder="Enter nickname"
                    value={offlineName}
                    onChange={e => setOfflineName(e.target.value)}
                    disabled={isAuthenticating}
                    className="glass-input"
                    style={{ paddingLeft: '40px' }}
                  />
                  <User 
                    size={16} 
                    style={{ 
                      position: 'absolute', 
                      left: '14px', 
                      top: '50%', 
                      transform: 'translateY(-50%)', 
                      color: 'var(--text-muted)' 
                    }} 
                  />
                </div>
              </div>

              <button 
                type="submit" 
                className="glass-button primary" 
                style={{ justifyContent: 'center' }}
                disabled={isAuthenticating}
              >
                <ShieldCheck size={16} />
                {isAuthenticating ? 'Signing In...' : 'Log In Offline'}
              </button>
            </form>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-muted)', fontSize: '12px' }}>
              <div style={{ flexGrow: 1, height: '1px', background: 'var(--glass-border)' }} />
              <span>OR</span>
              <div style={{ flexGrow: 1, height: '1px', background: 'var(--glass-border)' }} />
            </div>

            {/* Microsoft Secure Login */}
            <button 
              onClick={handleMicrosoftLogin}
              className="glass-button" 
              style={{ 
                justifyContent: 'center',
                borderColor: '#38bdf8',
                color: '#38bdf8',
                background: 'rgba(56, 189, 248, 0.05)'
              }}
              disabled={isAuthenticating}
              type="button"
            >
              <Compass size={16} />
              {isAuthenticating ? 'Waiting for Sign In...' : 'Sign In with Microsoft'}
            </button>
          </>
        )}
      </GlassPanel>
    </div>
  );
};

export default Auth;
