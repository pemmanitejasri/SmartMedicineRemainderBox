import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import NotificationToast from './components/NotificationToast';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import AddMedicine from './pages/AddMedicine';
import Medicines from './pages/Medicines';
import History from './pages/History';
import Settings from './pages/Settings';
import { api } from './services/api';

// Protected Route Wrapper
function ProtectedRoute({ children, isAuthenticated, loading }) {
  if (loading) {
    return (
      <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        Verifying session...
      </div>
    );
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

// Public Route (redirects to /dashboard if already logged in)
function PublicRoute({ children, isAuthenticated, loading }) {
  if (loading) {
    return null;
  }
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

function MainLayout({ children, isAuthenticated, onNotify }) {
  const location = useLocation();
  const isAuthPage = location.pathname === '/login' || location.pathname === '/signup';

  return (
    <div className="app-container">
      {isAuthenticated && !isAuthPage && <Navbar onNotify={onNotify} />}
      <main className={isAuthenticated && !isAuthPage ? 'main-content' : ''}>
        {children}
      </main>
    </div>
  );
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [toasts, setToasts] = useState([]);

  // Track triggered reminders to prevent spamming notifications
  const reminded5MinRef = useRef(new Set());
  const remindedExactRef = useRef(new Set());

  // Check auth session on startup
  useEffect(() => {
    let mounted = true;
    api.getCurrentUser().then((user) => {
      if (mounted) {
        setCurrentUser(user);
        setAuthLoading(false);
      }
    });

    const unsubscribe = api.onAuthStateChange((user) => {
      if (mounted) {
        setCurrentUser(user);
        setAuthLoading(false);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  // Toast manager
  const addToast = ({ title, desc, type = 'info', duration = 5000 }) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, title, desc, type }]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Real Medicine Reminder System (Requirements #11, #12, #13)
  useEffect(() => {
    if (!currentUser) return;

    const checkReminders = async () => {
      try {
        const settings = await api.getSettings();
        const schedule = await api.getTodaySchedule();
        const now = new Date();

        schedule.forEach((med) => {
          if (med.status === 'taken') return;

          // Parse scheduled time
          const parts = (med.schedule_time || '').match(/(\d+):(\d+)\s*(AM|PM)?/i);
          if (!parts) return;

          let hours = parseInt(parts[1], 10);
          const minutes = parseInt(parts[2], 10);
          const meridiem = parts[3] ? parts[3].toUpperCase() : null;

          if (meridiem === 'PM' && hours < 12) hours += 12;
          if (meridiem === 'AM' && hours === 12) hours = 0;

          const scheduledDate = new Date();
          scheduledDate.setHours(hours, minutes, 0, 0);

          const diffMinutes = (scheduledDate.getTime() - now.getTime()) / (1000 * 60);
          const medKey = `${med.id}_${now.toDateString()}`;

          // 1. 5-Minute Advance Reminder (between 3.5 and 5.5 minutes before dose - Requirements #9, #11, #12)
          if (
            settings.reminder5Min &&
            diffMinutes > 3.5 &&
            diffMinutes <= 5.5 &&
            !reminded5MinRef.current.has(medKey)
          ) {
            reminded5MinRef.current.add(medKey);

            addToast({
              title: `Medicine Reminder`,
              desc: `${med.name} ${med.dosage} ${med.dosage_unit || ''} is due in 5 minutes.`,
              type: 'reminder'
            });

            if (settings.soundEnabled) {
              api.playGentleChime('reminder');
            }

            if (settings.browserNotif && 'Notification' in window && Notification.permission === 'granted') {
              new Notification('SmartMed Reminder', {
                body: `${med.name} ${med.dosage} ${med.dosage_unit || ''} is due in 5 minutes.`
              });
            }

            // Trigger / Queue SMS Reminder
            if (settings.smsReminders !== false && currentUser?.mobile_number) {
              api.queueSmsNotification({
                medicine: med,
                reminderType: 'advance_5min'
              }).catch(() => {});
            }
          }

          // 2. Exact Medicine Time Reminder (between -1 and +2 minutes around scheduled time)
          if (
            settings.reminderOnTime &&
            diffMinutes >= -1 &&
            diffMinutes <= 2 &&
            !remindedExactRef.current.has(medKey)
          ) {
            remindedExactRef.current.add(medKey);

            addToast({
              title: `Time to take your medicine`,
              desc: `${med.name} ${med.dosage} ${med.dosage_unit || ''}.`,
              type: 'alarm',
              duration: 8000
            });

            if (settings.soundEnabled) {
              api.playGentleChime('reminder');
            }

            if (settings.browserNotif && 'Notification' in window && Notification.permission === 'granted') {
              new Notification('SmartMed — Time to take your medicine', {
                body: `It is time to take your ${med.name} ${med.dosage} ${med.dosage_unit || ''} medicine.`
              });
            }

            // Trigger / Queue SMS Reminder
            if (settings.smsReminders !== false && currentUser?.mobile_number) {
              api.queueSmsNotification({
                medicine: med,
                reminderType: 'due_now'
              }).catch(() => {});
            }
          }
        });
      } catch (e) {
        console.error('Error running reminder check:', e);
      }
    };

    // Run check every 15 seconds
    checkReminders();
    const interval = setInterval(checkReminders, 15000);
    return () => clearInterval(interval);
  }, [currentUser]);

  const isAuthenticated = Boolean(currentUser);

  return (
    <BrowserRouter>
      <MainLayout isAuthenticated={isAuthenticated} onNotify={addToast}>
        <Routes>
          {/* Default Redirect */}
          <Route
            path="/"
            element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />}
          />

          {/* Public Routes */}
          <Route
            path="/login"
            element={
              <PublicRoute isAuthenticated={isAuthenticated} loading={authLoading}>
                <Login onNotify={addToast} />
              </PublicRoute>
            }
          />
          <Route
            path="/signup"
            element={
              <PublicRoute isAuthenticated={isAuthenticated} loading={authLoading}>
                <Signup onNotify={addToast} />
              </PublicRoute>
            }
          />

          {/* Protected Routes */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute isAuthenticated={isAuthenticated} loading={authLoading}>
                <Dashboard onNotify={addToast} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/medicines"
            element={
              <ProtectedRoute isAuthenticated={isAuthenticated} loading={authLoading}>
                <Medicines onNotify={addToast} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/add-medicine"
            element={
              <ProtectedRoute isAuthenticated={isAuthenticated} loading={authLoading}>
                <AddMedicine onNotify={addToast} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/history"
            element={
              <ProtectedRoute isAuthenticated={isAuthenticated} loading={authLoading}>
                <History />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute isAuthenticated={isAuthenticated} loading={authLoading}>
                <Settings onNotify={addToast} />
              </ProtectedRoute>
            }
          />

          {/* Catch-all */}
          <Route
            path="*"
            element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />}
          />
        </Routes>
      </MainLayout>

      {/* Floating Reusable Toast Container (Requirement #10) */}
      <NotificationToast toasts={toasts} onDismiss={removeToast} />
    </BrowserRouter>
  );
}
