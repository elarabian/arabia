const KEY = 'arabia:control:v1';
let localRecord = {};

async function redis(command) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!response.ok) throw new Error(`Redis ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(String(data.error));
  return data.result;
}

async function readRecord() {
  const values = await redis(['MGET', `${KEY}:snapshot`, `${KEY}:command`, `${KEY}:status`]);
  if (values === null) return localRecord;
  const snapshot = values[0] ? JSON.parse(values[0]) : {};
  const command = values[1] ? JSON.parse(values[1]) : {};
  const status = values[2] ? JSON.parse(values[2]) : {};
  return { ...snapshot, ...command, ...status };
}

async function writePart(part, value) {
  const result = await redis(['SET', `${KEY}:${part}`, JSON.stringify(value)]);
  if (result === null) localRecord = { ...localRecord, ...value };
}

export default async function handler(request, response) {
  const send = (status, value) => {
    response.statusCode = status;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(JSON.stringify(value));
  };
  if (request.method !== 'GET' && request.method !== 'POST') {
    response.setHeader('Allow', 'GET, POST');
    send(405, { error: 'Method not allowed' });
    return;
  }
  response.setHeader('Cache-Control', 'no-store');
  if (process.env.VERCEL && (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN)) {
    send(503, { error: 'UPSTASH_REDIS_REST_URL ve UPSTASH_REDIS_REST_TOKEN gerekli' });
    return;
  }
  if (request.method === 'POST' && process.env.VERCEL && !process.env.CONTROL_SECRET) {
    send(503, { error: 'CONTROL_SECRET gerekli' });
    return;
  }
  try {
    if (request.method === 'GET') {
      send(200, await readRecord());
      return;
    }
    if (process.env.CONTROL_SECRET && request.headers['x-control-key'] !== process.env.CONTROL_SECRET) {
      send(403, { error: 'Kontrol anahtarı geçersiz' });
      return;
    }
    const rawBody = request.body ?? await new Promise((resolve, reject) => {
      const chunks = [];
      request.on('data', chunk => chunks.push(chunk));
      request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      request.on('error', reject);
    });
    const body = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
    if (body?.type === 'control' && body.snapshot && typeof body.snapshot === 'object') {
      const revision = `${Date.now()}-${Math.random()}`;
      await writePart('snapshot', { snapshot: body.snapshot, revision });
      send(200, { ok: true, revision });
    } else if (body?.type === 'command' && ['pause', 'restart', 'reconnect'].includes(body.command)) {
      const command = { type: body.command,
        id: typeof body.id === 'string' && body.id.length < 100 ? body.id : `${Date.now()}-${Math.random()}` };
      await writePart('command', { command });
      send(200, { ok: true, command });
    } else if (body?.type === 'status' && body.status && typeof body.status === 'object') {
      await writePart('status', { status: body.status, statusAt: Date.now() });
      send(200, { ok: true });
    } else {
      send(400, { error: 'Geçersiz kontrol olayı' });
    }
  } catch (error) {
    send(500, { error: error?.message || 'Kontrol eşitleme hatası' });
  }
}
