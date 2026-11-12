import { Zombie, ZombieType, BodyPart, SpitProjectile } from './types';
import { soundEngine } from './audio';
import { AtmosphereSystem } from './atmosphere';

const BOW_DURATION = 3;
const BOW_ANGLE = -1.1;

function bowAmount(z: Zombie): number {
  if (z.bowTimer <= 0) return 0;
  const elapsed = BOW_DURATION - z.bowTimer;
  return Math.min(1, elapsed / .55, z.bowTimer / .7);
}

export class ZombieManager {
  public zombies: Zombie[] = [];
  public spitProjectiles: SpitProjectile[] = [];
  private nextId: number = 1;
  private lastBassBeat = 0;
  private orbitPending = 0;

  public resetRhythm() {
    this.lastBassBeat = soundEngine.bassBeatCount;
    this.orbitPending = 0;
  }

  public spawnZombie(type: ZombieType, x: number, groundY: number): Zombie {
    const isBrute = type === 'BRUTE';
    const isCrawler = type === 'CRAWLER';
    const isSpitter = type === 'SPITTER';
    const isBoss = type === 'BOSS';

    let maxHealth = 70;
    let speed = 45;
    let scale = 1.0;
    let damage = 12;
    let armor = 0;

    if (isBrute) {
      maxHealth = 220;
      speed = 28;
      scale = 1.35;
      damage = 25;
      armor = 65; // reduces incoming non-chain damage
    } else if (isCrawler) {
      maxHealth = 45;
      speed = 65;
      scale = 0.85;
      damage = 10;
    } else if (isSpitter) {
      maxHealth = 60;
      speed = 35;
      scale = 0.95;
      damage = 15;
    } else if (isBoss) {
      maxHealth = 650;
      speed = 32;
      scale = 1.7;
      damage = 40;
      armor = 30;
    }

    const zombie: Zombie = {
      id: `zombie_${this.nextId++}`,
      type,
      x,
      y: groundY,
      vx: 0,
      vy: 0,
      scale,
      direction: -1, // moving left towards player
      speed,
      health: maxHealth,
      maxHealth,
      damage,
      armor,
      hasArmorPlates: isBrute,
      isStunned: false,
      stunTimer: 0,
      isBurning: false,
      burnTimer: 0,
      isAttacking: false,
      attackTimer: 0,
      walkCycle: Math.random() * Math.PI * 2,
      danceTempo: 3.8 + Math.random() * 1.1,
      staggerTimer: 0,
      staggerForce: 0,
      isDead: false,
      deathTimer: 0,
      decayAlpha: 1.0,

      head: { x: 0, y: -90, vx: 0, vy: 0, angle: 0, vAngle: 0, radius: 14, severed: false, health: 35, maxHealth: 35 },
      torso: { x: 0, y: -50, vx: 0, vy: 0, angle: 0, vAngle: 0, radius: 22, severed: false, health: maxHealth, maxHealth },
      leftArm: { x: -10, y: -55, vx: 0, vy: 0, angle: 0.3, vAngle: 0, radius: 8, severed: false, health: 25, maxHealth: 25 },
      rightArm: { x: 10, y: -55, vx: 0, vy: 0, angle: -0.3, vAngle: 0, radius: 8, severed: false, health: 25, maxHealth: 25 },
      leftLeg: { x: -6, y: -25, vx: 0, vy: 0, angle: 0, vAngle: 0, radius: 9, severed: isCrawler, health: 30, maxHealth: 30 },
      rightLeg: { x: 6, y: -25, vx: 0, vy: 0, angle: 0, vAngle: 0, radius: 9, severed: isCrawler, health: 30, maxHealth: 30 },

      slashMarks: [],
      speechCooldown: 0,
      danceTimer: 0,
      bowDelays: [],
      bowTimer: 0,
    };

    this.zombies.push(zombie);
    return zombie;
  }

  public update(
    dt: number,
    playerX: number,
    groundY: number,
    atmosphere: AtmosphereSystem,
    onPlayerHit: (damage: number) => void
  ) {
    const beats = Math.max(0, soundEngine.bassBeatCount - this.lastBassBeat);
    this.lastBassBeat = soundEngine.bassBeatCount;
    this.orbitPending += beats * .1;
    const orbitStep = Math.min(this.orbitPending, dt * .42);
    this.orbitPending -= orbitStep;
    const departed = new Set<Zombie>();
    // Each dancer owns a permanent ring slot. No attraction to the player's feet.
    for (const z of this.zombies) {
      z.confusedTimer = Math.max(0, (z.confusedTimer ?? 0) - dt);
      z.speechCooldown = Math.max(0, z.speechCooldown - dt);
      if (z.speechBubble) {
        z.speechBubble.timer -= dt;
        if (z.speechBubble.timer <= 0) z.speechBubble = undefined;
      }
      z.danceTimer = Math.max(0, z.danceTimer - dt);
      z.bowTimer = Math.max(0, z.bowTimer - dt);
      z.bowDelays = z.bowDelays.filter(delay => {
        if (delay > dt) return true;
        z.bowTimer = BOW_DURATION;
        return false;
      }).map(delay => delay - dt);
      // Keep dancing between bass hits; the music adds a brief burst of energy.
      z.walkCycle += dt * (z.danceTempo + soundEngine.bassPulse * 1.7) + beats * .08;
      if (z.formation) {
        z.formation.angle += orbitStep;
        const { angle, radiusX, radiusY } = z.formation;
        const dance = z.bowTimer <= 0 && z.blastAngle === undefined;
        const step = dance ? Math.sin(z.walkCycle) : 0;
        const confusion = z.confusedTimer > 0 ? Math.min(1, z.confusedTimer) : 0;
        const slotX = playerX + Math.cos(angle) * radiusX + step * 4 * z.scale
          + Math.sin(z.walkCycle * 3 + angle) * 15 * confusion;
        // Center the circle on the player's body, accounting for each sprite's height.
        const slotY = groundY - 55 + Math.sin(angle) * radiusY + 55 * z.scale
          - Math.abs(step) * 5 * z.scale + Math.cos(z.walkCycle * 2 + angle) * 5 * confusion;
        if (z.crowdMotion && z.crowdMotion.kind !== 'exit') {
          z.crowdMotion.elapsed += dt;
          const t = Math.min(1, z.crowdMotion.elapsed / z.crowdMotion.duration);
          const eased = t * t * (3 - 2 * t);
          z.x = z.crowdMotion.startX + (slotX - z.crowdMotion.startX) * eased;
          z.y = z.crowdMotion.startY + (slotY - z.crowdMotion.startY) * eased;
          if (t === 1) z.crowdMotion = undefined;
        } else if (!z.crowdMotion) { z.x = slotX; z.y = slotY; }
      }
      if (z.crowdMotion?.kind === 'exit') {
        const motion = z.crowdMotion;
        motion.elapsed += dt;
        const t = Math.min(1, motion.elapsed / motion.duration);
        const eased = t * t * (3 - 2 * t);
        z.x = motion.startX + (motion.endX! - motion.startX) * eased;
        z.y = motion.startY + (motion.endY! - motion.startY) * eased;
        if (t === 1) { z.crowdMotion = undefined; departed.add(z); }
      }
      z.direction = z.x < playerX ? 1 : -1;
    }
    if (departed.size) this.zombies = this.zombies.filter(z => !departed.has(z));
  }

  public killZombie(z: Zombie, atmosphere: AtmosphereSystem, explode: boolean = false) {
    if (z.isDead) return;
    z.isDead = true;
    soundEngine.playZombieDeath();

    if (explode) {
      atmosphere.addSonicCrack(z.x, z.y - 50 * z.scale, '#ea580c');
      atmosphere.addBloodSpray(z.x, z.y - 50 * z.scale, 0, -1, 35);
      atmosphere.addBloodDecal(z.x, z.y, 1.8);
      if (!z.head.severed) {
        atmosphere.spawnSeveredLimb(z.x, z.y - 80 * z.scale, 'head', z.type, z.scale);
        z.head.severed = true;
      }
      if (!z.leftArm.severed) {
        atmosphere.spawnSeveredLimb(z.x - 15, z.y - 50 * z.scale, 'arm', z.type, z.scale);
        z.leftArm.severed = true;
      }
      if (z.hasArmorPlates) {
        atmosphere.spawnSeveredLimb(z.x, z.y - 60 * z.scale, 'armor_chunk', z.type, z.scale);
        atmosphere.spawnSeveredLimb(z.x, z.y - 85 * z.scale, 'armor_chunk', z.type, z.scale);
      }
    } else {
      atmosphere.addBloodSpray(z.x, z.y - 40 * z.scale, -1, -0.5, 20);
      atmosphere.addBloodDecal(z.x, z.y, 1.2);
    }
  }

  public getHitTargets(z: Zombie) {
    const dancing = z.bowTimer <= 0;
    const bounce = dancing ? -Math.abs(Math.sin(z.walkCycle)) * 10 : 0;
    const tilt = dancing ? Math.sin(z.walkCycle * .5) * .16 : 0;
    const sway = z.bowTimer > 0 ? 0 : Math.abs(Math.sin(z.walkCycle) * (dancing ? 10 : 4));
    const bowAngle = BOW_ANGLE * bowAmount(z);
    return ([['head', -91, 17], ['torso', -55, 22], ['leg', -20, 18]] as const).map(([part, y, r]) => {
      const localY = y - sway;
      const upperY = part === 'leg' ? localY : -45 + Math.cos(bowAngle) * (localY + 45);
      const upperX = part === 'leg' ? 0 : Math.sin(bowAngle) * (localY + 45) * z.direction;
      return {
        part,
        x: z.x + (upperX - Math.sin(tilt) * upperY) * z.scale,
        y: z.y + (bounce + Math.cos(tilt) * upperY) * z.scale,
        r: r * z.scale,
      };
    });
  }

  private drawSleepingZombie(ctx: CanvasRenderingContext2D, z: Zombie) {
    ctx.save();
    ctx.globalAlpha = z.decayAlpha;
    ctx.translate(z.x, z.y);
    ctx.scale(-z.direction * z.scale, z.scale);
    ctx.fillStyle = 'rgba(55, 32, 16, .24)';
    ctx.beginPath(); ctx.ellipse(0, 2, 67, 9, 0, 0, Math.PI * 2); ctx.fill();

    // The body rests along the sand, with the head, hem and arms in one low silhouette.
    ctx.fillStyle = '#121316'; ctx.strokeStyle = '#35383e'; ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-49, -6);
    ctx.quadraticCurveTo(-47, -21, -20, -24);
    ctx.quadraticCurveTo(5, -30, 31, -22);
    ctx.quadraticCurveTo(43, -17, 39, -8);
    ctx.lineTo(19, -4); ctx.lineTo(-2, -8); ctx.lineTo(-27, -3);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#303238'; ctx.lineWidth = 2;
    for (const offset of [-14, -2, 10]) {
      ctx.beginPath(); ctx.moveTo(offset - 13, -20);
      ctx.quadraticCurveTo(offset, -12, offset + 8, -8); ctx.stroke();
    }
    ctx.strokeStyle = '#17181c'; ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(10, -18); ctx.lineTo(25, -5); ctx.lineTo(43, -7); ctx.stroke();
    ctx.strokeStyle = '#838578'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(40, -7); ctx.lineTo(46, -7); ctx.stroke();
    ctx.fillStyle = '#0d0e11'; ctx.strokeStyle = '#34373d'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(45, -22, 18, 14, -.18, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(46, -24); ctx.lineTo(53, -25); ctx.stroke();
    ctx.strokeStyle = '#25262b'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(-42, -9); ctx.lineTo(-55, -7);
    ctx.moveTo(-36, -4); ctx.lineTo(-51, -2); ctx.stroke();
    ctx.restore();
  }

  public drawZombies(ctx: CanvasRenderingContext2D, groundY: number, layer: 'back' | 'front' = 'back') {
    for (const z of [...this.zombies].sort((a,b) => a.y-b.y)) {
      if (z.buried) continue;
      if ((layer === 'back') !== (z.y <= groundY)) continue;
      ctx.save();
      if (z.burialClipY !== undefined) {
        ctx.beginPath(); ctx.rect(-10000, -10000, 20000, z.burialClipY + 10000);
        ctx.clip();
      }
      if (z.blastSleep) {
        this.drawSleepingZombie(ctx, z);
        ctx.restore();
        continue;
      }
      const running = z.burialFleeing === true;
      const dancing = !running && z.bowTimer <= 0 && (z.blastAngle === undefined || (z.blastDelay ?? 0) > 0);
      const dragged = z.burialDragging === true;
      const flying = z.blastAngle !== undefined && z.vy !== 0 && (z.blastDelay ?? 0) <= 0;
      const bow = bowAmount(z);
      const crawler = z.leftLeg.severed || z.rightLeg.severed || z.type === 'CRAWLER';
      const sway = z.bowTimer > 0 ? 0 : Math.sin(z.walkCycle) * (dancing ? 13 : running ? 7 : dragged ? 5 : 4);
      const eye = z.isBurning ? '#fb923c' : z.type === 'BOSS' ? '#ef4444' : z.type === 'SPITTER' ? '#a3e635' : '#e2e8f0';
      if (z.blastGroundY !== undefined) {
        const height = Math.max(0, z.blastGroundY - z.y);
        ctx.save(); ctx.globalAlpha = .2 / (1 + height / 130);
        ctx.fillStyle = '#2b190d'; ctx.beginPath();
        ctx.ellipse(z.x, z.blastGroundY + 3, 28 * z.scale + height * .06, 7 * z.scale, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.restore();
      }
      ctx.save(); ctx.globalAlpha = z.decayAlpha;
      ctx.translate(z.x, z.y); ctx.scale(z.scale, z.scale);
      if (z.blastAngle !== undefined && (z.blastDelay ?? 0) <= 0) {
        const squash = z.blastImpact ?? 0;
        ctx.translate(0, -47); ctx.rotate(z.blastAngle);
        ctx.scale(1 + squash * .16, 1 - squash * .24);
        ctx.translate(0, 47);
      } else if (dancing) {
        ctx.translate(0, -Math.abs(Math.sin(z.walkCycle)) * 12);
        ctx.rotate(Math.sin(z.walkCycle * .5) * .2);
      }
      ctx.scale(-z.direction, 1);
      if (z.blastGroundY === undefined) {
        ctx.fillStyle = 'rgba(69,39,18,.25)'; ctx.beginPath();
        ctx.ellipse(8, 0, 32, 7, 0, 0, Math.PI * 2); ctx.fill();
      }
      if (crawler) { ctx.translate(-5, -8); ctx.rotate(-1.12); ctx.scale(.85, .75); }
      ctx.translate(0, -Math.abs(sway));
      if (bow > 0) {
        // The legs stay planted while the shoulders and head pivot at the waist.
        ctx.fillStyle = '#121316'; ctx.strokeStyle = '#35383e'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(-18,-52); ctx.quadraticCurveTo(-24,-30,-27+sway,-4);
        ctx.lineTo(-12,-1); ctx.lineTo(-3,-5); ctx.lineTo(8,0); ctx.lineTo(27+sway,-4);
        ctx.quadraticCurveTo(24,-30,18,-52); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.translate(0,-45); ctx.rotate(BOW_ANGLE * bow); ctx.translate(0,45);
      }
      // Full black draped robe; all enemy types share the requested costume.
      ctx.fillStyle = '#121316'; ctx.strokeStyle = '#35383e'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-12,-85);
      ctx.quadraticCurveTo(-22,-53,bow > 0 ? -18 : -27+sway,bow > 0 ? -45 : -4);
      if (bow > 0) ctx.lineTo(18,-45);
      else { ctx.lineTo(-12,-1); ctx.lineTo(-3,-5); ctx.lineTo(8,0); ctx.lineTo(27+sway,-4); }
      ctx.quadraticCurveTo(23,-52,13,-85); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#303238'; ctx.lineWidth = 2;
      for (const x of [-12,0,12]) {
        ctx.beginPath(); ctx.moveTo(x*.6,-68); ctx.quadraticCurveTo(x,-34,x*1.5+sway,-8); ctx.stroke();
      }
      if (z.hasArmorPlates) { ctx.strokeStyle='#62666c'; ctx.strokeRect(-13,-71,26,24); }
      for (const [part, offset] of [[z.leftArm, 8], [z.rightArm, -8]] as const) {
        if (part.severed) continue;
        const armSide = offset < 0 ? -1 : 1;
        const flail = flying ? Math.sin((z.blastFlail ?? 0) + armSide * 1.5) * 12 : 0;
        const elbowX = flying ? armSide * (30 + flail * .35) : bow > 0 ? armSide * 14 : dancing ? armSide * 27 : dragged || running ? armSide * 20 : -25;
        const elbowY = flying ? -50 - flail : bow > 0 ? -55 : dancing ? -68 + sway : dragged || running ? -52 + sway : -57 + sway;
        const handX = flying ? armSide * (40 + flail * .6) : bow > 0 ? armSide * 10 : dancing ? armSide * 36 : dragged || running ? armSide * 30 : -35;
        const handY = flying ? -42 - flail * 1.4 : bow > 0 ? -43 : dancing ? -80 + sway : dragged || running ? -45 + sway : -61 + sway;
        ctx.strokeStyle='#17181c'; ctx.lineWidth=11; ctx.lineCap='round';
        ctx.beginPath(); ctx.moveTo(offset,-69);
        ctx.lineTo(elbowX, elbowY);
        ctx.lineTo(handX, handY); ctx.stroke();
        ctx.strokeStyle='#838578'; ctx.lineWidth=5;
        ctx.beginPath(); ctx.moveTo(handX, handY);
        ctx.lineTo(flying ? handX + armSide * 7 : bow > 0 ? armSide*10 : dancing ? armSide*43 : dragged || running ? handX+armSide*7 : -42,
          flying ? handY + 5 : bow > 0 ? -39 : dancing ? -79+sway : dragged || running ? handY+4 : -60+sway); ctx.stroke();
      }
      if (!z.head.severed) {
        ctx.fillStyle='#0d0e11'; ctx.beginPath(); ctx.ellipse(0,-91,17,23,0,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle='#34373d'; ctx.lineWidth=1.5; ctx.stroke();
        ctx.fillStyle='#25272a'; ctx.fillRect(-12,-96,24,6);
        ctx.fillStyle=eye; ctx.shadowColor=eye; ctx.shadowBlur=5;
        ctx.fillRect(-9,-94,5,2); ctx.fillRect(3,-94,5,2); ctx.shadowBlur=0;
        ctx.fillStyle='#15161a'; ctx.beginPath(); ctx.moveTo(-16,-87); ctx.lineTo(16,-87);
        ctx.lineTo(22,-64); ctx.lineTo(0,-57); ctx.lineTo(-22,-64); ctx.closePath(); ctx.fill();
      }
      if (dancing || flying || dragged || running) {
        ctx.strokeStyle = '#25262b'; ctx.lineWidth = 7;
        const legPhase = flying ? z.blastFlail ?? 0 : z.walkCycle;
        ctx.beginPath(); ctx.moveTo(-9,-5); ctx.lineTo(-15 + Math.sin(legPhase)*14,6);
        ctx.moveTo(9,-5); ctx.lineTo(15 - Math.sin(legPhase)*14,6); ctx.stroke();
      }
      if (dancing) {
        ctx.scale(-z.direction,1);
        ctx.fillStyle='#fbbf24'; ctx.font='bold 21px sans-serif';
        ctx.fillText('♪', 22, -116 + Math.sin(z.walkCycle)*5);
      }
      ctx.restore();
      if (z.viewerName) {
        const label = z.viewerName;
        const labelY = z.y - 117 * z.scale;
        ctx.font = 'bold 12px sans-serif';
        const labelWidth = Math.min(160, ctx.measureText(label).width + 16);
        ctx.fillStyle = 'rgba(12, 14, 18, .85)';
        ctx.beginPath();
        ctx.roundRect(z.x - labelWidth / 2, labelY - 16, labelWidth, 20, 7);
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff7ed';
        ctx.fillText(label, z.x, labelY - 6, labelWidth - 10);
        if (z.favorite) {
          ctx.fillStyle = '#fb7185';
          ctx.font = 'bold 20px sans-serif';
          ctx.fillText('♥', z.x, labelY - 27);
        }
      }
      if ((z.confusedTimer ?? 0) > 0) {
        ctx.textAlign = 'center';
        ctx.font = 'bold 24px sans-serif';
        ctx.fillStyle = '#facc15';
        ctx.fillText('?', z.x + Math.sin(z.walkCycle * 4) * 10, z.y - 137 * z.scale);
      }
      ctx.restore();

    }
    for (const spit of this.spitProjectiles) {
      ctx.save(); ctx.fillStyle='#84cc16'; ctx.beginPath();
      ctx.arc(spit.x,spit.y,spit.radius,0,Math.PI*2); ctx.fill(); ctx.restore();
    }
  }
}
