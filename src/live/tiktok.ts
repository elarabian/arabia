export interface LiveViewer {
  id: string;
  name: string;
  handle?: string;
}

export interface LiveChat extends LiveViewer { text: string }
export interface LiveGift extends LiveViewer { gift: string; count: number }

export type LiveStatus = 'connecting' | 'connected' | 'offline' | 'error';

export function connectTikTokLive(username: string, onViewer: (viewer: LiveViewer) => void,
  onLike: (count: number) => void,
  onStatus: (status: LiveStatus, message?: string) => void,
  onChat: (chat: LiveChat) => void,
  onGift: (gift: LiveGift) => void) {
  const url = `/api/tiktok?username=${encodeURIComponent(username.trim().replace(/^@/, ''))}`;
  let source: EventSource | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryCount = 0;
  let stopped = false;

  const reconnect = () => {
    if (stopped || retryTimer !== null) return;
    source?.close();
    source = null;
    const delay = Math.min(30000, 2000 * 2 ** Math.min(retryCount++, 4));
    retryTimer = setTimeout(() => {
      retryTimer = null;
      open();
    }, delay);
  };

  const open = () => {
    if (stopped) return;
    onStatus('connecting', retryCount ? 'Yeniden bağlanıyor' : undefined);
    const current = new EventSource(url);
    source = current;
    current.addEventListener('ready', () => {
      if (stopped || source !== current) return;
      retryCount = 0;
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
        const { count } = JSON.parse((event as MessageEvent).data) as { count: number };
        if (Number.isFinite(count) && count > 0) onLike(count);
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
      try { onStatus('offline', JSON.parse((event as MessageEvent).data) as string); }
      catch { onStatus('offline', (event as MessageEvent).data); }
      reconnect();
    });
    current.addEventListener('fatal', event => {
      if (stopped || source !== current) return;
      try { onStatus('error', JSON.parse((event as MessageEvent).data) as string); }
      catch { onStatus('error', (event as MessageEvent).data); }
      reconnect();
    });
    current.onerror = () => {
      if (stopped || source !== current) return;
      onStatus('error', 'Bağlantı kesildi; yeniden denenecek');
      reconnect();
    };
  };

  open();
  return () => {
    stopped = true;
    if (retryTimer !== null) clearTimeout(retryTimer);
    source?.close();
    source = null;
  };
}
