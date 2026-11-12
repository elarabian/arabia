export type WorldMap = 'DESERT' | 'GRAVEYARD' | 'ISTANBUL' | 'IRAN' | 'ISRAEL';

export const WORLD_MAPS: { id: WorldMap; label: string; icon: string }[] = [
  { id: 'DESERT', label: 'Arap Çölü', icon: '🏜️' },
  { id: 'GRAVEYARD', label: 'Gotik Mezarlık', icon: '⚰️' },
  { id: 'ISTANBUL', label: 'İstanbul Boğazı', icon: '🌉' },
  { id: 'IRAN', label: 'İran', icon: '🏔️' },
  { id: 'ISRAEL', label: 'İsrail', icon: '🌊' },
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
