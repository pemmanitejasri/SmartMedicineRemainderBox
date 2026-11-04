import { supabase, isSupabaseConfigured } from './supabase.js';
import { db, hashPassword, validateIndianMobile } from './localDb.js';
import { syncService } from './syncService.js';

// Storage keys for backward compatibility and test runners
const STORAGE_KEYS = {
  USERS: 'smartmed_db_users',
  SESSION: 'smartmed_auth_session',
  MEDICINES_PREFIX: 'smartmed_db_medicines_usr_',
  LOGS_PREFIX: 'smartmed_db_logs_usr_',
  SETTINGS_PREFIX: 'smartmed_db_settings_usr_',
  THEME: 'smartmed_theme'
};

function readStorage(key, fallback = null) {
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const val = localStorage.getItem(key);
    return val ? JSON.parse(val) : fallback;
  } catch (e) {
    return fallback;
  }
}

function writeStorage(key, val) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    console.error(`Error writing ${key}:`, e);
  }
}

// Event subscribers
const authListeners = new Set();
const hardwareListeners = new Set();

// Initialize background sync listener
if (typeof window !== 'undefined') {
  syncService.init();
}

export const api = {
  validateIndianMobile,

  // =========================================================================
  // 1. Offline-First Authentication & User Profile System
  // =========================================================================

  async getCurrentSession() {
    // 1. Check local session first
    const localSession = readStorage(STORAGE_KEYS.SESSION, null);

    // 2. If online and Supabase is configured, verify remote session
    if (syncService.getIsOnline() && isSupabaseConfigured() && supabase) {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (!error && session) {
          // Fetch user profile from Dexie or remote
          const localProfile = await db.profiles.get(session.user.id).catch(() => null);

          const user = {
            id: session.user.id,
            email: session.user.email,
            name: localProfile?.full_name || session.user.user_metadata?.name || session.user.email.split('@')[0],
            mobile_number: localProfile?.mobile_number || session.user.user_metadata?.mobile_number || ''
          };

          const validSession = { user, token: session.access_token };
          writeStorage(STORAGE_KEYS.SESSION, validSession);
          return validSession;
        }
      } catch (e) {
        console.warn('Supabase getSession error, falling back to local offline session:', e);
      }
    }

    return localSession;
  },

  async getCurrentUser() {
    const session = await this.getCurrentSession();
    if (!session || !session.user) return null;

    // Enrich with local profile if present
    try {
      const profile = await db.profiles.get(session.user.id);
      if (profile) {
        return {
          ...session.user,
          name: profile.full_name || session.user.name,
          mobile_number: profile.mobile_number || session.user.mobile_number || ''
        };
      }
    } catch (e) {
      // Ignore in mock/test
    }

    return session.user;
  },

  async getUserProfile(userId) {
    if (!userId) return null;
    try {
      const profile = await db.profiles.get(userId);
      if (profile) return profile;
    } catch (e) {}

    // Fallback to local users list
    const users = readStorage(STORAGE_KEYS.USERS, []);
    return users.find((u) => u.id === userId) || null;
  },

  /**
   * User Registration with Full Name, Email, Mobile Number, Password
   * Requirements #6 & #8: Row Level Security + Profiles table
   */
  async signUp({ name, email, mobile_number, password }) {
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanName = (name || '').trim();

    if (!cleanName) {
      throw new Error('Please enter your full name.');
    }
    if (!cleanEmail || !password) {
      throw new Error('Email and password are required.');
    }
    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }

    // Validate Mobile Number (Requirement #6)
    let validatedMobile = '';
    if (mobile_number) {
      const mobileCheck = validateIndianMobile(mobile_number);
      if (!mobileCheck.valid) {
        throw new Error(mobileCheck.error);
      }
      validatedMobile = mobileCheck.formatted;
    }

    const passwordHash = await hashPassword(password);
    const userId = 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

    let createdUser = {
      id: userId,
      name: cleanName,
      email: cleanEmail,
      mobile_number: validatedMobile
    };

    let sessionToken = 'offline_session_' + Date.now();

    // If online and Supabase configured, attempt remote signup
    if (syncService.getIsOnline() && isSupabaseConfigured() && supabase) {
      try {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              name: cleanName,
              mobile_number: validatedMobile
            }
          }
        });

        if (error) throw error;

        if (data.user) {
          createdUser.id = data.user.id;
          sessionToken = data.session?.access_token || sessionToken;

          // Insert into Supabase profiles table
          await supabase.from('profiles').upsert({
            id: data.user.id,
            full_name: cleanName,
            email: cleanEmail,
            mobile_number: validatedMobile,
            created_at: new Date().toISOString()
          });
        }
      } catch (err) {
        console.warn('Supabase signup fallback to local DB:', err.message);
      }
    }

    // Store in local Dexie database for offline capability
    const profileRecord = {
      id: createdUser.id,
      full_name: cleanName,
      email: cleanEmail,
      mobile_number: validatedMobile,
      password_hash: passwordHash, // Never raw password!
      created_at: new Date().toISOString()
    };

    try {
      await db.profiles.put(profileRecord);
    } catch (e) {
      console.warn('Dexie profile store error:', e);
    }

    // Also update local storage users for node tests and backup
    const users = readStorage(STORAGE_KEYS.USERS, []);
    const existing = users.find((u) => u.email === cleanEmail);
    if (existing) {
      throw new Error('An account with this email already exists.');
    }

    users.push({
      ...profileRecord,
      name: cleanName
    });
    writeStorage(STORAGE_KEYS.USERS, users);

    const session = { user: createdUser, token: sessionToken };
    writeStorage(STORAGE_KEYS.SESSION, session);
    this.notifyAuthChange(createdUser);

    return { user: createdUser, session };
  },

  /**
   * User Login with Email or Mobile Number
   * Requirements #5 & #7: Offline login recognition, no raw passwords in DB
   */
  async login({ email, identifier, password, rememberMe = true }) {
    const rawIdentifier = (identifier || email || '').trim();
    if (!rawIdentifier || !password) {
      throw new Error('Please enter your email or mobile number, and password.');
    }

    const isEmail = rawIdentifier.includes('@');
    const cleanEmail = isEmail ? rawIdentifier.toLowerCase() : null;
    const isOnline = syncService.getIsOnline();

    // 1. Try Supabase if Online and identifier is Email
    if (isOnline && isSupabaseConfigured() && supabase && isEmail) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password
        });

        if (!error && data.user) {
          const remoteUser = data.user;
          const userMeta = remoteUser.user_metadata || {};

          // Cache profile locally in Dexie for future offline logins (Requirement #5)
          const passwordHash = await hashPassword(password);
          const profile = {
            id: remoteUser.id,
            full_name: userMeta.name || cleanEmail.split('@')[0],
            email: remoteUser.email,
            mobile_number: userMeta.mobile_number || '',
            password_hash: passwordHash,
            created_at: new Date().toISOString()
          };

          try {
            await db.profiles.put(profile);
          } catch (e) {}

          const user = {
            id: remoteUser.id,
            name: profile.full_name,
            email: remoteUser.email,
            mobile_number: profile.mobile_number
          };

          const session = { user, token: data.session?.access_token };
          writeStorage(STORAGE_KEYS.SESSION, session);
          this.notifyAuthChange(user);
          return { user, session };
        }
      } catch (e) {
        console.warn('Supabase signIn failed, checking local credentials:', e.message);
      }
    }

    // 2. Offline Login Recognition (Requirement #5)
    // Find profile in Dexie by Email or Mobile Number
    let foundProfile = null;
    try {
      if (isEmail) {
        foundProfile = await db.profiles.where('email').equalsIgnoreCase(cleanEmail).first();
      } else {
        // Search by mobile
        const cleanedDigits = rawIdentifier.replace(/[\s\-\(\)\+]/g, '').slice(-10);
        const allProfiles = await db.profiles.toArray();
        foundProfile = allProfiles.find((p) => {
          const pDigits = (p.mobile_number || '').replace(/[\s\-\(\)\+]/g, '').slice(-10);
          return pDigits === cleanedDigits;
        });
      }
    } catch (e) {
      console.warn('Dexie search error:', e);
    }

    // Fallback to localStorage users
    if (!foundProfile) {
      const users = readStorage(STORAGE_KEYS.USERS, []);
      if (isEmail) {
        foundProfile = users.find((u) => (u.email || '').toLowerCase() === cleanEmail);
      } else {
        const cleanedDigits = rawIdentifier.replace(/[\s\-\(\)\+]/g, '').slice(-10);
        foundProfile = users.find((u) => {
          const pDigits = (u.mobile_number || '').replace(/[\s\-\(\)\+]/g, '').slice(-10);
          return pDigits === cleanedDigits;
        });
      }
    }

    // If offline and user has NEVER logged in on this device:
    // Requirement #5: Display "You're offline. Please connect to the internet for first-time login."
    if (!foundProfile) {
      if (!isOnline) {
        throw new Error("You're offline. Please connect to the internet for first-time login.");
      }
      throw new Error('Account not found. Please verify your credentials or sign up.');
    }

    // Verify Password against stored SHA-256 hash (or plaintext during legacy migration)
    const enteredHash = await hashPassword(password);
    const isPasswordValid =
      foundProfile.password_hash === enteredHash ||
      foundProfile.password === password;

    if (!isPasswordValid) {
      throw new Error('Invalid email or password. Please check your credentials.');
    }

    const user = {
      id: foundProfile.id,
      name: foundProfile.full_name || foundProfile.name || foundProfile.email.split('@')[0],
      email: foundProfile.email,
      mobile_number: foundProfile.mobile_number || ''
    };

    const session = {
      user,
      token: 'session_' + Date.now()
    };

    writeStorage(STORAGE_KEYS.SESSION, session);
    this.notifyAuthChange(user);
    return { user, session };
  },

  async logout() {
    if (syncService.getIsOnline() && isSupabaseConfigured() && supabase) {
      try {
        await supabase.auth.signOut();
      } catch (e) {
        console.warn('Supabase signOut error:', e);
      }
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEYS.SESSION);
    }
    this.notifyAuthChange(null);
    return true;
  },

  onAuthStateChange(callback) {
    authListeners.add(callback);
    return () => authListeners.delete(callback);
  },

  notifyAuthChange(user) {
    authListeners.forEach((fn) => {
      try { fn(user); } catch (e) { console.error(e); }
    });
  },

  // =========================================================================
  // 2. User-Specific Medicines Database (Dexie.js Offline-First + Supabase Sync)
  // =========================================================================

  getUserMedicinesKey(userId) {
    return `${STORAGE_KEYS.MEDICINES_PREFIX}${userId}`;
  },

  getUserLogsKey(userId) {
    return `${STORAGE_KEYS.LOGS_PREFIX}${userId}`;
  },

  /**
   * Retrieves all medicines for the current user.
   * Immediate data source: Local IndexedDB / Dexie.js
   */
  async getMedicines() {
    const user = await this.getCurrentUser();
    if (!user) return [];

    let localMeds = [];

    // 1. Read from Dexie immediately
    try {
      localMeds = await db.medicines
        .where('user_id')
        .equals(user.id)
        .filter((m) => m._syncStatus !== 'pending_delete')
        .reverse()
        .sortBy('created_at');
    } catch (e) {
      console.warn('Dexie read failed, fallback to localStorage:', e);
    }

    // 2. If Dexie is empty, check localStorage backup
    if (!localMeds || localMeds.length === 0) {
      const stored = readStorage(this.getUserMedicinesKey(user.id), []);
      if (stored && stored.length > 0) {
        localMeds = stored;
        // Warm Dexie cache
        try {
          for (const m of stored) {
            await db.medicines.put({ ...m, _syncStatus: 'synced' });
          }
        } catch (e) {}
      }
    }

    // 3. Trigger silent background sync if online
    if (syncService.getIsOnline()) {
      syncService.triggerSync(true).catch(() => {});
    }

    return localMeds;
  },

  /**
   * Adds a new medicine.
   * Requirements #1, #2, #3: Saved locally immediately, never blocks on network error.
   */
  async addMedicine(medicineData) {
    const user = await this.getCurrentUser();
    if (!user) throw new Error('Authentication required to add medicine.');

    const newMed = {
      id: 'med_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      user_id: user.id,
      name: (medicineData.name || '').trim(),
      dosage: (medicineData.dosage || '').trim(),
      dosage_unit: medicineData.dosage_unit || 'mg',
      schedule_time: medicineData.schedule_time || medicineData.time || '08:00 AM',
      frequency: medicineData.frequency || 'Once a day',
      meal_instruction: medicineData.meal_instruction || medicineData.meal || 'After Meal',
      slot: Number(medicineData.slot || 1),
      start_date: medicineData.start_date || new Date().toISOString().split('T')[0],
      end_date: medicineData.end_date || null,
      notes: (medicineData.notes || '').trim(),
      created_at: new Date().toISOString(),
      _syncStatus: syncService.getIsOnline() ? 'pending_insert' : 'pending_insert'
    };

    // 1. Save locally to Dexie IndexedDB immediately
    try {
      await db.medicines.put(newMed);
    } catch (e) {
      console.warn('Dexie insert warning:', e);
    }

    // 2. Backup to localStorage for node testing & persistence
    const list = readStorage(this.getUserMedicinesKey(user.id), []);
    list.unshift(newMed);
    writeStorage(this.getUserMedicinesKey(user.id), list);

    // 3. Queue / trigger sync
    const isOnline = syncService.getIsOnline();
    if (isOnline) {
      syncService.triggerSync(true).catch(() => {});
    }

    return {
      ...newMed,
      isOfflineSaved: !isOnline
    };
  },

  async updateMedicine(id, updates) {
    const user = await this.getCurrentUser();
    if (!user) throw new Error('Authentication required.');

    // 1. Update in Dexie
    try {
      const existing = await db.medicines.get(id);
      if (existing) {
        await db.medicines.update(id, {
          ...updates,
          _syncStatus: 'pending_update'
        });
      }
    } catch (e) {}

    // 2. Update in localStorage
    const list = readStorage(this.getUserMedicinesKey(user.id), []);
    const updated = list.map((m) => (m.id === id ? { ...m, ...updates, _syncStatus: 'pending_update' } : m));
    writeStorage(this.getUserMedicinesKey(user.id), updated);

    // 3. Sync if online
    if (syncService.getIsOnline()) {
      syncService.triggerSync(true).catch(() => {});
    }

    return updated.find((m) => m.id === id);
  },

  async deleteMedicine(id) {
    const user = await this.getCurrentUser();
    if (!user) throw new Error('Authentication required.');

    // 1. Mark or delete in Dexie
    try {
      if (syncService.getIsOnline()) {
        await db.medicines.delete(id);
      } else {
        await db.medicines.update(id, { _syncStatus: 'pending_delete' });
      }
      // Also clean up local logs
      await db.medicine_logs.where('medicine_id').equals(id).delete();
    } catch (e) {}

    // 2. Remove from localStorage
    const list = readStorage(this.getUserMedicinesKey(user.id), []);
    const filtered = list.filter((m) => m.id !== id);
    writeStorage(this.getUserMedicinesKey(user.id), filtered);

    const logs = readStorage(this.getUserLogsKey(user.id), []);
    const filteredLogs = logs.filter((l) => l.medicine_id !== id);
    writeStorage(this.getUserLogsKey(user.id), filteredLogs);

    // 3. Trigger sync
    if (syncService.getIsOnline()) {
      syncService.triggerSync(true).catch(() => {});
    }

    return true;
  },

  // =========================================================================
  // 3. Medicine Logs & Today's Schedule
  // =========================================================================

  async getMedicineLogs() {
    const user = await this.getCurrentUser();
    if (!user) return [];

    let logs = [];
    try {
      logs = await db.medicine_logs
        .where('user_id')
        .equals(user.id)
        .reverse()
        .sortBy('created_at');
    } catch (e) {}

    if (!logs || logs.length === 0) {
      logs = readStorage(this.getUserLogsKey(user.id), []);
    }

    return logs;
  },

  calculateStatus(scheduledTimeStr, logForToday) {
    if (logForToday && logForToday.status === 'taken') {
      return { status: 'taken', takenAt: logForToday.taken_at, diffMinutes: null };
    }

    const now = new Date();
    const scheduledDate = new Date();

    const parts = (scheduledTimeStr || '').match(/(\d+):(\d+)\s*(AM|PM)?/i);
    if (!parts) {
      return { status: 'upcoming', takenAt: null, diffMinutes: null };
    }

    let hours = parseInt(parts[1], 10);
    const minutes = parseInt(parts[2], 10);
    const meridiem = parts[3] ? parts[3].toUpperCase() : null;

    if (meridiem === 'PM' && hours < 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;

    scheduledDate.setHours(hours, minutes, 0, 0);

    const diffMinutes = (scheduledDate.getTime() - now.getTime()) / (1000 * 60);

    // If scheduled time is more than 5 minutes in future -> upcoming
    if (diffMinutes > 5) {
      return { status: 'upcoming', takenAt: null, diffMinutes: Math.round(diffMinutes) };
    }
    // If within 5 minutes before up to 60 minutes after -> pending (due now / soon)
    if (diffMinutes <= 5 && diffMinutes >= -60) {
      return { status: 'pending', takenAt: null, diffMinutes: Math.round(diffMinutes) };
    }
    // If more than 60 minutes past -> missed
    return { status: 'missed', takenAt: null, diffMinutes: Math.round(diffMinutes) };
  },

  async getTodaySchedule() {
    const medicines = await this.getMedicines();
    const logs = await this.getMedicineLogs();

    const todayStr = new Date().toISOString().split('T')[0];

    return medicines.map((med) => {
      const todayLog = logs.find(
        (l) => l.medicine_id === med.id && (l.created_at || '').startsWith(todayStr)
      );

      const { status, takenAt, diffMinutes } = this.calculateStatus(med.schedule_time, todayLog);

      return {
        ...med,
        time: med.schedule_time,
        meal: med.meal_instruction,
        status,
        takenAt: takenAt || (todayLog?.status === 'taken' ? todayLog.taken_at : null),
        diffMinutes
      };
    });
  },

  async markMedicineTaken(medicineId, customTime = null, method = 'website') {
    const user = await this.getCurrentUser();
    if (!user) throw new Error('Authentication required.');

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const timeStr = customTime || now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    const medicines = await this.getMedicines();
    const med = medicines.find((m) => m.id === medicineId);

    const doseId = `${medicineId}_${todayStr}`;
    const logEntry = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      dose_id: doseId,
      medicine_id: medicineId,
      user_id: user.id,
      scheduled_time: med ? med.schedule_time : 'Scheduled',
      taken_at: timeStr,
      status: 'taken',
      method: method || 'website',
      created_at: now.toISOString(),
      _syncStatus: 'pending_insert'
    };

    // 1. Put into Dexie
    try {
      await db.medicine_logs.put(logEntry);
    } catch (e) {}

    // 2. Put into localStorage
    const logs = readStorage(this.getUserLogsKey(user.id), []);
    const existingIndex = logs.findIndex(
      (l) => l.medicine_id === medicineId && (l.created_at || '').startsWith(todayStr)
    );

    if (existingIndex >= 0) {
      logs[existingIndex].status = 'taken';
      logs[existingIndex].taken_at = timeStr;
      logs[existingIndex].method = method || 'website';
      logs[existingIndex].dose_id = doseId;
    } else {
      logs.unshift(logEntry);
    }
    writeStorage(this.getUserLogsKey(user.id), logs);

    // 3. Play audio confirmation
    this.playGentleChime('success');

    // 4. Background sync
    if (syncService.getIsOnline()) {
      syncService.triggerSync(true).catch(() => {});
    }

    return logEntry;
  },

  // =========================================================================
  // 4. Adherence & History
  // =========================================================================

  async getAdherenceStats() {
    const logs = await this.getMedicineLogs();
    const totalDoses = logs.length;
    const takenDoses = logs.filter((l) => l.status === 'taken').length;
    const missedDoses = logs.filter((l) => l.status === 'missed').length;
    const pendingDoses = logs.filter((l) => l.status === 'pending').length;

    const percentage = totalDoses > 0 ? Math.round((takenDoses / totalDoses) * 100) : 100;

    return {
      percentage,
      takenDoses,
      missedDoses,
      pendingDoses,
      totalDoses
    };
  },

  async getHistory(filter = 'all') {
    const medicines = await this.getMedicines();
    const logs = await this.getMedicineLogs();

    const medMap = new Map();
    medicines.forEach((m) => medMap.set(m.id, m));

    const todayStr = new Date().toISOString().split('T')[0];
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    let filtered = logs;
    if (filter === 'today') {
      filtered = logs.filter((l) => (l.created_at || '').startsWith(todayStr));
    } else if (filter === 'week') {
      filtered = logs.filter((l) => (l.created_at || '') >= sevenDaysAgo);
    } else if (filter === 'month') {
      filtered = logs.filter((l) => (l.created_at || '') >= thirtyDaysAgo);
    }

    return filtered.map((log) => {
      const med = medMap.get(log.medicine_id);
      const dateObj = new Date(log.created_at);
      const dateFormatted = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      return {
        id: log.id,
        dose_id: log.dose_id || `${log.medicine_id}_${log.created_at?.slice(0, 10)}`,
        date: dateFormatted,
        medicine: med ? med.name : 'Prescribed Medicine',
        dosage: med ? `${med.dosage} ${med.dosage_unit || ''}`.trim() : 'Standard dose',
        scheduled: log.scheduled_time || (med ? med.schedule_time : '—'),
        taken: log.taken_at || '—',
        status: log.status,
        method: log.method || 'website',
        slot: med?.slot || 1
      };
    });
  },

  // =========================================================================
  // 5. Intelligent SMS Reminder Queue (Requirements #9, #10, #11)
  // =========================================================================

  async queueSmsNotification({ medicine, reminderType = 'advance_5min' }) {
    const user = await this.getCurrentUser();
    if (!user || !user.mobile_number) return null;

    const phone = user.mobile_number;
    const medName = medicine.name;
    const dosage = `${medicine.dosage} ${medicine.dosage_unit || ''}`.trim();
    const scheduledTime = medicine.schedule_time || medicine.time;

    let message = '';
    if (reminderType === 'advance_5min') {
      message = `SmartMed Reminder: ${medName} ${dosage} is due in 5 minutes.`;
    } else if (reminderType === 'due_now') {
      message = `SmartMed: It is time to take your ${medName} ${dosage} medicine.`;
    } else {
      message = `SmartMed Reminder: Your ${medName} ${dosage} dose is due at ${scheduledTime}.`;
    }

    const smsRecord = {
      id: 'sms_q_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      user_id: user.id,
      medicine_id: medicine.id,
      medicine_name: medName,
      phone,
      message,
      reminder_type: reminderType,
      scheduled_for: scheduledTime,
      created_at: new Date().toISOString(),
      status: syncService.getIsOnline() ? 'sent' : 'pending',
      error: null
    };

    if (syncService.getIsOnline()) {
      try {
        const res = await fetch('/api/sms/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone,
            message,
            medicineName: medName,
            scheduledTime,
            reminderType
          })
        });
        if (res.ok) {
          smsRecord.status = 'sent';
        } else {
          smsRecord.status = 'pending';
        }
      } catch (err) {
        smsRecord.status = 'pending';
        console.log('[SmartMed SMS] Offline or server unreachable, SMS queued as pending.');
      }
    } else {
      smsRecord.status = 'pending';
      console.log('[SmartMed SMS] Offline mode: SMS queued for when internet returns.');
    }

    try {
      await db.pending_sms.put(smsRecord);
    } catch (e) {}

    return smsRecord;
  },

  async getPendingSms() {
    try {
      return await db.pending_sms.toArray();
    } catch (e) {
      return [];
    }
  },

  // =========================================================================
  // 6. Hardware Integration & IoT Signal Ingestion
  // =========================================================================

  subscribeHardware(callback) {
    hardwareListeners.add(callback);
    return () => hardwareListeners.delete(callback);
  },

  async receiveHardwareEvent(payload) {
    console.log('[SmartMed Hardware Event Received]:', payload);
    const now = new Date();
    const timeStr = payload.takenAt || now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    let targetMedicineId = payload.medicineId;

    // Safety resolution: if medicineId is missing or "default", identify the correct active reminder
    if (!targetMedicineId || targetMedicineId === 'default') {
      try {
        const schedule = await this.getTodaySchedule();
        const pendingMeds = schedule.filter((m) => m.status === 'pending' || m.status === 'upcoming');

        if (pendingMeds.length === 1) {
          targetMedicineId = pendingMeds[0].id;
        } else if (pendingMeds.length > 1) {
          // Check matching scheduled time
          const timeMatch = pendingMeds.filter((m) => {
            const rawTime = m.schedule_time || m.time || '';
            const parts = rawTime.match(/(\d+):(\d+)/);
            if (!parts) return false;
            return payload.takenAt && payload.takenAt.includes(parts[0]);
          });

          if (timeMatch.length === 1) {
            targetMedicineId = timeMatch[0].id;
          } else {
            console.warn('[SmartMed Hardware Event] Ambiguous reminder: multiple medicines match. Awaiting user confirmation.');
            hardwareListeners.forEach((fn) => {
              try {
                fn({
                  ...payload,
                  ambiguous: true,
                  matchingMeds: timeMatch.length > 0 ? timeMatch : pendingMeds,
                  receivedAt: timeStr
                });
              } catch (e) {
                console.error(e);
              }
            });
            return { success: false, ambiguous: true };
          }
        }
      } catch (e) {
        console.error('Error resolving hardware target medicine:', e);
      }
    }

    if (targetMedicineId) {
      await this.markMedicineTaken(targetMedicineId, timeStr, 'physical_button');
    }

    hardwareListeners.forEach((fn) => {
      try {
        fn({
          ...payload,
          medicineId: targetMedicineId,
          receivedAt: timeStr,
          source: 'physical_button'
        });
      } catch (e) {
        console.error(e);
      }
    });

    return { success: true, processedAt: timeStr, medicineId: targetMedicineId };
  },

  // =========================================================================
  // 7. Settings, Audio Chime & Theme Persistence (Requirement #18)
  // =========================================================================

  async getSettings() {
    const user = await this.getCurrentUser();
    const savedTheme = typeof localStorage !== 'undefined'
      ? localStorage.getItem(STORAGE_KEYS.THEME) || 'light'
      : 'light';

    const defaultSettings = {
      reminder5Min: true,
      reminderOnTime: true,
      soundEnabled: true,
      browserNotif: false,
      smsReminders: true,
      theme: savedTheme
    };

    if (!user) return defaultSettings;

    let userSettings = null;
    try {
      userSettings = await db.settings.get(user.id);
    } catch (e) {}

    if (!userSettings) {
      userSettings = readStorage(`${STORAGE_KEYS.SETTINGS_PREFIX}${user.id}`, defaultSettings);
    }

    // Ensure theme matches saved
    if (savedTheme) {
      userSettings.theme = savedTheme;
    }

    return userSettings;
  },

  async updateSettings(updates) {
    const user = await this.getCurrentUser();
    const current = await this.getSettings();
    const updated = { ...current, ...updates };

    if (updated.theme) {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEYS.THEME, updated.theme);
      }
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', updated.theme);
      }
    }

    if (user) {
      try {
        await db.settings.put({ user_id: user.id, ...updated });
      } catch (e) {}
      writeStorage(`${STORAGE_KEYS.SETTINGS_PREFIX}${user.id}`, updated);
    }

    return updated;
  },

  playGentleChime(type = 'reminder') {
    if (typeof window === 'undefined') return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();

      if (type === 'success') {
        const notes = [659.25, 830.61, 987.77];
        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);
          gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.12);
          gain.gain.linearRampToValueAtTime(0.14, ctx.currentTime + i * 0.12 + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.45);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime + i * 0.12);
          osc.stop(ctx.currentTime + i * 0.12 + 0.5);
        });
      } else {
        const notes = [523.25, 783.99];
        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.18);
          gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.18);
          gain.gain.linearRampToValueAtTime(0.16, ctx.currentTime + i * 0.18 + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.6);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime + i * 0.18);
          osc.stop(ctx.currentTime + i * 0.18 + 0.65);
        });
      }
    } catch (e) {
      console.warn('Audio playback blocked or unavailable:', e);
    }
  }
};
