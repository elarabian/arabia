import { BloodDecal, Particle, Shockwave, SeveredLimb, ZombieType } from './types';
import { soundEngine } from './audio';

export function backgroundImageRect(width: number, height: number, groundY: number) {
  const overscan = 32;
  const imageHeight = Math.max(height + overscan * 2,
    (groundY + overscan) / .7, (height - groundY + overscan) / .3);
  return { x: -overscan, y: groundY - imageHeight * .7,
    width: width + overscan * 2, height: imageHeight };
}

export class AtmosphereSystem {
  public particles: Particle[] = [];
  public bloodDecals: BloodDecal[] = [];
  public shockwaves: Shockwave[] = [];
  public severedLimbs: SeveredLimb[] = [];
  
  // Lighting and weather
  public lightningFlash: number = 0;
  public lightningNextTime: number = 5 + Math.random() * 8;
  public rainDropCount: number = 140;
  public raindrops: { x: number; y: number; speed: number; len: number }[] = [];
  public puddles: { x: number; y: number; r: number; maxR: number; alpha: number }[] = [];
  
  // Fog layers
  public fogOffset1: number = 0;
  public fogOffset2: number = 0;

  // Screen shake
  public screenShakeIntensity: number = 0;
  public shakeOffsetX: number = 0;
  public shakeOffsetY: number = 0;

  constructor() {
    this.initRain();
  }

  private initRain() {
    this.raindrops = [];
    for (let i = 0; i < this.rainDropCount; i++) {
      this.raindrops.push({
        x: Math.random() * 2000,
        y: Math.random() * 1000,
        speed: 600 + Math.random() * 400,
        len: 12 + Math.random() * 10,
      });
    }
  }

  public triggerScreenShake(amount: number) {
    this.screenShakeIntensity = Math.min(25, this.screenShakeIntensity + amount);
  }

  public addBloodDecal(x: number, y: number, intensity: number = 1.0) {
    if (this.bloodDecals.length > 80) {
      this.bloodDecals.shift();
    }
    const splatters: { ox: number; oy: number; r: number }[] = [];
    const count = 3 + Math.floor(Math.random() * 6 * intensity);
    for (let i = 0; i < count; i++) {
      splatters.push({
        ox: (Math.random() - 0.5) * 50 * intensity,
        oy: (Math.random() - 0.5) * 18 * intensity,
        r: 3 + Math.random() * 7 * intensity,
      });
    }

    const bloodHues = ['#450a0a', '#7f1d1d', '#991b1b', '#3b0707'];
    this.bloodDecals.push({
      x,
      y,
      radius: 12 + Math.random() * 16 * intensity,
      alpha: 0.85,
      color: bloodHues[Math.floor(Math.random() * bloodHues.length)],
      splatters,
    });
  }

  public addBloodSpray(x: number, y: number, dirX: number, dirY: number, count: number = 18) {
    for (let i = 0; i < count; i++) {
      const spreadAngle = (Math.random() - 0.5) * 1.2;
      const cos = Math.cos(spreadAngle);
      const sin = Math.sin(spreadAngle);
      const vx = (dirX * cos - dirY * sin) * (180 + Math.random() * 320);
      const vy = (dirX * sin + dirY * cos) * (180 + Math.random() * 320) - 80;

      const colors = ['#991b1b', '#b91c1c', '#7f1d1d', '#450a0a'];
      this.particles.push({
        x,
        y,
        vx,
        vy,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 2 + Math.random() * 4,
        alpha: 0.95,
        decay: 0.8 + Math.random() * 0.6,
        gravity: 600,
      });
    }
  }

  public addSparks(x: number, y: number, color: string = '#fbbf24', count: number = 12) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 120 + Math.random() * 260;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        size: 1.5 + Math.random() * 2.5,
        alpha: 1.0,
        decay: 1.8 + Math.random() * 1.2,
        gravity: 400,
        spark: true,
      });
    }
  }

  public addRunDust(x: number, y: number, scale: number) {
    for (let i = 0; i < 3; i++) {
      this.particles.push({
        x: x + (Math.random() - .5) * 12 * scale,
        y: y + Math.random() * 3,
        vx: 30 + Math.random() * 40,
        vy: -15 - Math.random() * 30,
        color: i === 0 ? '#e9b76f' : '#ba7b3b',
        size: (2 + Math.random() * 3) * scale,
        alpha: .5,
        decay: 1.7,
        gravity: 45,
      });
    }
  }

  public addExplosionBurst(x: number, y: number, scale: number) {
    const colors = ['#fff7d6', '#fbbf24', '#fb923c', '#c2410c'];
    for (let i = 0; i < 100; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (150 + Math.random() * 280) * scale;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * .7 - 40 * scale,
        color: colors[i % colors.length],
        size: (1.5 + Math.random() * 3.5) * Math.sqrt(scale),
        alpha: 1,
        decay: 1.4 + Math.random() * .9,
        gravity: 320 * scale,
        spark: true,
      });
    }
  }

  public addImpactDust(x: number, y: number, scale: number, speed: number) {
    const count = Math.min(16, Math.max(7, Math.round(speed / 55)));
    for (let i = 0; i < count; i++) {
      const side = i % 2 ? 1 : -1;
      this.particles.push({
        x: x + side * 12 * scale,
        y: y - 3,
        vx: side * (35 + Math.random() * 95) * scale,
        vy: -20 - Math.random() * 55,
        color: i % 3 ? '#d49a54' : '#f0c485',
        size: (2 + Math.random() * 4) * scale,
        alpha: .65,
        decay: 1.15 + Math.random() * .45,
        gravity: 85,
      });
    }
  }

  public addFireParticles(x: number, y: number, count: number = 8) {
    for (let i = 0; i < count; i++) {
      const colors = ['#ea580c', '#f97316', '#fbbf24', '#dc2626'];
      this.particles.push({
        x: x + (Math.random() - 0.5) * 20,
        y: y + (Math.random() - 0.5) * 20,
        vx: (Math.random() - 0.5) * 60,
        vy: -40 - Math.random() * 80,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 3 + Math.random() * 5,
        alpha: 0.85,
        decay: 1.5 + Math.random() * 0.8,
        gravity: -100, // rise up
        fire: true,
      });
    }
  }

  public addSonicCrack(x: number, y: number, color: string = '#f8fafc') {
    this.shockwaves.push({
      x,
      y,
      radius: 5,
      maxRadius: 85,
      alpha: 1.0,
      color,
      isSonicCrack: true,
    });
    this.addSparks(x, y, '#ffffff', 18);
    this.triggerScreenShake(7);
  }

  public spawnSeveredLimb(x: number, y: number, partType: 'head' | 'arm' | 'leg' | 'armor_chunk', type: ZombieType, scale: number) {
    const angle = (Math.random() - 0.5) * 1.5;
    const speed = 180 + Math.random() * 260;
    this.severedLimbs.push({
      x,
      y,
      vx: Math.sin(angle) * speed,
      vy: -150 - Math.random() * 220,
      angle: Math.random() * Math.PI * 2,
      vAngle: (Math.random() - 0.5) * 14,
      partType,
      type,
      lifetime: 8.0,
      scale,
    });
  }

  public update(dt: number, width: number, height: number, rainEnabled: boolean = true, dynamicGroundY?: number) {
    const groundY = dynamicGroundY ?? height - 45;

    // Screen shake decay
    if (this.screenShakeIntensity > 0) {
      this.shakeOffsetX = (Math.random() - 0.5) * this.screenShakeIntensity * 2;
      this.shakeOffsetY = (Math.random() - 0.5) * this.screenShakeIntensity * 2;
      this.screenShakeIntensity = Math.max(0, this.screenShakeIntensity - dt * 25);
    } else {
      this.shakeOffsetX = 0;
      this.shakeOffsetY = 0;
    }

    // Lightning timer
    this.lightningNextTime -= dt;
    if (rainEnabled && this.lightningNextTime <= 0) {
      this.lightningFlash = 1.0;
      this.lightningNextTime = 6 + Math.random() * 12;
      soundEngine.playThunder();
      this.triggerScreenShake(4);
    }
    if (this.lightningFlash > 0) {
      this.lightningFlash = Math.max(0, this.lightningFlash - dt * 2.8);
    }

    // Fog animation
    this.fogOffset1 = (this.fogOffset1 + dt * 18) % width;
    this.fogOffset2 = (this.fogOffset2 - dt * 12 + width) % width;

    // Rain simulation
    if (rainEnabled) {
      for (const drop of this.raindrops) {
        drop.y += drop.speed * dt;
        drop.x -= 120 * dt; // wind slant
        if (drop.y > groundY - 5) {
          drop.y = -20;
          drop.x = Math.random() * (width + 300);
          // ripple chance
          if (Math.random() < 0.12) {
            this.puddles.push({
              x: drop.x,
              y: groundY + Math.random() * 20,
              r: 1,
              maxR: 8 + Math.random() * 10,
              alpha: 0.6,
            });
          }
        }
      }
    }

    // Puddles / ripples
    for (let i = this.puddles.length - 1; i >= 0; i--) {
      const p = this.puddles[i];
      p.r += dt * 24;
      p.alpha -= dt * 1.8;
      if (p.alpha <= 0 || p.r >= p.maxR) {
        this.puddles.splice(i, 1);
      }
    }

    // Particles update
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.alpha -= p.decay * dt;

      // Stick blood to ground
      if (!p.spark && !p.fire && p.y >= groundY - 5 && p.vy > 0) {
        p.vy = 0;
        p.vx *= 0.5;
        if (Math.random() < 0.25) {
          this.addBloodDecal(p.x, groundY + 5, 0.4);
        }
      }

      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // Shockwaves
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i];
      s.radius += dt * 260;
      s.alpha -= dt * 2.5;
      if (s.alpha <= 0 || s.radius >= s.maxRadius) {
        this.shockwaves.splice(i, 1);
      }
    }

    // Severed limbs physics
    for (let i = this.severedLimbs.length - 1; i >= 0; i--) {
      const limb = this.severedLimbs[i];
      limb.x += limb.vx * dt;
      limb.y += limb.vy * dt;
      limb.vy += 700 * dt; // gravity
      limb.angle += limb.vAngle * dt;
      limb.lifetime -= dt;

      // Bounce on ground
      if (limb.y >= groundY) {
        limb.y = groundY;
        limb.vy = -limb.vy * 0.35;
        limb.vx *= 0.65;
        limb.vAngle *= 0.5;

        // Leave blood splatter on bounce
        if (Math.abs(limb.vy) > 30) {
          this.addBloodDecal(limb.x, groundY + 5, 0.6);
        }
      }

      if (limb.lifetime <= 0) {
        this.severedLimbs.splice(i, 1);
      }
    }
  }

  public drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number,
    bgImage: HTMLImageElement | null, customGroundY?: number,
    camera?: { x: number; y: number }) {
    ctx.save();

    const groundY = customGroundY ?? height - 55;
    const overscan = 32; // Covers the largest camera shake without exposing the canvas edge.
    if (bgImage && bgImage.complete && bgImage.naturalWidth > 0) {
      // Anchor the flat sand at the gameplay baseline in both mobile and desktop modes.
      const rect = backgroundImageRect(width, height, groundY);
      if (!camera) ctx.drawImage(bgImage, rect.x, rect.y, rect.width, rect.height);
      else {
        // The mountain layer moves less than the nearby sand. Feather the seam
        // between them and mirror tiles so travel never exposes an empty edge.
        const drawLayer = (factor: number, top: number, bottom: number, alpha = 1) => {
          const shiftedX = rect.x - camera.x * factor;
          const shiftedY = rect.y - camera.y * factor * .2;
          const firstTile = Math.floor((-overscan - shiftedX) / rect.width) - 1;
          const lastTile = Math.ceil((width + overscan - shiftedX) / rect.width) + 1;
          ctx.save();
          ctx.beginPath(); ctx.rect(-overscan, top, width + overscan * 2, bottom - top); ctx.clip();
          ctx.globalAlpha = alpha;
          for (let tile = firstTile; tile <= lastTile; tile++) {
            const tileX = shiftedX + tile * rect.width;
            if (tileX > width + overscan || tileX + rect.width < -overscan) continue;
            ctx.save();
            if (tile % 2) {
              ctx.translate(tileX + rect.width, 0);
              ctx.scale(-1, 1);
              ctx.drawImage(bgImage, 0, shiftedY, rect.width, rect.height);
            } else {
              ctx.drawImage(bgImage, tileX, shiftedY, rect.width, rect.height);
            }
            ctx.restore();
          }
          ctx.restore();
        };
        drawLayer(.18, -overscan, height + overscan);
        const transitionTop = groundY * .78;
        const transitionHeight = 80;
        for (let i = 0; i < 4; i++) {
          const top = transitionTop + i * transitionHeight / 4;
          drawLayer(.72, top, top + transitionHeight / 4, (i + .5) / 4);
        }
        drawLayer(.72, transitionTop + transitionHeight, height + overscan);
      }
    } else {
      const sky = ctx.createLinearGradient(0, 0, 0, height);
      sky.addColorStop(0, '#379ee6'); sky.addColorStop(0.55, '#c5eaff');
      sky.addColorStop(0.56, '#efbb69'); sky.addColorStop(1, '#d99b49');
      ctx.fillStyle = sky; ctx.fillRect(-overscan, -overscan,
        width + overscan * 2, height + overscan * 2);
      ctx.fillStyle = '#fff8cc'; ctx.beginPath();
      ctx.arc(width * 0.8, height * 0.14, 38, 0, Math.PI * 2); ctx.fill();
    }

    // 4. Blood Decals on Ground
    for (const decal of this.bloodDecals) {
      ctx.save();
      ctx.fillStyle = decal.color;
      ctx.globalAlpha = decal.alpha;
      ctx.beginPath();
      ctx.ellipse(decal.x, decal.y, decal.radius * 1.5, decal.radius * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();

      for (const sp of decal.splatters) {
        ctx.beginPath();
        ctx.ellipse(decal.x + sp.ox, decal.y + sp.oy, sp.r * 1.4, sp.r * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.restore();
  }

  public drawSeveredLimbs(ctx: CanvasRenderingContext2D) {
    ctx.save();
    for (const limb of this.severedLimbs) {
      ctx.save();
      ctx.translate(limb.x, limb.y);
      ctx.rotate(limb.angle);
      ctx.scale(limb.scale, limb.scale);

      if (limb.partType === 'head') {
        // Severed Arabian head
        ctx.fillStyle = '#57534e';
        ctx.beginPath();
        ctx.arc(0, 0, 13, 0, Math.PI * 2);
        ctx.fill();

        if (limb.type === 'BRUTE') {
          // Pointed Saracen helmet
          ctx.fillStyle = '#334155';
          ctx.beginPath();
          ctx.moveTo(-13, 0);
          ctx.lineTo(13, 0);
          ctx.lineTo(0, -22);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#d97706';
          ctx.fillRect(-2, -26, 4, 6);
        } else {
          // Wrapped red shemagh with black agal
          ctx.fillStyle = '#b91c1c';
          ctx.beginPath();
          ctx.ellipse(0, -6, 14, 10, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#18181b';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.ellipse(0, -6, 13, 3.5, 0, 0, Math.PI * 2);
          ctx.stroke();
          // Trailing cloth flap
          ctx.fillStyle = '#991b1b';
          ctx.beginPath();
          ctx.moveTo(8, -4);
          ctx.lineTo(18, 4);
          ctx.lineTo(12, 10);
          ctx.closePath();
          ctx.fill();
        }

        // Bloody severed neck stump
        ctx.fillStyle = '#991b1b';
        ctx.fillRect(-6, 9, 12, 6);
        // Decayed eye
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(4, 2, 2.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (limb.partType === 'arm') {
        // Severed rotting arm with desert thobe cloth
        ctx.fillStyle = '#d6c7a1'; // Thobe sleeve
        ctx.fillRect(-5, -16, 10, 18);
        ctx.fillStyle = '#44403c'; // Forearm
        ctx.fillRect(-4, 0, 8, 16);
        // Claws
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(-5, 14, 3, 4);
        ctx.fillRect(-1, 14, 3, 4);
        // Blood socket
        ctx.fillStyle = '#991b1b';
        ctx.fillRect(-5, -18, 10, 5);
      } else if (limb.partType === 'leg') {
        // Severed leg with decayed robe hem & sandal
        ctx.fillStyle = '#44403c';
        ctx.fillRect(-5, -20, 10, 36);
        ctx.fillStyle = '#78350f'; // Leather sandal
        ctx.fillRect(-6, 14, 12, 5);
        ctx.fillStyle = '#991b1b';
        ctx.fillRect(-5, -22, 10, 6);
      } else if (limb.partType === 'armor_chunk') {
        // Saracen damascene plate chunk with brass rim
        ctx.fillStyle = '#475569';
        ctx.beginPath();
        ctx.moveTo(-12, -8);
        ctx.lineTo(10, -12);
        ctx.lineTo(14, 10);
        ctx.lineTo(-8, 12);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      ctx.restore();
    }
    ctx.restore();
  }

  public drawForegroundEffects(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    playerX: number,
    playerY: number,
    rainEnabled: boolean = true,
    customGroundY?: number
  ) {
    ctx.save();

    // 1. Dynamic Lantern / Torch light on Hunter
    const lanternGrad = ctx.createRadialGradient(playerX, playerY, 15, playerX, playerY, 320);
    lanternGrad.addColorStop(0, 'rgba(251, 191, 36, 0.18)');
    lanternGrad.addColorStop(0.5, 'rgba(217, 119, 6, 0.08)');
    lanternGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = lanternGrad;
    ctx.fillRect(0, 0, width, height);

    // 2. Rolling Ground Fog (aligned to dynamic groundY)
    const groundY = (customGroundY ?? height - 55) - 25;
    const fogGrad = ctx.createLinearGradient(0, groundY - 35, 0, (customGroundY ?? height - 55) + 30);
    fogGrad.addColorStop(0, 'rgba(235, 188, 114, 0)');
    fogGrad.addColorStop(0.5, 'rgba(235, 188, 114, 0.04)');
    fogGrad.addColorStop(1, 'rgba(220, 166, 94, 0.06)');
    ctx.fillStyle = fogGrad;
    ctx.fillRect(0, groundY - 35, width, 70);

    // 3. Shockwave rings
    for (const s of this.shockwaves) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.strokeStyle = s.color;
      ctx.globalAlpha = s.alpha;
      ctx.lineWidth = s.isSonicCrack ? 4 : 2;
      ctx.stroke();

      if (s.isSonicCrack) {
        // Inner flash core
        ctx.fillStyle = 'rgba(255, 255, 255, ' + s.alpha * 0.4 + ')';
        ctx.fill();
      }
      ctx.restore();
    }

    // 4. Particles (Blood, Sparks, Fire)
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;

      if (p.spark) {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.fire) {
        ctx.shadowColor = '#f97316';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 5. Rain Slanted Streaks & Puddle Ripples
    if (rainEnabled) {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (const drop of this.raindrops) {
        ctx.moveTo(drop.x, drop.y);
        ctx.lineTo(drop.x - 4, drop.y + drop.len);
      }
      ctx.stroke();

      // Ripples
      for (const p of this.puddles) {
        ctx.save();
        ctx.strokeStyle = `rgba(186, 230, 253, ${p.alpha * 0.4})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.r * 1.8, p.r * 0.6, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    ctx.restore();
  }
}
