import { db } from './localDb.js';
import { supabase, isSupabaseConfigured } from './supabase.js';

// Status listeners for UI connection badges (Navbar / Dashboard)
const statusListeners = new Set();

let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
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
    // Initial call
    this.notifyStatus();
    return () => statusListeners.delete(callback);
  },

  async getPendingCount() {
    try {
      const pendingMeds = await db.medicines
        .filter((m) => m._syncStatus && m._syncStatus !== 'synced')
        .count();
      const pendingLogs = await db.medicine_logs
        .filter((l) => l._syncStatus && l._syncStatus !== 'synced')
        .count();
      const pendingSms = await db.pending_sms
        .filter((s) => s.status === 'pending')
        .count();
      return pendingMeds + pendingLogs + pendingSms;
    } catch (e) {
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
        ? (pendingCount > 0 ? 'Offline – Changes saved locally' : 'Offline')
        : syncState === 'syncing'
        ? 'Syncing...'
        : 'Synced'
    };

    statusListeners.forEach((fn) => {
      try {
        fn(status);
      } catch (e) {
        console.error('Error notifying sync listener:', e);
      }
    });
  },

  setSyncState(state) {
    syncState = state;
    this.notifyStatus();
  },

  /**
   * Initializes network listeners and automatic sync
   */
  init() {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      console.log('[SmartMed Sync] Internet connection restored. Initiating auto-sync...');
      isOnline = true;
      this.triggerSync();
    });

    window.addEventListener('offline', () => {
      console.log('[SmartMed Sync] Network offline. Operating in Local IndexedDB Mode.');
      isOnline = false;
      this.setSyncState('offline');
    });

    // Check periodically every 45s when online
    if (syncTimer) clearInterval(syncTimer);
    syncTimer = setInterval(() => {
      if (isOnline) {
        this.triggerSync(true); // silent sync
      }
    }, 45000);

    // Initial check
    this.notifyStatus();
  },

  /**
   * Trigger synchronization with debounce
   */
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
      console.warn('[SmartMed Sync] Auto-sync encountered non-fatal error:', err.message);
      const pending = await this.getPendingCount();
      this.setSyncState(pending > 0 ? 'offline' : 'synced');
    }
  },

  /**
   * Executes full two-way synchronization
   */
  async syncAll() {
    if (!isOnline) return;

    // 1. Sync Pending SMS Queue
    await this.syncPendingSms();

    // 2. Sync Database if Supabase is configured
    if (isSupabaseConfigured() && supabase) {
      await this.syncProfilesToRemote();
      await this.syncMedicinesToRemote();
      await this.syncLogsToRemote();
      await this.syncRemoteMedicinesToLocal();
    }
  },

  /**
   * Synchronize pending SMS messages (Requirement #11)
   * Avoids sending outdated reminders (>25 minutes old)
   */
  async syncPendingSms() {
    try {
      const pendingList = await db.pending_sms.where('status').equals('pending').toArray();
      const now = Date.now();

      for (const item of pendingList) {
        // Expiry check: Drop if scheduled time or creation time was over 25 minutes ago
        const ageMinutes = (now - new Date(item.created_at).getTime()) / (1000 * 60);

        if (ageMinutes > 25) {
          console.log(`[SmartMed SMS] Dropping expired reminder for ${item.phone}: "${item.message}"`);
          await db.pending_sms.update(item.id, {
            status: 'expired',
            error: 'Reminder expired while offline (>25 mins past schedule)'
          });
          continue;
        }

        // Send to backend SMS service
        try {
          const res = await fetch('/api/sms/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone: item.phone,
              message: item.message,
              medicineName: item.medicine_name,
              scheduledTime: item.scheduled_for,
              reminderType: item.reminder_type
            })
          });

          if (res.ok) {
            await db.pending_sms.update(item.id, { status: 'sent', sent_at: new Date().toISOString() });
          } else {
            const errData = await res.json().catch(() => ({}));
            await db.pending_sms.update(item.id, { error: errData.error || 'Server error' });
          }
        } catch (e) {
          // Keep as pending for next sync
          console.warn('[SmartMed SMS] Server not reached, will retry when online:', e.message);
          break;
        }
      }
    } catch (e) {
      console.warn('Error syncing pending SMS:', e);
    }
  },

  /**
   * Sync Profiles to Supabase
   */
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
        await supabase.from('profiles').upsert(payload);
      }
    } catch (e) {
      console.warn('Sync profiles to Supabase:', e.message);
    }
  },

  /**
   * Sync Local Medicines to Supabase
   */
  async syncMedicinesToRemote() {
    try {
      const pendingMeds = await db.medicines
        .filter((m) => m._syncStatus && m._syncStatus !== 'synced')
        .toArray();

      for (const med of pendingMeds) {
        if (med._syncStatus === 'pending_delete') {
          await supabase.from('medicines').delete().eq('id', med.id);
          await db.medicines.delete(med.id);
        } else {
          // pending_insert or pending_update
          const remotePayload = { ...med };
          delete remotePayload._syncStatus;

          const { error } = await supabase.from('medicines').upsert(remotePayload);
          if (!error) {
            await db.medicines.update(med.id, { _syncStatus: 'synced' });
          }
        }
      }
    } catch (e) {
      console.warn('Sync medicines to Supabase:', e.message);
    }
  },

  /**
   * Sync Local Medicine Logs to Supabase
   */
  async syncLogsToRemote() {
    try {
      const pendingLogs = await db.medicine_logs
        .filter((l) => l._syncStatus && l._syncStatus !== 'synced')
        .toArray();

      for (const log of pendingLogs) {
        const remotePayload = { ...log };
        delete remotePayload._syncStatus;

        const { error } = await supabase.from('medicine_logs').upsert(remotePayload);
        if (!error) {
          await db.medicine_logs.update(log.id, { _syncStatus: 'synced' });
        }
      }
    } catch (e) {
      console.warn('Sync logs to Supabase:', e.message);
    }
  },

  /**
   * Pull Remote Medicines into Local IndexedDB
   */
  async syncRemoteMedicinesToLocal() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('medicines')
        .select('*')
        .eq('user_id', user.id);

      if (!error && data) {
        for (const remoteMed of data) {
          const local = await db.medicines.get(remoteMed.id);
          if (!local || local._syncStatus === 'synced') {
            await db.medicines.put({ ...remoteMed, _syncStatus: 'synced' });
          }
        }
      }
    } catch (e) {
      console.warn('Sync remote medicines to local:', e.message);
    }
  }
};
