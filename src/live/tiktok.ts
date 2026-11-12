export interface LiveViewer {
  id: string;
  name: string;
  handle?: string;
  likes?: number;
  gifts?: number;
}

export interface LiveChat extends LiveViewer { text: string }
export interface LiveGift extends LiveViewer { gift: string; count: number }

export type LiveStatus = 'connecting' | 'connected' | 'offline' | 'error';

export function connectTikTokLive(username: string, onViewer: (viewer: LiveViewer) => void,
  onLike: (count: number, viewerId?: string) => void,
  onStatus: (status: LiveStatus, message?: string) => void,
  onChat: (chat: LiveChat) => void,
  onGift: (gift: LiveGift) => void,
  onLeave: (viewerId: string) => void,
  relayAudience = false) {
  const cleanUsername = username.trim().replace(/^@/, '');
  const url = `/api/tiktok?username=${encodeURIComponent(cleanUsername)}${relayAudience ? '&relay=1' : ''}`;
  const roomStorageKey = `tiktokRoomId:${cleanUsername.toLowerCase()}`;
  let roomId = '';
  try {
    const saved = localStorage.getItem(roomStorageKey) ?? '';
    if (/^\d{5,30}$/.test(saved)) roomId = saved;
  } catch { /* Storage can be unavailable in OBS. */ }
  let source: EventSource | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryCount = 0;
  let connectedAt = 0;
  let hadReady = false;
  let outageTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const reportOutage = (status: LiveStatus, message: string) => {
    if (!hadReady) { onStatus(status, message); return; }
    if (outageTimer !== null) return;
    outageTimer = setTimeout(() => {
      outageTimer = null;
      onStatus(status, message);
    }, 8000);
  };

  const reconnect = (delayOverride?: number, quiet = false) => {
    if (stopped || retryTimer !== null) return;
    source?.close();
    source = null;
    const delay = delayOverride ?? Math.min(30000, 2000 * 2 ** Math.min(retryCount++, 4));
    retryTimer = setTimeout(() => {
      retryTimer = null;
      open(quiet);
    }, delay);
  };

  const open = (quiet = false) => {
    if (stopped) return;
    connectedAt = 0;
    if (!quiet) onStatus('connecting', retryCount ? 'Yeniden bağlanıyor' : undefined);
    const current = new EventSource(roomId ? `${url}&roomId=${encodeURIComponent(roomId)}` : url);
    source = current;
    current.addEventListener('ready', event => {
      if (stopped || source !== current) return;
      try {
        const ready = JSON.parse((event as MessageEvent).data) as { roomId?: string };
        if (ready.roomId && /^\d{5,30}$/.test(ready.roomId)) {
          roomId = ready.roomId;
          try { localStorage.setItem(roomStorageKey, roomId); } catch { /* Storage is optional. */ }
        }
      } catch { /* The connection is usable without a cached room ID. */ }
      connectedAt = Date.now();
      hadReady = true;
      if (outageTimer !== null) clearTimeout(outageTimer);
      outageTimer = null;
      onStatus('connected');
    });
    current.addEventListener('viewer', event => {
      if (stopped || source !== current) return;
      try {
        const viewer = JSON.parse((event as MessageEvent).data) as LiveViewer;
        if (viewer.id && viewer.name) onViewer(viewer);
      } catch { /* Ignore malformed events. */ }
    });
    current.addEventListener('like', event => {
      if (stopped || source !== current) return;
      try {
        const { count, id } = JSON.parse((event as MessageEvent).data) as { count: number; id?: string };
        if (Number.isFinite(count) && count > 0) onLike(count, id);
      } catch { /* Ignore malformed events. */ }
    });
    current.addEventListener('leave', event => {
      if (stopped || source !== current) return;
      try {
        const { id } = JSON.parse((event as MessageEvent).data) as { id?: string };
        if (id) onLeave(id);
      } catch { /* Ignore malformed events. */ }
    });
    current.addEventListener('chat', event => {
      if (stopped || source !== current) return;
      try {
        const chat = JSON.parse((event as MessageEvent).data) as LiveChat;
        if (chat.id && chat.text) onChat(chat);
      } catch { /* Ignore malformed events. */ }
    });
    current.addEventListener('gift', event => {
      if (stopped || source !== current) return;
      try {
        const gift = JSON.parse((event as MessageEvent).data) as LiveGift;
        if (gift.id) onGift(gift);
      } catch { /* Ignore malformed events. */ }
    });
    current.addEventListener('offline', event => {
      if (stopped || source !== current) return;
      try { reportOutage('offline', JSON.parse((event as MessageEvent).data) as string); }
      catch { reportOutage('offline', (event as MessageEvent).data); }
      if (connectedAt && Date.now() - connectedAt > 60000) retryCount = 0;
      reconnect(undefined, true);
    });
    current.addEventListener('rate_limited', event => {
      if (stopped || source !== current) return;
      if (outageTimer !== null) clearTimeout(outageTimer);
      outageTimer = null;
      try { onStatus('error', JSON.parse((event as MessageEvent).data) as string); }
      catch { onStatus('error', (event as MessageEvent).data); }
      reconnect(120000, true);
    });
    current.addEventListener('unavailable', event => {
      if (stopped || source !== current) return;
      if (outageTimer !== null) clearTimeout(outageTimer);
      outageTimer = null;
      try { onStatus('offline', JSON.parse((event as MessageEvent).data) as string); }
      catch { onStatus('offline', (event as MessageEvent).data); }
      const cachedRoomFailed = Boolean(roomId);
      roomId = '';
      try { localStorage.removeItem(roomStorageKey); } catch { /* Storage is optional. */ }
      reconnect(cachedRoomFailed ? 2000 : 30000, true);
    });
    current.addEventListener('warning', event => {
      if (stopped || source !== current) return;
      try { onStatus('connected', JSON.parse((event as MessageEvent).data) as string); }
      catch { onStatus('connected', (event as MessageEvent).data); }
    });
    current.addEventListener('rotate', () => {
      if (stopped || source !== current) return;
      retryCount = 0;
      reconnect(0, true);
    });
    current.addEventListener('fatal', event => {
      if (stopped || source !== current) return;
      if (outageTimer !== null) clearTimeout(outageTimer);
      outageTimer = null;
      try { onStatus('error', JSON.parse((event as MessageEvent).data) as string); }
      catch { onStatus('error', (event as MessageEvent).data); }
      roomId = '';
      try { localStorage.removeItem(roomStorageKey); } catch { /* Storage is optional. */ }
      reconnect(undefined, true);
    });
    current.onerror = () => {
      if (stopped || source !== current) return;
      reportOutage('error', 'Bağlantı kesildi; yeniden denenecek');
      reconnect(undefined, true);
    };
  };

  open();
  return () => {
    stopped = true;
    if (retryTimer !== null) clearTimeout(retryTimer);
    if (outageTimer !== null) clearTimeout(outageTimer);
    source?.close();
    source = null;
  };
}
