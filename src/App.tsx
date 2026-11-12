import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GameEngine } from './game/gameEngine';
import { GameCanvas } from './components/GameCanvas';
import { HUD } from './components/HUD';
import { ShopModal } from './components/ShopModal';
import { SettingsModal } from './components/SettingsModal';
import { soundEngine } from './game/audio';
import { Play, RotateCcw, Sparkles, Shield, Volume2, Skull, Zap, Bomb, Shovel } from 'lucide-react';

// Preloaded generated image assets
import saharaUrl from './assets/images/sahara-sunny.png';
export const ARABIAN_DESERT_BG_URL = saharaUrl;
export const GRAVEYARD_BG_URL = saharaUrl;
const CREST_URL = '/src/assets/images/zombie_hunter_crest_1794419032026.jpg';

export default function App() {
  const [gameState, setGameState] = useState<'TITLE' | 'PLAYING' | 'GAME_OVER'>('TITLE');
  const [currentMap, setCurrentMap] = useState<'DESERT' | 'GRAVEYARD'>('DESERT');
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isShopOpen, setIsShopOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [rapidWhip, setRapidWhip] = useState(false);
  const [rapidWhipSpeed, setRapidWhipSpeed] = useState(1);
  const [, setTick] = useState<number>(0);

  // Keep the safe area reserved without displaying chat or overlay buttons.
  const engineRef = useRef<GameEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new GameEngine(ARABIAN_DESERT_BG_URL);
    engineRef.current.setTikTokMode(true);
  }
  const engine = engineRef.current;

  const handleSelectMap = (map: 'DESERT' | 'GRAVEYARD') => {
    setCurrentMap(map);
    engine.setBackgroundImage(map === 'DESERT' ? ARABIAN_DESERT_BG_URL : GRAVEYARD_BG_URL);
  };

  // Force re-render for HUD updates
  const handleStatsUpdate = useCallback(() => {
    if (engine.isGameOver && gameState !== 'GAME_OVER') {
      setGameState('GAME_OVER');
    }
    setTick((t) => (t + 1) % 1000);
  }, [engine, gameState]);

  const handleStartGame = async () => {
    soundEngine.startBackground();
    try { await soundEngine.prepare(); } catch { soundEngine.stopBackground(); alert('Oyun sesleri yüklenemedi. Lütfen yeniden dene.'); return; }
    engine.restartGame();
    if (!engine.bombSceneEnabled && !engine.burialSceneEnabled) soundEngine.sayGreeting();
    setGameState('PLAYING');
    setIsPaused(false);
    // Sound engine trigger on first interaction

  };

  const handleRestart = () => {
    soundEngine.startBackground();
    engine.restartGame();
    if (!engine.bombSceneEnabled && !engine.burialSceneEnabled) soundEngine.sayGreeting();
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
  };

  const changeRapidWhipSpeed = (event: React.ChangeEvent<HTMLInputElement>) => {
    const speed = Number(event.target.value);
    engine.setRapidWhipSpeed(speed);
    setRapidWhipSpeed(engine.rapidWhipSpeed);
  };

  const changeScene = (scene: 'WHIP' | 'BOMB' | 'BURIAL') => {
    if (scene === 'BOMB') engine.setBombScene(true);
    else if (scene === 'BURIAL') engine.setBurialScene(true);
    else if (engine.burialSceneEnabled) engine.setBurialScene(false);
    else engine.setBombScene(false);
    setIsSettingsOpen(false);
    setIsPaused(false);
    setTick((t) => t + 1);
    if (scene !== 'WHIP' && gameState === 'TITLE') void handleStartGame();
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Escape' && !event.repeat && gameState === 'PLAYING' && !isShopOpen && !isSettingsOpen) {
        setIsPaused(value => !value);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [gameState, isShopOpen, isSettingsOpen]);

  return (
    <div className="relative w-screen h-[100dvh] bg-[#05070a] text-slate-100 overflow-hidden font-body select-none">
      {/* 1. Title Menu Screen */}
      {gameState === 'TITLE' && (
        <div
          className="relative z-20 w-full h-full flex flex-col items-center justify-center p-6 bg-cover bg-center"
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
                alt="Kırbaç Avcısı Arması"
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>

            {/* Title */}
            <h1 className="font-cinzel text-3xl sm:text-4xl font-extrabold tracking-wider text-stone-100 drop-shadow-md mb-1.5">
              KIRBAÇ AVCISI
            </h1>
            <div className="text-xs uppercase tracking-[0.25em] font-cinzel text-amber-500 font-semibold mb-3">
              Sahra Çölü · Fizik Tabanlı Kırbaç Savaşı
            </div>

            <p className="text-xs sm:text-sm text-stone-400 mb-6 max-w-md leading-relaxed">
              Keffiyeh puşili, yırtık cübbeli Arap bedevi zombileri, zırhlı Sarazen Memlük savaşçıları ve lanetli Sultan'a karşı Verlet ip fiziğiyle kırbacınızı şaklatın!
            </p>

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
              <div className="grid grid-cols-1 gap-2">
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

              <button
                onClick={() => setIsSettingsOpen(true)}
                className="w-full sm:w-auto py-3 px-4 bg-stone-900/90 hover:bg-stone-800 border border-stone-700 text-stone-300 rounded-lg text-xs font-semibold tracking-wider transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Shield className="w-4 h-4 text-amber-500" />
                <span>Ayarlar</span>
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
            isPaused={isPaused || isShopOpen || isSettingsOpen || gameState === 'GAME_OVER'}
            onStatsUpdate={handleStatsUpdate}
          />

          <HUD engine={engine} />

          {/* Paused Screen Overlay */}
          {isPaused && !isShopOpen && !isSettingsOpen && (
            <div className="absolute inset-0 z-40 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center p-6">
              <div className="max-w-md w-full bg-stone-950 border border-stone-800 rounded-xl p-6 text-center shadow-2xl">
                <h2 className="font-cinzel text-2xl font-bold text-stone-100 mb-2">
                  OYUN DURAKLATILDI
                </h2>
                <p className="text-xs text-stone-400 mb-6">
                  Avcı nefesleniyor... Hazır olduğunuzda devam edin.
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
                    onClick={() => setIsSettingsOpen(true)}
                    className="w-full py-2.5 bg-stone-900 hover:bg-stone-800 border border-stone-800 text-amber-400 font-cinzel text-xs tracking-wider rounded-lg transition-colors cursor-pointer"
                  >
                    Ayarlar
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
                  AVCI DÜŞTÜ...
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
      {gameState === 'PLAYING' && (
        <aside className="rapid-whip-panel z-30 rounded-xl border border-amber-600/40 bg-stone-950/95 p-3 shadow-xl">
          <div className="scene-selector mb-3 grid grid-cols-3 gap-1" aria-label="Sahne seçimi">
            <button
              type="button"
              aria-label="Kırbaç sahnesi"
              aria-pressed={!engine.bombSceneEnabled && !engine.burialSceneEnabled}
              onClick={() => changeScene('WHIP')}
              className={`flex items-center justify-center gap-1 rounded-md border px-1 py-2 text-[11px] font-semibold cursor-pointer ${!engine.bombSceneEnabled && !engine.burialSceneEnabled
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
          </div>
          {engine.burialSceneEnabled ? (
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
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            aria-label="Ayarlar"
            className="mt-2 flex w-full items-center justify-center gap-1 rounded-md border border-stone-700 py-1.5 text-[11px] text-stone-300 hover:border-amber-500 hover:text-amber-300 cursor-pointer"
          >
            <Shield className="h-3.5 w-3.5" />
            <span className="rapid-whip-copy">Ayarlar</span>
          </button>
        </aside>
      )}
      {isSettingsOpen && (
        <SettingsModal
          engine={engine}
          onClose={() => setIsSettingsOpen(false)}
          onRefresh={() => setTick((t) => t + 1)}
          onBombSceneChange={enabled => changeScene(enabled ? 'BOMB' : 'WHIP')}
          onBurialSceneChange={enabled => changeScene(enabled ? 'BURIAL' : 'WHIP')}
          currentMap={currentMap}
          onSelectMap={handleSelectMap}
        />
      )}
    </div>
  );
}
