import { AtmosphereSystem } from './atmosphere';
import { soundEngine } from './audio';
import { Zombie } from './types';

const CYCLE = 5.65;
const ROPE_SEGMENTS = 24;
type RopePoint = { x: number; y: number; oldX: number; oldY: number };
const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

/** A staged lasso, drag, excavation and burial sequence for one dancer at a time. */
export class BurialScene {
  public time = 0;
  public buriedCount = 0;
  public target: Zombie | null = null;
  public needsReset = false;
  public graveX = 0;
  public graveY = 0;
  public heroX = 0;
  public prepDuration = 0;
  public ropeNodes: RopePoint[] = [];
  public get actionTime() { return this.time - this.prepDuration; }
  private startX = 0;
  private startY = 0;
  private digStep = -1;
  private endPause = 0;
  private activeGraveIndex = 0;
  private mounds: { x: number; y: number }[] = [];

  public reset(zombies: Zombie[]) {
    this.time = 0;
    this.prepDuration = 0;
    this.buriedCount = 0;
    this.target = null;
    this.needsReset = false;
    this.digStep = -1;
    this.endPause = 0;
    this.activeGraveIndex = 0;
    this.mounds = [];
    this.ropeNodes = [];
    for (const z of zombies) {
      z.buried = false;
      z.burialClipY = undefined;
    }
  }

  public update(dt: number, playerX: number, groundY: number, width: number,
    zombies: Zombie[], atmosphere: AtmosphereSystem) {
    if (!this.target) {
      this.target = zombies.find(z => !z.buried) ?? null;
      if (!this.target) {
        if (this.endPause === 0) soundEngine.playHeroCelebration();
        this.endPause += dt;
        if (this.endPause >= soundEngine.getHeroSoundDuration()) this.needsReset = true;
        return;
      }
      this.time = 0;
      this.digStep = -1;
      this.activeGraveIndex = this.buriedCount;
      this.ropeNodes = [];
      this.prepDuration = soundEngine.getHeroSoundDuration();
      soundEngine.playHeroCelebration();
    }
    const columns = Math.max(4, Math.min(8, Math.floor((width - 120) / 70) + 1));
    const margin = Math.min(70, width * .14);
    const column = this.activeGraveIndex % columns;
    const row = Math.floor(this.activeGraveIndex / columns);
    this.graveX = margin + column * (width - margin * 2) / (columns - 1);
    this.graveY = groundY + 35 + row * 38;
    const z = this.target;
    const previous = this.time;
    this.time = Math.min(this.prepDuration + CYCLE, this.time + dt);
    const t = this.actionTime;
    const previousAction = previous - this.prepDuration;
    if (t < 0) {
      this.heroX = playerX;
      return;
    }
    if (previousAction < .82 && t >= .82) soundEngine.playBurialWhip();
    if (previousAction < 1.05 && t >= 1.05) {
      this.startX = z.x;
      this.startY = z.y;
      z.formation = undefined;
    }
    if (t >= 1.05 && t < 2.35) {
      const pull = smooth((t - 1.05) / 1.3);
      const heldSide = -(Math.sign(this.graveX - playerX) || 1);
      z.x = this.startX + (this.graveX + heldSide * 35 - this.startX) * pull;
      z.y = this.startY + (this.graveY - this.startY) * pull
        - Math.sin(pull * Math.PI) * 13;
      z.direction = -1;
    } else if (t >= 2.35 && t < 4.05) {
      z.x = this.graveX - (Math.sign(this.graveX - playerX) || 1) * 35;
      z.y = this.graveY;
    } else if (t >= 4.05 && t < 5.2) {
      const sink = smooth((t - 4.05) / 1.15);
      z.x = this.graveX - (Math.sign(this.graveX - playerX) || 1) * 35 * (1 - sink);
      z.y = this.graveY + 88 * sink;
      z.burialClipY = this.graveY + 8;
    }
    if (t >= 2.45 && t < 4.05) {
      const step = Math.floor((t - 2.45) / .48);
      if (step !== this.digStep) {
        this.digStep = step;
        atmosphere.addImpactDust(this.graveX, this.graveY, 1, 320);
        soundEngine.playShovelDig();
      }
    }
    if (previousAction < 5.2 && t >= 5.2) {
      z.buried = true;
      z.burialClipY = undefined;
      this.buriedCount++;
      this.mounds.push({ x: this.graveX, y: this.graveY });
      atmosphere.addImpactDust(this.graveX, this.graveY, 1.25, 450);
      soundEngine.playShovelDig();
    }
    const approach = smooth((t - 1.8) / .55);
    const leave = smooth((t - 5.15) / .5);
    const graveSide = Math.sign(this.graveX - playerX) || 1;
    this.heroX = playerX + (this.graveX - graveSide * 90 - playerX) * approach * (1 - leave);
    if (this.time >= this.prepDuration + CYCLE - 1e-6) this.target = null;
  }

  public stepRope(dt: number, handX: number, handY: number) {
    if (!this.target || this.actionTime >= 2.4) {
      this.ropeNodes = [];
      return;
    }
    const t = this.actionTime;
    if (!this.ropeNodes.length) {
      this.ropeNodes = Array.from({ length: ROPE_SEGMENTS }, (_, i) => ({
        x: handX + i * 3, y: handY - i * 4,
        oldX: handX + i * 3, oldY: handY - i * 4,
      }));
    }
    const spin = this.time * 8;
    const orbitX = handX + Math.cos(spin) * 74;
    const orbitY = handY - 72 + Math.sin(spin) * 38;
    const cast = smooth((t - .28) / .77);
    const targetX = this.target.x;
    const targetY = this.target.y - 52;
    const caught = t >= 1.05;
    const goalX = orbitX + (targetX - orbitX) * cast;
    const goalY = orbitY + (targetY - orbitY) * cast - Math.sin(cast * Math.PI) * 35;
    const reach = Math.hypot(goalX - handX, goalY - handY);
    const segmentLength = Math.max(11, reach * 1.04 / (ROPE_SEGMENTS - 1));
    for (let i = 1; i < ROPE_SEGMENTS; i++) {
      const node = this.ropeNodes[i];
      const vx = (node.x - node.oldX) * .976;
      const vy = (node.y - node.oldY) * .976;
      node.oldX = node.x;
      node.oldY = node.y;
      node.x += vx + Math.cos(spin - i * .24) * (i / ROPE_SEGMENTS) * 180 * dt * dt;
      node.y += vy + 560 * dt * dt;
    }
    const tip = this.ropeNodes[ROPE_SEGMENTS - 1];
    const guidance = Math.min(1, dt * (t < .28 ? 16 : 28));
    tip.x += (goalX - tip.x) * guidance;
    tip.y += (goalY - tip.y) * guidance;
    for (let pass = 0; pass < 16; pass++) {
      this.ropeNodes[0].x = handX;
      this.ropeNodes[0].y = handY;
      if (caught) {
        tip.x = targetX;
        tip.y = targetY;
      }
      for (let i = 0; i < ROPE_SEGMENTS - 1; i++) {
        const a = this.ropeNodes[i], b = this.ropeNodes[i + 1];
        const dx = b.x - a.x, dy = b.y - a.y;
        const distance = Math.hypot(dx, dy) || .001;
        const correction = (distance - segmentLength) / distance;
        if (i === ROPE_SEGMENTS - 2 && caught) {
          a.x += dx * correction;
          a.y += dy * correction;
        } else if (i > 0) {
          a.x += dx * correction * .5;
          a.y += dy * correction * .5;
          b.x -= dx * correction * .5;
          b.y -= dy * correction * .5;
        } else {
          b.x -= dx * correction;
          b.y -= dy * correction;
        }
      }
      if (!caught) {
        tip.x += (goalX - tip.x) * .2;
        tip.y += (goalY - tip.y) * .2;
      }
    }
    this.ropeNodes[0].x = handX;
    this.ropeNodes[0].y = handY;
    if (caught) {
      tip.x = tip.oldX = targetX;
      tip.y = tip.oldY = targetY;
    }
  }

  public drawGround(ctx: CanvasRenderingContext2D) {
    const t = this.actionTime, x = this.graveX, y = this.graveY;
    ctx.save();
    for (const mound of this.mounds) {
      ctx.fillStyle = '#a96a32';
      ctx.beginPath(); ctx.ellipse(mound.x, mound.y + 2, 29, 10, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#d9a05f'; ctx.lineWidth = 2; ctx.stroke();
    }
    if (t >= 2.35 && t < 5.55) {
      const open = smooth((t - 2.35) / .45);
      const close = 1 - smooth((t - 5.1) / .45);
      const radius = 26 * open * close;
      if (radius > 1) {
        ctx.fillStyle = '#5b321b';
        ctx.beginPath(); ctx.ellipse(x, y + 3, radius + 8, 17 * open * close + 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#24160e';
        ctx.beginPath(); ctx.ellipse(x, y + 1, radius, 11 * open * close + 2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#dfad69'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(x, y, radius + 2, 13 * open * close + 2, 0, Math.PI, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.restore();
  }

  public drawForeground(ctx: CanvasRenderingContext2D, handX: number, handY: number) {
    if (!this.target) return;
    const t = this.actionTime;
    if (this.ropeNodes.length) {
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = '#3f2414'; ctx.lineWidth = 5;
      ctx.beginPath();
      this.ropeNodes.forEach((node, index) => {
        if (index === 0) ctx.moveTo(node.x, node.y);
        else ctx.lineTo(node.x, node.y);
      });
      if (t >= 1.05) ctx.lineTo(this.target.x, this.target.y - 53);
      ctx.stroke();
      ctx.strokeStyle = '#b77936'; ctx.lineWidth = 1.2; ctx.stroke();
      if (t >= 1.05) {
        ctx.strokeStyle = '#5f3519'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.ellipse(this.target.x, this.target.y - 53, 24 * this.target.scale,
          10 * this.target.scale, -.15, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }
    if (t >= 2.35 && t < 5.65) {
      const digging = t < 4.05;
      const swing = digging ? Math.sin((t - 2.35) * Math.PI * 2 / .48) : Math.sin((t - 4.05) * 5) * .35;
      const bladeX = this.graveX + swing * 17;
      const bladeY = this.graveY + (digging ? 4 + Math.max(0, swing) * 14 : -8);
      const handleX = this.heroX + 20;
      const handleY = handY - 15 - Math.max(0, -swing) * 17;
      ctx.save();
      ctx.strokeStyle = '#4a2c16'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(handleX, handleY); ctx.lineTo(bladeX, bladeY - 18); ctx.stroke();
      ctx.strokeStyle = '#b78b57'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(handleX - 2, handleY); ctx.lineTo(bladeX - 2, bladeY - 18); ctx.stroke();
      ctx.fillStyle = '#687178'; ctx.strokeStyle = '#30343a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(bladeX - 11, bladeY - 18);
      ctx.lineTo(bladeX + 11, bladeY - 18);
      ctx.lineTo(bladeX + 12, bladeY - 1);
      ctx.quadraticCurveTo(bladeX, bladeY + 14, bladeX - 12, bladeY - 1);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    if (t >= 4.05 && t < 5.55) {
      ctx.save();
      ctx.fillStyle = '#b7793e';
      const cover = smooth((t - 5.0) / .55);
      ctx.globalAlpha = cover;
      ctx.beginPath(); ctx.ellipse(this.graveX, this.graveY + 1, 30 * cover, 12 * cover, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
}
