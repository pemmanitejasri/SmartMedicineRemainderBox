
import { api } from './services/api';

const MAX_MEDICINES = 16;

let port = null;
let reader = null;
let writer = null;
let readerTask = null;
let reading = false;

let currentStatus = 'disconnected';
let lastConfirmedRtcTime = null;

const statusSubscribers = new Set();
const eventSubscribers = new Set();
const rawMessageSubscribers = new Set();
const rtcTimeSubscribers = new Set();

const pendingAcks = new Map();

let commandQueue = Promise.resolve();

const delay = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

export function formatTo24Hour(timeStr) {
  if (!timeStr) return '';

  const clean = String(timeStr).trim();

  const match = clean.match(
    /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i
  );

  if (!match) return '';

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();

  if (meridiem === 'PM' && hour < 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return '';
  }

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function isSerialSupported() {
  return typeof navigator !== 'undefined' &&
    'serial' in navigator;
}

export function getArduinoStatus() {
  return currentStatus;
}

export function isArduinoConnected() {
  return currentStatus === 'connected' &&
    port !== null &&
    writer !== null;
}

export function getLastRtcTime() {
  return lastConfirmedRtcTime;
}

function notifyStatus(status) {
  currentStatus = status;

  statusSubscribers.forEach(fn => {
    try {
      fn(status);
    } catch (error) {
      console.error(error);
    }
  });
}

export function subscribeArduinoStatus(callback) {
  statusSubscribers.add(callback);
  callback(currentStatus);

  return () => statusSubscribers.delete(callback);
}

export function subscribeBoxRtcTime(callback) {
  rtcTimeSubscribers.add(callback);

  if (lastConfirmedRtcTime) {
    callback(lastConfirmedRtcTime);
  }

  return () => rtcTimeSubscribers.delete(callback);
}

export function subscribeArduinoEvents(callback) {
  eventSubscribers.add(callback);

  return () => eventSubscribers.delete(callback);
}

export function subscribeRawMessages(callback) {
  rawMessageSubscribers.add(callback);

  return () => rawMessageSubscribers.delete(callback);
}

function notifyEvent(event) {
  eventSubscribers.forEach(fn => {
    try {
      fn(event);
    } catch (error) {
      console.error(error);
    }
  });
}

function notifyRtcTime(time) {
  lastConfirmedRtcTime = time;

  rtcTimeSubscribers.forEach(fn => {
    try {
      fn(time);
    } catch (error) {
      console.error(error);
    }
  });
}

function publishRawMessage(line) {
  rawMessageSubscribers.forEach(fn => {
    try {
      fn(line);
    } catch (error) {
      console.error(error);
    }
  });
}

function resolveAck(action, line) {
  const pending = pendingAcks.get(action);

  if (!pending) {
    console.warn('[SmartMed] Unexpected ACK:', line);
    return;
  }

  clearTimeout(pending.timer);
  pendingAcks.delete(action);
  pending.resolve(line);
}

function rejectAck(action, error) {
  const pending = pendingAcks.get(action);

  if (!pending) return;

  clearTimeout(pending.timer);
  pendingAcks.delete(action);
  pending.reject(error);
}

function rejectAllAcks(message) {
  for (const [action, pending] of pendingAcks.entries()) {
    clearTimeout(pending.timer);
    pending.reject(new Error(message));
    pendingAcks.delete(action);
  }
}

function handleIncomingLine(line) {
  console.log('[Arduino IN]:', line);

  if (line === 'PONG') {
    // Backward compatibility with older firmware versions.
    resolveAck('PING', 'ACK,PING,PONG');
    publishRawMessage(line);
    return;
  }

  if (line.startsWith('ACK,')) {
    const parts = line.split(',');
    resolveAck(parts[1]?.trim(), line);
    publishRawMessage(line);
    return;
  }

  if (line.startsWith('ERR,')) {
    const parts = line.split(',');
    const action = parts[1]?.trim();

    const supportedActions = [
      'PING',
      'SYNC_TIME',
      'GET_TIME',
      'SET',
      'DEL',
      'CLEAR',
      'TEST'
    ];

    if (supportedActions.includes(action)) {
      rejectAck(
        action,
        new Error(`Arduino error: ${line}`)
      );
    }

    publishRawMessage(line);
    return;
  }

  if (line.startsWith('TIME,')) {
    notifyRtcTime(line.substring(5).trim());
    publishRawMessage(line);
    return;
  }

  if (line.startsWith('ALARM_STARTED,')) {
    const parts = line.split(',');

    notifyEvent({
      type: 'ALARM_STARTED',
      medicineId: parts[1] || '',
      time: parts[2] || ''
    });

    publishRawMessage(line);
    return;
  }

  if (line.startsWith('MEDICINE_TAKEN,')) {
    const parts = line.split(',');

    handleMedicineTakenEvent(
      parts[1] || '',
      parts[2] || ''
    );

    publishRawMessage(line);
    return;
  }

  if (line === 'ALARM,STOPPED') {
    notifyEvent({
      type: 'ALARM_STOPPED'
    });

    publishRawMessage(line);
    return;
  }

  publishRawMessage(line);
}

async function startReaderLoop(currentPort, onMessageCallback) {
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (reading && currentPort === port) {
      if (!currentPort.readable) {
        throw new Error('Arduino serial reader is unavailable.');
      }

      const currentReader = currentPort.readable.getReader();
      reader = currentReader;

      try {
        while (reading && currentPort === port) {
          const { value, done } = await currentReader.read();

          if (done) break;
          if (!value) continue;

          buffer += decoder.decode(value, {
            stream: true
          });

          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || '';

          for (const raw of lines) {
            const line = raw.trim();

            if (!line) continue;

            handleIncomingLine(line);

            try {
              onMessageCallback?.(line);
            } catch (error) {
              console.error(
                '[SmartMed] Message callback error:',
                error
              );
            }
          }
        }
      } finally {
        try {
          currentReader.releaseLock();
        } catch (error) {}

        if (reader === currentReader) {
          reader = null;
        }
      }

      break;
    }
  } catch (error) {
    if (reading && currentPort === port) {
      console.error('[SmartMed Reader Error]:', error);

      reading = false;
      rejectAllAcks('Arduino serial reader stopped.');
      notifyStatus('disconnected');
    }
  }
}

async function executeSerialCommand(
  command,
  awaitAck = false,
  timeoutMs = 4000
) {
  if (!port || !writer || !port.writable) {
    throw new Error('Arduino serial port is not open.');
  }

  const cleanCommand = String(command).trim();
  const action = cleanCommand.split(',')[0];

  if (awaitAck && pendingAcks.has(action)) {
    throw new Error(
      `Another ${action} command is already pending.`
    );
  }

  let ackPromise = null;

  if (awaitAck) {
    ackPromise = new Promise((resolve, reject) => {
      const pending = {
        resolve,
        reject,
        timer: null
      };

      pending.timer = setTimeout(() => {
        if (pendingAcks.get(action) === pending) {
          pendingAcks.delete(action);
        }

        reject(
          new Error(`No ACK received for ${action}.`)
        );
      }, timeoutMs);

      pendingAcks.set(action, pending);
    });
  }

  try {
    console.log('[Arduino OUT]:', cleanCommand);

    await writer.write(
      new TextEncoder().encode(cleanCommand + '\n')
    );
  } catch (error) {
    if (awaitAck) {
      rejectAck(action, error);
    }

    throw error;
  }

  if (awaitAck) {
    return await ackPromise;
  }

  return true;
}

export function sendToArduino(
  command,
  awaitAck = false,
  timeoutMs = 4000
) {
  const task = commandQueue.then(() =>
    executeSerialCommand(command, awaitAck, timeoutMs)
  );

  commandQueue = task.catch(() => {});

  return task;
}

export async function connectArduino(
  onMessageCallback,
  onStatusCallback
) {
  if (!isSerialSupported()) {
    throw new Error(
      'Web Serial is not supported. Use desktop Chrome or Edge.'
    );
  }

  if (isArduinoConnected()) {
    return {
      connected: true,
      alreadyConnected: true
    };
  }

  if (currentStatus === 'connecting') {
    throw new Error('Arduino connection is already in progress.');
  }

  notifyStatus('connecting');

  let selectedPort = null;

  try {
    selectedPort = await navigator.serial.requestPort();

    await selectedPort.open({
      baudRate: 9600
    });

    port = selectedPort;
    writer = port.writable.getWriter();

    reading = true;
    reader = null;
    lastConfirmedRtcTime = null;
    commandQueue = Promise.resolve();

    readerTask = startReaderLoop(
      port,
      onMessageCallback
    );

    console.log('[SmartMed] USB opened.');
    console.log('[SmartMed] Waiting for Arduino reset...');

    await delay(2000);

    let pingSuccess = false;
    let lastError = null;

    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        console.log(`[SmartMed] PING attempt ${attempt}`);

        await sendToArduino('PING', true, 4000);

        pingSuccess = true;
        break;
      } catch (error) {
        lastError = error;

        console.warn(
          `[SmartMed] PING attempt ${attempt} failed:`,
          error.message
        );

        await delay(700);
      }
    }

    if (!pingSuccess) {
      throw lastError || new Error('Arduino PING failed.');
    }

    notifyStatus('connected');
    onStatusCallback?.('connected');

    console.log('[SmartMed] Two-way communication verified.');

    let clockSynced = false;

    try {
      clockSynced = await syncCurrentTimeToArduino();
    } catch (error) {
      console.error(
        '[SmartMed] RTC sync failed:',
        error.message
      );
    }

    let rtcTimeRequested = false;

    if (clockSynced) {
      try {
        await sendToArduino('GET_TIME', false);
        rtcTimeRequested = true;
      } catch (error) {
        console.error(
          '[SmartMed] GET_TIME failed:',
          error.message
        );
      }
    }

    let scheduleSynced = false;

    if (clockSynced) {
      scheduleSynced = await resyncScheduleFromDb();
    } else {
      console.error(
        '[SmartMed] Schedule sync skipped because clock sync failed.'
      );
    }

    return {
      connected: true,
      clockSynced,
      rtcTimeRequested,
      scheduleSynced
    };

  } catch (error) {
    console.error('[SmartMed] Connection failed:', error);

    reading = false;
    rejectAllAcks('Connection failed.');

    try {
      if (reader) {
        await reader.cancel();
      }
    } catch (e) {}

    try {
      if (readerTask) {
        await readerTask;
      }
    } catch (e) {}

    try {
      if (writer) {
        writer.releaseLock();
      }
    } catch (e) {}

    try {
      if (selectedPort) {
        await selectedPort.close();
      }
    } catch (e) {}

    port = null;
    reader = null;
    writer = null;
    readerTask = null;

    notifyStatus('disconnected');
    onStatusCallback?.('disconnected');

    throw error;
  }
}

export async function sendMedicineReminder(medicine) {
  if (!isArduinoConnected()) {
    throw new Error('Arduino is disconnected.');
  }

  const rawTime =
    medicine?.schedule_time ||
    medicine?.time;

  const id = String(medicine?.id || '');

  const time24 = formatTo24Hour(rawTime);

  if (!time24) {
    throw new Error('Invalid medicine reminder time.');
  }

  if (!id || id.includes(',') || id.length > 36) {
    throw new Error('Invalid medicine ID.');
  }

  const ack = await sendToArduino(
    `SET,${time24},${id}`,
    true,
    6000
  );

  return {
    success: true,
    id,
    time24,
    ack
  };
}

export async function removeMedicineReminder(medicineId) {
  if (!isArduinoConnected()) {
    return false;
  }

  const id = String(medicineId || '');

  if (!id || id.includes(',') || id.length > 36) {
    throw new Error('Invalid medicine ID.');
  }

  await sendToArduino(
    `DEL,${id}`,
    true,
    6000
  );

  return true;
}

export async function syncCurrentTimeToArduino() {
  if (!isArduinoConnected()) {
    throw new Error('Arduino is not connected.');
  }

  const now = new Date();

  const command = [
    'SYNC_TIME',
    now.getFullYear(),
    now.getMonth() + 1,
    now.getDate(),
    now.getHours(),
    now.getMinutes(),
    now.getSeconds()
  ].join(',');

  await sendToArduino(
    command,
    true,
    6000
  );

  console.log('[SmartMed] RTC clock synchronized.');

  return true;
}

export async function triggerHardwareTest() {
  if (!isArduinoConnected()) {
    throw new Error('Arduino is disconnected.');
  }

  const result = await sendToArduino(
    'TEST',
    true,
    6000
  );

  return typeof result === 'string' && result.startsWith('ACK,TEST,');
}

export async function resyncScheduleFromDb() {
  if (!isArduinoConnected()) {
    return false;
  }

  try {
    const schedule = await api.getTodaySchedule();

    if (!Array.isArray(schedule)) {
      throw new Error('Invalid schedule returned by database.');
    }

    const activeMedicines = schedule.filter(
      med => med.status !== 'taken'
    );

    if (activeMedicines.length > MAX_MEDICINES) {
      throw new Error(
        `Maximum ${MAX_MEDICINES} medicine reminders supported. Found ${activeMedicines.length}.`
      );
    }

    // Validate every reminder BEFORE clearing Arduino memory.
    const validatedMedicines = activeMedicines.map((med, index) => {
      const time = formatTo24Hour(
        med.schedule_time || med.time
      );

      const id = String(med.id || '');

      if (!time || !id || id.includes(',') || id.length > 36) {
        throw new Error(
          `Invalid reminder data at item ${index + 1}: ${med.name || 'medicine'}.`
        );
      }

      return {
        id,
        time,
        name: med.name || 'Medicine'
      };
    });

    // Clear old reminders only after validation succeeds.
    await sendToArduino('CLEAR', true, 6000);

    let syncedCount = 0;

    for (const med of validatedMedicines) {
      try {
        await sendToArduino(
          `SET,${med.time},${med.id}`,
          true,
          6000
        );

        syncedCount++;

        console.log(
          '[SmartMed] Reminder synchronized:',
          med.name,
          med.time
        );
      } catch (error) {
        throw new Error(
          `Failed to synchronize ${med.name}: ${error.message}. ${syncedCount} reminders were synchronized before the failure.`
        );
      }
    }

    console.log(
      `[SmartMed] ${syncedCount} of ${MAX_MEDICINES} maximum reminders synchronized.`
    );

    return true;

  } catch (error) {
    console.error(
      '[SmartMed] Schedule synchronization failed:',
      error.message
    );

    return false;
  }
}

async function handleMedicineTakenEvent(id, time) {
  const actualTime =
    time || new Date().toLocaleTimeString();

  try {
    await api.receiveHardwareEvent({
      medicineId: id === 'default' ? null : id,
      takenAt: actualTime,
      source: 'physical_button'
    });
  } catch (error) {
    console.error(
      '[SmartMed] Medicine event save failed:',
      error
    );
  }

  notifyEvent({
    type: 'MEDICINE_TAKEN',
    medicineId: id,
    takenAt: actualTime,
    source: 'physical_button'
  });
}

export async function disconnectArduino() {
  reading = false;

  const oldPort = port;
  const oldReader = reader;
  const oldWriter = writer;
  const oldReaderTask = readerTask;

  port = null;
  reader = null;
  writer = null;
  readerTask = null;

  lastConfirmedRtcTime = null;

  rejectAllAcks('Arduino disconnected.');

  try {
    if (oldReader) {
      await oldReader.cancel();
    }
  } catch (e) {}

  try {
    if (oldReaderTask) {
      await oldReaderTask;
    }
  } catch (e) {}

  try {
    if (oldWriter) {
      oldWriter.releaseLock();
    }
  } catch (e) {}

  try {
    if (oldPort) {
      await oldPort.close();
    }
  } catch (e) {}

  notifyStatus('disconnected');

  console.log('[SmartMed] Disconnected.');
}