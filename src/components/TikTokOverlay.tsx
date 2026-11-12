import React, { useState, useEffect, useRef } from 'react';
import { GameEngine } from '../game/gameEngine';
import { Heart, Send, Share2, Gift, MessageCircle, Sparkles, UserPlus } from 'lucide-react';
import { soundEngine } from '../game/audio';

interface TikTokOverlayProps {
  engine: GameEngine;
  showOverlay: boolean;
  onToggleOverlay: () => void;
}

interface ChatMessage {
  id: string;
  user: string;
  avatarColor: string;
  text: string;
  isGift?: boolean;
}

const INITIAL_MESSAGES: ChatMessage[] = [
  { id: '1', user: 'Ahmet_34', avatarColor: '#ef4444', text: 'Kırbaç vuruşları efsane görünüyor 🔥' },
  { id: '2', user: 'Zehra_Gamer', avatarColor: '#3b82f6', text: 'Gül gönderdi 🌹 (x10)', isGift: true },
  { id: '3', user: 'Murat_TR', avatarColor: '#10b981', text: '!kasirga at zombiler çok yaklaştı!' },
  { id: '4', user: 'DesertRider', avatarColor: '#f59e0b', text: 'Zırhlı sarazenin kafasını uçur reis 💀' },
];

export const TikTokOverlay: React.FC<TikTokOverlayProps> = ({
  engine,
  showOverlay,
  onToggleOverlay,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [inputText, setInputText] = useState<string>('');
  const [likeCount, setLikeCount] = useState<number>(4820);
  const [hearts, setHearts] = useState<{ id: number; x: number; y: number }[]>([]);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Auto scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Periodic random viewer comments
  useEffect(() => {
    if (!showOverlay) return;
    const interval = setInterval(() => {
      const randomUsers = ['Efe_Can', 'Melis_99', 'GulyabaniAvcisi', 'Baris_G', 'SultanGamer'];
      const randomComments = [
        'Harika şaklattın!',
        'Gül gönderdi 🌹',
        '!ates yazın alev alsınlar!',
        'Ses patlaması çok tatmin edici çat sesi ⚡',
        'Boss ne zaman geliyor?',
      ];
      const rUser = randomUsers[Math.floor(Math.random() * randomUsers.length)];
      const rText = randomComments[Math.floor(Math.random() * randomComments.length)];
      const colors = ['#f43f5e', '#8b5cf6', '#06b6d4', '#eab308', '#10b981'];

      setMessages((prev) => [
        ...prev.slice(-12),
        {
          id: `${Date.now()}_${Math.random()}`,
          user: rUser,
          avatarColor: colors[Math.floor(Math.random() * colors.length)],
          text: rText,
          isGift: rText.includes('Gül'),
        },
      ]);
    }, 4500);

    return () => clearInterval(interval);
  }, [showOverlay]);

  // Handle user typing & sending chat commands
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const trimmed = inputText.trim();
    const userMsg: ChatMessage = {
      id: `${Date.now()}`,
      user: 'Yayıncı (Sen)',
      avatarColor: '#f59e0b',
      text: trimmed,
    };

    setMessages((prev) => [...prev.slice(-15), userMsg]);
    setInputText('');

    // Chat Interactive Commands
    const lower = trimmed.toLowerCase();
    if (lower === '!kasirga' || lower === '!spin') {
      engine.castWhirlwind();
    } else if (lower === '!ates' || lower === '!fire') {
      engine.setWhipType('HELLFIRE');
      soundEngine.playFireExplosion();
    } else if (lower === '!saklat' || lower === '!whip') {
      engine.whip.triggerSnapImpulse(engine.playerX + 350, engine.groundY - 50, 1.5);
    } else if (lower === '!can' || lower === '!heal') {
      engine.stats.hp = Math.min(engine.stats.maxHp, engine.stats.hp + 30);
      soundEngine.playFireExplosion();
    }
  };

  const handleLike = () => {
    setLikeCount((c) => c + 1);
    const newHeart = { id: Date.now() + Math.random(), x: Math.random() * 20 - 10, y: 0 };
    setHearts((prev) => [...prev.slice(-10), newHeart]);
    setTimeout(() => {
      setHearts((prev) => prev.filter((h) => h.id !== newHeart.id));
    }, 1200);
  };

  if (!showOverlay) {
    return (
      <div className="absolute bottom-3 left-4 z-30 pointer-events-auto">
        <button
          onClick={onToggleOverlay}
          className="px-3 py-1.5 bg-rose-600/90 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold tracking-wider flex items-center gap-1.5 shadow-lg backdrop-blur-md cursor-pointer transition-colors"
        >
          <span>📱 TikTok Safe Area & Canlı Sohbet</span>
        </button>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 pointer-events-none z-30 flex flex-col justify-between overflow-hidden">
      {/* 1. TOP SAFE ZONE: TikTok Live Room Header */}
      <div className="pt-3 px-3 sm:px-5 flex items-center justify-between pointer-events-auto">
        {/* Streamer Profile Pill */}
        <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md border border-white/10 p-1.5 pr-3 rounded-full shadow-lg">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-600 to-rose-600 flex items-center justify-center text-xs font-bold text-white border border-white/30">
            🧟
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 leading-tight">
              <span className="text-xs font-bold text-white tracking-tight">Harami</span>
              <span className="px-1.5 py-0.2 bg-rose-600 text-[9px] font-bold text-white rounded-full uppercase animate-pulse">
                CANLI
              </span>
            </div>
            <span className="text-[10px] text-stone-300 tabular-nums">💎 4.8K Elmas</span>
          </div>
          <button className="ml-1 p-1 bg-rose-600 hover:bg-rose-500 rounded-full text-white cursor-pointer transition-colors">
            <UserPlus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Viewers & Safe Area Mode Toggle */}
        <div className="flex items-center gap-2">
          <div className="px-2.5 py-1 bg-black/60 backdrop-blur-md border border-white/10 rounded-full text-xs font-semibold text-white tabular-nums flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>12.4K</span>
          </div>

          <button
            onClick={onToggleOverlay}
            className="px-2.5 py-1 bg-stone-900/80 hover:bg-stone-800 text-stone-300 text-[11px] font-medium rounded-full border border-stone-700 cursor-pointer transition-colors"
            title="TikTok Overlay'ini Gizle"
          >
            Arayüzü Kapat
          </button>
        </div>
      </div>

      {/* 2. RIGHT-SIDE SAFE COLUMN: TikTok Reaction & Gift column */}
      <div className="absolute right-3 bottom-[320px] flex flex-col items-center gap-3 pointer-events-auto">
        {/* Floating Hearts Animation */}
        <div className="relative w-12 h-12 flex items-center justify-center">
          {hearts.map((h) => (
            <div
              key={h.id}
              className="absolute pointer-events-none text-rose-500 animate-floatUp text-xl"
              style={{ transform: `translateX(${h.x}px)` }}
            >
              ❤️
            </div>
          ))}
          <button
            onClick={handleLike}
            className="w-11 h-11 rounded-full bg-black/60 backdrop-blur-md border border-white/15 flex flex-col items-center justify-center text-rose-500 hover:scale-110 active:scale-95 transition-all shadow-xl cursor-pointer"
          >
            <Heart className="w-5 h-5 fill-rose-500" />
            <span className="text-[9px] font-bold text-white tabular-nums -mt-0.5">
              {likeCount >= 1000 ? `${(likeCount / 1000).toFixed(1)}k` : likeCount}
            </span>
          </button>
        </div>

        {/* Gift Target Button */}
        <button
          onClick={() => {
            soundEngine.playWhipCrack(1.4, 'shock');
            engine.stats.bloodEssence += 50;
          }}
          className="w-11 h-11 rounded-full bg-amber-500/20 backdrop-blur-md border border-amber-500/40 flex flex-col items-center justify-center text-amber-400 hover:scale-110 active:scale-95 transition-all shadow-xl cursor-pointer"
          title="Hediye Gönder (+50 Kan Özü)"
        >
          <Gift className="w-5 h-5" />
          <span className="text-[9px] font-bold text-amber-300">Hediye</span>
        </button>

        {/* Share Button */}
        <button className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-md border border-white/15 flex items-center justify-center text-white hover:scale-105 transition-all shadow-xl cursor-pointer">
          <Share2 className="w-4 h-4" />
        </button>
      </div>

      {/* 3. BOTTOM SAFE ZONE: TikTok Live Chat Feed & Comment Typing Input */}
      {/* Designed to safely sit in the bottom 290px so the keyboard & chat NEVER obstruct the game! */}
      <div className="w-full max-w-md p-3 pb-4 pointer-events-auto flex flex-col gap-2">
        {/* Safe Area Visual Badge */}
        <div className="flex items-center gap-1.5 text-[10px] text-amber-400 font-semibold bg-black/40 px-2.5 py-0.5 rounded-full w-fit border border-amber-500/30">
          <Sparkles className="w-3 h-3 text-amber-400" />
          <span>TikTok Güvenli Alanı: Oyun Yukarıda Sorunsuz Akıyor</span>
        </div>

        {/* Live Chat Message Stream (Semi-transparent scrollable feed) */}
        <div className="h-32 overflow-y-auto space-y-1.5 pr-2 scrollbar-none mask-gradient">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-start gap-1.5 text-xs py-1 px-2.5 rounded-xl w-fit max-w-[95%] backdrop-blur-md ${
                msg.isGift
                  ? 'bg-rose-950/70 border border-rose-500/40 text-rose-200'
                  : 'bg-black/60 border border-white/5 text-stone-200'
              }`}
            >
              <span className="font-bold text-[11px]" style={{ color: msg.avatarColor }}>
                {msg.user}:
              </span>
              <span className="leading-tight">{msg.text}</span>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Keyboard / Comment Input Bar */}
        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Yorum veya komut yaz (!kasirga, !ates, !can)..."
              className="w-full py-2.5 pl-3.5 pr-10 bg-black/75 backdrop-blur-md border border-white/20 focus:border-amber-500 rounded-full text-xs text-white placeholder-stone-400 outline-none transition-all shadow-lg"
            />
          </div>

          <button
            type="submit"
            className="p-2.5 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white rounded-full transition-all shadow-lg cursor-pointer shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
