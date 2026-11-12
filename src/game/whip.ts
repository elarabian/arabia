import { strikeMotion } from './strikeMotion';
import { WhipConfig, WhipType } from './types';
import { soundEngine } from './audio';

export interface WhipNode {
  x: number;
  y: number;
  oldX: number;
  oldY: number;
  vx: number;
  vy: number;
  mass: number;
  radius: number;
}

export const WHIP_CONFIGS: Record<WhipType, WhipConfig> = {
  LEATHER: {
    id: 'LEATHER',
    name: 'Bullwhip',
    nameTr: 'Deri Kırbaç',
    descriptionTr: 'Geleneksel örgülü deri kırbaç. Hızlı, dengeli ve keskin ses patlaması oluşturur.',
    segments: 28,
    segmentLength: 12,
    baseDamage: 38,
    critMultiplier: 2.8,
    crackVelocityThreshold: 1100, // px/s
    color: '#8b4513',
    glowColor: 'rgba(180, 83, 9, 0.3)',
    tipColor: '#dc2626',
    massMultiplier: 1.0,
    damping: 0.985,
    soundType: 'leather',
    unlocked: true,
    cost: 0,
  },
  CHAIN: {
    id: 'CHAIN',
    name: 'Barbed Chain',
    nameTr: 'Dikenli Zincir',
    descriptionTr: 'Ağır çelik halkalar ve dikenler. Zırhları parçalar ve kemikleri ezer, yüksek kütleli savrulma.',
    segments: 24,
    segmentLength: 14,
    baseDamage: 55,
    critMultiplier: 2.5,
    crackVelocityThreshold: 1250,
    color: '#94a3b8',
    glowColor: 'rgba(148, 163, 184, 0.4)',
    tipColor: '#f1f5f9',
    massMultiplier: 1.6,
    damping: 0.978,
    soundType: 'chain',
    unlocked: false,
    cost: 250,
  },
  SHOCK: {
    id: 'SHOCK',
    name: 'Volt Arc Lash',
    nameTr: 'Volt Kırbacı',
    descriptionTr: 'Yüksek voltajlı plazma arkı. Zombileri felç eder ve elektrik kıvılcımları saçar.',
    segments: 30,
    segmentLength: 12,
    baseDamage: 45,
    critMultiplier: 3.2,
    crackVelocityThreshold: 1050,
    color: '#38bdf8',
    glowColor: 'rgba(56, 189, 248, 0.7)',
    tipColor: '#e0f2fe',
    massMultiplier: 0.9,
    damping: 0.99,
    soundType: 'shock',
    unlocked: false,
    cost: 500,
  },
  HELLFIRE: {
    id: 'HELLFIRE',
    name: 'Hellfire Scourge',
    nameTr: 'Kutsal Ateş Kırbacı',
    descriptionTr: 'Cehennem alevleriyle dövülmüş kırbaç. Zombileri yakarak küle çevirir ve patlayıcı vuruşlar yapar.',
    segments: 32,
    segmentLength: 13,
    baseDamage: 68,
    critMultiplier: 3.5,
    crackVelocityThreshold: 1000,
    color: '#ea580c',
    glowColor: 'rgba(234, 88, 12, 0.8)',
    tipColor: '#fef08a',
    massMultiplier: 1.1,
    damping: 0.985,
    soundType: 'fire',
    unlocked: false,
    cost: 850,
  },
};

export class WhipPhysics {
  public nodes: WhipNode[] = [];
  public config: WhipConfig;
  public handleX: number = 0;
  public handleY: number = 0;
  public gripAngle = 0;

  public get attachment() {
    return { x: this.handleX + Math.cos(this.gripAngle)*12, y: this.handleY + Math.sin(this.gripAngle)*12 };
  }
  private attackTarget = { x: 450, y: 300 };
  private lastAttackStart = -1;
  private peakReported = false;
  public facing = 1;
  public strikePower = 1;

  constructor(type: WhipType = 'LEATHER', startX: number = 100, startY: number = 300) {
    this.config = { ...WHIP_CONFIGS[type] };
    this.handleX = startX;
    this.handleY = startY;
    this.initNodes();
  }

  public setType(type: WhipType, reachBonus: number = 0) {
    this.config = { ...WHIP_CONFIGS[type] };
    if (reachBonus > 0) {
      this.config.segments += Math.floor(reachBonus * 2);
      this.config.segmentLength += reachBonus * 0.5;
    }
    this.initNodes();
  }

  private initNodes() {
    this.nodes = [];
    const count = this.config.segments;
    for (let i = 0; i < count; i++) {
      // Mass decreases along whip (classic whip tapering for conservation of energy)
      const t = i / (count - 1);
      const mass = (1.0 - t * 0.85) * this.config.massMultiplier;
      const radius = Math.max(1.5, (1.0 - t) * 6.5);
      const x = this.handleX + i * this.config.segmentLength * 0.6;
      const y = this.handleY + i * 2;

      this.nodes.push({
        x,
        y,
        oldX: x,
        oldY: y,
        vx: 0,
        vy: 0,
        mass,
        radius,
      });
    }
  }

  /**
   * Set target handle position (player hand)
   */
  public aimAt(x: number, y: number) {
    this.attackTarget = { x, y };
    this.facing = x < this.handleX ? -1 : 1;
  }

  public updateHandle(x: number, y: number, angle = this.gripAngle) {
    this.handleX = x;
    this.handleY = y;
    this.gripAngle = angle;
  }

  /**
   * Physics simulation step using Verlet integration
   */
  public step(dt: number, gravity: number = 980): { isCrack: boolean; crackPos?: { x: number; y: number }; tipSpeed: number } {
    if (this.nodes.length === 0) return { isCrack: false, tipSpeed: 0 };

    const root = this.attachment;
    const nodeCount = this.nodes.length;
    const damping = this.config.damping;
    const dtSq = dt * dt;

    // Pin handle node
    this.nodes[0].x = root.x;
    this.nodes[0].y = root.y;

    // 1. Verlet Integration on all other nodes
    for (let i = 1; i < nodeCount; i++) {
      const node = this.nodes[i];
      const vx = (node.x - node.oldX) * damping;
      const vy = (node.y - node.oldY) * damping;

      node.oldX = node.x;
      node.oldY = node.y;

      node.vx = vx / dt;
      node.vy = vy / dt;

      // Apply gravity and inertia
      node.x += vx;
      node.y += vy + gravity * dtSq * node.mass;
    }

    // 2. Distance Constraints relaxation (16 iterations for solid responsive whip feel)
    const iterations = 16;
    const segLen = this.config.segmentLength;

    for (let iter = 0; iter < iterations; iter++) {
      // Re-pin handle
      this.nodes[0].x = root.x;
      this.nodes[0].y = root.y;

      for (let i = 0; i < nodeCount - 1; i++) {
        const p1 = this.nodes[i];
        const p2 = this.nodes[i + 1];

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.hypot(dx, dy) || 0.0001;
        const diff = (dist - segLen) / dist;

        // Weight distribution: lighter nodes move more
        const w1 = i === 0 ? 0 : 1 / p1.mass;
        const w2 = 1 / p2.mass;
        const wTotal = w1 + w2;

        if (wTotal > 0) {
          const shift1 = (w1 / wTotal) * diff;
          const shift2 = (w2 / wTotal) * diff;

          if (i !== 0) {
            p1.x += dx * shift1;
            p1.y += dy * shift1;
          }
          p2.x -= dx * shift2;
          p2.y -= dy * shift2;
        }
      }
    }

    // Shared strike timeline follows audio, with a fallback during device interruptions.
    const attack = soundEngine.attack;
    let isCrack = false;
    let tipSpeed = 0;
    if (attack) {
      const elapsed = soundEngine.audioTime - attack.start;
      if (attack.start !== this.lastAttackStart) {
        this.lastAttackStart = attack.start;
        this.peakReported = false;
      }
      if (elapsed >= 0 && elapsed < attack.duration) {
        const angle = Math.atan2(this.attackTarget.y - root.y, this.attackTarget.x - root.x);
        const strikeFrame = elapsed >= attack.peak && !this.peakReported;
        // Sample the exact contact pose on the first frame crossing the audio peak.
        const poseTime = strikeFrame ? attack.peak : elapsed;
        const motion = strikeMotion(poseTime,attack.peak,this.strikePower,
          attack.prepStart === undefined ? undefined : 1);
        const recovery = Math.min(1,Math.max(0,(poseTime-attack.peak-.06)/.5));
        const reach = Math.min(this.config.segmentLength*(nodeCount-1),Math.hypot(this.attackTarget.x-root.x,this.attackTarget.y-root.y));
        const forwardX=Math.cos(angle),forwardY=Math.sin(angle);
        const backDistance=45+35*this.strikePower;
        let tipX:number,tipY:number;
        if(poseTime<attack.peak){
          const pull=motion.pullback;
          tipX=root.x+forwardX*(reach*motion.release-backDistance*pull);
          tipY=root.y+forwardY*(reach*motion.release-backDistance*pull)-45*pull;
        }else{
          tipX=root.x+forwardX*reach*(1-recovery*.38);
          tipY=root.y+forwardY*reach*(1-recovery*.38)+recovery*55;
        }
        for (let i = 1; i < nodeCount; i++) {
          const t = i / (nodeCount - 1);
          const curl=Math.sin(t*Math.PI)*(motion.pullback*55+recovery*28);
          const x=root.x+(tipX-root.x)*t-forwardY*curl;
          const y=root.y+(tipY-root.y)*t+forwardX*curl;
          const node = this.nodes[i];
          node.vx = (x - node.oldX) / dt;
          node.vy = (y - node.oldY) / dt;
          node.x = node.oldX = x;
          node.y = node.oldY = y;
        }
        if (elapsed >= attack.peak && !this.peakReported) {
          isCrack = true;
          this.peakReported = true;
          tipSpeed = 1000+this.strikePower*600;
        }
      }
    }
    const tip = this.nodes[nodeCount - 1];
    return { isCrack, crackPos: isCrack ? { x: tip.x, y: tip.y } : undefined, tipSpeed };
  }

  /**
   * Applies an impulse wave down the whip (e.g. on click / flick / quick snap assist)
   */
  public triggerSnapImpulse(targetX: number, targetY: number, power: number = 1.0, rapid = false, rapidSpeed = 1) {
    if (soundEngine.playWhipCrack(power, this.config.soundType, !rapid, rapid, rapidSpeed)) {
      this.strikePower = Math.max(.6,Math.min(1.6,power));
      this.attackTarget = { x: targetX, y: targetY };
      this.facing = targetX < this.handleX ? -1 : 1;
      return true;
    }
    return false;
  }

  /**
   * Special Whirlwind sweep around player
   */
  public triggerWhirlwind() {
    const radius = this.config.segments * this.config.segmentLength * 0.75;
    for (let i = 1; i < this.nodes.length; i++) {
      const angle = (i / this.nodes.length) * Math.PI * 2.5;
      const r = (i / this.nodes.length) * radius;
      this.nodes[i].x = this.handleX + Math.cos(angle) * r;
      this.nodes[i].y = this.handleY + Math.sin(angle) * r;
      this.nodes[i].oldX = this.nodes[i].x - Math.cos(angle + 0.3) * 60;
      this.nodes[i].oldY = this.nodes[i].y - Math.sin(angle + 0.3) * 60;
    }

  }

  /**
   * Render whip to canvas with high detail
   */
  public draw(ctx: CanvasRenderingContext2D, time: number) {
    if (this.nodes.length < 2) return;

    ctx.save();

    // 1. Draw Whip Glow (if chain, shock or hellfire)
    if (this.config.id !== 'LEATHER') {
      ctx.beginPath();
      ctx.moveTo(this.nodes[0].x, this.nodes[0].y);
      for (let i = 1; i < this.nodes.length; i++) {
        const xc = (this.nodes[i].x + this.nodes[i - 1].x) / 2;
        const yc = (this.nodes[i].y + this.nodes[i - 1].y) / 2;
        ctx.quadraticCurveTo(this.nodes[i - 1].x, this.nodes[i - 1].y, xc, yc);
      }
      ctx.lineTo(this.nodes[this.nodes.length - 1].x, this.nodes[this.nodes.length - 1].y);
      ctx.strokeStyle = this.config.glowColor;
      ctx.lineWidth = 14;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }

    // 2. Draw Whip Body segments
    if (this.config.id === 'CHAIN') {
      // Draw Barbed Chain Links
      for (let i = 0; i < this.nodes.length - 1; i++) {
        const n1 = this.nodes[i];
        const n2 = this.nodes[i + 1];
        const midX = (n1.x + n2.x) / 2;
        const midY = (n1.y + n2.y) / 2;
        const angle = Math.atan2(n2.y - n1.y, n2.x - n1.x);

        ctx.save();
        ctx.translate(midX, midY);
        ctx.rotate(angle);

        // Chain link ellipse
        const linkW = this.config.segmentLength * 0.9;
        const linkH = Math.max(3, n1.radius * 1.4);
        ctx.strokeStyle = i % 2 === 0 ? '#cbd5e1' : '#64748b';
        ctx.lineWidth = Math.max(1.8, n1.radius * 0.6);
        ctx.strokeRect(-linkW / 2, -linkH / 2, linkW, linkH);

        // Barbed spikes on every 3rd link
        if (i % 3 === 0) {
          ctx.fillStyle = '#f8fafc';
          ctx.beginPath();
          ctx.moveTo(-2, -linkH / 2);
          ctx.lineTo(0, -linkH / 2 - 5);
          ctx.lineTo(2, -linkH / 2);
          ctx.closePath();
          ctx.fill();

          ctx.beginPath();
          ctx.moveTo(-2, linkH / 2);
          ctx.lineTo(0, linkH / 2 + 5);
          ctx.lineTo(2, linkH / 2);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
    } else {
      // Smooth Catmull-style curve with tapering width for Leather, Shock, Hellfire
      for (let i = 0; i < this.nodes.length - 1; i++) {
        const n1 = this.nodes[i];
        const n2 = this.nodes[i + 1];
        const t = i / this.nodes.length;

        ctx.beginPath();
        ctx.moveTo(n1.x, n1.y);
        ctx.lineTo(n2.x, n2.y);

        if (this.config.id === 'LEATHER') {
          // Leather gradient with braiding stitches
          ctx.strokeStyle = i % 2 === 0 ? '#78350f' : '#451a03';
          ctx.lineWidth = Math.max(1.5, (1 - t * 0.75) * 6);
        } else if (this.config.id === 'SHOCK') {
          // Electric discharge line with jitter
          const jitterX = (Math.random() - 0.5) * 3;
          const jitterY = (Math.random() - 0.5) * 3;
          ctx.strokeStyle = i % 2 === 0 ? '#38bdf8' : '#e0f2fe';
          ctx.lineWidth = Math.max(2, (1 - t * 0.6) * 5);
          ctx.lineTo(n2.x + jitterX, n2.y + jitterY);
        } else if (this.config.id === 'HELLFIRE') {
          // Fiery molten scourge
          ctx.strokeStyle = i % 2 === 0 ? '#f97316' : '#dc2626';
          ctx.lineWidth = Math.max(2, (1 - t * 0.6) * 6.5);
        }

        ctx.lineCap = 'round';
        ctx.stroke();
      }
    }

    // 3. Handle (Player grip)
    ctx.save();
    ctx.translate(this.handleX, this.handleY);
    ctx.rotate(this.gripAngle);
    // Wooden/Metal Handle
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-12, -3.5, 24, 7);
    // Brass Pommel
    ctx.fillStyle = '#d97706';
    ctx.beginPath();
    ctx.arc(-12, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 4. Cracker / Tip (Popper)
    const tip = this.nodes[this.nodes.length - 1];
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = this.config.tipColor;
    ctx.fill();

    // Glow dot on tip
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = this.config.glowColor;
    ctx.fill();

    ctx.restore();
  }
}
