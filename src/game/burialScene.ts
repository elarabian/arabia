import { AtmosphereSystem } from './atmosphere';
import { soundEngine } from './audio';
import { BROADCAST } from './broadcast';
import { Zombie } from './types';

const ROPE_SEGMENTS = 24;
type RopePoint = { x: number; y: number; oldX: number; oldY: number };
const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

/** A staged lasso, drag, excavation and burial sequence for one dancer at a time. */
export class BurialScene {
  public mode: 'burial' | 'hell' = 'burial';
  public preferredViewerId: string | null = null;
  public time = 0;
  public buriedCount = 0;
  public target: Zombie | null = null;
  public needsReset = false;
  public graveX = 0;
  public graveY = 0;
  public heroX = 0;
  public heroY = 0;
  public cameraX = 0;
  public cameraY = 0;
  public walking = false;
  public walkDistance = 0;
  public walkEnd = 4.6;
  public digEnd = 6.25;
  public buryEnd = 7.35;
  public returnStart = 8.75;
  public cycleEnd = 10.55;
  public prepDuration = 0;
  public ropeNodes: RopePoint[] = [];
  public get actionTime() { return this.time - this.prepDuration; }
  private digStep = -1;
  private captureY = 0;
  private endPause = 0;
  private throwStartX = 0;
  private throwStartY = 0;
  private activeGraveIndex = 0;
  private lastTarget: Zombie | null = null;
  private mounds: { x: number; y: number; name?: string; viewerId?: string }[] = [];
  private skeletons: { x: number; y: number }[] = [];
  private released = new Set<Zombie>();
  private fleeing = new Map<Zombie, NonNullable<Zombie['formation']>>();

  private chooseGrave(playerX: number, width: number, groundY: number) {
    if (this.mode === 'hell') {
      this.graveX = playerX + width * 1.15;
      this.graveY = groundY + 20;
      return;
    }
    let seed = ((this.activeGraveIndex + 1) * 2654435761) >>> 0;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let attempt = 0; attempt < 400; attempt++) {
      const sector = this.activeGraveIndex % 4;
      const distance = width * (.8 + random() * 1.2);
      const lateral = (random() - .5) * width * .65;
      const x = sector === 0 ? playerX + distance : sector === 1 ? playerX - distance
        : playerX + lateral + (lateral < 0 ? -width * .6 : width * .6);
      const y = sector === 2 ? groundY - 70 - random() * 75
        : sector === 3 ? groundY + 70 + random() * 75
          : groundY + (random() - .5) * 130;
      if (this.mounds.every(m => Math.hypot((x - m.x) / 100, (y - m.y) / 42) >= 1)) {
        this.graveX = x;
        this.graveY = y;
        return;
      }
    }
    const side = this.activeGraveIndex % 2 ? -1 : 1;
    this.graveX = playerX + side * (width * 1.5 + this.activeGraveIndex * 110);
    this.graveY = groundY + (this.activeGraveIndex % 3 - 1) * 55;
  }

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
    this.skeletons = [];
    this.released.clear();
    this.preferredViewerId = null;
    if (!this.lastTarget || !zombies.includes(this.lastTarget)) this.lastTarget = null;
    for (const [z, formation] of this.fleeing) z.formation = formation;
    this.fleeing.clear();
    this.ropeNodes = [];
    this.cameraX = 0;
    this.cameraY = 0;
    this.heroY = 0;
    this.walking = false;
    this.walkDistance = 0;
    for (const z of zombies) {
      z.buried = false;
      z.burialClipY = undefined;
      z.blastAngle = undefined;
      z.blastGroundY = undefined;
      z.burialDragging = false;
      z.burialFleeing = false;
      z.isBurning = false;
      z.vx = 0;
      z.vy = 0;
    }
  }

  public releaseViewer(z: Zombie) {
    if (!z.buried || !z.viewerId) return false;
    const index = this.mounds.findIndex(mound => mound.viewerId === z.viewerId);
    if (index < 0) return false;
    this.mounds.splice(index, 1);
    this.released.add(z);
    z.buried = false;
    z.burialClipY = undefined;
    z.burialDragging = false;
    z.blastAngle = undefined;
    z.isBurning = false;
    this.buriedCount = Math.max(0, this.buriedCount - 1);
    return true;
  }

  public spareViewer(z: Zombie) {
    if (this.target !== z || z.buried) return false;
    this.target = null;
    this.time = 0;
    this.cameraX = 0;
    this.cameraY = 0;
    this.ropeNodes = [];
    z.burialDragging = false;
    z.burialClipY = undefined;
    for (const [other, formation] of this.fleeing) {
      other.formation = formation;
      other.burialFleeing = false;
      other.vx = 0;
    }
    this.fleeing.clear();
    this.released.add(z);
    return true;
  }

  public update(dt: number, playerX: number, groundY: number, width: number, height: number, tikTokMode: boolean,
    zombies: Zombie[], atmosphere: AtmosphereSystem) {
    if (!this.target) {
      const nextIndex = this.lastTarget ? Math.max(0, zombies.indexOf(this.lastTarget) + 1) : 0;
      const ordered = [...zombies.slice(nextIndex), ...zombies.slice(0, nextIndex)];
      this.target = zombies.find(z => !z.buried && !z.favorite && z.crowdMotion?.kind !== 'exit'
        && !this.released.has(z)
        && z.viewerId === this.preferredViewerId)
        ?? ordered.find(z => !z.buried && !z.favorite && z.crowdMotion?.kind !== 'exit'
          && !this.released.has(z)) ?? null;
      this.preferredViewerId = null;
      if (!this.target) {
        if (this.endPause === 0) soundEngine.playHeroCelebration();
        this.endPause += dt;
        if (this.endPause >= soundEngine.getHeroSoundDuration()) this.needsReset = true;
        return;
      }
      this.lastTarget = this.target;
      this.time = 0;
      this.digStep = -1;
      this.activeGraveIndex = this.buriedCount;
      this.ropeNodes = [];
      this.chooseGrave(playerX, width, groundY);
      const travel = Math.hypot(this.graveX-playerX, this.graveY-groundY) + 65;
      this.walkEnd = 1.05 + Math.max(3.55, travel / 145);
      this.digEnd = this.walkEnd + (this.mode === 'hell' ? 1.4 : 1.65);
      this.buryEnd = this.digEnd + (this.mode === 'hell' ? .8 : 1.1);
      this.returnStart = this.buryEnd + (this.mode === 'hell' ? .9 : 1.4);
      this.cycleEnd = this.returnStart + Math.max(3.2, travel / 175);
      this.prepDuration = soundEngine.getHeroSoundDuration();
      soundEngine.playHeroCelebration();
    }
    const z = this.target;
    const previous = this.time;
    this.time = Math.min(this.prepDuration + this.cycleEnd, this.time + dt);
    const t = this.actionTime;
    const previousAction = previous - this.prepDuration;
    // Frame the captive before the lasso is thrown. The next dancer may still be
    // returning from a previous escape, outside the narrow phone viewport.
    const insetX = Math.min(width * .28, Math.max(84, 76 * z.scale));
    const midpointX = (z.x - playerX) * .5;
    const captureCameraX = Math.max(z.x - (width - insetX),
      Math.min(z.x - insetX, midpointX));
    const clipTop = tikTokMode ? height * .24 : 0;
    const clipBottom = tikTokMode ? height * (1 - BROADCAST.bottom) + 12 : height;
    const targetTop = z.y - (z.viewerName ? 117 * z.scale + 16 : 125 * z.scale);
    const targetBottom = z.y + 12 * z.scale;
    const minCameraY = targetBottom - (clipBottom - 12);
    const maxCameraY = targetTop - (clipTop + 12);
    const captureCameraY = minCameraY <= maxCameraY
      ? Math.max(minCameraY, Math.min(maxCameraY, 0))
      : (targetTop + targetBottom - clipTop - clipBottom) * .5;
    const captureWeight = t < 1.05
      ? smooth((t + 2) / 1.3)
      : 1 - smooth((t - 1.05) / 1.1);
    if (t < 0) {
      this.heroX = playerX;
      this.heroY = groundY;
      this.cameraX += (captureCameraX * captureWeight - this.cameraX) * Math.min(1, dt * 8);
      this.cameraY += (captureCameraY * captureWeight - this.cameraY) * Math.min(1, dt * 8);
      this.walking = false;
      return;
    }
    if (previousAction < .82 && t >= .82) soundEngine.playBurialWhip();
    if (previousAction < 1.05 && t >= 1.05) {
      this.captureY = z.y;
      z.formation = undefined;
      z.vx = 0;
      z.vy = 0;
      z.burialDragging = true;
      for (const other of zombies) {
        if (other === z || other.buried || !other.formation) continue;
        this.fleeing.set(other, other.formation);
        other.formation = undefined;
        other.burialFleeing = true;
        other.vx = (other.x < playerX ? -1 : 1) * 170;
      }
    }
    const routeX = this.graveX - playerX;
    const routeY = this.graveY - groundY;
    const routeLength = Math.hypot(routeX, routeY) || 1;
    const directionX = routeX / routeLength;
    const directionY = routeY / routeLength;
    const destinationX = this.graveX + directionX * (this.mode === 'hell' ? -90 : 65);
    const destinationY = this.graveY + directionY * (this.mode === 'hell' ? -90 : 65);
    const previousHeroX = this.heroX || playerX;
    const previousHeroY = this.heroY || groundY;
    const approach = smooth((t - 1.05) / (this.walkEnd - 1.05));
    const leave = smooth((t - this.returnStart) / (this.cycleEnd - this.returnStart));
    this.heroX = playerX + (destinationX - playerX) * approach * (1 - leave);
    this.heroY = groundY + (destinationY - groundY) * approach * (1 - leave);
    this.walking = (t >= 1.05 && t < this.walkEnd) || (t >= this.returnStart && t < this.cycleEnd);
    this.walkDistance += Math.hypot(this.heroX - previousHeroX, this.heroY - previousHeroY);
    const followX = Math.abs(this.heroX - playerX) > 35
      ? this.heroX - playerX - Math.sign(this.heroX-playerX) * 35 : 0;
    const followY = (this.heroY - groundY) * .75;
    const pitWeight = this.mode === 'hell'
      ? smooth((t - this.walkEnd + .7) / .7) * (1 - smooth((t - this.returnStart) / .7))
      : 0;
    const chaseX = followX * (1 - pitWeight) + (this.graveX - width * .62) * pitWeight;
    const cameraGoalX = chaseX * (1 - captureWeight) + captureCameraX * captureWeight;
    const cameraGoalY = followY * (1 - captureWeight) + captureCameraY * captureWeight;
    this.cameraX += (cameraGoalX - this.cameraX) * Math.min(1, dt * 8);
    this.cameraY += (cameraGoalY - this.cameraY) * Math.min(1, dt * 8);
    if (t >= 1.05 && t < this.buryEnd) {
      for (const other of this.fleeing.keys()) {
        const direction = other.vx < 0 ? -1 : 1;
        other.vx = direction * Math.min(460, Math.abs(other.vx) + 330 * dt);
        other.x += other.vx * dt;
        other.walkCycle += dt * 13;
        other.direction = direction;
      }
    }
    if (this.mode === 'hell' && previousAction < this.walkEnd && t >= this.walkEnd) {
      this.throwStartX = z.x;
      this.throwStartY = z.y;
      z.burialDragging = false;
      z.vx = 0;
      soundEngine.playShovelDig();
    }
    if (t >= 1.05 && t < (this.mode === 'hell' ? this.walkEnd : this.digEnd)) {
      // A damped pull keeps the captive behind the hunter and lets it lag on each step.
      const tetherX = this.heroX - directionX * 90;
      const tetherY = this.heroY - directionY * 90;
      const acceleration = Math.max(-950, Math.min(950, (tetherX - z.x) * 18 - z.vx * 7));
      z.vx = Math.max(-290, Math.min(290, z.vx + acceleration * dt));
      z.x += z.vx * dt;
      const dragPose = smooth((t - 1.05) / .35);
      const settle = smooth((t - 1.05) / 1.6);
      const groundTarget = t < this.walkEnd
        ? this.captureY + (tetherY - this.captureY) * settle : this.graveY;
      z.y += (groundTarget - z.y) * Math.min(1, dt * 4.5);
      z.vy = 0;
      z.blastAngle = -Math.sign(directionX || 1) * (.18 + Math.min(.24, Math.abs(z.vx) / 950)
        + Math.sin(this.walkDistance / 17) * .045) * dragPose;
      z.blastGroundY = undefined;
      z.walkCycle = this.walkDistance / 14;
      z.direction = directionX < 0 ? -1 : 1;
      if (t < this.walkEnd && Math.abs(z.vx) > 55 && Math.floor(previous * 8) !== Math.floor(this.time * 8)) {
        atmosphere.addRunDust(z.x, groundTarget, z.scale);
      }
    } else if (this.mode === 'hell' && t >= this.walkEnd && t < this.digEnd) {
      const flight = smooth((t - this.walkEnd) / (this.digEnd - this.walkEnd));
      z.x = this.throwStartX + (this.graveX - this.throwStartX) * flight;
      z.y = this.throwStartY + (this.graveY - this.throwStartY) * flight
        - Math.sin(flight * Math.PI) * 115;
      z.blastAngle = flight * Math.PI * 1.75;
      z.walkCycle += dt * 15;
      z.vy = 0;
      z.isBurning = flight > .65;
      if (Math.floor(previous * 12) !== Math.floor(this.time * 12)) {
        atmosphere.addSparks(z.x, z.y - 40, '#fb923c', 4);
      }
    } else if (t >= this.digEnd && t < this.buryEnd) {
      const sink = smooth((t - this.digEnd) / (this.buryEnd - this.digEnd));
      z.x += (this.graveX - z.x) * Math.min(1, dt * 6);
      z.y = this.graveY + 88 * sink;
      z.burialClipY = this.graveY + 8;
      z.blastAngle = -.25;
      z.burialDragging = false;
      if (this.mode === 'hell') z.isBurning = true;
    }
    if (this.mode === 'burial' && t >= this.walkEnd && t < this.digEnd) {
      const step = Math.floor((t - this.walkEnd) / .48);
      if (step !== this.digStep) {
        this.digStep = step;
        atmosphere.addImpactDust(this.graveX, this.graveY, 1, 320);
        soundEngine.playShovelDig();
      }
    }
    if (previousAction < this.buryEnd && t >= this.buryEnd) {
      z.buried = true;
      z.burialClipY = undefined;
      z.blastAngle = undefined;
      z.blastGroundY = undefined;
      z.burialDragging = false;
      this.buriedCount++;
      for (const [other, formation] of this.fleeing) {
        other.formation = formation;
        other.vx = 0;
        other.burialFleeing = false;
      }
      this.fleeing.clear();
      if (this.mode === 'burial') {
        this.mounds.push({ x: this.graveX, y: this.graveY, name: z.viewerName, viewerId: z.viewerId });
        atmosphere.addImpactDust(this.graveX, this.graveY, 1.25, 450);
        soundEngine.playShovelDig();
      } else {
        this.skeletons.push({ x: this.graveX, y: this.graveY });
        atmosphere.addSparks(this.graveX, this.graveY - 15, '#ffb21a', 35);
        atmosphere.triggerScreenShake(12);
      }
    }
    if (this.time >= this.prepDuration + this.cycleEnd - 1e-6) this.target = null;
  }

  public stepRope(dt: number, handX: number, handY: number) {
    if (!this.target || this.actionTime >= (this.mode === 'hell' ? this.walkEnd : this.digEnd)) {
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
    const caught = t >= 1.05;
    const targetY = caught ? this.target.y - 47 * this.target.scale : this.target.y - 52;
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
    if (this.mode === 'hell') {
      const pulse = .5 + .5 * Math.sin(this.time * 9);
      const glow = ctx.createRadialGradient(x, y - 8, 8, x, y - 8, 138);
      glow.addColorStop(0, `rgba(255, 175, 25, ${.56 + pulse * .12})`);
      glow.addColorStop(.48, 'rgba(255, 60, 9, .23)');
      glow.addColorStop(1, 'rgba(255, 35, 6, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.ellipse(x, y - 13, 140, 95, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#35150f';
      ctx.beginPath(); ctx.ellipse(x, y + 9, 89, 35, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#130908';
      ctx.beginPath(); ctx.ellipse(x, y + 4, 70, 25, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e5460d';
      ctx.beginPath(); ctx.ellipse(x, y + 1, 61, 19, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffad1c';
      ctx.beginPath(); ctx.ellipse(x, y - 1, 49 + pulse * 5, 13, 0, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 11; i++) {
        const a = i / 11 * Math.PI * 2;
        const rockX = x + Math.cos(a) * 78;
        const rockY = y + 6 + Math.sin(a) * 27;
        ctx.fillStyle = i % 2 ? '#594039' : '#76534a';
        ctx.beginPath(); ctx.ellipse(rockX, rockY, 17, 9, a, 0, Math.PI * 2); ctx.fill();
      }
      for (let i = 0; i < 5; i++) {
        const age = (this.time * (.9 + i * .12) + i * .37) % 1;
        const emberX = x + Math.sin(this.time * 2 + i * 8) * (15 + age * 46);
        const emberY = y - 13 - age * (64 + i * 9);
        ctx.globalAlpha = 1 - age;
        ctx.fillStyle = i % 2 ? '#ffdb67' : '#ff8025';
        ctx.beginPath(); ctx.arc(emberX, emberY, 1.5 + (1-age) * 2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      for (let i = 0; i < 4; i++) {
        const rise = (this.time * (.23 + i * .04) + i * .24) % 1;
        const smokeX = x + Math.sin(this.time * 1.3 + i * 3) * (14 + rise * 25);
        const smokeY = y - 40 - rise * 90;
        ctx.fillStyle = `rgba(70, 48, 43, ${.14 * (1-rise)})`;
        ctx.beginPath(); ctx.ellipse(smokeX, smokeY, 16 + rise * 17, 10 + rise * 13,
          -.25 + Math.sin(this.time + i) * .2, 0, Math.PI * 2); ctx.fill();
      }
      this.drawHellFlames(ctx, false);
      ctx.restore();
      return;
    }
    for (const mound of this.mounds) {
      const x = mound.x, y = mound.y, halfWidth = 43;
      ctx.fillStyle = 'rgba(55, 31, 16, .35)';
      ctx.beginPath(); ctx.ellipse(x + 8, y + 7, 55, 13, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#9c6030';
      ctx.beginPath(); ctx.ellipse(x, y + 3, 47, 11, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#38322d';
      ctx.beginPath();
      ctx.moveTo(x - halfWidth + 8, y - 6);
      ctx.lineTo(x - halfWidth + 8, y - 50);
      ctx.quadraticCurveTo(x + 8, y - 89, x + halfWidth + 8, y - 50);
      ctx.lineTo(x + halfWidth + 8, y + 1);
      ctx.lineTo(x + halfWidth, y - 6);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#696861';
      ctx.strokeStyle = '#383a38'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - halfWidth, y - 6);
      ctx.lineTo(x - halfWidth, y - 50);
      ctx.quadraticCurveTo(x, y - 91, x + halfWidth, y - 50);
      ctx.lineTo(x + halfWidth, y - 6);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#a5a39a'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - halfWidth + 5, y - 13);
      ctx.lineTo(x - halfWidth + 5, y - 49);
      ctx.quadraticCurveTo(x, y - 81, x + halfWidth - 5, y - 49);
      ctx.stroke();
      ctx.fillStyle = '#2b2b29';
      ctx.font = 'bold 16px serif';
      ctx.textAlign = 'center';
      ctx.fillText('RIP', x + 1, y - 59);
      ctx.fillStyle = '#f4eee0';
      ctx.fillText('RIP', x, y - 61);
      if (mound.name) {
        ctx.font = 'bold 10px sans-serif';
        ctx.fillStyle = '#f4eee0';
        ctx.fillText(mound.name, x, y - 37, 80);
      }
    }
    if (t >= this.walkEnd && t < this.buryEnd + .35) {
      const open = smooth((t - this.walkEnd) / .45);
      const close = 1 - smooth((t - this.buryEnd + .45) / .45);
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

  private drawHellFlames(ctx: CanvasRenderingContext2D, foreground: boolean) {
    const x = this.graveX, y = this.graveY;
    ctx.save();
    ctx.shadowColor = '#ff6a12';
    ctx.shadowBlur = foreground ? 14 : 22;
    for (let i = 0; i < 8; i++) {
      if ((i >= 4) !== foreground) continue;
      const px = x + (i - 3.5) * 17;
      const wave = Math.sin(this.time * (8 + i * .35) + i * 1.9);
      const height = 35 + (i % 3) * 16 + wave * 13;
      const baseY = y + (foreground ? 14 : -7);
      for (const [scale, color, alpha] of [[1, '#bb2d0b', .6], [.78, '#ff650d', .82], [.48, '#ffdd55', .94]] as const) {
        const h = height * scale;
        const half = 14 * scale;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(px - half, baseY);
        ctx.bezierCurveTo(px - half * 1.4, baseY - h * .35,
          px + wave * 5 - half * .25, baseY - h * .64, px + wave * 9, baseY - h);
        ctx.bezierCurveTo(px + wave * 12 + half * .3, baseY - h * .62,
          px + half * 1.25, baseY - h * .28, px + half, baseY);
        ctx.closePath(); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private drawSkeleton(ctx: CanvasRenderingContext2D, x: number, y: number, size = 1) {
    ctx.save(); ctx.translate(x, y); ctx.scale(size, size);
    ctx.strokeStyle = '#eee6d0'; ctx.fillStyle = '#e6dec8'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(0, -66, 13, 15, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#26110c';
    ctx.beginPath(); ctx.ellipse(-5, -68, 2.6, 4, 0, 0, Math.PI * 2);
    ctx.ellipse(5, -68, 2.6, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, -61); ctx.lineTo(-3, -56); ctx.lineTo(3, -56); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, -51); ctx.lineTo(0, -15);
    ctx.moveTo(-12, -47); ctx.lineTo(-24, -28);
    ctx.moveTo(12, -47); ctx.lineTo(24, -28);
    ctx.moveTo(0, -15); ctx.lineTo(-12, 6);
    ctx.moveTo(0, -15); ctx.lineTo(12, 6);
    for (let i = 0; i < 4; i++) {
      const ry = -46 + i * 7;
      ctx.moveTo(0, ry); ctx.quadraticCurveTo(-16, ry - 6, -13, ry + 4);
      ctx.moveTo(0, ry); ctx.quadraticCurveTo(16, ry - 6, 13, ry + 4);
    }
    ctx.stroke(); ctx.restore();
  }

  public drawForeground(ctx: CanvasRenderingContext2D, handX: number, handY: number) {
    if (this.mode === 'hell') {
      const latest = this.skeletons.at(-1);
      if (latest) this.drawSkeleton(ctx, latest.x, latest.y + 18, 1);
      this.drawHellFlames(ctx, true);
    }
    if (!this.target) return;
    const t = this.actionTime;
    if (this.ropeNodes.length) {
      const tetherY = t >= 1.05 ? this.target.y - 47 * this.target.scale : this.target.y - 52;
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = '#3f2414'; ctx.lineWidth = 5;
      ctx.beginPath();
      this.ropeNodes.forEach((node, index) => {
        if (index === 0) ctx.moveTo(node.x, node.y);
        else ctx.lineTo(node.x, node.y);
      });
      if (t >= 1.05) ctx.lineTo(this.target.x, tetherY);
      ctx.stroke();
      ctx.strokeStyle = '#b77936'; ctx.lineWidth = 1.2; ctx.stroke();
      if (t >= 1.05) {
        ctx.strokeStyle = '#5f3519'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.ellipse(this.target.x, tetherY, 24 * this.target.scale,
          10 * this.target.scale, -.15, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }
    if (t >= this.walkEnd && t < this.buryEnd) {
      const digging = t < this.digEnd;
      const swing = digging ? Math.sin((t - this.walkEnd) * Math.PI * 2 / .48) : Math.sin((t - this.digEnd) * 5) * .35;
      const bladeX = this.graveX + swing * 17;
      const bladeY = this.graveY + (digging ? 4 + Math.max(0, swing) * 14 : -8);
      const handleX = this.heroX - 20;
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
    if (t >= this.digEnd && t < this.buryEnd + .2) {
      ctx.save();
      ctx.fillStyle = '#b7793e';
      const cover = smooth((t - this.buryEnd + .35) / .55);
      ctx.globalAlpha = cover;
      ctx.beginPath(); ctx.ellipse(this.graveX, this.graveY + 1, 30 * cover, 12 * cover, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
}
