import React, { useState, useEffect } from 'react';
import {
  Download,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Search,
  Clock,
  History as HistoryIcon
} from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import { api } from '../services/api';

export default function History() {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [historyData, setHistoryData] = useState([]);
  const [adherence, setAdherence] = useState({ percentage: 100, takenDoses: 0, totalDoses: 0 });
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const data = await api.getHistory(filter);
      const adh = await api.getAdherenceStats();
      setHistoryData(data);
      setAdherence(adh);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filter]);

  const filteredHistory = historyData.filter((item) =>
    (item.medicine || '').toLowerCase().includes(search.toLowerCase()) ||
    (item.dosage || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleExportCSV = () => {
    if (filteredHistory.length === 0) return;

    const headers = ['Date', 'Medicine', 'Dosage', 'Scheduled Time', 'Actual Taken Time', 'Status', 'Box Compartment'];
    const rows = filteredHistory.map((h) => [
      h.date,
      `"${h.medicine}"`,
      `"${h.dosage || ''}"`,
      h.scheduled,
      h.taken || '—',
      h.status,
      h.slot ? `Slot #${h.slot}` : ''
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `SmartMed_History_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <p>Loading history records...</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem'
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            Dosage History
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            Actual dosage records retrieved directly from your personal database logs
          </p>
        </div>

        {filteredHistory.length > 0 && (
          <button
            type="button"
            onClick={handleExportCSV}
            className="btn btn-secondary"
            style={{ fontSize: '0.88rem' }}
          >
            <Download size={16} />
            <span>Export CSV Report</span>
          </button>
        )}
      </div>

      {/* Adherence Summary Card (Calculated Dynamically - Requirement #22) */}
      <div
        className="card"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--status-taken-border)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1.5rem',
          alignItems: 'center',
          padding: '1.5rem 1.75rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          {/* Circular Progress Gauge */}
          <div style={{ position: 'relative', width: '80px', height: '80px', flexShrink: 0 }}>
            <svg width="80" height="80" viewBox="0 0 80 80">
              <circle
                cx="40"
                cy="40"
                r="32"
                fill="none"
                stroke="var(--border-subtle)"
                strokeWidth="7"
              />
              <circle
                cx="40"
                cy="40"
                r="32"
                fill="none"
                stroke="var(--status-taken-dot)"
                strokeWidth="7"
                strokeDasharray="201.1"
                strokeDashoffset={201.1 - (201.1 * adherence.percentage) / 100}
                strokeLinecap="round"
                transform="rotate(-90 40 40)"
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
                fontSize: '1.15rem',
                fontWeight: 800,
                color: 'var(--text-primary)'
              }}
            >
              {adherence.percentage}%
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--status-taken-text)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Medicine Adherence
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>
              {adherence.percentage}%
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {adherence.totalDoses > 0
                ? `${adherence.takenDoses} of ${adherence.totalDoses} scheduled doses completed`
                : 'Calculated dynamically as you take scheduled doses'}
            </div>
          </div>
        </div>

        {/* Taken doses */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: 'var(--status-taken-bg)',
              color: 'var(--status-taken-dot)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <CheckCircle2 size={22} />
          </div>
          <div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {adherence.takenDoses}
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Doses Successfully Taken
            </div>
          </div>
        </div>

        {/* Missed doses */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: 'var(--status-missed-bg)',
              color: 'var(--status-missed-dot)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <AlertTriangle size={22} />
          </div>
          <div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--status-missed-dot)' }}>
              {adherence.missedDoses}
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Missed Doses
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div
        className="card"
        style={{
          padding: '1rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem'
        }}
      >
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
          <Search
            size={18}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)'
            }}
          />
          <input
            type="text"
            className="form-input"
            style={{ paddingLeft: '2.4rem' }}
            placeholder="Search by medicine name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: 'All History' },
            { id: 'today', label: 'Today' },
            { id: 'week', label: 'This Week' },
            { id: 'month', label: 'This Month' }
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`btn btn-sm ${filter === item.id ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.45rem 0.85rem' }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* History Table from Real Database Logs */}
      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '650px' }}>
            <thead>
              <tr style={{ background: 'var(--bg-card-subtle)', borderBottom: '1px solid var(--border-light)' }}>
                <th style={{ padding: '0.95rem 1.25rem', fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Date
                </th>
                <th style={{ padding: '0.95rem 1.25rem', fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Medicine
                </th>
                <th style={{ padding: '0.95rem 1.25rem', fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Dosage
                </th>
                <th style={{ padding: '0.95rem 1.25rem', fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Scheduled
                </th>
                <th style={{ padding: '0.95rem 1.25rem', fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Taken
                </th>
                <th style={{ padding: '0.95rem 1.25rem', fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', textAlign: 'right' }}>
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '3rem 1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📋</div>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                      No dosage logs recorded yet
                    </div>
                    <div style={{ fontSize: '0.88rem' }}>
                      When scheduled doses are marked as taken or pending, your dosage logs will appear here.
                    </div>
                  </td>
                </tr>
              ) : (
                filteredHistory.map((row) => (
                  <tr
                    key={row.id}
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      transition: 'background var(--transition-fast)'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-card-tint)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '1rem 1.25rem', fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {row.date}
                    </td>

                    <td style={{ padding: '1rem 1.25rem', fontWeight: 800, color: 'var(--text-primary)', fontSize: '0.95rem' }}>
                      {row.medicine}
                    </td>

                    <td style={{ padding: '1rem 1.25rem', fontSize: '0.88rem', color: 'var(--primary-600)', fontWeight: 600 }}>
                      {row.dosage}
                    </td>

                    <td style={{ padding: '1rem 1.25rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                      {row.scheduled}
                    </td>

                    <td style={{ padding: '1rem 1.25rem', fontSize: '0.9rem' }}>
                      {row.taken !== '—' ? (
                        <span style={{ fontWeight: 700, color: 'var(--status-taken-text)' }}>
                          {row.taken}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>

                    <td style={{ padding: '1rem 1.25rem', textAlign: 'right' }}>
                      <StatusBadge status={row.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
