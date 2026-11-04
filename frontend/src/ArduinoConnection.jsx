import React, { useState, useEffect } from 'react';

import {
  connectArduino,
  disconnectArduino,
  getArduinoStatus,
  subscribeArduinoStatus,
  subscribeBoxRtcTime,
  getLastRtcTime,
  isSerialSupported,
  resyncScheduleFromDb,
  syncCurrentTimeToArduino,
  triggerHardwareTest
} from './arduinoSerial';

import {
  Cpu,
  RefreshCw,
  AlertCircle,
  Clock,
  Volume2
} from 'lucide-react';

export default function ArduinoConnection({ onNotify }) {
  const [status, setStatus] = useState(getArduinoStatus());
  const [rtcTime, setRtcTime] = useState(getLastRtcTime());
  const [error, setError] = useState('');

  const [syncingSchedule, setSyncingSchedule] = useState(false);
  const [syncingClock, setSyncingClock] = useState(false);
  const [testingHardware, setTestingHardware] = useState(false);

  useEffect(() => {
    const unsubStatus = subscribeArduinoStatus(newStatus => {
      setStatus(newStatus);

      if (newStatus === 'connected') {
        setError('');
      } else {
        setRtcTime(null);
      }
    });

    const unsubRtc = subscribeBoxRtcTime(time => {
      setRtcTime(time);
    });

    return () => {
      unsubStatus();
      unsubRtc();
    };
  }, []);

  const handleConnect = async () => {
    setError('');

    if (!isSerialSupported()) {
      const msg =
        'Web Serial is not supported. Please use desktop Chrome or Edge.';

      setError(msg);

      onNotify?.({
        title: 'Browser Compatibility',
        desc: msg,
        type: 'error'
      });

      return;
    }

    try {
      const result = await connectArduino();

      if (result?.alreadyConnected) {
        onNotify?.({
          title: 'Already Connected',
          desc: 'Arduino is already communicating with the website.',
          type: 'info'
        });

        return;
      }

      if (!result?.connected) {
        throw new Error('Arduino communication could not be verified.');
      }

      if (result.scheduleSynced && result.clockSynced) {
        onNotify?.({
          title: 'Medicine Box Connected',
          desc: 'Arduino communication verified. Clock and medicine reminders synchronized.',
          type: 'success'
        });
      } else if (!result.scheduleSynced) {
        onNotify?.({
          title: 'Arduino Connected',
          desc: 'USB communication works, but medicine schedules could not be fully synchronized.',
          type: 'error'
        });
      } else {
        onNotify?.({
          title: 'Arduino Connected',
          desc: 'USB communication and medicine schedules synchronized. Please check RTC synchronization.',
          type: 'info'
        });
      }

    } catch (err) {
      const msg = err.message || 'Unable to connect to Arduino.';

      setError(msg);

      if (err.message !== 'No device selected.') {
        onNotify?.({
          title: 'Connection Failed',
          desc: msg,
          type: 'error'
        });
      }
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectArduino();

      setRtcTime(null);
      setError('');

      onNotify?.({
        title: 'Medicine Box Disconnected',
        desc: 'Arduino serial connection has been closed.',
        type: 'info'
      });

    } catch (err) {
      const msg = 'Unable to disconnect cleanly. Please try again.';

      setError(msg);

      onNotify?.({
        title: 'Disconnect Error',
        desc: msg,
        type: 'error'
      });
    }
  };

  const handleSyncSchedule = async () => {
    setSyncingSchedule(true);
    setError('');

    try {
      const success = await resyncScheduleFromDb();

      if (!success) {
        throw new Error(
          'Medicine reminders could not be synchronized. Check the database and Arduino connection.'
        );
      }

      onNotify?.({
        title: 'Schedules Synchronized',
        desc: 'All active medicine reminders were acknowledged by Arduino.',
        type: 'success'
      });

    } catch (err) {
      const msg = err.message || 'Schedule synchronization failed.';

      setError(msg);

      onNotify?.({
        title: 'Schedule Sync Failed',
        desc: msg,
        type: 'error'
      });

    } finally {
      setSyncingSchedule(false);
    }
  };

  const handleSyncClock = async () => {
    setSyncingClock(true);
    setError('');

    try {
      const success = await syncCurrentTimeToArduino();

      if (!success) {
        throw new Error('RTC clock synchronization failed.');
      }

      onNotify?.({
        title: 'RTC Clock Synchronized',
        desc: 'Arduino DS3231 clock was adjusted to the computer local time.',
        type: 'success'
      });

    } catch (err) {
      const msg = err.message || 'Clock synchronization failed.';

      setError(msg);

      onNotify?.({
        title: 'Clock Sync Failed',
        desc: msg,
        type: 'error'
      });

    } finally {
      setSyncingClock(false);
    }
  };

  const handleTestHardware = async () => {
    setTestingHardware(true);
    setError('');

    try {
      const success = await triggerHardwareTest();

      if (!success) {
        throw new Error('Arduino did not confirm the hardware test.');
      }

      onNotify?.({
        title: 'Hardware Test Complete',
        desc: 'Arduino acknowledged the test. Buzzer and LED should activate briefly.',
        type: 'success'
      });

    } catch (err) {
      const msg = err.message || 'Hardware test failed.';

      setError(msg);

      onNotify?.({
        title: 'Hardware Test Failed',
        desc: msg,
        type: 'error'
      });

    } finally {
      setTestingHardware(false);
    }
  };

  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting';

  return (
    <section
      className="card"
      style={{
        padding: '1.5rem',
        borderRadius: '16px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-light)',
        marginTop: '1.25rem'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          flexWrap: 'wrap'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.85rem'
          }}
        >
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: isConnected
                ? 'var(--status-taken-bg)'
                : 'var(--bg-card-subtle)',
              color: isConnected
                ? 'var(--status-taken-dot)'
                : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Cpu size={22} strokeWidth={2.2} />
          </div>

          <div>
            <h2
              style={{
                margin: 0,
                fontSize: '1.05rem',
                fontWeight: 700,
                color: 'var(--text-primary)'
              }}
            >
              Medicine Box Hardware
            </h2>

            <div
              style={{
                margin: '4px 0 0',
                fontSize: '0.85rem',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                flexWrap: 'wrap'
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span
                  style={{
                    width: '9px',
                    height: '9px',
                    borderRadius: '50%',
                    background: isConnected
                      ? '#16a34a'
                      : isConnecting
                      ? '#eab308'
                      : '#9ca3af',
                    display: 'inline-block',
                    boxShadow: isConnected
                      ? '0 0 8px rgba(22, 163, 74, 0.6)'
                      : 'none'
                  }}
                />

                <span style={{ fontWeight: 600 }}>
                  {isConnected
                    ? 'Connected'
                    : isConnecting
                    ? 'Connecting...'
                    : 'Disconnected'}
                </span>
              </span>

              {isConnected && rtcTime && (
                <span
                  style={{
                    fontSize: '0.82rem',
                    color: 'var(--primary-600)',
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  title="Time reported by the DS3231 RTC"
                >
                  <Clock size={13} />

                  <span>
                    Box Clock: {String(rtcTime).trim()}
                  </span>
                </span>
              )}
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            flexWrap: 'wrap'
          }}
        >
          {isConnected && (
            <>
              <button
                type="button"
                onClick={handleTestHardware}
                disabled={testingHardware}
                className="btn btn-secondary btn-sm"
                style={{ padding: '0.5rem 0.85rem' }}
              >
                <Volume2
                  size={14}
                  className={testingHardware ? 'sync-spinner' : ''}
                />

                <span>
                  {testingHardware ? 'Testing...' : 'Test Alarm'}
                </span>
              </button>

              <button
                type="button"
                onClick={handleSyncClock}
                disabled={syncingClock}
                className="btn btn-secondary btn-sm"
                style={{ padding: '0.5rem 0.85rem' }}
              >
                <Clock
                  size={14}
                  className={syncingClock ? 'sync-spinner' : ''}
                />

                <span>
                  {syncingClock ? 'Syncing...' : 'Sync Clock'}
                </span>
              </button>

              <button
                type="button"
                onClick={handleSyncSchedule}
                disabled={syncingSchedule}
                className="btn btn-secondary btn-sm"
                style={{ padding: '0.5rem 0.85rem' }}
              >
                <RefreshCw
                  size={14}
                  className={syncingSchedule ? 'sync-spinner' : ''}
                />

                <span>
                  {syncingSchedule ? 'Syncing...' : 'Sync Reminders'}
                </span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={isConnected ? handleDisconnect : handleConnect}
            disabled={isConnecting}
            className={`btn ${isConnected ? 'btn-secondary' : 'btn-primary'}`}
            style={{
              padding: '0.55rem 1.15rem',
              fontWeight: 600,
              minWidth: '140px'
            }}
          >
            {isConnecting
              ? 'Connecting...'
              : isConnected
              ? 'Disconnect'
              : 'Connect Arduino'}
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            marginTop: '1rem',
            padding: '0.65rem 0.85rem',
            background: 'var(--status-missed-bg, #fef2f2)',
            border: '1px solid var(--status-missed-border, #fecaca)',
            borderRadius: 'var(--radius-sm, 8px)',
            color: 'var(--status-missed-text, #b91c1c)',
            fontSize: '0.84rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <AlertCircle size={16} />

          <span>{error}</span>
        </div>
      )}
    </section>
  );
}