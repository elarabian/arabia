import { strikeMotion } from './strikeMotion';
import { drawHero3D, heroShoulder, HERO_SCALE } from './hero3d';
import { solveArm } from './arm';
import { TurningMotion } from './turning';
import { BROADCAST } from './broadcast';
import { WhipPhysics } from './whip';
import { ZombieManager } from './zombies';
import { AtmosphereSystem, backgroundImageRect } from './atmosphere';
import { soundEngine } from './audio';
import { BurialScene } from './burialScene';
import { WhipType, Zombie, PlayerStats, GameSettings } from './types';
import { featureFlags } from '../featureFlags';
import { parseLiveAction, type LiveAction } from '../live/commands';

const DANCER_COUNT = 20;

export class GameEngine {
  public whip: WhipPhysics;
  public zombies: ZombieManager;
  public atmosphere: AtmosphereSystem;

  // Player position & state
  public playerX: number = 270;
  public danceCount = 0;
  public rapidWhip = false;
  public rapidWhipSpeed = 1;
  public liveLikes = 0;
  private liveWhipBoostTime = 0;
  private liveWhipSpeed = 1;
  private liveTaskQueue: LiveAction[] = [];
  private activeLiveTask: (LiveAction & { startedAt: number }) | null = null;
  private chatQueue: { name: string; text: string }[] = [];
  private currentChat: { name: string; text: string; until: number } | null = null;
  public get isRapidWhipActive() { return this.rapidWhip || this.liveWhipBoostTime > 0; }
  public get effectiveRapidWhipSpeed() {
    return Math.max(.1, Math.min(2, this.rapidWhipSpeed
      * (this.liveWhipBoostTime > 0 ? this.liveWhipSpeed : 1)));
  }
  public bombSceneEnabled = false;
  public burialSceneEnabled = false;
  public hellSceneEnabled = false;
  public get captureSceneEnabled() { return this.burialSceneEnabled || this.hellSceneEnabled; }
  public burialScene = new BurialScene();
  public bombSceneTime = 0;
  public bombExploded = false;
  public bombDanceStarted = false;
  private bombHeroX = 270;
  private bombHeroY = 550;
  private bombHeroScale = HERO_SCALE;
  private bombRunDustClock = 0;
  private turning = new TurningMotion();
  private aimAngle = Math.PI / 2;
  private heroVisualAngle = Math.PI / 2;
  private heroJump = 0;
  private rapidDanceStep = 0;
  private bodyLean = 0;
  private handsRaised = 0;
  private arm = solveArm({x:270,y:480},{x:298,y:495},{x:280,y:500});
  private queuedStrike: { x: number; y: number; power: number; automatic: boolean } | null = null;
  private autoIndex = 0;
  private activeTarget: Zombie | null = null;
  private liveViewers = new Map<string, string>();
  private liveHandles = new Map<string, string>();
  private queuedTarget: Zombie | null = null;
  private activeStrikeAutomatic = false;
  public groundY: number = 550;
  public stats: PlayerStats = {
    hp: 100,
    maxHp: 100,
    bloodEssence: 0,
    totalKills: 0,
    totalCracks: 0,
    totalDismembers: 0,
    whipReachLevel: 1,
    whipPowerLevel: 1,
    crackChanceLevel: 1,
  };

  // Skill cooldowns
  public whirlwindCooldown: number = 0;
  public shockwaveCooldown: number = 0;
  private pendingSkill: 'whirlwind' | 'shockwave' | null = null;

  // Wave system
  public wave: number = 1;
  public waveZombiesToSpawn: number = DANCER_COUNT;
  public waveZombiesSpawned: number = 0;
  public waveSpawnTimer: number = 1.0;
  public waveIntermission: boolean = false;
  public intermissionTimer: number = 0;
  public isGameOver: boolean = false;
  public isVictory: boolean = false;

  // Combo system
  public comboCount: number = 0;
  public comboTimer: number = 0;
  public comboMultiplier: number = 1.0;

  // Settings
  public settings: GameSettings = {
    soundVolume: 0.8,
    screenShake: true,
    screenShakeStrength: .2,
    bloodIntensity: 2,
    ambientLighting: true,
    rainEffect: false,
    assistSnapMode: false,
  };

  // Canvas bounds
  public width: number = BROADCAST.width;
  public height: number = BROADCAST.height;

  // TikTok Live / Mobile Safe Area settings
  public isTikTokMode: boolean = true;
  public bottomSafeMargin: number = 290;

  // Background image
  public bgImage: HTMLImageElement | null = null;

  constructor(bgUrl?: string) {
    this.whip = new WhipPhysics('LEATHER', this.playerX + 25, this.groundY - 55);
    this.zombies = new ZombieManager();
    this.atmosphere = new AtmosphereSystem();

    if (bgUrl) {
      this.bgImage = new Image();
      this.bgImage.src = bgUrl;
    }
  }

  public setBackgroundImage(url: string) {
    this.bgImage = new Image();
    this.bgImage.src = url;
  }

  public setTikTokMode(active: boolean) {
    this.isTikTokMode = active;
    this.resize(this.width, this.height, active);
  }

  public setWhipType(type: WhipType) {
    this.whip.setType(type, this.stats.whipReachLevel - 1);
  }

  public setRapidWhip(enabled: boolean) {
    if (this.rapidWhip === enabled) return;
    this.rapidWhip = enabled;
    soundEngine.stopWhip();
    this.queuedStrike = null;
    this.activeTarget = null;
    this.queuedTarget = null;
  }

  public setRapidWhipSpeed(speed: number) {
    this.rapidWhipSpeed = Math.max(.1, Math.min(2, speed));
  }

  public addLiveLikes(count: number) {
    if (!featureFlags.tiktokEnabled || !Number.isFinite(count) || count <= 0) return;
    const likes = Math.min(1000, Math.floor(count));
    this.liveLikes += likes;
    if (this.liveWhipBoostTime <= 0 && this.activeStrikeAutomatic) {
      soundEngine.stopWhip();
      this.queuedStrike = null;
      this.activeTarget = null;
    }
    this.liveWhipBoostTime = Math.min(45, this.liveWhipBoostTime + 10 + likes * .12);
    this.liveWhipSpeed = Math.min(2, this.liveWhipSpeed + .08 + likes / 90);
  }

  public setBombScene(enabled: boolean) {
    if (this.bombSceneEnabled === enabled && !this.captureSceneEnabled) return;
    this.bombSceneEnabled = enabled;
    this.burialSceneEnabled = false;
    this.hellSceneEnabled = false;
    soundEngine.stopWhip();
    this.queuedStrike = null;
    this.activeTarget = null;
    this.queuedTarget = null;
    this.burialScene.reset(this.zombies.zombies);
    this.resetBombScene();
  }

  public setBurialScene(enabled: boolean) {
    if (this.burialSceneEnabled === enabled && !this.bombSceneEnabled && !this.hellSceneEnabled) return;
    this.burialSceneEnabled = enabled;
    this.hellSceneEnabled = false;
    this.bombSceneEnabled = false;
    this.burialScene.mode = 'burial';
    soundEngine.stopWhip();
    this.queuedStrike = null;
    this.activeTarget = null;
    this.queuedTarget = null;
    this.resetBombScene();
    this.burialScene.reset(this.zombies.zombies);
  }

  public setHellScene(enabled: boolean) {
    if (this.hellSceneEnabled === enabled && !this.bombSceneEnabled && !this.burialSceneEnabled) return;
    this.hellSceneEnabled = enabled;
    this.burialSceneEnabled = false;
    this.bombSceneEnabled = false;
    this.burialScene.mode = 'hell';
    soundEngine.stopWhip();
    this.queuedStrike = null;
    this.activeTarget = null;
    this.queuedTarget = null;
    this.resetBombScene();
    this.burialScene.reset(this.zombies.zombies);
  }

  private resetBombScene() {
    this.bombSceneTime = 0;
    this.bombExploded = false;
    this.bombDanceStarted = false;
    this.bombHeroX = this.playerX;
    this.bombHeroY = this.groundY;
    this.bombHeroScale = HERO_SCALE;
    this.bombRunDustClock = 0;
    this.atmosphere.bloodDecals = [];
    this.atmosphere.severedLimbs = [];
    this.atmosphere.particles = [];
    this.atmosphere.shockwaves = [];
    this.zombies.zombies.forEach((z, index) => {
      z.vx = 0;
      z.vy = 0;
      z.bowTimer = 0;
      z.bowDelays = [];
      z.blastAngle = undefined;
      z.blastSpin = undefined;
      z.blastGroundY = undefined;
      z.blastDelay = undefined;
      z.blastImpact = undefined;
      z.blastFlail = undefined;
      z.blastSleep = false;
      z.blastFlight = undefined;
      this.placeDancer(z, index);
    });
    if (this.bombSceneEnabled) soundEngine.playBombPlacement();
  }

  public resize(width: number, height: number, tikTokMode?: boolean) {
    if (tikTokMode !== undefined) this.isTikTokMode = tikTokMode;
    this.width = width;
    this.height = height;

    // Keep the lower third free for the real live chat and gift overlays.
    this.bottomSafeMargin = this.isTikTokMode ? Math.round(height * BROADCAST.bottom) : 55;
    this.groundY = this.isTikTokMode ? height * .55 : height * .6;
    this.playerX = width / 2;
    this.whip.handleX = this.playerX + 25;
    this.whip.handleY = this.groundY - 55;
    this.zombies.zombies.forEach((z, index) => {
      if (z.formation) this.placeDancer(z, index);
    });
  }

  public restartGame() {
    soundEngine.stopWhip();
    this.pendingSkill = null;
    this.danceCount = 0;
    this.autoIndex = 0;
    this.activeTarget = null;
    this.queuedStrike = null;
    this.turning = new TurningMotion();
    this.turning.angle = -Math.PI/2;
    this.aimAngle = this.turning.angle;
    this.heroVisualAngle = this.aimAngle;
    this.heroJump = 0;
    this.rapidDanceStep = 0;
    this.handsRaised = 0;
    this.stats.hp = this.stats.maxHp;
    this.wave = 1;
    this.waveZombiesToSpawn = DANCER_COUNT;
    this.waveZombiesSpawned = 0;
    this.waveSpawnTimer = 1.0;
    this.waveIntermission = false;
    this.isGameOver = false;
    this.isVictory = false;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.liveWhipBoostTime = 0;
    this.liveWhipSpeed = 1;
    this.zombies.zombies = [];
    this.zombies.spitProjectiles = [];
    this.zombies.resetRhythm();
    this.atmosphere.particles = [];
    this.atmosphere.severedLimbs = [];
    if (featureFlags.tiktokEnabled) {
      for (const [id, name] of this.liveViewers) this.spawnLiveViewer(id, name, this.liveHandles.get(id));
    } else {
      for (let i = 0; i < DANCER_COUNT; i++) {
        this.spawnWaveZombie();
        this.waveZombiesSpawned++;
      }
    }
    this.resetBombScene();
    this.burialScene.reset(this.zombies.zombies);
  }

  public update(dt: number) {
    if (this.isGameOver) return;
    soundEngine.advanceClock(dt);
    if (this.currentChat && soundEngine.audioTime >= this.currentChat.until) this.currentChat = null;
    if (!this.currentChat && this.chatQueue.length) {
      this.currentChat = { ...this.chatQueue.shift()!, until: soundEngine.audioTime + 3.4 };
    }
    this.processLiveTasks();
    if (this.liveWhipBoostTime > 0) {
      this.liveWhipBoostTime = Math.max(0, this.liveWhipBoostTime - dt);
      if (this.liveWhipBoostTime === 0) this.liveWhipSpeed = 1;
    }

    // Advance the visible dance pose before aiming so collision and rendering agree.
    this.zombies.update(dt, this.playerX, this.groundY, this.atmosphere, () => {});
    if (this.bombSceneEnabled) {
      this.updateBombScene(dt);
      this.atmosphere.update(dt, this.width, this.height, this.settings.rainEffect, this.groundY);
      return;
    }
    if (this.captureSceneEnabled) {
      this.updateBurialScene(dt);
      this.atmosphere.update(dt, this.width, this.height, this.settings.rainEffect, this.groundY);
      return;
    }
    const previousAttack = soundEngine.attack;
    const previousAge = previousAttack ? soundEngine.audioTime-previousAttack.start : Infinity;
    const playing = previousAttack !== null && soundEngine.audioTime < previousAttack.cycleEnd;
    if (!playing && !this.queuedStrike && this.zombies.zombies.length > 0) {
      this.queuedTarget = this.zombies.zombies[this.autoIndex % this.zombies.zombies.length];
      const torso = this.zombies.getHitTargets(this.queuedTarget)[1];
      this.queuedStrike = { x: torso.x, y: torso.y, power: .95+((this.autoIndex*7)%11)*.065, automatic: true };
    }
    const target = this.queuedStrike
      ? this.queuedTarget ? this.zombies.getHitTargets(this.queuedTarget)[1] : this.queuedStrike
      : this.activeTarget ? this.zombies.getHitTargets(this.activeTarget)[1] : null;
    // Turn during recovery rather than waiting idle after every recording.
    const nextDancer = playing && !this.queuedStrike && previousAge >= previousAttack.peak+.08
      ? this.zombies.zombies[this.autoIndex % this.zombies.zombies.length] : null;
    const currentContact = playing && previousAge < previousAttack.peak && this.activeTarget
      ? this.zombies.getHitTargets(this.activeTarget)[1] : null;
    const turnTarget = currentContact ?? (nextDancer ? this.zombies.getHitTargets(nextDancer)[1] : target);
    const desiredAngle = turnTarget ? Math.atan2(turnTarget.y-(this.groundY-65*HERO_SCALE),turnTarget.x-this.playerX) : this.aimAngle;
    let aligned: boolean;
    if (this.isRapidWhipActive && this.queuedStrike?.automatic) {
      this.turning.angle = desiredAngle;
      this.turning.velocity = 0;
      aligned = true;
    } else {
      aligned = this.turning.step(dt, desiredAngle);
    }
    this.aimAngle = this.turning.angle;
    const whipTarget = playing && this.activeTarget ? this.zombies.getHitTargets(this.activeTarget)[1] : target;
    if (whipTarget) this.whip.aimAt(whipTarget.x,whipTarget.y);
    if (this.queuedStrike && target && aligned) {
      if (this.whip.triggerSnapImpulse(target.x,target.y,this.queuedStrike.power,
        this.isRapidWhipActive || !this.queuedStrike.automatic,
        this.effectiveRapidWhipSpeed)) {
        this.activeStrikeAutomatic = this.queuedStrike.automatic;
        this.activeTarget = this.queuedTarget;
        this.queuedTarget = null;
        if (this.queuedStrike.automatic) this.autoIndex = (this.autoIndex+1) % this.zombies.zombies.length;
        this.queuedStrike = null;
      }
    }
    const attack = soundEngine.attack;
    const age = attack ? soundEngine.audioTime - attack.start : 1;
    const voiceActive = attack?.prepStart !== undefined && age < 0;
    const voiceDuration = voiceActive ? attack.start - attack.prepStart! : 0;
    const voiceAge = voiceActive ? soundEngine.audioTime - attack.prepStart! : 0;
    const voiceProgress = voiceActive && voiceDuration > 0 ? Math.min(1,voiceAge/voiceDuration) : 0;
    this.heroVisualAngle = this.aimAngle + (voiceActive ? Math.PI * 12 * voiceProgress : 0);
    this.heroJump = voiceActive ? Math.max(0,Math.sin(Math.PI * 24 * voiceProgress)) * 22 : 0;
    this.rapidDanceStep = 0;
    const windup = attack?.prepStart === undefined ? undefined : voiceActive
      ? Math.min(1,voiceAge/.25) * (.5+.5*Math.cos(Math.PI * 12 * voiceProgress)) : 1;
    this.handsRaised = windup === undefined ? 0 : age < 0 ? windup
      : age < attack!.peak ? Math.max(0,1-age/attack!.peak)
      : Math.min(1,(age-attack!.peak)/.45);
    const motion = attack ? strikeMotion(age,attack.peak,this.whip.strikePower,windup)
      : {extension:24,lift:0,lean:0};
    const rapidStrike = this.isRapidWhipActive && attack && attack.prepStart === undefined
      && age >= 0 && age < attack.duration;
    const rapidPhase = rapidStrike ? age / attack.duration : 0;
    if (rapidStrike) {
      this.heroJump = Math.sin(Math.PI * rapidPhase) * 20;
      this.heroVisualAngle = this.aimAngle + Math.sin(Math.PI * 2 * rapidPhase) * .14;
      this.handsRaised = Math.sin(Math.PI * rapidPhase) * .85;
      this.rapidDanceStep = Math.sin(Math.PI * 2 * rapidPhase) * 8;
    }
    this.bodyLean = motion.lean + (rapidStrike ? Math.sin(Math.PI * 2 * rapidPhase) * 3 : 0);
    const shoulder = heroShoulder(this.playerX,this.groundY-this.heroJump,this.heroVisualAngle,this.bodyLean);
    const desiredWrist = { x: shoulder.x + Math.cos(this.heroVisualAngle)*motion.extension*HERO_SCALE,
      y: shoulder.y+(Math.sin(this.heroVisualAngle)*motion.extension-motion.lift)*HERO_SCALE };
    const elbowGuide = { x: shoulder.x+Math.sin(this.heroVisualAngle)*24*HERO_SCALE,
      y: shoulder.y+(12-Math.cos(this.heroVisualAngle)*8)*HERO_SCALE };
    this.arm = solveArm(shoulder, desiredWrist, elbowGuide, HERO_SCALE);
    this.whip.updateHandle(this.arm.wrist.x, this.arm.wrist.y, this.heroVisualAngle);

    // Update whip physics
    const whipResult = this.whip.step(dt);

    if (whipResult.isCrack && whipResult.crackPos) {
      this.stats.totalCracks++;
      const skill = this.pendingSkill;
      this.pendingSkill = null;
      if (skill === 'whirlwind') this.applyWhirlwind();
      if (skill === 'shockwave') this.applyShockwave();
      if (this.settings.screenShake) {
        this.atmosphere.triggerScreenShake(2+this.whip.strikePower*4);
      }
      this.atmosphere.addSonicCrack(
        whipResult.crackPos.x,
        whipResult.crackPos.y,
        this.whip.config.glowColor
      );
    }

    // Update atmospheric effects
    this.atmosphere.update(dt, this.width, this.height, this.settings.rainEffect, this.groundY);

    // Update Skill cooldowns
    if (this.whirlwindCooldown > 0) this.whirlwindCooldown -= dt;
    if (this.shockwaveCooldown > 0) this.shockwaveCooldown -= dt;

    // Update Combo timer
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.comboCount = 0;
        this.comboMultiplier = 1.0;
      }
    }

    // Check Whip collisions with Zombies
    if (whipResult.isCrack) this.checkCollisions(true, whipResult.tipSpeed);

    // The full dance circle is created on restart; no additional spawning.
  }

  private updateBurialScene(dt: number) {
    if (featureFlags.tiktokEnabled && this.zombies.zombies.length === 0) return;
    this.burialScene.update(dt, this.playerX, this.groundY, this.width, this.height, this.isTikTokMode,
      this.zombies.zombies, this.atmosphere);
    if (this.burialScene.needsReset) {
      this.resetBombScene();
      this.burialScene.reset(this.zombies.zombies);
      return;
    }
    const action = this.burialScene.actionTime;
    const singing = action < 0;
    const target = this.burialScene.target;
    const heroX = this.burialScene.heroX || this.playerX;
    const heroY = this.burialScene.heroY || this.groundY;
    const prepProgress = this.burialScene.prepDuration > 0
      ? Math.min(1, this.burialScene.time / this.burialScene.prepDuration) : 0;
    const aimX = action >= this.burialScene.walkEnd ? this.burialScene.graveX : target?.x ?? this.burialScene.graveX;
    const aimY = action >= this.burialScene.walkEnd ? this.burialScene.graveY : (target?.y ?? this.groundY) - 50;
    const travelAngle = Math.atan2(this.burialScene.graveY - this.groundY,
      this.burialScene.graveX - this.playerX);
    this.heroVisualAngle = singing ? Math.PI / 2 + prepProgress * Math.PI * 4
      : this.burialScene.walking ? travelAngle + (action < this.burialScene.walkEnd ? 0 : Math.PI)
        : Math.atan2(aimY - (heroY - 60), aimX - heroX);
    this.heroJump = singing ? Math.abs(Math.sin(prepProgress * Math.PI * 18)) * 12
      : this.burialScene.walking ? Math.abs(Math.sin(this.burialScene.walkDistance / 19)) * 5 : 0;
    const digging = this.burialSceneEnabled && action >= this.burialScene.walkEnd && action < this.burialScene.buryEnd;
    const castingIntoPit = this.hellSceneEnabled && action >= this.burialScene.walkEnd
      && action < this.burialScene.digEnd;
    const scoop = digging ? Math.sin((action - this.burialScene.walkEnd) * Math.PI * 2 / .48) : 0;
    const throwing = action >= .28 && action < 1.05;
    const throwProgress = throwing ? Math.min(1, (action - .28) / .77) : 0;
    this.bodyLean = castingIntoPit ? 13 * Math.sin(Math.PI * (action - this.burialScene.walkEnd)
      / (this.burialScene.digEnd - this.burialScene.walkEnd))
      : digging ? Math.max(0, scoop) * 9
      : throwing ? Math.sin(throwProgress * Math.PI) * 7
        : this.burialScene.walking ? (action < this.burialScene.walkEnd ? 7 : -3)
          + Math.sin(this.burialScene.walkDistance / 19) * 2 : 0;
    this.handsRaised = castingIntoPit ? .8 : singing ? .55 + .45 * Math.abs(Math.sin(prepProgress * Math.PI * 10))
      : digging ? .2 + .25 * Math.max(0, -scoop)
        : throwing ? .35 + .4 * Math.sin(throwProgress * Math.PI)
          : this.burialScene.walking && action < this.burialScene.walkEnd ? .18 : action < 1.05 ? .45 : 0;
    const shoulder = heroShoulder(heroX, heroY - this.heroJump,
      this.heroVisualAngle, this.bodyLean);
    const wrist = castingIntoPit ? { x: shoulder.x + 60, y: shoulder.y - 48 }
      : digging
      ? { x: shoulder.x - 30 + scoop * 14, y: shoulder.y + 13 + scoop * 28 }
      : throwing ? { x: shoulder.x + 20 + 52 * Math.sin(throwProgress * Math.PI),
        y: shoulder.y - 35 + 28 * throwProgress }
        : this.burialScene.walking && action < this.burialScene.walkEnd ? { x: shoulder.x - 24, y: shoulder.y + 32 }
        : { x: shoulder.x + 34, y: shoulder.y - (singing ? 45 : 10) };
    this.arm = solveArm(shoulder, wrist,
      { x: shoulder.x + 20, y: shoulder.y + 8 }, HERO_SCALE);
    this.burialScene.stepRope(dt, this.arm.wrist.x, this.arm.wrist.y);
  }

  private updateBombScene(dt: number) {
    const previousTime = this.bombSceneTime;
    this.bombSceneTime += dt;
    if (previousTime < 3 && this.bombSceneTime >= 3) {
      this.bombExploded = true;
      const blastScale = Math.max(1, Math.min(3.2, this.width / BROADCAST.width));
      soundEngine.playBombExplosion();
      this.atmosphere.triggerScreenShake(22);
      this.atmosphere.addSonicCrack(this.playerX, this.groundY - 16, '#fbbf24');
      this.atmosphere.addExplosionBurst(this.playerX, this.groundY - 16, blastScale);
      this.atmosphere.addFireParticles(this.playerX, this.groundY - 16, 35);
      this.zombies.zombies.forEach((z, index) => {
        const dx = z.x - this.playerX;
        const dy = z.y - this.groundY;
        const distance = Math.hypot(dx, dy * 1.2);
        const side = Math.sign(dx) || (index % 2 ? 1 : -1);
        const power = Math.max(.35, Math.min(1, 1 - distance / 400));
        const scatterAngle = Math.atan2(dy * .7, dx || side * 20) + (Math.random() - .5) * .9;
        const scatterDistance = 90 + Math.random() * 135;
        const minLandingX = this.width * BROADCAST.left + 75 * z.scale;
        const maxLandingX = this.width * (1 - BROADCAST.right) - 75 * z.scale;
        const rawLandingX = z.x + Math.cos(scatterAngle) * scatterDistance;
        const landingX = rawLandingX < minLandingX ? minLandingX + Math.random() * 55
          : rawLandingX > maxLandingX ? maxLandingX - Math.random() * 55
            : rawLandingX;
        const rawLandingY = z.y + Math.sin(scatterAngle) * scatterDistance * .62;
        const minLandingY = this.groundY - 190;
        const maxLandingY = this.groundY + 135;
        const landingY = rawLandingY < minLandingY ? minLandingY + Math.random() * 65
          : rawLandingY > maxLandingY ? maxLandingY - Math.random() * 65
            : rawLandingY;
        const duration = 1.2 + Math.random() * .55;
        z.formation = undefined;
        z.blastGroundY = z.y;
        z.blastDelay = Math.max(0, (distance - 75) / 900) + Math.random() * .05;
        z.blastImpact = 0;
        z.blastFlail = index * .8;
        z.blastSleep = false;
        z.blastAngle = 0;
        z.blastSpin = side * (.42 + Math.random() * .2);
        z.blastFlight = {
          startX: z.x, startY: z.y, landingX, landingY,
          apex: Math.max(95, Math.min(z.y - 125, 145 + power * 75 + Math.random() * 45)),
          duration, age: 0, impactPlayed: false,
        };
        z.vx = (landingX - z.x) / duration;
        z.vy = -400;
      });
    }
    if (this.bombExploded) {
      for (const z of this.zombies.zombies) {
        const flight = z.blastFlight;
        if (!flight) continue;
        if ((z.blastDelay ?? 0) > 0) {
          z.blastDelay = Math.max(0, (z.blastDelay ?? 0) - dt);
          continue;
        }
        z.blastImpact = Math.max(0, (z.blastImpact ?? 0) - dt * 2.8);
        z.blastFlail = (z.blastFlail ?? 0) + dt * 13;
        flight.age += dt;
        const progress = Math.min(1, flight.age / flight.duration);
        const travel = progress * (2 - progress);
        const previousY = z.y;
        z.x = flight.startX + (flight.landingX - flight.startX) * travel;
        z.blastGroundY = flight.startY + (flight.landingY - flight.startY) * travel;
        if (progress < 1) {
          z.y = z.blastGroundY - 4 * flight.apex * progress * (1 - progress);
          z.vx = (flight.landingX - flight.startX) * 2 * (1 - progress) / flight.duration;
          z.vy = (z.y - previousY) / dt;
          z.blastAngle = (z.blastSpin ?? 1) * Math.sin(progress * Math.PI * 1.35);
        } else {
          if (!flight.impactPlayed) {
            this.atmosphere.addImpactDust(z.x, flight.landingY, z.scale, 380 + flight.apex);
            z.blastImpact = 1;
            flight.impactPlayed = true;
          }
          const bounceAge = flight.age - flight.duration;
          z.y = flight.landingY - (bounceAge < .36 ? 23 * Math.sin(bounceAge / .36 * Math.PI) : 0);
          z.vx = 0;
          z.vy = bounceAge < .36 ? (z.y - previousY) / dt : 0;
          z.blastAngle = (z.blastSpin ?? 1) * (.52 + .12 * Math.max(0, 1 - bounceAge / .36));
          if (bounceAge >= .9) {
            z.y = flight.landingY;
            z.vy = 0;
            z.blastFlight = undefined;
            z.blastGroundY = undefined;
            z.blastAngle = undefined;
            z.blastSpin = undefined;
            z.blastImpact = undefined;
            z.blastDelay = undefined;
            z.blastSleep = true;
          }
        }
      }
    }
    if (previousTime < 7 && this.bombSceneTime >= 7) {
      this.bombDanceStarted = true;
      soundEngine.playHeroCelebration();
    }
    if (previousTime < 7.75 && this.bombSceneTime >= 7.75) {
      this.zombies.zombies.forEach((z, index) => {
        if (z.buried) return;
        z.blastSleep = false;
        z.blastFlight = undefined;
        z.blastAngle = undefined;
        z.blastGroundY = undefined;
        z.blastImpact = undefined;
        z.blastDelay = undefined;
        z.vx = 0;
        z.vy = 0;
        this.placeDancer(z, index);
      });
    }
    const runEnd = 2.58;
    const run = Math.max(0, Math.min(1, (this.bombSceneTime - .12) / (runEnd - .12)));
    const travel = this.bombSceneTime < 5 ? run
      : this.bombSceneTime < 7 ? 1 - ((this.bombSceneTime - 5) / 2) ** 2 : 0;
    const danceAge = Math.max(0, this.bombSceneTime - 7);
    const image = backgroundImageRect(this.width, this.height, this.groundY);
    // The foot lands on the high left dune's actual ridge in sahara-sunny.png.
    const crestX = image.x + image.width * .373;
    const crestY = image.y + image.height * .425;
    this.bombHeroX = this.playerX + (crestX - this.playerX) * travel;
    this.bombHeroY = this.groundY + (crestY - this.groundY) * travel;
    this.bombHeroScale = HERO_SCALE * (1 - .62 * travel);
    const summitTurn = Math.max(0, Math.min(1, (this.bombSceneTime - runEnd) / .28));
    this.heroVisualAngle = -Math.PI / 2 + Math.PI * summitTurn
      + (this.bombDanceStarted ? Math.sin(danceAge * 4) * .35 : 0);
    this.heroJump = this.bombDanceStarted ? Math.abs(Math.sin(danceAge * 5)) * 11
      : this.bombSceneTime < runEnd || (this.bombSceneTime >= 5 && this.bombSceneTime < 7)
        ? Math.abs(Math.sin(this.bombSceneTime * 20)) * 8 * (this.bombHeroScale / HERO_SCALE) : 0;
    this.bodyLean = this.bombDanceStarted ? Math.sin(danceAge * 4) * 5
      : this.bombSceneTime < runEnd ? 9 * Math.min(1, (runEnd - this.bombSceneTime) * 4) : 0;
    if (this.bombSceneTime < runEnd && run > 0) {
      this.bombRunDustClock += dt;
      if (this.bombRunDustClock >= .09) {
        this.bombRunDustClock = 0;
        this.atmosphere.addRunDust(this.bombHeroX, this.bombHeroY, this.bombHeroScale);
      }
    }
    this.handsRaised = this.bombDanceStarted ? .7 + .3 * Math.abs(Math.sin(danceAge * 4)) : 0;
    const shoulder = heroShoulder(this.bombHeroX, this.bombHeroY - this.heroJump,
      this.heroVisualAngle, this.bodyLean, this.bombHeroScale);
    this.arm = solveArm(shoulder,
      { x: shoulder.x + 27, y: shoulder.y + (this.bombDanceStarted ? -55 : this.bombSceneTime < runEnd ? Math.sin(this.bombSceneTime * 20) * 21 : 10) },
      { x: shoulder.x + 12, y: shoulder.y + 8 }, this.bombHeroScale);
    if (this.bombSceneTime >= 7 + soundEngine.getHeroSoundDuration()) this.resetBombScene();
  }

  private damagePlayer(damage: number) {
    this.stats.hp = Math.max(0, this.stats.hp - damage);
    this.comboCount = 0;
    this.comboMultiplier = 1.0;
    if (this.settings.screenShake) {
      this.atmosphere.triggerScreenShake(10);
    }

    if (this.stats.hp <= 0) {
      this.isGameOver = true;
      soundEngine.playZombieGroan(0.7);
    }
  }

  private placeDancer(z: Zombie, index: number) {
    const angle = z.formation?.angle ?? index / (featureFlags.tiktokEnabled
      ? Math.max(1, this.zombies.zombies.length) : DANCER_COUNT) * Math.PI * 2 - Math.PI / 2;
    const narrowScreen = this.width / this.height < .7;
    const sideMargin = narrowScreen ? .04 : BROADCAST.right;
    const left = this.isTikTokMode ? this.width * BROADCAST.left : 0;
    const right = this.isTikTokMode ? this.width * (1-sideMargin) : this.width;
    const top = this.height * .24;
    const bottom = this.height * (1-BROADCAST.bottom) + 12;
    const centerY = this.groundY - 55;
    const horizontalPadding = (narrowScreen ? 50 : 60) * z.scale + 8;
    const radiusX = Math.max(45, Math.min(this.width*(narrowScreen ? .42 : .36),
      this.playerX-left-horizontalPadding, right-this.playerX-horizontalPadding));
    const radiusY = Math.max(60, Math.min(this.height*.19,
      centerY-top-85*z.scale-12, bottom-centerY-65*z.scale-12));
    z.formation = { angle, radiusX, radiusY };
    z.x = this.playerX + Math.cos(angle)*radiusX;
    z.y = centerY + Math.sin(angle)*radiusY + 55*z.scale;
    z.direction = z.x < this.playerX ? 1 : -1;
  }

  private spawnWaveZombie() {
    const z = this.zombies.spawnZombie('SHAMBLER', this.playerX, this.groundY);
    z.scale = .72;
    this.placeDancer(z, this.waveZombiesSpawned);
  }

  private spawnLiveViewer(id: string, name: string, handle?: string) {
    const z = this.zombies.spawnZombie('SHAMBLER', this.playerX, this.groundY);
    z.scale = .72;
    z.viewerId = id;
    z.viewerName = Array.from(name).slice(0, 24).join('');
    z.viewerHandle = handle;
    this.zombies.zombies.forEach((viewer, index) => {
      if (viewer.formation || viewer === z) {
        viewer.formation = undefined;
        this.placeDancer(viewer, index);
      }
    });
    this.waveZombiesSpawned = this.zombies.zombies.length;
  }

  public addLiveViewer(id: string, name: string, handle?: string) {
    if (!featureFlags.tiktokEnabled) return false;
    const cleanId = id.trim();
    const cleanName = name.trim();
    if (!cleanId || !cleanName) return false;
    if (handle) this.liveHandles.set(cleanId, handle);
    if (this.liveViewers.has(cleanId)) {
      const existing = this.zombies.zombies.find(z => z.viewerId === cleanId);
      if (existing && handle) existing.viewerHandle = handle;
      return false;
    }
    this.liveViewers.set(cleanId, cleanName);
    this.spawnLiveViewer(cleanId, cleanName, handle);
    return true;
  }

  public clearLiveViewers() {
    this.liveViewers.clear();
    this.liveHandles.clear();
    this.liveLikes = 0;
    this.liveWhipBoostTime = 0;
    this.liveWhipSpeed = 1;
    this.zombies.zombies = [];
    this.waveZombiesSpawned = 0;
    this.autoIndex = 0;
    this.queuedStrike = null;
    this.queuedTarget = null;
    this.activeTarget = null;
    this.burialScene.reset([]);
    this.liveTaskQueue = [];
    this.activeLiveTask = null;
    this.chatQueue = [];
    this.currentChat = null;
    soundEngine.stopWhip();
  }

  public cancelLiveTasks() {
    this.liveTaskQueue = [];
    this.activeLiveTask = null;
  }

  public receiveLiveChat(senderId: string, name: string, text: string) {
    const cleanText = text.trim();
    if (!cleanText) return;
    this.chatQueue.push({ name: name.trim() || senderId, text: cleanText.slice(0, 120) });
    if (this.chatQueue.length > 12) this.chatQueue.shift();
    const viewers = [...this.liveViewers].map(([id, viewerName]) =>
      ({ id, name: viewerName, handle: this.liveHandles.get(id) }));
    const action = parseLiveAction(cleanText, senderId, viewers);
    if (action && this.liveTaskQueue.length < 24
      && !this.liveTaskQueue.some(task => task.kind === action.kind && task.targetId === action.targetId)
      && !(this.activeLiveTask?.kind === action.kind && this.activeLiveTask.targetId === action.targetId)) {
      this.liveTaskQueue.push(action);
    }
  }

  public receiveLiveGift(senderId: string, name: string) {
    const zombie = this.zombies.zombies.find(z => z.viewerId === senderId);
    if (zombie && this.burialScene.releaseViewer(zombie)) {
      this.placeDancer(zombie, this.zombies.zombies.indexOf(zombie));
      this.chatQueue.push({ name: name || senderId, text: 'Hediye geldi! Mezardan çıktın!' });
    }
    const currentKind = this.hellSceneEnabled ? 'hell' : this.burialSceneEnabled ? 'burial' : 'whip';
    const choices: LiveAction['kind'][] = (['whip', 'burial', 'hell'] as LiveAction['kind'][])
      .filter(kind => kind !== currentKind);
    if (this.liveTaskQueue.length < 24) {
      this.liveTaskQueue.push({ kind: choices[Math.floor(Math.random() * choices.length)], targetId: senderId });
    }
  }

  private processLiveTasks() {
    const active = this.activeLiveTask;
    if (active) {
      const elapsed = soundEngine.audioTime - active.startedAt;
      const finished = active.kind === 'whip'
        ? elapsed > 8 || (elapsed > .2 && !this.queuedStrike && !!soundEngine.attack
          && soundEngine.audioTime >= soundEngine.attack.cycleEnd)
        : active.kind === 'bomb' ? this.bombSceneTime >= 7
          : this.burialScene.target === null && this.burialScene.actionTime >= this.burialScene.cycleEnd - .05;
      if (!finished) return;
      this.activeLiveTask = null;
    }
    while (this.liveTaskQueue.length) {
      const task = this.liveTaskQueue.shift()!;
      const zombie = task.targetId ? this.zombies.zombies.find(z => z.viewerId === task.targetId) : undefined;
      if (task.kind !== 'bomb' && (!zombie || zombie.buried)) continue;
      if (task.kind === 'bomb') {
        if (this.bombSceneEnabled) this.setBombScene(false);
        this.setBombScene(true);
      } else if (task.kind === 'whip') {
        if (this.hellSceneEnabled) this.setHellScene(false);
        else if (this.burialSceneEnabled) this.setBurialScene(false);
        else if (this.bombSceneEnabled) this.setBombScene(false);
        const torso = this.zombies.getHitTargets(zombie!)[1];
        this.snapAt(torso.x, torso.y);
      } else {
        if (task.kind === 'hell') {
          if (this.hellSceneEnabled) this.setHellScene(false);
          this.setHellScene(true);
        } else {
          if (this.burialSceneEnabled) this.setBurialScene(false);
          this.setBurialScene(true);
        }
        this.burialScene.preferredViewerId = task.targetId ?? null;
      }
      this.activeLiveTask = { ...task, startedAt: soundEngine.audioTime };
      return;
    }
  }

  public snapAt(x: number, y: number, power = 1.25) {
    if (this.bombSceneEnabled || this.captureSceneEnabled || this.isGameOver) return false;
    const closest = this.zombies.zombies.flatMap(z =>
      this.zombies.getHitTargets(z).map(target => ({ z, target,
        distance: Math.hypot(target.x-x,target.y-y) - target.r }))
    ).sort((a,b) => a.distance-b.distance)[0];
    const lock = closest && closest.distance < 18 ? closest : null;
    const attack = soundEngine.attack;
    if (attack && soundEngine.audioTime < attack.cycleEnd && this.activeStrikeAutomatic) {
      soundEngine.stopWhip();
    }
    this.queuedTarget = lock?.z ?? null;
    const torso = lock ? this.zombies.getHitTargets(lock.z)[1] : null;
    this.queuedStrike = { x: torso?.x ?? x, y: torso?.y ?? y, power, automatic: false };
    return true;
  }

  public snapNearest() {
    const target = this.zombies.zombies[this.autoIndex % this.zombies.zombies.length];
    if (!target) return false;
    const torso = this.zombies.getHitTargets(target)[1];
    return this.snapAt(torso.x,torso.y);
  }

  private checkCollisions(isSonicCrack: boolean, tipSpeed: number) {
    const tip = this.whip.nodes.at(-1);
    if (!tip) return;
    // The popper itself must touch the visible sprite; the rope cannot score remote hits.
    const candidates = this.activeTarget ? [this.activeTarget] : this.zombies.zombies;
    for (const z of candidates) {
      const target = this.zombies.getHitTargets(z).find(t => Math.hypot(t.x-tip.x,t.y-tip.y) <= t.r+tip.radius+3);
      if (target) this.handleZombieHit(z,target.part,tip.x,tip.y,this.aimAngle,true,
        isSonicCrack,tipSpeed,this.whip.config.baseDamage);
    }
  }

  private handleZombieHit(
    z: Zombie,
    part: 'head' | 'torso' | 'leg',
    hitX: number,
    hitY: number,
    angle: number,
    isTip: boolean,
    isSonicCrack: boolean,
    tipSpeed: number,
    baseDmg: number
  ) {
    // Non-lethal dance mode: preserve health, limbs and the entire crowd.
    z.danceTimer = Math.min(10, z.danceTimer + 2+this.whip.strikePower*3);
    z.bowDelays.push(20);
    z.isDead = false;
    z.health = z.maxHealth;
    this.danceCount++;
    const line = soundEngine.sayZombieReaction();
    if (line) z.speechBubble = { text: line, timer: 3, maxTimer: 3 };
    this.atmosphere.addSparks(hitX, hitY, '#fbbf24', Math.round(3+this.whip.strikePower*4));
    this.comboCount++;
    this.comboTimer = 2.5;
    this.stats.bloodEssence += 5;
  }

  /**
   * Trigger Player Whirlwind Skill
   */
  public castWhirlwind(): boolean {
    if (this.whirlwindCooldown > 0 || !this.whip.triggerSnapImpulse(this.playerX + 300, this.groundY - 50)) return false;
    this.whirlwindCooldown = 8;
    this.pendingSkill = 'whirlwind';
    return true;
  }

  private applyWhirlwind() {
    this.whip.triggerWhirlwind();
    this.atmosphere.triggerScreenShake(12);

    // Damage all zombies within whirlwind radius
    const sweepRadius = 240;
    for (const z of this.zombies.zombies) {
      if (z.isDead) continue;
      const dist = Math.hypot(z.x - this.playerX, z.y - this.groundY);
      if (dist < sweepRadius) {
        this.handleZombieHit(
          z,
          'torso',
          z.x,
          z.y - 50,
          0,
          true,
          true,
          1500,
          this.whip.config.baseDamage * 1.5
        );
      }
    }
    return true;
  }

  /**
   * Trigger Player Shockwave Snap Skill
   */
  public castShockwave(): boolean {
    if (this.shockwaveCooldown > 0 || !this.whip.triggerSnapImpulse(this.playerX + 350, this.groundY - 50)) return false;
    this.shockwaveCooldown = 6;
    this.pendingSkill = 'shockwave';
    return true;
  }

  private applyShockwave() {
    this.atmosphere.addSonicCrack(this.playerX + 220, this.groundY - 50, '#38bdf8');
    this.atmosphere.triggerScreenShake(14);


    // Knockback all zombies in forward cone
    for (const z of this.zombies.zombies) {
      if (z.isDead) continue;
      if (z.x > this.playerX && z.x < this.playerX + 450) {
        this.handleZombieHit(
          z,
          'torso',
          z.x,
          z.y - 50,
          0,
          true,
          true,
          1600,
          this.whip.config.baseDamage * 1.3
        );
      }
    }
    return true;
  }

  private distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
  }

  /**
   * Draw Hunter Character
   */
  public drawHunter(ctx: CanvasRenderingContext2D) {
    const turnStrength = Math.min(1,Math.abs(this.turning.velocity)/1.5);
    const burialAction = this.burialScene.actionTime;
    const burialStep = this.captureSceneEnabled
      ? burialAction < 0 ? Math.sin(this.burialScene.time * 12) * 6
        : this.burialScene.walking ? Math.sin(this.burialScene.walkDistance / 19) * 12
          : burialAction >= this.burialScene.walkEnd && burialAction < this.burialScene.buryEnd
            ? Math.sin(burialAction * 12) * 3 : 0 : 0;
    drawHero3D(ctx,this.captureSceneEnabled ? this.burialScene.heroX || this.playerX
      : this.bombSceneEnabled ? this.bombHeroX : this.playerX,
      (this.bombSceneEnabled ? this.bombHeroY : this.captureSceneEnabled ? this.burialScene.heroY || this.groundY : this.groundY)-this.heroJump,this.heroVisualAngle,this.arm,
      this.captureSceneEnabled ? burialStep : this.bombSceneEnabled ? this.bombDanceStarted ? Math.sin((this.bombSceneTime - 7) * 9) * 8
        : Math.sin(this.bombSceneTime * 20) * (this.bombSceneTime < 2.58 || (this.bombSceneTime >= 5 && this.bombSceneTime < 7) ? 15 : 0)
        : this.isRapidWhipActive ? this.rapidDanceStep : Math.sin(this.turning.stepPhase)*3*turnStrength,
      this.bodyLean,this.handsRaised,this.bombSceneEnabled ? this.bombHeroScale : HERO_SCALE,
      this.captureSceneEnabled && this.burialScene.walking ? Math.sin(this.burialScene.walkDistance / 19) * .7
        : this.bombSceneEnabled && this.bombSceneTime < 2.58 ? Math.sin(this.bombSceneTime * 20) : 0);
  }

  private drawBomb(ctx: CanvasRenderingContext2D) {
    if (!this.bombSceneEnabled || this.bombSceneTime >= 3) return;
    ctx.save();
    ctx.translate(this.playerX, this.groundY - 11);
    ctx.shadowColor = '#f97316';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#18181b';
    ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(3, -12); ctx.quadraticCurveTo(10, -25, 15, -21); ctx.stroke();
    ctx.fillStyle = Math.floor(this.bombSceneTime * 8) % 2 ? '#fbbf24' : '#fb923c';
    ctx.beginPath(); ctx.arc(15, -21, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff7ed'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(String(Math.ceil(3 - this.bombSceneTime)), 0, -39);
    ctx.restore();
  }

  private drawBombBlast(ctx: CanvasRenderingContext2D) {
    const age = this.bombSceneTime - 3;
    if (!this.bombSceneEnabled || age < 0 || age > 1.6) return;
    const x = this.playerX, y = this.groundY - 18;
    const blastScale = Math.max(1, Math.min(3.2, this.width / BROADCAST.width));
    ctx.save();
    if (age < .13) {
      ctx.globalAlpha = (.13 - age) / .13 * .78;
      ctx.fillStyle = '#fff8e7';
      ctx.fillRect(0, 0, this.width, this.height);
    }
    const fireLife = Math.max(0, 1 - age / .7);
    if (fireLife > 0) {
      const radius = (38 + age * 210) * blastScale;
      ctx.globalAlpha = fireLife;
      const fire = ctx.createRadialGradient(x, y, 5, x, y, radius);
      fire.addColorStop(0, '#ffffff');
      fire.addColorStop(.22, '#fff0a3');
      fire.addColorStop(.5, '#fb923c');
      fire.addColorStop(.78, '#9a3412');
      fire.addColorStop(1, 'rgba(124,45,18,0)');
      ctx.fillStyle = fire;
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 9; i++) {
        const a = i * Math.PI * 2 / 9 + .17;
        const r = radius * (.55 + (i % 3) * .13);
        ctx.globalAlpha = fireLife * .55;
        ctx.fillStyle = i % 2 ? '#f97316' : '#fbbf24';
        ctx.beginPath(); ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r * .62,
          radius * (.22 + (i % 3) * .05), 0, Math.PI * 2); ctx.fill();
      }
    }
    const wave = Math.max(0, 1 - age / 1.05);
    if (wave > 0) {
      const radius = (20 + age * 380) * blastScale;
      ctx.globalAlpha = wave * .9;
      ctx.strokeStyle = '#ffe7aa'; ctx.lineWidth = (12 * wave + 2) * blastScale;
      ctx.beginPath(); ctx.ellipse(x, y, radius, radius * .48, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = wave * .48;
      ctx.strokeStyle = '#b45309'; ctx.lineWidth = (22 * wave + 4) * blastScale;
      ctx.beginPath(); ctx.ellipse(x, this.groundY + 2, radius * 1.2, radius * .25, 0, 0, Math.PI * 2); ctx.stroke();
    }
    const smoke = Math.min(1, age * 3) * Math.max(0, 1 - age / 1.6);
    ctx.globalAlpha = smoke * .55;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI * 2 / 8;
      const r = (20 + age * (42 + i % 3 * 15)) * blastScale;
      ctx.fillStyle = i % 2 ? '#503b2d' : '#6b5544';
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * r, y - 18 - age * 125 + Math.sin(a) * r * .45,
        (23 + age * 32) * blastScale, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  public get dialogueText() {
    const speaking = this.zombies.zombies.find(z => z.speechBubble && z.speechBubble.timer>0);
    return speaking?.speechBubble?.text ?? (soundEngine.isSpeaking ? 'Habibi, come to Dubai!' : null);
  }

  private drawBurialDialogue(ctx: CanvasRenderingContext2D) {
    const scene = this.burialScene;
    const target = scene.target;
    const t = scene.actionTime;
    const rescuePrompt = this.burialSceneEnabled && t >= scene.buryEnd && t < scene.returnStart + 1.5;
    if (!this.burialSceneEnabled || !target || t < 1.05 || (t >= scene.digEnd && !rescuePrompt)) return;
    const phrase = Math.floor((t - 1.05) / 1.3) % 4;
    const lines = rescuePrompt ? ['MEZARDAN ÇIKMAK İÇİN', 'HEDİYE GÖNDER!']
      : phrase === 0 ? ['TÖVBE TÖVBE', 'TÖVBE!']
      : phrase === 1 ? ['ŞÜKÜR ALLAH!']
        : phrase === 2 ? ['HEDİYE ATICAM!']
          : ['HEDİYE ATINCA', 'ÇIKARIRIM!'];
    const heroSpeaks = rescuePrompt || phrase === 3;
    const speakerX = (heroSpeaks ? scene.heroX : target.x) - scene.cameraX;
    const speakerY = (heroSpeaks ? scene.heroY - 135 * HERO_SCALE
      : target.y - 124 * target.scale) - scene.cameraY;
    const clipTop = this.isTikTokMode ? this.height * .24 : 0;
    const clipBottom = this.isTikTokMode ? this.height * (1 - BROADCAST.bottom) + 12 : this.height;
    const bubbleWidth = Math.min(this.width - 20, rescuePrompt ? 218 : heroSpeaks ? 185 : 172);
    const bubbleHeight = lines.length === 2 ? 49 : 34;
    const x = Math.max(10, Math.min(this.width - bubbleWidth - 10, speakerX - bubbleWidth / 2));
    const y = Math.max(clipTop + 8, Math.min(clipBottom - bubbleHeight - 19, speakerY - bubbleHeight - 13));
    const tailX = Math.max(x + 17, Math.min(x + bubbleWidth - 17, speakerX));
    ctx.save();
    ctx.fillStyle = heroSpeaks ? '#fff4d7' : '#17191c';
    ctx.strokeStyle = heroSpeaks ? '#a65020' : '#fbbf24';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, bubbleWidth, bubbleHeight, 11);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tailX - 8, y + bubbleHeight - 1);
    ctx.lineTo(tailX, y + bubbleHeight + 10);
    ctx.lineTo(tailX + 8, y + bubbleHeight - 1);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = heroSpeaks ? '#48220d' : '#fff9e8';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((line, index) => ctx.fillText(line, x + bubbleWidth / 2,
      y + (lines.length === 2 ? 17 + index * 18 : bubbleHeight / 2)));
    ctx.restore();
  }

  private drawLiveChat(ctx: CanvasRenderingContext2D) {
    if (!this.currentChat) return;
    const chat = this.currentChat;
    const cameraX = this.captureSceneEnabled ? this.burialScene.cameraX : 0;
    const cameraY = this.captureSceneEnabled ? this.burialScene.cameraY : 0;
    const heroX = this.bombSceneEnabled ? this.bombHeroX
      : this.captureSceneEnabled ? this.burialScene.heroX || this.playerX : this.playerX;
    const heroY = this.bombSceneEnabled ? this.bombHeroY
      : this.captureSceneEnabled ? this.burialScene.heroY || this.groundY : this.groundY;
    const words = Array.from(chat.text.slice(0, 72));
    const first = words.slice(0, 26).join('');
    const rest = words.slice(26, 52).join('') + (words.length > 52 ? '…' : '');
    const lines = rest ? [first, rest] : [first];
    const width = Math.min(this.width - 20, 230);
    const height = 34 + lines.length * 18;
    const clipTop = this.isTikTokMode ? this.height * .24 : 0;
    const clipBottom = this.isTikTokMode ? this.height * (1 - BROADCAST.bottom) + 12 : this.height;
    const anchorX = heroX - cameraX;
    const anchorY = heroY - cameraY - 142;
    const x = Math.max(10, Math.min(this.width - width - 10, anchorX - width / 2));
    const y = Math.max(clipTop + 8, Math.min(clipBottom - height - 17, anchorY - height - 10));
    const tailX = Math.max(x + 16, Math.min(x + width - 16, anchorX));
    ctx.save();
    ctx.fillStyle = '#fff4dd'; ctx.strokeStyle = '#cc6c18'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(x, y, width, height, 11); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tailX - 8, y + height - 1);
    ctx.lineTo(tailX, y + height + 10); ctx.lineTo(tailX + 8, y + height - 1);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#9a3412'; ctx.font = 'bold 11px sans-serif';
    ctx.fillText(chat.name.slice(0, 22), x + width / 2, y + 13, width - 14);
    ctx.fillStyle = '#302018'; ctx.font = 'bold 12px sans-serif';
    lines.forEach((line, index) => ctx.fillText(line, x + width / 2, y + 32 + index * 18, width - 14));
    ctx.restore();
  }

  private drawGrip(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(this.whip.handleX,this.whip.handleY);
    ctx.rotate(this.whip.gripAngle);
    ctx.scale(HERO_SCALE,HERO_SCALE);
    ctx.fillStyle='#bf855f'; ctx.strokeStyle='#875637'; ctx.lineWidth=.8;
    ctx.beginPath(); ctx.roundRect(-4.5,-5.5,8,11,3); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#d49b72'; ctx.beginPath(); ctx.ellipse(1,-3.5,4,2.3,.5,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#996440'; ctx.lineWidth=.6;
    for(let y=-1;y<=3;y+=2){ctx.beginPath();ctx.moveTo(-3,y);ctx.lineTo(2,y);ctx.stroke();}
    ctx.restore();
  }

  /**
   * Main Canvas Render Loop
   */
  public render(ctx: CanvasRenderingContext2D, time: number) {
    ctx.save();

    // Apply Screen Shake
    if (this.settings.screenShake && this.atmosphere.screenShakeIntensity > 0) {
      ctx.translate(this.atmosphere.shakeOffsetX * this.settings.screenShakeStrength,
        this.atmosphere.shakeOffsetY * this.settings.screenShakeStrength);
    }

    // 1. Draw Background, sky, fog, ground, decals (respecting TikTok Safe Area)
    this.atmosphere.drawBackground(ctx, this.width, this.height, this.bgImage, this.groundY,
      this.captureSceneEnabled ? { x: this.burialScene.cameraX, y: this.burialScene.cameraY } : undefined);
    if (this.hellSceneEnabled) {
      ctx.fillStyle = 'rgba(145, 56, 14, .08)';
      ctx.fillRect(0, 0, this.width, this.height);
    }

    // Clip gameplay to the broadcast action zone, away from platform controls.
    ctx.save();
    if (this.isTikTokMode) {
      const clipTop = this.bombSceneEnabled ? 0 : this.height * .24;
      ctx.beginPath();
      ctx.rect(0, clipTop, this.width,
        this.height * (1 - BROADCAST.bottom) - clipTop + 12);
      ctx.clip();
    }
    ctx.save();
    if (this.captureSceneEnabled) ctx.translate(-this.burialScene.cameraX, -this.burialScene.cameraY);

    // 2. Draw Severed Limbs on Ground
    this.atmosphere.drawSeveredLimbs(ctx);
    this.drawBomb(ctx);
    if (this.captureSceneEnabled) this.burialScene.drawGround(ctx);

    // 3. Draw Zombies
    this.zombies.drawZombies(ctx, this.groundY);

    // 4. Draw Hunter
    this.drawHunter(ctx);

    this.zombies.drawZombies(ctx, this.groundY, 'front');

    // 5. Draw Whip
    if (this.captureSceneEnabled) this.burialScene.drawForeground(ctx, this.arm.wrist.x, this.arm.wrist.y);
    else if (this.bombSceneEnabled) this.drawBombBlast(ctx);
    else {
      this.whip.draw(ctx, time);
      this.drawGrip(ctx);
    }
    ctx.restore();

    this.drawBurialDialogue(ctx);
    this.drawLiveChat(ctx);

    // 6. Draw Foreground effects (particles, fog, shockwaves, lighting, rain)
    this.atmosphere.drawForegroundEffects(
      ctx,
      this.width,
      this.height,
      this.playerX,
      this.groundY - 50,
      this.settings.rainEffect,
      this.groundY
    );

    ctx.restore();
    ctx.restore();
  }
}
