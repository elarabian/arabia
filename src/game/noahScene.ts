const BUILD_HITS = 72;
export { BUILD_HITS as NOAH_BUILD_HITS };

export function drawNoahBackdrop(ctx: CanvasRenderingContext2D, width: number, height: number,
  buildProgress: number, floodTime: number, image?: HTMLImageElement | null) {
  ctx.save();
  ctx.fillStyle = `rgba(10, 24, 40, ${Math.min(.45, buildProgress * .38)})`;
  ctx.fillRect(0, 0, width, height);
  if (floodTime > 0) {
    ctx.globalAlpha = Math.min(1, floodTime / 2);
    if (image?.naturalWidth) {
      const tour = Math.min(1, Math.max(0, (floodTime - 4) / 2));
      const pan = Math.sin(floodTime * .3) * width * .1 * tour;
      const zoom = 1.06 + tour * .19 + Math.sin(floodTime * .22) * .02 * tour;
      const w = width * zoom;
      const h = height * zoom;
      ctx.drawImage(image, (width - w) / 2 + pan, (height - h) / 2, w, h);
    } else {
      const storm = ctx.createLinearGradient(0, 0, 0, height);
      storm.addColorStop(0, '#122641'); storm.addColorStop(.55, '#2a5e72');
      storm.addColorStop(1, '#087583');
      ctx.fillStyle = storm; ctx.fillRect(0, 0, width, height);
    }
  }
  ctx.restore();
}

export function drawArk(ctx: CanvasRenderingContext2D, width: number, groundY: number,
  progress: number, floodTime: number, hitPulse: number, image?: HTMLImageElement | null) {
  const shipWidth = Math.min(width * .94, 520);
  const shipHeight = shipWidth * .54;
  const bob = floodTime > 0 ? Math.sin(floodTime * 3) * Math.min(5, floodTime) : 0;
  const centerX = width / 2 + (floodTime > 4 ? Math.sin(floodTime * .65) * 14 : 0);
  const bottom = groundY + 75 + bob - (floodTime > 0 ? Math.min(1, floodTime / 4) * 25 : 0);
  const left = centerX - shipWidth / 2;
  const top = bottom - shipHeight;
  ctx.save();
  ctx.translate(centerX, bottom);
  ctx.rotate(floodTime > 3 ? Math.sin(floodTime * 1.25) * .018 : 0);
  ctx.translate(-centerX, -bottom);
  if (progress < 1) {
    ctx.strokeStyle = 'rgba(83,50,28,.75)'; ctx.lineWidth = 6;
    for (let i = 0; i < 5; i++) {
      const x = left + 24 + i * (shipWidth - 48) / 4;
      ctx.beginPath(); ctx.moveTo(x, bottom - 18); ctx.lineTo(x, top + 62); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(135,85,46,.88)'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(left + 15, bottom - 28);
    ctx.quadraticCurveTo(centerX, bottom + 32, left + shipWidth - 15, bottom - 28);
    ctx.moveTo(left + 34, bottom - 98);
    ctx.lineTo(left + shipWidth - 34, bottom - 98);
    ctx.moveTo(left + 64, top + 70);
    ctx.lineTo(left + shipWidth - 64, top + 70);
    ctx.stroke();
  }
  if (progress > 0) {
    ctx.save();
    ctx.beginPath(); ctx.rect(left - 2, top - 4, shipWidth * progress + 4, shipHeight + 8); ctx.clip();
    if (image?.naturalWidth) {
      ctx.shadowColor = 'rgba(24,15,8,.45)'; ctx.shadowBlur = 16;
      ctx.drawImage(image, left, top, shipWidth, shipHeight);
    } else {
      ctx.fillStyle = '#743d1f'; ctx.strokeStyle = '#c2894d'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(left, bottom - 70);
      ctx.quadraticCurveTo(centerX, bottom + 50, left + shipWidth, bottom - 70);
      ctx.lineTo(left + shipWidth - 30, bottom - 115);
      ctx.lineTo(left + 30, bottom - 115); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#9a5b2e'; ctx.fillRect(left + 85, top + 33, shipWidth - 170, 100);
    }
    ctx.restore();
  }
  if (hitPulse > 0 && progress < 1) {
    const edge = left + shipWidth * progress;
    ctx.globalAlpha = Math.min(1, hitPulse * 2);
    ctx.fillStyle = '#ffdc85';
    for (let i = 0; i < 10; i++) {
      const angle = i * 2.4 + floodTime;
      ctx.beginPath(); ctx.arc(edge + Math.cos(angle) * 22,
        groundY - 35 + Math.sin(angle) * 50, 2 + i % 3, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

export function drawFloodWater(ctx: CanvasRenderingContext2D, width: number, height: number,
  groundY: number, floodTime: number) {
  if (floodTime <= 0) return;
  const rise = Math.min(1, floodTime / 4.4);
  const waterline = groundY + 110 - rise * 210;
  ctx.save();
  const water = ctx.createLinearGradient(0, waterline, 0, height);
  water.addColorStop(0, 'rgba(117,221,228,.72)');
  water.addColorStop(.1, 'rgba(19,119,143,.83)');
  water.addColorStop(1, 'rgba(3,43,78,.94)');
  ctx.fillStyle = water;
  ctx.beginPath(); ctx.moveTo(0, waterline);
  for (let x = 0; x <= width + 18; x += 18) {
    ctx.lineTo(x, waterline + Math.sin(x * .035 + floodTime * 4) * 5);
  }
  ctx.lineTo(width, height); ctx.lineTo(0, height); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(219,255,250,.7)'; ctx.lineWidth = 2;
  for (let row = 0; row < 5; row++) {
    const y = waterline + 12 + row * 32;
    ctx.beginPath();
    for (let x = 0; x <= width; x += 14) {
      const waveY = y + Math.sin(x * .028 + floodTime * 3 + row) * 5;
      if (x === 0) ctx.moveTo(x, waveY); else ctx.lineTo(x, waveY);
    }
    ctx.stroke();
  }
  ctx.restore();
}

export function drawStormRain(ctx: CanvasRenderingContext2D, width: number, height: number,
  groundY: number, time: number, floodTime: number) {
  if (floodTime <= 0) return;
  const intensity = Math.min(1, floodTime / 2);
  ctx.save();
  const layers = [
    { count: 100, speed: 440, length: 15, slant: 7, alpha: .16, width: .7 },
    { count: 60, speed: 710, length: 27, slant: 13, alpha: .32, width: 1.2 },
    { count: 28, speed: 980, length: 43, slant: 22, alpha: .5, width: 1.9 },
  ];
  layers.forEach((layer, depth) => {
    ctx.strokeStyle = `rgba(222,243,255,${layer.alpha * intensity})`;
    ctx.lineWidth = layer.width;
    ctx.beginPath();
    for (let i = 0; i < layer.count; i++) {
      const spanX = width + 140;
      const spanY = height + 110;
      const seed = i * 87.31 + depth * 193.7;
      const x = ((seed * 2.31 - time * layer.speed * .17) % spanX + spanX) % spanX - 70;
      const y = ((seed * 3.73 + time * layer.speed) % spanY + spanY) % spanY - 55;
      ctx.moveTo(x, y);
      ctx.lineTo(x - layer.slant, y + layer.length);
    }
    ctx.stroke();
  });
  const waterline = groundY + 110 - Math.min(1, floodTime / 4.4) * 210;
  const mist = ctx.createLinearGradient(0, waterline - 30, 0, waterline + 35);
  mist.addColorStop(0, 'rgba(198,240,246,0)');
  mist.addColorStop(.55, `rgba(180,229,235,${.12 * intensity})`);
  mist.addColorStop(1, 'rgba(198,240,246,0)');
  ctx.fillStyle = mist;
  ctx.fillRect(0, waterline - 30, width, 65);
  ctx.strokeStyle = 'rgba(229,253,255,.65)';
  for (let i = 0; i < 24; i++) {
    const phase = (time * 2.5 + i * .371) % 1;
    const x = (i * 97.17) % width;
    const y = waterline + Math.sin(x * .035 + floodTime * 4) * 5;
    ctx.globalAlpha = intensity * (1 - phase) * .55;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(x, y, phase * 7 + 1, phase * 2 + .5, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = Math.pow(Math.max(0, Math.sin(time * 1.8 + .7)), 34) * .09 * intensity;
  ctx.fillStyle = '#ecfbff'; ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
