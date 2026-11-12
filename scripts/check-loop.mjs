import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const dir=await mkdtemp(join(tmpdir(),'kirbac-loop-'));
try {
 await build({stdin:{contents:`export {GameEngine} from './src/game/gameEngine'; export {soundEngine} from './src/game/audio';`,resolveDir:root},bundle:true,platform:'node',format:'esm',outfile:join(dir,'game.mjs'),define:{'import.meta.env':'{"VITE_TIKTOK_ENABLED":"false"}'},plugins:[{name:'assets',setup(b){
  b.onResolve({filter:/dialogueAssets$/},()=>({path:'dialogue-assets',namespace:'mock'}));
  b.onResolve({filter:/mp3\?url$/},args=>({path:args.path.includes('hero.mp3')?'hero':args.path.includes('background.mp3')?'background':args.path.includes('bomb.mp3')?'bomb':'whip',namespace:'mock'}));
  b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:args.path==='dialogue-assets'?'export const dialogueAssets = {}':`export default "${args.path}.mp3"`}));
 }}]});
 let ctx;let failAudio=false;let lastSource;let heroStarts=0;let backgroundStarts=0;let bombBoomStarts=0;let bombClipStarts=0;
 const pending=[];
 const heroDuration=12.98285;
 const param=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},linearRampToValueAtTime(){}});
 class AC {
  currentTime=0;state='running';destination={};sampleRate=44100;
  constructor(){ctx=this;}
  createGain(){return {gain:param(),connect(){},disconnect(){}};}
  createBuffer(_channels,length){const data=new Float32Array(length);return {getChannelData(){return data;}};}
  createBiquadFilter(){return {frequency:param(),connect(){},disconnect(){}};}
  createOscillator(){return {frequency:param(),connect(){},start(){bombBoomStarts++;},stop(){}};}
  createBufferSource(){return {playbackRate:param(),detune:param(),connect(){},disconnect(){},stop(){this.onended?.();},start(...args){
   if(failAudio)throw Error('simulated device failure');
   if(args.length===3)lastSource={args,rate:this.playbackRate.value,detune:this.detune.value};
   else if(this.buffer.kind==='hero.mp3'){heroStarts++;pending.push({source:this,end:ctx.currentTime+this.buffer.duration});}
   else if(this.buffer.kind==='background.mp3'){assert.equal(this.loop,true,'background music loops');backgroundStarts++;}
   else if(this.buffer.kind==='bomb.mp3'){bombClipStarts++;pending.push({source:this,end:ctx.currentTime+this.buffer.duration/this.playbackRate.value});}
  }};}
  async decodeAudioData(data){
   const kind=new TextDecoder().decode(data),duration=kind==='hero.mp3'?heroDuration:kind==='bomb.mp3'?7.128625:5.48;
   if(kind==='background.mp3'){
    const sampleRate=11025,samples=new Float32Array(Math.ceil(sampleRate*duration));
    for(let i=0;i<samples.length;i++){
     const t=i/sampleRate,phase=(t-.5)% .5;
     if(t>=.5&&phase>=0&&phase<.12)samples[i]=Math.sin(2*Math.PI*80*t)*.8*(1-phase/.12);
    }
    return {kind,duration,sampleRate,getChannelData(){return samples;}};
   }
   return {kind,duration};
  }
  async resume(){}async suspend(){}
 }
 globalThis.window={AudioContext:AC};
 globalThis.fetch=async(url)=>({ok:true,arrayBuffer:async()=>new TextEncoder().encode(url).buffer});
 const {GameEngine,soundEngine}=await import(pathToFileURL(join(dir,'game.mjs')).href);
 await soundEngine.prepare();
 soundEngine.startBackground();
 assert.equal(backgroundStarts,1,'background music starts when the game starts');
 const warn=console.warn;let failures=0;console.warn=()=>failures++;
 for(const fps of [20,30,60]){
  const e=new GameEngine();e.restartGame();e.resize(540,960);
  let lastHit=0,maxGap=0,hits=[];let introFrames=0,maxBassPulse=0;
  let firstHeroAt=null,firstHitAt=null,firstBowAt=null,bowRendered=false;
  let firstOrbitAngle=null,orbitMoved=false,afterHitChecked=false;
  let minHands=1,maxHands=0,maxSpin=0,maxJump=0,minWristLift=Infinity,maxWristLift=-Infinity;
  let sampledSource=lastSource;
  const firstZombie=e.zombies.zombies[0];
  const original=e.handleZombieHit.bind(e);
  e.handleZombieHit=(z,...args)=>{
   const tip=e.whip.nodes.at(-1),torso=e.zombies.getHitTargets(z)[1];
   assert.ok(Math.hypot(tip.x-torso.x,tip.y-torso.y)<.01,'exact animated contact');
   maxGap=Math.max(maxGap,soundEngine.audioTime-lastHit);lastHit=soundEngine.audioTime;
   hits.push(z.id);original(z,...args);
   if(z===firstZombie&&firstHitAt===null)firstHitAt=soundEngine.audioTime;
  };
  const beginning=soundEngine.audioTime;lastHit=beginning;
  // 10 minutes per refresh rate: normal, suspended, frozen but 'running',
  // throwing device, then recovered. No onended callbacks are supplied.
  for(let frame=0;frame<fps*600;frame++){
   const t=frame/fps;
   ctx.state=t>=120&&t<240?'suspended':'running';
   failAudio=t>=360&&t<420;
   if(t<120||t>=360)ctx.currentTime+=1/fps;
   for(let i=pending.length-1;i>=0;i--)if(pending[i].end<=ctx.currentTime){pending[i].source.onended?.();pending.splice(i,1);}
   const cracks=e.stats.totalCracks;
   e.update(1/fps);
   maxBassPulse=Math.max(maxBassPulse,soundEngine.bassPulse);
   if(firstHeroAt===null&&soundEngine.attack?.prepStart!==undefined){
    firstHeroAt=soundEngine.attack.prepStart;
    firstOrbitAngle=firstZombie.formation.angle;
   }
   if(soundEngine.attack?.prepStart!==undefined&&soundEngine.audioTime<soundEngine.attack.start){
    introFrames++;
    assert.equal(e.stats.totalCracks,cracks,'whip waits while hero speaks');
    if(soundEngine.attack.prepStart===firstHeroAt){
     minHands=Math.min(minHands,e.handsRaised);maxHands=Math.max(maxHands,e.handsRaised);
     maxSpin=Math.max(maxSpin,e.heroVisualAngle-e.aimAngle);
     maxJump=Math.max(maxJump,e.heroJump);
     const wristLift=e.arm.shoulder.y-e.arm.wrist.y;
     minWristLift=Math.min(minWristLift,wristLift);maxWristLift=Math.max(maxWristLift,wristLift);
     if(soundEngine.audioTime-firstHeroAt>3)orbitMoved ||= firstZombie.formation.angle-firstOrbitAngle>.6;
    }
   }
   if(soundEngine.attack?.prepStart!==undefined){
    const strikeAge=soundEngine.audioTime-soundEngine.attack.start;
    if(strikeAge>.7&&strikeAge<soundEngine.attack.duration)afterHitChecked ||= e.handsRaised>.99;
   }
   if(firstBowAt===null&&firstZombie.bowTimer>0)firstBowAt=soundEngine.audioTime;
   if(firstBowAt!==null&&!bowRendered&&soundEngine.audioTime-firstBowAt>1){
    const rotations=[];
    const canvas=new Proxy({}, {get:(_,key)=>key==='rotate'?(angle)=>rotations.push(angle):()=>{}});
    e.zombies.drawZombies(canvas,e.groundY);
    e.zombies.drawZombies(canvas,e.groundY,'front');
    bowRendered=rotations.some(angle=>angle<-1);
   }
   if(lastSource&&lastSource!==sampledSource&&ctx.state==='running'&&!failAudio){
    assert.ok(Math.abs(lastSource.args[0]-ctx.currentTime)<.001,
     'whip sound starts with the visible strike, never seconds ahead of it');
    assert.ok(soundEngine.attack&&soundEngine.audioTime>=soundEngine.attack.start,
     'recorded whip is not heard before the strike animation');
    assert.equal(lastSource.rate,1);assert.equal(lastSource.detune,0);
    sampledSource=lastSource;
   }
   assert.ok(Number.isFinite(e.whip.nodes.at(-1).x));
  }
  assert.ok(hits.length>30&&hits.length<60,'one strike per hero clip, with recovery during interruptions');
  assert.ok(maxGap<14.8,`no stalled attacks: ${maxGap}`);
  assert.ok(introFrames>100,'hero preparation phase is exercised');
  assert.ok(maxBassPulse>.9,'background bass beats drive the dance');
  assert.equal(e.isGameOver,false);
  const ids=e.zombies.zombies.map(z=>z.id);
  hits.forEach((id,i)=>assert.equal(id,ids[i%20],'loop stays in order'));
  assert.ok(e.zombies.zombies.every(z=>!z.isDead));
  assert.ok(firstHeroAt!==null&&firstHitAt!==null&&Math.abs(firstHitAt-firstHeroAt-heroDuration-.24)<.1,
   `first whip lands after the hero clip: ${firstHeroAt} -> ${firstHitAt}`);
  assert.ok(firstHitAt!==null&&firstBowAt!==null&&Math.abs(firstBowAt-firstHitAt-20)<.1,
   `first zombie bows 20 seconds after its first hit: ${firstHitAt} -> ${firstBowAt}`);
  assert.ok(bowRendered,'bow reaches a clearly visible upper-body rotation');
  assert.ok(orbitMoved,'zombies circle the hero slowly on bass beats');
  assert.ok(maxSpin>Math.PI*10&&maxJump>20,'hero spins and jumps throughout the clip');
  assert.ok(minHands<.1&&maxHands>.99&&maxWristLift-minWristLift>40,'both hands rise and fall during the clip');
  assert.ok(afterHitChecked,'hero raises both hands again after the strike');
  console.log(`PASS ${fps} FPS / 10 minutes: ${hits.length} hits, longest gap ${maxGap.toFixed(3)}s; interrupted/frozen/failed audio and recovery.`);
 }
 assert.ok(failures>0,'audio failure path exercised');console.warn=warn;
 assert.ok(heroStarts>3,'hero clip restarts for later whip lifts');
 assert.equal(backgroundStarts,1,'background music keeps one looping source throughout the game');
 const rapidGame=new GameEngine();rapidGame.restartGame();rapidGame.resize(540,960);
 rapidGame.setRapidWhip(true);
 const heroBeforeRapid=heroStarts,rapidHits=[];
 let rapidJump=0,rapidStep=0,rapidHand=0;
 const handleRapidHit=rapidGame.handleZombieHit.bind(rapidGame);
 rapidGame.handleZombieHit=(z,...args)=>{rapidHits.push(z.id);handleRapidHit(z,...args);};
 ctx.state='running';failAudio=false;
 for(let frame=0;frame<60*12;frame++){
  ctx.currentTime+=1/60;
  rapidGame.update(1/60);
  rapidJump=Math.max(rapidJump,rapidGame.heroJump);
  rapidStep=Math.max(rapidStep,Math.abs(rapidGame.rapidDanceStep));
  rapidHand=Math.max(rapidHand,rapidGame.handsRaised);
  assert.equal(soundEngine.attack?.prepStart,undefined,'rapid mode skips the hero intro');
  if(soundEngine.attack)assert.equal(soundEngine.attack.duration,.36,'rapid strikes use short takes');
 }
 assert.ok(rapidHits.length>25,'rapid mode repeatedly strikes the whole ring');
 assert.ok(rapidJump>18&&rapidStep>7&&rapidHand>.75,'hero hops and dances during rapid strikes');
 const normalRapidHits=rapidHits.length;
 rapidGame.setRapidWhipSpeed(2);
 let fastStarted=false;
 for(let frame=0;frame<60*4;frame++){
  ctx.currentTime+=1/60;rapidGame.update(1/60);
  if(soundEngine.attack?.duration===.18)fastStarted=true;
  if(fastStarted){
   assert.equal(soundEngine.attack?.peak,.12,'contact follows the faster audio peak');
   assert.equal(lastSource.rate,2,'rapid whip audio plays at the selected speed');
   assert.equal(lastSource.args[2],.36,'the same recorded crack is used at every speed');
  }
 }
 assert.ok(fastStarted,'speed slider takes effect on the next strike');
 assert.ok(rapidHits.length-normalRapidHits>15,'higher speed produces more strikes');
 rapidGame.setRapidWhipSpeed(.5);
 let slowStarted=false;
 for(let frame=0;frame<60*4;frame++){
  ctx.currentTime+=1/60;rapidGame.update(1/60);
  if(soundEngine.attack?.duration===.72){
   slowStarted=true;
   assert.equal(lastSource.rate,.5,'lower speed slows the whip audio');
  }
 }
 assert.ok(slowStarted,'lower speed takes effect on the next strike');
 assert.equal(rapidGame.rapidWhipSpeed,.5);
 rapidGame.setRapidWhipSpeed(.1);
 let minimumStarted=false;
 for(let frame=0;frame<60*5;frame++){
  ctx.currentTime+=1/60;rapidGame.update(1/60);
  if(Math.abs((soundEngine.attack?.duration??0)-3.6)<1e-9){
   minimumStarted=true;
   assert.ok(Math.abs(soundEngine.attack.peak-2.4)<1e-9,'contact scales with the minimum speed');
   assert.equal(lastSource.rate,.1,'whip audio supports the 0.1x setting');
  }
 }
 assert.ok(minimumStarted,'the 0.1x minimum is usable');
 const rapidIds=rapidGame.zombies.zombies.map(z=>z.id);
 rapidHits.forEach((id,i)=>assert.equal(id,rapidIds[i%rapidIds.length],'rapid mode cycles through every zombie'));
 assert.equal(heroStarts,heroBeforeRapid,'rapid strikes do not overlap hero voice clips');
 rapidGame.setRapidWhip(false);
 for(let frame=0;frame<120&&!soundEngine.attack?.prepStart;frame++){
  ctx.currentTime+=1/60;rapidGame.update(1/60);
 }
 assert.ok(soundEngine.attack?.prepStart!==undefined,'switching off restores the hero voice cycle');
 const bombGame=new GameEngine();bombGame.restartGame();bombGame.resize(540,960);
 const bombClipsBefore=bombClipStarts;
 bombGame.setBombScene(true);
 const boomBefore=bombBoomStarts,voiceBeforeBomb=heroStarts;
 assert.equal(bombClipStarts,bombClipsBefore+1,'bomb.mp3 starts as soon as the bomb is planted');
 for(let frame=0;frame<90;frame++) {ctx.currentTime+=1/60;bombGame.update(1/60);}
 assert.equal(bombGame.heroVisualAngle,-Math.PI/2,'hero keeps his back to the viewer during the uphill run');
 for(let frame=90;frame<179;frame++){
  ctx.currentTime+=1/60;bombGame.update(1/60);
 }
 assert.equal(bombGame.bombExploded,false,'the bomb waits three seconds');
 assert.ok(bombGame.bombHeroY<130&&bombGame.bombHeroScale<.5&&Math.abs(bombGame.heroVisualAngle-Math.PI/2)<.01,
  'hero reaches the dune peak at smaller scale and turns to face the viewer');
 assert.ok(bombGame.zombies.zombies.every(z=>z.formation),'zombies still circle the bomb before it explodes');
 for(let frame=0;frame<3;frame++){ctx.currentTime+=1/60;bombGame.update(1/60);}
 assert.equal(bombGame.bombExploded,true,'bomb detonates after three seconds');
 assert.equal(bombBoomStarts,boomBefore,'the recorded bomb blast replaces the synthetic fallback');
 assert.ok(bombGame.zombies.zombies.every(z=>z.blastSpin&&z.blastGroundY!==undefined),'zombies spin in the blast');
 assert.ok(bombGame.zombies.zombies.every(z=>!z.formation&&z.vy<0),'all zombies scatter upward');
 assert.ok(bombGame.zombies.zombies.some(z=>(z.blastDelay??0)>.05),
  'the shockwave reaches outer dancers after inner dancers');
 for(let frame=0;frame<60;frame++){ctx.currentTime+=1/60;bombGame.update(1/60);}
 assert.ok(bombGame.zombies.zombies.every(z=>z.x>=25&&z.x<=515),
  'flying zombies remain visible inside the stage');
 assert.ok(bombGame.zombies.zombies.every(z=>Math.abs(z.blastAngle??0)<.7),
  'flying zombie bodies keep a readable silhouette instead of flipping into blocks');
 assert.ok(bombGame.zombies.zombies.some(z=>z.y<(z.blastGroundY??0)-100),
  'zombies rise high enough to read as an airborne blast');
 assert.ok(new Set(bombGame.zombies.zombies.map(z=>Math.round(z.blastFlight?.landingX??0))).size>12,
  'zombies scatter toward varied landing positions');
 while(bombGame.bombSceneTime<7.1){ctx.currentTime+=1/60;bombGame.update(1/60);}
 assert.ok(bombGame.zombies.zombies.every(z=>z.vy===0&&z.blastFlight===undefined&&z.blastSleep),
  'zombies land in a sleeping pose and stop floating');
 assert.ok(bombGame.zombies.zombies.every(z=>z.x>=540*.04+75*z.scale-1&&z.x<=540*.9-75*z.scale+1),
  'landed zombies remain fully visible within the scene');
 assert.equal(bombGame.bombDanceStarted,true,'hero returns and begins dancing');
 assert.ok(Math.abs(bombGame.bombHeroX-bombGame.playerX)<1&&Math.abs(bombGame.bombHeroY-bombGame.groundY)<1,
  'hero returns to the center');
 assert.ok(bombGame.handsRaised>=.7,'hero dances with raised hands');
 assert.equal(heroStarts,voiceBeforeBomb+1,'hero.mp3 plays during the center dance');
 while(bombGame.bombSceneTime>0&&bombGame.bombSceneTime<7+heroDuration){
  ctx.currentTime+=1/60;bombGame.update(1/60);
 }
 assert.ok(bombGame.bombSceneTime<.2&&bombGame.zombies.zombies.every(z=>z.formation),
  'the second scene loops after the hero clip');
 bombGame.setBombScene(false);
 assert.equal(bombGame.bombSceneEnabled,false,'scene switch returns to the whip stage');
 const burialGame=new GameEngine();burialGame.restartGame();burialGame.resize(540,960);
 const burialVoiceBefore=heroStarts;
 burialGame.setBurialScene(true);
 const firstBurialTarget=burialGame.zombies.zombies[0];
 const advanceBurial=(seconds)=>{
  const frames=Math.ceil(seconds*60);
  for(let frame=0;frame<frames;frame++){ctx.currentTime+=1/60;burialGame.update(1/60);}
 };
 advanceBurial(.1);
 assert.equal(heroStarts,burialVoiceBefore+1,'third scene starts with hero.mp3');
 assert.ok(firstBurialTarget.formation,'target still dances while hero speaks');
 const overheadRope=[];
 const ropeCanvas=new Proxy({}, {get:(_,key)=>key==='lineTo'?(...args)=>overheadRope.push(args):()=>{}});
 burialGame.burialScene.drawForeground(ropeCanvas,burialGame.arm.wrist.x,burialGame.arm.wrist.y);
 assert.equal(burialGame.burialScene.ropeNodes.length,24,'overhead whip uses connected physics segments');
 assert.ok(overheadRope.length>=23,'hero swings the simulated rope overhead during the voice');
 advanceBurial(burialGame.burialScene.prepDuration-.2);
 assert.ok(firstBurialTarget.formation,'lasso waits for the full hero recording');
 const beforeCatchY=firstBurialTarget.y;
 advanceBurial(1.3);
 assert.equal(firstBurialTarget.formation,undefined,'rope catches one zombie after the voice');
 assert.ok(Math.abs(firstBurialTarget.y-beforeCatchY)<30,
  'the captive stays upright instead of dropping when the rope catches');
 const caughtRope=burialGame.burialScene.ropeNodes;
 assert.ok(caughtRope.length===24&&Math.abs(caughtRope[0].x-burialGame.arm.wrist.x)<.01
  &&Math.abs(caughtRope[0].y-burialGame.arm.wrist.y)<.01
  &&Math.abs(caughtRope.at(-1).x-firstBurialTarget.x)<.01
  &&Math.abs(caughtRope.at(-1).y-(firstBurialTarget.y-47*firstBurialTarget.scale))<.01,
  'the visible rope stays connected from the hero hand to the caught zombie');
 assert.equal(burialGame.zombies.zombies.filter(z=>!z.formation).length,20,
  'the caught zombie is pulled while the others scatter');
 advanceBurial(burialGame.burialScene.walkEnd-burialGame.burialScene.actionTime-.3);
 assert.ok(burialGame.burialScene.cameraX>100,'camera follows the hunter to the right');
 assert.ok(firstBurialTarget.x<burialGame.burialScene.heroX,'the captive trails behind the walking hunter');
 assert.ok(firstBurialTarget.burialDragging && firstBurialTarget.blastAngle>-.6
  &&Math.abs(firstBurialTarget.y-burialGame.burialScene.heroY)<90,
  'the captive stumbles upright behind the rope');
 assert.ok(burialGame.zombies.zombies.slice(1).every(z=>z.x<0||z.x>burialGame.width),
  'the other dancers leave the screen during the capture');
 advanceBurial(burialGame.burialScene.digEnd-burialGame.burialScene.actionTime+.4);
 assert.ok(firstBurialTarget.burialClipY!==undefined,'zombie sinks into the opened grave');
 const burialCanvas=new Proxy({}, {get:()=>()=>{}});
 burialGame.burialScene.drawGround(burialCanvas);
 burialGame.burialScene.drawForeground(burialCanvas,burialGame.arm.wrist.x,burialGame.arm.wrist.y);
 advanceBurial(burialGame.burialScene.buryEnd-burialGame.burialScene.actionTime+.2);
 assert.equal(firstBurialTarget.buried,true,'first zombie is covered with soil');
 assert.equal(burialGame.burialScene.buriedCount,1,'burials are counted one by one');
 const rescueLines=[];
 const rescueCanvas=new Proxy({}, {get:(_,key)=>key==='fillText'
  ? value=>rescueLines.push(value):()=>{}});
 burialGame.drawBurialDialogue(rescueCanvas);
 assert.ok(rescueLines.includes('HEDİYE GÖNDER!'),
  'the hero explains that a gift releases the buried viewer');
 assert.ok(burialGame.zombies.zombies.slice(1).every(z=>z.formation),
  'the other dancers return to their circle after burial');
 const graveLabels=[];
 const graveCanvas=new Proxy({}, {get:(_,key)=>key==='fillText'?(value)=>graveLabels.push(value):()=>{}});
 burialGame.burialScene.drawGround(graveCanvas);
 assert.ok(graveLabels.includes('RIP'),'the finished grave has a visible RIP marker');
 advanceBurial(burialGame.burialScene.cycleEnd-burialGame.burialScene.actionTime+.2);
 assert.ok(burialGame.burialScene.cameraX<20,'camera returns to the main stage after burial');
 assert.ok(burialGame.burialScene.target===burialGame.zombies.zombies[1],
  'the next cycle selects the next zombie');
 assert.equal(heroStarts,burialVoiceBefore+2,'hero.mp3 restarts after the first burial');
 burialGame.burialScene.target=null;
 burialGame.burialScene.endPause=0;
 burialGame.zombies.zombies.forEach(z=>{z.buried=true;z.formation=undefined;});
 const finalBurialVoice=heroStarts;
 advanceBurial(.1);
 assert.equal(heroStarts,finalBurialVoice+1,'hero.mp3 plays after the final burial too');
 advanceBurial(heroDuration+.1);
 assert.ok(burialGame.zombies.zombies.every(z=>!z.buried&&z.formation),
  'the burial scene restores the dancers after the final hero clip');
 burialGame.setBombScene(true);
 assert.equal(burialGame.burialSceneEnabled,false,'switching scenes stops the burial cycle');
 assert.ok(burialGame.zombies.zombies.every(z=>!z.buried&&z.formation),
  'scene switch restores the full dancing ring');
 const mobileCapture=new GameEngine();mobileCapture.restartGame();mobileCapture.setTikTokMode(true);
 mobileCapture.resize(300,960);mobileCapture.setBurialScene(true);
 const offscreenTarget=mobileCapture.zombies.zombies[0];
 offscreenTarget.formation=undefined;
 offscreenTarget.x=mobileCapture.width+170;
 offscreenTarget.y=270;
 offscreenTarget.viewerName='mobile_viewer';
 while(mobileCapture.burialScene.actionTime<.95){ctx.currentTime+=1/60;mobileCapture.update(1/60);}
 const captureFrame=()=>{
  const scene=mobileCapture.burialScene;
  const screenX=offscreenTarget.x-scene.cameraX;
  const labelTop=offscreenTarget.y-117*offscreenTarget.scale-16-scene.cameraY;
  const feet=offscreenTarget.y+12*offscreenTarget.scale-scene.cameraY;
  assert.ok(screenX>=78&&screenX<=mobileCapture.width-78,
   `the mobile camera shows an offscreen zombie during the lasso (${screenX.toFixed(1)})`);
  assert.ok(labelTop>=mobileCapture.height*.24+8,
   'the captive name and head stay inside the mobile action zone');
  assert.ok(feet<=mobileCapture.height*.72+12,
   'the captive feet stay inside the mobile action zone');
 };
 captureFrame();
 while(mobileCapture.burialScene.actionTime<1.07){ctx.currentTime+=1/60;mobileCapture.update(1/60);}
 assert.equal(offscreenTarget.burialDragging,true,'the offscreen zombie is caught after the visible throw');
 captureFrame();
 const dialogueLines=[];
 const dialogueCanvas=new Proxy({}, {get:(_,key)=>key==='fillText'
  ? value=>dialogueLines.push(value):()=>{}});
 const checkDialogue=(until,expected)=>{
  while(mobileCapture.burialScene.actionTime<until){ctx.currentTime+=1/60;mobileCapture.update(1/60);}
  dialogueLines.length=0;
  mobileCapture.drawBurialDialogue(dialogueCanvas);
  assert.ok(dialogueLines.includes(expected),`burial speech includes ${expected}`);
 };
 checkDialogue(1.15,'TÖVBE TÖVBE');
 checkDialogue(2.45,'ŞÜKÜR ALLAH!');
 checkDialogue(3.75,'HEDİYE ATICAM!');
 checkDialogue(5.05,'HEDİYE ATINCA');
 const hellGame=new GameEngine();hellGame.restartGame();hellGame.resize(300,960);
 hellGame.setHellScene(true);
 assert.equal(hellGame.burialScene.mode,'hell','fourth scene uses the burning pit');
 const doomed=hellGame.zombies.zombies[0];
 while(hellGame.burialScene.actionTime<hellGame.burialScene.walkEnd-.1){ctx.currentTime+=1/60;hellGame.update(1/60);}
 assert.ok(doomed.burialDragging,'the hero drags the captive to the hell pit');
 assert.ok(hellGame.burialScene.cameraX>0,'camera follows the captive toward the pit');
 while(hellGame.burialScene.actionTime<hellGame.burialScene.digEnd-.15){ctx.currentTime+=1/60;hellGame.update(1/60);}
 assert.ok(doomed.isBurning && doomed.x>hellGame.playerX,
  'the captive flies into the pit and catches fire');
 assert.ok(hellGame.burialScene.graveX-hellGame.burialScene.cameraX<hellGame.width-45,
  'the burning pit stays in the mobile camera frame');
 while(hellGame.burialScene.actionTime<hellGame.burialScene.buryEnd+.1){ctx.currentTime+=1/60;hellGame.update(1/60);}
 assert.ok(doomed.buried && hellGame.burialScene.skeletons.length===1,
  'the burned zombie becomes a visible skeleton');
 const fireCanvas=new Proxy({}, {get:(_,key)=>key==='createRadialGradient'
  ? ()=>({addColorStop(){}}):()=>{}});
 hellGame.burialScene.drawGround(fireCanvas);
 hellGame.burialScene.drawForeground(fireCanvas,0,0);
 hellGame.setBurialScene(true);
 assert.equal(hellGame.hellSceneEnabled,false,'scene switch leaves hell');
 assert.equal(hellGame.burialScene.skeletons.length,0,'scene reset clears the pit');
 const fullBurial=new GameEngine();fullBurial.restartGame();fullBurial.resize(540,960);
 fullBurial.setBurialScene(true);
 let maxBuried=0,burialLooped=false;
 const buriedOrder=[];
 const burialPositions=[];
 let previousBuried=0;
 for(let frame=0;frame<60*750;frame++){
  ctx.currentTime+=1/60;fullBurial.update(1/60);
  if(fullBurial.burialScene.buriedCount>previousBuried){
   const next=fullBurial.zombies.zombies.find(z=>z.buried&&!buriedOrder.includes(z.id));
   if(next)buriedOrder.push(next.id);
   burialPositions.push({x:fullBurial.burialScene.graveX,y:fullBurial.burialScene.graveY});
  }
  previousBuried=fullBurial.burialScene.buriedCount;
  maxBuried=Math.max(maxBuried,fullBurial.burialScene.buriedCount);
  if(maxBuried===20&&fullBurial.burialScene.buriedCount===0){burialLooped=true;break;}
 }
 assert.equal(maxBuried,20,'all twenty zombies are buried one at a time');
 assert.deepEqual(buriedOrder,fullBurial.zombies.zombies.map(z=>z.id),
  'the lasso catches and buries dancers in order');
 assert.equal(new Set(burialPositions.map(p=>`${p.x.toFixed(0)},${p.y.toFixed(0)}`)).size,20,
  'each zombie is buried at a different position');
 assert.ok(burialPositions.every((p,i)=>burialPositions.slice(0,i).every(q=>
  Math.hypot((p.x-q.x)/100,(p.y-q.y)/42)>=1)),
  'random graves stay clear of earlier graves');
 assert.ok(burialPositions.some(p=>p.x>fullBurial.playerX+fullBurial.width*.7)
  &&burialPositions.some(p=>p.x<fullBurial.playerX-fullBurial.width*.7)
  &&burialPositions.some(p=>p.y<fullBurial.groundY-65)
  &&burialPositions.some(p=>p.y>fullBurial.groundY+65),
  'burials spread right, left, up, and down');
 assert.ok(burialLooped&&fullBurial.zombies.zombies.every(z=>!z.buried&&z.formation),
  'the complete third scene restarts with a full dancing ring');
 soundEngine.stopWhip();
 const interruptedWhip=new GameEngine();interruptedWhip.restartGame();interruptedWhip.resize(540,960);
 const whipAudioBeforeSwitch=lastSource;
 for(let frame=0;frame<60&&!soundEngine.attack?.prepStart;frame++){
  ctx.currentTime+=1/60;interruptedWhip.update(1/60);
 }
 assert.ok(soundEngine.attack?.prepStart!==undefined,'normal scene begins with hero voice');
 assert.equal(lastSource,whipAudioBeforeSwitch,'whip recording stays silent during hero voice');
 interruptedWhip.setBombScene(true);
 for(let frame=0;frame<60*14;frame++){
  ctx.currentTime+=1/60;interruptedWhip.update(1/60);
 }
 assert.equal(lastSource,whipAudioBeforeSwitch,'switching scenes cancels the pending whip sound');
 let imageDraw;
 const canvas=new Proxy({}, {get:(_,key)=>key==='drawImage'?(...args)=>{imageDraw=args;}:()=>{}});
 bombGame.atmosphere.drawBackground(canvas,540,960,{complete:true,naturalWidth:100},bombGame.groundY);
 assert.ok(imageDraw[1]<0&&imageDraw[2]<0&&imageDraw[3]>540&&imageDraw[2]+imageDraw[4]>960,
  'background overscan covers camera shake at every edge');
 soundEngine.stopWhip();
 const clickedGame=new GameEngine();clickedGame.restartGame();clickedGame.resize(540,960);
 const clickedHits=[];
 const originalClickedHit=clickedGame.handleZombieHit.bind(clickedGame);
 clickedGame.handleZombieHit=(z,...args)=>{clickedHits.push(z.id);originalClickedHit(z,...args);};
 for(let frame=0;frame<60&&!soundEngine.attack?.prepStart;frame++){
  ctx.currentTime+=1/60;clickedGame.update(1/60);
 }
 assert.ok(soundEngine.attack?.prepStart!==undefined,'automatic whip is in its long intro');
 const selectedZombie=clickedGame.zombies.zombies[7];
 const selectedHead=clickedGame.zombies.getHitTargets(selectedZombie)[0];
 assert.equal(clickedGame.snapAt(selectedHead.x,selectedHead.y),true,'head click is accepted during auto mode');
 let manualStarted=false;
 for(let frame=0;frame<60*3;frame++){
  ctx.currentTime+=1/60;clickedGame.update(1/60);
  if(soundEngine.attack?.prepStart===undefined&&soundEngine.attack?.duration===.36)manualStarted=true;
  if(clickedHits.length)break;
 }
 assert.ok(manualStarted,'click starts a short manual whip without the hero intro');
 assert.deepEqual(clickedHits,[selectedZombie.id],'the clicked zombie receives the whip hit');
 soundEngine.stopWhip();
 const before=soundEngine.audioTime;
 ctx.currentTime+=100;soundEngine.setPaused(false);
 soundEngine.advanceClock(1/60);
 assert.ok(soundEngine.audioTime-before<.1,'resume does not skip an entire attack');
 const beatCountBefore=soundEngine.bassBeatCount;
 ctx.currentTime+=24*60*60;
 const catchupStart=performance.now();
 soundEngine.advanceClock(1/60);
 assert.ok(performance.now()-catchupStart<100,'a long suspended source skips missed music loops promptly');
 assert.ok(soundEngine.bassBeatCount>beatCountBefore,'music beat position catches up after suspension');
 console.log('PASS original whip pitch/rate, actual audio scheduling after recovery, and explicit pause/resume.');
} finally { await rm(dir,{recursive:true,force:true}); }
