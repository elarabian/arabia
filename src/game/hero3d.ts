type V = [number,number,number];
type Point = {x:number;y:number};
type Face = {v:V[]; color:V};
export const HERO_SCALE = 1.12;
const SKY:V=[241,243,242], RED:V=[183,45,62], SKIN:V=[191,133,89], DARK:V=[39,30,26];
const cross=(a:V,b:V):V=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const sub=(a:V,b:V):V=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const unit=(a:V):V=>{const n=Math.hypot(...a)||1;return a.map(x=>x/n) as V;};
const rotate=(p:V,angle:number):V=>{const a=Math.PI/2-angle,c=Math.cos(a),s=Math.sin(a);return [p[0]*c+p[2]*s,p[1],-p[0]*s+p[2]*c];};
const project=(p:V):Point=>({x:p[0],y:-p[1]*.94+p[2]*.34});
export function heroShoulder(x:number,y:number,angle:number,lean=0,size=HERO_SCALE){const p=project(rotate([15,72,lean*(72-15)/65],angle));return {x:x+p.x*size,y:y+p.y*size};}

/** Rotating 3D polygon mesh, depth-sorted and lit before projection to the game canvas. */
export function drawHero3D(ctx:CanvasRenderingContext2D,x:number,y:number,angle:number,
  arm:{shoulder:Point;elbow:Point;wrist:Point},step:number,lean=0,handsRaised=0,size=HERO_SCALE,runStep=0){
 const faces:Face[]=[];
 const face=(v:V[],color:V)=>faces.push({v,color});
 function sphere(center:V,r:V,color:V,check=false){
  const point=(i:number,j:number):V=>{const a=i/16*Math.PI*2,b=j/8*Math.PI;return [center[0]+r[0]*Math.sin(b)*Math.cos(a),center[1]+r[1]*Math.cos(b),center[2]+r[2]*Math.sin(b)*Math.sin(a)];};
  for(let i=0;i<16;i++)for(let j=0;j<8;j++)face([point(i,j),point(i+1,j),point(i+1,j+1),point(i,j+1)],check&&(i+j)%2===0?RED:color);
 }
 function tube(a:V,b:V,r:number,color:V){
  const axis=unit(sub(b,a)),u=unit(cross(axis,Math.abs(axis[1])<.9?[0,1,0]:[1,0,0])),v=cross(axis,u);
  const point=(p:V,i:number):V=>{const t=i/12*Math.PI*2;return p.map((q,k)=>q+r*(Math.cos(t)*u[k]+Math.sin(t)*v[k])) as V;};
  for(let i=0;i<12;i++)face([point(a,i),point(a,i+1),point(b,i+1),point(b,i)],color);
 }
 // The robe has a circular cross section and vertical fabric folds, not a flat sprite.
 const rings=[[5,22,12],[35,18,11],[65,16,10],[77,17,10],[81,7,7]];
 for(let j=0;j<rings.length-1;j++)for(let i=0;i<32;i++){
  const pt=(level:number,n:number):V=>{const [h,rx,rz]=rings[level],a=n/32*Math.PI*2,f=1+.035*Math.cos(a*8);return [Math.cos(a)*rx*f,h,Math.sin(a)*rz*f];};
  face([pt(j,i),pt(j,i+1),pt(j+1,i+1),pt(j+1,i)],SKY);
 }
 sphere([-10,3+Math.max(0,step),3],[8,3,11],DARK);
 sphere([10,3+Math.max(0,-step),3],[8,3,11],DARK);
 tube([0,77,0],[0,85,0],6,SKIN);
 sphere([0,94,0],[11,14,10],SKIN);
 sphere([0,85,5],[9,7,6],DARK);
 tube([-9,101.5,10],[-2,99.5,11],1.3,DARK);
 tube([2,99.5,11],[9,101.5,10],1.3,DARK);
 // Nose and mouth project out of the face, and disappear naturally when turned away.
 sphere([0,93,10],[2.4,3,3],SKIN);
 face([[-4,86,11],[4,86,11],[3,84.8,11],[-3,84.8,11]],[245,231,214]);
 for(const side of [-1,1]){
  const cx=side*5.5;
  face([[cx-4.2,99,10],[cx+4.2,99,10],[cx+4.2,92.5,11],[cx-4.2,92.5,11]],[29,30,35]);
  tube([side*9,97,10],[side*11,97,0],.7,DARK);
 }
 tube([-2,96,11],[2,96,11],.8,DARK);
 sphere([0,105,0],[13,7,12],[251,233,225],true);
 // Checker-woven scarf panels have actual depth and folds.
 for(let panel=0;panel<3;panel++)for(let row=0;row<9;row++)for(let col=0;col<8;col++){
  const pt=(r:number,c:number):V=>{const h=104-r*4,u=(c/8-.5)*32,fold=Math.sin(c*1.7+r*.4)*1.1;
   if(panel===0)return [u*(1+r*.018),h,-11-fold];
   return [(panel===1?-1:1)*(13+r*.65+fold),h,u*.65];};
  face([pt(row,col),pt(row,col+1),pt(row+1,col+1),pt(row+1,col)],(row+col)%2===0?RED:[252,239,230]);
 }
 for(let i=0;i<32;i++){const a=i/32*Math.PI*2,b=(i+1)/32*Math.PI*2;tube([13*Math.cos(a),105,12*Math.sin(a)],[13*Math.cos(b),105,12*Math.sin(b)],1.8,DARK);}
 // Relaxed left arm, attached in model space.
 const raised=Math.max(0,Math.min(1,handsRaised));
 const leftElbow:V=[-22+2*raised,53+51*raised+runStep*12,2+raised];
 const leftHand:V=[-13+raised,46+81*raised+runStep*22,9-raised];
 tube([-15,72,0],leftElbow,6.5,SKY);tube(leftElbow,leftHand,5.5,SKY);sphere(leftHand,[4,4.5,4],SKIN);
 // Bend above the hips while the feet remain planted.
 for(const f of faces)f.v=f.v.map(p=>[p[0],p[1],p[2]+lean*Math.max(0,p[1]-15)/65] as V);
 // Convert the IK arm back into model space so its projected wrist equals the whip grip exactly.
 const worldZ=rotate([15,72,lean*(72-15)/65],angle)[2];
 const unproject=(p:Point,z:number):V=>{
  const world:V=[(p.x-x)/size,(z*.34-(p.y-y)/size)/.94,z];
  const a=Math.PI/2-angle,c=Math.cos(a),s=Math.sin(a);
  return [world[0]*c-world[2]*s,world[1],world[0]*s+world[2]*c];
 };
 const shoulder=unproject(arm.shoulder,worldZ),elbow=unproject(arm.elbow,worldZ+3),wrist=unproject(arm.wrist,worldZ+6);
 tube(shoulder,elbow,6.5,SKY);sphere(elbow,[6,6,6],SKY);tube(elbow,wrist,5,SKY);
 // Lighting is fixed in world space while all model surfaces rotate.
 const light=unit([-.5,.85,.7]);
 const rendered=faces.map(f=>{
  const v=f.v.map(p=>rotate(p,angle));
  let n=unit(cross(sub(v[1],v[0]),sub(v[2],v[0])));
  const center=v.reduce((a,p)=>a.map((q,k)=>q+p[k]/v.length) as V,[0,0,0] as V);
  if(n[0]*center[0]+n[2]*center[2]<0)n=n.map(q=>-q) as V;
  const shade=.46+.54*Math.max(0,n.reduce((sum,q,k)=>sum+q*light[k],0));
  return {points:v.map(project),depth:center[1]*.34+center[2]*.94,color:`rgb(${f.color.map(q=>Math.round(q*shade)).join(',')})`};
 }).sort((a,b)=>a.depth-b.depth);
 ctx.save();ctx.translate(x,y);ctx.scale(size,size);
 ctx.fillStyle='rgba(65,37,17,.27)';ctx.beginPath();ctx.ellipse(3,1,27,9,0,0,Math.PI*2);ctx.fill();
 for(const f of rendered){ctx.beginPath();f.points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle=f.color;ctx.fill();}
 ctx.restore();
}
