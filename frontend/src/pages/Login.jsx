import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Activity, Mail, Lock, ShieldCheck, Check, Eye, EyeOff, Smartphone, WifiOff } from 'lucide-react';
import { api } from '../services/api';
import { syncService } from '../services/syncService';

export default function Login({ onNotify }) {
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const isOnline = syncService.getIsOnline();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!identifier.trim() || !password) {
      setErrorMsg('Please enter your email or mobile number, and password.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.login({ identifier, password, rememberMe });
      if (onNotify) {
        onNotify({
          title: 'Logged in successfully',
          desc: `Welcome back, ${res.user.name || 'User'}!`,
          type: 'success'
        });
      }
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const msg = err.message || 'Unable to sign in. Please verify your credentials.';
      setErrorMsg(msg);
      if (onNotify) {
        onNotify({
          title: 'Sign in failed',
          desc: msg,
          type: 'error'
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page-container">
      <div
        style={{
          width: '100%',
          maxWidth: '960px',
          background: 'var(--bg-card)',
          borderRadius: '24px',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          border: '1px solid var(--border-light)'
        }}
      >
        {/* Left Side: Product Showcase */}
        <div
          style={{
            background: 'linear-gradient(145deg, #091326 0%, #0f2042 50%, #0369a1 100%)',
            color: '#ffffff',
            padding: '3rem 2.5rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}
        >
          <div>
            {/* Brand */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2rem' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #38bdf8 0%, #10b981 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  boxShadow: '0 4px 14px rgba(56, 189, 248, 0.4)'
                }}
              >
                <Activity size={24} strokeWidth={2.6} />
              </div>
              <div>
                <span style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' }}>
                  SmartMed
                </span>
                <span
                  style={{
                    display: 'block',
                    fontSize: '0.72rem',
                    color: '#38bdf8',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em'
                  }}
                >
                  Medicine Reminder System
                </span>
              </div>
            </div>

            <h1 style={{ fontSize: '2.1rem', fontWeight: 800, lineHeight: 1.2, letterSpacing: '-0.02em', color: '#fff' }}>
              Smart Medicine Reminder Box
            </h1>

            <p style={{ fontSize: '1.05rem', color: '#cbd5e1', marginTop: '0.85rem', lineHeight: 1.5 }}>
              Never miss a dose. Stay on schedule.
            </p>

            <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#e2e8f0', fontSize: '0.92rem' }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'rgba(56, 189, 248, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8', flexShrink: 0 }}>
                  <Check size={14} strokeWidth={3} />
                </div>
                <span>Works 100% offline with local IndexedDB storage</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#e2e8f0', fontSize: '0.92rem' }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'rgba(56, 189, 248, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8', flexShrink: 0 }}>
                  <Check size={14} strokeWidth={3} />
                </div>
                <span>Local alarms & auto-syncing mobile SMS notifications</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#e2e8f0', fontSize: '0.92rem' }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'rgba(56, 189, 248, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8', flexShrink: 0 }}>
                  <Check size={14} strokeWidth={3} />
                </div>
                <span>IoT Smart Box sensor detection with hardware compatibility</span>
              </div>
            </div>
          </div>

          <div style={{ marginTop: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#94a3b8' }}>
            <ShieldCheck size={16} color="#34d399" />
            <span>Encrypted patient authentication & offline-first security</span>
          </div>
        </div>

        {/* Right Side: Login Form */}
        <div style={{ padding: '3rem 2.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: 'var(--bg-card)' }}>
          <div style={{ marginBottom: '1.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
              <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                Sign In
              </h2>

              {!isOnline && (
                <span className="connection-badge offline" title="Offline mode active">
                  <WifiOff size={13} />
                  <span>Offline Mode</span>
                </span>
              )}
            </div>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              Access your personalized medicine schedule
            </p>
          </div>

          {errorMsg && (
            <div
              style={{
                marginBottom: '1.25rem',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-md)',
                background: 'var(--status-missed-bg)',
                border: '1px solid var(--status-missed-border)',
                color: 'var(--status-missed-text)',
                fontSize: '0.88rem',
                fontWeight: 600
              }}
            >
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Email or Mobile Number (Requirement #7) */}
            <div className="form-group">
              <label className="form-label" htmlFor="login-identifier">
                <span>Email or Mobile Number</span>
              </label>
              <div style={{ position: 'relative' }}>
                <Mail
                  size={18}
                  style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
                />
                <input
                  id="login-identifier"
                  type="text"
                  className="form-input"
                  style={{ paddingLeft: '2.6rem' }}
                  placeholder="name@example.com or +91 9876543210"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            {/* Password with Eye Icon Toggle (Requirement #15) */}
            <div className="form-group">
              <label className="form-label" htmlFor="login-password">
                <span>Password</span>
              </label>
              <div style={{ position: 'relative' }}>
                <Lock
                  size={18}
                  style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
                />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  style={{ paddingLeft: '2.6rem', paddingRight: '2.8rem' }}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="password-eye-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Remember Me */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', fontSize: '0.88rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: 'var(--primary-500)', cursor: 'pointer' }}
                />
                <span>Remember on this device</span>
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{ width: '100%', padding: '0.8rem', fontSize: '1rem', fontWeight: 700 }}
            >
              {loading ? 'Signing In...' : 'Login'}
            </button>
          </form>

          {/* Don't have an account? Sign up */}
          <div style={{ textAlign: 'center', marginTop: '1.75rem', fontSize: '0.92rem', color: 'var(--text-secondary)' }}>
            Don't have an account?{' '}
            <Link
              to="/signup"
              style={{ color: 'var(--primary-600)', fontWeight: 700, textDecoration: 'none' }}
            >
              Sign up
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
