// A bounded SSE bridge: the Node-only connector stays on the server while the
// browser reconnects before a Vercel Function reaches its duration limit.
export function createTikTokHandler(loadConnector = () => import(/* @vite-ignore */ 'tiktok-live-connector')) {
return async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    response.statusCode = 405;
    response.end('Method not allowed');
    return;
  }
  if (process.env.VITE_TIKTOK_ENABLED === 'false') {
    response.statusCode = 404;
    response.end('TikTok integration disabled');
    return;
  }
  const username = new URL(request.url, 'http://localhost').searchParams.get('username')?.trim().replace(/^@/, '');
  const requestedRoomId = new URL(request.url, 'http://localhost').searchParams.get('roomId');
  const relayAudience = new URL(request.url, 'http://localhost').searchParams.get('relay') === '1';
  const roomId = requestedRoomId && /^\d{5,30}$/.test(requestedRoomId) ? requestedRoomId : undefined;
  if (!username || !/^[\w.]{2,32}$/.test(username)) {
    response.statusCode = 400;
    response.end('Geçerli bir TikTok kullanıcı adı gerekli');
    return;
  }

  response.statusCode = 200;
  response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  response.setHeader('Cache-Control', 'no-cache, no-transform');
  response.setHeader('Connection', 'keep-alive');
  response.setHeader('X-Accel-Buffering', 'no');
  response.write('retry: 3000\n\n');

  let connection;
  let connected = false;
  let closed = false;
  let heartbeat;
  let audienceHeartbeat;
  let limit;
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  const audienceKey = `arabia:control:v1:audience`;
  const audienceViewers = new Map();
  const audienceEvents = [];
  let audienceStatus = 'connecting';
  let audienceMessage = '';
  let audienceWrite = Promise.resolve();
  const writeAudience = () => {
    if (!relayAudience || !redisUrl || !redisToken) return;
    const value = JSON.stringify({ audience: { username,
      viewers: [...audienceViewers.values()], events: audienceEvents,
      status: audienceStatus, message: audienceMessage }, audienceAt: Date.now() });
    audienceWrite = audienceWrite.catch(() => {}).then(async () => {
      const result = await fetch(redisUrl, {
        method: 'POST', signal: AbortSignal.timeout(5000),
        headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(['SET', audienceKey, value]),
      });
      if (!result.ok) throw new Error(`Audience Redis ${result.status}`);
    });
  };
  const send = (event, value) => {
    if (closed) return;
    response.write(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`);
    if (!relayAudience) return;
    if (event === 'viewer' && value?.id && value?.name) {
      audienceViewers.set(value.id, value);
      if (audienceViewers.size > 300) audienceViewers.delete(audienceViewers.keys().next().value);
    } else if (event === 'like' || event === 'chat' || event === 'gift') {
      audienceEvents.push({ id: `${Date.now()}-${Math.random()}`, at: Date.now(),
        kind: event, ...(event === 'like' ? { count: value.count }
          : event === 'chat' ? { chat: value } : { gift: value }) });
      if (audienceEvents.length > 60) audienceEvents.shift();
    } else if (event === 'ready') audienceStatus = 'connected';
    else if (event === 'offline' || event === 'unavailable') audienceStatus = 'offline';
    else if (event === 'rate_limited' || event === 'fatal') audienceStatus = 'error';
    if (['offline', 'unavailable', 'rate_limited', 'fatal', 'warning'].includes(event)) {
      audienceMessage = typeof value === 'string' ? value : '';
    }
    writeAudience();
  };
  const errorText = error => {
    if (typeof error === 'string') return error;
    const summary = error?.message || error?.info;
    const detail = error?.exception?.message;
    if (summary && detail && summary !== detail) return `${summary}: ${detail}`;
    return detail || summary || String(error || 'TikTok bağlantı hatası');
  };
  const isRateLimited = message => /rate.limit|too many connections/i.test(message);
  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    clearInterval(audienceHeartbeat);
    clearTimeout(limit);
    if (connection) void connection.disconnect().catch(() => {});
    response.end();
  };
  response.on('close', close);
  heartbeat = setInterval(() => {
    if (!closed) response.write(': heartbeat\n\n');
  }, 15000);
  if (relayAudience) audienceHeartbeat = setInterval(writeAudience, 5000);
  limit = setTimeout(() => {
    send('rotate', 'Bağlantı yenileniyor');
    close();
  }, 230000);

  try {
    if (relayAudience && redisUrl && redisToken) {
      try {
        const previous = await fetch(redisUrl, { method: 'POST',
          headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(['GET', audienceKey]), signal: AbortSignal.timeout(5000) });
        const saved = previous.ok ? await previous.json() : null;
        const record = saved?.result ? JSON.parse(saved.result) : null;
        if (record?.audience?.username === username && Date.now() - record.audienceAt < 1800000) {
          for (const viewer of record.audience.viewers || []) {
            if (viewer?.id && viewer?.name) audienceViewers.set(viewer.id, viewer);
          }
        }
      } catch { /* A fresh stream can start without the previous audience. */ }
    }
    const { TikTokLiveConnection, WebcastEvent, ControlEvent } = await loadConnector();
    if (closed) return;
    connection = new TikTokLiveConnection(username, {
      processInitialData: true,
      fetchRoomInfoOnConnect: false,
      ...(process.env.EULER_SIGN_API_KEY ? { signApiKey: process.env.EULER_SIGN_API_KEY } : {}),
    });
    const seenViewers = new Set(audienceViewers.keys());
    const viewerData = event => {
      const user = event?.user ?? event;
      return {
        id: String(user?.userId ?? user?.id ?? user?.uniqueId ?? '').trim(),
        name: String(user?.nickname ?? user?.displayId ?? user?.uniqueId ?? '').trim(),
        handle: String(user?.uniqueId ?? user?.displayId ?? '').trim(),
      };
    };
    const emitViewer = event => {
      const { id, name, handle } = viewerData(event);
      if (!id || !name || seenViewers.has(id)) return;
      seenViewers.add(id);
      send('viewer', { id, name, handle });
    };
    connection.on(WebcastEvent.MEMBER, emitViewer);
    connection.on(WebcastEvent.LIKE, data => {
      emitViewer(data);
      const rawCount = Number(data?.count ?? data?.likeCount);
      if (!Number.isFinite(rawCount) || rawCount <= 0) return;
      const count = Math.min(1000, Math.floor(rawCount));
      send('like', { count });
    });
    connection.on(WebcastEvent.CHAT, data => {
      emitViewer(data);
      const { id, name, handle } = viewerData(data);
      const text = String(data?.comment ?? data?.text ?? '').trim();
      if (id && text) send('chat', { id, name, handle, text });
    });
    connection.on(WebcastEvent.GIFT, data => {
      if (Number(data?.gift?.type ?? data?.giftType) === 1 && !data?.repeatEnd) return;
      emitViewer(data);
      const { id, name, handle } = viewerData(data);
      if (id) send('gift', { id, name, handle, gift: data?.giftName ?? data?.gift?.name ?? '',
        count: Number(data?.repeatCount ?? 1) || 1 });
    });
    connection.on(ControlEvent.DISCONNECTED, event => {
      const reason = [event?.code, event?.reason].filter(Boolean).join(' · ');
      send('offline', reason ? `TikTok bağlantısı kesildi: ${reason}` : 'TikTok bağlantısı kesildi');
      close();
    });
    connection.on(ControlEvent.ERROR, error => {
      const message = errorText(error);
      if (message.includes('Failed to retrieve Room ID from main page')) {
        send('info', 'Yayın odası alternatif yoldan aranıyor');
        return;
      }
      if (message.includes('Failed to retrieve Room ID from all sources') || error?.name === 'UserOfflineError') {
        send('unavailable', 'Yayın odası bulunamadı. Hesabın canlı yayında ve erişilebilir olduğunu kontrol edin.');
        close();
        return;
      }
      if (isRateLimited(message)) {
        send('rate_limited', 'TikTok bağlantı sınırı doldu. 2 dakika sonra yeniden denenecek.');
        close();
        return;
      }
      if (connected) {
        send('warning', message);
        return;
      }
      send('fatal', message);
      close();
    });
    const state = await connection.connect(roomId);
    connected = true;
    send('ready', { username, roomId: String(state?.roomId ?? roomId ?? '') });
    // A second browser source starts after viewers have joined. Restore the
    // shared audience immediately instead of waiting for another MEMBER event.
    for (const viewer of audienceViewers.values()) {
      if (!closed) response.write(`event: viewer\ndata: ${JSON.stringify(viewer)}\n\n`);
    }
  } catch (error) {
    const message = error?.code === 'ERR_MODULE_NOT_FOUND'
      ? 'TikTok paketi eksik. npm install komutunu çalıştırın.'
      : errorText(error);
    if (message.includes('Failed to retrieve Room ID from all sources') || error?.name === 'UserOfflineError') {
      send('unavailable', 'Yayın odası bulunamadı. Hesabın canlı yayında ve erişilebilir olduğunu kontrol edin.');
    } else if (isRateLimited(message)) {
      send('rate_limited', 'TikTok bağlantı sınırı doldu. 2 dakika sonra yeniden denenecek.');
    } else send('fatal', message);
    close();
  }
};
}

export default createTikTokHandler();
