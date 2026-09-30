import React, { useState, useEffect } from 'react';
import { Clock, Calendar } from 'lucide-react';

export default function LiveClock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const timeString = time.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });

  const dateString = time.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  return (
    <div
      className="live-clock-card"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.85rem'
      }}
    >
      <div
        style={{
          width: '46px',
          height: '46px',
          borderRadius: '12px',
          background: 'var(--primary-50)',
          color: 'var(--primary-500)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}
      >
        <Clock size={24} strokeWidth={2.2} />
      </div>
      <div>
        <div
          style={{
            fontSize: '1.45rem',
            fontWeight: 800,
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.02em',
            color: 'var(--text-primary)',
            lineHeight: 1.15
          }}
        >
          {timeString}
        </div>
        <div
          style={{
            fontSize: '0.84rem',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            marginTop: '2px'
          }}
        >
          <Calendar size={13} />
          <span>{dateString}</span>
        </div>
      </div>
    </div>
  );
}
