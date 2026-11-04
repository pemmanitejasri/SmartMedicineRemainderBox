// SmartMed IoT Hardware Bridge Server
// Receives events from physical Smart Medicine Box (Arduino/ESP32) and synchronizes with Web Application

import http from 'http';

const PORT = process.env.PORT || 5000;

// In-memory clients list for WebSocket / SSE real-time broadcast
const sseClients = new Set();

const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (req.method === 'GET' && req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', product: 'SmartMed', timestamp: new Date().toISOString() }));
    return;
  }

  // Real-time SSE stream endpoint for Web Dashboard
  if (req.method === 'GET' && req.url === '/api/hardware/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write('data: {"type":"connected","message":"Connected to SmartMed Hardware Stream"}\n\n');
    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  // Hardware event ingestion endpoint: POST /api/hardware/event
  // Payload: { "medicineId": "12", "status": "taken", "takenAt": "2026-09-28T22:04:00" }
  if (req.method === 'POST' && req.url === '/api/hardware/event') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        console.log('[SmartMed Hardware Event Received]:', payload);

        const eventData = {
          type: 'medicine_status_change',
          medicineId: payload.medicineId || payload.id,
          status: payload.status || 'taken',
          takenAt: payload.takenAt || new Date().toISOString(),
          slot: payload.slot || 1,
          deviceId: payload.deviceId || 'SmartMed-Box-01',
          source: payload.source || payload.method || 'physical_button',
          method: payload.method || 'physical_button'
        };

        // Broadcast to all connected web dashboards
        const sseMessage = `data: ${JSON.stringify(eventData)}\n\n`;
        sseClients.forEach(client => {
          client.write(sseMessage);
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, processed: eventData }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid JSON payload' }));
      }
    });
    return;
  }

  // SMS Dispatch Service (Requirement #9, #10, #11)
  // Endpoints: POST /api/sms/send, GET /api/sms/logs
  if (req.method === 'POST' && req.url === '/api/sms/send') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const { phone, message, medicineName, scheduledTime, reminderType } = payload;

        if (!phone || !message) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Phone number and message are required.' }));
          return;
        }

        const smsResult = await sendSmsNotification({
          phone,
          message,
          medicineName,
          scheduledTime,
          reminderType
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, result: smsResult }));
      } catch (err) {
        console.error('[SmartMed SMS Error]:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/api/sms/logs') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', logs: smsLogs.slice(-50) }));
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// In-memory SMS logs for monitoring and audit
const smsLogs = [];

/**
 * Dispatches an SMS using configured provider (Twilio, MSG91, Textlocal) or console fallback.
 * Provider credentials are kept strictly in backend environment variables.
 */
async function sendSmsNotification({ phone, message, medicineName, scheduledTime, reminderType }) {
  const provider = (process.env.SMS_PROVIDER || 'console').toLowerCase();
  const senderId = process.env.SMS_SENDER_ID || 'SMTMED';
  const apiKey = process.env.SMS_API_KEY || process.env.SMS_API_SECRET;

  const logEntry = {
    id: 'sms_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    phone,
    message,
    medicineName,
    scheduledTime,
    reminderType: reminderType || 'reminder',
    provider,
    timestamp: new Date().toISOString(),
    status: 'sent'
  };

  console.log(`\n======================================================`);
  console.log(`[SmartMed SMS Gateway] Triggering SMS Notification`);
  console.log(`Recipient Mobile: ${phone}`);
  console.log(`Message Content:  "${message}"`);
  console.log(`Configured Provider: ${provider}`);
  console.log(`======================================================\n`);

  try {
    if (provider === 'twilio' && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const fromNumber = process.env.TWILIO_PHONE_NUMBER || senderId;

      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
      const params = new URLSearchParams();
      params.append('To', phone);
      params.append('From', fromNumber);
      params.append('Body', message);

      const response = await fetch(twilioUrl, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      });

      const resData = await response.json();
      logEntry.providerResponse = resData;
      logEntry.status = response.ok ? 'sent' : 'failed';
    } else if (provider === 'msg91' && apiKey) {
      // MSG91 REST API
      const msg91Url = 'https://api.msg91.com/api/v2/sendsms';
      const response = await fetch(msg91Url, {
        method: 'POST',
        headers: {
          'authkey': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sender: senderId,
          route: '4',
          country: '91',
          sms: [{ message, to: [phone.replace(/^\+91/, '')] }]
        })
      });
      logEntry.providerResponse = await response.json();
    } else if (provider === 'textlocal' && apiKey) {
      // Textlocal REST API
      const tlUrl = 'https://api.textlocal.in/send/';
      const params = new URLSearchParams();
      params.append('apikey', apiKey);
      params.append('numbers', phone.replace(/^\+/, ''));
      params.append('message', encodeURIComponent(message));
      params.append('sender', senderId);

      const response = await fetch(tlUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      });
      logEntry.providerResponse = await response.json();
    } else {
      // Default Development / Out-of-the-box Simulation Fallback
      logEntry.simulated = true;
      logEntry.status = 'sent (simulated)';
      console.log(`[SmartMed SMS Simulation] SMS successfully simulated for mobile: ${phone}`);
    }
  } catch (err) {
    logEntry.status = 'failed';
    logEntry.error = err.message;
    console.error('[SmartMed SMS Dispatch Exception]:', err.message);
  }

  smsLogs.push(logEntry);
  return logEntry;
}

server.listen(PORT, () => {
  console.log(`[SmartMed] IoT Hardware Bridge Server running on http://localhost:${PORT}`);
});
