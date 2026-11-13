import type { Zombie } from './types';
import { BROADCAST } from './broadcast';

type FlowerKind = 'rose' | 'tulip';
type Flower = { kind: FlowerKind; fromX: number; fromY: number; target: Zombie; age: number; duration: number };
type Bloom = { kind: FlowerKind; x: number; y: number; age: number };
type Petal = { x: number; y: number; vx: number; vy: number; age: number; color: string; spin: number };
type Money = { kind: 'coin' | 'dollar'; x: number; y: number; vx: number; vy: number;
  angle: number; spin: number; scale: number; back: boolean; phase: number };

/** Reusable canvas effects, with bounded particle counts for long LIVE sessions. */
export class CelebrationScene {
  public mode: 'flowers' | 'money' | null = null;
  public time = 0;
  public target: Zombie | null = null;
  public flowers: Flower[] = [];
  public blooms: Bloom[] = [];
  public petals: Petal[] = [];
  public money: Money[] = [];
  private spawnClock = 0;
  private throwIndex = 0;

  public reset(mode: CelebrationScene['mode'], width: number, height: number) {
    this.mode = mode;
    this.time = 0;
    this.spawnClock = 0;
    this.throwIndex = 0;
    this.target = null;
    this.flowers = [];
    this.blooms = [];
    this.petals = [];
    this.money = [];
    if (mode === 'money') {
      for (let i = 0; i < 65; i++) this.spawnMoney(width, Math.random() * height * (1 - BROADCAST.bottom));
    }
  }

  private spawnMoney(width: number, y = -45) {
    if (this.money.length >= 170) return;
    const back = Math.random() < .45;
    this.money.push({ kind: Math.random() < .52 ? 'coin' : 'dollar',
      x: Math.random() * (width + 50) - 25, y,
      vx: (Math.random() - .5) * 36, vy: 85 + Math.random() * 110,
      angle: Math.random() * Math.PI * 2, spin: (Math.random() - .5) * 3,
      scale: (back ? .55 : .85) + Math.random() * .35, back, phase: Math.random() * Math.PI * 2 });
  }

  public update(dt: number, width: number, height: number, origin: { x: number; y: number }, zombies: Zombie[]) {
    if (!this.mode) return;
    this.time += dt;
    this.spawnClock += dt;
    if (this.mode === 'money') {
      while (this.spawnClock >= 1 / 26) {
        this.spawnClock -= 1 / 26;
        this.spawnMoney(width);
      }
      for (const piece of this.money) {
        piece.x += (piece.vx + Math.sin(this.time * 1.8 + piece.phase) * 22) * dt;
        piece.y += piece.vy * dt;
        piece.angle += piece.spin * dt;
      }
      this.money = this.money.filter(p => p.y < height * (1 - BROADCAST.bottom) + 60
        && p.x > -90 && p.x < width + 90);
      for (const z of zombies) if (!z.buried && z.crowdMotion?.kind !== 'exit') z.applauding = true;
      return;
    }

    const recipients = zombies.filter(z => !z.buried && z.crowdMotion?.kind !== 'exit'
      && z.crowdMotion?.kind !== 'enter');
    if (this.spawnClock >= .78) {
      this.spawnClock %= .78;
      this.target = recipients[this.throwIndex % recipients.length] ?? null;
      if (this.target) {
        this.flowers.push({ kind: this.throwIndex % 2 === 0 ? 'rose' : 'tulip',
          fromX: origin.x, fromY: origin.y, target: this.target, age: 0, duration: .95 });
        this.throwIndex++;
      }
    }
    for (const flower of this.flowers) {
      flower.age += dt;
      if (flower.age < flower.duration || !recipients.includes(flower.target)) continue;
      const z = flower.target;
      z.danceTimer = Math.max(z.danceTimer, 3);
      this.blooms.push({ kind: flower.kind, x: z.x + (Math.random() - .5) * 20, y: z.y - 9, age: 0 });
      for (let i = 0; i < 9; i++) {
        const angle = i / 9 * Math.PI * 2;
        this.petals.push({ x: z.x, y: z.y - 58 * z.scale,
          vx: Math.cos(angle) * (28 + Math.random() * 32), vy: Math.sin(angle) * 45 - 30,
          age: 0, color: flower.kind === 'rose' ? '#fb7185' : '#fbbf24', spin: Math.random() * 6 });
      }
    }
    this.flowers = this.flowers.filter(f => f.age < f.duration && recipients.includes(f.target));
    for (const bloom of this.blooms) bloom.age += dt;
    this.blooms = this.blooms.filter(b => b.age < 8).slice(-32);
    for (const petal of this.petals) {
      petal.age += dt;
      petal.x += petal.vx * dt;
      petal.y += petal.vy * dt;
      petal.vy += 28 * dt;
    }
    this.petals = this.petals.filter(p => p.age < 1.7).slice(-100);
    if (this.target && !recipients.includes(this.target)) this.target = null;
  }

  public drawSky(ctx: CanvasRenderingContext2D, width: number, height: number) {
    if (this.mode !== 'money') return;
    ctx.save();
    ctx.beginPath();ctx.rect(0, 0, width, height * (1 - BROADCAST.bottom) + 12);ctx.clip();
    const glow = ctx.createLinearGradient(0, 0, 0, height * .7);
    glow.addColorStop(0, 'rgba(255, 211, 90, .24)');
    glow.addColorStop(1, 'rgba(255, 211, 90, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height * .7);
    this.drawMoney(ctx, true);
    ctx.restore();
  }

  public drawGround(ctx: CanvasRenderingContext2D) {
    if (this.mode !== 'flowers') return;
    for (const bloom of this.blooms) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, (8 - bloom.age) / 2);
      drawFlower(ctx, bloom.x, bloom.y, -.7, .65, bloom.kind);
      ctx.restore();
    }
  }

  public drawForeground(ctx: CanvasRenderingContext2D, hand: { x: number; y: number }) {
    if (this.mode === 'money') { this.drawMoney(ctx, false); return; }
    if (this.mode !== 'flowers') return;
    // The next flower is visible in the throwing hand between launches.
    drawFlower(ctx, hand.x, hand.y - 7, -.3, .9, this.throwIndex % 2 === 0 ? 'rose' : 'tulip');
    for (const flower of this.flowers) {
      const t = Math.min(1, flower.age / flower.duration);
      const endX = flower.target.x, endY = flower.target.y - 55 * flower.target.scale;
      const x = flower.fromX + (endX - flower.fromX) * t;
      const y = flower.fromY + (endY - flower.fromY) * t - Math.sin(t * Math.PI) * 95;
      drawFlower(ctx, x, y, Math.sin(t * Math.PI) * 1.3, 1, flower.kind);
    }
    for (const petal of this.petals) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, (1.7 - petal.age) * 1.5);
      ctx.translate(petal.x, petal.y);
      ctx.rotate(petal.spin + petal.age * 3);
      ctx.fillStyle = petal.color;
      ctx.beginPath();ctx.ellipse(0, 0, 4, 2.5, 0, 0, Math.PI * 2);ctx.fill();
      ctx.restore();
    }
  }

  private drawMoney(ctx: CanvasRenderingContext2D, back: boolean) {
    for (const p of this.money) {
      if (p.back !== back) continue;
      ctx.save();
      ctx.globalAlpha = back ? .65 : .95;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.scale(p.scale, p.scale);
      if (p.kind === 'coin') {
        const flip = Math.max(.16, Math.abs(Math.cos(this.time * 3 + p.phase)));
        ctx.scale(flip, 1);
        ctx.fillStyle = '#a85c08';
        ctx.beginPath();ctx.ellipse(2, 1, 11, 11, 0, 0, Math.PI * 2);ctx.fill();
        const gold = ctx.createLinearGradient(-10, -10, 10, 10);
        gold.addColorStop(0, '#fff4a5');gold.addColorStop(.45, '#fbbf24');gold.addColorStop(1, '#c9850b');
        ctx.fillStyle = gold;
        ctx.beginPath();ctx.arc(0, 0, 10.5, 0, Math.PI * 2);ctx.fill();
        ctx.strokeStyle = '#fff1a0';ctx.lineWidth = 1;
        ctx.beginPath();ctx.arc(0, 0, 8, 0, Math.PI * 2);ctx.stroke();
        ctx.fillStyle = '#9a5809';ctx.font = 'bold 13px Georgia';ctx.textAlign = 'center';ctx.textBaseline = 'middle';
        ctx.fillText('$', 0, 1);
      } else {
        ctx.scale(1, .75 + Math.sin(this.time * 3 + p.phase) * .2);
        ctx.fillStyle = '#a7d8a0';ctx.strokeStyle = '#235943';ctx.lineWidth = 1.5;
        ctx.beginPath();ctx.roundRect(-23, -12, 46, 24, 2);ctx.fill();ctx.stroke();
        ctx.strokeRect(-19, -8, 38, 16);
        ctx.fillStyle = '#397052';ctx.beginPath();ctx.ellipse(0, 0, 8, 9, 0, 0, Math.PI * 2);ctx.fill();
        ctx.fillStyle = '#e1edc8';ctx.font = 'bold 15px Georgia';ctx.textAlign = 'center';ctx.textBaseline = 'middle';
        ctx.fillText('$', 0, 1);
        ctx.fillStyle = '#235943';ctx.font = 'bold 6px Georgia';ctx.fillText('100', -14, -3);ctx.fillText('100', 14, 5);
      }
      ctx.restore();
    }
  }
}

function drawFlower(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, scale: number, kind: FlowerKind) {
  ctx.save();ctx.translate(x, y);ctx.rotate(angle);ctx.scale(scale, scale);
  ctx.strokeStyle = '#267b42';ctx.lineWidth = 2.5;ctx.lineCap = 'round';
  ctx.beginPath();ctx.moveTo(0, 19);ctx.quadraticCurveTo(-3, 4, 0, -9);ctx.stroke();
  ctx.fillStyle = '#3ea95c';
  for (const side of [-1, 1]) {
    ctx.beginPath();ctx.moveTo(-1, 9);ctx.quadraticCurveTo(side * 14, -5, side * 12, 5);
    ctx.quadraticCurveTo(side * 6, 14, -1, 9);ctx.fill();
  }
  if (kind === 'rose') {
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2;
      ctx.fillStyle = i % 2 === 0 ? '#e11d48' : '#fb7185';
      ctx.beginPath();ctx.ellipse(Math.cos(a) * 5, -13 + Math.sin(a) * 4, 6, 5, a, 0, Math.PI * 2);ctx.fill();
    }
    ctx.fillStyle = '#9f1239';ctx.beginPath();ctx.arc(0, -13, 3.5, 0, Math.PI * 2);ctx.fill();
    ctx.strokeStyle = '#fda4af';ctx.lineWidth = 1;ctx.beginPath();ctx.arc(0, -13, 2, .4, 4.8);ctx.stroke();
  } else {
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();ctx.moveTo(-10, -23);ctx.quadraticCurveTo(-12, -5, 0, -5);
    ctx.quadraticCurveTo(12, -5, 10, -23);ctx.lineTo(4, -17);ctx.lineTo(0, -26);
    ctx.lineTo(-4, -17);ctx.closePath();ctx.fill();
    ctx.strokeStyle = '#f59e0b';ctx.lineWidth = 1.2;
    ctx.beginPath();ctx.moveTo(-4, -17);ctx.quadraticCurveTo(-5, -8, 0, -5);ctx.moveTo(4, -17);
    ctx.quadraticCurveTo(5, -8, 0, -5);ctx.stroke();
  }
  ctx.restore();
}
