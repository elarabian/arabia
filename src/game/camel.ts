/** A lightweight procedural camel so the scene stays smooth in browser sources. */
export function drawCamel(ctx: CanvasRenderingContext2D, x: number, groundY: number, time: number) {
  const stride = Math.sin(time * 16);
  const bounce = Math.abs(stride) * 5;
  ctx.save();
  ctx.translate(x, groundY - bounce);

  ctx.fillStyle = 'rgba(52, 31, 18, .24)';
  ctx.beginPath(); ctx.ellipse(0, bounce + 3, 86, 9, 0, 0, Math.PI * 2); ctx.fill();

  // Far legs move against the near legs to make the gallop readable.
  ctx.strokeStyle = '#8a5429'; ctx.lineWidth = 12; ctx.lineCap = 'round';
  for (const [root, phase] of [[-42, -1], [36, 1]] as const) {
    const kick = stride * phase * 19;
    ctx.beginPath(); ctx.moveTo(root, -50); ctx.lineTo(root + kick * .45, -23);
    ctx.lineTo(root + kick, -5); ctx.stroke();
  }

  ctx.fillStyle = '#a66a35'; ctx.strokeStyle = '#70421e'; ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-72, -63); ctx.quadraticCurveTo(-63, -91, -43, -87);
  ctx.quadraticCurveTo(-30, -143, -6, -125);
  ctx.quadraticCurveTo(7, -92, 18, -88);
  ctx.quadraticCurveTo(32, -91, 51, -74);
  ctx.quadraticCurveTo(65, -52, 44, -46);
  ctx.quadraticCurveTo(-15, -34, -65, -47);
  ctx.closePath(); ctx.fill(); ctx.stroke();

  // Long neck, small head, ears and reins.
  ctx.beginPath(); ctx.moveTo(43, -72);
  ctx.quadraticCurveTo(62, -86, 67, -119);
  ctx.lineTo(80, -119); ctx.quadraticCurveTo(79, -91, 66, -63);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(84, -119, 18, 11, -.17, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(76, -127); ctx.lineTo(73, -143); ctx.lineTo(82, -133); ctx.fill();
  ctx.fillStyle = '#21160e'; ctx.beginPath(); ctx.arc(90, -123, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#603c24'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(89, -112); ctx.quadraticCurveTo(38, -91, 6, -111); ctx.stroke();

  ctx.fillStyle = '#6a2530';
  ctx.beginPath(); ctx.moveTo(-27, -96); ctx.quadraticCurveTo(-3, -108, 25, -94);
  ctx.lineTo(23, -86); ctx.lineTo(-28, -86); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#d8a860'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-70, -70); ctx.quadraticCurveTo(-91, -82, -99, -59); ctx.stroke();

  ctx.strokeStyle = '#b8793f'; ctx.lineWidth = 13;
  for (const [root, phase] of [[-49, 1], [42, -1]] as const) {
    const kick = stride * phase * 22;
    ctx.beginPath(); ctx.moveTo(root, -48); ctx.lineTo(root + kick * .35, -22);
    ctx.lineTo(root + kick, -3); ctx.stroke();
  }
  ctx.restore();
}
