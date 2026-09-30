import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  Mail,
  Lock,
  User,
  ShieldCheck,
  Check,
  Eye,
  EyeOff,
  Phone
} from 'lucide-react';
import { api } from '../services/api';

export default function Signup({ onNotify }) {
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!name.trim()) {
      setErrorMsg('Please enter your full name.');
      return;
    }
    if (!email.trim()) {
      setErrorMsg('Please enter your email address.');
      return;
    }

    // Validate Indian mobile number (Requirement #6)
    const mobileValidation = api.validateIndianMobile(mobileNumber);
    if (!mobileValidation.valid) {
      setErrorMsg(mobileValidation.error);
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match. Please verify.');
      return;
    }

    setLoading(true);
    try {
      await api.signUp({
        name: name.trim(),
        email: email.trim(),
        mobile_number: mobileValidation.formatted,
        password
      });

      if (onNotify) {
        onNotify({
          title: 'Account created successfully',
          desc: `Welcome to SmartMed, ${name.trim()}! Registered with mobile ${mobileValidation.formatted}.`,
          type: 'success'
        });
      }
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setErrorMsg(err.message || 'Unable to create account. Please try again.');
      if (onNotify) {
        onNotify({
          title: 'Registration failed',
          desc: err.message || 'Please check your information.',
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
          maxWidth: '980px',
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

            <h1 style={{ fontSize: '2rem', fontWeight: 800, lineHeight: 1.2, letterSpacing: '-0.02em', color: '#fff' }}>
              Create your SmartMed account
            </h1>

            <p style={{ fontSize: '1.05rem', color: '#cbd5e1', marginTop: '0.85rem', lineHeight: 1.5 }}>
              Never miss a dose. Stay on schedule with smart alerts.
            </p>

            {/* Value bullets */}
            <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#e2e8f0', fontSize: '0.92rem' }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'rgba(56, 189, 248, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8', flexShrink: 0 }}>
                  <Check size={14} strokeWidth={3} />
                </div>
                <span>Full offline functionality with automatic background sync</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#e2e8f0', fontSize: '0.92rem' }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'rgba(56, 189, 248, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8', flexShrink: 0 }}>
                  <Check size={14} strokeWidth={3} />
                </div>
                <span>Proactive SMS dosage reminders to your mobile number</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#e2e8f0', fontSize: '0.92rem' }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'rgba(56, 189, 248, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8', flexShrink: 0 }}>
                  <Check size={14} strokeWidth={3} />
                </div>
                <span>Isolated profile records with Row Level Security (RLS)</span>
              </div>
            </div>
          </div>

          <div style={{ marginTop: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#94a3b8' }}>
            <ShieldCheck size={16} color="#34d399" />
            <span>Secure account protection with encrypted password hashes</span>
          </div>
        </div>

        {/* Right Side: Sign Up Form */}
        <div style={{ padding: '2.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: 'var(--bg-card)' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              Sign Up
            </h2>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              Set up your medication profile & SMS reminders
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
            {/* Full Name */}
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label" htmlFor="signup-name">
                Full Name
              </label>
              <div style={{ position: 'relative' }}>
                <User
                  size={18}
                  style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
                />
                <input
                  id="signup-name"
                  type="text"
                  className="form-input"
                  style={{ paddingLeft: '2.6rem' }}
                  placeholder="e.g. Rahul Sharma"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Email Address */}
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label" htmlFor="signup-email">
                Email Address
              </label>
              <div style={{ position: 'relative' }}>
                <Mail
                  size={18}
                  style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
                />
                <input
                  id="signup-email"
                  type="email"
                  className="form-input"
                  style={{ paddingLeft: '2.6rem' }}
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Mobile Number with Indian Validation (Requirement #6) */}
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label" htmlFor="signup-mobile">
                Mobile Number (for SMS Reminders)
              </label>
              <div style={{ position: 'relative' }}>
                <Phone
                  size={18}
                  style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
                />
                <input
                  id="signup-mobile"
                  type="tel"
                  className="form-input"
                  style={{ paddingLeft: '2.6rem' }}
                  placeholder="+91 9876543210"
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value)}
                  required
                />
              </div>
              <span className="form-hint">
                Indian 10-digit mobile number starting with 6, 7, 8, or 9
              </span>
            </div>

            {/* Password with Eye Toggle (Requirement #15) */}
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label" htmlFor="signup-password">
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock
                  size={18}
                  style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
                />
                <input
                  id="signup-password"
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  style={{ paddingLeft: '2.6rem', paddingRight: '2.8rem' }}
                  placeholder="Minimum 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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

            {/* Confirm Password with Eye Toggle (Requirement #15) */}
            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label className="form-label" htmlFor="signup-confirm-password">
                Confirm Password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock
                  size={18}
                  style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
                />
                <input
                  id="signup-confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  className="form-input"
                  style={{ paddingLeft: '2.6rem', paddingRight: '2.8rem' }}
                  placeholder="Repeat your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="password-eye-btn"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  title={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{ width: '100%', padding: '0.8rem', fontSize: '1rem', fontWeight: 700 }}
            >
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>

          {/* Already have an account? Login */}
          <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.92rem', color: 'var(--text-secondary)' }}>
            Already have an account?{' '}
            <Link
              to="/login"
              style={{ color: 'var(--primary-600)', fontWeight: 700, textDecoration: 'none' }}
            >
              Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
