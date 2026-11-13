import React from 'react';
import type { GameEngine } from '../game/gameEngine';
import { soundEngine } from '../game/audio';
import { backgroundTracks } from '../game/backgroundTracks';
import { WORLD_MAPS, type WorldMap } from '../game/worldMaps';
import type { ControlScene } from '../controlSync';
import { featureFlags } from '../featureFlags';
import { Activity, ArrowUpRight, Bomb, Check, ChevronDown, CircleDot, Coins, Copy,
  Crown, Flame, Flower2, Link2, Map, Mountain, Music2, Pause, Play, Radio,
  RotateCcw, Settings2, Ship, Shovel, Volume2, Zap } from 'lucide-react';

const SCENES = [
  { id: 'WHIP', label: 'Kırbaç', icon: Zap },
  { id: 'BURIAL', label: 'Gömme', icon: Shovel },
  { id: 'HELL', label: 'Cehennem', icon: Flame },
  { id: 'CAMEL', label: 'Deve', icon: Mountain },
  { id: 'BOMB', label: 'Bomba', icon: Bomb },
  { id: 'FLOWERS', label: 'Gül ve Lale', icon: Flower2 },
  { id: 'MONEY_RAIN', label: 'Altın ve Dolar', icon: Coins },
  { id: 'TASBIH', label: 'Tesbih', icon: CircleDot },
  { id: 'PHARAOH', label: 'Firavun', icon: Crown },
  { id: 'NOAH', label: "Nuh'un Gemisi", icon: Ship },
] satisfies { id: ControlScene; label: string; icon: typeof Zap }[];

interface SettingsModalProps {
  engine: GameEngine;
  onRefresh: () => void;
  currentScene: ControlScene;
  onSceneChange: (scene: ControlScene) => void;
  rapidWhip: boolean;
  rapidWhipSpeed: number;
  onRapidWhipChange: () => void;
  onRapidWhipSpeedChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  gameOnline: boolean;
  isPaused: boolean;
  onPause: () => void;
  onRestart: () => void;
  viewerCount: number;
  likeCount: number;
  relayError: string;
  gameUrl: string;
  tiktokUsername: string;
  tiktokStatus: string;
  tiktokMessage: string;
  onTikTokUsernameChange: (value: string) => void;
  obsUrl: string;
  controlKey: string;
  onControlKeyChange: (value: string) => void;
  showPublishedControlLink: boolean;
  publishedSiteUrl: string;
  publishedSiteError: string;
  onOpenPublishedControl: (value: string) => void;
  currentMap: WorldMap;
  onSelectMap: (map: WorldMap) => void;
  mapBackgrounds: Record<WorldMap, string>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return <button type="button" role="switch" aria-label={label} aria-checked={checked}
    onClick={onChange} className={`control-toggle ${checked ? 'is-on' : ''}`}><span /></button>;
}

export const SettingsModal: React.FC<SettingsModalProps> = (props) => {
  const { engine, currentScene, onSceneChange, onRefresh, currentMap, onSelectMap } = props;
  const [usernameDraft, setUsernameDraft] = React.useState(props.tiktokUsername);
  const [publishedSiteDraft, setPublishedSiteDraft] = React.useState(props.publishedSiteUrl);
  const [controlKeyDraft, setControlKeyDraft] = React.useState(props.controlKey);
  const [copyStatus, setCopyStatus] = React.useState<'idle' | 'copied' | 'selected'>('idle');
  const obsInput = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => setUsernameDraft(props.tiktokUsername), [props.tiktokUsername]);
  React.useEffect(() => setPublishedSiteDraft(props.publishedSiteUrl), [props.publishedSiteUrl]);
  React.useEffect(() => setControlKeyDraft(props.controlKey), [props.controlKey]);
  React.useEffect(() => setCopyStatus('idle'), [props.obsUrl]);
  const activeScene = SCENES.find(scene => scene.id === currentScene)!;
  const activeMap = WORLD_MAPS.find(map => map.id === currentMap)!;
  const liveConnected = props.tiktokStatus === 'connected';
  const liveLabel = liveConnected ? 'Bağlı' : props.tiktokStatus === 'connecting' ? 'Bağlanıyor'
    : props.tiktokStatus === 'offline' ? 'Çevrimdışı' : 'Bağlantı hatası';
  const copyObsUrl = async () => {
    try { await navigator.clipboard.writeText(props.obsUrl); setCopyStatus('copied'); }
    catch { obsInput.current?.select(); setCopyStatus('selected'); }
  };

  return <section className="control-dashboard" aria-label="Yayın kontrol paneli">
    <header className="control-topbar">
      <div className="control-brand">
        <span className="control-brand-icon"><Radio size={20} /></span>
        <div><div className="control-eyebrow">HARAMİ · LIVE</div><h1>Yayın kontrolü</h1></div>
      </div>
      <div className="control-header-actions">
        <span className={`control-status ${props.gameOnline ? 'is-connected' : ''}`} role="status">
          <i />{props.gameOnline ? 'Oyun bağlı' : 'Oyun bekleniyor'}
        </span>
        <a className="control-button" href={props.gameUrl} target="_blank" rel="noreferrer">
          <ArrowUpRight size={15} /> Oyun ekranı
        </a>
        <button type="button" className="control-button" onClick={props.onPause}>
          {props.isPaused ? <Play size={14} /> : <Pause size={14} />}{props.isPaused ? 'Devam et' : 'Duraklat'}
        </button>
        <button type="button" className="control-button control-button-quiet" onClick={props.onRestart}>
          <RotateCcw size={14} /> Yeniden başlat
        </button>
      </div>
    </header>
    {props.relayError && <div className="control-alert" role="alert">{props.relayError}</div>}

    <div className="control-grid">
      <div className="control-column">
        <section className="control-card" aria-labelledby="scene-heading">
          <div className="control-card-heading"><h2 id="scene-heading"><Activity size={15} /> Sahneler</h2>
            <span className="control-active-label">{activeScene.label}</span></div>
          <div className="control-scene-grid" aria-label="Sahne seçimi">
            {SCENES.map(({id, label, icon: Icon}) => <button key={id} type="button"
              aria-label={`${label} sahnesi`} aria-pressed={currentScene === id}
              className={`control-scene ${currentScene === id ? 'is-selected' : ''}`}
              onClick={() => onSceneChange(id)}>
              <Icon size={19} strokeWidth={1.7} /><span>{label}</span>
              {currentScene === id && <Check className="control-selection-check" size={11} />}
            </button>)}
          </div>
          {currentScene === 'WHIP' && <div className="control-rapid-row">
            <div className="control-inline"><span>Seri kırbaç</span>
              <Toggle label="Seri kırbaç modu" checked={props.rapidWhip} onChange={props.onRapidWhipChange} /></div>
            <div className="control-speed"><label htmlFor="rapid-speed">Hız</label>
              <input id="rapid-speed" type="range" aria-label="Seri kırbaç hızı" min="0.1" max="2" step="0.1"
                value={props.rapidWhipSpeed} onChange={props.onRapidWhipSpeedChange} />
              <output htmlFor="rapid-speed">{props.rapidWhipSpeed.toFixed(1)}×</output></div>
          </div>}
          {currentScene === 'NOAH' && <div className="control-progress" aria-label="Gemi yapım ilerlemesi">
            <span>Gemi yapımı</span><progress aria-label="Gemi yapım ilerlemesi" max="100" value={engine.noahBuildProgress * 100} />
            <output>{Math.round(engine.noahBuildProgress * 100)}%</output>
          </div>}
        </section>

        <section className="control-card" aria-labelledby="map-heading">
          <div className="control-card-heading"><h2 id="map-heading"><Map size={15} /> Savaş alanı</h2>
            <span className="control-muted">{activeMap.label}</span></div>
          <div className="control-map-grid" aria-label="Savaş Alanı / Harita Seçimi">
            {WORLD_MAPS.map(map => <button type="button" key={map.id} onClick={() => onSelectMap(map.id)}
              aria-pressed={currentMap === map.id}
              className={`control-map ${currentMap === map.id ? 'is-selected' : ''}`}
              style={{backgroundImage:`linear-gradient(0deg, rgba(0,0,0,.82), rgba(0,0,0,.08)), url("${props.mapBackgrounds[map.id]}")`}}>
              <span>{map.label}</span>{currentMap === map.id && <Check size={13} />}
            </button>)}
          </div>
        </section>

        <details className="control-card control-details">
          <summary><span><Settings2 size={15} /> Görsel ayarlar</span><ChevronDown size={15} /></summary>
          <div className="control-details-body">
            <div className="control-setting-row"><span>Ekran sarsıntısı</span>
              <Toggle label="Ekran sarsıntısı" checked={engine.settings.screenShake}
                onChange={() => {engine.settings.screenShake = !engine.settings.screenShake; onRefresh();}} /></div>
            <div className="control-setting-row"><label htmlFor="shake-strength">Sarsıntı şiddeti</label>
              <div className="control-range-field"><input id="shake-strength" type="range" min="0" max="100" step="5"
                disabled={!engine.settings.screenShake} value={Math.round(engine.settings.screenShakeStrength * 100)}
                onChange={event => {engine.settings.screenShakeStrength = Number(event.target.value) / 100; onRefresh();}} />
                <output htmlFor="shake-strength">{Math.round(engine.settings.screenShakeStrength * 100)}%</output></div></div>
            <div className="control-setting-row"><span>Yağmur ve rüzgâr</span>
              <Toggle label="Yağmur ve rüzgâr" checked={engine.settings.rainEffect}
                onChange={() => {engine.settings.rainEffect = !engine.settings.rainEffect; onRefresh();}} /></div>
            <div className="control-setting-row"><label htmlFor="blood-intensity">Kan efektleri</label>
              <select id="blood-intensity" value={engine.settings.bloodIntensity}
                onChange={event => {engine.settings.bloodIntensity = Number(event.target.value); onRefresh();}}>
                <option value="0">Kapalı</option><option value="1">Normal</option><option value="2">Yoğun</option>
              </select></div>
          </div>
        </details>
      </div>

      <div className="control-column">
        <section className="control-card" aria-labelledby="connection-heading">
          <div className="control-card-heading"><h2 id="connection-heading"><Radio size={15} /> Yayın bağlantısı</h2>
            {featureFlags.tiktokEnabled && <span className={`control-status control-status-small ${liveConnected ? 'is-connected' : ''}`}>
              <i />{liveLabel}</span>}
          </div>
          {featureFlags.tiktokEnabled && <>
            <form className="control-form-row" onSubmit={event => {event.preventDefault(); props.onTikTokUsernameChange(usernameDraft);}}>
              <label className="control-field" htmlFor="tiktok-username"><span>TikTok kullanıcı adı</span>
                <input id="tiktok-username" value={usernameDraft} onChange={event => setUsernameDraft(event.target.value)}
                  placeholder="@kullaniciadi" autoComplete="off" spellCheck={false} /></label>
              <button type="submit" className="control-button control-button-primary">Bağlan</button>
            </form>
            <div className="control-audience"><span><strong>{props.viewerCount.toLocaleString('tr-TR')}</strong> izleyici</span>
              <span><strong>{props.likeCount.toLocaleString('tr-TR')}</strong> beğeni</span></div>
            {props.tiktokMessage && <p className={`control-note ${liveConnected ? '' : 'control-warning'}`} role="status">{props.tiktokMessage}</p>}
          </>}
          <div className={`control-obs ${featureFlags.tiktokEnabled ? '' : 'control-obs-first'}`}>
            <div className="control-card-heading"><label htmlFor="obs-url"><Link2 size={13} /> OBS / LIVE Studio</label>
              <span className="control-muted">1080 × 1920</span></div>
            <div className="control-copy-row"><input ref={obsInput} id="obs-url" readOnly value={props.obsUrl}
              onFocus={event => event.currentTarget.select()} aria-label="OBS oyun bağlantısı" />
              <button type="button" className="control-button" onClick={() => {void copyObsUrl();}} aria-label="OBS bağlantısını kopyala">
                {copyStatus === 'copied' ? <Check size={14} /> : <Copy size={14} />}
                {copyStatus === 'copied' ? 'Kopyalandı' : 'Kopyala'}
              </button></div>
            {copyStatus === 'selected' && <p className="control-note" role="status">Bağlantı seçildi. Ctrl+C veya ⌘C ile kopyalayın.</p>}
          </div>
        </section>

        <section className="control-card" aria-labelledby="audio-heading">
          <div className="control-card-heading"><h2 id="audio-heading"><Music2 size={15} /> Ses ve müzik</h2></div>
          <label className="control-field" htmlFor="background-track"><span>Arka plan müziği</span>
            <select id="background-track" value={soundEngine.getBackgroundTrack()} onChange={event => {
              if (soundEngine.setBackgroundTrack(event.target.value)) onRefresh();
            }}>{backgroundTracks.map(track => <option key={track.id} value={track.id}>{track.number}. {track.file}</option>)}</select>
          </label>
          <div className="control-volume"><label htmlFor="sound-volume"><Volume2 size={14} /> Ses seviyesi</label>
            <output htmlFor="sound-volume">{Math.round(engine.settings.soundVolume * 100)}%</output>
            <input id="sound-volume" type="range" min="0" max="1" step="0.05" value={engine.settings.soundVolume}
              onChange={event => {const volume = Number(event.target.value); soundEngine.setVolume(volume);
                engine.settings.soundVolume = volume; onRefresh();}} /></div>
        </section>

        <details className="control-card control-details">
          <summary><span><Link2 size={15} /> Bağlantı kurulumu</span><ChevronDown size={15} /></summary>
          <div className="control-details-body">
            <p className="control-note">OBS veya LIVE Studio'da bağlantıyı kaynak olarak ekleyin. Boyut: 1080 × 1920.</p>
            <form onSubmit={event => {event.preventDefault(); props.onControlKeyChange(controlKeyDraft);}}>
              <label className="control-field" htmlFor="control-key"><span>Kontrol anahtarı</span>
                <input id="control-key" type="password" value={controlKeyDraft} autoComplete="off"
                  onChange={event => setControlKeyDraft(event.target.value)} /></label>
              <button type="submit" className="control-button control-apply">Anahtarı uygula</button>
            </form>
            {props.showPublishedControlLink && <form onSubmit={event => {event.preventDefault(); props.onOpenPublishedControl(publishedSiteDraft);}}>
              <label className="control-field" htmlFor="published-site-url"><span>Vercel yayın adresi</span>
                <input id="published-site-url" type="url" value={publishedSiteDraft} placeholder="https://projeniz.vercel.app"
                  onChange={event => setPublishedSiteDraft(event.target.value)} autoComplete="url" spellCheck={false} /></label>
              {props.publishedSiteError && <p className="control-note control-warning" role="alert">{props.publishedSiteError}</p>}
              <button type="submit" className="control-button control-apply">Vercel kontrolünü aç <ArrowUpRight size={13} /></button>
            </form>}
          </div>
        </details>
        <details className="control-card control-details">
          <summary><span><Zap size={15} /> Sohbet komutları</span><ChevronDown size={15} /></summary>
          <div className="control-details-body"><div className="control-command-grid">
            {['kirbacla', 'gom', 'cehennem', 'deveyebin'].map(command => <code key={command}>{command} nickname</code>)}
          </div><p className="control-note">İsim yazılmazsa mesajı gönderen seçilir. Türkçe karakter şart değil.</p></div>
        </details>
      </div>
    </div>
  </section>;
};
