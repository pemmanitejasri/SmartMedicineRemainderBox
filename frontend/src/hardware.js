const API = 'http://localhost:5000';

export async function getHardwareStatus() {
  const response = await fetch(`${API}/api/hardware/status`);
  const result = await response.json();

  if (!response.ok) throw new Error(result.error || 'Status failed');

  return result;
}

export async function syncHardwareTime() {
  const response = await fetch(`${API}/api/hardware/sync-time`, {
    method: 'POST'
  });

  const result = await response.json();

  if (!response.ok) throw new Error(result.error);

  return result;
}

export async function addHardwareMedicine(medicine) {
  const response = await fetch(`${API}/api/hardware/medicine`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: String(medicine.id),
      name: medicine.name,
      time: medicine.time
    })
  });

  const result = await response.json();

  if (!response.ok) throw new Error(result.error);

  return result;
}

export async function deleteHardwareMedicine(id) {
  const response = await fetch(`${API}/api/hardware/medicine/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: String(id) })
  });

  const result = await response.json();

  if (!response.ok) throw new Error(result.error);

  return result;
}

export async function testHardwareAlarm() {
  const response = await fetch(`${API}/api/hardware/test`, {
    method: 'POST'
  });

  const result = await response.json();

  if (!response.ok) throw new Error(result.error);

  return result;
}

export function listenHardwareEvents(onEvent) {
  const stream = new EventSource(`${API}/api/hardware/stream`);

  stream.onmessage = event => {
    try {
      onEvent(JSON.parse(event.data));
    } catch (error) {
      console.error('Hardware event error:', error);
    }
  };

  stream.onerror = error => {
    console.error('Hardware stream error:', error);
  };

  return () => stream.close();
}