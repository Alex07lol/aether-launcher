import React, { useState } from 'react';
import { useLauncherStore } from '../services/state/useLauncherStore';
import authService from '../services/auth/authService';
import GlassPanel from '../components/GlassPanel';
import { validateUsername } from '../services/utils';
import { ShieldCheck, User, Compass } from 'lucide-react';

export const Auth: React.FC = () => {
  const { isAuthenticating } = useLauncherStore();
  const [offlineName, setOfflineName] = useState('');
  const [error, setError] = useState<string | null>(null);

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
      await authService.loginMicrosoft();
    } catch (err: any) {
      setError(err?.message || 'Microsoft Sign In failed');
    }
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
          maxWidth: '420px', 
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
          Sign In with Microsoft
        </button>
      </GlassPanel>
    </div>
  );
};

export default Auth;
