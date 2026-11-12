import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GameEngine } from './game/gameEngine';
import { GameCanvas } from './components/GameCanvas';
import { HUD } from './components/HUD';
import { ShopModal } from './components/ShopModal';
import { SettingsModal } from './components/SettingsModal';
import { soundEngine } from './game/audio';
import { featureFlags } from './featureFlags';
import { connectTikTokLive, type LiveChat, type LiveGift, type LiveStatus, type LiveViewer } from './live/tiktok';
import { CONTROL_CHANNEL, CONTROL_STORAGE_KEY, applyControlSnapshot,
  captureControlSnapshot, parseControlSnapshot, readControlSnapshot, type ControlSnapshot } from './controlSync';
import { Play, RotateCcw, Sparkles, Volume2, Skull, Zap, Bomb, Shovel, Flame, CircleDot } from 'lucide-react';

// Preloaded generated image assets
import saharaUrl from './assets/images/sahara-sunny.png';
import graveyardUrl from './assets/images/gothic_graveyard_ruins_1794419017647.jpg';
import crestUrl from './assets/images/zombie_hunter_crest_1794419032026.jpg';
export const ARABIAN_DESERT_BG_URL = saharaUrl;
export const GRAVEYARD_BG_URL = graveyardUrl;
const CREST_URL = crestUrl;
const DEFAULT_TIKTOK_USERNAME = 'ersanyakit';
type AudienceEvent = { id: string; at: number; kind: 'like'; count: number; viewerId?: string }
  | { id: string; at: number; kind: 'chat'; chat: LiveChat }
  | { id: string; at: number; kind: 'gift'; gift: LiveGift }
  | { id: string; at: number; kind: 'leave'; viewerId: string };
const normalizeTikTokUsername = (value: string | null) => {
  const username = value?.trim().replace(/^@/, '') ?? '';
  return !username || username.toLowerCase() === 'astro.ses' ? DEFAULT_TIKTOK_USERNAME : username;
};

export default function App() {
  const pageParams = new URLSearchParams(window.location.search);
  const [controlKey, setControlKey] = useState(() => {
    try { return pageParams.get('key') ?? sessionStorage.getItem('controlKey') ?? ''; }
    catch { return pageParams.get('key') ?? ''; }
  });
  const obsMode = window.location.pathname === '/game' || pageParams.get('obs') === '1';
  const controlMode = !obsMode;
  const [savedControl] = useState(readControlSnapshot);
  const [gameState, setGameState] = useState<'TITLE' | 'PLAYING' | 'GAME_OVER'>('PLAYING');
  const [currentMap, setCurrentMap] = useState<'DESERT' | 'GRAVEYARD'>(
    savedControl?.map ?? (obsMode && pageParams.get('map') === 'GRAVEYARD' ? 'GRAVEYARD' : 'DESERT'));
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isShopOpen, setIsShopOpen] = useState<boolean>(false);
  const [rapidWhip, setRapidWhip] = useState(savedControl?.rapidWhip ?? false);
  const [rapidWhipSpeed, setRapidWhipSpeed] = useState(savedControl?.rapidWhipSpeed ?? 1);
  const [liveStatus, setLiveStatus] = useState<LiveStatus>('connecting');
  const [liveMessage, setLiveMessage] = useState('');
  const [remoteStats, setRemoteStats] = useState({ zombies: 0, likes: 0 });
  const [gameOnline, setGameOnline] = useState(false);
  const [studioAddress, setStudioAddress] = useState('');
  const isLocalControl = ['localhost', '127.0.0.1', 'game.local', 'test.local'].includes(window.location.hostname);
  const [publishedSiteUrl, setPublishedSiteUrl] = useState(() => {
    try { return localStorage.getItem('publishedSiteUrl') ?? ''; } catch { return ''; }
  });
  const [publishedSiteError, setPublishedSiteError] = useState('');
  const [relayReadError, setRelayReadError] = useState('');
  const [relayWriteError, setRelayWriteError] = useState('');
  const [audienceBridgeActive, setAudienceBridgeActive] = useState(false);
  const [fallbackReady, setFallbackReady] = useState(false);
  const processedAudienceEventsRef = useRef(new Set<string>());
  const appliedAudienceRef = useRef<{ username: string; updatedAt: number } | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const lastGameStatusRef = useRef(0);
  const relayRevisionRef = useRef<string | null>(null);
  const relayCommandRef = useRef<string | null>(null);
  const relayInitializedRef = useRef(false);
  const [tiktokUsername, setTikTokUsername] = useState(() => {
    if (savedControl?.username) return normalizeTikTokUsername(savedControl.username);
    if (obsMode && pageParams.get('username')) return normalizeTikTokUsername(pageParams.get('username'));
    try {
      const saved = localStorage.getItem('tiktokUsername');
      const username = normalizeTikTokUsername(saved);
      if (saved?.trim().replace(/^@/, '').toLowerCase() === 'astro.ses') {
        localStorage.setItem('tiktokUsername', username);
      }
      return username;
    } catch { return DEFAULT_TIKTOK_USERNAME; }
  });
  const [liveReconnect, setLiveReconnect] = useState(0);
  const [, setTick] = useState<number>(0);

  // Keep the safe area reserved without displaying chat or overlay buttons.
  const engineRef = useRef<GameEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new GameEngine(currentMap === 'DESERT' ? ARABIAN_DESERT_BG_URL : GRAVEYARD_BG_URL);
    engineRef.current.setTikTokMode(true);
    if (obsMode) {
      engineRef.current.restartGame();
      const shake = Number(pageParams.get('shake'));
      if (Number.isFinite(shake) && pageParams.has('shake')) {
        engineRef.current.settings.screenShakeStrength = Math.max(0, Math.min(1, shake));
      }
      engineRef.current.settings.screenShake = pageParams.get('shakeEnabled') !== '0';
      const speed = Number(pageParams.get('speed'));
      if (Number.isFinite(speed) && pageParams.has('speed')) engineRef.current.setRapidWhipSpeed(speed);
      if (pageParams.get('rapid') === '1') engineRef.current.setRapidWhip(true);
      const scene = pageParams.get('scene');
      if (scene === 'BOMB') engineRef.current.setBombScene(true);
      else if (scene === 'BURIAL') engineRef.current.setBurialScene(true);
      else if (scene === 'HELL') engineRef.current.setHellScene(true);
      else if (scene === 'TASBIH') engineRef.current.setTasbihMode(true);
    }
    if (savedControl) applyControlSnapshot(engineRef.current, savedControl);
  }
  const engine = engineRef.current;

  useEffect(() => {
    if (!obsMode) return;
    try { soundEngine.startBackground(); } catch { /* OBS may block autoplay. */ }
    void soundEngine.prepare().catch(() => { /* Visuals keep running without audio. */ });
  }, [obsMode]);

  const obsUrl = new URL('/game', window.location.origin);
  if (controlKey) obsUrl.searchParams.set('key', controlKey);
  const gameUrl = obsUrl.toString();
  const studioUrl = new URL(gameUrl);
  if (studioAddress) studioUrl.hostname = studioAddress;

  const openPublishedControl = (value: string) => {
    try {
      const site = new URL(value.trim());
      if (site.protocol !== 'https:' || !site.hostname || site.username || site.password) {
        throw new Error('Geçerli bir HTTPS adresi girin.');
      }
      const controlUrl = new URL('/control', site.origin);
      const selectedKey = site.searchParams.get('key') || controlKey;
      if (selectedKey) controlUrl.searchParams.set('key', selectedKey);
      setPublishedSiteUrl(controlUrl.toString());
      setPublishedSiteError('');
      try { localStorage.setItem('publishedSiteUrl', controlUrl.toString()); } catch { /* Storage can be unavailable. */ }
      window.location.assign(controlUrl.toString());
    } catch {
      setPublishedSiteError('Vercel adresini https://... biçiminde girin.');
    }
  };

  const changeControlKey = (value: string) => {
    const key = value.trim();
    setControlKey(key);
    setRelayWriteError('');
    try {
      if (key) sessionStorage.setItem('controlKey', key);
      else sessionStorage.removeItem('controlKey');
    } catch { /* Storage can be unavailable. */ }
  };

  useEffect(() => {
    if (!controlMode || !['localhost', '127.0.0.1'].includes(window.location.hostname)) return;
    let active = true;
    void fetch('/api/local-address').then(response => response.ok ? response.json() : null)
      .then((result: { address?: string } | null) => {
        if (active && result?.address && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(result.address)) {
          setStudioAddress(result.address);
        }
      }).catch(() => { /* The local preview link remains available. */ });
    return () => { active = false; };
  }, [controlMode]);

  const relayPost = useCallback((data: unknown) => {
    void fetch('/api/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(controlKey
        ? { 'X-Control-Key': controlKey } : {}) },
      body: JSON.stringify(data),
    }).then(async response => {
      if (response.ok) {
        setRelayWriteError('');
        return;
      }
      const issue = await response.json().catch(() => ({})) as { error?: string };
      setRelayWriteError(issue.error || `Kontrol gönderilemedi: ${response.status}`);
    }).catch(() => { setRelayWriteError('Kontrol değişikliği gönderilemedi.'); });
  }, [controlKey]);

  const sendCommand = (command: 'pause' | 'restart' | 'reconnect') => {
    const id = `${Date.now()}-${Math.random()}`;
    channelRef.current?.postMessage({ type: command, id });
    relayPost({ type: 'command', command, id });
  };

  const publishControl = (overrides: Partial<ControlSnapshot> = {}) => {
    if (!controlMode) return;
    const snapshot = { ...captureControlSnapshot(engine, currentMap, tiktokUsername), ...overrides };
    try { localStorage.setItem(CONTROL_STORAGE_KEY, JSON.stringify(snapshot)); } catch { /* Private storage can be unavailable. */ }
    channelRef.current?.postMessage({ type: 'control', snapshot });
    relayPost({ type: 'control', snapshot });
  };

  useEffect(() => {
    if (controlMode) publishControl();
  }, [controlKey]);

  const applyRemote = useCallback((value: unknown) => {
    if (!obsMode) return;
    const snapshot = parseControlSnapshot(value);
    if (!snapshot) return;
    applyControlSnapshot(engine, snapshot);
    setCurrentMap(snapshot.map);
    engine.setBackgroundImage(snapshot.map === 'DESERT' ? ARABIAN_DESERT_BG_URL : GRAVEYARD_BG_URL);
    setRapidWhip(snapshot.rapidWhip);
    setRapidWhipSpeed(snapshot.rapidWhipSpeed);
    setTikTokUsername(previous => {
      if (previous === snapshot.username) return previous;
      engine.clearLiveViewers();
      processedAudienceEventsRef.current.clear();
      return snapshot.username;
    });
    setTick(t => t + 1);
  }, [engine, obsMode]);

  const applyAudience = useCallback((audience: {
    username?: string; viewers?: LiveViewer[]; events?: AudienceEvent[];
    status?: LiveStatus; message?: string;
  } | undefined, updatedAt: number | undefined) => {
    if (!obsMode || isLocalControl) return;
    const fresh = typeof updatedAt === 'number' && Date.now() - updatedAt < 8000
      && audience?.status === 'connected'
      && audience.username?.toLowerCase() === tiktokUsername.toLowerCase();
    setAudienceBridgeActive(fresh);
    if (!fresh || audience?.username?.toLowerCase() !== tiktokUsername.toLowerCase()) return;
    if (appliedAudienceRef.current?.username === tiktokUsername.toLowerCase()
      && appliedAudienceRef.current.updatedAt === updatedAt) return;
    appliedAudienceRef.current = { username: tiktokUsername.toLowerCase(), updatedAt: updatedAt! };
    if (audience.status) setLiveStatus(audience.status);
    if (typeof audience.message === 'string') setLiveMessage(audience.message);
    let added = false;
    for (const viewer of Array.isArray(audience.viewers) ? audience.viewers : []) {
      if (viewer?.id && viewer?.name) {
        added = engine.addLiveViewer(viewer.id, viewer.name, viewer.handle) || added;
      }
    }
    for (const event of Array.isArray(audience.events) ? audience.events : []) {
      if (!event?.id || processedAudienceEventsRef.current.has(event.id)) continue;
      processedAudienceEventsRef.current.add(event.id);
      if (Date.now() - event.at > 15000) continue;
      if (event.kind === 'like') {
        engine.addLiveLikes(event.count);
        if (event.viewerId) engine.addViewerLikes(event.viewerId, event.count);
      }
      else if (event.kind === 'chat' && event.chat?.id && event.chat?.text) {
        engine.receiveLiveChat(event.chat.id, event.chat.name, event.chat.text);
      } else if (event.kind === 'gift' && event.gift?.id) {
        engine.receiveLiveGift(event.gift.id, event.gift.name, event.gift.count);
      } else if (event.kind === 'leave' && event.viewerId) {
        engine.removeLiveViewer(event.viewerId);
      }
    }
    for (const viewer of Array.isArray(audience.viewers) ? audience.viewers : []) {
      if (viewer?.id) engine.syncViewerSupport(viewer.id, viewer.likes, viewer.gifts);
    }
    if (processedAudienceEventsRef.current.size > 500) {
      for (const id of processedAudienceEventsRef.current) {
        processedAudienceEventsRef.current.delete(id);
        if (processedAudienceEventsRef.current.size <= 400) break;
      }
    }
    if (added) setTick(t => t + 1);
  }, [engine, obsMode, isLocalControl, tiktokUsername]);

  useEffect(() => {
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CONTROL_CHANNEL);
    channelRef.current = channel;
    const onStorage = (event: StorageEvent) => {
      if (event.key === CONTROL_STORAGE_KEY && event.newValue) {
        try { applyRemote(JSON.parse(event.newValue) as unknown); } catch { /* Ignore invalid storage data. */ }
      }
    };
    const sendStatus = () => channel?.postMessage({ type: 'status',
      status: liveStatus, message: liveMessage, zombies: engine.zombies.zombies.length,
      likes: engine.liveLikes, paused: isPaused });
    if (channel) channel.onmessage = event => {
      const data = event.data as Record<string, unknown> | null;
      if (!data) return;
      if (data.type === 'control') applyRemote(data.snapshot);
      else if (data.type === 'status' && controlMode) {
        lastGameStatusRef.current = Date.now();
        setGameOnline(true);
        if (isLocalControl && (data.status === 'connected' || data.status === 'connecting'
          || data.status === 'offline' || data.status === 'error')) setLiveStatus(data.status);
        if (isLocalControl && typeof data.message === 'string') setLiveMessage(data.message);
        setRemoteStats({ zombies: Number(data.zombies) || 0, likes: Number(data.likes) || 0 });
        if (typeof data.paused === 'boolean') setIsPaused(data.paused);
      } else if (data.type === 'status-request' && obsMode) sendStatus();
      else if (data.type === 'restart' && obsMode) {
        if (typeof data.id === 'string') relayCommandRef.current = data.id;
        engine.restartGame(); setGameState('PLAYING'); setIsPaused(false); sendStatus();
      } else if (data.type === 'pause' && obsMode) {
        if (typeof data.id === 'string') relayCommandRef.current = data.id;
        setIsPaused(value => !value);
      } else if (data.type === 'reconnect' && obsMode) {
        if (typeof data.id === 'string') relayCommandRef.current = data.id;
        setLiveReconnect(value => value + 1);
      }
    };
    window.addEventListener('storage', onStorage);
    if (controlMode) channel?.postMessage({ type: 'status-request' });
    return () => {
      window.removeEventListener('storage', onStorage);
      channel?.close();
      if (channelRef.current === channel) channelRef.current = null;
    };
  }, [engine, obsMode, controlMode, liveStatus, liveMessage, isPaused, applyRemote]);

  useEffect(() => {
    let active = true;
    let polling = false;
    const poll = async () => {
      if (polling) return;
      polling = true;
      try {
        const response = await fetch(obsMode ? '/api/control?audience=1' : '/api/control',
          { cache: 'no-store' });
        if (!active) return;
        if (!response.ok) {
          const issue = await response.json().catch(() => ({})) as { error?: string };
          setRelayReadError(issue.error || `Kontrol API hatası: ${response.status}`);
          return;
        }
        setRelayReadError('');
        const record = await response.json() as {
          snapshot?: unknown;
          revision?: string;
          command?: { id?: string; type?: string };
          status?: { status?: LiveStatus; message?: string; zombies?: number; likes?: number; paused?: boolean };
          statusAt?: number;
          audience?: { username?: string; viewers?: LiveViewer[]; events?: AudienceEvent[];
            status?: LiveStatus; message?: string };
          audienceAt?: number;
        };
        if (!active) return;
        if (obsMode) {
          applyAudience(record.audience, record.audienceAt);
          if (record.revision && record.revision !== relayRevisionRef.current) {
            relayRevisionRef.current = record.revision;
            applyRemote(record.snapshot);
          }
          if (!relayInitializedRef.current) {
            relayCommandRef.current = record.command?.id ?? null;
            relayInitializedRef.current = true;
          } else if (record.command?.id && record.command.id !== relayCommandRef.current) {
            relayCommandRef.current = record.command.id;
            if (record.command.type === 'restart') {
              engine.restartGame(); setGameState('PLAYING'); setIsPaused(false);
            } else if (record.command.type === 'pause') setIsPaused(value => !value);
            else if (record.command.type === 'reconnect') setLiveReconnect(value => value + 1);
          }
        } else if (record.status) {
          const status = record.status;
          if (typeof record.statusAt === 'number' && record.statusAt > lastGameStatusRef.current) {
            lastGameStatusRef.current = record.statusAt;
            if (isLocalControl && status.status) setLiveStatus(status.status);
            if (isLocalControl && typeof status.message === 'string') setLiveMessage(status.message);
            setRemoteStats(previous => previous.zombies === status.zombies && previous.likes === status.likes
              ? previous : { zombies: status.zombies ?? 0, likes: status.likes ?? 0 });
            if (typeof status.paused === 'boolean') setIsPaused(status.paused);
          }
          setGameOnline(Date.now() - lastGameStatusRef.current < 90000);
        }
      } catch { if (active) setRelayReadError('Kontrol API bağlantısı kurulamadı.'); }
      finally { polling = false; }
    };
    void poll();
    const interval = window.setInterval(() => { void poll(); }, 1000);
    return () => { active = false; clearInterval(interval); };
  }, [engine, obsMode, applyRemote, applyAudience]);

  useEffect(() => {
    if (!obsMode) return;
    const send = () => {
      const status = { status: liveStatus, message: liveMessage,
        zombies: engine.zombies.zombies.length, likes: engine.liveLikes, paused: isPaused };
      channelRef.current?.postMessage({ type: 'status', ...status });
      relayPost({ type: 'status', status });
    };
    send();
    const interval = window.setInterval(send, 1000);
    return () => clearInterval(interval);
  }, [engine, obsMode, liveStatus, liveMessage, isPaused, relayPost]);

  useEffect(() => {
    if (!obsMode || isLocalControl) return;
    const timer = window.setTimeout(() => setFallbackReady(true), 8000);
    return () => clearTimeout(timer);
  }, [obsMode, isLocalControl]);

  useEffect(() => {
    if (!featureFlags.tiktokEnabled) return;
    const bridgeSource = controlMode && !isLocalControl;
    const directSource = obsMode && (isLocalControl || (fallbackReady && !audienceBridgeActive));
    if (!bridgeSource && !directSource) return;
    if (!tiktokUsername.trim()) {
      setLiveStatus('offline');
      setLiveMessage('Ayarlardan TikTok yayıncı adını girin');
      return;
    }
    return connectTikTokLive(
      tiktokUsername,
      viewer => {
        if (!bridgeSource) {
          if (engine.addLiveViewer(viewer.id, viewer.name, viewer.handle)) setTick(t => t + 1);
          engine.syncViewerSupport(viewer.id, viewer.likes, viewer.gifts);
        }
      },
      (count, viewerId) => {
        if (!bridgeSource) {
          engine.addLiveLikes(count);
          if (viewerId) engine.addViewerLikes(viewerId, count);
        }
      },
      (status, message) => { setLiveStatus(status); setLiveMessage(message ?? ''); },
      chat => {
        if (!bridgeSource) {
          engine.addLiveViewer(chat.id, chat.name || chat.id, chat.handle);
          engine.receiveLiveChat(chat.id, chat.name, chat.text);
          setTick(t => t + 1);
        }
      },
      gift => {
        if (!bridgeSource) {
          engine.addLiveViewer(gift.id, gift.name || gift.id, gift.handle);
          engine.receiveLiveGift(gift.id, gift.name, gift.count);
          setTick(t => t + 1);
        }
      },
      viewerId => { if (!bridgeSource) engine.removeLiveViewer(viewerId); },
      !isLocalControl,
    );
  }, [engine, tiktokUsername, liveReconnect, controlMode, isLocalControl, obsMode,
    fallbackReady, audienceBridgeActive]);

  const changeTikTokUsername = (value: string) => {
    const next = value.trim().replace(/^@/, '');
    if (next === tiktokUsername) {
      if (controlMode) sendCommand('reconnect');
      else setLiveReconnect(value => value + 1);
      return;
    }
    engine.clearLiveViewers();
    setTikTokUsername(next);
    try { localStorage.setItem('tiktokUsername', next); } catch { /* Storage may be unavailable. */ }
    publishControl({ username: next });
  };

  const handleSelectMap = (map: 'DESERT' | 'GRAVEYARD') => {
    setCurrentMap(map);
    engine.setBackgroundImage(map === 'DESERT' ? ARABIAN_DESERT_BG_URL : GRAVEYARD_BG_URL);
    publishControl({ map });
  };

  // Force re-render for HUD updates
  const handleStatsUpdate = useCallback(() => {
    if (engine.isGameOver && gameState !== 'GAME_OVER') {
      if (obsMode) engine.restartGame();
      else setGameState('GAME_OVER');
    }
    setTick((t) => (t + 1) % 1000);
  }, [engine, gameState, obsMode]);

  const handleStartGame = async () => {
    soundEngine.startBackground();
    try { await soundEngine.prepare(); } catch { soundEngine.stopBackground(); alert('Oyun sesleri yüklenemedi. Lütfen yeniden dene.'); return; }
    engine.restartGame();
    if (!engine.bombSceneEnabled && !engine.captureSceneEnabled) soundEngine.sayGreeting();
    setGameState('PLAYING');
    setIsPaused(false);
    // Sound engine trigger on first interaction

  };

  const handleRestart = () => {
    soundEngine.startBackground();
    engine.restartGame();
    if (!engine.bombSceneEnabled && !engine.captureSceneEnabled) soundEngine.sayGreeting();
    setGameState('PLAYING');
    setIsPaused(false);

  };

  const togglePause = () => {
    setIsPaused((p) => !p);
  };

  const toggleRapidWhip = () => {
    const enabled = !rapidWhip;
    engine.setRapidWhip(enabled);
    setRapidWhip(enabled);
    publishControl({ rapidWhip: enabled });
  };

  const changeRapidWhipSpeed = (event: React.ChangeEvent<HTMLInputElement>) => {
    const speed = Number(event.target.value);
    engine.setRapidWhipSpeed(speed);
    setRapidWhipSpeed(engine.rapidWhipSpeed);
    publishControl({ rapidWhipSpeed: engine.rapidWhipSpeed });
  };

  const changeScene = (scene: 'WHIP' | 'BOMB' | 'BURIAL' | 'HELL' | 'TASBIH') => {
    engine.cancelLiveTasks();
    engine.setTasbihMode(scene === 'TASBIH');
    if (scene === 'BOMB') engine.setBombScene(true);
    else if (scene === 'BURIAL') engine.setBurialScene(true);
    else if (scene === 'HELL') engine.setHellScene(true);
    else if (engine.hellSceneEnabled) engine.setHellScene(false);
    else if (engine.burialSceneEnabled) engine.setBurialScene(false);
    else engine.setBombScene(false);
    setIsPaused(false);
    setTick((t) => t + 1);
    publishControl();
    if (scene !== 'WHIP' && gameState === 'TITLE') void handleStartGame();
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Escape' && !event.repeat && gameState === 'PLAYING' && !isShopOpen && !obsMode) {
        setIsPaused(value => !value);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [gameState, isShopOpen, obsMode]);

  return (
    <div className={`app-layout relative w-screen h-[100dvh] bg-[#05070a] text-slate-100 font-body select-none ${obsMode ? 'obs-mode' : 'control-mode'}`}>
      {obsMode && (
      <main className="game-viewport" aria-label="Tam ekran oyun görüntüsü">
      {/* 1. Title Menu Screen */}
      {gameState === 'TITLE' && (
        <div
          className="broadcast-stage relative z-20 flex flex-col items-center justify-center p-6 bg-cover bg-center"
          style={{ backgroundImage: `url(${currentMap === 'DESERT' ? ARABIAN_DESERT_BG_URL : GRAVEYARD_BG_URL})` }}
        >
          {/* Dark moody scrim */}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/85 to-black/65 pointer-events-none" />

          {/* Central Card */}
          <div className="relative z-10 max-w-xl w-full flex flex-col items-center text-center p-8 bg-stone-950/85 backdrop-blur-xl border border-stone-800 rounded-2xl shadow-2xl">
            {/* Crest Emblem */}
            <div className="relative w-24 h-24 mb-4 rounded-full overflow-hidden border-2 border-amber-600/60 shadow-[0_0_25px_rgba(217,119,6,0.35)]">
              <img
                src={CREST_URL}
                alt="Harami Arması"
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>

            {/* Title */}
            <h1 className="font-cinzel text-3xl sm:text-4xl font-extrabold tracking-wider text-stone-100 drop-shadow-md mb-1.5">
              HARAMİ · KIRBAÇ AVCISI
            </h1>
            <div className="text-xs uppercase tracking-[0.25em] font-cinzel text-amber-500 font-semibold mb-3">
              Sahra Çölü · Fizik Tabanlı Kırbaç Savaşı
            </div>

            <p className="text-xs sm:text-sm text-stone-400 mb-6 max-w-md leading-relaxed">
              Keffiyeh puşili, yırtık cübbeli Arap bedevi zombileri, zırhlı Sarazen Memlük savaşçıları ve lanetli Sultan'a karşı Verlet ip fiziğiyle kırbacınızı şaklatın!
            </p>
            {featureFlags.tiktokEnabled && (
              <p className="mb-4 text-xs text-pink-300" title={liveMessage}>
                TikTok: {tiktokUsername ? liveStatus === 'connected' ? 'bağlı' : 'bağlantı bekleniyor' : 'Ayarlardan yayıncı adını girin'}
                {' · '}{engine.zombies.zombies.length} izleyici zombisi
              </p>
            )}

            {/* Feature highlights */}
            <div className="grid grid-cols-3 gap-2 w-full text-center text-xs text-stone-300 mb-6 border-y border-stone-800/80 py-3">
              <div className="flex flex-col items-center gap-1">
                <span className="text-amber-500 font-semibold">Arap Elbiseleri</span>
                <span className="text-[11px] text-stone-400">Puşi, Agel, Cübbe</span>
              </div>
              <div className="flex flex-col items-center gap-1 border-x border-stone-800 px-2">
                <span className="text-rose-500 font-semibold">Uzuv Koparma</span>
                <span className="text-[11px] text-stone-400">Kafa, bacak, kol</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-sky-400 font-semibold">Verlet Kamçısı</span>
                <span className="text-[11px] text-stone-400">Süpersonik ÇAT!</span>
              </div>
            </div>

            {/* Map selection */}
            <div className="w-full mb-4">
              <div className="text-[11px] font-cinzel uppercase tracking-wider text-stone-400 mb-1.5 text-left">
                Savaş Alanı / Harita:
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleSelectMap('DESERT')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                    currentMap === 'DESERT'
                      ? 'bg-amber-950/50 border-amber-500 text-amber-300 shadow-md'
                      : 'bg-stone-900/60 border-stone-800 text-stone-400 hover:border-stone-700'
                  }`}
                >
                  🏜️ Güneşli Sahra Çölü
                </button>
                <button onClick={() => handleSelectMap('GRAVEYARD')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${currentMap === 'GRAVEYARD'
                    ? 'bg-amber-950/50 border-amber-500 text-amber-300 shadow-md'
                    : 'bg-stone-900/60 border-stone-800 text-stone-400 hover:border-stone-700'}`}>
                  ⚰️ Gotik Mezarlık
                </button>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
              <button
                onClick={handleStartGame}
                className="w-full sm:flex-1 py-3 px-6 bg-gradient-to-r from-amber-700 via-amber-600 to-amber-700 hover:from-amber-600 hover:to-amber-500 text-stone-950 font-cinzel font-bold text-sm tracking-wider rounded-lg transition-all shadow-[0_0_20px_rgba(217,119,6,0.4)] flex items-center justify-center gap-2 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-stone-950" />
                <span>Oyuna Başla</span>
              </button>

            </div>
          </div>
        </div>
      )}

      {/* 2. Active Game Playing Screen */}
      {(gameState === 'PLAYING' || gameState === 'GAME_OVER') && (
        <div className="broadcast-stage">
          {/* Main Canvas rendering loop */}
          <GameCanvas
            engine={engine}
            isPaused={isPaused || isShopOpen || gameState === 'GAME_OVER'}
            onStatsUpdate={handleStatsUpdate}
          />

          <HUD engine={engine} />

          {/* Paused Screen Overlay */}
          {isPaused && !isShopOpen && !obsMode && (
            <div className="absolute inset-0 z-40 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center p-6">
              <div className="max-w-md w-full bg-stone-950 border border-stone-800 rounded-xl p-6 text-center shadow-2xl">
                <h2 className="font-cinzel text-2xl font-bold text-stone-100 mb-2">
                  OYUN DURAKLATILDI
                </h2>
                <p className="text-xs text-stone-400 mb-6">
                  Harami nefesleniyor... Hazır olduğunuzda devam edin.
                </p>

                <div className="flex flex-col gap-2.5">
                  <button
                    onClick={togglePause}
                    className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-stone-950 font-cinzel font-bold text-xs tracking-wider rounded-lg transition-colors cursor-pointer"
                  >
                    Savaşa Devam Et
                  </button>
                  <button
                    onClick={() => setIsShopOpen(true)}
                    className="w-full py-2.5 bg-stone-900 hover:bg-stone-800 border border-stone-800 text-amber-400 font-cinzel text-xs tracking-wider rounded-lg transition-colors cursor-pointer"
                  >
                    Cephanelik & Geliştirmeler
                  </button>
                  <button
                    onClick={() => setGameState('TITLE')}
                    className="w-full py-2 text-stone-400 hover:text-stone-200 text-xs transition-colors cursor-pointer"
                  >
                    Ana Menüye Dön
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Game Over Modal */}
          {gameState === 'GAME_OVER' && (
            <div className="absolute inset-0 z-40 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-fadeIn">
              <div className="max-w-md w-full bg-stone-950 border border-red-950/80 rounded-xl p-8 text-center shadow-[0_0_40px_rgba(153,27,27,0.4)]">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-950/50 border border-red-800/80 flex items-center justify-center text-red-500">
                  <Skull className="w-8 h-8" />
                </div>

                <h2 className="font-cinzel text-3xl font-extrabold text-red-600 tracking-wider mb-1">
                  HARAMİ DÜŞTÜ...
                </h2>
                <div className="text-xs font-cinzel uppercase tracking-widest text-stone-400 mb-6">
                  Karanlık mezarlık cesedinizi yuttu
                </div>

                {/* Battle Stats Summary */}
                <div className="bg-stone-900/50 border border-stone-800 rounded-lg p-4 mb-6 text-left space-y-2 text-xs">
                  <div className="flex justify-between items-center text-stone-300">
                    <span>Ulaşılan Dalga:</span>
                    <span className="font-mono font-bold text-amber-500 text-sm">{engine.wave}</span>
                  </div>
                  <div className="flex justify-between items-center text-stone-300">
                    <span>Katledilen Zombiler:</span>
                    <span className="font-mono font-bold text-rose-400">{engine.stats.totalKills}</span>
                  </div>
                  <div className="flex justify-between items-center text-stone-300">
                    <span>Süpersonik Kırbaç Şaklatma:</span>
                    <span className="font-mono font-bold text-sky-400">{engine.stats.totalCracks}</span>
                  </div>
                  <div className="flex justify-between items-center text-stone-300">
                    <span>Koparılan Uzuv Sayısı:</span>
                    <span className="font-mono font-bold text-stone-200">{engine.stats.totalDismembers}</span>
                  </div>
                  <div className="flex justify-between items-center text-stone-300 pt-2 border-t border-stone-800">
                    <span className="text-amber-400 font-medium">Kazanılan Kan Özü:</span>
                    <span className="font-mono font-bold text-amber-400">{engine.stats.bloodEssence} 🩸</span>
                  </div>
                </div>

                {/* Restart Buttons */}
                <div className="flex flex-col gap-2.5">
                  <button
                    onClick={handleRestart}
                    className="w-full py-3 bg-red-700 hover:bg-red-600 text-stone-100 font-cinzel font-bold text-xs tracking-wider rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-lg"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Yeniden Doğ ve Savaş</span>
                  </button>

                  <button
                    onClick={() => setGameState('TITLE')}
                    className="w-full py-2.5 bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-400 hover:text-stone-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    Ana Menüye Dön
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Shop Modal */}
          {isShopOpen && (
            <ShopModal
              engine={engine}
              onClose={() => setIsShopOpen(false)}
              onRefresh={() => setTick((t) => t + 1)}
            />
          )}

        </div>
      )}
      </main>
      )}
      {!obsMode && (
        <aside className="control-area" aria-label="Oyun kontrolleri ve ayarları">
      <div className="control-toolbar">
        <span className={gameOnline ? 'text-emerald-300' : 'text-amber-300'}>
          Oyun: {gameOnline ? 'bağlı' : 'bağlantı bekleniyor'}
        </span>
        <a href={gameUrl} target="_blank" rel="noreferrer">Oyunu tarayıcıda önizle</a>
        <button type="button" onClick={() => sendCommand('pause')}>
          {isPaused ? 'Devam et' : 'Duraklat'}
        </button>
        <button type="button" onClick={() => sendCommand('restart')}>
          Yeniden başlat
        </button>
        {(relayReadError || relayWriteError) && <span className="text-red-300" role="alert">
          {relayReadError || relayWriteError}
        </span>}
      </div>
      {gameState === 'PLAYING' && (
        <aside className="rapid-whip-panel z-30 rounded-xl border border-amber-600/40 bg-stone-950/95 p-3 shadow-xl">
          {featureFlags.tiktokEnabled && (
            <div className="mb-2 text-[10px] text-stone-200"
              title={liveMessage || `TikTok: ${liveStatus}`} aria-label={`TikTok: ${liveStatus}`}>
              <div className="flex items-center gap-1">
                <span className={`h-2 w-2 shrink-0 rounded-full ${liveStatus === 'connected' ? 'bg-emerald-400' : liveStatus === 'connecting' ? 'bg-amber-400' : 'bg-red-400'}`} />
                <span className="rapid-whip-copy truncate">TikTok {liveStatus === 'connected' ? 'bağlı' : liveStatus === 'connecting' ? 'bağlanıyor' : liveStatus === 'offline' ? 'yayın çevrimdışı' : 'bağlantı hatası'}</span>
              </div>
              <div className="rapid-whip-copy mt-1 text-pink-300">{remoteStats.zombies} zombi · ♥ {remoteStats.likes}</div>
            </div>
          )}
          <div className="scene-selector mb-3 grid grid-cols-2 gap-1" aria-label="Sahne seçimi">
            <button
              type="button"
              aria-label="Kırbaç sahnesi"
              aria-pressed={!engine.bombSceneEnabled && !engine.captureSceneEnabled && !engine.tasbihMode}
              onClick={() => changeScene('WHIP')}
              className={`flex items-center justify-center gap-1 rounded-md border px-1 py-2 text-[11px] font-semibold cursor-pointer ${!engine.bombSceneEnabled && !engine.captureSceneEnabled && !engine.tasbihMode
                ? 'border-amber-500 bg-amber-600 text-stone-950'
                : 'border-stone-700 bg-stone-900 text-stone-300'}`}
            >
              <Zap className="h-3.5 w-3.5 shrink-0" />
              <span className="rapid-whip-copy">Kırbaç</span>
            </button>
            <button
              type="button"
              aria-label="Bomba sahnesi"
              aria-pressed={engine.bombSceneEnabled}
              onClick={() => changeScene('BOMB')}
              className={`flex items-center justify-center gap-1 rounded-md border px-1 py-2 text-[11px] font-semibold cursor-pointer ${engine.bombSceneEnabled
                ? 'border-orange-400 bg-orange-600 text-white'
                : 'border-stone-700 bg-stone-900 text-stone-300'}`}
            >
              <Bomb className="h-3.5 w-3.5 shrink-0" />
              <span className="rapid-whip-copy">Bomba</span>
            </button>
            <button
              type="button"
              aria-label="Gömme sahnesi"
              aria-pressed={engine.burialSceneEnabled}
              onClick={() => changeScene('BURIAL')}
              className={`flex items-center justify-center gap-1 rounded-md border px-1 py-2 text-[11px] font-semibold cursor-pointer ${engine.burialSceneEnabled
                ? 'border-emerald-400 bg-emerald-700 text-white'
                : 'border-stone-700 bg-stone-900 text-stone-300'}`}
            >
              <Shovel className="h-3.5 w-3.5 shrink-0" />
              <span className="rapid-whip-copy">Gömme</span>
            </button>
            <button type="button" aria-label="Cehennem sahnesi" aria-pressed={engine.hellSceneEnabled}
              onClick={() => changeScene('HELL')}
              className={`flex items-center justify-center gap-1 rounded-md border px-1 py-2 text-[11px] font-semibold cursor-pointer ${engine.hellSceneEnabled
                ? 'border-red-400 bg-red-700 text-white' : 'border-stone-700 bg-stone-900 text-stone-300'}`}>
              <Flame className="h-3.5 w-3.5 shrink-0" />
              <span className="rapid-whip-copy">Cehennem</span>
            </button>
            <button type="button" aria-label="Tesbih sahnesi" aria-pressed={engine.tasbihMode}
              onClick={() => changeScene('TASBIH')}
              className={`col-span-2 flex items-center justify-center gap-1 rounded-md border px-1 py-2 text-[11px] font-semibold cursor-pointer ${engine.tasbihMode
                ? 'border-yellow-300 bg-yellow-700 text-white' : 'border-stone-700 bg-stone-900 text-stone-300'}`}>
              <CircleDot className="h-3.5 w-3.5 shrink-0" />
              <span className="rapid-whip-copy">Tesbih · Tövbe estağfurullah</span>
            </button>
          </div>
          {engine.tasbihMode ? (
            <div className="rapid-whip-copy flex items-center gap-2 text-yellow-300">
              <CircleDot className="h-4 w-4" /><span className="text-xs font-bold">Tesbih Sahnesi</span>
            </div>
          ) : engine.hellSceneEnabled ? (
            <div className="rapid-whip-copy flex items-center gap-2 text-red-400">
              <Flame className="h-4 w-4" /><span className="text-xs font-bold">Cehennem Sahnesi</span>
            </div>
          ) : engine.burialSceneEnabled ? (
            <div className="rapid-whip-copy flex items-center gap-2 text-emerald-400">
              <Shovel className="h-4 w-4" />
              <span className="text-xs font-bold">Gömme Sahnesi</span>
            </div>
          ) : engine.bombSceneEnabled ? (
            <div className="rapid-whip-copy flex items-center gap-2 text-orange-400">
              <Bomb className="h-4 w-4" />
              <span className="text-xs font-bold">Bomba Sahnesi</span>
            </div>
          ) : <>
          <div className="flex items-center justify-between gap-2">
            <div className="rapid-whip-copy flex items-center gap-2 text-amber-400">
              <Zap className="h-4 w-4 shrink-0" />
              <span className="text-xs font-bold uppercase tracking-wide">Seri Kırbaç</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-label="Seri kırbaç modu"
              aria-checked={rapidWhip}
              onClick={toggleRapidWhip}
              className={`relative h-7 w-12 shrink-0 cursor-pointer rounded-full border transition-colors ${rapidWhip ? 'border-amber-400 bg-amber-500' : 'border-stone-600 bg-stone-800'}`}
            >
              <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${rapidWhip ? 'translate-x-5' : ''}`} />
            </button>
          </div>
          <p className="rapid-whip-copy mt-2 text-[11px] leading-snug text-stone-400">
            Açıkken tüm zombilere sırayla hızlı vurur.
          </p>
          <div className="rapid-whip-speed mt-3 border-t border-stone-700 pt-2">
            <div className="rapid-whip-speed-label mb-1 flex items-center justify-between text-[11px] text-stone-300">
              <span className="rapid-whip-speed-name">Hız</span>
              <output>{rapidWhipSpeed.toFixed(1)}×</output>
            </div>
            <input
              type="range"
              aria-label="Seri kırbaç hızı"
              min="0.1"
              max="2"
              step="0.1"
              value={rapidWhipSpeed}
              onChange={changeRapidWhipSpeed}
              className="rapid-whip-slider w-full cursor-pointer accent-amber-500"
            />
          </div>
          </>}
        </aside>
      )}
        <SettingsModal
          engine={engine}
          onRefresh={() => { setTick((t) => t + 1); publishControl(); }}
          onBombSceneChange={enabled => changeScene(enabled ? 'BOMB' : 'WHIP')}
          onBurialSceneChange={enabled => changeScene(enabled ? 'BURIAL' : 'WHIP')}
          onHellSceneChange={enabled => changeScene(enabled ? 'HELL' : 'WHIP')}
          tiktokUsername={tiktokUsername}
          tiktokStatus={liveStatus}
          tiktokMessage={liveMessage}
          onTikTokUsernameChange={changeTikTokUsername}
          currentMap={currentMap}
          onSelectMap={handleSelectMap}
          obsUrl={studioUrl.toString()}
          controlKey={controlKey}
          onControlKeyChange={changeControlKey}
          showPublishedControlLink={isLocalControl}
          publishedSiteUrl={publishedSiteUrl}
          publishedSiteError={publishedSiteError}
          onOpenPublishedControl={openPublishedControl}
        />
        </aside>
      )}
    </div>
  );
}
