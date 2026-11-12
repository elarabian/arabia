export const PHARAOH_INTRO_END = 17.1;

export function drawPharaohBackdrop(ctx: CanvasRenderingContext2D, width: number, height: number,
  groundY: number, time: number, image?: HTMLImageElement | null,
  chaseImage?: HTMLImageElement | null) {
  ctx.save();
  const sceneAlpha = time > 15.9 ? Math.max(0, (PHARAOH_INTRO_END - time) / 1.2) : 1;
  ctx.globalAlpha = sceneAlpha;
  if (image?.naturalWidth) {
    ctx.drawImage(image, 0, 0, width, height);
    if (chaseImage?.naturalWidth && time >= 7.5) {
      const chaseBlend = Math.min(1, (time - 7.5) / .9);
      const chaseTime = Math.max(0, time - 7.8);
      const zoom = 1.12 + Math.min(1, chaseTime / 5) * .09;
      const drawnHeight = height * zoom;
      const drawnWidth = drawnHeight * chaseImage.naturalWidth / chaseImage.naturalHeight;
      const pan = Math.sin(chaseTime * .55) * 24;
      ctx.globalAlpha = sceneAlpha * chaseBlend;
      ctx.drawImage(chaseImage, (width - drawnWidth) / 2 - pan,
        (height - drawnHeight) / 2 + Math.sin(chaseTime * 1.5) * 3,
        drawnWidth, drawnHeight);
    }
    ctx.restore();
    return;
  }
  const sky = ctx.createLinearGradient(0, 0, 0, groundY);
  sky.addColorStop(0, '#553a57');
  sky.addColorStop(.65, '#d58655');
  sky.addColorStop(1, '#f3c781');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#ffe5a0';
  ctx.beginPath(); ctx.arc(width * .78, groundY - 300, 51, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#b8794c';
  for (const [x, size] of [[-80, 240], [135, 190], [390, 145]] as const) {
    ctx.beginPath(); ctx.moveTo(x, groundY - 16);
    ctx.lineTo(x + size * .5, groundY - size);
    ctx.lineTo(x + size, groundY - 16); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = '#dca66c';
  ctx.fillRect(0, groundY - 15, width, height - groundY + 15);
  ctx.strokeStyle = 'rgba(114,66,38,.22)'; ctx.lineWidth = 3;
  for (let i = 0; i < 9; i++) {
    const y = groundY + 15 + i * 21;
    ctx.beginPath(); ctx.moveTo(0, y);
    ctx.quadraticCurveTo(width * .5, y + Math.sin(time * 2 + i) * 8, width, y + 2);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawRiver(ctx: CanvasRenderingContext2D, width: number, groundY: number,
  time: number) {
  const story = time - 4.8;
  if (story < 4.6 || time >= PHARAOH_INTRO_END) return;
  const reveal = Math.min(1, (story - 4.6) / .8);
  const retreat = story > 11.1 ? Math.min(1, (story - 11.1) / 1.2) : 0;
  const left = width * .46 + retreat * width * .86;
  const right = width + 70 + retreat * width * .86;
  const parted = story < 6.2 ? 0 : story < 7 ? (story - 6.2) / .8
    : story < 9.8 ? 1 : Math.max(0, 1 - (story - 9.8) / 1.1);
  const gap = parted * 72;
  const top = groundY - 160;
  const bottom = groundY + 145;
  const nearCenter = groundY - 4;
  const farCenter = groundY - 26;
  ctx.save();
  ctx.globalAlpha = reveal;
  const water = ctx.createLinearGradient(0, top, 0, bottom);
  water.addColorStop(0, 'rgba(15,55,83,.88)');
  water.addColorStop(.45, 'rgba(35,133,162,.9)');
  water.addColorStop(1, 'rgba(7,65,95,.96)');
  ctx.shadowColor = 'rgba(4,28,44,.48)'; ctx.shadowBlur = 16;
  ctx.fillStyle = water;
  ctx.beginPath();
  ctx.moveTo(left + 25, top);
  ctx.lineTo(right, top - 32);
  ctx.lineTo(right, bottom - 40);
  ctx.lineTo(left - 22, bottom);
  ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;
  for (let row = 0; row < 9; row++) {
    const y = top + 25 + row * 32;
    ctx.strokeStyle = `rgba(213,255,250,${.12 + row % 3 * .07})`;
    ctx.lineWidth = 1.5 + row * .14;
    ctx.beginPath();
    for (let x = left; x <= right; x += 18) {
      const wave = y + Math.sin(x * .035 + time * 4 + row) * 5;
      if (x === left) ctx.moveTo(x, wave); else ctx.lineTo(x, wave);
    }
    ctx.stroke();
  }
  if (gap > 0) {
    // The opening runs horizontally through the existing river toward the far bank.
    const sand = ctx.createLinearGradient(0, nearCenter - gap, 0, nearCenter + gap);
    sand.addColorStop(0, '#8f5c3d');
    sand.addColorStop(.42, '#e7b47c');
    sand.addColorStop(1, '#bd8756');
    ctx.fillStyle = sand;
    ctx.beginPath();
    ctx.moveTo(left, nearCenter - gap);
    ctx.lineTo(right, farCenter - gap * .74);
    ctx.lineTo(right, farCenter + gap * .74);
    ctx.lineTo(left, nearCenter + gap);
    ctx.closePath(); ctx.fill();
    for (const side of [-1, 1]) {
      const startY = nearCenter + side * gap;
      const endY = farCenter + side * gap * .74;
      ctx.shadowColor = 'rgba(4,53,74,.7)'; ctx.shadowBlur = 15;
      ctx.strokeStyle = '#1a7293'; ctx.lineWidth = 18;
      ctx.beginPath(); ctx.moveTo(left, startY);
      ctx.quadraticCurveTo((left + right) / 2, (startY + endY) / 2 + Math.sin(time * 5) * 4,
        right, endY); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(233,255,249,.9)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(left, startY);
      for (let x = left + 12; x <= right; x += 12) {
        const ratio = (x - left) / (right - left);
        const y = startY + (endY - startY) * ratio + Math.sin(time * 6 + x * .055) * 3;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function drawPharaoh(ctx: CanvasRenderingContext2D, x: number, groundY: number,
  time: number, image?: HTMLImageElement | null, runningImage?: HTMLImageElement | null) {
  const story = time - 4.8;
  if (story >= 11.7) return;
  const angry = story >= 3;
  const sinking = story >= 9.8 ? Math.min(1, (story - 9.8) / 1.4) : 0;
  const running = story >= 3 && story < 8.8;
  const step = running ? Math.sin(time * 15) * 12 : 0;
  if (image?.naturalWidth) {
    ctx.save();
    if (sinking > 0) {
      ctx.beginPath(); ctx.rect(-1000, -1000, 3000, groundY + 1000); ctx.clip();
    }
    const bounce = running ? Math.abs(Math.sin(time * 15)) * 8
      : story >= 0 && story < 3 ? Math.abs(Math.sin(story * 7)) * 8 : 0;
    ctx.translate(x, groundY + sinking * 165 - bounce);
    ctx.rotate(sinking * .28 + (running ? Math.sin(time * 15) * .045 : story < 3 ? Math.sin(time * 5) * .05 : 0));
    ctx.globalAlpha = story > 11.1 ? Math.max(0, (11.7 - story) / .6) : 1;
    ctx.shadowColor = angry ? 'rgba(231,76,35,.8)' : 'rgba(40,26,13,.4)';
    ctx.shadowBlur = angry ? 16 : 7;
    if (running && runningImage?.naturalWidth) {
      ctx.drawImage(runningImage, -89, -121, 178, 121);
    } else {
      ctx.drawImage(image, -53, -159, 106, 159);
    }
    ctx.restore();
    if (sinking > 0) drawDrowningBubbles(ctx, x, groundY, time);
    return;
  }
  ctx.save();
  if (sinking > 0) {
    ctx.beginPath(); ctx.rect(-1000, -1000, 3000, groundY + 1000); ctx.clip();
  }
  ctx.translate(x, groundY + sinking * 155);
  ctx.rotate(sinking * .28);
  ctx.globalAlpha = story > 11.1 ? Math.max(0, (11.7 - story) / .6) : 1;
  ctx.fillStyle = 'rgba(66,35,20,.25)';
  ctx.beginPath(); ctx.ellipse(0, 2, 38, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#5d3b2b'; ctx.lineWidth = 11; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-13, -31); ctx.lineTo(-16 + step, -3);
  ctx.moveTo(12, -31); ctx.lineTo(17 - step, -3); ctx.stroke();
  ctx.fillStyle = '#f4e2b9'; ctx.strokeStyle = '#bc934c'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-21, -81); ctx.lineTo(21, -81);
  ctx.lineTo(29, -31); ctx.lineTo(-29, -31); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#2e6b8c'; ctx.fillRect(-20, -78, 40, 12);
  ctx.strokeStyle = '#b68657'; ctx.lineWidth = 10;
  ctx.beginPath(); ctx.moveTo(-19, -72); ctx.lineTo(-36, -52 + step * .4);
  ctx.moveTo(19, -72); ctx.lineTo(38, -49 - step * .4); ctx.stroke();
  ctx.fillStyle = '#ae754b';
  ctx.beginPath(); ctx.ellipse(0, -99, 22, 25, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#164d73';
  ctx.beginPath(); ctx.moveTo(-26, -111); ctx.lineTo(-22, -145);
  ctx.lineTo(0, -134); ctx.lineTo(22, -145); ctx.lineTo(26, -111);
  ctx.lineTo(15, -104); ctx.lineTo(-15, -104); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#f4c45b'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(-19, -122); ctx.lineTo(19, -122); ctx.stroke();
  ctx.fillStyle = '#f5d36f'; ctx.beginPath(); ctx.arc(0, -126, 5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#3b211a'; ctx.lineWidth = angry ? 3 : 2;
  ctx.beginPath(); ctx.moveTo(-13, angry ? -101 : -104); ctx.lineTo(-4, -100);
  ctx.moveTo(4, -100); ctx.lineTo(13, angry ? -101 : -104); ctx.stroke();
  ctx.fillStyle = '#281b1c';
  ctx.beginPath(); ctx.ellipse(0, -86, angry ? 7 : 3, angry ? 5 : 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  if (sinking > 0) drawDrowningBubbles(ctx, x, groundY, time);
}

export function drawChaseDust(ctx: CanvasRenderingContext2D, heroX: number,
  pharaohX: number, groundY: number, time: number) {
  if (time < 7.8 || time >= 13.6) return;
  ctx.save();
  for (const [index, anchor] of [heroX, pharaohX].entries()) {
    for (let i = 0; i < 9; i++) {
      const phase = (time * 3.2 + i * .31 + index * .43) % 1;
      const x = anchor - phase * 76 + Math.sin(i * 12) * 8;
      const y = groundY - phase * 31 + Math.cos(i * 4) * 7;
      const radius = 5 + phase * 17;
      ctx.globalAlpha = (1 - phase) * .22;
      ctx.fillStyle = '#f4d5a2';
      ctx.beginPath(); ctx.ellipse(x, y, radius * 1.7, radius * .7, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

function drawDrowningBubbles(ctx: CanvasRenderingContext2D, x: number, groundY: number, time: number) {
  ctx.save(); ctx.fillStyle = 'rgba(224,255,251,.8)';
  for (let i = 0; i < 5; i++) {
    const rise = ((time * 37 + i * 31) % 90);
    ctx.beginPath(); ctx.arc(x + Math.sin(i * 4) * 22, groundY - rise, 3 + i % 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

export function drawPharaohCamel(ctx: CanvasRenderingContext2D, x: number,
  groundY: number, time: number, image?: HTMLImageElement | null) {
  if (time >= 4.8) return;
  ctx.save();
  ctx.translate(x, 0);
  if (time >= 3.3) ctx.scale(-1, 1);
  if (image?.naturalWidth) {
    const bob = Math.abs(Math.sin(time * 14)) * 4;
    ctx.drawImage(image, -133, groundY - 175 - bob, 266, 175);
  } else {
    // The lightweight game camel is available while the detailed sprite loads.
    ctx.scale(time < 3.3 ? -1 : 1, 1);
    drawFallbackCamel(ctx, groundY, time);
  }
  ctx.restore();
}

function drawFallbackCamel(ctx: CanvasRenderingContext2D, groundY: number, time: number) {
  ctx.fillStyle = '#a66a35';
  ctx.beginPath(); ctx.ellipse(0, groundY - 65, 75, 34, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(5, groundY - 111, 29, 30, 0, 0, Math.PI * 2); ctx.fill();
  for (const leg of [-55, -30, 35, 57]) {
    ctx.fillRect(leg + Math.sin(time * 14 + leg) * 6, groundY - 60, 12, 60);
  }
}

export function drawHeroStaff(ctx: CanvasRenderingContext2D, x: number, groundY: number,
  time: number) {
  if (time >= PHARAOH_INTRO_END) return;
  const story = time - 4.8;
  const raise = story >= 6.2 && story < 8.3;
  const dance = story >= 0 && story < 3 ? Math.sin(story * 8) * 10 : 0;
  ctx.save();
  ctx.translate(x - 26, groundY - 78 + dance);
  ctx.rotate(raise ? -.75 : story >= 0 && story < 3 ? Math.sin(story * 5) * .25 : .18);
  ctx.strokeStyle = '#80542d'; ctx.lineWidth = 8; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 34); ctx.lineTo(0, -78); ctx.stroke();
  ctx.strokeStyle = '#f6d47c'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-4, -72); ctx.quadraticCurveTo(-21, -95, -3, -101);
  ctx.quadraticCurveTo(8, -104, 8, -93); ctx.stroke();
  ctx.restore();
  if (story >= 0 && story < 3) {
    ctx.save(); ctx.strokeStyle = '#3b211a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x + 16, groundY - 82);
    ctx.bezierCurveTo(x + 72, groundY - 165 + dance, x + 80, groundY - 20,
      x + 122 + Math.sin(time * 8) * 18, groundY - 60); ctx.stroke();
    ctx.restore();
  }
}
