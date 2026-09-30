import Dexie from 'dexie';

/**
 * SmartMed Local Dexie.js Database
 * Offline-first immediate data store
 */
export const db = new Dexie('SmartMedLocalDB');

db.version(1).stores({
  profiles: 'id, email, mobile_number, created_at',
  medicines: 'id, user_id, schedule_time, _syncStatus, created_at',
  medicine_logs: 'id, medicine_id, user_id, scheduled_time, status, created_at, _syncStatus',
  pending_sms: 'id, user_id, medicine_id, phone, status, scheduled_for, created_at',
  settings: 'user_id'
});

/**
 * Secure password hashing using Web Crypto API (SHA-256 + Salt)
 * Raw passwords are NEVER stored in localStorage or IndexedDB (Requirement #5)
 */
export async function hashPassword(password) {
  const salted = (password || '') + '_smartmed_secure_salt_2026';
  const cryptoObj = typeof globalThis !== 'undefined' ? globalThis.crypto : null;

  if (cryptoObj && cryptoObj.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(salted);
    const hashBuffer = await cryptoObj.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Pure JS fallback if SubtleCrypto is unavailable
  let hash = 0;
  for (let i = 0; i < salted.length; i++) {
    const char = salted.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return 'h_' + Math.abs(hash).toString(16);
}

/**
 * Validates Indian Mobile Numbers (Requirement #6)
 * Accepts +91 9876543210, 9876543210, 09876543210
 * Validates 10-digit length and starting digit (6, 7, 8, 9)
 */
export function validateIndianMobile(phone) {
  if (!phone || typeof phone !== 'string') {
    return { valid: false, error: 'Mobile number is required.' };
  }
  const cleaned = phone.trim().replace(/[\s\-\(\)]/g, '');

  let digits = '';
  if (cleaned.startsWith('+91')) {
    digits = cleaned.slice(3);
  } else if (cleaned.startsWith('91') && cleaned.length === 12) {
    digits = cleaned.slice(2);
  } else if (cleaned.startsWith('0') && cleaned.length === 11) {
    digits = cleaned.slice(1);
  } else {
    digits = cleaned;
  }

  if (!/^\d{10}$/.test(digits)) {
    return {
      valid: false,
      error: 'Please enter a valid 10-digit Indian mobile number (e.g. +91 98765 43210).'
    };
  }

  if (!/^[6-9]/.test(digits)) {
    return {
      valid: false,
      error: 'Indian mobile numbers must start with 6, 7, 8, or 9.'
    };
  }

  if (/^(\d)\1{9}$/.test(digits)) {
    return {
      valid: false,
      error: 'Please enter a genuine, active mobile number.'
    };
  }

  return {
    valid: true,
    formatted: `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`,
    e164: `+91${digits}`,
    rawDigits: digits
  };
}
