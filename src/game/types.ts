export type WhipType = 'LEATHER' | 'CHAIN' | 'SHOCK' | 'HELLFIRE';

export interface WhipConfig {
  id: WhipType;
  name: string;
  nameTr: string;
  descriptionTr: string;
  segments: number;
  segmentLength: number;
  baseDamage: number;
  critMultiplier: number;
  crackVelocityThreshold: number; // speed needed to trigger sonic boom
  color: string;
  glowColor: string;
  tipColor: string;
  massMultiplier: number;
  damping: number;
  soundType: 'leather' | 'chain' | 'shock' | 'fire';
  unlocked: boolean;
  cost: number;
}

export type ZombieType = 'SHAMBLER' | 'BRUTE' | 'CRAWLER' | 'SPITTER' | 'BOSS';

export interface BodyPart {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  vAngle: number;
  radius: number;
  severed: boolean;
  health: number;
  maxHealth: number;
}

export interface Zombie {
  id: string;
  viewerId?: string;
  viewerName?: string;
  viewerHandle?: string;
  likes?: number;
  gifts?: number;
  favorite?: boolean;
  lastWhippedAt?: number;
  crowdMotion?: { kind: 'enter' | 'reflow' | 'exit'; startX: number; startY: number;
    endX?: number; endY?: number; elapsed: number; duration: number };
  type: ZombieType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  scale: number;
  direction: number; // -1 for left, 1 for right
  speed: number;
  health: number;
  maxHealth: number;
  damage: number;
  armor: number; // 0 to 100
  hasArmorPlates: boolean;
  isStunned: boolean;
  stunTimer: number;
  isBurning: boolean;
  burnTimer: number;
  isAttacking: boolean;
  attackTimer: number;
  walkCycle: number;
  staggerTimer: number;
  staggerForce: number;
  isDead: boolean;
  deathTimer: number;
  decayAlpha: number;
  
  // Anatomical parts for procedural animation & dismemberment
  head: BodyPart;
  torso: BodyPart;
  leftArm: BodyPart;
  rightArm: BodyPart;
  leftLeg: BodyPart;
  rightLeg: BodyPart;
  
  // Slash marks
  slashMarks: { x: number; y: number; angle: number; length: number; alpha: number }[];

  // Arabic / Turkish dialogue speech bubble
  speechBubble?: { text: string; timer: number; maxTimer: number; isCrit?: boolean };
  speechCooldown: number;
  danceTimer: number;
  bowDelays: number[];
  bowTimer: number;
  formation?: { angle: number; radiusX: number; radiusY: number };
  buried?: boolean;
  burialClipY?: number;
  burialDragging?: boolean;
  burialFleeing?: boolean;
  blastAngle?: number;
  blastSpin?: number;
  blastGroundY?: number;
  blastDelay?: number;
  blastImpact?: number;
  blastFlail?: number;
  blastSleep?: boolean;
  blastFlight?: {
    startX: number;
    startY: number;
    landingX: number;
    landingY: number;
    apex: number;
    duration: number;
    age: number;
    impactPlayed: boolean;
  };
}

export interface SeveredLimb {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  vAngle: number;
  partType: 'head' | 'arm' | 'leg' | 'armor_chunk';
  type: ZombieType;
  lifetime: number;
  scale: number;
}

export interface BloodDecal {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  color: string;
  splatters: { ox: number; oy: number; r: number }[];
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  alpha: number;
  decay: number;
  gravity: number;
  spark?: boolean;
  fire?: boolean;
  electric?: boolean;
}

export interface SpitProjectile {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  active: boolean;
}

export interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  color: string;
  isSonicCrack: boolean;
}

export interface PlayerStats {
  hp: number;
  maxHp: number;
  bloodEssence: number;
  totalKills: number;
  totalCracks: number;
  totalDismembers: number;
  whipReachLevel: number;
  whipPowerLevel: number;
  crackChanceLevel: number;
}

export interface GameSettings {
  soundVolume: number;
  screenShake: boolean;
  screenShakeStrength: number; // 0 to 1
  bloodIntensity: number; // 0 (none) to 2 (ultra gore)
  ambientLighting: boolean;
  rainEffect: boolean;
  assistSnapMode: boolean; // auto-whip snap on click
}
