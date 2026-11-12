type Point = { x: number; y: number };
export function solveArm(shoulder: Point, requestedWrist: Point, previousElbow: Point, scale = 1) {
  const upper = 22*scale, lower = 20*scale;
  const dx = requestedWrist.x-shoulder.x, dy = requestedWrist.y-shoulder.y;
  const raw = Math.hypot(dx,dy);
  const distance = Math.max(3*scale,Math.min(upper+lower-.5*scale,raw));
  const ux = raw > .001 ? dx/raw : 1, uy = raw > .001 ? dy/raw : 0;
  const wrist = { x: shoulder.x+ux*distance, y: shoulder.y+uy*distance };
  const along = (upper*upper-lower*lower+distance*distance)/(2*distance);
  const height = Math.sqrt(Math.max(0,upper*upper-along*along));
  const a = {x:shoulder.x+ux*along-uy*height,y:shoulder.y+uy*along+ux*height};
  const b = {x:shoulder.x+ux*along+uy*height,y:shoulder.y+uy*along-ux*height};
  const elbow = Math.hypot(a.x-previousElbow.x,a.y-previousElbow.y) <= Math.hypot(b.x-previousElbow.x,b.y-previousElbow.y) ? a : b;
  return {shoulder,elbow,wrist};
}
