
import { db } from './localDb.js';
import { supabase, isSupabaseConfigured } from './supabase.js';

// SMS is disabled until the backend API is fixed.
const SMS_ENABLED = false;

// Status listeners
const statusListeners = new Set();

let isOnline = typeof navigator !== 'undefined'
  ? navigator.onLine
  : true;

let syncState = isOnline ? 'synced' : 'offline';
let syncTimer = null;

export const syncService = {

  getIsOnline() {
    return isOnline;
  },

  getSyncState() {
    return syncState;
  },

  subscribeStatus(callback) {
    statusListeners.add(callback);
    this.notifyStatus();

    return () => statusListeners.delete(callback);
  },

  async getPendingCount() {
    try {
      const pendingMeds = await db.medicines
        .filter(m => m._syncStatus && m._syncStatus !== 'synced')
        .count();

      const pendingLogs = await db.medicine_logs
        .filter(l => l._syncStatus && l._syncStatus !== 'synced')
        .count();

      const pendingSms = SMS_ENABLED
        ? await db.pending_sms
            .filter(s => s.status === 'pending')
            .count()
        : 0;

      return pendingMeds + pendingLogs + pendingSms;

    } catch (e) {
      console.error('[SmartMed] Pending count error:', e);
      return 0;
    }
  },

  async notifyStatus() {
    const pendingCount = await this.getPendingCount();

    const status = {
      isOnline,
      syncState,
      pendingCount,
      label: !isOnline
        ? 'Offline – Changes saved locally'
        : syncState === 'syncing'
        ? 'Syncing...'
        : pendingCount > 0
        ? 'Pending Sync'
        : 'Synced'
    };

    statusListeners.forEach(fn => {
      try {
        fn(status);
      } catch (e) {
        console.error('[SmartMed] Status listener error:', e);
      }
    });
  },

  setSyncState(state) {
    syncState = state;
    this.notifyStatus();
  },

  // Initialize automatic synchronization
  init() {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      console.log('[SmartMed] Internet connection restored.');

      isOnline = true;

      this.triggerSync();
    });

    window.addEventListener('offline', () => {
      console.log('[SmartMed] Operating in offline mode.');

      isOnline = false;

      this.setSyncState('offline');
    });

    if (syncTimer) {
      clearInterval(syncTimer);
    }

    // Automatic sync every 45 seconds
    syncTimer = setInterval(() => {
      if (isOnline) {
        this.triggerSync(true);
      }
    }, 45000);

    this.notifyStatus();
  },

  // Trigger synchronization
  async triggerSync(silent = false) {
    if (!isOnline) {
      this.setSyncState('offline');
      return;
    }

    if (!silent) {
      this.setSyncState('syncing');
    }

    try {
      await this.syncAll();

      this.setSyncState('synced');

    } catch (err) {
      console.warn('[SmartMed Sync] Sync error:', err.message);

      const pending = await this.getPendingCount();

      this.setSyncState(pending > 0 ? 'offline' : 'synced');
    }
  },

  // Complete synchronization
  async syncAll() {
    if (!isOnline) return;

    // SMS synchronization is optional.
    if (SMS_ENABLED) {
      await this.syncPendingSms();
    }

    // Synchronize database if Supabase is configured.
    if (isSupabaseConfigured() && supabase) {
      await this.syncProfilesToRemote();

      await this.syncMedicinesToRemote();

      await this.syncLogsToRemote();

      await this.syncRemoteMedicinesToLocal();
    }
  },

  // SMS synchronization
  async syncPendingSms() {
    if (!SMS_ENABLED) {
      return;
    }

    try {
      const pendingList = await db.pending_sms
        .where('status')
        .equals('pending')
        .toArray();

      const now = Date.now();

      for (const item of pendingList) {

        const ageMinutes =
          (now - new Date(item.created_at).getTime()) /
          (1000 * 60);

        // Remove expired messages
        if (ageMinutes > 25) {
          await db.pending_sms.update(item.id, {
            status: 'expired',
            error: 'Reminder expired while offline'
          });

          continue;
        }

        try {
          const res = await fetch('/api/sms/send', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              phone: item.phone,
              message: item.message,
              medicineName: item.medicine_name,
              scheduledTime: item.scheduled_for,
              reminderType: item.reminder_type
            })
          });

          if (res.ok) {
            await db.pending_sms.update(item.id, {
              status: 'sent',
              sent_at: new Date().toISOString(),
              error: null
            });

          } else {
            const errData = await res.json().catch(() => ({}));

            await db.pending_sms.update(item.id, {
              error: errData.error || `Server error ${res.status}`
            });

            console.error(
              '[SmartMed SMS] Server error:',
              res.status,
              errData
            );

            break;
          }

        } catch (e) {
          console.warn('[SmartMed SMS] Request failed:', e.message);
          break;
        }
      }

    } catch (e) {
      console.error('[SmartMed SMS] Sync error:', e);
    }
  },

  // Synchronize profiles to Supabase
  async syncProfilesToRemote() {
    try {
      const profiles = await db.profiles.toArray();

      for (const p of profiles) {
        const payload = {
          id: p.id,
          full_name: p.full_name,
          email: p.email,
          mobile_number: p.mobile_number,
          created_at: p.created_at
        };

        const { error } = await supabase
          .from('profiles')
          .upsert(payload);

        if (error) {
          console.warn('[SmartMed] Profile sync:', error.message);
        }
      }

    } catch (e) {
      console.warn('[SmartMed] Profile sync error:', e.message);
    }
  },

  // Synchronize medicines to Supabase
  async syncMedicinesToRemote() {
    try {
      const pendingMeds = await db.medicines
        .filter(m => m._syncStatus && m._syncStatus !== 'synced')
        .toArray();

      for (const med of pendingMeds) {

        if (med._syncStatus === 'pending_delete') {

          const { error } = await supabase
            .from('medicines')
            .delete()
            .eq('id', med.id);

          if (!error) {
            await db.medicines.delete(med.id);
          } else {
            console.warn('[SmartMed] Medicine delete:', error.message);
          }

        } else {

          const remotePayload = { ...med };

          delete remotePayload._syncStatus;

          const { error } = await supabase
            .from('medicines')
            .upsert(remotePayload);

          if (!error) {
            await db.medicines.update(med.id, {
              _syncStatus: 'synced'
            });
          } else {
            console.warn('[SmartMed] Medicine sync:', error.message);
          }
        }
      }

    } catch (e) {
      console.warn('[SmartMed] Medicine sync error:', e.message);
    }
  },

  // Synchronize medicine history to Supabase
  async syncLogsToRemote() {
    try {
      const pendingLogs = await db.medicine_logs
        .filter(l => l._syncStatus && l._syncStatus !== 'synced')
        .toArray();

      for (const log of pendingLogs) {

        const remotePayload = { ...log };

        delete remotePayload._syncStatus;

        const { error } = await supabase
          .from('medicine_logs')
          .upsert(remotePayload);

        if (!error) {
          await db.medicine_logs.update(log.id, {
            _syncStatus: 'synced'
          });
        } else {
          console.warn('[SmartMed] History sync:', error.message);
        }
      }

    } catch (e) {
      console.warn('[SmartMed] History sync error:', e.message);
    }
  },

  // Download remote medicines into local IndexedDB
  async syncRemoteMedicinesToLocal() {
    try {
      const {
        data: { user },
        error: authError
      } = await supabase.auth.getUser();

      if (authError || !user) return;

      const { data, error } = await supabase
        .from('medicines')
        .select('*')
        .eq('user_id', user.id);

      if (error) {
        console.warn('[SmartMed] Remote medicine download:', error.message);
        return;
      }

      if (data) {
        for (const remoteMed of data) {

          const local = await db.medicines.get(remoteMed.id);

          if (!local || local._syncStatus === 'synced') {
            await db.medicines.put({
              ...remoteMed,
              _syncStatus: 'synced'
            });
          }
        }
      }

    } catch (e) {
      console.warn('[SmartMed] Remote sync error:', e.message);
    }
  }
};
