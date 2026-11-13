export type WorldMap = 'DESERT' | 'GRAVEYARD' | 'ISTANBUL' | 'IRAN' | 'ISRAEL' | 'HELL' | 'HEAVEN';

export const WORLD_MAPS: { id: WorldMap; label: string; icon: string }[] = [
  { id: 'DESERT', label: 'Arap Çölü', icon: '🏜️' },
  { id: 'GRAVEYARD', label: 'Gotik Mezarlık', icon: '⚰️' },
  { id: 'ISTANBUL', label: 'İstanbul Boğazı', icon: '🌉' },
  { id: 'IRAN', label: 'İran', icon: '🏔️' },
  { id: 'ISRAEL', label: 'İsrail', icon: '🌊' },
  { id: 'HELL', label: 'Cehennem', icon: '🔥' },
  { id: 'HEAVEN', label: 'Cennet', icon: '🌸' },
];

export function isWorldMap(value: unknown): value is WorldMap {
  return WORLD_MAPS.some(map => map.id === value);
}

function wave(ctx: CanvasRenderingContext2D, width: number, y: number,
  time: number, offset: number, alpha: number) {
  ctx.strokeStyle = `rgba(230,250,255,${alpha})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let x = -20; x <= width + 20; x += 12) {
    const yy = y + Math.sin(x * .033 + time * 2.3 + offset) * 2.3;
    if (x === -20) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
  }
  ctx.stroke();
}

export function drawWorldMapMotion(ctx: CanvasRenderingContext2D, map: WorldMap,
  width: number, groundY: number, time: number, pulse: number, impactX: number) {
  if (map === 'DESERT' || map === 'GRAVEYARD') return;
  ctx.save();
  if (map === 'ISTANBUL' || map === 'ISRAEL') {
    if (map === 'ISTANBUL') for (let row = 0; row < 5; row++) {
      wave(ctx, width, groundY - 192 + row * 11, time, row * 1.9,
        .15 + row * .015);
    }
    if (pulse > 0) {
      ctx.globalAlpha = pulse * .7;
      ctx.strokeStyle = '#d9ffff'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(impactX, map === 'ISTANBUL' ? groundY - 155 : groundY + 1,
        12 + (1 - pulse) * 105, 3 + (1 - pulse) * 12, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (map === 'ISTANBUL') {
      const span = width + 150;
      const ferryX = ((time * 23) % span) - 75;
      const ferryY = groundY - 183 + Math.sin(time * 2) * 2;
      ctx.fillStyle = 'rgba(244,235,210,.78)';
      ctx.beginPath(); ctx.moveTo(ferryX - 27, ferryY);
      ctx.lineTo(ferryX + 31, ferryY); ctx.lineTo(ferryX + 20, ferryY + 10);
      ctx.lineTo(ferryX - 18, ferryY + 10); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(50,72,86,.8)';
      ctx.fillRect(ferryX - 16, ferryY - 14, 29, 14);
      ctx.fillStyle = '#f6db9a';
      for (let i = 0; i < 3; i++) ctx.fillRect(ferryX - 11 + i * 9, ferryY - 10, 5, 4);
      ctx.strokeStyle = 'rgba(232,251,255,.58)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ferryX - 31, ferryY + 6);
      ctx.lineTo(ferryX - 52, ferryY + 3 + Math.sin(time * 8) * 2); ctx.stroke();
    } else {
      for (let i = 0; i < 3; i++) {
        const x = ((time * (13 + i * 4) + i * width * .38) % (width + 80)) - 40;
        const y = groundY - 286 - i * 20 + Math.sin(time * 2 + i) * 5;
        ctx.strokeStyle = 'rgba(255,248,225,.54)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x - 8, y - 2);
        ctx.quadraticCurveTo(x - 3, y - 7, x, y);
        ctx.quadraticCurveTo(x + 4, y - 7, x + 9, y - 2); ctx.stroke();
      }
      for (let i = 0; i < 12; i++) {
        const x = ((i * 57 + time * (18 + i % 3 * 6)) % (width + 70)) - 35;
        const y = groundY - 180 + ((i * 73 + time * 11) % 235);
        ctx.fillStyle = `rgba(245,111,155,${.15 + .1 * Math.sin(time * 2 + i) ** 2})`;
        ctx.beginPath(); ctx.ellipse(x, y, 2.5, 1.5, time + i, 0, Math.PI * 2); ctx.fill();
      }
    }
  } else if (map === 'HELL') {
    // Flame tongues stay at the edges; the middle remains readable for viewers.
    for (const side of [-1, 1]) for (let i = 0; i < 8; i++) {
      const x = side < 0 ? i * 9 - 15 : width - i * 9 + 15;
      const y = groundY + 58 + Math.sin(i * 2.1) * 36;
      const sway = Math.sin(time * 3.4 + i * 1.7 + side) * 10;
      const height = 38 + Math.sin(time * 4 + i) * 13 + i % 3 * 17;
      const firelight = ctx.createRadialGradient(x, y - height * .3, 2,
        x, y - height * .3, height * .8);
      firelight.addColorStop(0, 'rgba(255,149,35,.18)');
      firelight.addColorStop(.5, 'rgba(239,54,16,.09)');
      firelight.addColorStop(1, 'rgba(239,54,16,0)');
      ctx.fillStyle = firelight;
      ctx.beginPath();ctx.moveTo(x - 14, y);
      ctx.bezierCurveTo(x - 23, y - height * .35, x + sway - 6, y - height * .7, x + sway, y - height);
      ctx.bezierCurveTo(x + sway + 8, y - height * .55, x + 19, y - height * .3, x + 14, y);
      ctx.closePath();ctx.fill();
    }
    for (let i = 0; i < 34; i++) {
      const progress = (time * (.11 + i % 4 * .018) + i * .137) % 1;
      const x = (i * 67.3 % width) + Math.sin(time * 1.3 + i) * 13;
      const y = groundY + 110 - progress * 430;
      ctx.fillStyle = `rgba(255,${140 + i % 3 * 35},65,${Math.sin(progress * Math.PI) * .65})`;
      ctx.beginPath();ctx.ellipse(x, y, 1.2 + i % 2, 2.2 + i % 3, .35, 0, Math.PI * 2);ctx.fill();
    }
    if (pulse > 0) {
      ctx.globalAlpha = pulse * .45;
      ctx.strokeStyle = '#ff7b29';ctx.lineWidth = 2;
      ctx.beginPath();ctx.ellipse(impactX, groundY + 2, 18 + (1 - pulse) * 90,
        4 + (1 - pulse) * 17, 0, 0, Math.PI * 2);ctx.stroke();
    }
  } else if (map === 'HEAVEN') {
    for (let i = 0; i < 24; i++) {
      const x = ((i * 71 + time * (8 + i % 3 * 3)) % (width + 40)) - 20;
      const y = groundY - 260 + ((i * 47 + time * (7 + i % 4)) % 350);
      ctx.fillStyle = `rgba(255,${190 + i % 3 * 20},${205 + i % 2 * 30},${.35 + Math.sin(time + i) ** 2 * .25})`;
      ctx.beginPath();ctx.ellipse(x, y, 3.5, 1.7, time * .7 + i, 0, Math.PI * 2);ctx.fill();
    }
    for (let i = 0; i < 14; i++) {
      const x = (i * 83.7) % width;
      const y = groundY - 205 + Math.sin(time * .6 + i) * 25 + i % 4 * 65;
      const sparkle = Math.sin(time * 1.5 + i * 2.3) ** 6;
      ctx.strokeStyle = `rgba(255,244,179,${sparkle * .65})`;ctx.lineWidth = 1;
      ctx.beginPath();ctx.moveTo(x - 3, y);ctx.lineTo(x + 3, y);
      ctx.moveTo(x, y - 4);ctx.lineTo(x, y + 4);ctx.stroke();
    }
    if (pulse > 0) {
      ctx.globalAlpha = pulse * .45;ctx.strokeStyle = '#fff3b0';ctx.lineWidth = 2;
      ctx.beginPath();ctx.ellipse(impactX, groundY + 2, 15 + (1 - pulse) * 95,
        3 + (1 - pulse) * 14, 0, 0, Math.PI * 2);ctx.stroke();
    }
  } else if (map === 'IRAN') {
    for (let i = 0; i < 18; i++) {
      const seed = i * 73.7;
      const x = ((seed + time * (12 + i % 4 * 5)) % (width + 100)) - 50;
      const y = groundY - 210 + ((seed * 1.7 + Math.sin(time * .7 + i) * 14) % 230);
      const size = 1.4 + i % 3;
      ctx.fillStyle = `rgba(255,224,159,${.12 + .12 * Math.sin(time * 2 + i) ** 2})`;
      ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
    }
    if (pulse > 0) {
      ctx.globalAlpha = pulse * .45;
      ctx.fillStyle = '#efc78f';
      ctx.beginPath(); ctx.ellipse(impactX, groundY + 1,
        22 + (1 - pulse) * 80, 4 + (1 - pulse) * 11, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}
