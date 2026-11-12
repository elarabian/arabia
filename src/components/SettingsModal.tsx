import React from 'react';
import { GameEngine } from '../game/gameEngine';
import { soundEngine } from '../game/audio';
import { Volume2, Shield, Eye, Flame, MousePointer, Bomb, Shovel } from 'lucide-react';
import { featureFlags } from '../featureFlags';

interface SettingsModalProps {
  engine: GameEngine;
  onRefresh: () => void;
  onBombSceneChange: (enabled: boolean) => void;
  onBurialSceneChange: (enabled: boolean) => void;
  onHellSceneChange: (enabled: boolean) => void;
  tiktokUsername: string;
  tiktokStatus: string;
  tiktokMessage: string;
  onTikTokUsernameChange: (value: string) => void;
  obsUrl: string;
  currentMap?: 'DESERT' | 'GRAVEYARD';
  onSelectMap?: (map: 'DESERT' | 'GRAVEYARD') => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  engine,
  onRefresh,
  onBombSceneChange,
  onBurialSceneChange,
  onHellSceneChange,
  tiktokUsername,
  tiktokStatus,
  tiktokMessage,
  onTikTokUsernameChange,
  obsUrl,
  currentMap = 'DESERT',
  onSelectMap,
}) => {
  const [vol, setVol] = React.useState(soundEngine.getVolume());
  const [usernameDraft, setUsernameDraft] = React.useState(tiktokUsername);
  const [obsCopied, setObsCopied] = React.useState(false);

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVol(val);
    soundEngine.setVolume(val);
    engine.settings.soundVolume = val;
    onRefresh();
  };

  const toggleScreenShake = () => {
    engine.settings.screenShake = !engine.settings.screenShake;
    onRefresh();
  };

  const toggleRain = () => {
    engine.settings.rainEffect = !engine.settings.rainEffect;
    onRefresh();
  };

  const setBloodIntensity = (val: number) => {
    engine.settings.bloodIntensity = val;
    onRefresh();
  };

  return (
    <section className="settings-side-panel bg-stone-950 border-l border-stone-800 shadow-2xl flex flex-col" aria-label="Oyun ayarları">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800 bg-stone-900/60">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-amber-500" />
            <div>
              <h2 className="font-cinzel text-lg font-bold text-stone-100 tracking-wide">
                Atmosfer, Harita & Kontrol Ayarları
              </h2>
              <div className="text-xs text-stone-400">
                Arap çölü kıyameti, fizik efektleri ve oynanış kılavuzu
              </div>
            </div>
          </div>

        </div>

        {/* Content body */}
        <div className="p-6 overflow-y-auto space-y-6">
          <div className="space-y-2 rounded-lg border border-amber-700/50 bg-amber-950/20 p-3">
            <div className="text-xs font-semibold text-amber-200">OBS oyun bağlantısı · 1080×1920</div>
            <p className="text-[11px] text-stone-400">Bu bağlantı yalnızca oyunu gösterir; kontrol panelleri OBS görüntüsüne girmez.</p>
            <input type="text" readOnly value={obsUrl} aria-label="OBS oyun bağlantısı"
              onFocus={event => event.currentTarget.select()}
              className="w-full rounded-md border border-stone-700 bg-stone-900 px-2 py-1.5 text-[11px] text-stone-200" />
            <button type="button" onClick={async () => {
              try { await navigator.clipboard.writeText(obsUrl); setObsCopied(true); }
              catch { setObsCopied(false); }
            }} className="rounded-md bg-amber-700 px-3 py-1.5 text-xs font-semibold text-stone-950">
              {obsCopied ? 'Kopyalandı' : 'Bağlantıyı kopyala'}
            </button>
          </div>
          {featureFlags.tiktokEnabled && (
            <div className="space-y-2 rounded-lg border border-pink-700/50 bg-pink-950/20 p-3">
              <label htmlFor="tiktok-username" className="block text-xs font-semibold text-pink-200">
                TikTok LIVE yayıncı kullanıcı adı
              </label>
              <div className="flex gap-2">
              <input id="tiktok-username" type="text" value={usernameDraft}
                onChange={event => setUsernameDraft(event.target.value)}
                placeholder="@kullaniciadi" autoComplete="off" spellCheck={false}
                className="min-w-0 flex-1 rounded-md border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-white outline-none focus:border-pink-500" />
              <button type="button" onClick={() => onTikTokUsernameChange(usernameDraft)}
                className="rounded-md bg-pink-700 px-3 py-2 text-xs font-semibold text-white hover:bg-pink-600">
                Bağlan
              </button>
              </div>
              <p className="text-[11px] text-stone-400">Canlı yayına katılan her izleyici adıyla bir zombi olur. Yayıncıyı değiştirince zombi listesi yenilenir.</p>
              <p role="status" className={`text-[11px] ${tiktokStatus === 'connected' ? 'text-emerald-300' : 'text-amber-300'}`}>
                Durum: {tiktokStatus === 'connected' ? 'Bağlandı' : tiktokStatus === 'connecting' ? 'Bağlanıyor' : tiktokStatus === 'offline' ? 'Yayın çevrimdışı' : 'Bağlantı hatası'}
                {tiktokMessage ? ` · ${tiktokMessage}` : ''}
              </p>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 rounded-lg border border-orange-700/50 bg-orange-950/30 p-3">
            <div className="flex items-start gap-2">
              <Bomb className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" />
              <div>
                <div className="text-xs font-semibold text-orange-200">İkinci Sahne: Bomba</div>
                <div className="text-[11px] text-stone-400">Kahraman bombayı bırakıp kaçar; 3 saniye sonra zombiler savrulur.</div>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-label="Bomba sahnesi"
              aria-checked={engine.bombSceneEnabled}
              onClick={() => onBombSceneChange(!engine.bombSceneEnabled)}
              className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${engine.bombSceneEnabled
                ? 'border-orange-500 bg-orange-600 text-white'
                : 'border-stone-700 bg-stone-900 text-stone-300'}`}
            >
              {engine.bombSceneEnabled ? 'Açık' : 'Kapalı'}
            </button>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-700/50 bg-emerald-950/30 p-3">
            <div className="flex items-start gap-2">
              <Shovel className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              <div>
                <div className="text-xs font-semibold text-emerald-200">Üçüncü Sahne: Gömme</div>
                <div className="text-[11px] text-stone-400">Kahraman zombileri sırayla ipiyle yakalar, çeker ve kürekle gömer.</div>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-label="Gömme sahnesi"
              aria-checked={engine.burialSceneEnabled}
              onClick={() => onBurialSceneChange(!engine.burialSceneEnabled)}
              className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${engine.burialSceneEnabled
                ? 'border-emerald-500 bg-emerald-700 text-white'
                : 'border-stone-700 bg-stone-900 text-stone-300'}`}
            >
              {engine.burialSceneEnabled ? 'Açık' : 'Kapalı'}
            </button>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-red-700/50 bg-red-950/30 p-3">
            <div className="flex items-start gap-2">
              <Flame className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <div>
                <div className="text-xs font-semibold text-red-200">Dördüncü Sahne: Cehennem</div>
                <div className="text-[11px] text-stone-400">Kahraman zombiyi yakalayıp yanan kuyuya atar.</div>
              </div>
            </div>
            <button type="button" role="switch" aria-label="Cehennem sahnesi"
              aria-checked={engine.hellSceneEnabled}
              onClick={() => onHellSceneChange(!engine.hellSceneEnabled)}
              className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold cursor-pointer ${engine.hellSceneEnabled
                ? 'border-red-500 bg-red-700 text-white' : 'border-stone-700 bg-stone-900 text-stone-300'}`}>
              {engine.hellSceneEnabled ? 'Açık' : 'Kapalı'}
            </button>
          </div>
          {/* Map Selector */}
          {onSelectMap && (
            <div className="space-y-2">
              <label className="text-xs font-cinzel font-semibold uppercase tracking-wider text-amber-500">
                Savaş Alanı / Harita Seçimi
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => onSelectMap('DESERT')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                    currentMap === 'DESERT'
                      ? 'bg-amber-950/60 border-amber-500 text-amber-300 shadow-md'
                      : 'bg-stone-900 border-stone-800 text-stone-400 hover:border-stone-700'
                  }`}
                >
                  🏜️ Arap Çölü Nekropolü
                </button>
                <button
                  onClick={() => onSelectMap('GRAVEYARD')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                    currentMap === 'GRAVEYARD'
                      ? 'bg-amber-950/60 border-amber-500 text-amber-300 shadow-md'
                      : 'bg-stone-900 border-stone-800 text-stone-400 hover:border-stone-700'
                  }`}
                >
                  ⚰️ Gotik Mezarlık
                </button>
              </div>
            </div>
          )}

          {/* Audio */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-cinzel font-semibold uppercase tracking-wider text-stone-300 flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-amber-500" />
                <span>Ses Efektleri (Web Audio Synthesizer)</span>
              </label>
              <span className="text-xs font-mono text-stone-400 tabular-nums">
                {Math.round(vol * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={vol}
              onChange={handleVolumeChange}
              className="w-full accent-amber-500 bg-stone-800 cursor-pointer"
            />
          </div>

          {/* Graphics & Atmosphere */}
          <div className="space-y-4 pt-4 border-t border-stone-800/80">
            <h3 className="font-cinzel text-xs font-semibold uppercase tracking-wider text-amber-500">
              Görsel & Atmosfer Efektleri
            </h3>

            {/* Blood Gore Level */}
            <div className="space-y-1.5">
              <div className="text-xs text-stone-300 font-medium">Kan & Uzuv Parçalanma Yoğunluğu</div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { val: 0, label: 'Yok' },
                  { val: 1, label: 'Normal' },
                  { val: 2, label: 'Vahşi (Maks)' },
                ].map((item) => (
                  <button
                    key={item.val}
                    onClick={() => setBloodIntensity(item.val)}
                    className={`py-2 px-3 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                      engine.settings.bloodIntensity === item.val
                        ? 'bg-rose-950/60 border-rose-600 text-rose-200'
                        : 'bg-stone-900 border-stone-800 text-stone-400 hover:bg-stone-800'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Screen Shake */}
            <div className="flex items-center justify-between p-3 bg-stone-900/40 border border-stone-800 rounded-lg">
              <div>
                <div className="text-xs font-semibold text-stone-200">Kinetik Ekran Sarsıntısı</div>
                <div className="text-[11px] text-stone-400">Şaklatma ve patlamalarda kamera titreşimi</div>
              </div>
              <button
                onClick={toggleScreenShake}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                  engine.settings.screenShake
                    ? 'bg-amber-600 text-stone-950 border-amber-500'
                    : 'bg-stone-900 text-stone-400 border-stone-800'
                }`}
              >
                {engine.settings.screenShake ? 'Açık' : 'Kapalı'}
              </button>
            </div>
            <div className="rounded-lg border border-stone-800 bg-stone-900/40 p-3">
              <div className="mb-2 flex justify-between text-xs text-stone-200">
                <label htmlFor="shake-strength">Sarsıntı Şiddeti</label>
                <output>{Math.round(engine.settings.screenShakeStrength * 100)}%</output>
              </div>
              <input id="shake-strength" type="range" min="0" max="100" step="5"
                value={Math.round(engine.settings.screenShakeStrength * 100)}
                onChange={event => {
                  engine.settings.screenShakeStrength = Number(event.target.value) / 100;
                  onRefresh();
                }}
                className="w-full cursor-pointer accent-amber-500" />
            </div>

            {/* Rain */}
            <div className="flex items-center justify-between p-3 bg-stone-900/40 border border-stone-800 rounded-lg">
              <div>
                <div className="text-xs font-semibold text-stone-200">Gotik Fırtına & Çöl Rüzgarı</div>
                <div className="text-[11px] text-stone-400">Eğimli yağmur ve toz parçacıkları</div>
              </div>
              <button
                onClick={toggleRain}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                  engine.settings.rainEffect
                    ? 'bg-sky-600 text-stone-950 border-sky-500'
                    : 'bg-stone-900 text-stone-400 border-stone-800'
                }`}
              >
                {engine.settings.rainEffect ? 'Açık' : 'Kapalı'}
              </button>
            </div>
          </div>

          {/* Gameplay Mechanics Guide */}
          <div className="space-y-3 pt-4 border-t border-stone-800/80">
            <h3 className="font-cinzel text-xs font-semibold uppercase tracking-wider text-amber-500 flex items-center gap-2">
              <MousePointer className="w-4 h-4" />
              <span>Arap Zombi Ordusu & Kırbaç Taktikleri</span>
            </h3>

            <div className="text-xs text-stone-300 space-y-2 leading-relaxed bg-stone-900/50 p-3.5 rounded-lg border border-stone-800">
              <p>
                <strong className="text-amber-400">⚡ Süpersonik Kırbaç Şaklatması:</strong> Fareyi hızla salladığınızda ip boyunca hızlanan kinetik dalga ses hızını aşar ve süpersonik <strong>ÇAT!</strong> sesiyle patlayıcı kritik hasar verir.
              </p>
              <p>
                <strong className="text-rose-400">💀 Arap Zombi Tipleri & Taktikler:</strong>
              </p>
              <ul className="list-disc pl-4 space-y-1 text-stone-400">
                <li><strong>Bedevi Shambler:</strong> Kırmızı-beyaz Keffiyeh puşi, siyah agel ve yırtık çöl cübbesi giyer. Kafasına vurduğunuzda puşisiyle birlikte kafası uçar!</li>
                <li><strong>Zırhlı Sarazen Memlük:</strong> Sivri uçlu çelik/pirinç Külah-ı Hud miğferi ve zırhı vardır; Dikenli Zincir Kırbaç zırhını söker.</li>
                <li><strong>Kum Sürüneni:</strong> Mumya bezlerine sarılıdır, kuma yapışık sürünür; alçaktan savurarak vurun.</li>
                <li><strong>Çöl Veba Cadısı:</strong> Siyah abaye ve altın liralar takar, yeşil lanetli asit püskürtür.</li>
                <li><strong>Lanetli Sultan (Boss):</strong> Mor kadife kaftanı, mücevherli sarığı ve göğsüne saplanmış eğri kılıcıyla devasa liderdir.</li>
              </ul>
              <p>
                <strong className="text-sky-400">🎮 Kısayollar:</strong> Sol Tık / Fare Hızlı Savurma · [Boşluk] İleri Şaklatma · [Q] Kasırga Vuruşu · [E] Şok Patlaması.
              </p>
            </div>
          </div>
        </div>

    </section>
  );
};
