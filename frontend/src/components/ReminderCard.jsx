import React, { useState, useEffect } from 'react';
import {
  Pill,
  Clock,
  Hourglass,
  Check,
  Radio,
  Sparkles,
  AlertCircle,
  BellRing
} from 'lucide-react';

export default function ReminderCard({ medicine, onTake, onSimulateIoT }) {
  if (!medicine) {
    return (
      <div
        className="card"
        style={{
          background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
          border: '1px solid var(--status-taken-border)',
          display: 'flex',
          alignItems: 'center',
          gap: '1.25rem',
          padding: '1.75rem'
        }}
      >
        <div
          style={{
            width: '52px',
            height: '52px',
            borderRadius: '50%',
            background: 'var(--status-taken-bg)',
            color: 'var(--status-taken-dot)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}
        >
          <Sparkles size={28} />
        </div>
        <div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--status-taken-text)' }}>
            All Caught Up for Today!
          </h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            No more pending doses scheduled for today. Great job keeping up with your health!
          </p>
        </div>
      </div>
    );
  }

  // Calculate real seconds remaining based on medicine.time / schedule_time
  const calculateSecondsToDose = () => {
    const timeStr = medicine.schedule_time || medicine.time || '';
    const parts = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
    if (!parts) return 18 * 60; // fallback 18 mins

    let hours = parseInt(parts[1], 10);
    const minutes = parseInt(parts[2], 10);
    const meridiem = parts[3] ? parts[3].toUpperCase() : null;

    if (meridiem === 'PM' && hours < 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;

    const now = new Date();
    const scheduled = new Date();
    scheduled.setHours(hours, minutes, 0, 0);

    let diffSecs = Math.floor((scheduled.getTime() - now.getTime()) / 1000);
    if (diffSecs < 0) {
      // If already past today, wrap or treat as pending (0)
      return 0;
    }
    return diffSecs;
  };

  const [secondsRemaining, setSecondsRemaining] = useState(calculateSecondsToDose());

  useEffect(() => {
    setSecondsRemaining(calculateSecondsToDose());
    const timer = setInterval(() => {
      setSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [medicine]);

  const hours = Math.floor(secondsRemaining / 3600);
  const minutes = Math.floor((secondsRemaining % 3600) / 60);
  const seconds = secondsRemaining % 60;

  const formattedCountdown = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return (
    <div
      className="card reminder-hero-card"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-light)',
        boxShadow: 'var(--shadow-lg)',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Decorative subtle medical glow accent */}
      <div
        style={{
          position: 'absolute',
          top: '-30px',
          right: '-30px',
          width: '140px',
          height: '140px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(2,132,199,0.12) 0%, rgba(255,255,255,0) 70%)',
          pointerEvents: 'none'
        }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Header Tag */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: 'var(--primary-600)',
              fontSize: '0.85rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}
          >
            <BellRing size={16} className="pulse-icon" />
            <span>Next Scheduled Medicine</span>
          </div>

          <div
            style={{
              fontSize: '0.8rem',
              fontWeight: 700,
              color: 'var(--text-muted)',
              background: 'var(--bg-card)',
              padding: '0.25rem 0.65rem',
              borderRadius: 'var(--radius-full)',
              border: '1px solid var(--border-light)'
            }}
          >
            Box Compartment #{medicine.slot || 1}
          </div>
        </div>

        {/* Medicine Main Spotlight */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1.5rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '16px',
                background: 'var(--primary-gradient)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(2, 132, 199, 0.3)',
                flexShrink: 0
              }}
            >
              <Pill size={30} strokeWidth={2.4} />
            </div>
            <div>
              <h2
                style={{
                  fontSize: '1.5rem',
                  fontWeight: 800,
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.02em',
                  lineHeight: 1.15
                }}
              >
                {medicine.name}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '4px' }}>
                <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--primary-600)' }}>
                  {medicine.dosage} {medicine.dosage_unit || ''}
                </span>
                <span style={{ color: 'var(--text-muted)' }}>•</span>
                <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {medicine.schedule_time || medicine.time}
                </span>
              </div>
              <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                {medicine.meal_instruction || medicine.meal || 'Take with water'}
              </p>
            </div>
          </div>

          {/* Countdown Clock Widget */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--bg-card)',
              border: '2px solid #bae6fd',
              borderRadius: 'var(--radius-md)',
              padding: '0.75rem 1.5rem',
              boxShadow: '0 4px 12px rgba(2, 132, 199, 0.08)'
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.75rem',
                fontWeight: 700,
                color: 'var(--primary-600)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em'
              }}
            >
              <Hourglass size={14} />
              <span>Until Next Dose</span>
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '1.75rem',
                fontWeight: 800,
                color: 'var(--text-primary)',
                letterSpacing: '0.05em',
                lineHeight: 1.2,
                marginTop: '2px'
              }}
            >
              {formattedCountdown}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Auto-updating countdown
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            paddingTop: '0.75rem',
            borderTop: '1px solid #e0f2fe',
            flexWrap: 'wrap'
          }}
        >
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Smart box compartment indicator #{medicine.slot || 1}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => onSimulateIoT && onSimulateIoT(medicine.id)}
              className="btn btn-secondary btn-sm"
              title="Simulate hardware detection"
            >
              <Radio size={14} color="var(--primary-500)" />
              <span>Simulate Hardware Detect</span>
            </button>

            <button
              type="button"
              onClick={() => onTake && onTake(medicine.id)}
              className="btn btn-success btn-sm"
            >
              <Check size={16} strokeWidth={2.5} />
              <span>Mark as Taken</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
