import React, { useState, useEffect } from 'react';
import ArduinoConnection from "../ArduinoConnection";
import { subscribeArduinoStatus } from "../arduinoSerial";
import { Link } from 'react-router-dom';
import {
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Pill,
  Radio,
  Plus,
  ArrowRight,
  Sparkles,
  Inbox
} from 'lucide-react';
import LiveClock from '../components/LiveClock';
import MedicineCard from '../components/MedicineCard';
import { api } from '../services/api';
import { syncService } from '../services/syncService';

export default function Dashboard({ onNotify }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [schedule, setSchedule] = useState([]);
  const [adherence, setAdherence] = useState({ percentage: 100, takenDoses: 0, totalDoses: 0 });
  const [loading, setLoading] = useState(true);

  const loadDashboardData = async () => {
    try {
      const user = await api.getCurrentUser();
      setCurrentUser(user);
      if (user) {
        const todaySchedule = await api.getTodaySchedule();
        const adh = await api.getAdherenceStats();
        setSchedule(todaySchedule);
        setAdherence(adh);
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();

    const unsubHardware = api.subscribeHardware((event) => {
      loadDashboardData();
      if (onNotify) {
        if (event.ambiguous) {
          onNotify({
            title: 'Multiple Medicines Due',
            desc: 'Multiple reminders are scheduled at this time. Please select which medicine was taken.',
            type: 'warning'
          });
        } else {
          onNotify({
            title: 'Medicine Taken via Smart Box',
            desc: `Physical push button recorded dose taken at ${event.receivedAt || event.takenAt || 'now'}.`,
            type: 'success'
          });
        }
      }
    });

    const unsubStatus = subscribeArduinoStatus(() => {
      loadDashboardData();
    });

    return () => {
      unsubHardware();
      unsubStatus();
    };
  }, []);

  // Compute status counts directly from user's database records
  const totalCount = schedule.length;
  const takenCount = schedule.filter((m) => m.status === 'taken').length;
  const pendingCount = schedule.filter((m) => m.status === 'pending').length;
  const missedCount = schedule.filter((m) => m.status === 'missed').length;

  // Next medicine: the first pending or upcoming medicine
  const nextMedicine =
    schedule.find((m) => m.status === 'pending') ||
    schedule.find((m) => m.status === 'upcoming') ||
    null;

  // Manual mark taken
  const handleMarkTaken = async (id) => {
    const med = schedule.find((m) => m.id === id);
    try {
      await api.markMedicineTaken(id);
      await loadDashboardData();
      if (onNotify) {
        onNotify({
          title: 'Medicine marked as taken',
          desc: med ? `${med.name} (${med.dosage} ${med.dosage_unit || ''}) confirmed.` : 'Status updated.',
          type: 'success'
        });
      }
    } catch (err) {
      if (onNotify) {
        onNotify({
          title: 'Unable to update status',
          desc: err.message,
          type: 'error'
        });
      }
    }
  };

  // Hardware simulation trigger
  const handleSimulateHardware = async (targetId) => {
    const idToTrigger = targetId || schedule.find((m) => m.status === 'pending')?.id || schedule[0]?.id;
    if (!idToTrigger) return;

    const med = schedule.find((m) => m.id === idToTrigger);
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    await api.receiveHardwareEvent({
      medicineId: idToTrigger,
      status: 'taken',
      takenAt: timeStr
    });

    if (onNotify && med) {
      onNotify({
        title: 'Hardware Auto-Detection',
        desc: `Smart Box detected ${med.name} taken from Compartment #${med.slot || 1} at ${timeStr}.`,
        type: 'info'
      });
    }
  };

  const progressPercent = totalCount > 0 ? Math.round((takenCount / totalCount) * 100) : 0;
  const pendingMeds = schedule.filter((m) => m.status === 'pending');
  const missedMeds = schedule.filter((m) => m.status === 'missed');

  if (loading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <p>Loading your schedule...</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {/* Header Row: Greeting & Real-Time Live Clock */}
      <div
        className="card"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1.25rem',
          background: 'var(--bg-card)',
          padding: '1.25rem 1.5rem'
        }}
      >
        <div>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--primary-600)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Daily Monitoring
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginTop: '2px' }}>
            Hello, {currentUser?.name || 'User'} 👋
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            Here is your personalized medicine schedule for today.
          </p>
        </div>

        {/* Live Clock (Clean real-time clock without permanent yellow timer) */}
        <LiveClock />
      </div>

      {/* Smart Alerts (Show only when needed) */}
      {(pendingMeds.length > 0 || missedMeds.length > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {pendingMeds.map((med) => (
            <div
              key={`alert-pending-${med.id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.85rem 1.25rem',
                borderRadius: 'var(--radius-md)',
                background: 'var(--status-pending-bg)',
                border: '1px solid var(--status-pending-border)',
                color: 'var(--status-pending-text)',
                gap: '1rem',
                flexWrap: 'wrap'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Clock size={20} color="var(--status-pending-dot)" />
                <div>
                  <span style={{ fontWeight: 800 }}>Medicine Due Soon: </span>
                  <span>{med.name} ({med.dosage} {med.dosage_unit || ''}) is scheduled for {med.time} ({med.meal}).</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleMarkTaken(med.id)}
                className="btn btn-sm btn-success"
                style={{ padding: '0.35rem 0.85rem' }}
              >
                Mark as Taken
              </button>
            </div>
          ))}

          {missedMeds.map((med) => (
            <div
              key={`alert-missed-${med.id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.85rem 1.25rem',
                borderRadius: 'var(--radius-md)',
                background: 'var(--status-missed-bg)',
                border: '1px solid var(--status-missed-border)',
                color: 'var(--status-missed-text)',
                gap: '1rem',
                flexWrap: 'wrap'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <AlertTriangle size={20} color="var(--status-missed-dot)" />
                <div>
                  <span style={{ fontWeight: 800 }}>Missed Dose: </span>
                  <span>You missed your {med.time} dose of {med.name} ({med.dosage} {med.dosage_unit || ''}).</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleMarkTaken(med.id)}
                className="btn btn-sm btn-secondary"
                style={{ padding: '0.35rem 0.85rem', borderColor: 'var(--status-missed-border)' }}
              >
                Mark as Taken
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 4 Summary Cards (Calculated dynamically from database) */}
      <div className="grid-4">
        {/* Card 1: Today's Medicines */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
              Today's Medicines
            </span>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'var(--primary-50)',
                color: 'var(--primary-500)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Calendar size={20} />
            </div>
          </div>
          <div style={{ fontSize: '2.25rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
            {totalCount}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Scheduled doses today
          </div>
        </div>

        {/* Card 2: Taken */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--status-taken-text)' }}>
              Taken
            </span>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'var(--status-taken-bg)',
                color: 'var(--status-taken-dot)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <CheckCircle2 size={20} />
            </div>
          </div>
          <div style={{ fontSize: '2.25rem', fontWeight: 800, color: 'var(--status-taken-dot)', lineHeight: 1 }}>
            {takenCount}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Completed today
          </div>
        </div>

        {/* Card 3: Pending */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--status-pending-text)' }}>
              Pending
            </span>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'var(--status-pending-bg)',
                color: 'var(--status-pending-dot)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Clock size={20} />
            </div>
          </div>
          <div style={{ fontSize: '2.25rem', fontWeight: 800, color: 'var(--status-pending-dot)', lineHeight: 1 }}>
            {pendingCount}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Waiting to be taken
          </div>
        </div>

        {/* Card 4: Missed */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--status-missed-text)' }}>
              Missed
            </span>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'var(--status-missed-bg)',
                color: 'var(--status-missed-dot)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <AlertTriangle size={20} />
            </div>
          </div>
          <div style={{ fontSize: '2.25rem', fontWeight: 800, color: 'var(--status-missed-dot)', lineHeight: 1 }}>
            {missedCount}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Requires attention
          </div>
        </div>
      </div>

      {/* Row: Today's Schedule Progress & Dynamic Adherence Score (Requirement #13 - Yellow timer removed) */}
      {totalCount > 0 && (
        <div className="grid-2">
          {/* Today's Progress */}
          <div className="card" style={{ padding: '1.4rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                Today's Schedule Progress
              </div>
              <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--primary-600)' }}>
                {takenCount} / {totalCount} completed
              </span>
            </div>

            <div
              style={{
                width: '100%',
                height: '10px',
                backgroundColor: 'var(--border-subtle)',
                borderRadius: '9999px',
                overflow: 'hidden'
              }}
            >
              <div
                style={{
                  width: `${progressPercent}%`,
                  height: '100%',
                  background: 'var(--primary-gradient)',
                  borderRadius: '9999px',
                  transition: 'width 0.4s ease'
                }}
              />
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.65rem' }}>
              {progressPercent}% of today's scheduled dosages completed
            </div>
          </div>

          {/* Adherence Score Card */}
          <div
            className="card"
            style={{
              padding: '1.4rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem'
            }}
          >
            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Medicine Adherence
              </div>
              <div style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--status-taken-text)', margin: '2px 0' }}>
                {adherence.percentage}%
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                {adherence.totalDoses > 0
                  ? `You took ${adherence.takenDoses} of ${adherence.totalDoses} recorded dosages.`
                  : 'Adherence tracking will start once doses are recorded.'}
              </p>
            </div>

            {/* Circular Gauge */}
            <div style={{ position: 'relative', width: '70px', height: '70px', flexShrink: 0 }}>
              <svg width="70" height="70" viewBox="0 0 70 70">
                <circle
                  cx="35"
                  cy="35"
                  r="28"
                  fill="none"
                  stroke="var(--border-subtle)"
                  strokeWidth="6"
                />
                <circle
                  cx="35"
                  cy="35"
                  r="28"
                  fill="none"
                  stroke="var(--status-taken-dot)"
                  strokeWidth="6"
                  strokeDasharray="175.9"
                  strokeDashoffset={175.9 - (175.9 * adherence.percentage) / 100}
                  strokeLinecap="round"
                  transform="rotate(-90 35 35)"
                  style={{ transition: 'stroke-dashoffset 0.6s ease' }}
                />
              </svg>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.82rem',
                  fontWeight: 800,
                  color: 'var(--text-primary)'
                }}
              >
                {adherence.percentage}%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Section: Today's Schedule or Empty State */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1rem',
            flexWrap: 'wrap',
            gap: '0.75rem'
          }}
        >
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
              Today's Schedule
            </h2>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
              Scheduled dosages tracked by the Smart Medicine Reminder Box
            </p>
          </div>

          <Link to="/add-medicine" className="btn btn-primary btn-sm">
            <Plus size={15} />
            <span>Add Medicine</span>
          </Link>
        </div>

        {totalCount === 0 ? (
          /* Empty State Requirement #27 */
          <div
            className="card"
            style={{
              textAlign: 'center',
              padding: '3.5rem 1.5rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '1rem'
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'var(--primary-50)',
                color: 'var(--primary-500)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2rem'
              }}
            >
              💊
            </div>
            <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              No medicines scheduled
            </h3>
            <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', maxWidth: '420px', lineHeight: 1.5 }}>
              Add your first medicine to start managing your daily schedule and receiving reminders.
            </p>
            <Link to="/add-medicine" className="btn btn-primary" style={{ marginTop: '0.5rem' }}>
              <Plus size={18} />
              <span>Add Medicine</span>
            </Link>
          </div>
        ) : (
          <div className="grid-2">
            {schedule.map((med) => (
              <MedicineCard
                key={med.id}
                medicine={med}
                onTake={handleMarkTaken}
                onSimulateIoT={handleSimulateHardware}
              />
            ))}
          </div>
        )}
      </div>
      <ArduinoConnection onNotify={onNotify} />
    </div>
  );
}
