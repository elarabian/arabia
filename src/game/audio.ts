import { dialogueAssets } from './dialogueAssets';
import whipUrl from '../../sounds/whip.mp3?url';
import backgroundUrl from '../../sounds/background.mp3?url';
import heroUrl from '../../sounds/hero.mp3?url';
import bombUrl from '../../sounds/bomb.mp3?url';
import canlaninUrl from '../../sounds/canlanin.mp3?url';

const BACKGROUND_VOLUME = 0.8;
const WHIP_VOLUME_MULTIPLIER = 2;

function findBassBeats(buffer: AudioBuffer): number[] {
  const samples = buffer.getChannelData(0);
  const stride = Math.max(1, Math.round(buffer.sampleRate / 11025));
  const rate = buffer.sampleRate / stride;
  const windowSize = Math.max(1, Math.round(rate * .02));
  const lowRate = Math.min(1, 2 * Math.PI * 160 / rate);
  const highRate = Math.min(1, 2 * Math.PI * 40 / rate);
  const levels: number[] = [];
  let low = 0, high = 0, energy = 0, count = 0;
  for (let i = 0; i < samples.length; i += stride) {
    low += lowRate * (samples[i] - low);
    high += highRate * (samples[i] - high);
    energy += (low - high) ** 2;
    if (++count === windowSize) {
      levels.push(Math.sqrt(energy / count));
      energy = 0;
      count = 0;
    }
  }
  const beats: number[] = [];
  const history = Math.round(.5 * rate / windowSize);
  const gap = Math.round(.3 * rate / windowSize);
  let sum = 0;
  for (let i = 0; i < levels.length; i++) {
    if (i > 0) sum += levels[i - 1];
    if (i > history) sum -= levels[i - history - 1];
    if (i < 2 || i >= levels.length - 2) continue;
    const baseline = sum / Math.min(i, history);
    if (levels[i] > Math.max(.04, baseline * 1.2)
      && levels[i] >= Math.max(...levels.slice(i - 2, i + 3))
      && (!beats.length || i * windowSize / rate - beats[beats.length - 1] >= .3)) {
      beats.push(i * windowSize / rate);
    }
  }
  return beats;
}

/**
 * Web Audio Engine - Real whip sounds + Gore Sounds
 */

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private backgroundGain: GainNode | null = null;
  private volume: number = 0.8;
  private muted: boolean = false;
  private ambientOsc: OscillatorNode | null = null;
  private whipBuffer: AudioBuffer | null = null;
  private heroBuffer: AudioBuffer | null = null;
  private heroSource: AudioBufferSourceNode | null = null;
  private bombBuffer: AudioBuffer | null = null;
  private bombSource: AudioBufferSourceNode | null = null;
  private noahBuffer: AudioBuffer | null = null;
  private noahSource: AudioBufferSourceNode | null = null;
  private noahToken = 0;
  private noahStartedAt = 0;
  private noahDuration = 39.18365;
  public noahConstructionState: 'idle' | 'loading' | 'playing' | 'ended' = 'idle';
  private whipLoaded: boolean = false;
  private backgroundBuffer: AudioBuffer | null = null;
  private backgroundSource: AudioBufferSourceNode | null = null;
  private backgroundStarted = false;
  private backgroundStartTime = 0;
  private bassBeats: number[] = [];
  private nextBassBeat = 0;
  private bassBeatLoop = 0;
  public bassBeatCount = 0;
  public bassPulse = 0;
  private dialogueBuffers = new Map<string,AudioBuffer>();
  private recordedReaction: AudioBufferSourceNode | null = null;
  private recordedGreeting: AudioBufferSourceNode | null = null;
  private timeline = 0;
  private lastContextTime = 0;
  private resumePending = false;
  private clockIsAdvancing = true;

  // Follow the sample clock when available, but never freeze the dance when
  // Safari/OS interrupts audio or a device stops advancing currentTime.
  public advanceClock(dt: number) {
    const now = this.ctx?.currentTime ?? 0;
    const elapsed = now - this.lastContextTime;
    this.lastContextTime = now;
    this.clockIsAdvancing = elapsed > 0;
    this.timeline += elapsed > 0 && elapsed <= .1 ? elapsed : Math.max(0, Math.min(dt, .05));
    if (this.noahConstructionState === 'playing'
      && this.timeline - this.noahStartedAt >= this.noahDuration + .15) {
      this.noahConstructionState = 'ended';
      try { this.noahSource?.stop(); } catch { /* The source may have ended already. */ }
      this.noahSource = null;
    }
    if (this.pendingWhip && this.attack && this.timeline >= this.attack.start) {
      const pending = this.pendingWhip;
      this.pendingWhip = null;
      if (this.ctx?.state === 'running') this.playWhipSample(pending);
    }
    this.bassPulse = Math.max(0, this.bassPulse - dt / .28);
    if (this.backgroundSource && this.backgroundBuffer && this.ctx && this.ctx.state === 'running' && this.clockIsAdvancing && this.bassBeats.length) {
      const musicTime = this.ctx.currentTime - this.backgroundStartTime;
      // A browser source may sleep for minutes or hours. Jump over complete
      // music loops instead of replaying every missed beat on one frame.
      const currentLoop = Math.floor(musicTime / this.backgroundBuffer.duration);
      if (currentLoop > this.bassBeatLoop + 1) {
        const skippedBeats = this.bassBeats.length - this.nextBassBeat
          + (currentLoop - this.bassBeatLoop - 1) * this.bassBeats.length;
        this.bassBeatCount += skippedBeats;
        this.bassBeatLoop = currentLoop;
        this.nextBassBeat = 0;
        this.bassPulse = 1;
      }
      while (this.bassBeatLoop * this.backgroundBuffer.duration + this.bassBeats[this.nextBassBeat] <= musicTime) {
        this.bassBeatCount++;
        this.bassPulse = 1;
        if (++this.nextBassBeat === this.bassBeats.length) {
          this.nextBassBeat = 0;
          this.bassBeatLoop++;
        }
      }
    }
    if (this.ctx && this.ctx.state !== 'running' && this.ctx.state !== 'closed' && !this.resumePending) {
      this.resumePending = true;
      void this.ctx.resume().catch(() => {}).finally(() => { this.resumePending = false; });
    }
    // A missing onended callback must not silence all subsequent reactions.
    if (this.recordedReaction && this.timeline >= this.nextReactionAt) {
      this.recordedReaction.stop();
      this.recordedReaction = null;
    }
    if (this.reaction && this.timeline >= this.nextReactionAt + 5) {
      window.speechSynthesis?.cancel();
      this.reaction = null;
    }
  }

  private playRecorded(filename: string, greeting = false): boolean {
    const buffer = this.dialogueBuffers.get(filename);
    if (!buffer || !this.ctx || this.ctx.state !== 'running' || !this.clockIsAdvancing || !this.sfxGain || this.muted) return false;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.sfxGain);
    if (greeting) { this.recordedGreeting = source; this.isSpeaking = true; }
    else { this.recordedReaction = source; this.nextReactionAt = this.audioTime+Math.max(3,buffer.duration+.15); }
    source.onended = () => {
      if (greeting && this.recordedGreeting === source) { this.recordedGreeting = null; this.isSpeaking = false; }
      if (!greeting && this.recordedReaction === source) this.recordedReaction = null;
    };
    source.start();
    return true;
  }

  public isSpeaking = false;
  private greeting: SpeechSynthesisUtterance | null = null;

  public sayGreeting() {
    this.stopGreeting();
    if (this.playRecorded('habibi_come_to_dubai.mp3', true)) return;
    if (this.muted || !('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance('Habibi, come to Dubai!');
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(v => /^en/i.test(v.lang) && /Daniel|Eddy|David|George|Alex/i.test(v.name))
      ?? voices.find(v => /^en/i.test(v.lang));
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? 'en-US';
    utterance.rate = .9;
    utterance.pitch = 1;
    utterance.volume = this.volume;
    this.greeting = utterance;
    utterance.onstart = () => { if (this.greeting === utterance) this.isSpeaking = true; };
    const finish = () => {
      if (this.greeting === utterance) { this.isSpeaking = false; this.greeting = null; }
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
  }

  private stopGreeting() {
    this.recordedGreeting?.stop();
    this.recordedGreeting = null;
    if (this.greeting && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    this.greeting = null;
    this.isSpeaking = false;
  }

  private reaction: SpeechSynthesisUtterance | null = null;
  private heroUtterance: SpeechSynthesisUtterance | null = null;
  private nextTauntAt = 0;
  private nextPrayerAt = 0;
  private previousTaunt = -1;
  public sayWhipTaunt(): string | null {
    if (this.audioTime < this.nextTauntAt) return null;
    const lines = [
      'Like gönderin bre kafirler!', 'Seni Kafir Tovbe Et.',
      'Ekrana tıkla yoksa kırbacı yersin!', 'Dans edin ki hediye göndersinler!',
      'Haydi, daha iyi kıvır!', 'Saçının teli gözüktü!',
      'Kafir istemiyoruz.', 'Kafirlerrrrrrrr.', 'Sizi gidi Kafirlerrrrr.',
      'Petrol Kuyularimi Kuruttunuz', 'Hurma Bahcelerimi Yagmaladiniz',
      'Develerimi Kestiniz',
    ];
    let index = Math.floor(Math.random() * lines.length);
    if (index === this.previousTaunt) index = (index + 1) % lines.length;
    this.previousTaunt = index;
    this.nextTauntAt = this.audioTime + 7 + Math.random() * 4;
    this.speakHero(lines[index]);
    return lines[index];
  }

  public sayPrayer(): string | null {
    if (this.audioTime < this.nextPrayerAt) return null;
    const line = 'Tövbe estağfurullah, tövbe estağfurullah.';
    this.nextPrayerAt = this.audioTime + 7;
    this.speakHero(line);
    return line;
  }

  private speakHero(line: string) {
    if (this.muted || typeof window === 'undefined' || !('speechSynthesis' in window)
      || this.reaction || this.recordedReaction || this.heroUtterance) return;
    const utterance = new SpeechSynthesisUtterance(line);
    const voices = window.speechSynthesis.getVoices().filter(voice => /^tr/i.test(voice.lang));
    utterance.voice = voices.find(voice => !/Yelda|Emel|Seda|Female/i.test(voice.name)) ?? voices[0] ?? null;
    utterance.lang = utterance.voice?.lang ?? 'tr-TR';
    utterance.rate = .94;
    utterance.pitch = .82;
    utterance.volume = this.volume;
    this.heroUtterance = utterance;
    const finish = () => { if (this.heroUtterance === utterance) this.heroUtterance = null; };
    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
  }
  private reactionIndex = 0;
  private nextReactionAt = 0;

  public sayZombieReaction(): string | null {
    if (this.audioTime < this.nextReactionAt || this.reaction || this.recordedReaction || this.heroUtterance) return null;
    // Distinct comic deliveries; readable captions stay separate from spoken elongations.
    const lines = [
      { file: 'ahhh_yandim_habibi.mp3', text: 'Ahhh, yandım habibi!', spoken: 'Ahhh! Yandım, habibiii!', rate: .98, pitch: 1.45 },
      { file: 'habibi_yavas.mp3', text: 'Habibi, yavaş!', spoken: 'Habibiii... yavaş!', rate: .88, pitch: 1.3 },
      { file: 'habibi_come_to_dubai.mp3', text: 'Habibi, come to Dubaiii!', spoken: 'Habibi! Come to Dubaiii!', rate: 1.08, pitch: 1.5 },
      { file: 'habibi_sukran.mp3', text: 'Habibi, şükran!', spoken: 'Habibi... şükran!', rate: .95, pitch: 1.4 },
      { file: 'yarabbi_sukran.mp3', text: 'Ya Rabbi, şükran!', spoken: 'Ya Rabbi, şükran!', rate: .92, pitch: 1.35 },
      { file: 'oh_sukur_allah.mp3', text: 'Oh, şükür Allah!', spoken: 'Oh... şükür Allah!', rate: .9, pitch: 1.3 },
      { file: 'elhamdulillah.mp3', text: 'Elhamdülillah!', spoken: 'Elhamdülillah!', rate: .94, pitch: 1.4 },
    ];
    lines.push({file:'ahhh_elhamdulillah.mp3',text:'Ahhh… elhamdülillah!',spoken:'Ahhh… elhamdülillah!',rate:.9,pitch:1.4});
    lines.push({file:'ahhh_uhhh.mp3',text:'Ahhh… uhhh… ahhh!',spoken:'Ahhh… uhhh… ahhh!',rate:.9,pitch:1.4});
    const delivery = lines[this.reactionIndex++ % lines.length];
    const { text } = delivery;
    this.nextReactionAt = this.audioTime + 3;
    if (this.muted) return text;
    this.stopGreeting();
    if (this.playRecorded(delivery.file)) return text;
    if (!('speechSynthesis' in window)) return text;
    const utterance = new SpeechSynthesisUtterance(delivery.spoken);
    const language = text.includes('come to') ? 'en' : 'tr';
    const voices = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith(language));
    const femaleVoice = /Yelda|Emel|Seda|Samantha|Victoria|Karen|Moira|Tessa|Zira|Aria|Jenny|Serena|Susan|Female/i;
    const voice = voices.find(v => femaleVoice.test(v.name)) ?? voices[0];
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? (language === 'tr' ? 'tr-TR' : 'en-US');
    utterance.rate = delivery.rate;
    utterance.pitch = delivery.pitch;
    utterance.volume = this.volume;
    this.reaction = utterance;
    const finish = () => { if (this.reaction === utterance) this.reaction = null; };
    utterance.onend = finish; utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
    return text;
  }

  private stopReaction() {
    this.recordedReaction?.stop();
    this.recordedReaction = null;
    if (this.reaction && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    this.reaction = null;
    this.nextReactionAt = 0;
  }

  private loading: Promise<void> | null = null;
  private nextTake = 0;
  private source: AudioBufferSourceNode | null = null;
  private pendingWhip: { offset: number; duration: number; speed: number; intensity: number } | null = null;
  public attack: { start: number; peak: number; duration: number; cycleEnd: number; prepStart?: number } | null = null;

  // Three original takes in the recording. No resampling, pitch shift or filtering.
  private readonly takes = [
    { offset: 0.64, peak: 0.24, duration: 0.88 },
    { offset: 2.40, peak: 0.24, duration: 0.88 },
    { offset: 4.28, peak: 0.24, duration: 0.88 },
  ];

  public async prepare() {
    this.initContext();
    if (!this.loading) {
      this.loading = fetch(whipUrl).then(async response => {
        if (!response.ok) throw new Error('whip.mp3 yüklenemedi');
        this.whipBuffer = await this.ctx!.decodeAudioData(await response.arrayBuffer());
        this.whipLoaded = true;
        await Promise.all([
          fetch(heroUrl).then(async response => {
            if (!response.ok) throw new Error('hero.mp3 yüklenemedi');
            this.heroBuffer = await this.ctx!.decodeAudioData(await response.arrayBuffer());
          }),
          fetch(bombUrl).then(async response => {
            if (!response.ok) throw new Error('bomb.mp3 yüklenemedi');
            this.bombBuffer = await this.ctx!.decodeAudioData(await response.arrayBuffer());
          }).catch(error => console.warn('Bomba sesi yüklenemedi:', error)),
          fetch(canlaninUrl).then(async response => {
            if (!response.ok) throw new Error('canlanin.mp3 yüklenemedi');
            this.noahBuffer = await this.ctx!.decodeAudioData(await response.arrayBuffer());
          }).catch(error => console.warn('Gemi inşaatı sesi yüklenemedi:', error)),
          fetch(backgroundUrl).then(async response => {
            if (!response.ok) throw new Error('background.mp3 yüklenemedi');
            this.backgroundBuffer = await this.ctx!.decodeAudioData(await response.arrayBuffer());
            this.bassBeats = findBassBeats(this.backgroundBuffer);
            this.startBackgroundSource();
          }).catch(error => console.warn('Arka plan müziği yüklenemedi:', error)),
          ...Object.entries(dialogueAssets).filter(([path]) => !['whip.mp3','background.mp3','hero.mp3','canlanin.mp3','dialogue-preview.mp3','voice-comparison.mp3','ahhh-preview.mp3'].includes(path.split('/').pop()!)).map(async ([path,url]) => {
          try {
            const response = await fetch(url);
            if (!response.ok) return;
            const buffer = await this.ctx!.decodeAudioData(await response.arrayBuffer());
            this.dialogueBuffers.set(path.split('/').pop()!,buffer);
          } catch (error) { console.warn('Replik dosyası yüklenemedi:', path, error); }
          }),
        ]);
      }).catch(error => { this.loading = null; throw error; });
    }
    await this.loading;
  }

  public get audioTime() { return this.timeline; }

  public startNoahConstruction() {
    this.stopNoahConstruction();
    const token = this.noahToken;
    this.noahConstructionState = 'loading';
    const start = () => {
      if (token !== this.noahToken) return;
      this.noahDuration = this.noahBuffer?.duration ?? 39.18365;
      this.noahStartedAt = this.audioTime;
      if (this.ctx && this.noahBuffer && this.sfxGain) {
        try {
          const source = this.ctx.createBufferSource();
          source.buffer = this.noahBuffer;
          source.connect(this.sfxGain);
          source.onended = () => {
            source.disconnect();
            if (this.noahSource === source && token === this.noahToken) {
              this.noahSource = null;
              this.noahConstructionState = 'ended';
            }
          };
          source.start();
          this.noahSource = source;
          this.noahConstructionState = 'playing';
          return;
        } catch (error) { console.warn('Gemi inşaatı sesi başlatılamadı:', error); }
      }
      // Keep the scene playable if browser audio is unavailable.
      this.noahConstructionState = 'playing';
    };
    if (this.noahBuffer || typeof window === 'undefined'
      || !(window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)) {
      start();
    } else {
      void this.prepare().then(start).catch(start);
    }
  }

  public stopNoahConstruction() {
    this.noahToken++;
    this.noahConstructionState = 'idle';
    try { this.noahSource?.stop(); } catch { /* The source may have ended already. */ }
    this.noahSource = null;
  }

  public getNoahConstructionProgress() {
    if (this.noahConstructionState === 'ended') return 1;
    if (this.noahConstructionState === 'loading' || this.noahConstructionState === 'idle') return 0;
    return Math.max(0, Math.min(1, (this.audioTime - this.noahStartedAt) / this.noahDuration));
  }

  private startBackgroundSource() {
    if (!this.backgroundStarted || this.backgroundSource || !this.backgroundBuffer || !this.backgroundGain || !this.ctx) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.backgroundBuffer;
    source.loop = true;
    source.connect(this.backgroundGain);
    this.backgroundStartTime = this.ctx.currentTime;
    this.nextBassBeat = 0;
    this.bassBeatLoop = 0;
    this.backgroundSource = source;
    source.onended = () => {
      source.disconnect();
      if (this.backgroundSource === source) {
        this.backgroundSource = null;
        this.startBackgroundSource();
      }
    };
    source.start();
  }

  public startBackground() {
    this.initContext();
    this.backgroundStarted = true;
    this.startBackgroundSource();
  }

  public stopBackground() {
    this.backgroundStarted = false;
    this.backgroundSource?.stop();
    this.backgroundSource = null;
    this.bassPulse = 0;
  }

  public setPaused(paused: boolean) {
    this.lastContextTime = this.ctx?.currentTime ?? 0;
    if ('speechSynthesis' in window) {
      if (paused) window.speechSynthesis.pause();
      else window.speechSynthesis.resume();
    }
    if (!this.ctx) return;
    void (paused ? this.ctx.suspend() : this.ctx.resume()).catch(console.error);
  }

  public stopWhip() {
    this.stopGreeting();
    this.stopReaction();
    this.source?.stop();
    this.source = null;
    this.pendingWhip = null;
    this.heroSource?.stop();
    this.heroSource = null;
    this.bombSource?.stop();
    this.bombSource = null;
    this.attack = null;
  }

  public playBombPlacement() {
    if (!this.ctx || !this.bombBuffer || !this.sfxGain || this.muted) return false;
    try {
      this.bombSource?.stop();
      const source = this.ctx.createBufferSource();
      source.buffer = this.bombBuffer;
      source.playbackRate.value = 1.44; // Align the recording's blast with the three-second fuse.
      const bombGain = this.ctx.createGain();
      bombGain.gain.value = 2;
      source.connect(bombGain);
      bombGain.connect(this.sfxGain);
      this.bombSource = source;
      source.onended = () => {
        source.disconnect();
        bombGain.disconnect();
        if (this.bombSource === source) this.bombSource = null;
      };
      source.start();
      return true;
    } catch (error) {
      this.bombSource = null;
      console.warn('Bomba kaydı çalınamadı:', error);
      return false;
    }
  }

  private playHeroRaise(): boolean {
    if (!this.ctx || !this.heroBuffer || !this.sfxGain || this.muted) return false;
    try {
      this.heroSource?.stop();
      this.heroSource = null;
      const source = this.ctx.createBufferSource();
      source.buffer = this.heroBuffer;
      source.connect(this.sfxGain);
      this.heroSource = source;
      source.onended = () => {
        source.disconnect();
        if (this.heroSource === source) this.heroSource = null;
      };
      source.start();
      return true;
    } catch (error) {
      this.heroSource = null;
      console.warn('Kahraman sesi çalınamadı:', error);
      return false;
    }
  }

  public playHeroCelebration() {
    return this.playHeroRaise();
  }

  public getHeroSoundDuration() {
    return this.heroBuffer?.duration ?? 13;
  }

  private initContext() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioContextClass();
      this.masterGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.backgroundGain = this.ctx.createGain();

      this.masterGain.gain.value = this.muted ? 0 : this.volume;
      this.sfxGain.gain.value = 1.0;
      this.backgroundGain.gain.value = this.muted ? 0 : BACKGROUND_VOLUME;

      this.sfxGain.connect(this.masterGain);
      this.backgroundGain.connect(this.ctx.destination);
      this.masterGain.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(console.error);
    }
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.greeting) this.greeting.volume = this.volume;
    if (this.reaction) this.reaction.volume = this.volume;
    if (this.masterGain && !this.muted) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx?.currentTime || 0);
    }
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
    if (this.backgroundGain) this.backgroundGain.gain.setValueAtTime(muted ? 0 : BACKGROUND_VOLUME, this.ctx?.currentTime || 0);
    if (muted) { this.stopGreeting(); this.stopReaction(); }
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(muted ? 0 : this.volume, this.ctx?.currentTime || 0);
    }
  }

  public isMuted() {
    return this.muted;
  }

  public getVolume() {
    return this.volume;
  }

  public getWhipSoundDuration(): number {
    // Return whip sound duration in seconds, or default if not loaded
    return this.whipBuffer ? this.whipBuffer.duration : 0.15;
  }

  public isWhipSoundLoaded(): boolean {
    return this.whipLoaded;
  }

  public playWhipCrack(intensity: number = 1, whipType: string = 'leather', waitForHero = false, rapid = false, rapidSpeed = 1): boolean {
    if (this.attack && this.audioTime < this.attack.cycleEnd) return false;
    const take = this.takes[this.nextTake++ % this.takes.length];
    const speed = rapid ? Math.max(.1, Math.min(2, rapidSpeed)) : 1;
    const duration = rapid ? .36 / speed : take.duration;
    const peak = take.peak / speed;
    const canPlay = this.ctx && this.whipBuffer && this.sfxGain && !this.muted;
    if (canPlay) this.stopGreeting();
    const heroDuration = waitForHero ? this.heroBuffer?.duration ?? 0 : 0;
    const introDuration = heroDuration;
    if (heroDuration > 0 && canPlay) this.playHeroRaise();
    this.attack = { start: this.audioTime + introDuration, peak, duration,
      cycleEnd: this.audioTime + Math.max(heroDuration, introDuration + duration),
      ...(heroDuration > 0 ? { prepStart: this.audioTime } : {}) };
    // Start the recording when the visible strike begins. A long pre-scheduled
    // source could play later after the animation or scene has already changed.
    const sample = { offset: take.offset, duration: rapid ? .36 : take.duration,
      speed, intensity };
    this.pendingWhip = canPlay && introDuration > 0 ? sample : null;
    if (canPlay && introDuration === 0 && this.ctx?.state === 'running') this.playWhipSample(sample);
    return true;
  }

  private playWhipSample(take: { offset: number; duration: number; speed: number; intensity: number }) {
    if (!this.ctx || !this.whipBuffer || !this.sfxGain || this.muted) return;
    try {
    const source = this.ctx.createBufferSource();
    source.buffer = this.whipBuffer;
    source.playbackRate.value = take.speed;
    source.detune.value = 0;
    const strikeGain = this.ctx.createGain();
    strikeGain.gain.value = WHIP_VOLUME_MULTIPLIER * Math.min(1,.55+Math.max(.6,take.intensity)*.28);
    source.connect(strikeGain);
    strikeGain.connect(this.sfxGain);
    source.start(this.ctx.currentTime, take.offset, take.duration);
    this.source = source;
    source.onended = () => {
      source.disconnect(); strikeGain.disconnect();
      if (this.source === source) this.source = null;
    };
    } catch (error) { console.warn('Kırbaç sesi çalınamadı; animasyon devam ediyor.', error); }
  }

  public playBurialWhip() {
    this.playWhipSample({ offset: this.takes[0].offset, duration: this.takes[0].duration,
      speed: 1, intensity: 1 });
  }

  public playShovelDig() {
    if (!this.ctx || this.ctx.state !== 'running' || !this.sfxGain || this.muted) return;
    const duration = .18;
    const buffer = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * duration), this.ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / samples.length);
    const source = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    source.buffer = buffer;
    filter.type = 'lowpass'; filter.frequency.value = 650;
    gain.gain.setValueAtTime(.32, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, this.ctx.currentTime + duration);
    source.connect(filter); filter.connect(gain); gain.connect(this.sfxGain);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    source.start();
  }

  /**
   * Visceral Meaty Flesh Impact & Slash
   */
  public playFleshImpact(isCritical: boolean = false) {
    this.initContext();
    if (!this.ctx || !this.sfxGain || this.muted) return;

    try {
      const now = this.ctx.currentTime;
      const bufferSize = this.ctx.sampleRate * 0.15;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1);
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(isCritical ? 1400 : 800, now);
      filter.frequency.exponentialRampToValueAtTime(200, now + 0.12);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(isCritical ? 0.8 : 0.45, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);
      noise.start(now);
      noise.stop(now + 0.15);

      if (isCritical) {
        this.playBoneSnap();
      }
    } catch {
      // Ignored
    }
  }

  /**
   * Bone Snapping / Cracking sound
   */
  public playBoneSnap() {
    this.initContext();
    if (!this.ctx || !this.sfxGain || this.muted) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.04);

      gain.gain.setValueAtTime(0.6, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.06);
    } catch {
      // Ignored
    }
  }

  /**
   * Zombie Groan / Shambling rasp
   */
  public playZombieGroan(pitchShift: number = 1.0) {
    this.initContext();
    if (!this.ctx || !this.sfxGain || this.muted) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = 'sawtooth';
      const baseFreq = 85 * pitchShift;
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.linearRampToValueAtTime(baseFreq * 0.8, now + 0.4);
      osc.frequency.linearRampToValueAtTime(baseFreq * 0.65, now + 0.7);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(450, now);
      filter.Q.setValueAtTime(2.5, now);

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.18, now + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.75);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(now);
      osc.stop(now + 0.75);
    } catch {
      // Ignored
    }
  }

  /**
   * Zombie Death Shriek
   */
  public playZombieDeath() {
    this.initContext();
    if (!this.ctx || !this.sfxGain || this.muted) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.4);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.45);
    } catch {
      // Ignored
    }
  }

  /**
   * Distant Thunder Rumbling
   */
  public playThunder() {
    this.initContext();
    if (!this.ctx || !this.sfxGain || this.muted) return;

    try {
      const now = this.ctx.currentTime;
      const bufferSize = this.ctx.sampleRate * 1.5;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        // Brown noise filter for deep thunder
        data[i] = (lastOut + (0.02 * white)) / 1.02;
        lastOut = data[i];
        data[i] *= 3.5;
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(180, now);
      filter.frequency.linearRampToValueAtTime(90, now + 1.2);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);

      noise.start(now);
      noise.stop(now + 1.5);
    } catch {
      // Ignored
    }
  }

  /**
   * Metallic Chain Rattle
   */
  public playChainRattle() {
    if (!this.ctx || !this.sfxGain || this.muted) return;
    try {
      const now = this.ctx.currentTime;
      [1800, 2400, 3100].forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.02);
        gain.gain.setValueAtTime(0.2, now + idx * 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1 + idx * 0.02);
        osc.connect(gain);
        gain.connect(this.sfxGain!);
        osc.start(now + idx * 0.02);
        osc.stop(now + 0.12 + idx * 0.02);
      });
    } catch {
      // Ignored
    }
  }

  /**
   * Electric Arc discharge
   */
  public playElectricDischarge() {
    if (!this.ctx || !this.sfxGain || this.muted) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(80, now);
      osc.frequency.setValueAtTime(800, now + 0.02);
      osc.frequency.setValueAtTime(200, now + 0.06);

      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.15);
    } catch {
      // Ignored
    }
  }

  /**
   * Fire Whoosh & Ignition
   */
  public playFireExplosion() {
    if (!this.ctx || !this.sfxGain || this.muted) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(350, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.2);

      gain.gain.setValueAtTime(0.45, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.25);
    } catch {
      // Ignored
    }
  }

  public playBombExplosion() {
    if (this.bombSource) return; // The recorded explosion is already reaching its blast.
    this.initContext();
    if (!this.ctx || !this.sfxGain || this.muted) return;
    try {
      const now = this.ctx.currentTime;
      const duration = 1.1;
      const noiseBuffer = this.ctx.createBuffer(1, Math.round(this.ctx.sampleRate * duration), this.ctx.sampleRate);
      const samples = noiseBuffer.getChannelData(0);
      let lowNoise = 0;
      for (let i = 0; i < samples.length; i++) {
        lowNoise = (lowNoise + (Math.random() * 2 - 1) * .16) / 1.08;
        samples[i] = lowNoise;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1700, now);
      filter.frequency.exponentialRampToValueAtTime(180, now + duration);
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(.95, now);
      noiseGain.gain.exponentialRampToValueAtTime(.001, now + duration);
      noise.connect(filter); filter.connect(noiseGain); noiseGain.connect(this.sfxGain);
      noise.start(now); noise.stop(now + duration);

      const boom = this.ctx.createOscillator();
      boom.type = 'sine';
      boom.frequency.setValueAtTime(110, now);
      boom.frequency.exponentialRampToValueAtTime(38, now + .75);
      const boomGain = this.ctx.createGain();
      boomGain.gain.setValueAtTime(.7, now);
      boomGain.gain.exponentialRampToValueAtTime(.001, now + .85);
      boom.connect(boomGain); boomGain.connect(this.sfxGain);
      boom.start(now); boom.stop(now + .85);
    } catch (error) {
      console.warn('Bomba sesi çalınamadı:', error);
    }
  }

  /**
   * Player Whirlwind Special Skill sound
   */
  public playWhirlwindSound() {
    if (!this.ctx || !this.sfxGain || this.muted) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.linearRampToValueAtTime(500, now + 0.2);
      osc.frequency.linearRampToValueAtTime(120, now + 0.45);

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.4, now + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.5);
    } catch {
      // Ignored
    }
  }
}

export const soundEngine = new SoundEngine();
