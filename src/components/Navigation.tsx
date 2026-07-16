import React from 'react';
import { useLauncherStore } from '../services/state/useLauncherStore';
import type { ActiveTab } from '../services/state/useLauncherStore';
import { Home, Library, Settings, LogOut, ShieldAlert, Cpu } from 'lucide-react';
import authService from '../services/auth/authService';

export const Navigation: React.FC = () => {
  const { activeTab, setActiveTab, currentUser } = useLauncherStore();

  const menuItems: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <Home size={18} /> },
    { id: 'library', label: 'Library', icon: <Library size={18} /> },
    { id: 'settings', label: 'Settings', icon: <Settings size={18} /> },
  ];

  const handleLogout = async () => {
    await authService.logout();
  };

  return (
    <aside className="app-sidebar glass-panel">
      <div>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <Cpu size={20} color="#040814" strokeWidth={2.5} />
          </div>
          <span className="sidebar-brand-name">Aether</span>
        </div>

        <nav className="sidebar-menu">
          {menuItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`glass-button sidebar-menu-item ${isActive ? 'active' : ''}`}
                type="button"
              >
                {item.icon}
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="sidebar-footer">
        {currentUser ? (
          <div 
            style={{
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              background: 'rgba(2, 6, 23, 0.4)',
              padding: '12px',
              borderRadius: '8px',
              border: '1px solid var(--glass-border)'
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                {currentUser.username}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                {currentUser.userType} Mode
              </span>
            </div>
            <button 
              onClick={handleLogout}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#ef4444',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: '6px',
                borderRadius: '4px',
                transition: 'var(--transition-fast)'
              }}
              title="Sign Out"
              type="button"
            >
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setActiveTab('auth')}
            className={`glass-button sidebar-menu-item ${activeTab === 'auth' ? 'active' : ''}`}
            style={{ width: '100%', justifyContent: 'center' }}
            type="button"
          >
            <ShieldAlert size={18} />
            Not Signed In
          </button>
        )}
      </div>
    </aside>
  );
};

export default Navigation;
