import React, { useState, useEffect } from 'react';
import {
  Bell,
  Volume2,
  Moon,
  Sun,
  Radio,
  User,
  Shield,
  CheckCircle2
} from 'lucide-react';
import { api } from '../services/api';

export default function Settings({ onNotify }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [settings, setSettings] = useState({
    reminder5Min: true,
    reminderOnTime: true,
    soundEnabled: true,
    browserNotif: false,
    theme: 'light'
  });

  useEffect(() => {
    let mounted = true;
    api.getCurrentUser().then((u) => {
      if (mounted) setCurrentUser(u);
    });
    api.getSettings().then((s) => {
      if (mounted) setSettings(s);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleToggleSetting = async (key) => {
    const updated = await api.updateSettings({ [key]: !settings[key] });
    setSettings(updated);

    if (onNotify) {
      onNotify({
        title: 'Settings updated',
        desc: 'Your reminder preferences have been saved.',
        type: 'info'
      });
    }
  };

  const handleThemeChange = async (theme) => {
    const updated = await api.updateSettings({ theme });
    setSettings(updated);
    document.documentElement.setAttribute('data-theme', theme);
  };

  const handleTestSound = () => {
    api.playGentleChime('reminder');
    if (onNotify) {
      onNotify({
        title: 'Reminder Sound Preview',
        desc: 'Testing calm two-tone reminder chime.',
        type: 'reminder'
      });
    }
  };

  const handleRequestNotification = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const updated = await api.updateSettings({ browserNotif: true });
        setSettings(updated);
        new Notification('SmartMed Reminder System', {
          body: 'Browser notifications enabled for your scheduled doses!'
        });
        if (onNotify) {
          onNotify({
            title: 'Browser Notifications Enabled',
            desc: 'You will receive desktop alerts for scheduled medicines.',
            type: 'success'
          });
        }
      } else {
        alert('Browser notification permission was not granted.');
      }
    } else {
      alert('This browser does not support desktop notifications.');
    }
  };

  return (
    <div style={{ maxWidth: '840px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
          Preferences & Settings
        </h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
          Configure dose reminder timings, audio alerts, and interface theme
        </p>
      </div>

      {/* Account Profile Card */}
      <div className="card" style={{ padding: '1.5rem 1.75rem' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
          User Profile
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}>
          <div
            style={{
              width: '54px',
              height: '54px',
              borderRadius: '50%',
              background: 'var(--primary-gradient)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.4rem',
              fontWeight: 800
            }}
          >
            {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'U'}
          </div>
          <div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {currentUser?.name || 'Account'}
            </div>
            <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
              {currentUser?.email || 'Logged in'}
            </div>
            {currentUser?.mobile_number && (
              <div style={{ fontSize: '0.85rem', color: 'var(--primary-500)', fontWeight: 600, marginTop: '4px' }}>
                Registered Mobile: <strong>{currentUser.mobile_number}</strong>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reminder & Alarm Settings (Requirements #9, #11, #12) */}
      <div className="card" style={{ padding: '1.5rem 1.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Reminder & Alarm System
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Configure proactive alerts and cellular SMS reminders
            </p>
          </div>

          <button
            type="button"
            onClick={handleTestSound}
            className="btn btn-secondary btn-sm"
          >
            <Volume2 size={16} />
            <span>Test Reminder Sound</span>
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* SMS Reminders Toggle (Requirement #9) */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1rem', background: 'var(--bg-card-subtle)', borderRadius: 'var(--radius-md)' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                Cellular SMS Reminders
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Sends SMS messages for scheduled medicines to {currentUser?.mobile_number || 'your mobile number'}
              </div>
            </div>
            <label style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.smsReminders !== false}
                onChange={() => handleToggleSetting('smsReminders')}
                style={{ width: '20px', height: '20px', accentColor: 'var(--primary-500)', cursor: 'pointer' }}
              />
            </label>
          </div>

          {/* 5-minute advance reminder */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1rem', background: 'var(--bg-card-subtle)', borderRadius: 'var(--radius-md)' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                5-Minute Advance Reminder
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Shows notification 5 minutes before scheduled dose (e.g. "Paracetamol is due in 5 minutes")
              </div>
            </div>
            <label style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.reminder5Min}
                onChange={() => handleToggleSetting('reminder5Min')}
                style={{ width: '20px', height: '20px', accentColor: 'var(--primary-500)', cursor: 'pointer' }}
              />
            </label>
          </div>

          {/* Medicine-time reminder */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1rem', background: 'var(--bg-card-subtle)', borderRadius: 'var(--radius-md)' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                Medicine Time Reminder
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Shows notification at the exact scheduled dose time (e.g. "Time to take your medicine")
              </div>
            </div>
            <label style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.reminderOnTime}
                onChange={() => handleToggleSetting('reminderOnTime')}
                style={{ width: '20px', height: '20px', accentColor: 'var(--primary-500)', cursor: 'pointer' }}
              />
            </label>
          </div>

          {/* Reminder Sound */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1rem', background: 'var(--bg-card-subtle)', borderRadius: 'var(--radius-md)' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                Reminder Sound
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Play a pleasant, non-annoying audio chime when a reminder is triggered
              </div>
            </div>
            <label style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.soundEnabled}
                onChange={() => handleToggleSetting('soundEnabled')}
                style={{ width: '20px', height: '20px', accentColor: 'var(--primary-500)', cursor: 'pointer' }}
              />
            </label>
          </div>

          {/* Browser Notifications */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1rem', background: 'var(--bg-card-subtle)', borderRadius: 'var(--radius-md)' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                Browser Notifications
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Receive desktop notifications even when working in another tab
              </div>
            </div>
            <button
              type="button"
              onClick={handleRequestNotification}
              className="btn btn-secondary btn-sm"
            >
              {settings.browserNotif ? 'Permission Granted' : 'Enable Permission'}
            </button>
          </div>
        </div>
      </div>

      {/* Appearance Theme */}
      <div className="card" style={{ padding: '1.5rem 1.75rem' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
          Appearance
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
          Choose your visual appearance
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1rem', background: 'var(--bg-card-subtle)', borderRadius: 'var(--radius-md)' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
              Color Theme
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Light healthcare theme or calm dark mode
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => handleThemeChange('light')}
              className={`btn btn-sm ${settings.theme === 'light' ? 'btn-primary' : 'btn-secondary'}`}
            >
              <Sun size={15} />
              <span>Light</span>
            </button>

            <button
              type="button"
              onClick={() => handleThemeChange('dark')}
              className={`btn btn-sm ${settings.theme === 'dark' ? 'btn-primary' : 'btn-secondary'}`}
            >
              <Moon size={15} />
              <span>Dark</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
