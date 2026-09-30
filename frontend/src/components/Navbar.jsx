import React, { useState, useEffect } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Pill,
  History,
  Settings,
  Activity,
  PlusCircle,
  LogOut,
  User,
  RefreshCw,
  Phone
} from 'lucide-react';
import { api } from '../services/api';
import { syncService } from '../services/syncService';

export default function Navbar({ onNotify }) {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [connStatus, setConnStatus] = useState({
    isOnline: syncService.getIsOnline(),
    syncState: syncService.getSyncState(),
    pendingCount: 0,
    label: syncService.getIsOnline() ? 'Synced' : 'Offline'
  });

  useEffect(() => {
    let mounted = true;
    api.getCurrentUser().then((u) => {
      if (mounted) setCurrentUser(u);
    });

    const unsubscribeAuth = api.onAuthStateChange((u) => {
      if (mounted) setCurrentUser(u);
    });

    const unsubscribeSync = syncService.subscribeStatus((status) => {
      if (mounted) setConnStatus(status);
    });

    return () => {
      mounted = false;
      unsubscribeAuth();
      unsubscribeSync();
    };
  }, []);

  const handleLogout = async () => {
    setShowUserMenu(false);
    await api.logout();
    if (onNotify) {
      onNotify({
        title: 'Logged out successfully',
        desc: 'Your session has been securely closed.',
        type: 'info'
      });
    }
    navigate('/login', { replace: true });
  };

  const handleManualSync = () => {
    if (connStatus.isOnline) {
      syncService.triggerSync(false);
      if (onNotify) {
        onNotify({
          title: 'Synchronizing Database',
          desc: 'Syncing local changes with cloud database...',
          type: 'info'
        });
      }
    }
  };

  return (
    <header className="navbar">
      <div className="navbar-container">
        {/* Brand */}
        <Link to="/dashboard" className="navbar-brand">
          <div className="brand-icon-box">
            <Activity size={24} strokeWidth={2.6} />
          </div>
          <div className="brand-title-wrap">
            <span className="brand-name">SmartMed</span>
            <span className="brand-tag">Medicine Reminder Box</span>
          </div>
        </Link>

        {/* Navigation links */}
        <nav className="navbar-links" aria-label="Main Navigation">
          <NavLink
            to="/dashboard"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <LayoutDashboard size={17} />
            <span>Dashboard</span>
          </NavLink>

          <NavLink
            to="/medicines"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <Pill size={17} />
            <span>Medicines</span>
          </NavLink>

          <NavLink
            to="/history"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <History size={17} />
            <span>History</span>
          </NavLink>

          <NavLink
            to="/settings"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <Settings size={17} />
            <span>Settings</span>
          </NavLink>
        </nav>

        {/* Right side widgets: Connection Status + Add Dose + Profile & Logout */}
        <div className="navbar-right">
          {/* Small Connection Status Badge (Requirement #4 & #19) */}
          <button
            type="button"
            onClick={handleManualSync}
            className={`connection-badge ${
              !connStatus.isOnline
                ? 'offline'
                : connStatus.syncState === 'syncing'
                ? 'syncing'
                : 'online'
            }`}
            title={connStatus.label}
            style={{ cursor: connStatus.isOnline ? 'pointer' : 'default', background: 'none' }}
          >
            {!connStatus.isOnline ? (
              <>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--status-pending-dot)' }} />
                <span>{connStatus.pendingCount > 0 ? 'Offline (Saved)' : 'Offline'}</span>
              </>
            ) : connStatus.syncState === 'syncing' ? (
              <>
                <RefreshCw size={12} className="sync-spinner" color="var(--primary-500)" />
                <span>Syncing...</span>
              </>
            ) : (
              <>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--status-taken-dot)' }} />
                <span>Synced</span>
              </>
            )}
          </button>

          {/* Quick Add Medicine Button */}
          <Link
            to="/add-medicine"
            className="btn btn-primary btn-sm"
            style={{ padding: '0.45rem 0.85rem' }}
          >
            <PlusCircle size={15} />
            <span>Add Medicine</span>
          </Link>

          {/* User Profile & Logout */}
          <div style={{ position: 'relative' }}>
            <button
              className="user-badge"
              onClick={() => setShowUserMenu(!showUserMenu)}
              aria-label="User profile options"
            >
              <div className="user-avatar">
                {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : <User size={16} />}
              </div>
              <div className="user-info">
                <span className="user-name">{currentUser?.name || 'Account'}</span>
                <span className="user-role">{currentUser?.email || 'Logged In'}</span>
              </div>
            </button>

            {showUserMenu && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '115%',
                  width: '240px',
                  background: 'var(--bg-card)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-light)',
                  boxShadow: 'var(--shadow-lg)',
                  padding: '0.5rem',
                  zIndex: 100
                }}
              >
                <div style={{ padding: '0.6rem 0.75rem', borderBottom: '1px solid var(--border-light)' }}>
                  <div style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                    {currentUser?.name}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {currentUser?.email}
                  </div>
                  {currentUser?.mobile_number && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--primary-500)', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Phone size={11} />
                      <span>{currentUser.mobile_number}</span>
                    </div>
                  )}
                </div>

                <Link
                  to="/settings"
                  onClick={() => setShowUserMenu(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.6rem 0.75rem',
                    color: 'var(--text-primary)',
                    textDecoration: 'none',
                    fontSize: '0.88rem',
                    borderRadius: 'var(--radius-sm)'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-card-subtle)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <Settings size={15} />
                  <span>Preferences</span>
                </Link>

                <button
                  type="button"
                  onClick={handleLogout}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    width: '100%',
                    padding: '0.6rem 0.75rem',
                    color: '#ef4444',
                    background: 'transparent',
                    border: 'none',
                    textAlign: 'left',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    borderRadius: 'var(--radius-sm)'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--status-missed-bg)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <LogOut size={15} />
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
