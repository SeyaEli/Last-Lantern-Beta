import {actionTiming,attackBodyMotion,locomotionFrame,combatMotion,motionEvent,actorImpact,actorRelease,inheritActorMotion,sampleActorMotion,stepCombatMotion,drawMotionGround,drawMotionForeground} from '../systems/combat-motion.mjs';
import {SUPPLY_ART_FILES,MATERIALS,CONSUMABLES,SUPPLY_SHOP,buySupply,grantInventory,materialRewards,validSupplyRun,consumeSupply,tickSupplies} from '../systems/supplies.mjs';
import {ARMORS,emptyEnhancement,validEnhancement,gearItem,gearOwned,gearEnhancement,nextEnhancement,enhancementCost,enhancementRecipe,enhancementChance,gearStats,normalizeGearSave,validGearSave,enhanceGear,buyArmor} from '../systems/equipment.mjs';
import {WARDEN_CONFIG,isWarden,wardenCasting,createWardenState,validWardenState,interruptWarden,tickWarden,chooseWardenZone} from '../systems/void-warden.mjs';
import {drawWarden} from '../systems/void-warden-renderer.mjs';
import {MIMIC_CONFIG,isMimic,isMimicDecoy,createMimicState,validMimicState,interruptMimic,tickMimic,chooseMimicCopies} from '../systems/spectral-mimic.mjs';
import {drawMimic} from '../systems/spectral-mimic-renderer.mjs';
import {EATER_CONFIG,createEaterState,validEaterState,eaterCasting,interruptEater,tickLanternEater} from '../systems/lantern-eater.mjs';
import {drawLanternEater} from '../systems/lantern-eater-renderer.mjs';
import {BRUTE_CONFIG,isBrute,createBruteState,validBruteState,interruptBrute,tickBrute} from '../systems/brute.mjs';
import {drawBrute} from '../systems/brute-renderer.mjs';
import {RUNNER_CONFIG,isRunner,createRunnerState,validRunnerState,interruptRunner,tickRunner} from '../systems/runner.mjs';
import {drawRunner} from '../systems/runner-renderer.mjs';
import {STALKER_CONFIG,isShadowStalker,stalkerAttacking,createStalkerState,validStalkerState,interruptStalker,tickShadowStalker} from '../systems/shadow-stalker.mjs';
import {drawShadowStalker} from '../systems/shadow-stalker-renderer.mjs';
import {ARCHER_CONFIG,isCoverArcher,createArcherState,validArcherState,chooseArcherCover,interruptArcher,tickCoverArcher} from '../systems/cover-archer.mjs';
import {drawCoverArcher} from '../systems/cover-archer-renderer.mjs';
import {DIRECTOR_CONFIG,createDirector,validDirector,directorRandom,directorPhase,threatBudget,planDirectorWave,chooseDirectorSpawn} from '../systems/spawn-director.mjs';
import {COMBAT_CONFIG,beginCombatFrame,finishCombatMovement,endCombatFrame,resolvePlayerDamage,projectilePlayerContact,rushPlayerContact,sweepCircle} from '../systems/combat.mjs';
import {LANTERN_CONFIG,createLanternState,validLanternState,cycleLanternMode,lanternMessage,lanternStatus,shadowSpeedMultiplier,tickLantern,resetLanternMap,dropLanternPickup} from '../systems/lantern.mjs';
import {drawLanternWorld} from '../systems/lantern-renderer.mjs';

export function createGameRuntime(options){
const spriteData=options.assetManifest;
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const canvas=$('#game'),ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
const W=800,H=500,MW=2400,MH=1500,SAVE_KEY='last-lantern-v2';

// Reference-based cutouts are embedded so this file works with no asset folder or internet.
// Small pose atlases are baked once from the existing artwork. No network assets.
const animationSheets={};
const animationStates={idle:{frames:4,fps:5},walk:{frames:8,fps:12},attack:{frames:6,fps:24},dash:{frames:4,fps:24},skill:{frames:8,fps:12},hurt:{frames:4,fps:20},death:{frames:8,fps:16}};
const reducedMotion=!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
function makeAnimationSheet(id,force=false){
  if(!['brann','nyx','orin','rook','sera','jax','wisp','bat','king'].includes(id)&&!id.startsWith('enemy')&&!id.startsWith('held_'))return;
  if(id.startsWith('held_')&&!force)return;
  const image=spriteImages[id];if(!image?.loaded||animationSheets[id])return;
  const f=Math.min((id==='king'?156:128)/image.naturalHeight,160/image.naturalWidth);
  const width=Math.round(image.naturalWidth*f),height=Math.round(image.naturalHeight*f),pad=28;
  const base=document.createElement('canvas');base.width=width;base.height=height;
  const b=base.getContext('2d');b.imageSmoothingEnabled=false;b.drawImage(image,0,0,width,height);
  const sheet={width:width+pad*2,height:height+pad*2,bodyW:width,bodyH:height,pad,states:{}};
  for(const [state,def] of Object.entries(animationStates)){
    const atlas=document.createElement('canvas');atlas.width=sheet.width*def.frames;atlas.height=sheet.height;
    const c=atlas.getContext('2d');c.imageSmoothingEnabled=false;
    for(let frame=0;frame<def.frames;frame++){
      c.save();c.translate(frame*sheet.width+pad,pad);
      bakePose(c,base,id,state,frame/def.frames,width,height);c.restore();
    }
    sheet.states[state]={canvas:atlas,frames:def.frames,fps:def.fps};
  }
  animationSheets[id]=sheet;
}
function bakePose(c,image,id,state,p,w,h){
  if(id.startsWith('held_')){bakeHeldPose(c,image,id,state,p,w,h);return;}
  if(id.startsWith('enemy'))id=id==='enemy3_99'||id.endsWith('_1')?'bat':id.endsWith('_3')?'wisp':id.endsWith('_99')?'king':'mob';
  const wave=Math.sin(p*Math.PI*2),stride=state==='walk'?wave:state==='dash'?Math.sin(p*Math.PI)*1.4:0;
  const action=state==='attack'?Math.sin(Math.min(1,p*1.25)*Math.PI):state==='skill'?Math.sin(p*Math.PI):0;
  const isHero=['brann','nyx','orin','rook','sera','jax'].includes(id);
  c.save();
  if(state==='death'){
    c.globalAlpha=Math.max(0,1-p*1.15);c.translate(w/2,h);c.rotate(p*(id==='bat'?1.1:.32));c.scale(1-p*.36,1-p*.65);c.translate(-w/2,-h);
  }else if(state==='hurt'){
    c.translate(w/2,h);c.scale(1+Math.sin(p*Math.PI)*.13,1-Math.sin(p*Math.PI)*.1);c.translate(-w/2,-h);
  }else{
    const lean=state==='dash'?.19:state==='attack'?.075*action:state==='skill'?-.04*action:stride*.018;
    c.translate(w*.58,h*.78);c.rotate(lean);c.translate(-w*.58,-h*.78);
    if(state==='walk')c.translate(0,-Math.abs(stride)*2.2);
    if(state==='skill'&&id==='orin')c.translate(0,-action*8);
    if(state==='idle')c.translate(0,-wave*.8);
  }
  if(id==='bat'){
    const flap=state==='walk'||state==='idle'?wave:state==='attack'?-.7+action*1.3:wave*.4;
    const pivotY=h*.37,left=w*.42,right=w*.59;
    c.save();c.translate(left,pivotY);c.rotate(flap*.62);c.scale(1,.7+(.5+.5*wave)*.4);
    c.drawImage(image,0,0,left,h*.86,-left,-pivotY,left,h*.86);c.restore();
    c.save();c.translate(right,pivotY);c.rotate(-flap*.62);c.scale(1,.7+(.5+.5*wave)*.4);
    c.drawImage(image,right,0,w-right,h*.86,0,-pivotY,w-right,h*.86);c.restore();
    c.drawImage(image,w*.37,0,w*.26,h,w*.37,0,w*.26,h);
  }else if(id==='wisp'){
    for(let y=0;y<h;y+=3){
      const sh=Math.min(3,h-y),tail=Math.max(0,(y/h-.35)/.65),sway=Math.sin(p*Math.PI*2-y/h*4)*tail*7;
      const spread=state==='death'?(y%9-4)*p*3:0;
      c.drawImage(image,0,y,w,sh,sway+spread,y,w,sh);
    }
  }else{
    const armMove=(isHero||id==='king')&&(state==='attack'||state==='skill'),armX=w*.75,armY=h*.36,armW=w-armX,armH=h*.39;
    c.save();
    if(armMove){c.beginPath();c.rect(-20,-20,w+40,h+40);c.rect(armX,armY,armW,armH);c.clip('evenodd')}
    const legsY=Math.round(h*(id==='nyx'?.74:.79)),split=Math.round(w*(id==='brann'?.64:.55)),legStart=id==='brann'?Math.round(w*.31):0;
    if(stride&&id!=='orin'){
      // Separate lower-body pieces rotate in opposing phases; the torso covers the seam.
      if(legStart)c.drawImage(image,0,legsY,legStart,h-legsY,0,legsY,legStart,h-legsY);
      const hip=(legStart+split)/2;
      c.save();c.translate(hip,legsY);c.rotate(stride*.19);c.translate(-hip,-legsY);
      c.drawImage(image,legStart,legsY,split-legStart,h-legsY,legStart,legsY-Math.max(0,stride)*3,split-legStart,h-legsY);c.restore();
      c.save();c.translate(split+(w-split)*.5,legsY);c.rotate(-stride*.17);c.translate(-(split+(w-split)*.5),-legsY);
      c.drawImage(image,split,legsY,w-split,h-legsY,split,legsY-Math.max(0,-stride)*3,w-split,h-legsY);c.restore();
    }
    const bodyEnd=stride&&id!=='orin'?legsY+2:h;
    for(let y=0;y<bodyEnd;y+=3){
      const sh=Math.min(3,bodyEnd-y),cloth=Math.max(0,(y/h-.48)/.52);
      let shift=Math.sin(p*Math.PI*2-y/h*3)*cloth*(state==='walk'?3.5:state==='skill'?4:state==='idle'?1.2:2);
      if(id==='brann'&&y<h*.55)shift*=.2;
      if(state==='death')shift+=(y%12-6)*p*2;
      c.drawImage(image,0,y,w,sh,Math.round(shift),y,w,sh);
    }
    c.restore();
    if(armMove){
      c.save();c.translate(armX+1,armY+3);c.rotate((id==='nyx'?.34:id==='orin'?-.35:-.3)*action);
      c.drawImage(image,armX,armY,armW,armH,-1,-3,armW,armH);c.restore();
    }
  }
  c.restore();
}
function paintAnimated(c,id,state,phase,x,y,w,h,flip=false){
  const sheet=animationSheets[id],clip=sheet?.states[state];
  if(!clip)return paintSprite(c,id,x,y,w,h,flip);
  const n=clip.frames,index=Math.max(0,Math.min(n-1,Math.floor(phase*n)));
  const scale=Math.min(w/sheet.bodyW,h/sheet.bodyH);
  c.save();c.translate(Math.round(x),Math.round(y));if(flip)c.scale(-1,1);if(c===ctx)c.scale(artAspect,1);
  c.imageSmoothingEnabled=false;
  c.drawImage(clip.canvas,index*sheet.width,0,sheet.width,sheet.height,
    Math.round(-(sheet.bodyW/2+sheet.pad)*scale),Math.round(-(sheet.bodyH+sheet.pad)*scale),Math.round(sheet.width*scale),Math.round(sheet.height*scale));
  c.restore();return true;
}
function loopPhase(time,fps,frames){return ((time*fps)%frames)/frames}
function getHeroPose(r){
  const a=r.anim;
  if(r.dashTime>0)return {state:'dash',phase:Math.min(.99,1-r.dashTime/.2)};
  if(a.skillLeft>0)return {state:'skill',phase:Math.min(.99,1-a.skillLeft/.72)};
  if(a.hurtLeft>0)return {state:'hurt',phase:Math.min(.99,1-a.hurtLeft/.18)};
  if(a.attackLeft>0)return {state:'attack',phase:.3+Math.min(.69,(1-a.attackLeft/.23)*.7)};
  if(r.attack>0&&r.attack<.1&&r.enemies.length)return {state:'attack',phase:(1-r.attack/.1)*.3};
  return a.moving?{state:'walk',phase:loopPhase(a.walkClock,12,8)}:{state:'idle',phase:loopPhase(r.time,5,4)};
}
function tickSpriteAnimation(r,dt){
  const a=r.anim;
  for(const k of ['attackLeft','skillLeft','hurtLeft'])a[k]=Math.max(0,a[k]-dt);
  r.ghosts.forEach(g=>g.life-=dt);r.ghosts=r.ghosts.filter(g=>g.life>0);
  r.corpses.forEach(e=>e.deathAge+=dt);r.corpses=r.corpses.filter(e=>e.deathAge<e.deathDuration);
  for(const e of r.enemies){e.attackAnim=Math.max(0,(e.attackAnim||0)-dt)}
  a.trailLeft=Math.max(0,a.trailLeft-dt);
  if(r.dashTime>0&&a.trailLeft<=0){
    a.trailLeft=reducedMotion?.09:.027;
    r.ghosts.push({x:r.x,y:r.y,heading:r.heading,phase:Math.min(.99,1-r.dashTime/.2),life:.27,maxLife:.27});
    if(r.ghosts.length>8)r.ghosts.shift();
  }
}
function drawDashTrails(c,r){
  for(const g of r.ghosts){
    c.save();c.globalAlpha=g.life/g.maxLife*(reducedMotion?.16:.38);c.filter='brightness(1.5) saturate(.5)';
    paintAnimated(c,r.hero.id,'dash',g.phase,g.x,g.y+15,63,66,g.heading<0);c.restore();
  }
  if(r.dashTime>0){
    c.save();c.strokeStyle=r.hero.color;c.globalAlpha=.7;c.lineWidth=2;
    for(let i=-1;i<=1;i++){const sx=r.x-r.lastDx*(18+i*4)+r.lastDy*i*5,sy=r.y-r.lastDy*(18+i*4)-r.lastDx*i*5;c.beginPath();c.moveTo(sx,sy);c.lineTo(sx-r.lastDx*24,sy-r.lastDy*24);c.stroke()}c.restore();
  }
}
function drawHeroAction(c,r){
  const a=r.anim;
  c.save();c.translate(r.x,r.y-8);
  if(a.attackLeft>0){
    const p=Math.max(0,Math.min(1,1-a.attackLeft/.34)),angle=r.aim||0;
    if(['keeper','brawler'].includes(r.hero.classId)){
      c.strokeStyle=r.weapon.color;c.globalAlpha=(1-p)*.8;c.lineWidth=5;
      c.beginPath();c.arc(0,0,27,angle-1.1+p*.5,angle+.2+p*1.3);c.stroke();
      c.strokeStyle='#f5ecd7';c.lineWidth=1;c.beginPath();c.arc(0,0,30,angle-.9+p*.5,angle+.2+p*1.3);c.stroke();
    }else{
      c.translate(Math.cos(angle)*23,Math.sin(angle)*17);c.rotate(angle);c.globalAlpha=(1-p)*.85;
      c.fillStyle=r.weapon.color;for(let i=0;i<3;i++){const d=8+p*18+i*4;rect(c,d,-3+i*3,5,2,r.weapon.color)}
    }
  }
  c.restore();
  if(a.skillLeft<=0)return;
  const p=1-a.skillLeft/.72,t=r.time;
  c.save();c.translate(r.x,r.y+8);c.globalAlpha=Math.sin(p*Math.PI)*.8;
  const color=r.hero.color;c.strokeStyle=color;c.fillStyle=color;c.lineWidth=2;
  if(r.hero.id==='brann'){
    for(let i=0;i<12;i++){const a=i*Math.PI/6,inner=24+p*30,outer=inner+10+Math.sin(p*Math.PI)*20;c.beginPath();c.moveTo(Math.cos(a-.05)*inner,Math.sin(a-.05)*inner);c.lineTo(Math.cos(a)*outer,Math.sin(a)*outer);c.lineTo(Math.cos(a+.05)*inner,Math.sin(a+.05)*inner);c.fill()}
  }else if(r.hero.id==='nyx'){
    for(let i=0;i<6;i++){const a=t*5+i*Math.PI/3,rad=30+p*20;c.beginPath();c.arc(0,-8,rad,a,a+.55);c.stroke();c.save();c.translate(Math.cos(a)*rad,Math.sin(a)*rad-8);c.rotate(a);rect(c,-3,-3,6,6,color);c.restore()}
  }else{
    c.scale(1,.45);c.beginPath();c.arc(0,0,29+p*15,0,Math.PI*2);c.stroke();
    for(let i=0;i<8;i++){const a=i*Math.PI/4-t;c.save();c.translate(Math.cos(a)*37,Math.sin(a)*37);c.rotate(a);c.strokeRect(-3,-3,6,6);c.restore()}
    c.scale(1,1/.45);for(let i=0;i<8;i++){const x=Math.sin(i*9)*28,y=-((p*65+i*11)%65);rect(c,x,y,2,5,color)}
  }
  c.restore();
}
function drawAnimatedHero(c,x,y,h,t=0,scale=1){
  if(!animationSheets[h.id])return false;
  const active=c===ctx&&run&&run.hero.id===h.id,r=active?run:null;
  const pose=r?getHeroPose(r):{state:'idle',phase:loopPhase(idleTime,5,4)},flip=!!r&&r.heading<0;
  c.save();c.translate(Math.round(x),Math.round(y));c.scale(scale,scale);
  c.fillStyle='#07161b99';c.beginPath();c.ellipse(0,12,12,4,0,0,Math.PI*2);c.fill();
  const walkingBlend=r?.anim.moving&&pose.state==='attack';
  if(walkingBlend){c.save();c.beginPath();c.rect(-80,-100,160,102);c.clip();paintAnimated(c,h.id,pose.state,pose.phase,0,15,63,66,flip);c.restore();c.save();c.beginPath();c.rect(-80,2,160,40);c.clip();paintAnimated(c,h.id,'walk',loopPhase(r.anim.walkClock,12,8),0,15,63,66,flip);c.restore()}
  else paintAnimated(c,h.id,pose.state,pose.phase,0,15,63,66,flip);
  if(r){
    const p=r.anim.attackLeft>0?1-r.anim.attackLeft/.23:0,aim=r.aim||0;
    const arm=pose.state==='skill'?-1.1:pose.state==='attack'?aim+.75-Math.sin(p*Math.PI)*.9:flip?-.55:.55;
    c.save();c.translate(flip?-15:15,-2-(pose.state==='skill'?8:0));c.rotate(arm);
    paintSprite(c,r.weapon.id,0,17,24,36,flip);c.restore();
  }
  c.restore();return true;
}
function drawAnimatedEnemy(c,e,t){
  const id=e.boss?'king':e.type===1?'bat':'wisp';if(!animationSheets[id])return false;
  let state='walk',phase=loopPhase((Number.isFinite(e.phase)?e.phase:t)+(e.x||0)*.001,e.type===1?18:8,8);
  if(e.dead){state='death';phase=Math.min(.99,e.deathAge/e.deathDuration)}
  else if(e.flash>0){state='hurt';phase=Math.min(.99,1-e.flash/.12)}
  else if(e.charging>0){state='dash';phase=Math.min(.99,1-e.charging/.42)}
  else if(e.attackAnim>0){state='attack';phase=.4+Math.min(.59,(1-e.attackAnim/.4)*.6)}
  else if((e.boss||e.type===2)&&e.shoot<.45){state='attack';phase=Math.max(0,(1-e.shoot/.45)*.4)}
  const height=e.boss?123:e.type===4?70:e.type===1?37:45,width=e.boss?118:e.type===4?66:e.type===1?67:48;
  c.save();c.translate(Math.round(e.x),Math.round(e.y));
  c.fillStyle='#06171b88';c.beginPath();c.ellipse(0,e.size*.7,e.size*.85,e.size*.26,0,0,Math.PI*2);c.fill();
  if(e.flash>.065)c.filter='brightness(1.65)';
  else if(e.boss&&run?.bossPhase2)c.filter='hue-rotate(315deg) saturate(1.6) brightness(1.12)';
  else if(e.type===3){c.filter='hue-rotate(75deg)';c.globalAlpha=.78}
  else if(e.type===4)c.filter='sepia(.7) saturate(1.6)';
  else if(e.type===2)c.filter='hue-rotate(25deg) brightness(.9)';
  const flip=!!run&&run.x<e.x;
  paintAnimated(c,id,state,phase,0,e.size*.7,width,height,flip);c.filter='none';c.globalAlpha=1;
  if(!e.dead&&e.type===2){c.save();c.translate(flip?-16:16,0);c.rotate(state==='attack'?(phase-.5)*.6:0);paintSprite(c,'storm',0,15,22,36,flip);c.restore()}
  if(!e.dead&&(e.boss||e.type===2)&&e.shoot<.45){
    c.strokeStyle=e.boss?'#d3a3ee':'#a7d6ae';c.lineWidth=2;c.globalAlpha=.7;c.beginPath();c.arc(0,-height*.43,8+(1-e.shoot/.45)*13,0,Math.PI*2);c.stroke();c.globalAlpha=1;
  }
  if(!e.dead&&e.boss&&run?.bossPhase2){for(let i=0;i<5;i++){const a=t*2+i*Math.PI*2/5;rect(c,Math.cos(a)*48-3,Math.sin(a)*30-20,5,5,'#e9a3ff')}}
  c.restore();return true;
}

const spriteImages={};let artAspect=1;
for(const [id,data] of Object.entries(spriteData)){
  const image=options.images?.[id]||new Image();spriteImages[id]=image;
  if(options.images?.[id]){image.loaded=true;makeAnimationSheet(id);continue}
  image.onload=()=>{image.loaded=true;makeAnimationSheet(id);renderShop()};image.onerror=()=>{image.loaded=false};image.src=data;
}
function paintSprite(c,id,x,y,w,h,flip=false){
  const image=spriteImages[id];if(!image?.loaded)return false;
  const ratio=image.naturalWidth/image.naturalHeight;
  const dw=Math.min(w,h*ratio),dh=dw/ratio;
  c.save();c.imageSmoothingEnabled=false;c.translate(Math.round(x),Math.round(y));
  if(flip)c.scale(-1,1);if(c===ctx)c.scale(artAspect,1);
  c.drawImage(image,Math.round(-dw/2),Math.round(-dh),Math.round(dw),Math.round(dh));c.restore();return true;
}
function paintArtBox(c,id){const g=c.getContext('2d');g.clearRect(0,0,c.width,c.height);paintSprite(g,id,c.width/2,c.height-4,c.width-8,c.height-8)}


const heroes=[
  {id:'brann',name:'Brann',role:'The lantern keeper',desc:'Steady warrior with high health. Clears nearby foes with a broad sunburst blast.',cost:0,hp:120,speed:125,dmg:22,rate:.62,color:'#f7bf72',skill:'Sunburst',cd:14},
  {id:'nyx',name:'Nyx',role:'The dusk ranger',desc:'Agile forest hunter. Moves swift and releases a 16-arrow piercing starfall.',cost:160,hp:90,speed:155,dmg:18,rate:.42,color:'#a7d6ae',skill:'Starfall',cd:12},
  {id:'orin',name:'Orin',role:'The ember mage',desc:'Mystic scholar of fire. High burst damage and Mend ability to restore health.',cost:260,hp:100,speed:118,dmg:34,rate:.76,color:'#b5a0ed',skill:'Mend',cd:16}
];

const weapons=[
  {id:'iron',name:'Iron Blade',rarity:'common',desc:'Reliable forged steel. A sturdy starting weapon for any survivor.',cost:0,dmg:0,rateBonus:0,pierce:false,multi:0,special:null,color:'#d7e1cf',stat:'Standard balanced steel'},
  {id:'silver',name:'Silver Edge',rarity:'rare',desc:'Gleaming holy blade. Attacks pierce through multiple foes seamlessly.',cost:120,dmg:9,rateBonus:0,pierce:true,multi:0,special:null,color:'#c8e0f5',stat:'+9 DMG · Piercing Strikes'},
  {id:'ember',name:'Ember Staff',rarity:'rare',desc:'Volcanic crystal focus. Projectiles ignite scorching fire patches on the ground.',cost:210,dmg:14,rateBonus:-.05,pierce:false,multi:0,special:'burn',color:'#ff9344',stat:'+14 DMG · Burning Ground'},
  {id:'storm',name:'Stormbow',rarity:'epic',desc:'Windrunner twin-bow. Fires two arrows simultaneously with lightning speed.',cost:310,dmg:8,rateBonus:.12,pierce:false,multi:1,special:null,color:'#94e5b2',stat:'+8 DMG · Twin Volley (+1 Shot)'},
  {id:'void',name:'Void Fang',rarity:'leg',desc:'Ancient cursed dagger. Saps enemy lifeforce, healing you on every hit.',cost:430,dmg:18,rateBonus:0,pierce:true,multi:0,special:'lifesteal',color:'#c49eff',stat:'+18 DMG · Pierce + Life Steal (+3 HP)'}
];

// Stable IDs keep existing saves and weapon purchases compatible.
Object.assign(heroes[0],{classId:'keeper',role:'Lantern Keeper · Brann class',desc:'Sword sweeps and Sunburst knockback. The lantern keeper balances reach, health and defense.',range:108});
Object.assign(heroes[1],{classId:'archer',role:'Archer · The dusk ranger',cost:0,desc:'Long-range arrows and a piercing Starfall volley. Keep your distance.',range:480});
Object.assign(heroes[2],{classId:'mage',role:'Mage · The ember scholar',cost:0,skill:'Inferno',desc:'Fireballs attack at range. Inferno burns every foe nearby.',range:360});
heroes.push(
 {id:'rook',classId:'brawler',name:'Rook',role:'Brawler · The iron fist',desc:'Heavy gauntlets cleave nearby enemies. Earthshatter stuns and knocks back the crowd.',cost:0,hp:170,speed:145,dmg:44,rate:.48,color:'#f49b8d',skill:'Earthshatter',cd:11,range:85},
 {id:'sera',classId:'healer',name:'Sera',role:'Healer · The dawn priest',desc:'Holy bolts restore a little health on hit. Sanctuary heals, shields and repels enemies.',cost:0,hp:110,speed:132,dmg:23,rate:.64,color:'#e8d7a0',skill:'Sanctuary',cd:15,range:340},
 {id:'jax',classId:'gunner',name:'Jax',role:'Gunner · The ash marksman',desc:'A fast rifle with unlimited ammunition. Overdrive fires a piercing fan toward the nearest foe.',cost:0,hp:95,speed:140,dmg:15,rate:.24,color:'#7ec3ed',skill:'Overdrive',cd:12,range:530}
);
for(const w of weapons)w.classId=['iron','silver','void'].includes(w.id)?'keeper':w.id==='storm'?'archer':'mage';
const extraWeapons=[
 ['crook','Keeper’s Crook','keeper',0,0,'A lantern-tipped crook. Broad close-range strikes.','#ffc76b'],
 ['bow','Dusk Bow','archer',0,0,'A steady bow with long-range arrows.','#a7d6ae'],
 ['wand','Apprentice Staff','mage',0,0,'A crystal staff firing explosive sparks.','#b5a0ed'],
 ['fists','Iron Gauntlets','brawler',0,0,'Heavy fists. Cleave every enemy within reach.','#f49b8d'],
 ['titan','Titan Knuckles','brawler',230,16,'Reinforced gauntlets. Stronger blows and faster recovery.','#ffc76b'],
 ['scepter','Dawn Scepter','healer',0,0,'Holy bolts restore 1 health on each hit.','#e8d7a0'],
 ['halo','Halo Scepter','healer',250,12,'Radiant piercing bolts restore 2 health on hit.','#fff0cd'],
 ['rifle','Scout Rifle','gunner',0,0,'Fast precise shots. Unlimited ammunition.','#7ec3ed'],
 ['repeater','Thunder Repeater','gunner',280,8,'Twin barrels fire two bullets per volley.','#c8e0f5']
];
for(const [id,name,classId,cost,dmg,desc,color]of extraWeapons)weapons.push({id,name,classId,cost,dmg,desc,color,rarity:cost?'rare':'common',rateBonus:id==='titan'?.06:0,pierce:id==='halo',multi:id==='repeater'?1:0,special:classId==='healer'?'heal':null,stat:cost?'+'+dmg+' damage · '+classId:'Starter · '+classId});
const classStarters={keeper:'crook',archer:'bow',mage:'wand',brawler:'fists',healer:'scepter',gunner:'rifle'};
const chapters=[
 {name:'Whispering Woods',boss:'The Hollow King',ground:'#203833',detail:'#325243',accent:'#a7d6ae',family:['Wisp','Shade Bat','Thorncaster','Hollow Specter','Root Brute']},
 {name:'Cinder Quarry',boss:'Cindermaw',ground:'#392e2b',detail:'#514039',accent:'#ff9344',family:['Ash Crawler','Coal Moth','Ember Spitter','Cinder Stalker','Basalt Charger']},
 {name:'Frostfall Ruins',boss:'Eclipse Matriarch',ground:'#24343f',detail:'#344e60',accent:'#7ec3ed',family:['Frost Guard','Icewing','Rune Acolyte','Rift Shade','Glacier Golem']}
];
chapters.push(
 {name:'Ashen Citadel',boss:'The Iron Tyrant',ground:'#302a29',detail:'#4c4140',accent:'#ff9344',family:['Ash Legionnaire','Furnace Moth','Siege Pyromancer','Cinder Assassin','Furnace Knight']},
 {name:'Drowned Necropolis',boss:'The Grave Cantor',ground:'#233936',detail:'#3d5450',accent:'#9cdcc3',family:['Gravebound','Cryptwing','Bell Acolyte','Mourning Shade','Tomb Colossus']},
 {name:'Obsidian Throne',boss:'The Ashen Sovereign',ground:'#30232f',detail:'#4c3549',accent:'#f49b8d',family:['Royal Revenant','Bloodwing','Crimson Seer','Void Reaper','Crimson Executioner']}
);
const recruitment={brann:0,rook:150000,nyx:250000,orin:500000,sera:800000,jax:1200000};
for(const h of heroes){h.cost=recruitment[h.id];h.desc+=' '+(h.cost?'Recruit for '+h.cost.toLocaleString('en-US')+' gold.':'Your starting hero.');}

let selectedChapter=1;
// Existing purchases are kept; the new armory has deliberate long-term unlocks.
const weaponProgression=[
 ['fists','Iron Knuckles','brawler',0,0],['thunder','Thunder Gauntlets','brawler',1,13],['titan','Titanbreaker Fists','brawler',3,38],
 ['wand','Apprentice Wand','mage',0,0],['frost','Frostbinder Staff','mage',1,12],['codex','Celestial Codex','mage',2,24],['archmage','Archmage’s Scepter','mage',3,38],
 ['scepter','Blessed Rod','healer',0,0],['bell','Dawn Bell','healer',1,10],['bloom','Lifebloom Branch','healer',2,20],['seraph','Seraph Lantern','healer',3,33],
 ['bow','Hunter’s Bow','archer',0,0],['thorn','Thornpiercer','archer',1,10],['eclipsebow','Eclipse Longbow','archer',2,22],['phoenix','Phoenix Recurve','archer',3,35],
 ['rifle','Rustshot Revolver','gunner',0,0],['stormcoil','Stormcoil Rifle','gunner',1,7],['repeater','Void Repeater','gunner',2,14],['cannon','Sunbreaker Cannon','gunner',3,25],['harbinger','Obsidian Harbinger','gunner',4,36],
 ['crook','Wanderer’s Lantern','keeper',0,4],['moonlit','Moonlit Lantern','keeper',1,9],['soulfire','Soulfire Lantern','keeper',2,15],['dawnseeker','Dawnseeker Lantern','keeper',3,22],['eclipselantern','Eclipse Lantern','keeper',4,32]
];
for(const [id,name,classId,tier,dmg]of weaponProgression){
 let w=weapons.find(w=>w.id===id);if(!w){w={id,rateBonus:0,multi:0,pierce:false,special:null};weapons.push(w)}
 Object.assign(w,{name,classId,tier,dmg,cost:[0,18000,180000,2500000,25000000][tier],rarity:['common','rare','epic','leg','mythic'][tier],color:['#d7e1cf','#7ec3ed','#c49eff','#ffc76b','#f49b8d'][tier],stat:'+'+dmg+' damage · '+classId,desc:tier?'Class-exclusive equipment forged through chapter victories and hard-earned gold.':'A reliable class weapon to begin your journey.'});
 if(['frost','thorn','eclipsebow','codex','harbinger'].includes(id)){w.pierce=true;w.desc+=' Attacks pierce enemies.'}
 if(['phoenix','soulfire','eclipselantern','archmage'].includes(id)){w.special='burn';w.desc+=' Hits leave damaging ground flames.'}
 if(['repeater','cannon','phoenix'].includes(id)){w.multi=1;w.desc+=' Fires an extra projectile.'}
 if(classId==='healer'){w.special='heal';w.desc+=' Holy hits restore '+(tier>=2?2:1)+' health.'}
}
for(const w of weapons.filter(w=>w.tier===undefined)){w.tier=w.rarity==='leg'?3:w.rarity==='epic'?2:w.cost?1:0;w.cost=[0,18000,180000,2500000,25000000][w.tier]}
function weaponLocked(w){return w.tier===4?(save.wins<3):w.tier===3?(save.wins<1):w.tier===2?((save.chapterUnlocked||1)<3):w.tier===1?((save.chapterUnlocked||1)<2):false}
function weaponGateLabel(w){return ['Ready to forge','Clear chapter 1','Clear chapter 2','Defeat final boss','Defeat final boss 3 times'][w.tier||0]}


const fresh=()=>normalizeGearSave({v:2,gold:0,hero:'brann',unlocked:['brann'],weapon:'crook',unlockedWeapons:['iron','crook'],up:{weapon:0,haste:0,heart:0,power:0,agility:0,camp:0,armor:0,recovery:0,salvage:0,focus:0},best:0,wins:0,runs:0,lastClaim:Date.now(),lastRun:null,sound:false,edition:3,skills:{},skillRanks:{},journal:[],records:{campaign:0,story:0,endless:0,survival:0},storyComplete:false,expedition:null,checkpoint:null});

function migrate(raw){
  try{
    let data=JSON.parse(raw);
    if(data&&data.v===1){
      data.v=2;
      data.weapon='iron';
      data.unlockedWeapons=['iron'];
    }
    return normalizeProgress(data);
  }catch(e){return null}
}

function normalizeProgress(d){
 if(!d||typeof d!=='object')return d;
 if(d.v!==2)return d;
 d.edition=3;
 normalizeGearSave(d);
 d.chapterUnlocked=Math.max(1,Math.min(6,Math.floor(Number(d.chapterUnlocked)||1)));
 if(d.up&&typeof d.up==='object')for(const k of ['armor','recovery','salvage','focus'])if(d.up[k]===undefined)d.up[k]=0;
 d.skills=d.skills&&typeof d.skills==='object'&&!Array.isArray(d.skills)?d.skills:{};
 d.skillRanks=d.skillRanks&&typeof d.skillRanks==='object'&&!Array.isArray(d.skillRanks)?d.skillRanks:{};
 d.journal=Array.isArray(d.journal)?d.journal.filter(x=>typeof x==='string').slice(0,60):[];
 d.records=d.records&&typeof d.records==='object'?d.records:{};
 for(const k of ['campaign','story','endless','survival'])d.records[k]=Number.isSafeInteger(d.records[k])&&d.records[k]>=0?d.records[k]:0;
 if(!validExpedition(d.expedition))d.expedition=null;
 if(!validExpedition(d.checkpoint))d.checkpoint=null;
 return d;
}
function validExpedition(s){
 if(!s||s.version!==1||!['campaign','story','endless','survival'].includes(s.mode)||!s.state||!heroes.some(h=>h.id===s.heroId)||!weapons.some(w=>w.id===s.weaponId))return false;
 const r=s.state;
 if(!validSupplyRun(r))return false;
 if(r.gearSnapshot!==undefined){const g=r.gearSnapshot;if(!g||g.weaponId!==s.weaponId||!ARMORS.some(a=>a.id===g.armorId)||!validEnhancement(g.weaponUpgrade)||!validEnhancement(g.armorUpgrade))return false;}
 if(r.lantern!==undefined&&!validLanternState(r.lantern))return false;
 if(r.director!==undefined&&!validDirector(r.director))return false;
 if(!Number.isInteger(r.chapter)||r.chapter<1||r.chapter>6||!Number.isInteger(r.wave)||r.wave<1||r.wave>100)return false;
 for(const k of ['x','y','hp','maxHp','time','dmg','rate','speed','level','xp','xpNeed','gold','kills'])if(!Number.isFinite(r[k])||r[k]<0||r[k]>1e12)return false;
 if(r.maxHp<=0||r.xpNeed<=0||r.level<1||r.rate<=0)return false;
 for(const k of ['enemies','shots','drops','chests','particles','texts','effects','burnZones','hazards','ghosts','corpses','shrines','caches'])if(!Array.isArray(r[k])||r[k].length>1000)return false;
 for(const e of r.enemies)if(e?.archetype===EATER_CONFIG.archetype){if(e.boss||e.type!==3||!validEaterState(e.eater))return false}else if(e?.eater!==undefined)return false;
 const wardens=r.enemies.filter(e=>isWarden(e)&&e.hp>0);
 if(wardens.length>WARDEN_CONFIG.maxAlive||new Set(wardens.map(e=>e.warden?.id)).size!==wardens.length||wardens.filter(wardenCasting).length>WARDEN_CONFIG.maxCasting)return false;
 for(const e of r.enemies)if(isWarden(e)){if(e.boss||e.elite||e.type!==2||!validWardenState(e.warden))return false}else if(e?.warden!==undefined)return false;
 const seals=r.hazards.filter(h=>h.wardenOwner!==undefined);
 if(seals.length>WARDEN_CONFIG.maxZones)return false;
 for(const h of seals)if(!wardens.some(e=>e.warden.id===h.wardenOwner)||!Number.isFinite(h.x)||h.x<0||h.x>MW||!Number.isFinite(h.y)||h.y<0||h.y>MH||h.radius!==WARDEN_CONFIG.radius||!Number.isFinite(h.dmg)||h.dmg<0||h.dmg>1e9||!Number.isFinite(h.t)||h.t<=0||h.t>.45||h.delay!==.4||typeof h.struck!=='boolean')return false;
 const mimics=r.enemies.filter(e=>isMimic(e)&&e.hp>0),decoys=r.enemies.filter(e=>isMimicDecoy(e)&&e.hp>0);
 if(mimics.length>MIMIC_CONFIG.maxAlive||new Set(mimics.map(e=>e.mimic?.id)).size!==mimics.length)return false;
 for(const e of r.enemies){
  if(isMimic(e)){if(e.boss||e.elite||e.type!==3||!validMimicState(e.mimic))return false}else if(e?.mimic!==undefined)return false;
  if(isMimicDecoy(e)){const owner=mimics.find(q=>q.mimic.id===e.mimicOwner);if(e.boss||e.elite||e.type!==3||e.dmg!==0||e.hp!==1||e.maxHp!==1||!owner||owner.chapter!==e.chapter||!['illusion','aim','recover'].includes(owner.mimic.state)||!Number.isFinite(e.decoyLeft)||e.decoyLeft<=0||e.decoyLeft>MIMIC_CONFIG.decoyLife)return false}
  else if(e?.mimicOwner!==undefined||e?.decoyLeft!==undefined)return false;
 }
 if(mimics.some(e=>decoys.filter(q=>q.mimicOwner===e.mimic.id).length>MIMIC_CONFIG.maxDecoys))return false;
 for(const e of r.enemies)if(e?.brute!==undefined&&(!isBrute(e)||!validBruteState(e.brute)))return false;
 for(const e of r.enemies)if(e?.runner!==undefined&&(!isRunner(e)||!validRunnerState(e.runner)))return false;
 for(const e of r.enemies)if(e?.archer!==undefined&&(!isCoverArcher(e)||!validArcherState(e.archer)))return false;
 for(const e of r.enemies)if(isShadowStalker(e)){if(e.boss||e.elite||e.chapter!==STALKER_CONFIG.chapter||e.type!==STALKER_CONFIG.type||!validStalkerState(e.stalker))return false}else if(e?.stalker!==undefined)return false;
 if(r.enemies.filter(e=>isShadowStalker(e)&&e.hp>0).length>STALKER_CONFIG.maxAlive||r.enemies.filter(stalkerAttacking).length>STALKER_CONFIG.maxAttacking)return false;
 if(!r.anim||!Number.isFinite(r.waveTime)||r.waveTime<0||!Number.isFinite(r.cycle)||r.cycle<0)return false;
 const finite=(v,depth=0)=>{if(depth>16)return false;if(typeof v==='number')return Number.isFinite(v)&&Math.abs(v)<1e15;if(Array.isArray(v))return v.length<=1000&&v.every(x=>finite(x,depth+1));if(v&&typeof v==='object')return Object.keys(v).length<100&&Object.values(v).every(x=>finite(x,depth+1));return v===null||['string','boolean','undefined'].includes(typeof v)};
 return finite(s);
}

function validate(x){
  if(!x||x.v!==2||!Number.isInteger(x.gold)||x.gold<0||!Array.isArray(x.unlocked)||!x.unlocked.includes('brann')||!heroes.some(h=>h.id===x.hero))return false;
  if(!Array.isArray(x.unlockedWeapons)||!x.unlockedWeapons.includes('iron')||!weapons.some(w=>w.id===x.weapon))return false;
  if(!x.up||!validGearSave(normalizeGearSave(x),weapons))return false;
  for(const k of Object.keys(fresh().up)){if(!Number.isInteger(x.up[k])||x.up[k]<0||x.up[k]>200)return false}
  return ['best','wins','runs'].every(k=>Number.isInteger(x[k])&&x[k]>=0)&&Number.isFinite(x.lastClaim);
}

let save=fresh(),storageOK=true;
try{
  let raw=localStorage.getItem(SAVE_KEY);
  if(!raw) raw=localStorage.getItem('last-lantern-v1');
  if(raw){
    const d=migrate(raw);
    if(validate(d)){save=d}
  }
}catch(e){storageOK=false}

let run=null,tab='armory',keys=new Set(),pointer=null,lastFrame=performance.now(),idleTime=0,toastTimer,bannerTimer,audio=null,modalKind=null;
let shake=0;

function persist(){
  try{localStorage.setItem(SAVE_KEY,JSON.stringify(save));storageOK=true}catch(e){storageOK=false}
  $('#saveStatus').textContent=storageOK?'◆ Progress saved on this device':'Saving unavailable';
}
function toast(m){$('#toast').textContent=m;$('#toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.add('hidden'),3200)}
function num(n){return Math.floor(n).toLocaleString('en-US')}
function sound(freq=440,dur=.06,type='square',vol=.035){
  if(!save.sound)return;
  try{
    audio??=new(window.AudioContext||window.webkitAudioContext)();
    if(audio.state==='suspended')audio.resume();
    const o=audio.createOscillator(),g=audio.createGain();
    o.type=type;o.frequency.value=freq;
    g.gain.setValueAtTime(vol,audio.currentTime);
    g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+dur);
    o.connect(g);g.connect(audio.destination);
    o.start();o.stop(audio.currentTime+dur);
  }catch(e){}
}

function pendingGold(){
  const elapsed=Math.max(0,Math.min(8*3600000,Date.now()-save.lastClaim));
  return Math.floor(elapsed/60000*(.05+save.up.camp*.05));
}
function updateWallet(){
  $('#gold').textContent=num(save.gold);
  const n=pendingGold();
  $('#pending').textContent=num(n);
  $('#claim').disabled=n<1||!!run;
  $('#incomeRate').textContent=(.05+save.up.camp*.05).toFixed(2);
}

function showModal(title,body,actions,kind){
  modalKind=kind;$('#modalTitle').textContent=title;$('#modalBody').innerHTML=body;
  $('#modalActions').replaceChildren();
  actions.forEach(a=>{
    let b=document.createElement('button');
    b.textContent=a.label;b.className=a.primary?'primary':'quiet';
    b.onclick=a.fn;$('#modalActions').append(b);
  });
  if(!$('#modal').open)$('#modal').showModal();
}
function closeModal(){$('#modal').close();modalKind=null}

function showHelp(){
  const wasRunning=run&&!run.paused;
  if(wasRunning)run.paused=true;
  keys.clear();pointer=null;
  showModal('Mastering the Whispering Woods',`
    <p>Survive for <strong>3 minutes</strong> against waves of dark forest denizens, then conquer <strong>The Hollow King</strong>. Attacks trigger automatically toward nearby foes.</p>
    <p><kbd>W A S D</kbd> / Arrows: Move hero.<br>
    <kbd>Space</kbd>: Trigger hero special skill.<br>
    <kbd>Shift</kbd>: Dash invulnerably through danger.<br>
    <kbd>P</kbd> or <kbd>Esc</kbd>: Pause game.</p>
    <p><strong>★ Key Mechanics:</strong><br>
    • <strong>Critical Strikes</strong>: 15%+ chance to deal 2× damage (gold damage pops).<br>
    • <strong>Combos</strong>: Chain fast eliminations to build combo stacks; every 5th kill gives bonus gold!<br>
    • <strong>Treasure Chests</strong>: Fallen elites and bosses drop golden chests packed with fortune.<br>
    • <strong>Armory Shop</strong>: Forge weapons with unique traits like Burn patches, Piercing, and Life Steal.</p>
  `,[{label:wasRunning?'Resume Hunt':'Understood',primary:true,fn:()=>{closeModal();if(wasRunning&&run)run.paused=false}}],'help');
}

const upgrades={
  weapon:{name:'Tempered steel',desc:'Forging discipline increases base damage for all weapons.',base:40,mult:1.55,max:10,icon:'sword',stat:l=>`+${l*5} weapon damage`},
  haste:{name:'Quickdraw',desc:'Sharpen reflexes to reduce attack intervals.',base:55,mult:1.6,max:10,icon:'bow',stat:l=>`${Math.round((1-Math.pow(.94,l))*100)}% faster attacks`},
  heart:{name:'Keeper’s heart',desc:'Deepens inner fortitude with extra starting vitality.',base:45,mult:1.55,max:10,icon:'heart',stat:l=>`+${l*15} starting health`},
  power:{name:'Brighter flame',desc:'Amplifies hero special skills and healing potency.',base:65,mult:1.6,max:10,icon:'flame',stat:l=>`+${l*12}% skill strength`},
  agility:{name:'Trailblazer',desc:'Lightens your stride through deep thickets.',base:50,mult:1.55,max:10,icon:'boot',stat:l=>`+${l*4}% movement speed`},
  camp:{name:'Lantern workshop',desc:'Generates continuous gold income while the camp rests.',base:80,mult:1.9,max:5,icon:'camp',stat:l=>`${(.05+l*.05).toFixed(2)} gold each minute`}
};
function price(k){return Math.floor(upgrades[k].base*Math.pow(upgrades[k].mult,save.up[k]))}

function renderShop(){
  updateWallet();
  $$('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===tab)));
  $('#shop').setAttribute('aria-labelledby','tab-'+tab);
  const locked=!!run;
  let html='';

  if(tab==='armory'){
    html='<p class="tab-intro">Only weapons for your active class appear here. The equipped weapon is held and animated in battle.</p>';
    weapons.filter(w=>w.classId===heroes.find(h=>h.id===save.hero).classId).forEach(w=>{
      let owned=save.unlockedWeapons.includes(w.id), equipped=save.weapon===w.id;
      let badgeClass=w.rarity==='mythic'?'badge-leg':w.rarity==='leg'?'badge-leg':w.rarity==='epic'?'badge-epic':w.rarity==='rare'?'badge-rare':'badge-common';
      html+=`<article class="item weapon-card ${equipped?'equipped':''}">
        <div class="item-top">
          <div class="weapon-art"><img src="${spriteData[w.id]}" alt="${w.name}" width="94" height="112"></div>
          <div><h3>${w.name} <span class="badge ${badgeClass}">${w.rarity==='leg'?'Legendary':w.rarity}</span> ${equipped?'<span class="badge badge-active">Equipped</span>':''}</h3><p>${w.stat}</p></div>
        </div>
        ${gearStars(gearEnhancement(save,'weapon',w.id))}<p>${w.desc}</p><p style="margin-top:6px;color:var(--gold)">${w.cost?num(w.cost)+' gold · '+weaponGateLabel(w):'Starter weapon'}</p>
        <div class="item-bottom" style="margin-top:10px">
          <span class="stat">${w.special?w.special.toUpperCase():'Passive'}</span>
          <button data-weap-btn="${w.id}" ${locked||equipped||(!owned&&(save.gold<w.cost||weaponLocked(w)))?'disabled':''}>
            ${equipped?'Equipped':owned?'Equip':weaponLocked(w)?weaponGateLabel(w):num(w.cost)+' gold'}
          </button>
        </div>
      </article>`;
    });
    [].forEach(k=>{
      let u=upgrades[k],lv=save.up[k],cost=price(k);
      html+=`<article class="item">
        <div class="item-top">
          <div class="item-icon"><canvas width="40" height="40" data-icon="${u.icon}"></canvas></div>
          <div><h3>${u.name}</h3><p>${u.desc}</p></div>
        </div>
        <div class="level-dots">${Array.from({length:u.max},(_,i)=>`<i class="${i<lv?'on':''}"></i>`).join('')}</div>
        <div class="item-bottom"><span class="stat">${u.stat(lv)}</span><button data-buy="${k}" ${locked||lv>=u.max||save.gold<cost?'disabled':''}>${lv>=u.max?'Max':num(cost)+' gold'}</button></div>
      </article>`;
    });
  }else if(tab==='heroes'){
    html='<p class="tab-intro">Six classes, six ways to survive. Recruit heroes with gold; forge class equipment through chapter victories.</p>';
    heroes.forEach(h=>{
      let owned=save.unlocked.includes(h.id), selected=save.hero===h.id;
      html+=`<article class="item hero-card ${selected?'selected':''}">
        <div class="item-top">
          <div class="hero-art"><img src="${spriteData['held_'+h.id+'_'+(h.id===save.hero?save.weapon:(save.classLoadouts?.[h.classId]||classStarters[h.classId]))]||spriteData[h.id]}" alt="${h.name}, ${h.role}" width="116" height="144"></div>
          <div><h3>${h.name} ${selected?'<span class="badge badge-active">Active</span>':''}</h3><p>${h.role}</p></div>
        </div>
        <p>${h.desc}</p>
        <div class="item-bottom" style="margin-top:12px">
          <span class="stat">${h.hp} HP · ${h.skill}</span>
          <button data-select="${h.id}" ${locked||selected||(!owned&&save.gold<h.cost)?'disabled':''}>${selected?'Active':owned?'Select':num(h.cost)+' gold'}</button>
        </div>
      </article>`;
    });
  }else if(tab==='skills'){
    html='<p class="tab-intro">Permanent survivability perks empowering your expeditions.</p>';
    ['heart','power','agility'].forEach(k=>{
      let u=upgrades[k],lv=save.up[k],cost=price(k);
      html+=`<article class="item">
        <div class="item-top">
          <div class="item-icon"><canvas width="40" height="40" data-icon="${u.icon}"></canvas></div>
          <div><h3>${u.name}</h3><p>${u.desc}</p></div>
        </div>
        <div class="level-dots">${Array.from({length:u.max},(_,i)=>`<i class="${i<lv?'on':''}"></i>`).join('')}</div>
        <div class="item-bottom"><span class="stat">${u.stat(lv)}</span><button data-buy="${k}" ${locked||lv>=u.max||save.gold<cost?'disabled':''}>${lv>=u.max?'Max':num(cost)+' gold'}</button></div>
      </article>`;
    });
  }else{
    html='<p class="tab-intro">Strengthen camp defenses and gather resources while resting.</p>';
    let u=upgrades.camp,lv=save.up.camp,cost=price('camp');
    html+=`<article class="item">
      <div class="item-top">
        <div class="item-icon"><canvas width="40" height="40" data-icon="${u.icon}"></canvas></div>
        <div><h3>${u.name}</h3><p>${u.desc}</p></div>
      </div>
      <div class="level-dots">${Array.from({length:u.max},(_,i)=>`<i class="${i<lv?'on':''}"></i>`).join('')}</div>
      <div class="item-bottom"><span class="stat">${u.stat(lv)}</span><button data-buy="camp" ${locked||lv>=u.max||save.gold<cost?'disabled':''}>${lv>=u.max?'Max':num(cost)+' gold'}</button></div>
    </article>
    <article class="item">
      <h3>Expedition Chronicles</h3>
      <p style="margin-top:10px;line-height:1.7">
        Total Expeditions: <strong>${num(save.runs)}</strong><br>
        Dawns Reached: <strong>${num(save.wins)}</strong><br>
        Longest Survival: <strong>${formatTime(save.best)}</strong><br>
        Equipped Blade: <strong>${weapons.find(w=>w.id===save.weapon).name}</strong>
      </p>
    </article>`;
  }

  if(locked) html+='<p class="tab-intro" style="color:var(--gold);margin-top:12px">⚔ Expedition ongoing. Upgrades unlock in camp.</p>';
  $('#shop').innerHTML=html;

  $$('[data-buy]').forEach(b=>b.onclick=()=>buy(b.dataset.buy));
  $$('[data-select]').forEach(b=>b.onclick=()=>selectHero(b.dataset.select));
  $$('[data-weap-btn]').forEach(b=>b.onclick=()=>equipOrBuyWeapon(b.dataset.weapBtn));
  $$('[data-icon]').forEach(c=>drawIcon(c,c.dataset.icon));
  $$('[data-hero]').forEach(c=>{let h=heroes.find(x=>x.id===c.dataset.hero);drawHero(c.getContext('2d'),20,24,h,0,2)});
  $$('[data-weap-icon]').forEach(c=>{let w=weapons.find(x=>x.id===c.dataset.weapIcon);drawWeaponIcon(c,w)});
}

function equipOrBuyWeapon(id){
  if(run)return;
  const w=weapons.find(x=>x.id===id);
  if(!w||w.classId!==heroes.find(h=>h.id===save.hero).classId)return;
  if(!save.unlockedWeapons.includes(id)){
    if(save.gold<w.cost||weaponLocked(w))return;
    save.gold-=w.cost;
    save.unlockedWeapons.push(id);
    sound(780,.15,'triangle');
    toast(`Forged ${w.name}!`);
  }else{
    sound(580,.1,'triangle');
    toast(`Equipped ${w.name}`);
  }
  save.weapon=id;save.classLoadouts=save.classLoadouts&&typeof save.classLoadouts==='object'?save.classLoadouts:{};save.classLoadouts[w.classId]=id;
  persist();
  renderShop();
}

function buy(k){
  if(run)return;
  let u=upgrades[k],cost=price(k);
  if(!u||save.up[k]>=u.max||save.gold<cost)return;
  if(k==='camp'){let earned=pendingGold();save.gold+=earned;save.lastClaim=Date.now()}
  save.gold-=cost;
  save.up[k]++;
  persist();
  sound(640,.12);
  renderShop();
  toast(u.name+' upgraded to level '+save.up[k]);
}

function selectHero(id){
  if(run)return;
  let h=heroes.find(h=>h.id===id);
  if(!h)return;
  if(!save.unlocked.includes(id)){
    if(save.gold<h.cost)return;
    save.gold-=h.cost;
    save.unlocked.push(id);
    toast(`${h.name} joined the expedition!`);
  }
  save.classLoadouts=save.classLoadouts&&typeof save.classLoadouts==='object'?save.classLoadouts:{};save.classLoadouts[heroes.find(h=>h.id===save.hero).classId]=save.weapon;save.hero=id;
  ensureClassWeapon();
  persist();
  renderShop();
  sound(520,.1);
}

$$('[data-tab]').forEach(b=>{
  b.onclick=()=>{tab=b.dataset.tab;renderShop()};
});

$('#claim').onclick=()=>{
  if(run)return;
  let n=pendingGold();
  if(n<1)return;
  save.gold+=n;
  save.lastClaim=Date.now();
  persist();
  renderShop();
  sound(750,.15);
  toast('Collected '+num(n)+' gold from camp.');
};

$('#sound').onclick=()=>{
  save.sound=!save.sound;
  $('#sound').textContent=save.sound?'Sound on':'Sound off';
  $('#sound').setAttribute('aria-pressed',String(save.sound));
  persist();
  sound(520,.1);
};

$('#help').onclick=showHelp;
$('#about').onclick=()=>{
  const active=run&&!run.paused;if(active)run.paused=true;keys.clear();pointer=null;
  showModal('Creatures of the woods',
    '<p>Watch the silhouettes. Learn what moves in the dark.</p>'+[
      ['wisp','Wisp','A restless forest spirit. Blue specters drift; ancient wisps charge.'],
      ['bat','Shade Bat','Fast, erratic flight. Keep room to dodge its approach.'],
      ['king','The Hollow King','A crowned monarch of roots and shadow. His second phase releases a storm of magic.']
    ].map(([id,name,desc])=>'<article class="bestiary-row"><img src="'+spriteData[id]+'" alt="'+name+'"><div><h3>'+name+'</h3><p>'+desc+'</p></div></article>').join(''),
    [{label:active?'Resume expedition':'Back to camp',primary:true,fn:()=>{closeModal();if(active&&run)run.paused=false}}],'help');
};

$('#export').onclick=()=>{
  const blob=new Blob([JSON.stringify(save,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='Last-Lantern-save.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
  toast('Save exported successfully.');
};

$('#import').onclick=()=>{
  if(run){toast('Return to camp before importing a save.');return}
  $('#file').click();
};

$('#file').onchange=async()=>{
  const file=$('#file').files[0];$('#file').value='';
  if(!file)return;
  try{
    const d=migrate(await file.text());
    if(!validate(d))throw Error();
    save=d;persist();syncCamp();renderShop();
    toast('Your camp has been restored.');
  }catch(e){toast('Invalid save file.');}
};

function formatTime(s){return Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0')}
function syncCamp(){
  $('#sound').textContent=save.sound?'Sound on':'Sound off';
  $('#sound').setAttribute('aria-pressed',String(save.sound));
  $('#chapter').textContent='Chapter '+selectedChapter+' · '+chapters[selectedChapter-1].name;
  renderChapterChoice();
  $('#lastRun').textContent=save.lastRun?`Last expedition: ${formatTime(save.lastRun.seconds)} · ${num(save.lastRun.gold)} gold brought home`:'';
  updateWallet();
}

function startRun(){
  if(run)return;
  ensureClassWeapon();
  let hero=heroes.find(h=>h.id===save.hero);
  let wep=weapons.find(w=>w.id===save.weapon);
  const armorItem=ARMORS.find(a=>a.id===save.armor),armorUpgrade=gearEnhancement(save,'armor',save.armor),weaponUpgrade=gearEnhancement(save,'weapon',wep.id),armorStats=gearStats('armor',armorItem,armorUpgrade);
  let max=hero.hp+save.up.heart*15+armorStats.hp;

  run={
    hero,weapon:wep,mode:chosenMode,director:createDirector(selectedSeed||generateDirectorSeed(),selectedDirectorDifficulty),chapter:selectedChapter,wave:1,waveTime:0,hazards:[],slow:0,chapterDone:false,
    x:MW/2,y:MH/2+38,hp:max,maxHp:max,
    time:0,level:1,xp:0,xpNeed:8,gold:0,kills:0,lantern:createLanternState(),
    enemies:[],shots:[],drops:[],chests:[],particles:[],texts:[],effects:[],burnZones:[],
    spawn:0,attack:0,skillCd:0,dashCd:0,dashTime:0,invuln:0,paused:false,
    dmg:(hero.dmg+wep.dmg)+save.up.weapon*5+gearStats('weapon',wep,weaponUpgrade).damageBonus,
    gearSnapshot:{weaponId:wep.id,armorId:armorItem.id,weaponUpgrade,armorUpgrade},
    rate:Math.max(.08,Math.max(.16,hero.rate-wep.rateBonus)*Math.max(.4,1-save.up.haste*.003)),
    speed:hero.speed*(1+.6*(1-Math.exp(-save.up.agility/80))),
    critChance:.15,damageReduce:0,pierce:wep.pierce,multi:wep.multi,
    combo:0,comboTimer:0,
    bossSpawned:false,bossDead:false,bossPhase2:false,
    anim:{moving:false,walkClock:0,attackLeft:0,skillLeft:0,hurtLeft:0,trailLeft:0},ghosts:[],corpses:[],regen:0,aim:0,shield:0,heading:1,lastDx:0,lastDy:1
  };

  setupChapter(run);
  keys.clear();pointer=null;save.runs++;persist();
  $('#intro').classList.add('hidden');$('#shade').classList.add('hidden');
  $('#hud').classList.remove('hidden');$('#controls').classList.remove('hidden');
  $('#areaStatus').textContent='Keep moving. Guard the flame.';
  $('#controlHint').textContent='Enemies approach from the shadows. Collect embers & chests.';
  renderShop();
  banner(chapters[run.chapter-1].name+' · Wave 1');
  canvas.focus({preventScroll:true});
  window.scrollTo({top:0});
  updateHud();
  sound(320,.2,'triangle');
}
$('#start').onclick=startRun;

function banner(text){
  $('#banner').textContent=text;$('#banner').classList.remove('hidden');
  clearTimeout(bannerTimer);bannerTimer=setTimeout(()=>$('#banner').classList.add('hidden'),2200);
}

function pauseGame(){
  if(!run)return;
  if(run.paused){if(modalKind==='pause'||modalKind==='supplies'){closeModal();run.paused=false}return}
  run.paused=true;keys.clear();pointer=null;
  showModal('Expedition Paused',`<p>Take a breath. The woods are frozen.</p><p class="small muted">Retreating secures all gold currently earned this run.</p>`,[
    {label:'Resume',primary:true,fn:()=>{closeModal();if(run)run.paused=false}},
    {label:'Retreat to Camp',fn:()=>{closeModal();endRun(false,true)}}
  ],'pause');
}
$('#pause').onclick=pauseGame;

$('#modal').addEventListener('cancel',e=>{
  e.preventDefault();
  if(['level','chapter','story','boss-break','ending','prepare','new-run','defeat','npc-dialog','story-map','story-log'].includes(modalKind))return;
  if(modalKind==='pause'||modalKind==='help'||modalKind==='supplies'){closeModal();if(run)run.paused=false}
  else closeModal();
});

function endRun(won,retreat=false){
  if(!run)return;
  const r=run;
  let bonus=won?(r.mode==='survival'?DIRECTOR_CONFIG.survival.victoryGold:150000):0;
  if(won){if(r.mode!=='survival')save.wins++;save.gold+=bonus;r.gold+=bonus}
  save.best=Math.max(save.best,Math.floor(r.time));
  save.lastRun={seconds:Math.floor(r.time),gold:r.gold,won};
  persist();
  run=null;keys.clear();pointer=null;
  $('#hud').classList.add('hidden');$('#controls').classList.add('hidden');
  $('#bossbar').classList.add('hidden');$('#bossbar').classList.remove('enraged');
  $('#comboDock').classList.add('hidden');$('#intro').classList.remove('hidden');
  $('#shade').classList.remove('hidden');$('#banner').classList.add('hidden');
  clearTimeout(bannerTimer);
  $('#areaStatus').innerHTML='<span class="live-dot"></span>Camp is safe';
  $('#controlHint').textContent='Attacks are automatic. Critical strikes deal double damage.';
  syncCamp();renderShop();
  showModal(won?'The Dawn Breaks!':retreat?'Returned to Camp Safety':'The Flame Flickers Out',`
    <p>${won?r.mode==='survival'?'You survived 180 active seconds. Remaining enemies do not prevent this victory.':'You defeated the Ashen Sovereign and restored light across six realms!':retreat?'You made a prudent tactical retreat with your gathered spoils.':'The darkness overwhelmed you this time. Your gold is secured at camp. Forge better weapons and try again.'}</p>
    <div class="result-grid">
      <div><strong>${formatTime(r.time)}</strong><span>survived</span></div>
      <div><strong>${num(r.gold)}</strong><span>gold earned</span></div>
      <div><strong>${r.kills}</strong><span>foes slayed</span></div>
    </div>
    ${bonus?`<p class="small" style="margin-top:14px;color:var(--gold)">Includes +${bonus} victory bonus${r.mode==='survival'?' for surviving the long night':' for conquering dawn'}!</p>`:''}
    ${r.mode==='survival'?`<p class="small">Local challenge · Seed ${storyEsc(r.director.seed)} · ${storyEsc(r.director.difficulty)} threat budget</p>`:''}
  `,[
    {label:'Camp Armory',primary:true,fn:closeModal},
    {label:'Embark Again',fn:()=>{closeModal();startRun()}}
  ],'result');
  sound(won?680:150,.35,'triangle');
}

function levelUp(){
  if(!run||run.paused)return;
  run.xp-=run.xpNeed;
  run.level++;
  run.dmg*=1.035;
  run.xpNeed=Math.floor(10+run.level*6+Math.pow(run.level,1.22));
  run.paused=true;keys.clear();pointer=null;
  sound(720,.2,'sine');

  const pool=[
    {name:'Sharpen Edge',desc:'+22% damage for all attacks this run.',apply:r=>r.dmg*=1.22},
    {name:'Second Wind',desc:'+30 max health and restores 40 vitality.',apply:r=>{r.maxHp+=30;r.hp=Math.min(r.maxHp,r.hp+40)}},
    {name:'Rapid Trigger',desc:'Attack 16% faster this expedition.',apply:r=>r.rate*=.84},
    {name:'Twin Force',desc:'Ranged: +1 projectile. Melee: +15% strike damage.',apply:r=>r.multi=Math.min(4,r.multi+1),check:r=>r.multi<3},
    {name:'Lucky Strike',desc:'+15% critical strike chance (deals 2× damage).',apply:r=>r.critChance=Math.min(.65,r.critChance+.15)},
    {name:'Piercing Light',desc:'Your standard attacks penetrate through targets.',apply:r=>r.pierce=true,check:r=>!r.pierce},
    {name:'Iron Skin',desc:'Fortify body: reduce all incoming damage by 20%.',apply:r=>r.damageReduce=Math.min(.6,(r.damageReduce||0)+.2)},
    {name:'Fleet Walk',desc:'Move 14% faster to evade encirclement.',apply:r=>r.speed*=1.14},
    {name:'Embermender',desc:'Passively regenerate 1.2 health each second.',apply:r=>r.regen+=1.2}
  ].filter(p=>!p.check||p.check(run));

  let choices=[];
  for(let i=0;i<3&&pool.length>0;i++){
    choices.push(pool.splice(Math.floor(directorRandom(ensureDirector(r),'events')*pool.length),1)[0]);
  }

  showModal('Level '+run.level+' · Choose a Blessing',
    '<p>Harvest the ancient embers to bolster your powers:</p>'+
    choices.map((c,i)=>`<button class="choice" data-power="${i}"><strong>${c.name}</strong><span>${c.desc}</span></button>`).join(''),
    [],'level'
  );
  $$('[data-power]').forEach(b=>b.onclick=()=>{
    if(!run)return;
    choices[Number(b.dataset.power)].apply(run);
    closeModal();run.paused=false;
    sound(820,.15);
    updateHud();
  });
}

function skill(){
  if(!run||run.paused||run.skillCd>0)return;
  const r=run,factor=1+save.up.power*.035;
  r.skillCd=r.hero.cd;r.anim.skillLeft=.72;
  shake=Math.max(shake,8);

  if(r.hero.id==='brann'){
    r.effects.push({x:r.x,y:r.y,t:.7,max:.7,r:175,color:'#ffd18b'});
    r.enemies.forEach(e=>{
      if(Math.hypot(e.x-r.x,e.y-r.y)<185){
        hit(e,110*factor,true);
        let a=Math.atan2(e.y-r.y,e.x-r.x);
        displaceEnemy(run,e,Math.cos(a)*55,Math.sin(a)*55);
      }
    });
  }else if(r.hero.id==='nyx'){
    for(let i=0;i<18;i++)shoot(r.x,r.y,i*Math.PI/9,50*factor,340,true);
    r.effects.push({x:r.x,y:r.y,t:.45,max:.45,r:80,color:'#a8f0cb'});
  }else{
    let heal=48*factor;
    r.hp=Math.min(r.maxHp,r.hp+heal);
    r.shield=4.2*factor;
    r.effects.push({x:r.x,y:r.y,t:.85,max:.85,r:100,color:'#c2acef'});
    textPop(r.x,r.y-22,'Mend +'+Math.round(heal),'#c9afff');
  }
  sound(260,.2,'sawtooth',.03);
  updateHud();
}

function dash(){
  if(!run||run.paused||run.dashCd>0)return;
  run.dashCd=COMBAT_CONFIG.dash.cooldown;run.dashTime=COMBAT_CONFIG.dash.active;run.invuln=Math.max(run.invuln,COMBAT_CONFIG.dash.invulnerability);run.anim.trailLeft=0;
  sound(160,.12,'triangle');
  for(let i=0;i<6;i++)run.particles.push({x:run.x,y:run.y,vx:(Math.random()-.5)*50,vy:(Math.random()-.5)*50,t:.3,color:'#82b8a0'});
}

$('#skill').onclick=skill;
$('#dash').onclick=dash;

const gameKeys=['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d','W','A','S','D',' ','Shift','p','P','Escape'];
window.addEventListener('keydown',e=>{
  if(!run)return;
  if(gameKeys.includes(e.key))e.preventDefault();
  if(e.key==='Escape'||e.key.toLowerCase()==='p'){if(!e.repeat)pauseGame();return}
  if(run.paused)return;
  keys.add(e.key.toLowerCase());
  if(e.key===' '&&!e.repeat)skill();
  if(e.key==='Shift'&&!e.repeat)dash();
});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
window.addEventListener('blur',()=>{keys.clear();pointer=null;if(run&&!run.paused)pauseGame()});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&run&&!run.paused)pauseGame()});

$('#arena').addEventListener('pointerdown',e=>{
  if(!run||run.paused||e.target.closest('button'))return;
  e.preventDefault();$('#arena').setPointerCapture(e.pointerId);
  pointer={id:e.pointerId,x:e.clientX,y:e.clientY,dx:0,dy:0};
  $('#stick').style.opacity='1';
});
$('#arena').addEventListener('pointermove',e=>{
  if(!pointer||pointer.id!==e.pointerId)return;
  let dx=e.clientX-pointer.x,dy=e.clientY-pointer.y,d=Math.hypot(dx,dy);
  pointer.dx=d>5?dx/Math.max(32,d):0;
  pointer.dy=d>5?dy/Math.max(32,d):0;
  $('#knob').style.transform=`translate(${pointer.dx*24}px,${pointer.dy*24}px)`;
});
function clearPointer(e){
  if(pointer&&(!e||pointer.id===e.pointerId)){pointer=null;$('#knob').style.transform='';}
}
$('#arena').addEventListener('pointerup',clearPointer);
$('#arena').addEventListener('pointercancel',clearPointer);
$('#arena').addEventListener('lostpointercapture',clearPointer);

function shoot(x,y,a,damage,speed=300,pierce=false){
  run.shots.push({x,y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,dmg:damage,t:2.4,pierce,hit:new Set(),color:run.weapon.color});
}

function textPop(x,y,text,color='#fff0cd'){
  run.texts.push({x,y,text,color,t:.85});
}

function hit(e,dmg,isSkill=false,isBurnTick=false){
  if(e.hp<=0)return;
  let isCrit=!isSkill && (directorRandom(ensureDirector(run),'events')<run.critChance);
  if(isCrit){
    dmg*=2;
    shake=Math.max(shake,4);
    run.effects.push({x:e.x,y:e.y,t:.22,max:.22,r:26,color:'#ffd700'});
  }

  e.hp-=dmg;
  e.flash=.12;
  textPop(e.x,e.y-14,Math.round(dmg),isCrit?'#ffd700':'#fff0cd');

  // Weapon passives
  if(run.weapon.special==='burn'&&!isBurnTick){
    run.burnZones.push({x:e.x,y:e.y,r:28,t:2.8,tick:0,dmg:run.dmg*.16});
  }
  if(run.weapon.special==='lifesteal'&&!isSkill){
    run.hp=Math.min(run.maxHp,run.hp+3);
    textPop(run.x,run.y-22,'♥+3','#7dc8a0');
  }

  for(let i=0;i<(isCrit?7:3);i++){
    run.particles.push({x:e.x,y:e.y,vx:(Math.random()-.5)*70,vy:(Math.random()-.5)*70,t:.35,color:e.boss?'#c392d1':isCrit?'#ffd700':'#a3bc88'});
  }

  if(e.hp<=0){
    run.corpses.push({...e,dead:true,deathAge:0,deathDuration:e.boss?.85:.48});
    if(run.corpses.length>28)run.corpses.shift();
    run.kills++;
    run.combo++;
    run.comboTimer=3.2;

    if(run.combo>1&&run.combo%5===0){
      let comboBonus=Math.max(1,run.chapter*3);
      run.gold+=comboBonus;save.gold+=comboBonus;
      textPop(e.x,e.y-28,`${run.combo}x COMBO +${comboBonus}g`,'#ffd700');
      sound(860,.09,'sine',.025);
    }

    const gold=Math.floor((e.boss?8000*e.chapter*e.chapter*(e.bossTier||1):e.elite?600*e.chapter*e.chapter:e.type===4?25*e.chapter*e.chapter:directorRandom(ensureDirector(run),'events')<.45?6*e.chapter*e.chapter:0)*(1+(save.up.salvage||0)*.005)*(1+(run.cycle||0)*.25));
    run.gold+=gold;save.gold+=gold;

    // Drop logic: XP or Chest
    let chestChance=e.boss?1:e.type===4?.25:e.type===2?.12:.04;
    if(directorRandom(ensureDirector(run),'events')<chestChance){
      run.chests.push({x:e.x,y:e.y,val:e.boss?1000*e.chapter:e.type===4?40*e.chapter:8*e.chapter,t:14});
    }else{
      run.drops.push({x:e.x,y:e.y,value:e.boss?14:e.type===4?5:e.type===2?3:1});
    }

    if(e.boss)run.bossDead=true;
    sound(e.boss?110:440,.035,'triangle',.022);
    persist();updateWallet();
  }
}

function spawnEnemy(boss=false){
  let r=run,side=Math.floor(Math.random()*4);
  let x=side===0?-18:side===1?W+18:Math.random()*W;
  let y=side===2?-18:side===3?H+18:Math.random()*H;
  let stage=1+save.wins*.22,wave=Math.floor(Math.min(r.time,179)/30);

  let type=0;
  if(boss){
    type=99;
  }else{
    let roll=Math.random();
    if(r.time>110&&roll<.12) type=4;       // Brute
    else if(r.time>75&&roll<.25) type=3;   // Specter
    else if(r.time>45&&roll<.42) type=2;   // Archer
    else if(r.time>20&&roll<.65) type=1;   // Bat
    else type=0;                           // Shambler
  }

  let hpBase=[32,22,50,42,120];
  let spdBase=[26,52,22,34,18];
  let dmgBase=[9,8,13,10,24];

  let hp=(boss?860:hpBase[type]+wave*9)*stage;
  let e={
    x,y,hp,maxHp:hp,type,boss,
    speed:boss?32:(spdBase[type]+wave*2)*Math.min(1.4,stage),
    size:boss?26:[12,9,14,11,18][type],
    dmg:boss?28:dmgBase[type],
    flash:0,attack:0,phase:0,shoot:boss?3.5:2.5,
    charging:0,chargeCd:3
  };
  r.enemies.push(e);
}

function update(dt){
  const r=run;
  if(!r||r.paused)return;
  beginCombatFrame(r,dt);
  try{
  r.time+=dt;
  tickSpriteAnimation(r,dt);
  r.skillCd=Math.max(0,r.skillCd-dt);
  r.dashCd=Math.max(0,r.dashCd-dt);
  r.invuln=Math.max(0,r.invuln-dt);
  r.shield=Math.max(0,r.shield-dt);
  r.dashTime=Math.max(0,r.dashTime-dt);

  shake=Math.max(0,shake-dt*24);

  // Combo decay
  if(r.comboTimer>0){
    r.comboTimer-=dt;
    if(r.comboTimer<=0)r.combo=0;
  }

  // Movement
  let dx=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0);
  let dy=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0);
  if(pointer){dx=pointer.dx;dy=pointer.dy}
  let mag=Math.hypot(dx,dy);
  if(mag>1){dx/=mag;dy/=mag}
  if(mag>.05){r.lastDx=dx;r.lastDy=dy;r.heading=dx<0?-1:dx>0?1:r.heading}
  if(r.dashTime>0){dx=r.lastDx;dy=r.lastDy}

  const storyPlayerFrom={x:r.x,y:r.y};
  r.x=Math.max(16,Math.min(MW-16,r.x+dx*r.speed*(r.slow>0?.7:1)*dt*dashVelocity(r)));
  r.y=Math.max(22,Math.min(MH-16,r.y+dy*r.speed*(r.slow>0?.7:1)*dt*dashVelocity(r)));
  storyConstrainMove(r,storyPlayerFrom.x,storyPlayerFrom.y,r.x,r.y,11);
  finishCombatMovement(r);

  r.anim.moving=Math.hypot(dx,dy)>.05&&r.dashTime<=0;
  if(r.anim.moving)r.anim.walkClock+=dt*(r.speed/125);

  // Lantern area healing + passive regen
  let nearLantern=r.shrines.some(s=>s.fuel>0&&Math.hypot(r.x-s.x,r.y-s.y)<60);
  r.slow=Math.max(0,r.slow-dt);
  updateWorld(r,dt);
  r.hp=Math.min(r.maxHp,r.hp+dt*(r.regen+(nearLantern?2.5:0)));

  updateCarriedLantern(r,dt);
  advanceWaves(r,dt);
  r.attack-=dt;
  if(r.attack<=0)classAttack(r);

  // Update burn ground patches
  for(const b of r.burnZones){
    b.t-=dt;b.tick-=dt;
    if(b.tick<=0){
      b.tick=.4;
      for(const e of r.enemies){
        if(e.hp>0&&Math.hypot(e.x-b.x,e.y-b.y)<b.r){
          hit(e,b.dmg,true,true);
        }
      }
    }
  }
  r.burnZones=r.burnZones.filter(b=>b.t>0);

  // Update enemies
  const archerPlanning={left:ARCHER_CONFIG.plansPerFrame};
  for(const e of r.enemies){
    if(e.hp<=0)continue;
    constrainEnemyPosition(r,e);
    if(e.spawnGrace>0){e.spawnGrace=Math.max(0,e.spawnGrace-dt);continue}
    e.flash=Math.max(0,e.flash-dt);
    e.phase+=dt;

    if(isMimicDecoy(e)){const owner=r.enemies.find(q=>isMimic(q)&&q.hp>0&&q.mimic.id===e.mimicOwner);e.decoyLeft-=dt;if(!owner||e.decoyLeft<=0)e.hp=0;continue}
    if(isWarden(e)){updateWarden(r,e,dt);continue}
    if(isMimic(e)){updateMimic(r,e,dt);continue}
    const storyEnemyFrom={x:e.x,y:e.y};
    let dis=Math.hypot(r.x-e.x,r.y-e.y);
    let a=Math.atan2(r.y-e.y,r.x-e.x);
    // Cover goals and stationary attack states do not need the shared pursuit query.
    if(isCoverArcher(e)){updateCoverArcher(r,e,dt,a,archerPlanning);continue}
    a=storySteeringAngle(e,r,a);

    if(e.archetype===EATER_CONFIG.archetype){updateLanternEater(r,e,dt,a);storyMoveEnemy(r,e,storyEnemyFrom);continue}
    if(isBrute(e)){updateBrute(r,e,dt,a);continue}
    if(isRunner(e)){updateRunner(r,e,dt,a);continue}
    if(isShadowStalker(e)){updateShadowStalker(r,e,dt,a);continue}
    // AI behavior by mob type
    if(e.boss){
      bossAI(e,r,dt,a,dis);
    }else if(e.type===3){
      // Specter floats and wobbles
      let sway=Math.sin(e.phase*4)*.5;
      e.x+=Math.cos(a+sway)*e.speed*dt;
      e.y+=Math.sin(a+sway)*e.speed*dt;
    }else{
      // Only the designated Woods Wisp responds to illumination. Base stats stay intact.
      const lightSpeed=e.speed*shadowSpeedMultiplier(r.lantern,e,r);
      e.x+=Math.cos(a)*lightSpeed*dt;
      e.y+=Math.sin(a)*lightSpeed*dt;
    }

    tickEnemyCast(e,r,dt);
    enemyTrait(e,r,dt,a,dis);
    storyMoveEnemy(r,e,storyEnemyFrom);constrainEnemyPosition(r,e);dis=Math.hypot(r.x-e.x,r.y-e.y);
    // Player melee contact collision
    e.attack=Math.max(0,e.attack-dt);
    if(dis<e.size+COMBAT_CONFIG.playerContactPadding&&e.attack<=0&&enemyContactReady(e,dt)&&
       (r.mode!=='story'||!r.story||storyLineOfSight(r,e.x,e.y,r.x,r.y,2))&&damagePlayer(r,e.dmg,'contact')){
      e.attack=.8;e.attackAnim=.4;sound(85,.08,'sawtooth',.04);
    }
  }

  // Continuous collision, in travel order. Cover wins ties at the same instant.
  for(const s of r.shots){
    if(s.t<=0)continue;
    const from={x:s.x,y:s.y},travel=Math.min(dt,s.t),aliveFraction=dt>0?travel/dt:1;
    sampleCombatShot(r,s,from,dt);
    const to={x:s.x+s.vx*travel,y:s.y+s.vy*travel};
    s.x=to.x;s.y=to.y;s.t-=dt;
    const cover=traceStoryProjectile(r,s,from.x,from.y),coverAt=cover?.fraction??Infinity;
    if(s.enemy){
      const contact=projectilePlayerContact(r,from,to,aliveFraction);
      if(contact&&contact.fraction<coverAt*aliveFraction-1e-9&&damagePlayer(r,s.dmg,'projectile',contact.fraction)){
        s.x=contact.point.x;s.y=contact.point.y;s.vfxCollision={...contact.point};s.t=0;combatProjectileImpact(r,s);continue;
      }
    }else{
      const contacts=[];
      for(const e of r.enemies){if(e.hp<=0||s.hit.has(e))continue;const interval=sweepCircle(from,to,e,e.size+COMBAT_CONFIG.enemyProjectilePadding);if(interval&&interval.enter<coverAt-1e-9)contacts.push({e,fraction:interval.enter})}
      contacts.sort((a,b)=>a.fraction-b.fraction);
      for(const contact of contacts){
        hit(contact.e,s.dmg);s.hit.add(contact.e);
        if(!s.pierce){s.x=from.x+(to.x-from.x)*contact.fraction;s.y=from.y+(to.y-from.y)*contact.fraction;s.vfxCollision={x:s.x,y:s.y};s.t=0;combatProjectileImpact(r,s);break}
      }
      if(!s.pierce&&contacts.length)continue;
    }
    if(cover){commitStoryProjectileCollision(r,s,cover);combatProjectileImpact(r,s)}
  }
  r.enemies=r.enemies.filter(e=>e.hp>0);
  r.shots=r.shots.slice(-320);r.particles=r.particles.slice(-250);r.texts=r.texts.slice(-90);r.burnZones=r.burnZones.slice(-70);r.drops=r.drops.slice(-300);
  r.shots=r.shots.filter(s=>s.t>0&&s.x>-40&&s.x<MW+40&&s.y>-40&&s.y<MH+40);

  // XP Drops Attraction & Pickup
  for(const d of r.drops){
    let dis=Math.hypot(d.x-r.x,d.y-r.y);
    if(dis<110){
      d.x+=(r.x-d.x)*dt*6.5;
      d.y+=(r.y-d.y)*dt*6.5;
    }
    if(dis<18){
      r.xp+=d.value;
      d.value=0;
      sound(800,.025,'sine',.018);
    }
  }
  r.drops=r.drops.filter(d=>d.value>0);

  // Treasure chests pickup
  for(const c of r.chests){
    c.t-=dt;
    if(Math.hypot(c.x-r.x,c.y-r.y)<22){
      r.gold+=c.val;save.gold+=c.val;
      textPop(c.x,c.y-18,`+${c.val} GOLD CHEST!`,'#ffd700');
      sound(920,.18,'triangle',.03);
      for(let i=0;i<10;i++)r.particles.push({x:c.x,y:c.y,vx:(Math.random()-.5)*90,vy:(Math.random()-.5)*90,t:.45,color:'#ffd700'});
      c.val=0;
    }
  }
  r.chests=r.chests.filter(c=>c.val>0&&c.t>0);

  // Particles & Visual Popups
  for(const p of r.particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.t-=dt}
  r.particles=r.particles.filter(p=>p.t>0);
  for(const p of r.texts){p.y-=26*dt;p.t-=dt}
  r.texts=r.texts.filter(p=>p.t>0);
  r.effects.forEach(e=>e.t-=dt);
  r.effects=r.effects.filter(e=>e.t>0);

  updateHud();

  if(r.hp<=0){endRun(false);return}
  if(finishSurvivalIfReady(r))return;
  if(r.bossDead&&!r.chapterDone){resolveBoss(r);return}
  if(r.xp>=r.xpNeed)levelUp();
  }finally{endCombatFrame(r)}
}

function updateHud(){
  if(!run)return;
  let r=run;
  updateLanternHud(r);updateDirectorHud(r);
  $('#heroLabel').textContent=r.hero.name;
  $('#hpText').textContent=Math.ceil(Math.max(0,r.hp))+'/'+r.maxHp;
  let hpPct=Math.max(0,r.hp/r.maxHp*100);
  $('#hpBar').style.width=hpPct+'%';
  $('#hpBar').style.background=hpPct<25?'#f44336':hpPct<50?'#ff9800':'#e8aa8c';
  $('#xpBar').style.width=Math.min(100,r.xp/r.xpNeed*100)+'%';
  $('#level').textContent=`Lv ${r.level} · ${r.xp}/${r.xpNeed} embers`;
  $('#timer').textContent=formatTime(r.time);
  $('#wave').textContent='Ch '+r.chapter+' · '+(r.wave===8?'Boss':'Wave '+r.wave+'/8');
  $('#runGold').textContent='+'+r.gold+' gold';

  if(r.combo>1&&r.comboTimer>0){
    $('#comboDock').textContent=`${r.combo}x COMBO`;
    $('#comboDock').classList.remove('hidden');
  }else{
    $('#comboDock').classList.add('hidden');
  }

  $('#skill span').textContent=r.skillCd>0?Math.ceil(r.skillCd)+'s':r.hero.skill;
  $('#skill').classList.toggle('ready',r.skillCd<=0);
  $('#skill').disabled=r.skillCd>0;
  $('#dash span').textContent=r.dashCd>0?Math.ceil(r.dashCd)+'s':'Dash';
  $('#dash').disabled=r.dashCd>0;

  let boss=r.enemies.find(e=>e.boss&&e.hp>0);
  $('#bossbar').classList.toggle('hidden',!boss);
  if(boss){$('#bossHp').style.width=boss.hp/boss.maxHp*100+'%';$('#bossName').textContent=boss.name+(r.bossPhase2?' · Enraged':'')}
}

function rect(c,x,y,w,h,color){c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),w,h)}

// Detailed Hero Rendering
function drawHero(c,x,y,h,t=0,scale=1){
  drawClassHero(c,x,y,h,t,scale);return;
  if(drawAnimatedHero(c,x,y,h,t,scale))return;
  if(spriteImages[h.id]?.loaded){
    c.save();c.translate(Math.round(x),Math.round(y));c.scale(scale,scale);
    c.fillStyle='#07161b99';c.beginPath();c.ellipse(0,12,12,4,0,0,Math.PI*2);c.fill();
    const moving=t>0,bob=moving?Math.sin(t*12)*1.4:Math.sin(idleTime*2)*.5;
    const flip=c===ctx&&run?.heading<0;
    paintSprite(c,h.id,0,15+bob,63,66,flip);
    if(c===ctx&&run){
      const w=run.weapon,attack=Math.max(0,1-(run.rate-run.attack)/.2);
      c.save();c.translate(flip?-16:16,0);c.rotate((flip?-.45:.45)+Math.sin(attack*Math.PI)*.4*(flip?-1:1));
      paintSprite(c,w.id,0,17,24,36,flip);c.restore();
    }
    c.restore();return;
  }
  c.save();c.translate(Math.round(x),Math.round(y));c.scale(scale,scale);
  let step=Math.sin(t*11)>0?1:0;

  // Feet shadow
  c.fillStyle='#09161a88';
  c.beginPath();c.ellipse(0,11,9,4,0,0,Math.PI*2);c.fill();

  if(h.id==='brann'){
    // Brann: The Lantern Keeper
    rect(c,-6,-4,12,14,'#5c412a');  // Leather tunic
    rect(c,-5,-3,10,6,'#8f6a45');   // Chestplate
    rect(c,-4,8,3,5+step,'#2b383d');
    rect(c,1,8,3,6-step,'#2b383d');
    rect(c,-5,-12,10,9,'#ffd094'); // Face
    rect(c,-6,-14,12,4,'#b57b3e'); // Hair/band
    rect(c,1,-8,2,2,'#1b2d2b');    // Eye
    // Right hand: Broadsword
    rect(c,-8,1,3,7,'#8f6a45');
    rect(c,-9,-8,2,14,'#cfdcd9');
    rect(c,-11,-2,6,2,'#a88950');
    // Left hand: Glow Lantern
    rect(c,6,1,3,7,'#8f6a45');
    rect(c,7,-1,6,9,'#4f4229');
    rect(c,8,1,4,5,'#ffe082');
    rect(c,9,2,2,3,'#ffffff');
  }else if(h.id==='nyx'){
    // Nyx: The Dusk Ranger
    rect(c,-5,-4,10,13,'#355243'); // Ranger cloak
    rect(c,-4,8,3,5+step,'#22322b');
    rect(c,1,8,3,6-step,'#22322b');
    rect(c,-4,-11,8,8,'#e2be96'); // Face
    rect(c,-6,-14,12,6,'#203b2e'); // Hood
    rect(c,1,-8,2,2,'#80ffd4');    // Glowing ranger eye
    // Quiver on back
    rect(c,-7,-7,3,10,'#6d4e2d');
    rect(c,-8,-10,2,4,'#e0d8ba');
    // Wooden recurve bow
    rect(c,6,-10,2,18,'#855b32');
    rect(c,7,-11,2,2,'#d0b894');
    rect(c,7,7,2,2,'#d0b894');
  }else{
    // Orin: The Ember Mage
    rect(c,-6,-4,12,15,'#4d3e75'); // Arcane robe
    rect(c,-4,-2,8,11,'#6b589e');  // Runed tunic
    rect(c,-2,1,4,5,'#e1b6ff');    // Rune sigil
    rect(c,-4,10,3,3+step,'#241f36');
    rect(c,1,10,3,4-step,'#241f36');
    rect(c,-4,-11,8,8,'#ecd0b1');  // Face
    rect(c,1,-8,2,2,'#d880ff');    // Glowing violet eyes
    // Pointed Wizard Hat
    rect(c,-7,-13,14,3,'#362a57');
    rect(c,-5,-18,10,5,'#4d3e75');
    rect(c,-2,-22,4,4,'#6b589e');
    // Glowing Arcane Staff
    rect(c,7,-8,2,20,'#7d6141');
    rect(c,6,-13,4,5,'#c48aff');
    rect(c,7,-12,2,3,'#ffffff');
  }
  c.restore();
}

// Detailed Enemy & Boss Rendering
function drawEnemy(c,e,t){
  if(e.chapter>1){drawChapterEnemy(c,e,t);return;}
  if(drawAnimatedEnemy(c,e,t))return;
  const id=e.boss?'king':e.type===1?'bat':'wisp';
  if(spriteImages[id]?.loaded){
    c.save();c.translate(Math.round(e.x),Math.round(e.y));
    const bob=e.boss?Math.sin(t*2)*2:e.type===1?Math.sin(t*14+e.phase)*3:Math.sin(t*4+e.phase)*2;
    c.fillStyle='#06171b88';c.beginPath();c.ellipse(0,e.size*.7,e.size*.85,e.size*.26,0,0,Math.PI*2);c.fill();
    if(e.flash>0)c.filter='brightness(2)';
    else if(e.boss&&run?.bossPhase2)c.filter='hue-rotate(315deg) saturate(1.6) brightness(1.12)';
    else if(e.type===3){c.filter='hue-rotate(75deg)';c.globalAlpha=.78}
    else if(e.type===4)c.filter='sepia(.7) saturate(1.6)';
    else if(e.type===2)c.filter='hue-rotate(25deg) brightness(.9)';
    const height=e.boss?123:e.type===4?70:e.type===1?37:45;
    const width=e.boss?118:e.type===4?66:e.type===1?67:48;
    if(e.type===1)c.scale(1,1+Math.sin(t*17+e.phase)*.12);
    paintSprite(c,id,0,e.size*.7+bob,width,height);
    c.filter='none';c.globalAlpha=1;
    if(e.type===2)paintSprite(c,'storm',16,15,22,36);
    if(e.boss&&run?.bossPhase2){for(let i=0;i<5;i++){let a=t*2+i*Math.PI*2/5;rect(c,Math.cos(a)*48-3,Math.sin(a)*30-20,5,5,'#e9a3ff')}}
    c.restore();return;
  }
  c.save();c.translate(Math.round(e.x),Math.round(e.y));

  // Shadow
  c.fillStyle='#09161a66';
  c.beginPath();c.ellipse(0,e.size*.7,e.size*.9,e.size*.35,0,0,Math.PI*2);c.fill();

  let col=e.flash>0?'#fff5d6':e.boss?(run?.bossPhase2?'#ff4081':'#78538a'):e.type===4?'#6b4938':e.type===3?'#658a9e':e.type===2?'#446949':e.type===1?'#81648a':'#5c7b52';

  if(e.boss){
    // Hollow King
    let enraged=run?.bossPhase2;
    rect(c,-20,-20,40,36,col);
    rect(c,-26,-10,8,22,col);
    rect(c,18,-10,8,22,col);
    // Spiked crown
    rect(c,-18,-27,8,10,'#d6b25a');
    rect(c,10,-27,8,10,'#d6b25a');
    rect(c,-4,-32,8,14,'#ffd770');
    // Glowing eyes
    rect(c,-12,-11,7,5,enraged?'#ffffff':'#fce295');
    rect(c,5,-11,7,5,enraged?'#ffffff':'#fce295');
    // Torso maw
    rect(c,-7,2,14,10,'#1f2430');
    rect(c,-14,16,10,8,col);
    rect(c,4,16,10,8,col);

    // Enraged Orbiting Energy Orbs
    if(enraged){
      for(let i=0;i<4;i++){
        let orbA=t*3+i*Math.PI/2;
        let ox=Math.cos(orbA)*36, oy=Math.sin(orbA)*36;
        rect(c,ox-3,oy-3,6,6,'#ff80ab');
        rect(c,ox-1,oy-1,2,2,'#ffffff');
      }
    }
  }else if(e.type===4){
    // Moss Brute
    let bob=Math.sin(t*5)*2;
    rect(c,-16,-14+bob,32,24,col);
    rect(c,-18,-10+bob,4,16,'#452f23');
    rect(c,14,-10+bob,4,16,'#452f23');
    rect(c,-10,-20+bob,20,8,'#543a2b');
    // Tusks & red eyes
    rect(c,-8,-14+bob,3,3,'#ff3b30');
    rect(c,5,-14+bob,3,3,'#ff3b30');
    rect(c,-12,-7+bob,4,8,'#e8dec5');
    rect(c,8,-7+bob,4,8,'#e8dec5');
    // Club
    rect(c,16,-18+bob,6,22,'#362216');
  }else if(e.type===3){
    // Specter (ghostly float)
    let floatY=Math.sin(t*4+e.phase)*4;
    c.globalAlpha=.7+.2*Math.sin(t*3);
    rect(c,-10,-14+floatY,20,22,col);
    rect(c,-7,8+floatY,4,5,col);
    rect(c,3,8+floatY,4,5,col);
    rect(c,-5,-8+floatY,3,3,'#b8f0ff');
    rect(c,2,-8+floatY,3,3,'#b8f0ff');
    c.globalAlpha=1;
  }else if(e.type===2){
    // Forest Archer
    rect(c,-9,-8,18,17,col);
    rect(c,-6,-13,12,6,'#27422b');
    rect(c,-4,-6,3,3,'#e8d38e');
    rect(c,2,-6,3,3,'#e8d38e');
    rect(c,-12,-5,3,12,'#735639'); // Bow
  }else if(e.type===1){
    // Cave Bat
    let flap=Math.sin(t*14)*6;
    rect(c,-8,-6,16,12,col);
    rect(c,-18,-9+flap,11,6,col);
    rect(c,7,-9+flap,11,6,col);
    rect(c,-4,-3,2,2,'#ff4055');
    rect(c,2,-3,2,2,'#ff4055');
  }else{
    // Shambler
    let waddle=Math.sin(t*8)*2;
    rect(c,-11,-10,22,19,col);
    rect(c,-8,-15,16,6,'#3c5234'); // Moss hat
    rect(c,-6,9,4,4+waddle,'#23301f');
    rect(c,2,9,4,4-waddle,'#23301f');
    rect(c,-5,-4,3,3,'#ffb03a');
    rect(c,2,-4,3,3,'#ffb03a');
  }

  c.restore();
}

// Background generation
const bg=document.createElement('canvas');bg.width=W;bg.height=H;const bc=bg.getContext('2d');
let seed=542;function rnd(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}
function tree(c,x,y,s=1,dark=false){
  c.save();c.translate(x,y);c.scale(s,s);
  rect(c,-4,-6,8,28,dark?'#1a3436':'#374e44');
  const cols=dark?['#132e32','#183739','#1d4140']:['#234840','#2b5746','#37654e'];
  for(let i=0;i<4;i++){
    let ww=42-i*8,yy=-20-i*16;
    rect(c,-ww/2,yy,ww,20,cols[i%3]);
    rect(c,-ww/2+5,yy-8,ww-10,12,cols[(i+1)%3]);
  }
  c.restore();
}
function makeBackground(){
  rect(bc,0,0,W,H,'#203833');
  for(let i=0;i<2400;i++){
    let x=rnd()*W,y=rnd()*H;
    rect(bc,x,y,rnd()*4+1,2,['#26433a','#2c4c3e','#1d3630','#325243'][Math.floor(rnd()*4)]);
  }
  for(let i=0;i<380;i++){
    let x=rnd()*W,y=rnd()*H;
    rect(bc,x,y,2,5,'#3f6148');
    rect(bc,x+3,y+2,2,3,'#3f6148');
  }
  for(let i=0;i<65;i++){
    let x=rnd()*W,y=rnd()*H;
    rect(bc,x,y,4,3,'#c7583a'); // Forest mushrooms
    rect(bc,x+1,y+3,2,3,'#dfd4b8');
  }
  for(let i=0;i<40;i++){
    let x=W/2+(rnd()-.5)*85,y=H/2+(rnd()-.5)*75;
    rect(bc,x,y,10,7,'#5a5c46');
  }
  for(let i=0;i<12;i++){
    let a=i*Math.PI/6;
    rect(bc,W/2+Math.cos(a)*32-4,H/2+Math.sin(a)*21-3,8,6,'#7d7c5c');
  }
  for(let x=-25;x<W+50;x+=45)tree(bc,x,35+rnd()*30,1.1+rnd()*.4,true);
  for(let y=90;y<H;y+=65){
    tree(bc,8+rnd()*15,y,1.1,true);
    tree(bc,W-5-rnd()*10,y,1.25,true);
  }
  for(let x=0;x<W;x+=58)tree(bc,x,H+45+rnd()*15,1.2,true);
  let vignette=bc.createRadialGradient(W/2,H/2,80,W/2,H/2,450);
  vignette.addColorStop(0,'#0b1e2500');
  vignette.addColorStop(1,'#071418b5');
  bc.fillStyle=vignette;
  bc.fillRect(0,0,W,H);
}
makeBackground();

function drawLantern(c,t){
  let x=W/2,y=H/2;
  let glow=c.createRadialGradient(x,y-10,2,x,y,100);
  glow.addColorStop(0,'#ffd48b44');
  glow.addColorStop(1,'#ffd48b00');
  c.fillStyle=glow;
  c.fillRect(x-110,y-110,220,220);
  if(paintSprite(c,'lantern',x,y+12,44,65))return;
  rect(c,x-3,y-31,6,42,'#a1946b');
  rect(c,x-13,y+8,26,6,'#6d7360');
  rect(c,x-12,y-35,24,4,'#7f8c70');
  rect(c,x-9,y-31,18,20,'#e6b768');
  rect(c,x-6,y-28,12,14,Math.sin(t*7)>.2?'#ffe8a7':'#ffdb87');
  rect(c,x-2,y-25,4,9,'#fff3ca');
  rect(c,x-11,y-13,22,4,'#968e62');
  rect(c,x-11,y-33,3,24,'#8c9169');
  rect(c,x+8,y-33,3,24,'#8c9169');
  rect(c,x-6,y-40,12,5,'#7f8c70');
}

function draw(t){
  artAspect=((canvas.clientHeight||H)/H)/((canvas.clientWidth||W)/W);
  ctx.save();
  if(shake>0&&!reducedMotion){
    ctx.translate((Math.random()-.5)*shake*1.5,(Math.random()-.5)*shake*1.5);
  }

  ctx.clearRect(0,0,W,H);
  if(run){ctx.save();const cam=camera(run);ctx.translate(-cam.x,-cam.y);drawWorld(ctx,run,t)}
  else {drawCampRealm(ctx,t)}

  // Atmospheric fireflies
  for(let i=0;i<24;i++){
    let fx=(i*137+Math.sin(t*.28+i*2.1)*28+W*1.5)%W;
    let fy=55+(i*89%(H-110))+Math.sin(t*.55+i*1.3)*18;
    let alpha=(.2+.6*Math.abs(Math.sin(t*1.8+i*.7)))*.7;
    ctx.globalAlpha=alpha;
    rect(ctx,fx,fy,2,2,'#d8ebb2');
  }
  ctx.globalAlpha=1;

  if(!run){
    ctx.save();ctx.globalAlpha=.65;drawEnemy(ctx,{x:W-125,y:210,type:1,boss:false,phase:0,size:10,flash:0},t);ctx.restore();
    drawHero(ctx,W-165,H-115,heroes.find(h=>h.id===save.hero),0,1.95);
    ctx.restore();
    return;
  }

  const r=run;

  // Draw Scorched Ground Patches (Ember Staff)
  for(const b of r.burnZones){
    ctx.fillStyle='#ff572233';
    ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#ff980066';ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(b.x,b.y,b.r*(b.t/2.8),0,Math.PI*2);ctx.stroke();
  }

  drawLanternWorld(ctx,r,camera(r),W,H);
  drawCombatPickups(ctx,r);
  drawMotionGround(ctx,r,{reduced:reducedMotion,skillColor:combatPalette[combatSkillRecipes[r.activeSkill]?.theme]||r.hero.color});

  drawDashTrails(ctx,r);

  // Actors (Y-sorted)
  const actors=[
    ...storyActors(r,t),
    ...r.corpses.map(e=>({y:e.y,draw:()=>drawEnemy(ctx,e,t)})),
    ...r.enemies.map(e=>({y:e.y,draw:()=>drawEnemy(ctx,e,t)})),
    {y:r.y,draw:()=>{
      if(r.shield>0){
        ctx.strokeStyle='#c1acef';ctx.lineWidth=2;
        ctx.fillStyle='#c1acef33';
        ctx.beginPath();ctx.arc(r.x,r.y-2,24,0,Math.PI*2);ctx.fill();ctx.stroke();
      }
      ctx.save();
      // Protected heroes stay visible; a soft pulse replaces alternate blank frames.
      if(r.invuln>0&&r.dashTime<=0&&!reducedMotion)ctx.globalAlpha*=.78+Math.sin(t*16)*.12;
      drawHero(ctx,r.x,r.y,r.hero,(keys.size||pointer)?r.time:0,1);
      ctx.restore();
    }}
  ].sort((a,b)=>a.y-b.y);

  actors.forEach(a=>a.draw());
  drawAtmosphere(ctx,r,t);
  drawStoryForeground(ctx,r);
  drawHeroAction(ctx,r);

  drawCombatProjectiles(ctx,r);
  drawMotionForeground(ctx,r,{reduced:reducedMotion});

  // Special skill rings
  for(const e of r.effects){
    ctx.globalAlpha=e.t/e.max;
    ctx.strokeStyle=e.color;ctx.lineWidth=4;
    ctx.beginPath();ctx.arc(e.x,e.y,(1-e.t/e.max)*e.r,0,Math.PI*2);ctx.stroke();
  }
  ctx.globalAlpha=1;

  // Particles
  for(const p of r.particles){
    ctx.globalAlpha=Math.min(1,p.t*3);
    rect(ctx,p.x,p.y,3,3,p.color);
  }
  ctx.globalAlpha=1;

  // Floating text
  ctx.font='bold 14px Consolas,monospace';
  ctx.textAlign='center';
  for(const p of r.texts){
    ctx.globalAlpha=Math.min(1,p.t*3);
    ctx.fillStyle='#0f1f23';ctx.fillText(p.text,p.x+1,p.y+1);
    ctx.fillStyle=p.color;ctx.fillText(p.text,p.x,p.y);
  }
  ctx.globalAlpha=1;

  ctx.restore();
  drawMinimap(ctx,r);
  // Low health warning border
  if(r.hp/r.maxHp<.28){
    let pulse=Math.sin(t*8)*.3+.4;
    ctx.strokeStyle=`rgba(244,67,54,${pulse})`;
    ctx.lineWidth=8;
    ctx.strokeRect(4,4,W-8,H-8);
  }

  ctx.restore();
}

// Icon rendering for Shop & Tabs
function drawIcon(c,type){
  let g=c.getContext('2d');g.clearRect(0,0,40,40);
  const asset=type==='sword'?'iron':type==='bow'?'storm':type==='camp'?'lantern':null;
  if(asset&&spriteImages[asset]?.loaded){paintArtBox(c,asset);return}
  if(type==='sword'){
    g.save();g.translate(20,20);g.rotate(.6);
    rect(g,-2,-15,5,23,'#d7e1cf');
    rect(g,-2,-15,2,23,'#fff3ca');
    rect(g,-8,6,16,3,'#dda65f');
    rect(g,-2,9,4,8,'#b48657');
    g.restore();
  }else if(type==='bow'){
    g.strokeStyle='#e4c282';g.lineWidth=3;
    g.beginPath();g.arc(17,20,13,-Math.PI/2,Math.PI/2);g.stroke();
    rect(g,17,7,1,26,'#dce4cc');
    rect(g,11,19,23,2,'#a8d4b6');
    rect(g,30,16,3,8,'#a8d4b6');
  }else if(type==='heart'){
    let rows=['0110110','1111111','1111111','0111110','0011100','0001000'];
    rows.forEach((r,y)=>[...r].forEach((v,x)=>{if(v==='1')rect(g,6+x*4,8+y*4,4,4,y<2?'#f2b39f':'#d68b81')}));
  }else if(type==='flame'){
    rect(g,18,6,5,25,'#ffd58b');rect(g,11,15,18,17,'#e6af65');
    rect(g,7,21,25,8,'#e6af65');rect(g,15,20,11,14,'#ffe5a2');
    rect(g,19,25,4,9,'#fff1c1');
  }else if(type==='boot'){
    rect(g,12,8,11,19,'#b9caaa');rect(g,12,24,21,9,'#d1b380');
    rect(g,10,30,24,4,'#e5cda0');rect(g,13,8,11,4,'#efe0b0');
  }else{
    rect(g,8,26,25,9,'#ad9a72');rect(g,12,16,17,12,'#c2b18a');
    rect(g,8,14,25,4,'#d7c28b');rect(g,18,4,5,11,'#ffd88e');
    rect(g,15,7,11,6,'#ffcc79');rect(g,18,20,5,8,'#263e3f');
  }
}

// Distinct Weapon Icons
function drawWeaponIcon(c,w){
  if(spriteImages[w.id]?.loaded){paintArtBox(c,w.id);return}
  let g=c.getContext('2d');g.clearRect(0,0,40,40);
  if(w.id==='iron'){
    g.save();g.translate(20,20);g.rotate(.75);
    rect(g,-2,-14,4,22,'#d7e1cf');
    rect(g,-6,6,12,3,'#8a7b63');
    rect(g,-2,9,4,6,'#574737');
    g.restore();
  }else if(w.id==='silver'){
    g.save();g.translate(20,20);g.rotate(.75);
    rect(g,-3,-16,6,24,'#e2f2ff');
    rect(g,-1,-16,2,24,'#ffffff');
    rect(g,-7,6,14,3,'#5ba0d0');
    rect(g,-2,9,4,7,'#264560');
    g.restore();
  }else if(w.id==='ember'){
    g.save();g.translate(20,20);g.rotate(.75);
    rect(g,-2,-12,4,26,'#7d5538');
    rect(g,-4,-18,8,8,'#ff7043');
    rect(g,-2,-16,4,4,'#ffe082');
    g.restore();
  }else if(w.id==='storm'){
    g.strokeStyle='#94e5b2';g.lineWidth=3;
    g.beginPath();g.arc(16,20,13,-Math.PI/2,Math.PI/2);g.stroke();
    rect(g,16,7,1,26,'#d8f5e3');
    rect(g,10,16,22,2,'#73c795');
    rect(g,10,22,22,2,'#73c795');
  }else if(w.id==='void'){
    g.save();g.translate(20,20);g.rotate(.75);
    rect(g,-3,-15,6,22,'#9c27b0');
    rect(g,-1,-14,2,20,'#e1bee7');
    rect(g,-6,5,12,3,'#4a148c');
    rect(g,-2,8,4,7,'#120024');
    g.restore();
  }
}

function frame(now){
  let dt=Math.min(.05,(now-lastFrame)/1000);
  lastFrame=now;
  idleTime+=dt;
  update(dt);
  draw(run?run.time:idleTime);
  // Phaser owns the frame loop.
}

// Class equipment, scrolling world, and a three-chapter campaign. All assets local.
function bakeHeldPose(c,im,id,state,p,w,h){
  const wave=Math.sin(p*Math.PI*2),action=Math.sin(p*Math.PI);c.save();
  c.translate(w*.38,h*.9);
  if(state==='death'){c.rotate(p*.65);c.globalAlpha=1-p;c.scale(1-p*.2,1-p*.6)}
  else if(state==='dash'){c.rotate(.17);c.translate(8*action,-3)}
  else if(state==='attack'){c.rotate(action*.12);c.translate(action*7,0)}
  else if(state==='skill'){c.rotate(-action*.06);c.translate(0,-action*6)}
  else if(state==='hurt'){c.scale(1+action*.08,1-action*.08);c.translate(-3*action,0)}
  else c.translate(0,state==='walk'?-Math.abs(wave)*2:-wave*.7);
  c.translate(-w*.38,-h*.9);
  if(state==='walk'){
    const y=Math.floor(h*.8),end=w*(id.includes('_rook_')?.96:.76),split=end*.49;
    c.save();c.beginPath();c.rect(-20,-20,w+40,h+40);c.rect(0,y,end,h-y+10);c.clip('evenodd');c.drawImage(im,0,0,w,h);c.restore();
    for(let side=0;side<2;side++){const x=side?split:0,bw=side?end-split:split,step=wave*(side?-1:1);c.save();c.translate(x+bw*.5,y);c.rotate(step*.13);c.drawImage(im,x,y,bw,h-y,-bw*.5,-Math.max(0,step)*2,bw,h-y);c.restore()}
  }else c.drawImage(im,0,0,w,h);
  c.restore();
}
function ensureClassWeapon(){
  const h=heroes.find(h=>h.id===save.hero)||heroes[0];
  for(const w of weapons.filter(w=>w.cost===0))if(!save.unlockedWeapons.includes(w.id))save.unlockedWeapons.push(w.id);
  // Purchased heroes stay unlocked; new heroes require their recruitment price.
  const current=weapons.find(w=>w.id===save.weapon);
  if(!current||current.classId!==h.classId){const remembered=weapons.find(w=>w.id===save.classLoadouts?.[h.classId]&&w.classId===h.classId&&save.unlockedWeapons.includes(w.id));save.weapon=remembered?.id||classStarters[h.classId]}
  save.chapterUnlocked=Math.max(1,Math.min(chapters.length,Math.floor(Number(save.chapterUnlocked)||1)));
}
const originalRenderShop=renderShop;
renderShop=function(){ensureClassWeapon();originalRenderShop()};
function renderChapterChoice(){
  ensureClassWeapon();
  selectedChapter=Math.min(selectedChapter,save.chapterUnlocked);
  $('#chapterChoice').innerHTML='<label class="small" for="chapterSelect">Starting chapter </label><select id="chapterSelect" style="max-width:100%;background:#1b3035;color:#f5ecd7;border:1px solid #829b8c;padding:5px;font:inherit" '+(run?'disabled':'')+'>'+chapters.map((ch,i)=>`<option value="${i+1}" ${i+1===selectedChapter?'selected':''} ${i+1>save.chapterUnlocked?'disabled':''}>${i+1}. ${ch.name}${i+1>save.chapterUnlocked?' · Locked':''}</option>`).join('')+'</select>';
  $('#chapterSelect').onchange=e=>{selectedChapter=Math.max(1,Math.min(save.chapterUnlocked,Number(e.target.value)||1));syncCamp()};
}
function camera(r){return{x:Math.max(0,Math.min(MW-W,r.x-W/2)),y:Math.max(0,Math.min(MH-H,r.y-H/2))}}
let worldMap=null;
function setupChapter(r){
  r.wave=1;r.waveTime=0;r.spawn=.8;r.bossSpawned=false;r.bossDead=false;r.bossPhase2=false;r.chapterDone=false;
  r.enemies=[];r.shots=[];r.drops=[];r.chests=[];r.corpses=[];r.hazards=[];r.burnZones=[];r.effects=[];r.ghosts=[];
  r.x=MW/2;r.y=MH/2+40;r.invuln=2;
  r.shrines=[{x:MW/2,y:MH/2,fuel:18},{x:470,y:420,fuel:12},{x:1910,y:1090,fuel:12}];
  r.caches=[{x:650,y:1050,open:false},{x:1780,y:440,open:false},{x:400,y:850,open:false},{x:2050,y:680,open:false}];
  $('#areaTitle').textContent=chapters[r.chapter-1].name;
  $('#bossbar').classList.remove('enraged');
  buildWorld(r.chapter);spawnEnemy(false,0);banner('Chapter '+r.chapter+' · '+chapters[r.chapter-1].name);
}
function buildWorld(ch){
  const d=chapters[ch-1];worldMap=document.createElement('canvas');worldMap.width=MW;worldMap.height=MH;const c=worldMap.getContext('2d');
  rect(c,0,0,MW,MH,d.ground);let z=ch*731+51;const rand=()=>{z=(z*1664525+1013904223)>>>0;return z/4294967296};
  for(let i=0;i<15000;i++)rect(c,rand()*MW,rand()*MH,2+rand()*7,2+rand()*3,d.detail);
  // Meandering paths connect the shrines and encourage exploration.
  c.strokeStyle=d.detail;c.lineWidth=55;c.beginPath();c.moveTo(0,850);c.bezierCurveTo(650,1050,1200,250,2400,800);c.stroke();
  for(let i=0;i<160;i++){
    const x=rand()*MW,y=rand()*MH;if(Math.hypot(x-MW/2,y-MH/2)<130)continue;
    if(ch===1){rect(c,x,y,5,16,'#65513b');rect(c,x-10,y-13,27,22,'#18382d');rect(c,x-5,y-24,18,17,'#335746')}
    else if(ch===2){rect(c,x-9,y-6,23,16,'#211f25');rect(c,x-4,y-13,15,9,'#685343');rect(c,x+2,y-9,3,8,'#c26e3d')}
    else{rect(c,x,y,13,25,'#506777');rect(c,x-4,y-4,21,7,'#9bbfc9');rect(c,x+4,y+4,3,14,'#273746')}
  }
  c.strokeStyle=d.accent;c.lineWidth=8;c.strokeRect(4,4,MW-8,MH-8);
}
function drawWorld(c,r,t){
  c.drawImage(worldMap,0,0);
  for(const s of r.shrines){c.save();c.translate(s.x-W/2,s.y-H/2);if(s.fuel<=0)c.globalAlpha=.3;drawLantern(c,t);c.restore();c.strokeStyle=s.fuel>0?'#ffc76b66':'#667066';c.beginPath();c.arc(s.x,s.y,60,0,Math.PI*2);c.stroke()}
  for(const b of r.caches){if(b.open)continue;rect(c,b.x-12,b.y-9,24,18,'#956537');rect(c,b.x-14,b.y-7,28,5,'#ffc76b');rect(c,b.x-2,b.y-3,5,8,'#fff0cd')}
  for(const h of r.hazards){c.fillStyle=h.t>h.delay?'#ff934433':'#ff934499';c.strokeStyle=h.t>h.delay?'#ffcf91':'#ff7344';c.lineWidth=2;c.beginPath();c.arc(h.x,h.y,h.radius,0,Math.PI*2);c.fill();c.stroke();if(h.t>h.delay){c.beginPath();c.arc(h.x,h.y,h.radius*(1-(h.t-h.delay)/.9),0,Math.PI*2);c.stroke()}}
}
function drawMinimap(c,r){
  const x=12,y=H-190,w=132,h=76;c.save();c.fillStyle='#101f24e8';c.fillRect(x,y,w,h);c.strokeStyle='#829b8c';c.strokeRect(x,y,w,h);
  const dot=(px,py,color,size=3)=>rect(c,x+px/MW*w-size/2,y+py/MH*h-size/2,size,size,color);
  r.shrines.filter(s=>s.fuel>0).forEach(s=>dot(s.x,s.y,'#ffc76b',5));r.caches.filter(s=>!s.open).forEach(s=>dot(s.x,s.y,'#e8d7a0'));
  r.enemies.forEach(e=>dot(e.x,e.y,e.boss?'#ff9344':'#f49b8d',e.boss?6:2));dot(r.x,r.y,'#fff',5);
  const cam=camera(r);c.strokeStyle='#b4c6bd77';c.strokeRect(x+cam.x/MW*w,y+cam.y/MH*h,W/MW*w,H/MH*h);
  c.font='10px Consolas';c.fillStyle='#f5ecd7';c.textAlign='left';c.fillText('Gold: shrine / cache',x+3,y-4);c.restore();
}
function updateWorld(r,dt){
  for(const s of r.shrines)if(s.fuel>0&&r.hp<r.maxHp&&Math.hypot(r.x-s.x,r.y-s.y)<60)s.fuel=Math.max(0,s.fuel-dt);
  for(const b of r.caches)if(!b.open&&Math.hypot(r.x-b.x,r.y-b.y)<30){b.open=true;const n=6;r.gold+=n;save.gold+=n;r.hp=Math.min(r.maxHp,r.hp+18);textPop(b.x,b.y,'Cache +'+n+'g · +18 HP','#ffc76b');persist();updateWallet()}
  for(const h of r.hazards){const before=h.t;h.t-=dt;if(h.t<=h.delay&&!h.struck){h.struck=true;const at=dt>0?Math.max(0,Math.min(1,(before-h.delay)/dt)):1;
    if(Math.hypot(r.x-h.x,r.y-h.y)<h.radius&&(r.mode!=='story'||!r.story||storyLineOfSight(r,h.x,h.y,r.x,r.y,1)))damagePlayer(r,h.dmg,'hazard',at);
  }}
  r.hazards=r.hazards.filter(h=>h.t>0);
  // Enemies left far behind re-enter outside view, so running remains a tactic, not an empty map.
  for(const e of r.enemies)if(!e.boss&&Math.hypot(e.x-r.x,e.y-r.y)>1050){const p=directorSpawnPoint(r,false,e.size);if(p){e.x=p.x;e.y=p.y;e.spawnGrace=DIRECTOR_CONFIG.arrivalSeconds}}
}
spawnEnemy=function(boss=false,forcedType){
  const r=run,a=Math.random()*Math.PI*2;
  const x=Math.max(20,Math.min(MW-20,r.x+Math.cos(a)*520)),y=Math.max(20,Math.min(MH-20,r.y+Math.sin(a)*370));
  const pool=r.wave===1?[0,1]:r.wave===2?[0,1,2,3]:[0,1,2,3,4];
  const type=boss?99:forcedType??pool[Math.floor(Math.random()*pool.length)],scale=1+(r.chapter-1)*.38+Math.min(save.wins,5)*.08;
  const hp=(boss?[720,1050,1400][r.chapter-1]:[30,22,43,35,105][type]+(r.wave-1)*7)*scale;
  r.enemies.push({x,y,hp,maxHp:hp,type,boss,chapter:r.chapter,name:boss?chapters[r.chapter-1].boss:chapters[r.chapter-1].family[type],speed:boss?29:[31,57,27,40,23][type]*(1+(r.chapter-1)*.09),size:boss?29:[12,9,14,11,18][type],dmg:boss?26:([10,8,12,11,20][type]+(r.chapter-1)*2),flash:0,attack:0,phase:0,shoot:boss?3:2.5,charging:0,chargeCd:3,traitCd:4,stun:0});
};
function advanceWaves(r,dt){
  r.waveTime+=dt;
  if(r.wave<4&&r.waveTime>=24){r.wave++;r.waveTime=0;r.hp=Math.min(r.maxHp,r.hp+12);r.gold+=3;save.gold+=3;persist();
    if(r.wave===4){r.bossSpawned=true;spawnEnemy(true);banner(chapters[r.chapter-1].boss+' approaches!')}
    else {spawnEnemy(false,r.wave===2?2:4);banner('Wave '+r.wave+' · '+chapters[r.chapter-1].family[r.wave===2?2:4]+' · +12 HP')}
  }
  r.spawn-=dt;
  if(r.spawn<=0&&r.enemies.length<(r.wave===4?12:50)){
    spawnEnemy();r.spawn=r.wave===4?3.4:Math.max(.42,1.3-r.wave*.15-(r.chapter-1)*.13);
    if(r.chapter>1&&r.wave===3&&Math.random()<.25)spawnEnemy();
  }
}
function finishChapter(r){
  r.chapterDone=true;
  if(r.chapter===3){endRun(true);return}
  save.chapterUnlocked=Math.max(save.chapterUnlocked||1,r.chapter+1);const reward=25;save.gold+=reward;r.gold+=reward;persist();updateWallet();r.paused=true;keys.clear();pointer=null;
  showModal('Chapter '+r.chapter+' cleared',`<p>${chapters[r.chapter-1].boss} has fallen. You earned ${reward} bonus gold and unlocked ${chapters[r.chapter].name}.</p><p>Continue with your blessings, recover 45% health, and refresh your skill. The next land has new enemies and a new boss.</p>`,[{label:'Continue to '+chapters[r.chapter].name,primary:true,fn:()=>{closeModal();r.chapter++;r.hp=Math.min(r.maxHp,r.hp+r.maxHp*.45);r.skillCd=0;r.dashCd=0;setupChapter(r);r.paused=false;updateHud()}},{label:'Bank gold & return',fn:()=>{closeModal();endRun(false,true)}}],'chapter');
}
function hostileShot(e,a,speed=125,dmg=13){run.shots.push({x:e.x,y:e.y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,t:5,enemy:true,dmg,color:chapters[e.chapter-1].accent})}
function dangerZone(x,y,radius,dmg){run.hazards.push({x,y,radius,dmg,t:1.3,delay:.4,struck:false})}
function bossAI(e,r,dt,a,dis){
  if(!r.bossPhase2&&e.hp<=e.maxHp*.5){r.bossPhase2=true;banner(e.name+' enrages!');$('#bossbar').classList.add('enraged');e.shoot=Math.max(e.shoot,1)}
  if(e.chapter===2&&e.charging>0){e.charging-=dt;if(e.charging<.55){e.x+=Math.cos(e.chargeAngle)*230*dt;e.y+=Math.sin(e.chargeAngle)*230*dt}}
  else{e.x+=Math.cos(a)*e.speed*dt;e.y+=Math.sin(a)*e.speed*dt}
  e.x=Math.max(25,Math.min(MW-25,e.x));e.y=Math.max(25,Math.min(MH-25,e.y));e.shoot-=dt;
  if(e.shoot>0)return;e.attackAnim=.4;e.shoot=r.bossPhase2?2.8:3.8;
  if(e.chapter===1){const count=r.bossPhase2?14:10;for(let i=0;i<count;i++)hostileShot(e,i*Math.PI*2/count+e.phase*.3,r.bossPhase2?110:85);}
  if(e.chapter===2){e.charging=1.15;e.chargeAngle=a;for(let i=-2;i<=2;i++)dangerZone(r.x+i*48,r.y+Math.sin(i)*45,32,20);for(let k=-2;k<=2;k++)hostileShot(e,a+k*.2,135,14)}
  if(e.chapter===3){for(let i=0;i<12;i++)hostileShot(e,i*Math.PI/6+e.phase*.45,100,15);for(let i=0;i<(r.bossPhase2?3:2)&&r.enemies.length<20;i++)spawnEnemy(false,1);dangerZone(r.x,r.y,65,25)}
}
function enemyTrait(e,r,dt,a,dis){
  if(e.boss)return;e.traitCd-=dt;
  if(e.stun>0){e.stun-=dt;e.x-=Math.cos(a)*e.speed*dt;e.y-=Math.sin(a)*e.speed*dt}
  if(e.chapter===2&&e.type===3&&e.traitCd<=0&&dis<180){dangerZone(r.x,r.y,26,14);e.traitCd=4.5}
  if(e.chapter===3&&e.type===2&&e.traitCd<=0&&dis<240){for(let i=-1;i<=1;i++)hostileShot(e,a+i*.3,110,10);e.traitCd=4}
  if(e.chapter===3&&e.type===3&&dis<50){r.slow=.25}
}
function classAttack(r){
  const targets=r.enemies.filter(e=>e.hp>0&&(r.mode!=='story'||!r.story||storyLineOfSight(r,r.x,r.y,e.x,e.y,3))).sort((a,b)=>Math.hypot(a.x-r.x,a.y-r.y)-Math.hypot(b.x-r.x,b.y-r.y));
  if(!targets.length)return;const target=targets[0],distance=Math.hypot(target.x-r.x,target.y-r.y);if(distance>r.hero.range)return;
  r.aim=Math.atan2(target.y-(r.y-28),target.x-r.x);r.heading=Math.cos(r.aim)<0?-1:1;
  const melee=['keeper','brawler'].includes(r.hero.classId);
  if(melee){for(const e of targets)if(Math.hypot(e.x-r.x,e.y-r.y)<r.hero.range+e.size){hit(e,r.dmg*(1+r.multi*.15));const a=Math.atan2(e.y-r.y,e.x-r.x);displaceEnemy(run,e,Math.cos(a)*16,Math.sin(a)*16)}}
  else for(let i=0;i<=r.multi;i++)shoot(r.x+Math.cos(r.aim)*18,r.y-28+Math.sin(r.aim)*18,r.aim+(i-r.multi/2)*.12,r.dmg,r.hero.classId==='gunner'?580:340,r.pierce);
  r.attack=r.rate;r.anim.attackLeft=.23;sound(r.hero.classId==='gunner'?110:420,.025,'triangle',.015);
}
const previousHit=hit;
hit=function(e,dmg,isSkill=false,isBurnTick=false){const living=e.hp>0;previousHit(e,dmg,isSkill,isBurnTick);if(living&&!isSkill&&!isBurnTick&&run.hero.classId==='healer')run.hp=Math.min(run.maxHp,run.hp+((run.weapon.tier||0)>=2?2:1))};
const oldSkill=skill;
skill=function(){
  if(!run||run.paused||run.skillCd>0)return;const r=run,k=r.hero.classId,f=1+save.up.power*.035;
  if(k==='keeper'||k==='archer'){oldSkill();return}
  r.skillCd=r.hero.cd;r.anim.skillLeft=.72;
  if(k==='mage'||k==='brawler'){
    const radius=k==='mage'?240:170;r.effects.push({x:r.x,y:r.y,t:.7,max:.7,r:radius,color:r.hero.color});
    for(const e of r.enemies)if(Math.hypot(e.x-r.x,e.y-r.y)<radius){hit(e,(k==='mage'?160:120)*f,true);e.stun=1.4;const a=Math.atan2(e.y-r.y,e.x-r.x);displaceEnemy(run,e,Math.cos(a)*65,Math.sin(a)*65);if(k==='mage')r.burnZones.push({x:e.x,y:e.y,r:38,t:3,tick:0,dmg:r.dmg*.25})}
  }else if(k==='healer'){r.hp=Math.min(r.maxHp,r.hp+55*f*(1+(r.skillRank||0)*.01));r.shield=4;r.effects.push({x:r.x,y:r.y,t:.8,max:.8,r:150,color:r.hero.color});for(const e of r.enemies)if(Math.hypot(e.x-r.x,e.y-r.y)<150){const a=Math.atan2(e.y-r.y,e.x-r.x);displaceEnemy(run,e,Math.cos(a)*90,Math.sin(a)*90)}textPop(r.x,r.y-25,'Sanctuary +'+Math.round(55*f),'#fff0cd')}
  else{for(let i=-6;i<=6;i++)shoot(r.x,r.y-28,r.aim+i*.07,55*f,580,true);r.effects.push({x:r.x,y:r.y,t:.4,max:.4,r:80,color:r.hero.color})}
  sound(290,.18,'triangle');updateHud();
};
$('#skill').onclick=skill;
function drawEquipment(c,w,time=0){
  if(spriteImages[w.id]?.loaded){
    if(['thunder','titan'].includes(w.id)){
      const im=spriteImages[w.id],sw=im.naturalWidth/2,sh=im.naturalHeight,f=Math.min(25/sw,27/sh),dw=sw*f,dh=sh*f;c.drawImage(im,0,0,sw,sh,Math.round(-dw*.5),Math.round(-dh*.55),Math.round(dw),Math.round(dh));return;
    }
    const im=spriteImages[w.id],maxW=w.classId==='gunner'?48:w.classId==='brawler'?27:38,maxH=w.classId==='gunner'?32:w.classId==='brawler'?28:58,f=Math.min(maxW/im.naturalWidth,maxH/im.naturalHeight),ww=im.naturalWidth*f,hh=im.naturalHeight*f;
    const centered=['brawler','archer'].includes(w.classId)||w.id==='codex',hanging=['soulfire','eclipselantern','bell','seraph'].includes(w.id),gx=hanging?.5:centered?.5:.24,gy=hanging?.15:centered?.5:.72;
    c.drawImage(im,Math.round(-ww*gx),Math.round(-hh*gy),Math.round(ww),Math.round(hh));return;
  }
  if(['iron','silver','void','ember','storm'].includes(w.id)&&paintSprite(c,w.id,14,7,30,48))return;
  const id=w.id,col=w.color;
  if(w.classId==='brawler'){rect(c,0,-8,12,13,'#29373e');rect(c,2,-10,13,12,col);rect(c,4,-10,3,3,'#fff0cd');rect(c,-22,-5,10,11,col)}
  else if(w.classId==='gunner'){rect(c,-8,-6,30,8,'#283b47');rect(c,9,-8,18,6,col);rect(c,1,1,5,10,'#846548');rect(c,-12,-5,9,11,'#956c4b');rect(c,18,-9,4,3,'#dbeaf0');if(id==='repeater')rect(c,11,0,18,3,col)}
  else if(w.classId==='archer'){c.strokeStyle=col;c.lineWidth=3;c.beginPath();c.moveTo(11,-22);c.quadraticCurveTo(34,-2,11,18);c.stroke();c.strokeStyle='#e8e3c7';c.lineWidth=1;c.beginPath();c.moveTo(11,-22);c.lineTo(11,18);c.stroke();rect(c,-1,-3,28,2,col)}
  else {rect(c,9,-27,4,53,'#8d6946');rect(c,10,-24,2,43,'#cf9c59');
    if(id==='crook'){rect(c,1,-31,15,4,'#ba8845');rect(c,0,-28,3,13,'#ba8845');rect(c,-5,-16,13,15,'#73532e');rect(c,-3,-13,9,9,'#ffc76b');rect(c,0,-11,3,5,'#fff0cd')}
    else{rect(c,4,-28,15,9,col);rect(c,8,-34,7,21,col);rect(c,10,-29,3,8,'#fff0cd');if(id==='halo'){c.strokeStyle=col;c.lineWidth=2;c.beginPath();c.arc(11,-24,14,0,Math.PI*2);c.stroke()}}
  }
}
function drawClassHero(c,x,y,h,t=0,scale=1,previewWeapon=null){
  const r=c===ctx&&run&&run.hero.id===h.id?run:null,k=h.classId;
  const pose=r?getHeroPose(r):{state:'idle',phase:0},step=r?.anim.moving?Math.sin(r.anim.walkClock*12):0;
  const attack=r?.anim.attackLeft>0?Math.sin((1-r.anim.attackLeft/.23)*Math.PI):0,cast=r?.anim.skillLeft>0?Math.sin((1-r.anim.skillLeft/.72)*Math.PI):0;
  const flip=r?r.heading<0:false,w=previewWeapon||r?.weapon||weapons.find(w=>w.id===(h.id===save.hero?save.weapon:classStarters[k]));
  const heldId='held_'+h.id+'_'+w.id;
  if(spriteImages[heldId]?.loaded){
    if(!animationSheets[heldId]){const cached=Object.keys(animationSheets).filter(id=>id.startsWith('held_'));if(cached.length>=6)delete animationSheets[cached[0]];makeAnimationSheet(heldId,true)}
    c.save();c.translate(Math.round(x),Math.round(y));c.scale(scale,scale);
    c.fillStyle='#07161b99';c.beginPath();c.ellipse(0,13,15,5,0,0,Math.PI*2);c.fill();
    const size=k==='archer'?100:k==='keeper'?92:k==='mage'?90:86;
    if(r?.anim.moving&&pose.state==='attack'){
      c.save();c.beginPath();c.rect(-100,-130,200,132);c.clip();paintAnimated(c,heldId,pose.state,pose.phase,0,15,112,size,flip);c.restore();
      c.save();c.beginPath();c.rect(-100,2,200,55);c.clip();paintAnimated(c,heldId,'walk',loopPhase(r.anim.walkClock,12,8),0,15,112,size,flip);c.restore();
    }else paintAnimated(c,heldId,pose.state,pose.phase,0,15,112,size,flip);
    c.restore();return;
  }
  if(animationSheets[h.id]){
    c.save();c.translate(Math.round(x),Math.round(y));c.scale(scale*(flip?-1:1),scale);
    c.fillStyle='#07161b99';c.beginPath();c.ellipse(0,13,15,5,0,0,Math.PI*2);c.fill();
    if(r?.anim.moving&&pose.state==='attack'){
      c.save();c.beginPath();c.rect(-90,-100,180,103);c.clip();paintAnimated(c,h.id,pose.state,pose.phase,0,15,70,80,false);c.restore();
      c.save();c.beginPath();c.rect(-90,3,180,60);c.clip();paintAnimated(c,h.id,'walk',loopPhase(r.anim.walkClock,12,8),0,15,70,80,false);c.restore();
    }else paintAnimated(c,h.id,pose.state,pose.phase,0,15,70,80,false);
    const hand={brann:[18,-27],nyx:[18,-22],orin:[19,-24],rook:[21,-28],sera:[19,-24],jax:[20,-21]}[h.id];
    if(k==='brawler'){c.save();if(c===ctx)c.scale(artAspect,1);c.translate(-13-attack*2,-27-cast*8);drawEquipment(c,w,t);c.restore()}
    c.save();if(c===ctx)c.scale(artAspect,1);c.translate(hand[0]+attack*2,hand[1]-cast*5);c.rotate(cast?-.35:['keeper','brawler'].includes(k)?-attack*.35:Math.max(-.25,Math.min(.25,(r?.aim||0)*(flip?-1:1))));drawEquipment(c,w,t);if(k!=='brawler')rect(c,-1,-1,3,3,'#b58a5d');c.restore();c.restore();return;
  }
  c.save();c.translate(Math.round(x),Math.round(y));c.scale(scale*(c===ctx?artAspect:1)*(flip?-1:1),scale);
  c.fillStyle='#07161b99';c.beginPath();c.ellipse(0,13,16,5,0,0,Math.PI*2);c.fill();
  c.translate(r?.dashTime>0?8:0,Math.abs(step)*-2-cast*5);if(r?.dashTime>0)c.rotate(.18);
  // Independent legs, torso, rear arm, head, front arm and class equipment.
  const coat=k==='keeper'?'#77502e':k==='archer'?'#315f48':k==='mage'?'#554075':k==='healer'?'#a7b8ae':k==='gunner'?'#365666':'#704b40';
  const light=h.color,dark='#182b31',skin='#e8bc85';
  rect(c,-12,1+step*3,9,14,dark);rect(c,3,1-step*3,9,14,dark);rect(c,-14,10+step*3,12,6,'#806242');rect(c,3,10-step*3,13,6,'#806242');
  if(['archer','mage','healer'].includes(k)){rect(c,-17,-25,30,30,coat);rect(c,-19+step*2,-7,9,17,coat);rect(c,-16,-23,3,29,light)}
  rect(c,-14,-26,27,29,dark);rect(c,-11,-25,23,27,coat);rect(c,-9,-23,4,21,light);rect(c,-8,-2,21,5,'#8f7045');rect(c,1,-3,5,6,'#e8c776');
  rect(c,-18,-22,8,19,coat);rect(c,-18,-8,7,7,skin);
  rect(c,-9,-44,22,22,dark);rect(c,-7,-42,18,16,skin);rect(c,6,-36,3,4,dark);rect(c,-6,-42,13,4,'#765537');
  if(k==='keeper'){rect(c,-17,-45,34,5,'#b47c35');rect(c,-10,-53,22,9,'#c18b3d');rect(c,-7,-56,16,5,'#dfaa53');rect(c,-12,-27,27,6,'#a67c42')}
  if(k==='archer'){rect(c,-12,-48,26,9,coat);rect(c,-14,-43,7,19,coat);rect(c,-7,-28,20,7,coat);rect(c,-9,-49,17,3,light)}
  if(k==='mage'){rect(c,-17,-45,35,5,coat);rect(c,-10,-52,23,8,coat);rect(c,-6,-60,15,9,coat);rect(c,-2,-68,7,10,coat);rect(c,-9,-48,23,3,light)}
  if(k==='healer'){rect(c,-11,-47,25,6,'#dae2d3');rect(c,-13,-43,6,18,'#dae2d3');rect(c,0,-47,4,9,'#e8bb66')}
  if(k==='gunner'){rect(c,-12,-45,27,6,coat);rect(c,-5,-40,19,5,'#b1c4c8');rect(c,1,-39,11,3,'#467389')}
  if(k==='brawler'){rect(c,-10,-45,24,5,'#6b4539');rect(c,-11,-40,23,4,light);rect(c,-15,-24,8,12,skin);rect(c,9,-24,8,13,skin)}
  c.save();c.translate(11+attack*5,-17-cast*12);c.rotate(cast?-.65:k==='keeper'||k==='brawler'?-attack*.8:Math.max(-.6,Math.min(.6,(r?.aim||0)*(flip?-1:1))));
  rect(c,-6,-3,12,7,coat);drawEquipment(c,w,t);rect(c,0,-1,6,6,skin);c.restore();
  if(pose.state==='hurt'){c.globalAlpha=.4;rect(c,-10,-40,22,40,'#fff0cd')}
  c.restore();
}
// Match afterimages to the currently selected class and equipped item.
drawDashTrails=function(c,r){
  for(const g of r.ghosts){c.save();c.globalAlpha=Math.max(0,g.life/.27)*.22;drawClassHero(c,g.x,g.y,r.hero,r.time);c.restore()}
  const im=spriteImages['dash_'+r.hero.id];
  if(r.dashTime>0&&im?.loaded){c.save();c.translate(r.x-r.lastDx*26,r.y-15-r.lastDy*26);c.rotate(Math.atan2(r.lastDy,r.lastDx)+Math.PI);c.globalAlpha=reducedMotion?.3:.7;c.drawImage(im,-65,-22,105,44);c.restore()}
};
const originalActionArt=drawHeroAction;
drawHeroAction=function(c,r){
  originalActionArt(c,r);const im=spriteImages['skill_'+r.hero.id];if(r.anim.skillLeft<=0||!im?.loaded)return;
  const p=1-r.anim.skillLeft/.72,size=65+p*105;c.save();c.translate(r.x,r.y-(r.hero.id==='jax'?45:15));c.globalAlpha=Math.sin(p*Math.PI)*.8;
  if(r.hero.id==='jax'){c.rotate(r.aim);c.drawImage(im,10,-35,105,70)}
  else if(r.hero.id==='nyx'){c.rotate(p*.6);c.drawImage(im,-size/2,-size*.9,size,size)}
  else{c.rotate(p*(r.hero.id==='orin'?1.6:.35));c.drawImage(im,-size/2,-size/2,size,size)}c.restore();
};
function drawChapterEnemy(c,e,t){
  const spriteId='enemy'+e.chapter+'_'+e.type;
  if(animationSheets[spriteId]){
    let state=e.dead?'death':e.flash>0?'hurt':e.charging>0?'dash':e.attackAnim>0?'attack':'walk';
    let phase=e.dead?Math.min(.99,e.deathAge/e.deathDuration):e.flash>0?1-e.flash/.12:e.attackAnim>0?Math.min(.99,1-e.attackAnim/.4):loopPhase(e.phase||t,e.type===1?14:9,8);
    c.save();if(e.flash>0)c.filter='brightness(1.7)';
    const h=e.boss?125:e.type===4?76:e.type===1?44:54;
    paintAnimated(c,spriteId,state,phase,e.x,e.y+e.size*.6,e.boss?140:e.type===1?80:72,h,!!run&&run.x<e.x);c.restore();
    if(!e.dead&&e.boss&&e.charging>.55){c.save();c.strokeStyle='#ffc76b';c.lineWidth=3;c.beginPath();c.moveTo(e.x,e.y);c.lineTo(e.x+Math.cos(e.chargeAngle)*170,e.y+Math.sin(e.chargeAngle)*170);c.stroke();c.restore()}return;
  }
  const fire=e.chapter===2,phase=e.phase||t,step=Math.sin(phase*8),boss=e.boss;
  c.save();c.translate(e.x,e.y);c.scale(boss?2.2:e.type===4?1.45:1,boss?2.2:e.type===4?1.45:1);
  if(e.dead){c.globalAlpha=Math.max(0,1-e.deathAge/e.deathDuration);c.scale(1+e.deathAge,1-e.deathAge/e.deathDuration)}
  if(e.flash>0)c.filter='brightness(1.7)';
  const shell=fire?'#694d3c':'#526e8b',light=fire?'#ff9344':'#a9d8e5';
  c.fillStyle='#06171b88';c.beginPath();c.ellipse(0,8,19,5,0,0,Math.PI*2);c.fill();
  if(e.type===1||(!fire&&boss)){
    for(const side of [-1,1]){c.save();c.scale(side,1);c.rotate(step*.25);c.fillStyle=shell;c.beginPath();c.moveTo(4,-12);c.lineTo(32,-32);c.lineTo(27,-4);c.lineTo(16,-10);c.lineTo(9,0);c.fill();rect(c,16,-22,12,3,light);c.restore()}
    rect(c,-8,-22,16,23,shell);rect(c,-5,-19,3,4,light);rect(c,3,-19,3,4,light);
    if(boss){rect(c,-6,-30,3,11,light);rect(c,3,-30,3,11,light);rect(c,-4,-8,8,8,'#b5a0ed')}
  }else if(fire){
    for(const side of [-1,1])for(let i=0;i<3;i++){rect(c,side*(14+i%2*3),-17+i*9+Math.sin(phase*8+i)*3,side*9,3,shell)}
    rect(c,-14,-29,28,33,shell);rect(c,-10,-32,20,7,'#927258');rect(c,-2,-28,4,29,light);rect(c,-11,-20,6,5,light);rect(c,5,-20,6,5,light);
    if(e.type===2){rect(c,-6,-12,12,7,'#231d25');rect(c,-3,-11,6,4,light)}
    if(boss){rect(c,-20,-31,6,14,light);rect(c,14,-31,6,14,light)}
  }else{
    rect(c,-12,-26,24,29,shell);rect(c,-10,-42,20,18,'#a9bdc5');rect(c,-7,-36,5,5,'#283c56');rect(c,3,-36,5,5,'#283c56');rect(c,-15,-23,6,21,shell);rect(c,9,-23,6,21,shell);rect(c,-10,0+step*2,7,12,shell);rect(c,3,0-step*2,7,12,shell);rect(c,-4,-25,8,15,light);
    if(e.type===2){rect(c,17,-38,3,42,'#927258');rect(c,13,-43,11,9,'#b5a0ed')}
    if(e.type===3){c.globalAlpha=.5;for(let i=0;i<4;i++)rect(c,-12+i*7,4+step*4,5,10,light)}
  }
  if(boss&&e.charging>.55){c.strokeStyle='#fff0cd';c.lineWidth=2;c.beginPath();c.arc(0,0,30,0,Math.PI*2);c.stroke()}
  c.restore();
}
// Native pixel portraits contain the same separated equipment used in gameplay.
ensureClassWeapon();
for(const w of weapons){if(spriteData[w.id])continue;const c=document.createElement('canvas');c.width=90;c.height=110;const g=c.getContext('2d');g.translate(40,55);g.scale(1.7,1.7);drawEquipment(g,w);spriteData[w.id]=c.toDataURL()}
// Keep source body portraits intact; equipment is attached separately in combat.
$('#about').onclick=()=>showModal('Classes & chapter field guide','<p>Attacks aim automatically. Move with WASD / arrows or drag. Shift dashes; Space uses your class skill.</p><p><strong>Brann / Lantern Keeper:</strong> swords and crooks. <strong>Brawler:</strong> gauntlets. <strong>Mage:</strong> staves. <strong>Archer:</strong> bows. <strong>Healer:</strong> scepters. <strong>Gunner:</strong> rifles. The armory shows only compatible weapons.</p><p>Each chapter has three 24-second waves followed by a boss wave. New enemy types enter on waves 2 and 3. Beat the boss to unlock the next chapter, recover health and carry your blessings forward.</p><p>Explore the minimap: gold points are limited healing shrines and treasure caches. Orange circles warn of incoming attacks. Dash out before they explode. Frost shades slow you at close range.</p><p>Woods: Hollow King fires rings. Quarry: Cindermaw charges and erupts the ground. Ruins: Eclipse Matriarch summons Icewings and marks your position. Bosses enrage at half health.</p><p>Your existing gold and purchases carry over. Export your save before moving browsers. Everything works offline.</p>',[{label:'Back',primary:true,fn:closeModal}],'about');
const openClassGuide=$('#about').onclick;
$('#about').onclick=()=>{const resume=run&&!run.paused;if(resume)run.paused=true;keys.clear();pointer=null;openClassGuide();modalKind='help';$('#modalActions').children[0].onclick=()=>{closeModal();if(resume&&run)run.paused=false}};
$('#help').onclick=$('#about').onclick;

// Six realms, persistent long-term recruitment and equipment progression.
weaponLocked=function(w){return w.tier===4?(save.chapterUnlocked<6||save.wins<3):w.tier===3?(save.chapterUnlocked<5):w.tier===2?(save.chapterUnlocked<3):w.tier===1?(save.chapterUnlocked<2):false};
weaponGateLabel=function(w){return ['Ready to forge','Clear chapter 1','Clear chapter 2','Clear chapter 4','Reach chapter 6 + 3 victories'][w.tier||0]};
function dashVelocity(r){if(r.dashTime<=0)return 1;const p=1-r.dashTime/.2;return 2.2+3.3*Math.sin(p*Math.PI)}
function drawCampRealm(c,t){const im=spriteImages['map_'+selectedChapter];if(im?.loaded){const sw=im.naturalWidth*.6,sh=im.naturalHeight*.6;c.drawImage(im,im.naturalWidth*.2,im.naturalHeight*.2,sw,sh,0,0,W,H)}else c.drawImage(bg,0,0);drawLantern(c,t)}
// Twelve-footfall cycle with a planted contact phase and a smooth swing phase.
bakeHeldPose=function(c,im,id,state,p,w,h){
  const cycle=p*Math.PI*2,s=Math.sin(cycle),hit=Math.sin(Math.PI*Math.min(1,p/.6)),ease=t=>t*t*(3-2*t);c.save();
  const hero=id.split('_')[1],melee=['brann','rook'].includes(hero),pivot=w*.38;
  c.translate(pivot,h*.88);
  if(state==='death'){c.rotate(p*.65);c.globalAlpha=1-p;c.scale(1-p*.2,1-p*.6)}
  else if(state==='dash'){const lean=Math.sin(Math.PI*p);c.rotate(.08+.16*lean);c.translate(6*ease(p),-lean*2)}
  else if(state==='attack'){
    const wind=p<.25?p/.25:0,strike=p>=.25&&p<.57?(p-.25)/.32:0,recover=p>=.57?(1-p)/.43:0;
    const displacement=p<.25?-3*ease(wind):p<.57?-3+12*ease(strike):9*ease(recover);
    c.translate(melee?displacement:-Math.max(0,displacement)*.3,0);c.rotate(melee?displacement*.012:-displacement*.004);
  }else if(state==='skill'){c.translate(0,-Math.sin(p*Math.PI)*5);c.rotate(-Math.sin(p*Math.PI)*.035)}
  else if(state==='hurt'){c.translate(-Math.sin(p*Math.PI)*3,0);c.scale(1.02,.98)}
  else c.translate(state==='walk'?Math.sin(cycle)*.6:0,state==='walk'?-Math.abs(Math.sin(cycle))*1.1:-Math.sin(cycle)*.4);
  c.translate(-pivot,-h*.88);
  if(state!=='walk'){c.drawImage(im,0,0,w,h);c.restore();return}
  const bootY=Math.floor(h*.82),end=w*(hero==='rook'?.94:.73),split=end*.5;
  c.save();c.beginPath();c.rect(-20,-20,w+40,h+40);c.rect(0,bootY,end,h-bootY+10);c.clip('evenodd');c.drawImage(im,0,0,w,h);c.restore();
  for(let side=0;side<2;side++){
    const q=(p+side*.5)%1,stance=q<.55,progress=stance?q/.55:(q-.55)/.45;
    const dx=stance?(1-progress*2)*1.8:(-1+2*ease(progress))*1.8,lift=stance?0:Math.sin(progress*Math.PI)*3.5;
    const x=side?split:0,bw=side?end-split:split;c.save();c.translate(x+bw*.5+dx,bootY-lift);c.rotate(stance?-.025:Math.sin(progress*Math.PI)*.085*(side?-1:1));c.drawImage(im,x,bootY,bw,h-bootY,-bw*.5,0,bw,h-bootY);c.restore();
  }c.restore();
};
animationStates.walk={frames:12,fps:14};animationStates.attack={frames:10,fps:30};animationStates.dash={frames:8,fps:40};
for(const id of Object.keys(animationSheets))if(id.startsWith('held_'))delete animationSheets[id];
getHeroPose=function(r){const a=r.anim;if(r.dashTime>0)return{state:'dash',phase:Math.min(.99,1-r.dashTime/.2)};if(a.skillLeft>0)return{state:'skill',phase:Math.min(.99,1-a.skillLeft/.72)};if(a.hurtLeft>0)return{state:'hurt',phase:Math.min(.99,1-a.hurtLeft/.18)};if(a.attackLeft>0)return{state:'attack',phase:Math.min(.99,Math.max(0,1-a.attackLeft/.34))};return a.moving?{state:'walk',phase:loopPhase(a.walkClock,14,12)}:{state:'idle',phase:loopPhase(r.time,5,4)}};
let releaseClassAttack=classAttack;
classAttack=function(r){if(r.dashTime>0||r.pendingStrike!=null)return;const e=r.enemies.filter(e=>e.hp>0&&(r.mode!=='story'||!r.story||storyLineOfSight(r,r.x,r.y,e.x,e.y,3))).sort((a,b)=>Math.hypot(a.x-r.x,a.y-r.y)-Math.hypot(b.x-r.x,b.y-r.y))[0];if(!e||Math.hypot(e.x-r.x,e.y-r.y)>r.hero.range)return;r.pendingStrike=.11;r.anim.attackLeft=.34;r.attack=r.rate+.11;r.aim=Math.atan2(e.y-(r.y-28),e.x-r.x);r.attackFacing=Math.cos(r.aim)<0?-1:1;r.heading=r.attackFacing};
const baseUpdateWorld=updateWorld;
updateWorld=function(r,dt){baseUpdateWorld(r,dt);if(r.anim.attackLeft>0&&r.attackFacing)r.heading=r.attackFacing;if(r.pendingStrike!=null){r.pendingStrike-=dt;if(r.pendingStrike<=0){r.pendingStrike=null;const left=r.anim.attackLeft;releaseClassAttack(r);r.anim.attackLeft=left}}};
const baseSetupChapter=setupChapter;
setupChapter=function(r){baseSetupChapter(r);r.wave=1;r.eliteDefeated=false;r.eliteSpawned=false;r.chapterKills=0;r.weatherSeed=r.chapter*137;r.spawn=.25;r.pendingStrike=null;r.attackFacing=0;r.mapReady=0;if(!['story','survival'].includes(r.mode))for(let i=0;i<5;i++)spawnEnemy(false);};
spawnEnemy=function(boss=false,forcedType){
  const r=run;let x,y;for(let i=0;i<10;i++){const a=Math.random()*Math.PI*2;x=Math.max(30,Math.min(MW-30,r.x+Math.cos(a)*535));y=Math.max(30,Math.min(MH-30,r.y+Math.sin(a)*370));if(Math.hypot(x-r.x,y-r.y)>275)break}
  const pool=r.wave<3?[0,1]:r.wave<5?[0,1,2,3]:[0,1,2,3,4],type=boss?99:forcedType??pool[Math.floor(Math.random()*pool.length)],scale=1+(r.chapter-1)*.42+(r.wave-1)*.10+Math.min(save.wins,10)*.06;
  const hp=(boss?1100+r.chapter*350:[36,26,52,44,130][type])*scale;
  r.enemies.push({x,y,hp,maxHp:hp,type,boss,chapter:r.chapter,name:boss?chapters[r.chapter-1].boss:chapters[r.chapter-1].family[type],speed:boss?30:[36,65,29,45,27][type]*(1+(r.chapter-1)*.065),size:boss?30:[12,9,14,11,18][type],dmg:boss?28+r.chapter*3:[11,9,14,13,24][type]+(r.chapter-1)*2,flash:0,attack:0,phase:0,shoot:boss?3:2.2,charging:0,chargeCd:3,traitCd:3,stun:0});
};
function spawnElite(r){spawnEnemy(false,4);const e=r.enemies.at(-1);e.elite=true;e.name='Elite '+chapters[r.chapter-1].family[4];e.hp*=3;e.maxHp=e.hp;e.dmg*=1.35;e.speed*=1.15;e.size=23;const first=!r.eliteSpawned;r.eliteSpawned=true;if(first)banner(e.name+' enters the hunt!')}
advanceWaves=function(r,dt){
  r.waveTime+=dt;
  if(r.wave<8&&r.waveTime>=26){r.wave++;r.waveTime=0;r.hp=Math.min(r.maxHp,r.hp+8);const gold=35*r.chapter;save.gold+=gold;r.gold+=gold;persist();
    if(r.wave===4)spawnElite(r);
    else if(r.wave===8){r.bossSpawned=true;spawnEnemy(true);banner(chapters[r.chapter-1].boss+' · Final wave')}
    else{spawnEnemy(false,r.wave>=5?4:r.wave>=3?2:1);banner('Wave '+r.wave+'/8 · Enemies grow stronger')}
  }
  r.spawn-=dt;const cap=r.wave===8?42:Math.min(110,50+r.chapter*7+r.wave*3);
  if(r.spawn<=0&&r.enemies.length<cap){const batch=r.chapter>=4?3:2;for(let i=0;i<batch&&r.enemies.length<cap;i++)spawnEnemy();r.spawn=r.wave===8?1.8:Math.max(.34,1.25-r.wave*.075-r.chapter*.065)}
};
finishChapter=function(r){
  r.chapterDone=true;if(r.chapter===chapters.length){endRun(true);return}
  save.chapterUnlocked=Math.max(save.chapterUnlocked||1,r.chapter+1);const reward=2500*r.chapter*r.chapter;save.gold+=reward;r.gold+=reward;persist();updateWallet();r.paused=true;keys.clear();pointer=null;
  showModal('Chapter '+r.chapter+' conquered',`<p>${chapters[r.chapter-1].boss} has fallen. You earned ${num(reward)} gold and unlocked ${chapters[r.chapter].name}.</p><p>Carry your levels and blessings forward. Continuing restores 35% health and refreshes your skill. The next realm is more dangerous.</p>`,[{label:'Enter '+chapters[r.chapter].name,primary:true,fn:()=>{closeModal();r.chapter++;r.hp=Math.min(r.maxHp,r.hp+r.maxHp*.35);r.skillCd=0;r.dashCd=0;setupChapter(r);r.paused=false;updateHud()}},{label:'Bank gold & return',fn:()=>{closeModal();endRun(false,true)}}],'chapter');
};
const firstBossAI=bossAI;
bossAI=function(e,r,dt,a,dis){
  if(e.chapter<=3){firstBossAI(e,r,dt,a,dis);return}
  if(!r.bossPhase2&&e.hp<=e.maxHp*.5){r.bossPhase2=true;banner(e.name+' unleashes its wrath');$('#bossbar').classList.add('enraged');e.shoot=Math.max(e.shoot,1.2)}
  if(e.charging>0){e.charging-=dt;if(e.charging<.55){e.x+=Math.cos(e.chargeAngle)*260*dt;e.y+=Math.sin(e.chargeAngle)*260*dt}}
  else{e.x+=Math.cos(a)*e.speed*dt;e.y+=Math.sin(a)*e.speed*dt}
  e.x=Math.max(30,Math.min(MW-30,e.x));e.y=Math.max(30,Math.min(MH-30,e.y));e.shoot-=dt;if(e.shoot>0)return;
  e.attackAnim=.4;e.shoot=r.bossPhase2?2.2:3.3;
  if(e.chapter===4){e.charging=1.25;e.chargeAngle=a;for(let k=-3;k<=3;k++)hostileShot(e,a+k*.18,145,20);for(let i=1;i<=4;i++)dangerZone(e.x+Math.cos(a)*i*65,e.y+Math.sin(a)*i*65,38,26)}
  if(e.chapter===5){for(let i=0;i<(r.bossPhase2?18:12);i++)hostileShot(e,i*Math.PI*2/(r.bossPhase2?18:12)+e.phase*.2,95,19);for(let i=0;i<3&&r.enemies.length<50;i++)spawnEnemy(false,3);dangerZone(r.x,r.y,75,28);if(r.bossPhase2)e.hp=Math.min(e.maxHp,e.hp+e.maxHp*.012)}
  if(e.chapter===6){for(let k=-4;k<=4;k++)hostileShot(e,a+k*.13,170,22);for(let i=0;i<10;i++)hostileShot(e,i*Math.PI/5+e.phase*.6,115,20);dangerZone(r.x,r.y,58,32);dangerZone(r.x+r.lastDx*90,r.y+r.lastDy*90,48,26);if(r.bossPhase2&&r.enemies.length<38)spawnElite(r)}
};
const earlyEnemyTrait=enemyTrait;
enemyTrait=function(e,r,dt,a,dis){earlyEnemyTrait(e,r,dt,a,dis);if(e.chapter<=3||e.boss)return;if(e.traitCd<=0&&dis<320){if(e.type===2)for(let i=-1;i<=1;i++)hostileShot(e,a+i*.2,135,14+e.chapter);if(e.type===3)dangerZone(r.x,r.y,25,14+e.chapter);if(e.elite)dangerZone(r.x,r.y,45,24);e.traitCd=e.elite?3.8:4.8}};
const chapterArt=drawChapterEnemy;
drawChapterEnemy=function(c,e,t){
  if(e.chapter<=3){chapterArt(c,e,t);return}
  const special='enemy'+e.chapter+'_'+(e.boss?99:4),id=(e.boss||e.type===4)&&spriteImages[special]?.loaded?special:'enemy'+(e.chapter===4?2:3)+'_'+e.type;
  if(!animationSheets[id]&&spriteImages[id]?.loaded)makeAnimationSheet(id);
  const state=e.dead?'death':e.flash>0?'hurt':e.attackAnim>0?'attack':'walk',p=e.dead?Math.min(.99,e.deathAge/e.deathDuration):e.flash>0?1-e.flash/.12:e.attackAnim>0?Math.min(.99,1-e.attackAnim/.4):loopPhase(e.phase||t,9,8);
  c.save();if(!(e.boss||e.type===4))c.filter=e.chapter===4?'saturate(1.3)':e.chapter===5?'hue-rotate(305deg)':'hue-rotate(95deg) saturate(1.5)';if(e.flash>0)c.filter='brightness(1.6)';paintAnimated(c,id,state,p,e.x,e.y+e.size*.6,e.boss?155:e.elite?88:75,e.boss?145:e.elite?85:e.type===1?44:59,!!run&&run.x<e.x);c.restore();
  if(e.elite&&!e.dead){c.strokeStyle='#ffc76b';c.lineWidth=2;c.beginPath();c.ellipse(e.x,e.y+8,22,7,0,0,Math.PI*2);c.stroke()}
};
const baseBuildWorld=buildWorld;
buildWorld=function(ch){
  const im=spriteImages['map_'+ch];if(!im?.loaded){baseBuildWorld(ch);return}
  worldMap=document.createElement('canvas');worldMap.width=MW;worldMap.height=MH;const c=worldMap.getContext('2d');c.imageSmoothingEnabled=false;c.drawImage(im,0,0,MW,MH);
  // A small navigational circle makes the interactive healing shrine identifiable.
  c.strokeStyle='#ffc76b44';c.lineWidth=2;c.beginPath();c.ellipse(MW/2,MH/2,61,35,0,0,Math.PI*2);c.stroke();
};
function drawAtmosphere(c,r,t){
  const cam=camera(r);c.save();c.beginPath();c.rect(cam.x,cam.y,W,H);c.clip();
  // Slow, thin ground mist, with no opaque fog over enemies or attack markers.
  if(!reducedMotion){for(let i=0;i<7;i++){const x=cam.x+((i*153+t*7)%1000)-100,y=cam.y+70+(i*97)%430,g=c.createRadialGradient(x,y,10,x,y,110);g.addColorStop(0,r.chapter===2||r.chapter===4?'#eab89709':'#bad7df0b');g.addColorStop(1,'#9cb2ca00');c.fillStyle=g;c.fillRect(x-110,y-110,220,220)}}
  c.restore();
}
const oldDrawWorld=drawWorld;
drawWorld=function(c,r,t){if(spriteImages['map_'+r.chapter]?.loaded&&r.mapReady!==r.chapter){buildWorld(r.chapter);r.mapReady=r.chapter}oldDrawWorld(c,r,t);const d=chapters[r.chapter-1];c.save();for(let i=0;i<18;i++){const cam=camera(r),x=cam.x+(i*137+Math.sin(t*.6+i)*12)%W,y=cam.y+(i*79-t*(r.chapter===3?9:5)+H*30)%H;c.globalAlpha=.18+.18*Math.sin(t+i);rect(c,x,y,2,r.chapter===3?3:2,d.accent)}c.restore()};
const priorGuide=$('#about').onclick;
$('#about').onclick=()=>{const resume=run&&!run.paused;if(resume)run.paused=true;keys.clear();pointer=null;showModal('Six realms · Field guide','<p>Move with WASD / arrows or drag. Attacks aim automatically. Shift dashes; Space uses your skill. P pauses.</p><p>Six chapters each contain eight 26-second waves. Wave 4 brings a dangerous elite; wave 8 brings the chapter boss. Enemy numbers, health and attack patterns increase through the campaign.</p><p>New levels increase base damage by 3.5% and offer a blessing. Levels grow at a steady pace throughout long expeditions. Your levels carry between chapters and reset when you return to camp.</p><p>Recruit heroes in Classes. Rook costs 150,000; Nyx 250,000; Orin 500,000; Sera 800,000; Jax 1,200,000 gold. Brann remains your starting hero. Previous unlocks are preserved.</p><p>Rare weapons cost 18,000 gold; epic 180,000; legendary 2,500,000; mythic 25,000,000. Chapter and victory requirements also apply. Boss and elite rewards grow in later realms; ordinary kills remain modest.</p><p>Explore shrine circles and treasure caches on the minimap. Shrines have limited healing fuel. Orange circles warn of incoming attacks: dash clear before they erupt. Environmental buildings are scenery; the marked map edge is the movement boundary.</p><p>Bosses: Hollow King, Cindermaw, Eclipse Matriarch, Iron Tyrant, Grave Cantor and Ashen Sovereign. Each has a different attack pattern and enrages at half health.</p>',[{label:resume?'Resume':'Back',primary:true,fn:()=>{closeModal();if(resume&&run)run.paused=false}}],'help')};$('#help').onclick=$('#about').onclick;

// Weapon-space grips and firing points, expressed in the complete armed sprite.
const weaponRigs={
 rifle:{tip:[.96,.25],pivot:[.36,.32],angle:0,rect:[.32,.16,1,.46]},stormcoil:{tip:[.97,.25],pivot:[.36,.32],angle:0,rect:[.32,.16,1,.46]},repeater:{tip:[.97,.25],pivot:[.36,.32],angle:0,rect:[.32,.16,1,.46]},cannon:{tip:[.98,.26],pivot:[.36,.33],angle:0,rect:[.32,.16,1,.47]},harbinger:{tip:[.97,.25],pivot:[.36,.32],angle:0,rect:[.32,.16,1,.46]},
 bow:{tip:[.97,.36],pivot:[.49,.40],angle:0,rect:[.43,.02,1,.79]},thorn:{tip:[.97,.36],pivot:[.49,.40],angle:0,rect:[.43,.02,1,.79]},eclipsebow:{tip:[.97,.36],pivot:[.49,.40],angle:0,rect:[.43,.02,1,.79]},phoenix:{tip:[.97,.36],pivot:[.49,.40],angle:0,rect:[.43,.02,1,.79]},storm:{tip:[.97,.38],pivot:[.50,.43],angle:0,rect:[.44,.01,1,.82]},
 wand:{tip:[.96,.28],pivot:[.53,.45],angle:-.35,rect:[.48,.23,1,.61]},frost:{tip:[.96,.23],pivot:[.51,.44],angle:-.4,rect:[.47,.17,1,.62]},archmage:{tip:[.95,.22],pivot:[.52,.45],angle:-.45,rect:[.47,.15,1,.64]},ember:{tip:[.88,.07],pivot:[.64,.40],angle:-1.1,rect:[.60,.01,1,.66]},
 codex:{tip:[.81,.37],pivot:[.66,.44],angle:0,rect:null},scepter:{tip:[.96,.28],pivot:[.53,.45],angle:-.4,rect:[.49,.22,1,.61]},bloom:{tip:[.95,.29],pivot:[.54,.45],angle:-.4,rect:[.49,.20,1,.62]},bell:{tip:[.80,.43],pivot:[.66,.36],angle:0,rect:null},seraph:{tip:[.86,.43],pivot:[.67,.35],angle:0,rect:null},halo:{tip:[.86,.08],pivot:[.67,.43],angle:-1.1,rect:[.62,.02,1,.70]}
};
for(const w of weapons)if(w.classId!=='gunner'&&weaponRigs[w.id])weaponRigs[w.id].rect=null;
weaponRigs.scepter.tip=[.94,.20];weaponRigs.bloom.tip=[.94,.22];
function armedDimensions(hero,weapon){const id='held_'+hero.id+'_'+weapon.id,im=spriteImages[id],height=hero.classId==='archer'?100:hero.classId==='keeper'?92:hero.classId==='mage'?90:86;if(!im?.loaded)return null;const f=Math.min(112/im.naturalWidth,height/im.naturalHeight);return{id,width:im.naturalWidth*f,height:im.naturalHeight*f}}
function rigAngle(r,rig){if(!rig?.rect)return 0;let a=r.heading<0?Math.PI-r.aim:r.aim;while(a>Math.PI)a-=Math.PI*2;while(a<-Math.PI)a+=Math.PI*2;return Math.max(-1.38,Math.min(1.38,a-rig.angle))}
function posePoint(r,d,u,v){
  const sheet=animationSheets[d.id],pose=getHeroPose(r),n=sheet?.states[pose.state]?.frames||10,p=Math.min(n-1,Math.floor(pose.phase*n))/n;
  let x=(u-.38)*d.width,y=(v-.88)*d.height,angle=0,tx=0,ty=0,sx=1,sy=1;const smooth=q=>q*q*(3-2*q);
  if(pose.state==='attack'){const melee=['keeper','brawler'].includes(r.hero.classId),disp=p<.25?-3*smooth(p/.25):p<.57?-3+12*smooth((p-.25)/.32):9*smooth((1-p)/.43),f=d.height/(sheet?.bodyH||128);tx=(melee?disp:-Math.max(0,disp)*.3)*f;angle=melee?disp*.012:-disp*.004}
  if(pose.state==='walk'){tx=Math.sin(p*Math.PI*2)*.6*d.height/128;ty=-Math.abs(Math.sin(p*Math.PI*2))*1.1*d.height/128}
  if(pose.state==='idle')ty=-Math.sin(p*Math.PI*2)*.4*d.height/128;
  if(pose.state==='skill'){ty=-Math.sin(p*Math.PI)*5*d.height/128;angle=-Math.sin(p*Math.PI)*.035}
  if(pose.state==='hurt'){tx=-Math.sin(p*Math.PI)*3*d.height/128;sx=1.02;sy=.98}
  const xx=x*sx*Math.cos(angle)-y*sy*Math.sin(angle),yy=x*sx*Math.sin(angle)+y*sy*Math.cos(angle);
  return{x:xx+tx+(.38-.5)*d.width,y:yy+ty+15+(.88-1)*d.height};
}
function firingPoint(r){
  const d=armedDimensions(r.hero,r.weapon),rig=weaponRigs[r.weapon.id];if(!d||!rig)return{x:r.x+(r.heading||1)*22,y:r.y-28};
  const tip=posePoint(r,d,...rig.tip),pivot=posePoint(r,d,...rig.pivot),a=rigAngle(r,rig),x=pivot.x+(tip.x-pivot.x)*Math.cos(a)-(tip.y-pivot.y)*Math.sin(a),y=pivot.y+(tip.x-pivot.x)*Math.sin(a)+(tip.y-pivot.y)*Math.cos(a);
  return{x:r.x+x*(r.heading<0?-1:1)*artAspect,y:r.y+y};
}
function paintArmedPose(c,id,pose,width,height){const sh=animationSheets[id],clip=sh?.states[pose.state];if(!clip)return;const frame=Math.min(clip.frames-1,Math.floor(pose.phase*clip.frames)),f=Math.min(width/sh.bodyW,height/sh.bodyH);c.drawImage(clip.canvas,frame*sh.width,0,sh.width,sh.height,-(sh.bodyW/2+sh.pad)*f,15-(sh.bodyH+sh.pad)*f,sh.width*f,sh.height*f)}
const unriggedHero=drawClassHero;
drawClassHero=function(c,x,y,h,t=0,scale=1,previewWeapon=null){
  const r=c===ctx&&run&&run.hero.id===h.id?run:null,w=previewWeapon||r?.weapon||weapons.find(w=>w.id===(h.id===save.hero?save.weapon:classStarters[h.classId])),d=armedDimensions(h,w);
  if(!d){unriggedHero(c,x,y,h,t,scale,previewWeapon);return}
  if(!animationSheets[d.id]){const cached=Object.keys(animationSheets).filter(id=>id.startsWith('held_'));if(cached.length>=6)delete animationSheets[cached[0]];makeAnimationSheet(d.id,true)}
  const pose=r?getHeroPose(r):{state:'idle',phase:loopPhase(t,5,4)},rig=weaponRigs[w.id],angle=r?rigAngle(r,rig):0;
  c.save();c.translate(Math.round(x),Math.round(y));c.scale(scale*(c===ctx?artAspect:1)*(r?.heading<0?-1:1),scale);c.fillStyle='#07161b77';c.beginPath();c.ellipse(0,13,14,4,0,0,Math.PI*2);c.fill();
  if(r&&rig?.rect&&Math.abs(angle)>.015&&r.dashTime<=0){
    const [u1,v1,u2,v2]=rig.rect,p1=posePoint(r,d,u1,v1),p2=posePoint(r,d,u2,v2),pivot=posePoint(r,d,...rig.pivot),left=Math.min(p1.x,p2.x),top=Math.min(p1.y,p2.y),rw=Math.abs(p2.x-p1.x),rh=Math.abs(p2.y-p1.y);
    c.save();c.beginPath();c.rect(-130,-150,260,220);c.rect(left,top,rw,rh);c.clip('evenodd');paintArmedPose(c,d.id,pose,112,d.height);c.restore();
    c.save();c.translate(pivot.x,pivot.y);c.rotate(angle);c.translate(-pivot.x,-pivot.y);c.beginPath();c.rect(left,top,rw,rh);c.clip();paintArmedPose(c,d.id,pose,112,d.height);c.restore();
  }else paintArmedPose(c,d.id,pose,112,d.height);
  c.restore();
};
// Sample where the hero actually travelled, preserving the pose and facing at each point.
tickSpriteAnimation=function(r,dt){
  for(const k of ['attackLeft','skillLeft','hurtLeft'])r.anim[k]=Math.max(0,r.anim[k]-dt);
  r.ghosts.forEach(g=>g.life-=dt);r.ghosts=r.ghosts.filter(g=>g.life>0);
  r.corpses.forEach(e=>e.deathAge+=dt);r.corpses=r.corpses.filter(e=>e.deathAge<e.deathDuration);
  for(const e of r.enemies)e.attackAnim=Math.max(0,(e.attackAnim||0)-dt);
};
const beforeRigWorld=updateWorld;
updateWorld=function(r,dt){
  beforeRigWorld(r,dt);
  if(r.dashTime>0){const last=r.ghosts.at(-1),d=armedDimensions(r.hero,r.weapon);if(d&&(!last||Math.hypot(last.x-r.x,last.y-r.y)>7)){r.ghosts.push({x:r.x,y:r.y,heading:r.heading,id:d.id,height:d.height,phase:Math.min(.99,1-r.dashTime/.2),life:.22,maxLife:.22});if(r.ghosts.length>14)r.ghosts.shift()}}
};
drawDashTrails=function(c,r){
  const ghosts=r.ghosts.filter(g=>g.id&&g.life>0);if(!ghosts.length)return;
  for(let i=0;i<ghosts.length;i++){const g=ghosts[i],alpha=g.life/g.maxLife;c.save();c.globalAlpha=alpha*(reducedMotion?.10:.25);c.translate(g.x,g.y);c.scale(artAspect*(g.heading<0?-1:1),1);paintArmedPose(c,g.id,{state:'dash',phase:g.phase},112,g.height);c.restore();if(i>0){const prev=ghosts[i-1];c.save();c.globalAlpha=alpha*.12;c.strokeStyle=r.hero.color;c.lineWidth=3+alpha*3;c.beginPath();c.moveTo(prev.x,prev.y+9);c.lineTo(g.x,g.y+9);c.stroke();c.restore()}}
};
// Every normal projectile is emitted from the same transformed point used to draw its weapon.
releaseClassAttack=function(r){
  if(r.dashTime>0){r.pendingStrike=.02;return}
  const targets=r.enemies.filter(e=>e.hp>0&&(r.mode!=='story'||!r.story||storyLineOfSight(r,r.x,r.y,e.x,e.y,3))).sort((a,b)=>Math.hypot(a.x-r.x,a.y-r.y)-Math.hypot(b.x-r.x,b.y-r.y));if(!targets.length)return;const target=targets[0];if(Math.hypot(target.x-r.x,target.y-r.y)>r.hero.range)return;
  r.heading=r.attackFacing||r.heading;
  for(let i=0;i<2;i++){const origin=firingPoint(r);r.aim=Math.atan2(target.y-origin.y,target.x-origin.x)}const origin=firingPoint(r),melee=['keeper','brawler'].includes(r.hero.classId);
  if(melee){for(const e of targets)if(Math.hypot(e.x-r.x,e.y-r.y)<r.hero.range+e.size){hit(e,r.dmg*(1+r.multi*.15));const a=Math.atan2(e.y-r.y,e.x-r.x);displaceEnemy(run,e,Math.cos(a)*16,Math.sin(a)*16)}}
  else for(let i=0;i<=r.multi;i++)shoot(origin.x,origin.y,r.aim+(i-r.multi/2)*.10,r.dmg,r.hero.classId==='gunner'?580:340,r.pierce);
  r.muzzle={...origin,angle:r.aim,life:.10,color:r.weapon.color};r.attack=r.rate;sound(r.hero.classId==='gunner'?100:440,.025,'triangle',.014);
};
const beforeMuzzleTick=tickSpriteAnimation;
tickSpriteAnimation=function(r,dt){beforeMuzzleTick(r,dt);if(r.muzzle)r.muzzle.life-=dt};
const previousActionVfx=drawHeroAction;
drawHeroAction=function(c,r){previousActionVfx(c,r);if(!r.muzzle||r.muzzle.life<=0||['keeper','brawler'].includes(r.hero.classId))return;const p=firingPoint(r),alpha=r.muzzle.life/.1;c.save();c.translate(p.x,p.y);c.rotate(r.muzzle.angle);c.globalAlpha=alpha;c.fillStyle=r.hero.classId==='gunner'?'#fff0b3':r.weapon.color;c.beginPath();c.moveTo(0,0);c.lineTo(11+alpha*6,-4*alpha);c.lineTo(7,0);c.lineTo(11+alpha*6,4*alpha);c.closePath();c.fill();c.restore()};
const nonProjectileSkill=skill;
skill=function(){if(!run||run.paused||run.skillCd>0)return;const r=run;if(!['gunner','archer'].includes(r.hero.classId)){nonProjectileSkill();return}
 const factor=1+save.up.power*.035;r.skillCd=r.hero.cd;r.anim.skillLeft=.72;const origin=firingPoint(r),gun=r.hero.classId==='gunner',count=gun?13:18;
 for(let i=0;i<count;i++)shoot(origin.x,origin.y,r.aim+(i-(count-1)/2)*(gun?.07:.085),(gun?55:50)*factor,gun?580:380,true);
 r.muzzle={...origin,angle:r.aim,life:.1,color:r.weapon.color};r.effects.push({x:origin.x,y:origin.y,t:.35,max:.35,r:55,color:r.hero.color});sound(320,.15,'triangle');updateHud();
};$('#skill').onclick=skill;


const providedActions={"codex":{"frames":8,"width":224,"height":240,"anchor":[90,200],"release":4,"attackDuration":0.56,"skillDuration":0.96,"points":[{"footX":190.5,"footY":553,"muzzle":null},{"footX":181.5,"footY":553,"muzzle":null},{"footX":180,"footY":553,"muzzle":null},{"footX":190.5,"footY":553,"muzzle":null},{"footX":174.5,"footY":462,"muzzle":[19.8,-67.2]},{"footX":184,"footY":462,"muzzle":null},{"footX":181,"footY":462,"muzzle":null},{"footX":188,"footY":462,"muzzle":null}]},"archmage":{"frames":7,"width":224,"height":240,"anchor":[90,200],"release":4,"attackDuration":0.56,"skillDuration":0.96,"points":[{"footX":182.5,"footY":624,"muzzle":null},{"footX":185.5,"footY":625,"muzzle":null},{"footX":179.5,"footY":624,"muzzle":null},{"footX":197,"footY":625,"muzzle":null},{"footX":175,"footY":415,"muzzle":[35.4,-69.4]},{"footX":230,"footY":419,"muzzle":null},{"footX":195.5,"footY":419,"muzzle":null}]},"crook_attack":{"frames":8,"width":224,"height":240,"anchor":[90,200],"release":4,"attackDuration":0.56,"skillDuration":0.96,"points":[{"footX":158.5,"footY":601,"muzzle":null},{"footX":165.5,"footY":601,"muzzle":null},{"footX":150.5,"footY":601,"muzzle":null},{"footX":152.5,"footY":601,"muzzle":null},{"footX":174.5,"footY":437,"muzzle":null},{"footX":187.5,"footY":437,"muzzle":null},{"footX":189.5,"footY":437,"muzzle":null},{"footX":167,"footY":437,"muzzle":null}]},"crook_skill":{"frames":8,"width":224,"height":240,"anchor":[90,200],"release":4,"attackDuration":0.56,"skillDuration":0.96,"points":[{"footX":187,"footY":605,"muzzle":null},{"footX":191.5,"footY":605,"muzzle":null},{"footX":161.5,"footY":605,"muzzle":null},{"footX":191.5,"footY":605,"muzzle":null},{"footX":172.5,"footY":430,"muzzle":null},{"footX":208.5,"footY":431,"muzzle":null},{"footX":151,"footY":434,"muzzle":null},{"footX":187,"footY":433,"muzzle":null}]},"soulfire":{"frames":8,"width":224,"height":240,"anchor":[90,200],"release":4,"attackDuration":0.56,"skillDuration":0.96,"points":[{"footX":162,"footY":526,"muzzle":null},{"footX":94,"footY":526,"muzzle":null},{"footX":101.5,"footY":526,"muzzle":null},{"footX":103.5,"footY":524,"muzzle":null},{"footX":144.5,"footY":360,"muzzle":null},{"footX":204,"footY":360,"muzzle":null},{"footX":207,"footY":368,"muzzle":null},{"footX":168.5,"footY":367,"muzzle":null}]},"iron":{"frames":8,"width":224,"height":240,"anchor":[90,200],"release":4,"attackDuration":0.56,"skillDuration":0.96,"points":[{"footX":179.5,"footY":536,"muzzle":null},{"footX":162.5,"footY":536,"muzzle":null},{"footX":151,"footY":537,"muzzle":null},{"footX":99.5,"footY":542,"muzzle":null},{"footX":169,"footY":421,"muzzle":null},{"footX":164.5,"footY":425,"muzzle":null},{"footX":182.5,"footY":427,"muzzle":null},{"footX":153,"footY":426,"muzzle":null}]},"silver":{"frames":8,"width":224,"height":240,"anchor":[90,200],"release":4,"attackDuration":0.56,"skillDuration":0.96,"points":[{"footX":140.5,"footY":514,"muzzle":null},{"footX":188.5,"footY":516,"muzzle":null},{"footX":155,"footY":516,"muzzle":null},{"footX":165.5,"footY":515,"muzzle":null},{"footX":139.5,"footY":382,"muzzle":null},{"footX":179.5,"footY":383,"muzzle":null},{"footX":179.5,"footY":384,"muzzle":null},{"footX":147,"footY":384,"muzzle":null}]},"rifle":{"frames":8,"width":224,"height":240,"anchor":[90,200],"release":4,"attackDuration":0.38,"skillDuration":0.96,"points":[{"footX":170,"footY":533,"muzzle":null},{"footX":179.5,"footY":533,"muzzle":null},{"footX":166.5,"footY":533,"muzzle":null},{"footX":164.5,"footY":533,"muzzle":null},{"footX":171.5,"footY":482,"muzzle":[33.2,-64.9]},{"footX":191,"footY":481,"muzzle":null},{"footX":153.5,"footY":482,"muzzle":null},{"footX":174,"footY":482,"muzzle":null}]},"stormcoil":{"frames":8,"width":224,"height":240,"anchor":[90,200],"release":3,"attackDuration":0.38,"skillDuration":0.96,"points":[{"footX":146,"footY":528,"muzzle":null},{"footX":123.5,"footY":528,"muzzle":null},{"footX":124.5,"footY":528,"muzzle":null},{"footX":121.5,"footY":528,"muzzle":[26.9,-52.7]},{"footX":162.5,"footY":396,"muzzle":null},{"footX":142,"footY":396,"muzzle":null},{"footX":130.5,"footY":396,"muzzle":null},{"footX":149.5,"footY":396,"muzzle":null}]},"eclipsebow":{"frames":8,"width":224,"height":240,"anchor":[90,200],"release":4,"attackDuration":0.56,"skillDuration":0.96,"points":[{"footX":167.5,"footY":531,"muzzle":null},{"footX":172,"footY":531,"muzzle":null},{"footX":166.5,"footY":531,"muzzle":null},{"footX":167,"footY":532,"muzzle":null},{"footX":174.5,"footY":461,"muzzle":[36.6,-56]},{"footX":172.5,"footY":461,"muzzle":null},{"footX":177.5,"footY":461,"muzzle":null},{"footX":179.5,"footY":461,"muzzle":null}]},"weaponv2_thorn":{"frames":8,"width":256,"height":240,"anchor":[96,208],"release":4,"attackDuration":0.6,"skillDuration":1,"points":[{"footX":204.5,"footY":375,"muzzle":[40.45104602510462,-66.16267782426779],"cropRight":196.01255230125523},{"footX":205,"footY":375,"muzzle":[40.2794979079498,-66.16267782426779],"cropRight":195.84100418410043},{"footX":199.5,"footY":375,"muzzle":[41.94351464435147,-66.16267782426779],"cropRight":197.3849372384937},{"footX":198,"footY":375,"muzzle":[42.68117154811717,-66.16267782426779],"cropRight":198.2426778242678},{"footX":186.5,"footY":363,"muzzle":[46.62677824267784,-61.88769874476987],"cropRight":202.18828451882845},{"footX":201.5,"footY":363,"muzzle":[41.48033472803348,-61.88769874476987],"cropRight":197.0418410041841},{"footX":202,"footY":363,"muzzle":[41.08577405857741,-61.88769874476987],"cropRight":196.52719665271968},{"footX":204,"footY":363,"muzzle":[40.62259414225942,-61.88769874476987],"cropRight":196.18410041841003}]},"weaponv2_eclipselantern":{"frames":8,"width":256,"height":240,"anchor":[96,208],"release":4,"attackDuration":0.64,"skillDuration":1,"points":[{"footX":171.5,"footY":455,"muzzle":[38.58278260869566,-77.12278260869564],"cropRight":193.1521739130435},{"footX":164,"footY":455,"muzzle":[41.03208695652173,-77.12278260869564],"cropRight":195.4695652173913},{"footX":160,"footY":455,"muzzle":[42.68278260869566,-77.12278260869564],"cropRight":197.25217391304346},{"footX":164.5,"footY":455,"muzzle":[40.85382608695651,-77.12278260869564],"cropRight":195.2913043478261},{"footX":141.5,"footY":378,"muzzle":[49.278434782608706,-55.41773913043478],"cropRight":203.8478260869565},{"footX":151,"footY":378,"muzzle":[45.66686956521738,-55.41773913043478],"cropRight":200.10434782608695},{"footX":172,"footY":378,"muzzle":[38.404521739130445,-55.41773913043478],"cropRight":192.97391304347826},{"footX":173.5,"footY":378,"muzzle":[37.6451304347826,-55.41773913043478],"cropRight":192.08260869565217}]},"weaponv2_moonlit":{"frames":8,"width":256,"height":240,"anchor":[96,208],"release":4,"attackDuration":0.6,"skillDuration":1,"points":[{"footX":186.5,"footY":453,"muzzle":[54.35746606334842,-83.66968325791855],"cropRight":191.54298642533936},{"footX":209.5,"footY":452,"muzzle":[45.54524886877828,-83.29864253393666],"cropRight":182.63800904977376},{"footX":222,"footY":453,"muzzle":[41.18552036199095,-83.66968325791855],"cropRight":178.3710407239819},{"footX":213,"footY":453,"muzzle":[44.24660633484163,-83.66968325791855],"cropRight":181.33936651583713},{"footX":147.5,"footY":384,"muzzle":[68.82805429864254,-62.33484162895928],"cropRight":206.01357466063348},{"footX":170,"footY":384,"muzzle":[60.20135746606335,-62.33484162895928],"cropRight":197.29411764705884},{"footX":245,"footY":384,"muzzle":[32.65158371040724,-62.33484162895928],"cropRight":169.83710407239818},{"footX":215.5,"footY":384,"muzzle":[43.31900452488688,-62.33484162895928],"cropRight":180.41176470588238}]},"weaponv2_void":{"frames":8,"width":256,"height":240,"anchor":[96,208],"release":4,"attackDuration":0.5,"skillDuration":1,"points":[{"footX":206,"footY":462,"muzzle":null,"cropRight":181.97356828193833},{"footX":200.5,"footY":462,"muzzle":null,"cropRight":183.59911894273125},{"footX":201.5,"footY":462,"muzzle":null,"cropRight":183.59911894273125},{"footX":163,"footY":462,"muzzle":null,"cropRight":197.14537444933922},{"footX":160,"footY":377,"muzzle":null,"cropRight":198.59030837004406},{"footX":219,"footY":377,"muzzle":null,"cropRight":176.91629955947135},{"footX":193.5,"footY":377,"muzzle":null,"cropRight":186.48898678414096},{"footX":190,"footY":377,"muzzle":null,"cropRight":187.3920704845815}]},"weaponv2_cannon":{"frames":8,"width":256,"height":240,"anchor":[96,208],"release":4,"attackDuration":0.62,"skillDuration":1,"points":[{"footX":153,"footY":418,"muzzle":[36.63642857142856,-70.31133928571428],"cropRight":202.52678571428572},{"footX":151.5,"footY":418,"muzzle":[36.97687499999999,-70.31133928571428],"cropRight":202.70982142857142},{"footX":151,"footY":419,"muzzle":[37.36857142857142,-70.67741071428571],"cropRight":203.25892857142856},{"footX":144,"footY":418,"muzzle":[39.72241071428571,-70.31133928571428],"cropRight":205.45535714285714},{"footX":134,"footY":396,"muzzle":[43.591785714285706,-62.07107142857143],"cropRight":209.48214285714283},{"footX":197.5,"footY":397,"muzzle":[20.13758928571428,-62.43714285714285],"cropRight":185.87053571428572},{"footX":192,"footY":396,"muzzle":[22.35964285714285,-62.07107142857143],"cropRight":188.25},{"footX":191,"footY":396,"muzzle":[22.517053571428566,-62.07107142857143],"cropRight":188.25}]},"weaponv2_harbinger":{"frames":8,"width":256,"height":240,"anchor":[96,208],"release":4,"attackDuration":0.64,"skillDuration":1,"points":[{"footX":176,"footY":430,"muzzle":[53.797990867579905,-76.40977168949772],"cropRight":196.34703196347033},{"footX":175,"footY":430,"muzzle":[53.9028310502283,-76.40977168949772],"cropRight":196.34703196347033},{"footX":178.5,"footY":430,"muzzle":[52.861917808219175,-76.40977168949772],"cropRight":195.41095890410958},{"footX":146.5,"footY":430,"muzzle":[64.57406392694062,-76.40977168949772],"cropRight":207.01826484018264},{"footX":168.5,"footY":405,"muzzle":[56.6062100456621,-66.85808219178082],"cropRight":199.15525114155253},{"footX":225.5,"footY":405,"muzzle":[34.99415525114154,-66.85808219178082],"cropRight":177.43835616438355},{"footX":183.5,"footY":405,"muzzle":[50.989771689497715,-66.85808219178082],"cropRight":193.53881278538813},{"footX":169,"footY":406,"muzzle":[56.149406392694054,-67.23251141552511],"cropRight":198.59360730593608}]},"weaponv2_repeater":{"frames":8,"width":256,"height":240,"anchor":[96,208],"release":4,"attackDuration":0.34,"skillDuration":1,"points":[{"footX":141,"footY":439,"muzzle":[39.54392523364486,-79.94616822429906],"cropRight":212.10280373831773},{"footX":143.5,"footY":440,"muzzle":[38.37523364485981,-80.32934579439251],"cropRight":210.76168224299064},{"footX":142,"footY":440,"muzzle":[39.160747663551405,-80.32934579439251],"cropRight":211.7196261682243},{"footX":142,"footY":439,"muzzle":[38.95,-79.94616822429906],"cropRight":211.33644859813086},{"footX":138.5,"footY":404,"muzzle":[40.50186915887851,-66.33570093457944],"cropRight":213.0607476635514},{"footX":193,"footY":404,"muzzle":[19.407943925233646,-66.33570093457944],"cropRight":191.79439252336448},{"footX":172.5,"footY":404,"muzzle":[27.47383177570094,-66.33570093457944],"cropRight":200.03271028037383},{"footX":175.5,"footY":404,"muzzle":[26.11355140186916,-66.33570093457944],"cropRight":198.5}]},"weaponv2_bow":{"frames":8,"width":256,"height":240,"anchor":[96,208],"release":4,"attackDuration":0.56,"skillDuration":1,"points":[{"footX":213,"footY":371,"muzzle":[32.98144680851063,-67.27489361702128],"cropRight":194.74893617021277},{"footX":208,"footY":371,"muzzle":[34.72612765957446,-67.27489361702128],"cropRight":196.49361702127658},{"footX":214,"footY":371,"muzzle":[32.41617021276595,-67.27489361702128],"cropRight":194.05106382978724},{"footX":203.5,"footY":371,"muzzle":[36.29634042553191,-67.27489361702128],"cropRight":198.06382978723406},{"footX":162,"footY":363,"muzzle":[50.7771914893617,-64.3263829787234],"cropRight":212.54468085106384},{"footX":203.5,"footY":363,"muzzle":[36.29634042553191,-64.3263829787234],"cropRight":198.06382978723406},{"footX":213,"footY":363,"muzzle":[32.765106382978715,-64.3263829787234],"cropRight":194.4},{"footX":245.5,"footY":367,"muzzle":[21.641021276595737,-65.72212765957447],"cropRight":183.40851063829786}]},"weaponv2_phoenix":{"frames":8,"width":256,"height":240,"anchor":[96,208],"release":4,"attackDuration":0.62,"skillDuration":1,"points":[{"footX":188.5,"footY":428,"muzzle":[39.74547008547009,-69.25846153846153],"cropRight":185.53418803418805},{"footX":181.5,"footY":428,"muzzle":[41.96017094017094,-69.25846153846153],"cropRight":187.63675213675214},{"footX":172.5,"footY":428,"muzzle":[45.3523076923077,-69.25846153846153],"cropRight":191.14102564102564},{"footX":162,"footY":428,"muzzle":[48.793504273504276,-69.25846153846153],"cropRight":194.47008547008545},{"footX":155.5,"footY":420,"muzzle":[51.30957264957265,-66.27282051282052],"cropRight":197.0982905982906},{"footX":168,"footY":420,"muzzle":[46.69094017094017,-66.27282051282052],"cropRight":192.36752136752136},{"footX":204,"footY":420,"muzzle":[34.31384615384616,-66.27282051282052],"cropRight":180.1025641025641},{"footX":199,"footY":420,"muzzle":[35.82769230769231,-66.27282051282052],"cropRight":181.5042735042735}]}};
// Exact pose sequences supplied by the user, registered at a shared ground anchor.
const actionBindings={codex:{attack:'codex',skill:'codex'},archmage:{attack:'archmage',skill:'archmage'},crook:{attack:'crook_attack',skill:'crook_skill'},dawnseeker:{skill:'crook_skill'},soulfire:{attack:'soulfire',skill:'soulfire'},iron:{attack:'iron',skill:'iron'},silver:{attack:'silver',skill:'silver'},rifle:{attack:'rifle',skill:'rifle'},stormcoil:{attack:'stormcoil',skill:'stormcoil'},eclipsebow:{attack:'eclipsebow',skill:'eclipsebow'}};
for(const id of ['thorn','eclipselantern','moonlit','void','cannon','harbinger','repeater','bow','phoenix'])actionBindings[id]={attack:'weaponv2_'+id,skill:'weaponv2_'+id};
function currentAction(r){const a=r?.action,d=a&&providedActions[a.id],im=a&&spriteImages['action_'+a.id];return a&&d&&im?.loaded&&a.elapsed<a.duration?{...a,data:d,image:im,frame:Math.min(d.frames-1,Math.floor(a.elapsed/a.duration*d.frames))}:null}
const proceduralHero=drawClassHero;
// Taper wide energy flares as they leave their source cell. The original
// artwork remains intact; this is a bounded cache of rendered animation frames.
const softActionImages=new Map();
function renderedActionImage(a){
 if(!a.id.startsWith('weaponv2_'))return a.image;
 if(softActionImages.has(a.id))return softActionImages.get(a.id);
 const d=a.data,im=document.createElement('canvas');im.width=d.width*d.frames;im.height=d.height;const g=im.getContext('2d');g.imageSmoothingEnabled=false;g.drawImage(a.image,0,0);g.globalCompositeOperation='destination-out';
 for(let i=0;i<d.frames;i++){const edge=d.points[i].cropRight;if(!Number.isFinite(edge))continue;const x=i*d.width+edge,fade=g.createLinearGradient(x-8,0,x+1,0);fade.addColorStop(0,'rgba(0,0,0,0)');fade.addColorStop(1,'rgba(0,0,0,1)');g.fillStyle=fade;g.fillRect(x-8,0,10,d.height)}
 g.globalCompositeOperation='source-over';softActionImages.set(a.id,im);while(softActionImages.size>3)softActionImages.delete(softActionImages.keys().next().value);return im;
}
drawClassHero=function(c,x,y,h,t=0,scale=1,previewWeapon=null){const r=c===ctx&&run&&run.hero.id===h.id?run:null,a=currentAction(r);if(!a||r.dashTime>0||r.anim.hurtLeft>0){proceduralHero(c,x,y,h,t,scale,previewWeapon);return}
 c.save();c.translate(Math.round(x),Math.round(y));c.scale(scale*(c===ctx?artAspect:1)*(r.heading<0?-1:1),scale);c.fillStyle='#07161b77';c.beginPath();c.ellipse(0,13,14,4,0,0,Math.PI*2);c.fill();const d=a.data;c.imageSmoothingEnabled=false;c.drawImage(renderedActionImage(a),a.frame*d.width,0,d.width,d.height,-d.anchor[0],15-d.anchor[1],d.width,d.height);c.restore();
};
const rigidFiringPoint=firingPoint;
firingPoint=function(r){const a=currentAction(r);if(a){const p=a.data.points[a.frame]?.muzzle||a.data.points[a.data.release]?.muzzle;if(p)return{x:r.x+p[0]*(r.heading<0?-1:1)*artAspect,y:r.y+15+p[1]}}return rigidFiringPoint(r)};
const queueProceduralAttack=classAttack;
classAttack=function(r){if(r.skillPending||r.anim.skillLeft>0||currentAction(r)?.kind==='attack')return;const before=r.pendingStrike;queueProceduralAttack(r);const id=actionBindings[r.weapon.id]?.attack,d=id&&providedActions[id];if(before==null&&r.pendingStrike!=null&&d&&spriteImages['action_'+id]?.loaded){const duration=Math.max(.14,Math.min(d.attackDuration,r.rate*1.6));r.action={id,kind:'attack',elapsed:0,duration};r.anim.attackLeft=duration;r.pendingStrike=duration*d.release/d.frames;r.attack=r.rate+r.pendingStrike}};
const performAnimatedSkill=skill;
skill=function(){if(!run||run.paused||run.skillCd>0||run.skillPending)return;const r=run,id=actionBindings[r.weapon.id]?.skill,d=id&&providedActions[id];if(!d||!spriteImages['action_'+id]?.loaded){performAnimatedSkill();return}
 r.pendingStrike=null;r.dashTime=0;r.action={id,kind:'skill',elapsed:0,duration:d.skillDuration};r.anim.attackLeft=0;r.anim.skillLeft=d.skillDuration;r.skillCd=r.hero.cd;r.attack=Math.max(r.attack,d.skillDuration);r.skillPending={release:d.skillDuration*d.release/d.frames};sound(250,.1,'triangle');updateHud();
};$('#skill').onclick=skill;
const poseTimers=tickSpriteAnimation;
tickSpriteAnimation=function(r,dt){poseTimers(r,dt);if(r.action){r.action.elapsed+=dt;if(r.action.elapsed>=r.action.duration)r.action=null}if(r.skillPending){r.skillPending.release-=dt;if(r.skillPending.release<=0){r.skillPending=null;const cd=r.skillCd,left=r.anim.skillLeft;r.skillCd=0;performAnimatedSkill();r.skillCd=cd;r.anim.skillLeft=left}}};
const proceduralActionEffects=drawHeroAction;
drawHeroAction=function(c,r){if(currentAction(r))return;proceduralActionEffects(c,r)};
const dashBeforeActionSheets=dash;
dash=function(){dashBeforeActionSheets();if(run&&run.dashTime>0){run.pendingStrike=null;if(run.action?.kind==='attack'){run.action=null;run.anim.attackLeft=0}}};$('#dash').onclick=dash;
const setupBeforeActionSheets=setupChapter;
setupChapter=function(r){setupBeforeActionSheets(r);r.action=null;r.skillPending=null};

// Progress follows the entire expedition, including chapter and Endless boundaries.
// Creature counts/speeds are bounded for readability; vitality and damage keep rising.
function difficultyProfile(r){
 if(r.mode==='survival'){const phase=directorPhase(r.time),config=DIRECTOR_CONFIG.survival;return{wave:r.wave,chapter:r.chapter,vitality:config.baseVitality+phase*config.vitalityPerPhase,damage:config.baseDamage+phase*config.damagePerPhase,speed:config.baseSpeed+phase*config.speedPerPhase,cap:DIRECTOR_CONFIG.survival.cap,batch:4,interval:DIRECTOR_CONFIG.survival.interval,duration:15,storyCount:5,escorts:3,bossCap:20,bossInterval:8,bossBatch:1,storyReinforce:12,bossTempo:.94}}
 const g=Math.max(0,Math.min(1e7,globalWave(r)-1)),chapter=Math.floor(g/100);
 return {
  wave:g+1,chapter:chapter+1,
  vitality:1.2*(1+g*.025+g*g*.0001)*(1+chapter*.10),
  damage:1.12*(1+g*.0045+g*g*.0000015)*(1+chapter*.06),
  speed:1.04+.46*(1-Math.exp(-g/240)),
  cap:Math.min(150,62+Math.floor(g*.28)),
  batch:Math.min(5,2+Math.floor(g/120)),
  interval:Math.max(.27,1/(1+g*.005+chapter*.08)),
  duration:Math.max(16,24-g*.014),
  storyCount:Math.min(32,5+Math.floor(g/18)),
  escorts:Math.min(8,2+Math.floor(g/100)),
  bossCap:Math.min(40,12+Math.floor(g/18)),
  bossInterval:Math.max(.95,2.4/(1+g*.002)),
  bossBatch:Math.min(3,1+Math.floor(g/200)),
  storyReinforce:Math.max(6,12/(1+g*.0015)),
  bossTempo:(.94-.20*(1-Math.exp(-g/250)))*(1-.10*(1-Math.exp(-Math.floor(g/20)/8)))
 };
}
function difficultyEnemyType(r){
 if(r.mode==='survival'){const pool=DIRECTOR_CONFIG.phases[directorPhase(r.time)].pool;return pool[Math.floor(directorRandom(ensureDirector(r))*pool.length)]}
 const g=globalWave(r)-1,pool=g<3?[0,1]:g<9?[0,1,2]:g<39?[0,0,1,1,2,3,4]:g<139?[0,1,1,2,2,3,4]:[0,1,2,2,3,3,4,4];
 return pool[Math.floor(directorRandom(ensureDirector(r),'composition')*pool.length)];
}
function promoteWaveElite(e,r){
 if(!e||e.boss||e.elite||e.archetype)return;e.elite=true;e.name='Elite '+chapters[r.chapter-1].family[e.type];
 e.hp*=2.6;e.maxHp=e.hp;e.dmg*=1.35;e.speed*=1.1;e.size=23;
}

// Archetype-specific rigs use the existing enemy art and bake poses once.
const legacyBakePose=bakePose;
bakePose=function(c,im,id,state,p,w,h){
 if(!id.startsWith('enemy')&&!['wisp','bat','king'].includes(id)){legacyBakePose(c,im,id,state,p,w,h);return}
 const flying=id==='bat'||id.endsWith('_1')||id==='enemy3_99',spirit=id==='wisp'||id.endsWith('_3'),boss=id==='king'||id.endsWith('_99'),caster=id.endsWith('_2'),brute=id.endsWith('_4');
 const cycle=Math.sin(p*Math.PI*2),swing=Math.sin(Math.PI*p),walk=state==='walk',wind=state==='skill',attack=state==='attack';c.save();
 c.translate(w*.5,h*.88);
 if(state==='death'){c.globalAlpha=Math.max(0,1-p);c.rotate((flying?.9:.45)*p);c.scale(1-p*.25,Math.max(.1,1-p*.7))}
 else if(state==='hurt'){c.translate(-swing*4,0);c.rotate(-swing*.08)}
 else if(state==='dash'){c.rotate(.2);c.translate(8*swing,-2)}
 else if(wind){c.translate(-swing*3,swing*3);c.rotate(-swing*.06)}
 else if(attack){const thrust=p<.35?-p/.35:Math.sin((p-.35)/.65*Math.PI);c.translate(thrust*(boss?11:7),-Math.max(0,thrust)*2);c.rotate(thrust*.09)}
 else c.translate(walk?cycle*.7:0,flying?-cycle*3:spirit?-cycle*2:walk?-Math.abs(cycle)*1.7:cycle*.4);
 c.translate(-w*.5,-h*.88);
 if(flying){
  const flap=walk||state==='idle'?cycle:wind?-.8:attack?swing:cycle*.3,L=w*.4,R=w*.6,Y=h*.35;
  for(const side of [0,1]){const x=side?R:0,bw=side?w-R:L,pivot=side?R:L;c.save();c.translate(pivot,Y);c.rotate((side?-1:1)*flap*.5);c.scale(1,.8+.2*Math.cos(p*Math.PI*2));c.drawImage(im,x,0,bw,h,side?0:-bw,-Y,bw,h);c.restore()}
  c.drawImage(im,L,0,R-L,h,L,0,R-L,h);
 }else if(spirit){
  for(let y=0;y<h;y+=3){const tail=Math.max(0,(y/h-.3)/.7),shift=Math.sin(p*Math.PI*2-y/h*5)*tail*(attack?11:7);c.drawImage(im,0,y,w,Math.min(3,h-y),shift,y,w,Math.min(3,h-y))}
 }else{
  const legY=Math.round(h*(boss?.78:.74)),mid=w*.5;
  if(walk){c.drawImage(im,0,0,w,legY+2,0,0,w,legY+2);for(let side=0;side<2;side++){const x=side?mid:0,bw=side?w-mid:mid,q=(p+side*.5)%1,step=Math.sin(q*Math.PI*2),lift=Math.max(0,step)*(brute?2:4);c.save();c.translate(x+bw*.5,legY-lift);c.rotate(step*(brute?.07:.13));c.drawImage(im,x,legY,bw,h-legY,-bw*.5,0,bw,h-legY);c.restore()}}
  else if((wind||attack)&&(caster||boss||brute)){
   const ax=w*.68,ay=h*.32,aw=w-ax,ah=h*.37;c.save();c.beginPath();c.rect(-30,-30,w+60,h+60);c.rect(ax,ay,aw,ah);c.clip('evenodd');c.drawImage(im,0,0,w,h);c.restore();c.save();c.translate(ax,ay);c.rotate((wind?-.25:.35)*swing);c.drawImage(im,ax,ay,aw,ah,0,0,aw,ah);c.restore();
  }else c.drawImage(im,0,0,w,h);
 }
 c.restore();
};
for(const id of Object.keys(animationSheets))if(id.startsWith('enemy')||['wisp','bat','king'].includes(id)){delete animationSheets[id];makeAnimationSheet(id)}
function enemyArtId(e){
 if(e.archetype===EATER_CONFIG.archetype)return'wisp';
 if(e.boss&&e.bossTier&&e.bossTier<5){const type=[4,1,2,3][e.bossTier-1],id='enemy'+e.chapter+'_'+type;if(spriteImages[id]?.loaded)return id;if(e.chapter===1)return['king','wisp','king','king'][e.bossTier-1];return'enemy'+(e.chapter===4?2:3)+'_'+type}
 if(e.chapter===1)return e.boss?'king':e.type===1?'bat':'wisp';const exact='enemy'+e.chapter+'_'+(e.boss?99:e.type);if(spriteImages[exact]?.loaded)return exact;return'enemy'+(e.chapter===4?2:3)+'_'+(e.boss?99:e.type);
}
function drawEnemyMotion(c,e,t){
 const id=enemyArtId(e);if(!spriteImages[id]?.loaded)return false;if(!animationSheets[id])makeAnimationSheet(id);
 let state='walk',p=loopPhase((e.phase||0)+(e.x%17)*.03,e.type===1?15:e.type===4?8:11,12);
 if(e.eater&&eaterCasting(e)){state='skill';p=e.eater.state==='windup'?1-e.eater.left/EATER_CONFIG.windup:1-e.eater.left/EATER_CONFIG.channel}
 if(e.dead){state='death';p=Math.min(.99,e.deathAge/e.deathDuration)}else if(e.flash>0){state='hurt';p=Math.min(.99,1-e.flash/.12)}else if(e.warden&&e.warden.state!=='approach'){const s=e.warden;state=s.state==='windup'?'skill':s.state==='stunned'?'hurt':'idle';p=s.state==='windup'?1-s.left/WARDEN_CONFIG.windup:0}else if(e.mimic&&e.mimic.state!=='approach'){const s=e.mimic;state=s.state==='stunned'?'hurt':['split','aim'].includes(s.state)?'skill':'idle';p=s.state==='split'?1-s.left/MIMIC_CONFIG.split:s.state==='aim'?1-s.left/MIMIC_CONFIG.aim:0}else if(e.brute&&e.brute.state!=='approach'){const s=e.brute;state=s.state==='windup'?'skill':s.state==='charge'?'dash':s.state==='stunned'?'hurt':'idle';p=s.state==='windup'?1-s.left/BRUTE_CONFIG.windup:s.state==='charge'?1-s.left/BRUTE_CONFIG.charge:0}else if(e.archer&&['windup','release','recover','hide','stunned'].includes(e.archer.state)){const s=e.archer;state=s.state==='windup'?'skill':s.state==='release'?'attack':s.state==='stunned'?'hurt':'idle';p=s.state==='windup'?1-s.left/ARCHER_CONFIG.windup:s.state==='release'?1-s.left/ARCHER_CONFIG.release:0}else if(e.stalker&&['windup','strike','recover','stunned'].includes(e.stalker.state)){const s=e.stalker;state=s.state==='windup'?'skill':s.state==='strike'?'dash':s.state==='stunned'?'hurt':'idle';p=s.state==='windup'?1-s.left/STALKER_CONFIG.windup:s.state==='strike'?1-s.left/STALKER_CONFIG.strike:0}else if(e.runner&&e.runner.state!=='approach'){const s=e.runner;state=s.state==='windup'?'skill':s.state==='charge'?'dash':s.state==='stunned'?'hurt':'idle';p=s.state==='windup'?1-s.left/RUNNER_CONFIG.windup:s.state==='charge'?1-s.left/RUNNER_CONFIG.charge:0}else if(e.cast||e.contactWindup>0||e.chargeWindup>0){state='skill';p=e.cast?1-e.cast.left/e.cast.total:e.contactWindup>0?1-e.contactWindup/.3:1-e.chargeWindup/.45}else if(e.charging>0){state='dash';p=Math.min(.99,1-e.charging/.42)}else if(e.attackAnim>0){state='attack';p=Math.min(.99,1-e.attackAnim/.4)}
 c.save();c.fillStyle='#07161b77';c.beginPath();c.ellipse(e.x,e.y+e.size*.6,e.size*.9,e.size*.3,0,0,Math.PI*2);c.fill();
 if(e.chapter>=4&&e.type!==4&&!e.boss)c.filter=e.chapter===4?'saturate(1.3)':e.chapter===5?'hue-rotate(305deg)':'hue-rotate(95deg) saturate(1.5)';
 if(e.chapter===1&&e.boss&&e.bossTier===1)c.filter='sepia(.8) hue-rotate(45deg) saturate(.8)';
 if(e.chapter===1&&e.type===2)c.filter='hue-rotate(35deg)';if(e.chapter===1&&e.type===4)c.filter='sepia(.6)';if(e.flash>.07)c.filter='brightness(1.5)';
 if(e.archetype===EATER_CONFIG.archetype)c.filter='hue-rotate(285deg) saturate(.65)';
 if(isShadowStalker(e)&&e.flash<=.07)c.filter='brightness(.7) saturate(.7)';
 if(e.spawnGrace>0)c.globalAlpha=.45;
 const facing=e.brute&&['windup','charge'].includes(e.brute.state)?Math.cos(e.brute.angle)<0:e.archer&&['windup','release'].includes(e.archer.state)?Math.cos(e.archer.angle)<0:e.stalker&&['windup','strike'].includes(e.stalker.state)?Math.cos(e.stalker.angle)<0:e.runner&&['windup','charge'].includes(e.runner.state)?Math.cos(e.runner.angle)<0:!!run&&run.x<e.x;
 const reaction=run&&sampleActorMotion(run,e,reducedMotion),windup=e.bossCast?Math.max(0,Math.min(1,1-e.bossCast.left/e.bossCast.total)):0;
 c.save();c.translate(e.x,e.y);
 if(reaction){c.translate(reaction.x,reaction.y);c.rotate(reaction.tilt);c.scale(reaction.sx,reaction.sy);if(!e.dead&&!reaction.release){state='hurt';p=reaction.hurtPhase}}
 else if(windup&&!reducedMotion){c.translate(0,Math.sin(windup*Math.PI)*2);c.scale(1+windup*.025,1-windup*.025)}
 c.translate(-e.x,-e.y);
 paintAnimated(c,id,state,p,e.x,e.y+e.size*.6,e.boss?155:e.elite?90:e.type===1?78:72,e.boss?145:e.elite?85:e.archetype===EATER_CONFIG.archetype?78:e.type===1?44:60,facing);c.restore();c.restore();
 // The Briar Sentinel shares the forest guardian body, with thorn-covered shoulders.
 if(e.chapter===1&&e.boss&&e.bossTier===1&&!e.dead){c.save();c.strokeStyle='#526e45';c.lineWidth=3;for(const side of [-1,1]){c.beginPath();c.moveTo(e.x+side*26,e.y-35);c.lineTo(e.x+side*40,e.y-65);c.lineTo(e.x+side*33,e.y-95);c.stroke();for(let i=0;i<3;i++){const x=e.x+side*(34+i%2*5),y=e.y-55-i*15;c.beginPath();c.moveTo(x,y);c.lineTo(x+side*10,y-9);c.lineTo(x+side*4,y-4);c.stroke()}}c.restore()}
 if(!e.dead&&(e.cast||e.contactWindup>0||e.chargeWindup>0)){const progress=e.cast?1-e.cast.left/e.cast.total:e.contactWindup>0?1-e.contactWindup/.3:1-e.chargeWindup/.45;c.save();c.strokeStyle=chapters[e.chapter-1].accent;c.lineWidth=2;c.globalAlpha=.5+progress*.5;c.beginPath();c.ellipse(e.x,e.y+10,e.size+8,e.size*.45+5,0,0,Math.PI*2);c.stroke();if(e.chargeWindup>0){c.beginPath();c.moveTo(e.x,e.y);c.lineTo(e.x+Math.cos(e.chargeAngle)*100,e.y+Math.sin(e.chargeAngle)*100);c.stroke()}c.restore()}
 if(e.elite&&!e.dead){c.strokeStyle='#ffc76b';c.lineWidth=2;c.beginPath();c.ellipse(e.x,e.y+8,22,7,0,0,Math.PI*2);c.stroke()}
 if(e.spawnGrace>0&&!e.dead){c.save();c.strokeStyle=chapters[e.chapter-1].accent;c.lineWidth=2;c.setLineDash([4,4]);c.beginPath();c.ellipse(e.x,e.y+8,e.size+12,10,0,0,Math.PI*2);c.stroke();c.fillStyle='#fff0cd';c.font='11px Georgia';c.textAlign='center';c.fillText('Arriving · '+e.spawnGrace.toFixed(1)+'s',e.x,e.y-55);c.restore()}
 return true;
}
drawAnimatedEnemy=drawEnemyMotion;drawChapterEnemy=drawEnemyMotion;
function queueEnemyCast(e,shots=[],zones=[]){if(e.cast)return;e.cast={left:e.boss?.5:.38,total:e.boss?.5:.38,shots,zones};e.attackAnim=0}
function tickEnemyCast(e,r,dt){
 if(Math.hypot(e.x-r.x,e.y-r.y)>e.size+35)e.contactWindup=0;
 if(e.cast){e.cast.left-=dt;if(e.cast.left<=0){const cast=e.cast;e.cast=null;e.attackAnim=.4;for(const s of cast.shots){if(r.shots.length>=300)break;r.shots.push({x:e.x,y:e.y-e.size*.5,vx:Math.cos(s.angle)*s.speed,vy:Math.sin(s.angle)*s.speed,t:5,enemy:true,dmg:s.dmg,color:s.color||chapters[e.chapter-1].accent})}for(const z of cast.zones)dangerZone(z.x,z.y,z.radius,z.dmg)}}
 if(e.stun>0)e.contactWindup=0;
}
function enemyContactReady(e,dt){if(e.cast||e.chargeWindup>0||e.stun>0)return false;if(!e.contactWindup){e.contactWindup=.3;return false}e.contactWindup-=dt;if(e.contactWindup>0)return false;e.contactWindup=0;return true}
const beforeTelegraphBoss=bossAI;
bossAI=function(e,r,dt,a,dis){
 if(e.cast){e.x-=Math.cos(a)*e.speed*dt*.25;return}
 // Capture the boss's authored pattern, then release it after the visible cast.
 const oldShots=r.shots.length,oldZones=r.hazards.length;beforeTelegraphBoss(e,r,dt,a,dis);
 if(r.shots.length>oldShots||r.hazards.length>oldZones){const shots=r.shots.splice(oldShots).map(s=>({angle:Math.atan2(s.vy,s.vx),speed:Math.hypot(s.vx,s.vy),dmg:s.dmg,color:s.color})),zones=r.hazards.splice(oldZones).map(z=>({x:z.x,y:z.y,radius:z.radius,dmg:z.dmg}));
  if((e.bossTier||1)>=2)for(let k=-1;k<=1;k++)shots.push({angle:a+k*.16,speed:135+e.bossTier*8,dmg:e.dmg*.6});
  if(e.bossTier===3){for(let i=0;i<12;i++)shots.push({angle:e.phase*.5+i*Math.PI/6,speed:85,dmg:e.dmg*.5});if(r.enemies.length<45)spawnEnemy(false,3)}
  if((e.bossTier||1)>=4)zones.push({x:r.x+r.lastDx*70,y:r.y+r.lastDy*70,radius:38,dmg:e.dmg*.8});queueEnemyCast(e,shots,zones);
 }
};

// The Debt of Dawn: offline modes, camp, narrative and resumable expeditions.
const modeNames={campaign:'Campaign',story:'Story',endless:'Endless',survival:'180-second Survival'};
let currentPage='home',chosenMode='campaign',snapshotClock=0,changingRun=false,selectedSeed='',selectedDirectorDifficulty='standard';
const skillBook={
 keeper:[['sunburst','Sunburst','Blast and repel nearby foes.',14,0],['beacon','Guiding Beacon','Place a healing beacon that burns enemies for 8 seconds.',20,25000],['soulflame','Soulflame','Send a piercing spirit fan from your lantern.',16,180000]],
 archer:[['starfall','Starfall','Release a piercing arrow volley.',12,0],['snare','Snare Volley','Fire a fan of arrows and root nearby pursuers.',16,25000],['shadowstep','Shadow Step','Dash through danger and fire three empowered arrows.',10,180000]],
 mage:[['inferno','Inferno','Ignite nearby enemies with a ring of fire.',16,0],['frostnova','Frost Nova','Freeze the crowd and shatter it with cold magic.',18,25000],['meteors','Astral Rain','Mark up to eight enemies for delayed star impacts.',22,180000]],
 brawler:[['earthshatter','Earthshatter','Stun and push back nearby foes.',11,0],['ironwill','Iron Will','Gain a short guard and empower your next three strikes.',18,25000],['shockwave','Thunderclap','Release three expanding, stunning shockwaves.',17,180000]],
 healer:[['sanctuary','Sanctuary','Heal, shield and push enemies away.',15,0],['renewal','Renewal','Create a healing field that also damages nearby enemies.',23,25000],['judgment','Dawn Judgment','Strike marked enemies and restore health for each hit.',18,180000]],
 gunner:[['overdrive','Overdrive','Unleash a piercing fan of bullets.',12,0],['ricochet','Arc Barrage','Fire piercing electric rounds in three rapid bursts.',16,25000],['turret','Sentry Lantern','Deploy an automatic sentry for 10 seconds.',24,180000]]
};
const bossNames=[
 ['Briar Sentinel','The Lantern Thief','Rootbound Oracle','The Antler Warden','The Hollow King'],
 ['Slagjaw','The Kiln Keeper','Ashwing Broodmother','The Furnace Marshal','Cindermaw'],
 ['Rimewatcher','The Glass Widow','Frostbound Regent','The Moonless Herald','Eclipse Matriarch'],
 ['Chainbreaker','The Siege Captain','Crown of Cinders','The Last General','The Iron Tyrant'],
 ['The Bell Diver','The Mourning Choir','The Sunken Abbot','The Memory Eater','The Grave Cantor'],
 ['Crimson Watcher','The Oath Collector','The Hollow Heir','Keeper of the First Flame','The Ashen Sovereign']
];
const storyActs=[
 {
  "title": "The girl the light forgot",
  "intro": "Finch sets two bowls beside the campfire. He cannot explain the second. At midnight, Brann hears a girl singing inside his lantern; at dawn, Finch has forgotten the tune. Mara finds a name beneath the blank lines of her register: Elia. Before the ink disappears, she sends Brann into the woods. Bring back the girl, or bring back someone who remembers her.",
  "beats": [
   "Finch grips a little brass swallow. Elia made him promise to keep it until she came home. Nyx recognizes the knot in its cord: her missing brother used the same one. The vanished did not simply wander into the woods. Someone collected them.",
   "Inside the Lantern Thief’s coat hang hundreds of warm name tags. It shields them from Brann’s light. When he lowers his lantern, a tag begins to sing Elia’s unfinished song. The creature was trying to keep something safe.",
   "The Oracle shows Brann a gate in the rain. He wears a keeper’s badge and waves a wagon through. A child asks whether the lights will hurt. In the vision he answers yes. Awake, he cannot remember giving that answer.",
   "The Warden calls him the Witness. Edda recognizes the badge and steps between him and her children. Brann unpins it. She still asks for his help: the shelter is flooding, and the gate ledger is dissolving. Trust will have to begin with what he does next.",
   "Alder, the former keeper, opens his empty hands. He became the Hollow King after refusing another collection. Elia passed through his court alive, bound for the quarry. He gives Brann the furnace key. “If the flame calls you good,” he says, “ask whose voice it borrowed.”"
  ]
 },
 {
  "title": "The names on the night shift",
  "intro": "At the quarry, the shift bell rings for workers who died years ago. Rook finds his mother’s number scratched beside a fresh delivery. Finch’s swallow grows warm near the furnace. Nell gives the company until the next bell: after that, the remaining prisoners will be taken below, and their names crossed off for good.",
  "beats": [
   "Slagjaw’s chain carries Rook’s mother’s work ring. An apprentice explains that the furnace keeps the last memory of every worker it consumes. Rook has spent seven years trying to remember his mother’s voice. Now it calls his number from beneath the floor.",
   "The ledger begins with willing gifts: a wedding dance, a summer afternoon, a pain someone wanted gone. Then consent becomes a quota. On the last intact sheet, Elia’s name is marked TRANSFERRED. Someone spared her for a purpose.",
   "Letters fall from Ashwing’s burning nest. Brann finds one in his own handwriting: “Jax, break the sixth beacon. If I deny this order, do not believe me.” It bears a recorder’s countersign. Mara’s.",
   "The Marshal admits that the quarry never ran out of fuel. It ran out of volunteers. Corin’s injured workers hear him through the wall. Rook lowers his fists long enough to help them stand; the testimony must leave with someone alive to speak it.",
   "Cindermaw splits open. A thousand voices fill the room. Rook hears his mother say his childhood name, once, before the furnace falls silent. He cannot save that moment for later. Darr reveals that Elia was sent to Frostfall because she could remember people after the lantern took them."
  ]
 },
 {
  "title": "The winter inside a promise",
  "intro": "Aster opens the observatory at Orin’s voice, then waits for him to recognize her. He does not. She hands him the notes he asked her to burn. Behind the ice, a girl has been writing names on every window. Elia reached this place. Her last message points toward the citadel.",
  "beats": [
   "Rimewatcher carries a journal addressed to Aster. Orin recorded each small thing he loved about her before giving his memories to the experiment. The final entry is a question: “If I forget why I began, who will make me stop?” Aster has kept answering it alone.",
   "The Glass Widow offers Brann a life in which he never opened the refugee gate. He reaches for it, then sees the families erased from the reflection. He lets the glass break. A comforting lie would leave them lost a second time.",
   "The lenses reveal ordinary sunlight held inside six beacons. During the first catastrophe, Orin built a shelter that could hold the dying day in place. Brann promised to protect everyone until morning. The shelter learned to preserve the night so that his promise could never end.",
   "Orin’s final lecture names the flaw: every stolen memory strengthens the command to keep the world unchanged. Children like Elia can carry memories without consuming them. The citadel intends to use her to repair the failing prison. Nima asks whether the company came to rescue her or merely use her differently.",
   "Ysra returns the torn page. Orin removed the release instructions, then surrendered his memory to hide them from the beacons. Elia read the missing sequence before the soldiers took her. She left Aster a message: “Tell Finch I am frightened. Tell him I am coming home anyway.”"
  ]
 },
 {
  "title": "The gates we closed",
  "intro": "The citadel’s walls carry promises of sanctuary. Inside, refugee names have been replaced by military numbers. Jax finds his old unit guarding the drain through which he once escaped. Vale has seen Elia’s transport leave for the drowned abbey. Before the company can follow, they must open the road for the families still trapped here.",
  "beats": [
   "Chainbreaker falls across a gate locked from the inside. Pell shows Brann the same keeper’s seal from the Oracle’s vision. Brann opens the gate with his own badge. The mechanism knows his hand.",
   "The Siege Captain repeats “Protect the children” while striking at a child’s discarded shoe. Jax recognizes the captain who taught him to shoot. He calls the man by name until the last command falters. For one breath, the captain asks whether anyone got out.",
   "The muster archive records Brann’s first rebellion. He ordered the sixth beacon destroyed. Mara hid the order inside a refugee manifest; Jax carried it out and failed. The Sovereign then took the witnesses’ memories and turned their own promises against them.",
   "The Last General offers Jax his old command and a city that will never fear again. Jax looks toward Miren’s crowded shelter. He remembers abandoning this city once. This time he stays long enough to hear every name at the door.",
   "Hale reveals what Mara concealed: her register selected the first memory donors, including her husband. She later falsified the records to smuggle people out. Elia was one of them, until the beacons found her. Beneath the citadel, a bell rings. Mara is waiting at the abbey with the original register."
  ]
 },
 {
  "title": "What the water returns",
  "intro": "Mara stands in the dry chapel without her journal. She has given it to the choir so no one can edit her confession. “I thought I could choose a smaller cruelty,” she tells Brann. Sera hears Elia answering the drowned bell below them. The girl is alive; the abbey is teaching her to carry the voices of the dead.",
  "beats": [
   "The Bell Diver returns a school bell. Its sound draws Elia’s voice through the water: she has learned to remember the stolen names, but each new one makes her own childhood harder to hold. Finch answers with the song she left unfinished. She remembers the next line.",
   "The choir asks Sera to take its grief away. She refuses to erase the people inside it. Instead she sits and listens. One voice belongs to a patient she could not save. For the first time, she hears the end of his prayer.",
   "The Abbot’s stones name the dead and the living separately. Opening the prison can return stolen memories to survivors; it cannot bring back those whose bodies are gone. Brann asks after the families he sent through the gate. Sera stays beside him while Ansel reads.",
   "The Memory Eater carries Brann’s confession. He remembered every transport when he signed the order against the sixth beacon. He gave those memories away after his revolt failed. Mara kept hers. Neither can ask the other to make that choice innocent.",
   "The Grave Cantor releases Elia. She knows the release sequence, and refuses to become fuel for it. “You all keep asking what I can carry,” she says. “Ask what you can put down.” Mara takes her hand. The company leaves for the throne with a living witness and a confession no one can burn away."
  ]
 },
 {
  "title": "Morning belongs to the living",
  "intro": "The Sovereign welcomes Brann with his own voice. It is the command he left inside the first beacon: keep everyone safe until morning, whatever the cost. Every stolen memory has made it stronger. Elia stands beside the journal and asks the question it cannot answer: “When do we get to leave?”",
  "beats": [
   "The Crimson Watcher shows the first night. People begged Brann to stop the sun from dying. He promised them time. Seeing their faces again, he understands why he made the promise—and why he must allow them to choose when it ends.",
   "The Oath Collector offers everyone a private bargain: Rook his mother’s voice, Orin a life with Aster restored, Jax an order he cannot fail. Elia closes the archive. “They belong to you already,” she says. “It has been selling them back.”",
   "The Hollow Heir wears Finch’s swallow on a keeper’s chain. It is the future prepared for Elia: a child raised to call the prison home. Brann breaks the chain. The conduits open, and the Sovereign begins speaking in every voice the company has recovered.",
   "The First Flame remembers sunlight on a kitchen windowsill. Mara reads her confession aloud, including the names she once removed. The Sovereign cannot make the witnesses agree to forget. For the first time, its borrowed voices fall out of unison.",
   "The Sovereign falls silent. Elia sets the brass swallow beside the lantern and steps away. Breaking the prison will return the memories, but the wounded sky may remain dark. Keeping it will force a sunrise by taking the camp’s remaining memories. Brann asks each witness to speak before he touches the flame. No one offers him absolution. They offer to face what comes."
  ]
 }
];
for(const [k,u] of Object.entries(upgrades)){u.max=200;u.base=Math.max(u.base,200);u.mult=1.045}
Object.assign(upgrades,{
 armor:{name:'Watchtower',desc:'Armor training reduces incoming damage, up to 30%.',base:350,mult:1.045,max:200,icon:'heart',stat:l=>Math.round(l*.15)+'% damage reduction'},
 recovery:{name:'Field infirmary',desc:'Recover vitality steadily while on an expedition.',base:400,mult:1.045,max:200,icon:'heart',stat:l=>(l*.015).toFixed(2)+' HP per second'},
 salvage:{name:'Salvage guild',desc:'Improve gold earned from enemy kills and bosses.',base:500,mult:1.045,max:200,icon:'camp',stat:l=>'+'+(l*.5).toFixed(1)+'% combat gold'},
 focus:{name:'Lantern research',desc:'Shorten skill recovery by up to 35%.',base:450,mult:1.045,max:200,icon:'flame',stat:l=>(l*.175).toFixed(1)+'% shorter skill cooldown'}
});
upgrades.haste.stat=l=>Math.round(l*.3)+'% shorter attack interval';upgrades.power.stat=l=>'+'+(l*3.5).toFixed(0)+'% skill strength';upgrades.agility.stat=l=>'+'+Math.round(.6*(1-Math.exp(-l/80))*100)+'% movement speed';upgrades.camp.stat=l=>(.05+l*.05).toFixed(2)+' gold per minute';
function ensureProgress(){normalizeProgress(save);for(const h of heroes){const list=skillBook[h.classId],id=save.skills[h.classId];if(!list.some(s=>s[0]===id))save.skills[h.classId]=list[0][0]}for(const [id,n]of Object.entries(save.skillRanks))if(!Number.isInteger(n)||n<0||n>200)delete save.skillRanks[id]}
ensureProgress();
function selectedSkill(h){const list=skillBook[h.classId];return list.find(s=>s[0]===save.skills[h.classId])||list[0]}
function skillUnlocked(s){return s[4]===0||Object.hasOwn(save.skillRanks,s[0])}
function skillRank(s){return Math.max(0,Math.min(200,save.skillRanks[s[0]]||0))}
function skillPrice(s){return Math.floor(500*Math.pow(1.045,skillRank(s)))}
function buySkill(id){if(run)return;const s=Object.values(skillBook).flat().find(s=>s[0]===id);if(!s)return;const owned=skillUnlocked(s),cost=owned?skillPrice(s):s[4];if(save.gold<cost||owned&&skillRank(s)>=200)return;save.gold-=cost;save.skillRanks[id]=owned?skillRank(s)+1:0;persist();renderShop();toast(owned?s[1]+' rank '+save.skillRanks[id]:s[1]+' learned')}
function chooseSkill(id){if(run)return;const h=heroes.find(h=>h.id===save.hero),s=skillBook[h.classId].find(s=>s[0]===id);if(!s||!skillUnlocked(s))return;save.skills[h.classId]=id;persist();renderShop();toast(s[1]+' equipped')}
const priorPrice=price;price=function(k){return upgrades[k]?Math.floor(upgrades[k].base*Math.pow(upgrades[k].mult,save.up[k])):Infinity};
const oldBuy=buy;buy=function(k){if(!upgrades[k])return;oldBuy(k)};
const oldPersist=persist;
function packRun(r){
 const state={...r};state.heroCooldown=r.hero.cd;delete state.hero;delete state.weapon;
 state.enemies=r.enemies.filter(e=>e.hp>0).map(e=>({...e}));
 state.shots=r.shots.filter(s=>s.t>0).map(s=>({...s,hit:s.enemy?[]:[...(s.hit||[])].map(e=>state.enemies.findIndex(q=>q.x===e.x&&q.y===e.y&&q.type===e.type)).filter(i=>i>=0)}));
 state.ghosts=[];state.particles=[];state.texts=[];state.corpses=[];state.paused=false;state.saveClock=0;
 return JSON.parse(JSON.stringify({version:1,mode:r.mode||chosenMode,heroId:r.hero.id,weaponId:r.weapon.id,state}));
}
persist=function(){if(run&&!changingRun&&run.hp>0&&run.mode)save.expedition=packRun(run);oldPersist()};
function snapshot(){if(run&&run.hp>0){save.expedition=packRun(run);oldPersist()}}
function showPage(page){
 if(page==='battle'&&run&&Number.isFinite(run.heroCooldown))run.hero.cd=run.heroCooldown;
 if(run&&page!=='battle'){toast('Save & return from the pause menu before managing camp.');return}
 currentPage=page;document.body.dataset.page=page;$('#storeNavigation').classList.toggle('hidden',!['armory','supplies','forge','camp'].includes(page));$$('[data-store]').forEach(b=>{if(b.dataset.store===page)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});document.body.classList.toggle('playing',page==='battle');
 $('#directorStatus').classList.toggle('hidden',page!=='battle');
 $('#lanternPanel').classList.toggle('hidden',page!=='battle');
 for(const [id,on] of [['#homeScreen',page==='home'],['#modesScreen',page==='modes'],['#managementScreen',['armory','supplies','armor','forge','heroes','skills','camp','journal'].includes(page)],['#battleLayout',page==='battle'],['#objectiveHud',page==='battle']])$(id).classList.toggle('hidden',!on);
 $$('[data-page]').forEach(b=>{if(b.dataset.page===page||page==='supplies'&&b.dataset.page==='armory')b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
 if(['armory','supplies','armor','forge','heroes','skills','camp','journal'].includes(page)){
  tab=page;$('#managementTitle').textContent={armory:'Weapon Shop',supplies:'Supplies & materials',armor:'Armor',forge:'Enhancement forge',heroes:'Characters',skills:'Skills',camp:'Camp',journal:'The keeper’s journal'}[page];renderShop();
 }
 refreshHome();window.scrollTo({top:0});
}
function refreshHome(){
 $('#recordSurvival').textContent='Local best survival: '+(save.records.survival||0)+'/180 seconds';
 $('#continueGame').hidden=!save.expedition;$('#newGame').textContent=save.expedition?'New expedition':'Play';$('#newGame').classList.toggle('primary',!save.expedition);
 const e=save.expedition,h=e&&heroes.find(h=>h.id===e.heroId);$('#continueGame').disabled=!e;$('#continueSummary').textContent=e?`${modeNames[e.mode]} · ${h.name} · ${chapters[e.state.chapter-1].name} · Wave ${e.state.wave}/100`:'No expedition saved. Start a new game to carry the light.';
 if(e?.mode==='survival')$('#continueSummary').textContent='Survival · '+formatTime(e.state.time)+' / 3:00 · Seed '+e.state.director?.seed;
 $('#recordCampaign').textContent='Furthest campaign wave: '+(save.records.campaign||0)+'/600';$('#recordStory').textContent=save.storyComplete?'Story completed · '+(save.ending==='release'?'The remembered dawn':'The gilded dawn'):'Story progress: '+(save.records.story||0)+'/600 waves';$('#recordEndless').textContent='Best wave: '+(save.records.endless||0)+' · Score: '+num(save.endlessScore||0);
 const active=heroes.find(h=>h.id===save.hero);$('#homeHero').textContent=active.name+' · '+active.role;$('#managementSummary').textContent=active.name+' · '+weapons.find(w=>w.id===save.weapon).name+' · '+num(save.gold)+' gold';
 $('#homeHeroArt').src=spriteData['held_'+active.id+'_'+save.weapon]||spriteData[active.id];$('#homeHeroArt').alt=active.name+' holding '+weapons.find(w=>w.id===save.weapon).name;
}
function gearStars(state){return `<div class="gear-stars ${state.awakened?'awakened':''}" role="img" aria-label="${state.stars} of 7 stars${state.awakened?', Awakened':''}">${Array.from({length:7},(_,i)=>`<span class="${i<state.stars?'lit':''}" aria-hidden="true">★</span>`).join('')}<strong>${state.awakened?'Awakened':state.stars+' / 7'}</strong></div>`}
function gearStatText(kind,item,state){const stats=gearStats(kind,item,state);return kind==='weapon'?'+'+stats.damageBonus+' bonus attack':'+'+stats.hp+' HP · '+(stats.reduction*100).toFixed(1)+'% protection'}
function equipmentBuildText(r=null){
 const weapon=r?(r.gearSnapshot?.weaponId||r.weapon.id):save.weapon,armor=r?(r.gearSnapshot?.armorId||'travel_cloak'):save.armor;
 const ws=r?(r.gearSnapshot?.weaponUpgrade||emptyEnhancement()):gearEnhancement(save,'weapon',weapon),as=r?(r.gearSnapshot?.armorUpgrade||emptyEnhancement()):gearEnhancement(save,'armor',armor);
 const rank=s=>s.awakened?'Awakened':s.stars+'★';
 return `${weapons.find(w=>w.id===weapon)?.name||'Weapon'} · ${rank(ws)}<br>${ARMORS.find(a=>a.id===armor)?.name||'Traveler’s Cloak'} · ${rank(as)}`;
}
function equipmentEnhance(kind,id,options={}){
 if(run)return {ok:false,reason:'expedition'};const result=enhanceGear(save,kind,id,weapons,options);if(!result.attempted)return result;
 persist();renderShop();toast(result.ok?(result.state.awakened?'Awakened · '+gearItem(kind,id,weapons).name:gearItem(kind,id,weapons).name+' enhanced to '+result.state.stars+' stars'):'Enhancement failed · stars retained · next chance improved');return result;
}
function materialName(id){return MATERIALS.find(m=>m.id===id)?.short||CONSUMABLES.find(m=>m.id===id)?.name||id}
function storeIntro(text,page){return '<div class="tab-intro"><p>'+text+'</p></div>'}
function bindStoreLinks(){$$('[data-store]').forEach(b=>b.onclick=()=>showPage(b.dataset.store))}
function purchaseSupply(id){if(run||!buySupply(save,id))return false;persist();renderShop();toast(SUPPLY_SHOP.find(i=>i.id===id).name+' added to your pack');return true}
function useBattleSupply(id){
 const r=run;if(!r)return {ok:false,reason:'expedition'};const result=consumeSupply(save,r,id);
 if(!result.ok){toast({empty:'No supply in your pack.',cooldown:'Supplies recover in '+Math.ceil(r.supplyCooldown||0)+' seconds.',full:'Already full. Your supply was kept.',active:'That tonic is already active.'}[result.reason]||'Cannot use that supply.');return result}
 addCombatFx(r,'heroSkill',r.x,r.y,{theme:id==='oil_flask'?'sun':'heal',shape:'bloom',radius:35,life:.5});textPop(r.x,r.y-55,result.item.name,id==='oil_flask'?'#ffd777':'#b5f3ca');persist();updateHud();return result;
}
function openBattlePack(){
 const r=run;if(!r||r.paused)return;r.paused=true;keys.clear();pointer=null;
 const render=()=>{
  const html='<p>Using a supply pauses the fight. Effects and the shared 8-second cooldown advance only while playing.</p><div class="battle-pack">'+CONSUMABLES.filter(i=>i.use==='battle').map(item=>`<section><img class="pack-item-art" src="${SUPPLY_ART_FILES[item.id]}" alt=""><div><strong>${item.name} · ${save.inventory[item.id]}</strong><p class="small muted">${item.description}${r.supplyBuffs?.[item.id]>0?' Active: '+Math.ceil(r.supplyBuffs[item.id])+'s.':''}</p></div><button data-supply-use="${item.id}" ${save.inventory[item.id]<1||(r.supplyCooldown||0)>0||r.supplyBuffs?.[item.id]>0||item.id==='healing_potion'&&r.hp>=r.maxHp||item.id==='oil_flask'&&r.lantern?.fuel>=100?'disabled':''}>${r.supplyBuffs?.[item.id]>0?'Active':(r.supplyCooldown||0)>0?'Wait':item.id==='healing_potion'&&r.hp>=r.maxHp||item.id==='oil_flask'&&r.lantern?.fuel>=100?'Full':'Use'}</button></section>`).join('')+'</div><p class="small muted">'+((r.supplyCooldown||0)>0?'Supply cooldown: '+Math.ceil(r.supplyCooldown)+'s':'Ready · R drinks a health draught during play.')+'</p>';
  showModal('Field supplies',html,[{label:'Return to battle',primary:true,fn:()=>{closeModal();if(run===r){r.paused=false;keys.clear();canvas.focus({preventScroll:true})}}}],'supplies');
  $$('[data-supply-use]').forEach(b=>b.onclick=()=>{useBattleSupply(b.dataset.supplyUse);render()});
 };render();
}
function renderSupplyShop(){
 updateWallet();let html=storeIntro('Bring draughts, oil and tonics into battle. Open your pack with I. Supplies share an 8-second use cooldown. Boss cores and dawn essence can only be earned in combat.','supplies');
 for(const item of SUPPLY_SHOP){const owned=Object.entries(item.contents).map(([id])=>save.inventory[id]).join(' / ');html+=`<article class="item supply-card" data-supply-icon="${item.icon}" data-supply-id="${item.id}"><div class="supply-heading"><span class="supply-art" aria-hidden="true"></span><span class="badge badge-common">${item.use==='forge'?'Forge aid':item.use==='battle'?'Battle supply':'Materials'}</span></div><h3>${item.name}</h3><p>${item.description}</p><p class="stat">In pack: ${owned}</p><div class="item-bottom"><span>${num(item.cost)} gold</span><button data-supply-buy="${item.id}" ${save.gold<item.cost||run?'disabled':''}>Buy</button></div></article>`}
 html+='<article class="item material-pouch"><h3>Your material pouch</h3><ul class="material-counts">'+MATERIALS.map(m=>'<li><span>'+m.name+'</span><strong>'+num(save.inventory[m.id])+'</strong></li>').join('')+'</ul><p class="small muted">Enemies drop fragments. Elites add dust. Bosses grant cores; final bosses grant dawn essence.</p></article>';
 $('#shop').innerHTML=html;$('#shop').classList.remove('journal-list');$('#shop').setAttribute('aria-labelledby','managementTitle');bindStoreLinks();$$('[data-supply-buy]').forEach(b=>b.onclick=()=>purchaseSupply(b.dataset.supplyBuy));
}
function recipeText(recipe){return Object.entries(recipe).map(([id,n])=>`${n} ${materialName(id)}`).join(' · ')}
function recipeMarkup(recipe){return '<ul class="forge-recipe">'+Object.entries(recipe).map(([id,n])=>`<li class="${save.inventory[id]<n?'recipe-missing':''}"><span>${materialName(id)}</span><strong>${save.inventory[id]} / ${n}</strong></li>`).join('')+'</ul>'}
function openForgeAttempt(kind,id){
 if(run)return;const item=gearItem(kind,id,weapons);if(!item)return;const state=gearEnhancement(save,kind,id),next=nextEnhancement(state);if(!next)return;
 const cost=enhancementCost(item,state),recipe=enhancementRecipe(kind,item,state),pity=save.forgePity[kind+':'+id]||0,chance=enhancementChance(save,kind,id),affordable=save.gold>=cost&&Object.entries(recipe).every(([key,n])=>save.inventory[key]>=n);
 showModal(next.awakened?'Awaken '+item.name:'Enhance '+item.name,`<div class="forge-odds"><strong id="forgeChance" aria-live="polite">${Math.round(chance*100)}%</strong><span>success chance · ${next.awakened?'Awakened':next.stars+'★'}</span></div><p>Next: ${gearStatText(kind,item,next)}</p>${recipeMarkup(recipe)}<p>${num(cost)} gold · You have ${num(save.gold)}</p><div class="forge-support"><label><img class="forge-support-art" src="${SUPPLY_ART_FILES.forge_catalyst}" alt=""><input id="forgeCatalyst" type="checkbox" ${save.inventory.forge_catalyst<1||chance>=1?'disabled':''}> Ember catalyst (${save.inventory.forge_catalyst}) · +15% chance</label><label><img class="forge-support-art" src="${SUPPLY_ART_FILES.preservation_ward}" alt=""><input id="forgeWard" type="checkbox" ${save.inventory.preservation_ward<1?'disabled':''}> Preservation ward (${save.inventory.preservation_ward}) · save materials on failure</label></div><p class="small muted">Failure spends gold and recipe materials. Stars are never lost. A ward preserves materials and is consumed only on failure. Catalysts are always consumed. ${pity>=5?'This attempt is guaranteed after five failures.':pity+' / 5 failures · +10% per failure; the sixth attempt is guaranteed.'}</p>${!affordable?'<p class="recipe-missing">Gather the missing materials or gold before attempting. Boss cores come from bosses; final bosses also drop dawn essence.</p>':''}`,[{label:'Attempt · '+num(cost)+' gold',primary:true,fn:()=>{
  const result=equipmentEnhance(kind,id,{catalyst:!!$('#forgeCatalyst').checked,ward:!!$('#forgeWard').checked});if(!result?.attempted){toast('Recipe or gold is missing.');return}
  showModal(result.ok?(result.state.awakened?'Awakening complete':'Enhancement successful'):'The embers faltered',`<p><strong>${item.name}</strong> · ${result.state.awakened?'Awakened':result.state.stars+'★'}</p><p>${result.ok?'Your equipment grew stronger.':result.protectedFailure?'Your ward preserved the recipe materials. Gold and the ward were spent.':'Gold and recipe materials were spent. Your earned stars remain.'}</p>${!result.ok?'<p>Next base chance: <strong>'+Math.round(enhancementChance(save,kind,id)*100)+'%</strong> · '+result.failures+' / 5 failures</p>':''}`,[{label:'Back to forge',primary:true,fn:closeModal}],result.ok?'forge-success':'forge-failed');
 }},{label:'Cancel',fn:closeModal}],'forge');
 $('#modalActions button').disabled=!affordable;
 $('#forgeCatalyst').onchange=()=>{$('#forgeChance').textContent=Math.round(enhancementChance(save,kind,id,{catalyst:!!$('#forgeCatalyst').checked})*100)+'%'};
}
function equipArmor(id){if(run||!buyArmor(save,id))return;persist();renderShop();toast(ARMORS.find(a=>a.id===id).name+' equipped')}
function renderEquipmentView(){
 ensureProgress();updateWallet();let html='';
 if(currentPage==='armor'){
  html='<p class="tab-intro">One shared armor slot for every hero. Armor adds health and protection to your next expedition. Enhance owned pieces at the forge.</p>';
  for(const item of ARMORS){const owned=save.unlockedArmors.includes(item.id),active=save.armor===item.id,state=gearEnhancement(save,'armor',item.id),required=Math.max(1,item.tier+1),locked=save.chapterUnlocked<required;
   html+=`<article class="item upgrade-card armor-card ${active?'equipped':''}" data-armor-id="${item.id}"><div class="item-top"><span class="armor-art" aria-hidden="true"></span><div><h3>${item.name} ${active?'<span class="badge badge-active">Equipped</span>':''}</h3><p class="stat">${gearStatText('armor',item,state)}</p></div></div>${gearStars(state)}<p>${item.description}</p><div class="item-bottom"><span class="small muted">${owned?'Owned':locked?'Unlock chapter '+required:num(item.cost)+' gold'}</span><button data-armor-equip="${item.id}" ${run||active||!owned&&(locked||save.gold<item.cost)?'disabled':''}>${active?'Equipped':owned?'Equip':locked?'Locked':'Buy & equip'}</button></div></article>`;
  }
 }else{
  html=storeIntro('Forge recipes: 0 → 7 stars → Awakened. Failures spend materials and gold, keep your stars, and improve the next attempt. Bosses drop cores; final bosses drop dawn essence.','forge');
  const list=[...weapons.filter(w=>w.classId===heroes.find(h=>h.id===save.hero).classId&&save.unlockedWeapons.includes(w.id)).map(item=>({kind:'weapon',item})),...ARMORS.filter(a=>save.unlockedArmors.includes(a.id)).map(item=>({kind:'armor',item}))];
  for(const {kind,item} of list){const state=gearEnhancement(save,kind,item.id),next=nextEnhancement(state),cost=enhancementCost(item,state),recipe=enhancementRecipe(kind,item,state),chance=enhancementChance(save,kind,item.id),pity=save.forgePity[kind+':'+item.id]||0,active=kind==='weapon'?save.weapon===item.id:save.armor===item.id;
   html+=`<article class="item upgrade-card forge-card ${state.awakened?'gear-awakened':active?'equipped':''}" data-gear-kind="${kind}" data-gear-id="${item.id}"><div class="gear-heading">${kind==='weapon'?`<img class="forge-art" src="${spriteData[item.id]}" alt="">`:'<span class="armor-art" aria-hidden="true"></span>'}<div><span class="small muted">${kind==='weapon'?'Weapon':'Armor'}${active?' · Equipped':''}</span><h3>${item.name}</h3></div></div>${gearStars(state)}${next?`<div class="forge-chance"><strong>${Math.round(chance*100)}% success</strong><span>${pity}/5 failures</span></div><p class="recipe-summary">${recipeText(recipe)}</p><p class="gear-preview">${next.awakened?'Awakened: ':'Next: '}${gearStatText(kind,item,next)}</p>`:'<p class="gear-preview">Fully awakened. Its full power is yours.</p>'}<div class="item-bottom"><span class="small muted">${next?num(cost)+' gold':'Maximum'}</span><button data-gear-enhance="${kind}:${item.id}" ${run||!next?'disabled':''}>${state.awakened?'Awakened':state.stars===7?'Review awakening':'Forge · '+(state.stars+1)+'★'}</button></div></article>`;
  }
 }
 $('#shop').innerHTML=html;$('#shop').classList.remove('journal-list');$('#shop').setAttribute('aria-labelledby','managementTitle');
 bindStoreLinks();
 $$('[data-armor-equip]').forEach(b=>b.onclick=()=>equipArmor(b.dataset.armorEquip));
 $$('[data-gear-enhance]').forEach(b=>b.onclick=()=>{const [kind,id]=b.dataset.gearEnhance.split(':');openForgeAttempt(kind,id)});
}
const gearModalBefore=showModal;
showModal=function(title,body,actions,kind=''){if(['prepare','pause'].includes(kind))body+='<p class="equipment-build"><strong>Equipment</strong><br>'+equipmentBuildText(run)+'</p><p class="small muted">Field pack · '+save.inventory.healing_potion+' draughts · '+save.inventory.oil_flask+' oil flasks · Open with I during battle. R drinks a draught.</p>';return gearModalBefore(title,body,actions,kind)};
const oldRenderModesShop=renderShop;
renderShop=function(){
 if(currentPage==='supplies'){renderSupplyShop();refreshHome();return}
 if(['armor','forge'].includes(currentPage)){renderEquipmentView();refreshHome();return}
 if(!['skills','camp','journal'].includes(currentPage)){oldRenderModesShop();if(currentPage==='armory'){bindStoreLinks()}$('#shop').classList.remove('journal-list');$('#shop').setAttribute('aria-labelledby','managementTitle');refreshHome();return}
 updateWallet();ensureProgress();let html='';
 if(currentPage==='camp'){
  html=storeIntro('Permanent upgrades. Every track has 200 levels, with milestones every 20. Benefits apply to your next expedition.','camp');
  for(const [k,u] of Object.entries(upgrades)){const l=save.up[k],cost=price(k);html+=`<article class="item upgrade-card"><h3>${u.name}</h3><p>${u.desc}</p><div class="upgrade-level"><span>Level ${l} / 200</span><span>Milestone ${Math.floor(l/20)} / 10</span></div><progress class="upgrade-progress" aria-label="${u.name} level" max="200" value="${l}"></progress><p class="stat">Now: ${u.stat(l)}<br>Next: ${l===200?'Fully trained':u.stat(l+1)}</p><div class="item-bottom"><button data-camp-buy="${k}" ${l>=200||save.gold<cost||run?'disabled':''}>${l>=200?'Level 200 · Max':num(cost)+' gold'}</button></div></article>`}
  const pending=pendingGold();html+=`<article class="item upgrade-card"><h3>Lantern workshop income</h3><p>${(.05+save.up.camp*.05).toFixed(2)} gold per minute, stored for up to 8 hours. Combat and boss milestones remain your main income.</p><strong><span id="campPendingAmount">${num(pending)}</span> gold ready</strong><button id="campCollect" ${pending<1?'disabled':''}>Collect gold</button></article>`;
 }else if(currentPage==='skills'){
  const h=heroes.find(h=>h.id===save.hero);html=`<p class="tab-intro">${h.name} equips one of three class skills. Learn alternatives, then train each up to rank 200. Each rank adds 1% skill damage and potency. Camp Lantern Research reduces cooldowns.</p>`;
  for(const s of skillBook[h.classId]){const owned=skillUnlocked(s),rank=skillRank(s),active=save.skills[h.classId]===s[0];html+=`<article class="item upgrade-card skill-card ${active?'selected':''}"><img class="skill-art" src="${spriteData['fx_'+h.id]||spriteData[h.id]}" alt=""><h3>${s[1]} ${active?'<span class="badge badge-active">Equipped</span>':''}</h3><p class="skill-description">${s[2]}</p><p>${s[3]} second base cooldown · ${owned?'Rank '+rank+'/200':num(s[4])+' gold to learn'}</p><progress class="upgrade-progress" aria-label="${s[1]} rank" max="200" value="${rank}"></progress><div class="skill-buttons"><button data-skill-buy="${s[0]}" ${owned&&rank>=200||save.gold<(owned?skillPrice(s):s[4])?'disabled':''}>${owned?rank>=200?'Rank 200 · Max':'Train · '+num(skillPrice(s))+' gold':'Learn · '+num(s[4])+' gold'}</button><button data-skill-equip="${s[0]}" ${!owned||active?'disabled':''}>${active?'Equipped':'Equip'}</button></div></article>`}
 }else{
  html='<p class="tab-intro">The names written here cannot be taken by the lantern. Story discoveries remain between expeditions.</p>';
  if(!save.journal.length)html+='<article class="journal-entry"><h3>An empty first page</h3><p>Begin Story mode to discover what burns inside Brann’s lantern.</p></article>';
  for(const key of save.journal){const [ch,beat]=key.split(':').map(Number),act=storyActs[ch-1];if(!act)continue;html+=`<article class="journal-entry"><h3>Act ${ch}: ${act.title}${beat?' · '+bossNames[ch-1][beat-1]:''}</h3><p>${beat?act.beats[beat-1]:act.intro}</p></article>`}
  if(save.ending)html+=`<article class="journal-entry journal-choice"><h3>${save.ending==='release'?'The remembered dawn':'The gilded dawn'}</h3><p>${endingText(save.ending)}</p></article>`;
 }
 $('#shop').innerHTML=html;$('#shop').setAttribute('aria-labelledby','managementTitle');$('#shop').classList.toggle('journal-list',currentPage==='journal');
 $$('[data-camp-buy]').forEach(b=>b.onclick=()=>buy(b.dataset.campBuy));$$('[data-skill-buy]').forEach(b=>b.onclick=()=>buySkill(b.dataset.skillBuy));$$('[data-skill-equip]').forEach(b=>b.onclick=()=>chooseSkill(b.dataset.skillEquip));
 bindStoreLinks();
 if(currentPage==='camp')$('#campCollect').onclick=()=>{const n=pendingGold();if(n<1||run)return;save.gold+=n;save.lastClaim=Date.now();persist();renderShop();toast('Collected '+num(n)+' gold')};refreshHome();
};
function prepareMode(mode){
 ensureProgress();if(!Object.hasOwn(modeNames,mode))return;
 chosenMode=mode;
 const prepare=()=>{const h=heroes.find(h=>h.id===save.hero);showModal(modeNames[mode]+' · Prepare',`<p>${mode==='survival'?'Survive three minutes through six escalating threat phases. A final guardian appears at 2:30; staying alive is the victory condition.':mode==='story'?'Follow NPC quests through six explorable chapters. Speak with witnesses, recover names, and open the warding gates.':mode==='campaign'?'Conquer 100 waves in each of six realms.':'Survive without a final wave. Every cycle is more dangerous.'}</p><p><strong>${h.name}</strong> · ${weapons.find(w=>w.id===save.weapon).name}<br>${selectedSkill(h)[1]} equipped</p><div class="prep-fields"><label for="runSeed">Run seed (leave blank for a new seed)</label><input id="runSeed" maxlength="64" value="${storyEsc(selectedSeed)}" autocomplete="off"><label for="modeChapter">Starting map</label><select id="modeChapter">${chapters.map((ch,i)=>`<option value="${i+1}" ${i+1===selectedChapter?'selected':''} ${!['campaign','survival'].includes(mode)&&i>0||i+1>save.chapterUnlocked?'disabled':''}>${i+1}. ${ch.name}${i+1>save.chapterUnlocked?' · Locked':''}</option>`).join('')}</select>${mode==='survival'?'<label for="directorDifficulty">Threat budget</label><select id="directorDifficulty"><option value="relaxed">Relaxed</option><option value="standard" selected>Standard</option><option value="veteran">Veteran</option></select>':''}</div><p class="small muted">${mode==='survival'?'Survive 180 active seconds to win. The final guardian is optional. Pause and upgrades stop the clock.':'Each map has 100 waves. Bosses guard waves 20, 40, 60, 80, and 100.'} Save & return is always available from pause.</p>`,[{label:'Begin '+modeNames[mode],primary:true,fn:()=>{selectedSeed=String($('#runSeed').value||'').trim().slice(0,64);selectedDirectorDifficulty=mode==='survival'?String($('#directorDifficulty').value||'standard'):'standard';selectedChapter=!['campaign','survival'].includes(mode)?1:Math.max(1,Math.min(save.chapterUnlocked,Number($('#modeChapter').value)||1));closeModal();save.expedition=null;save.checkpoint=null;persist();startRun()}},{label:'Prepare equipment',fn:()=>{closeModal();showPage('heroes')}},{label:'Back',fn:closeModal}],'prepare')};
 if(save.expedition)showModal('Start a new expedition?','<p>This replaces the saved expedition shown on Continue. Your gold, purchased equipment, skills, journal, and camp upgrades remain.</p>',[{label:'Keep saved expedition',primary:true,fn:closeModal},{label:'Replace expedition',fn:()=>{closeModal();prepare()}}],'new-run');else prepare();
}
const originalModeStart=startRun;
startRun=function(){
 if(run)return;ensureProgress();originalModeStart();const r=run;r.mode=chosenMode;r.cycle=0;r.totalWave=(r.chapter-1)*100+1;r.score=0;r.storyRescues=0;r.activeSkill=selectedSkill(r.hero)[0];r.skillRank=skillRank(selectedSkill(r.hero));r.hero={...r.hero,cd:selectedSkill(r.hero)[3]*(1-save.up.focus*.00175)};r.damageReduce=Math.min(.3,save.up.armor*.0015);r.regen=save.up.recovery*.015;r.skillTasks=[];r.sentries=[];r.skillFields=[];r.bossesCleared=[];r.blessingChoices=null;r.pendingBreak=null;setSectionObjective(r);save.expedition=packRun(r);save.checkpoint=packRun(r);oldPersist();showPage('battle');if(r.mode==='story')openStory(r.chapter,0,()=>{r.paused=false;snapshot()});else banner(modeNames[r.mode]+' · Wave 1 / 100');updateHud();
 r.damageReduce=Math.min(.5,r.damageReduce+gearStats('armor',ARMORS.find(a=>a.id===r.gearSnapshot.armorId),r.gearSnapshot.armorUpgrade).reduction);save.checkpoint=packRun(r);
 r.baseDamage=r.dmg;if(r.mode==='survival'){$('#areaStatus').textContent='Survival · Three minutes to dawn';banner('Survive until 3:00 · Final guardian optional')}snapshot();if(!r.paused)canvas.focus({preventScroll:true});
};$('#start').onclick=startRun;
const previousSetupModes=setupChapter;
setupChapter=function(r){previousSetupModes(r);r.baseDamage=r.baseDamage||r.dmg;r.cycle=r.cycle||0;r.mode=r.mode||chosenMode;r.skillTasks=[];r.sentries=[];r.skillFields=[];r.bossDead=false;r.bossesCleared=r.bossesCleared||[];r.bossTier=0;r.pendingBreak=null;setSectionObjective(r)};
function resumeRun(snapshotData=save.expedition){
 if(run||!validExpedition(snapshotData)){toast('No valid expedition to continue.');return false}
 ensureProgress();const h=heroes.find(h=>h.id===snapshotData.heroId),w=weapons.find(w=>w.id===snapshotData.weaponId);if(!save.unlocked.includes(h.id)||!save.unlockedWeapons.includes(w.id)||w.classId!==h.classId){toast('The saved equipment is unavailable.');return false}
 chosenMode=snapshotData.mode;const r=JSON.parse(JSON.stringify(snapshotData.state));r.lantern=r.lantern||createLanternState();r.enemies.forEach(e=>{if(isBrute(e)&&!e.brute){e.brute=createBruteState();e.charging=0;e.chargeWindup=0;e.contactWindup=0;e.cast=null}if(isCoverArcher(e)&&!e.archer){e.archer=createArcherState(e.phase||0);e.cast=null;e.contactWindup=0}if(isShadowStalker(e)){e.cast=null;e.contactWindup=0}if(isRunner(e)&&!e.runner){e.runner=createRunnerState();e.charging=0;e.chargeWindup=0;e.contactWindup=0;e.cast=null}});r.director=r.director||createDirector('legacy-'+snapshotData.heroId+'-'+r.chapter+'-'+r.wave+'-'+r.time);r.hero={...h,cd:(skillBook[h.classId].find(s=>s[0]===r.activeSkill)||skillBook[h.classId][0])[3]*(1-save.up.focus*.00175)};r.weapon=w;r.mode=chosenMode;r.paused=false;r.mapReady=0;r.ghosts=[];r.corpses=[];r.particles=[];r.texts=[];r.shots.forEach(s=>s.hit=new Set((s.hit||[]).map(i=>r.enemies[i]).filter(Boolean)));run=r;keys.clear();pointer=null;buildWorld(r.chapter);$('#intro').classList.add('hidden');$('#shade').classList.add('hidden');$('#hud').classList.remove('hidden');$('#controls').classList.remove('hidden');$('#areaTitle').textContent=chapters[r.chapter-1].name;$('#areaStatus').textContent=modeNames[r.mode]+' · Expedition resumed';showPage('battle');updateHud();canvas.focus({preventScroll:true});
 if(r.blessingChoices?.length)showBlessings();else if(r.pendingBreak)showBossBreak(r);else if(r.pendingChapter)showChapterBreak(r);else if(r.pendingEnding)showEnding(r);else if(r.pendingStory){const [ch,beat]=r.pendingStory;openStory(ch,beat,()=>{r.paused=false;snapshot()})}else banner('Welcome back · Wave '+r.wave+'/100');return true;
}
function leaveToHome(){if(!run)return;snapshot();changingRun=true;run=null;changingRun=false;keys.clear();pointer=null;closeModal();$('#hud').classList.add('hidden');$('#controls').classList.add('hidden');$('#bossbar').classList.add('hidden');$('#comboDock').classList.add('hidden');$('#banner').classList.add('hidden');showPage('home');persist()}
pauseGame=function(){if(!run)return;if(run.paused){if(modalKind==='pause'||modalKind==='supplies'){closeModal();run.paused=false}return}run.paused=true;keys.clear();pointer=null;snapshot();showModal('A breath before the dark',`<p>${modeNames[run.mode]} · ${chapters[run.chapter-1].name}<br>${run.mode==='survival'?'Active time '+formatTime(run.time)+' / 3:00':'Wave '+run.wave+'/100'} · Level ${run.level}<br>Seed ${storyEsc(run.director.seed)}</p><p>Your expedition is saved. Save & return lets you manage camp and continue later with this expedition’s existing build.</p>`,[{label:'Resume',primary:true,fn:()=>{closeModal();run.paused=false}},{label:'Save & return to home',fn:leaveToHome},{label:'End expedition & bank gold',fn:()=>{closeModal();endRun(false,true)}}],'pause')};$('#pause').onclick=pauseGame;
function globalWave(r){return(r.cycle||0)*600+(r.chapter-1)*100+r.wave}
function recordWave(r){if(r.mode==='survival'){save.records.survival=Math.max(save.records.survival||0,Math.min(180,Math.floor(r.time)));r.totalWave=r.wave;return}const n=globalWave(r);save.records[r.mode]=Math.max(save.records[r.mode]||0,n);if(r.mode==='endless')save.endlessScore=Math.max(save.endlessScore||0,Math.floor(r.kills*10+n*100+r.time));r.totalWave=n}
spawnEnemy=function(boss=false,forcedType,options={}){
 const r=run;if(!r)return null;const wardenRequested=options.archetype===WARDEN_CONFIG.archetype;if(wardenRequested&&(boss||r.enemies.filter(e=>e.hp>0&&isWarden(e)).length>=WARDEN_CONFIG.maxAlive))return null;const mimicRequested=options.archetype===MIMIC_CONFIG.archetype;if(mimicRequested&&(boss||r.enemies.filter(e=>e.hp>0&&isMimic(e)).length>=MIMIC_CONFIG.maxAlive))return null;const isEater=options.archetype===EATER_CONFIG.archetype,isStalker=options.archetype===STALKER_CONFIG.archetype;if(isStalker&&(boss||r.chapter!==STALKER_CONFIG.chapter||r.enemies.filter(e=>e.hp>0&&isShadowStalker(e)).length>=STALKER_CONFIG.maxAlive))return null;if(isEater&&(boss||r.enemies.filter(e=>e.hp>0&&e.archetype===EATER_CONFIG.archetype).length>=EATER_CONFIG.maxAlive))return null;const director=ensureDirector(r),pressure=difficultyProfile(r),type=boss?99:wardenRequested?2:mimicRequested?3:isEater?3:isStalker?STALKER_CONFIG.type:forcedType??difficultyEnemyType(r),size=boss?30:isEater?14:[12,9,14,11,18][type];
 const point=directorSpawnPoint(r,boss,size);if(!point)return null;
 const tier=boss?(options.tier??(r.mode==='survival'?1:Math.ceil(r.wave/20))):0,bossIndex=Math.ceil(pressure.wave/20);
 const hp=Math.min(1e12,(boss?1450+140*bossIndex:[36,26,52,44,130][type])*pressure.vitality);
 const e={x:point.x,y:point.y,hp,maxHp:hp,type,boss,chapter:r.chapter,bossTier:tier,name:boss?bossNames[r.chapter-1][tier-1]:chapters[r.chapter-1].family[type],speed:(boss?32:[36,65,29,45,27][type])*pressure.speed,size,dmg:Math.min(1e9,(boss?28+Math.min(30,bossIndex*.9):[11,9,14,13,24][type])*pressure.damage),flash:0,attack:0,phase:directorRandom(director,'placement'),shoot:boss?2.4:2.2,charging:0,chargeCd:3,traitCd:3,stun:0,attackAnim:0,spawnGrace:options.arrival?DIRECTOR_CONFIG.arrivalSeconds:0};
 if(r.mode==='story'&&r.story){e.storyRoom=r.story.combatRoom;e.stun=.6;e.attack=1}
 if(wardenRequested){e.archetype=WARDEN_CONFIG.archetype;e.name='Void Warden';e.warden=createWardenState(director.spawned+1)}
 if(mimicRequested){e.archetype=MIMIC_CONFIG.archetype;e.name='Spectral Mimic';e.mimic=createMimicState(director.spawned+1)}
 if(isEater){e.archetype=EATER_CONFIG.archetype;e.name='Lantern Eater';e.eater=createEaterState()}
 if(isBrute(e))e.brute=createBruteState();
 if(isRunner(e))e.runner=createRunnerState();
 if(isCoverArcher(e))e.archer=createArcherState(e.phase);
 if(isStalker){e.archetype=STALKER_CONFIG.archetype;e.name='Shadow Stalker';e.stalker=createStalkerState(e.phase<.5?-1:1)}
 director.spawned++;r.enemies.push(e);return e;
};
function waveDuration(r){return difficultyProfile(r).duration}
advanceWaves=function(r,dt){
 if(r.paused)return;if(r.mode==='survival'){advanceSurvivalDirector(r,dt);return}r.waveTime+=dt;r.spawn-=dt;
 if(r.wave%20!==0&&r.waveTime>=waveDuration(r)){
  r.wave++;r.waveTime=0;r.chapterDone=false;const gold=35*r.chapter*(1+(r.cycle||0));save.gold+=gold;r.gold+=gold;recordWave(r);
  if(r.wave%20===0){r.bossSpawned=true;r.bossDead=false;r.bossPhase2=false;r.bossTier=r.wave/20;r.bossSpawned=!!spawnEnemy(true,undefined,{arrival:true});banner(bossNames[r.chapter-1][r.bossTier-1]+' · Boss '+r.bossTier+'/5')}
  else{if(r.wave%5===0)spawnElite(r);banner('Wave '+r.wave+'/100 · '+(r.wave%5===0?'Elite hunt':'Stronger enemies'));}
  snapshot();updateWallet();
 }
 const bossWave=r.wave%20===0,p=difficultyProfile(r),cap=bossWave?p.bossCap:p.cap;
 if(r.spawn<=0){if(bossWave&&!r.bossSpawned)r.bossSpawned=!!spawnEnemy(true,undefined,{arrival:true});const alive=r.enemies.filter(e=>e.hp>0).length;spawnDirectorBatch(r,Math.max(0,Math.min(bossWave?p.bossBatch:p.batch,cap-alive)),true);r.spawn=bossWave?p.bossInterval:p.interval}
};
function resolveBoss(r){
 if(r.mode==='survival'){r.bossDead=false;r.bossSpawned=false;return}
 if(r.wave%20!==0||!r.bossDead||r.chapterDone)return;r.bossDead=false;r.chapterDone=true;r.bossSpawned=false;const key=r.chapter+':'+r.wave+':'+r.cycle;if(r.bossesCleared.includes(key))return;r.bossesCleared.push(key);r.enemies=[];r.shots=[];r.hazards=[];r.burnZones=[];r.hp=Math.min(r.maxHp,r.hp+r.maxHp*.25);r.skillCd=0;r.dashCd=0;
 const reward=1000*r.chapter*(r.wave/20);save.gold+=reward;r.gold+=reward;recordWave(r);r.pendingBreak={wave:r.wave};r.paused=true;keys.clear();pointer=null;
 const next=()=>{if(r.wave===100){r.pendingBreak=null;finishChapter(r)}else showBossBreak(r)};
 snapshot();if(r.mode==='story')openStory(r.chapter,r.wave/20,next);else next();
}
function showBossBreak(r){
 if(r.pendingStory){const [ch,beat]=r.pendingStory;openStory(ch,beat,()=>{r.pendingStory=null;showBossBreak(r)});return}
 if(r.wave===100){r.pendingBreak=null;finishChapter(r);return}
 r.paused=true;showModal('Boss defeated · Wave '+r.wave,`<p><strong>${bossNames[r.chapter-1][r.wave/20-1]}</strong> has fallen. Your gold is banked.</p><p>Health restored by 25%. Your next checkpoint begins at wave ${r.wave+1}. The next section brings stronger enemies.</p>`,[{label:'Continue to wave '+(r.wave+1),primary:true,fn:()=>{closeModal();r.pendingBreak=null;r.wave++;r.waveTime=0;r.chapterDone=false;r.bossPhase2=false;r.paused=false;r.invuln=2;setSectionObjective(r);save.checkpoint=packRun(r);snapshot();updateHud()}},{label:'Save & return',fn:leaveToHome}],'boss-break');
}
finishChapter=function(r){
 r.chapterDone=true;r.pendingBreak=null;
 if(r.mode==='endless'){if(r.chapter===6){r.chapter=1;r.cycle++;banner('Cycle '+(r.cycle+1)+' · The night deepens')}else r.chapter++;setupChapter(r);r.hp=Math.min(r.maxHp,r.hp+r.maxHp*.35);r.paused=false;save.checkpoint=packRun(r);snapshot();updateHud();return}
 if(r.chapter===6){if(r.mode==='story'){r.pendingEnding=true;showEnding(r)}else endRun(true);return}
 save.chapterUnlocked=Math.max(save.chapterUnlocked||1,r.chapter+1);const reward=2500*r.chapter*r.chapter;save.gold+=reward;r.gold+=reward;r.pendingChapter=true;r.paused=true;snapshot();showChapterBreak(r);
};
function showChapterBreak(r){r.paused=true;showModal(chapters[r.chapter-1].name+' reclaimed',`<p>All 100 waves are cleared. ${chapters[r.chapter].name} is now unlocked.</p><p>Your levels and blessings carry forward. Entering the next realm restores 35% health. Enemies gain greater vitality and new attack patterns.</p>`,[{label:'Enter '+chapters[r.chapter].name,primary:true,fn:()=>{closeModal();r.pendingChapter=false;r.chapter++;r.hp=Math.min(r.maxHp,r.hp+r.maxHp*.35);setupChapter(r);r.paused=false;save.checkpoint=packRun(r);snapshot();if(r.mode==='story')openStory(r.chapter,0,()=>{r.paused=false;snapshot()});updateHud()}},{label:'Save & return',fn:leaveToHome}],'chapter')}
function openStory(ch,beat,after){
 const r=run;if(!r)return;const key=ch+':'+beat;if(!save.journal.includes(key))save.journal.push(key);r.pendingStory=[ch,beat];r.paused=true;keys.clear();pointer=null;snapshot();const act=storyActs[ch-1];showModal('Act '+ch+' · '+act.title,`<p>${beat?act.beats[beat-1]:act.intro}</p><p class="small muted">Saved in your Journal. You can read it again at camp.</p>`,[{label:beat?'Carry the memory':'Enter '+chapters[ch-1].name,primary:true,fn:()=>{closeModal();r.pendingStory=null;after();snapshot()}},{label:'Save & return',fn:leaveToHome}],'story')}
function endingText(choice){return choice==='release'?'Brann breaks the lantern. Names rush through camp like rain. Nyx remembers her brother, Rook remembers his mother’s laugh, and Orin remembers why he wrote the warning. No perfect sunrise follows. Then, at the edge of the ruined sky, a thin ordinary light appears. The survivors build a fire that belongs to no one, and wait for morning together.':'Brann accepts the Sovereign’s bargain. The sun rises, bright and certain. The camp is safe, but its people no longer know why they followed him. Brann writes every name in the journal and begins the slow work of telling their stories back to them. The lantern remains beside him, warm as a promise he has not yet learned to release.'}
function showEnding(r){r.paused=true;r.pendingEnding=true;snapshot();showModal('What is a dawn worth?','<p>Elia steps away from the lantern. “My memories belong to me. I will not become another beacon.” Finch takes her hand. Mara opens the register to her own signature.</p><p>The Sovereign is gone, but its machinery still works. Keep the flame, and a forced sunrise will consume the camp’s remaining memories. Break it, and the stolen memories return to the living. The dead remain dead; the wounded sky may still be dark.</p><p>Brann can keep his promise of safety, or trust these people with an uncertain tomorrow. This choice becomes the last page of your journal.</p>',[{label:'Break the lantern · Return the memories',primary:true,fn:()=>finishStory('release')},{label:'Keep the flame · Accept the bargain',fn:()=>finishStory('keep')}],'ending')}
function finishStory(choice){if(run?.mode==='story')save.storyDecisions={...(run.storyChoices||{})};save.ending=choice;save.storyComplete=true;const r=run;r.pendingEnding=false;const rescue=r.storyRescues||0;endRun(true);showModal(choice==='release'?'The remembered dawn':'The gilded dawn',`<p>${endingText(choice)}</p><p>${rescue} rescue objectives completed on this journey. ${rescue>=3?'Those you sheltered kindle the first campfire together.':'The road remains open for those still lost.'}</p>`,[{label:'Return to camp',primary:true,fn:()=>{closeModal();showPage('home')}}],'ending')}
function setSectionObjective(r){
 if(r.mode==='survival'){r.objective=null;return}
 const section=Math.floor((r.wave-1)/20),type=section%3;r.objective={type,progress:0,target:type===0?3:type===1?12:20,failed:false,done:false,integrity:100,points:[{x:MW/2+240,y:MH/2-150,found:false},{x:MW/2-230,y:MH/2+150,found:false},{x:MW/2+310,y:MH/2+230,found:false}]};
}
function tickObjective(r,dt){
 const o=r.objective;if(!o||o.done||o.failed)return;
 if(o.type===0){for(const p of o.points)if(!p.found&&Math.hypot(r.x-p.x,r.y-p.y)<38){p.found=true;o.progress++;textPop(p.x,p.y,'Survivor sheltered','#ffc76b')}}
 else if(o.type===1){if(Math.hypot(r.x-MW/2,r.y-MH/2)<95){o.progress+=dt;const threat=r.enemies.some(e=>e.hp>0&&Math.hypot(e.x-MW/2,e.y-MH/2)<75);if(threat)o.integrity-=dt*5;if(o.integrity<=0)o.failed=true}}
 else if(Math.hypot(r.x-(MW/2-250),r.y-(MH/2-200))<75)o.progress+=dt;
 if(o.progress>=o.target){o.done=true;if(o.type===0)r.storyRescues=(r.storyRescues||0)+1;const reward=1500*r.chapter*(1+Math.floor((r.wave-1)/20));save.gold+=reward;r.gold+=reward;r.hp=Math.min(r.maxHp,r.hp+r.maxHp*.15);banner('Objective complete · +'+num(reward)+' gold');snapshot();updateWallet()}
}
const previousWorldModes=drawWorld;
drawWorld=function(c,r,t){previousWorldModes(c,r,t);const o=r.objective;if(!o||o.done||o.failed)return;c.save();const marker=(x,y,label)=>{c.strokeStyle='#ffc76b';c.fillStyle='#ffc76b22';c.lineWidth=2;c.beginPath();c.ellipse(x,y,32,18,0,0,Math.PI*2);c.fill();c.stroke();c.fillStyle='#fff0cd';c.font='12px Georgia';c.textAlign='center';c.fillText(label,x,y-28)};if(o.type===0)for(const p of o.points)if(!p.found){marker(p.x,p.y,'Shelter');paintSprite(c,'brann',p.x,p.y+4,28,35)}else{}else if(o.type===1)marker(MW/2,MH/2,'Guard beacon');else marker(MW/2-250,MH/2-200,'Recover relic');c.restore()};
const previousMiniModes=drawMinimap;
drawMinimap=function(c,r){previousMiniModes(c,r);const o=r.objective;if(!o||o.done||o.failed)return;const pts=o.type===0?o.points.filter(p=>!p.found):[{x:MW/2-(o.type===2?250:0),y:MH/2-(o.type===2?200:0)}];for(const p of pts){c.fillStyle='#fff0cd';c.fillRect(12+p.x/MW*132-2,H-190+p.y/MH*76-2,5,5)}};
const priorModeHit=hit;
hit=function(e,dmg,isSkill=false,isBurnTick=false){const alive=e.hp>0;if(run?.empowered>0&&!isSkill&&!isBurnTick){dmg*=1.8;run.empowered--}if(isSkill)dmg*=1+(run?.skillRank||0)*.01;priorModeHit(e,dmg,isSkill,isBurnTick);if(alive&&e.hp<=0&&run)run.score=(run.score||0)+(e.boss?1000:10)};
function castAlternate(r){
 const id=r.activeSkill,rank=1+(r.skillRank||0)*.01,f=(1+save.up.power*.035)*rank,origin=firingPoint(r),color=r.hero.color;
 const burst=(radius,damage,stun=0)=>{r.effects.push({x:r.x,y:r.y,r:radius,t:.6,max:.6,color});for(const e of r.enemies)if(e.hp>0&&Math.hypot(e.x-r.x,e.y-r.y)<radius){hit(e,damage*(1+save.up.power*.035),true);e.stun=Math.max(e.stun||0,stun);const a=Math.atan2(e.y-r.y,e.x-r.x);displaceEnemy(run,e,Math.cos(a)*20,Math.sin(a)*20)}};
 if(id==='beacon'||id==='renewal'){r.skillFields.push({x:r.x,y:r.y,t:id==='beacon'?8:10,r:125,heal:(id==='beacon'?4:7)*f,tick:0,dmg:r.dmg*.5});r.hp=Math.min(r.maxHp,r.hp+15*f)}
 if(id==='soulflame'||id==='snare'){for(let i=-3;i<=3;i++)shoot(origin.x,origin.y,r.aim+i*.16,r.dmg*(id==='soulflame'?2:1.5)*f,370,true);if(id==='snare')burst(210,25,2.5)}
 if(id==='shadowstep'){r.dashCd=0;dash();for(let i=-1;i<=1;i++)shoot(origin.x,origin.y,r.aim+i*.08,r.dmg*3*f,480,true)}
 if(id==='frostnova')burst(270,100,3);
 if(id==='meteors'||id==='judgment'){const targets=r.enemies.filter(e=>e.hp>0).slice(0,id==='meteors'?8:6);for(const e of targets)r.skillTasks.push({kind:'impact',x:e.x,y:e.y,left:.6+directorRandom(ensureDirector(r),'events')*.5,r:65,dmg:(id==='meteors'?160:110)*(1+save.up.power*.035)});if(id==='judgment')r.hp=Math.min(r.maxHp,r.hp+targets.length*8*f)}
 if(id==='ironwill'){r.shield=3.5;r.empowered=3;burst(140,40,1)}
 if(id==='shockwave'){burst(130,65,1);r.skillTasks.push({kind:'ring',left:.25,r:190,dmg:65*(1+save.up.power*.035)});r.skillTasks.push({kind:'ring',left:.5,r:250,dmg:65*(1+save.up.power*.035)})}
 if(id==='ricochet')for(let n=0;n<3;n++)r.skillTasks.push({kind:'bullets',left:n*.16,dmg:r.dmg*1.8*f});
 if(id==='turret')r.sentries.push({x:r.x,y:r.y-20,t:10,fire:0,dmg:r.dmg*1.2*f});
 r.effects.push({x:r.x,y:r.y,r:90,t:.6,max:.6,color});sound(330,.12,'triangle');
}
const skillBeforeAlternatives=skill;
skill=function(){if(!run||run.paused||run.skillCd>0||run.skillPending||run.altPending)return;const r=run;if(!r.activeSkill||skillBook[r.hero.classId][0][0]===r.activeSkill){skillBeforeAlternatives();return}r.pendingStrike=null;r.action=null;r.dashTime=0;r.anim.attackLeft=0;r.anim.skillLeft=.72;r.skillCd=r.hero.cd;r.attack=Math.max(r.attack,.6);r.altPending=.26;updateHud()};$('#skill').onclick=skill;
const oldModeTick=tickSpriteAnimation;
tickSpriteAnimation=function(r,dt){oldModeTick(r,dt);if(r.altPending!=null){r.altPending-=dt;if(r.altPending<=0){r.altPending=null;castAlternate(r)}}
 for(const f of r.skillFields||[]){f.t-=dt;f.tick-=dt;if(Math.hypot(r.x-f.x,r.y-f.y)<f.r)r.hp=Math.min(r.maxHp,r.hp+f.heal*dt);if(f.tick<=0){f.tick=.6;for(const e of r.enemies)if(e.hp>0&&Math.hypot(e.x-f.x,e.y-f.y)<f.r)hit(e,f.dmg,true)}}r.skillFields=(r.skillFields||[]).filter(f=>f.t>0);
 for(const task of r.skillTasks||[]){task.left-=dt;if(task.left>0)continue;if(task.kind==='bullets'){const p=firingPoint(r);for(let i=-2;i<=2;i++)shoot(p.x,p.y,r.aim+i*.09,task.dmg,580,true)}else{const x=task.kind==='ring'?r.x:task.x,y=task.kind==='ring'?r.y:task.y;r.effects.push({x,y,r:task.r,t:.5,max:.5,color:r.hero.color});for(const e of r.enemies)if(e.hp>0&&Math.hypot(e.x-x,e.y-y)<task.r){hit(e,task.dmg,true);e.stun=1.2}}}r.skillTasks=(r.skillTasks||[]).filter(t=>t.left>0);
 for(const s of r.sentries||[]){s.t-=dt;s.fire-=dt;if(s.fire<=0){const target=r.enemies.filter(e=>e.hp>0&&(r.mode!=='story'||!r.story||storyLineOfSight(r,r.x,r.y,e.x,e.y,3))).sort((a,b)=>Math.hypot(a.x-s.x,a.y-s.y)-Math.hypot(b.x-s.x,b.y-s.y))[0];if(target&&Math.hypot(target.x-s.x,target.y-s.y)<500){shoot(s.x,s.y,Math.atan2(target.y-s.y,target.x-s.x),s.dmg,520,true);s.fire=.32}}}r.sentries=(r.sentries||[]).filter(s=>s.t>0);
};
const actionBeforeAltVfx=drawHeroAction;
drawHeroAction=function(c,r){actionBeforeAltVfx(c,r);c.save();for(const f of r.skillFields||[]){c.strokeStyle=r.hero.color;c.fillStyle=r.hero.color+'22';c.lineWidth=2;c.beginPath();c.ellipse(f.x,f.y,f.r,f.r*.55,0,0,Math.PI*2);c.fill();c.stroke();for(let i=0;i<6;i++){const a=r.time+i*Math.PI/3;rect(c,f.x+Math.cos(a)*f.r*.7,f.y+Math.sin(a)*f.r*.4,4,4,r.hero.color)}}for(const task of r.skillTasks||[])if(task.kind==='impact'){c.strokeStyle=r.hero.color;c.beginPath();c.arc(task.x,task.y,task.r,0,Math.PI*2);c.stroke();c.beginPath();c.moveTo(task.x-8,task.y);c.lineTo(task.x+8,task.y);c.moveTo(task.x,task.y-8);c.lineTo(task.x,task.y+8);c.stroke()}for(const s of r.sentries||[]){drawCombatSentry(c,s,r);c.strokeStyle=r.hero.color;c.beginPath();c.arc(s.x,s.y,18,0,Math.PI*2);c.stroke()}c.restore()};
const blessings=[
 ['edge','Sharpen edge','Deal 18% more damage, up to 6× expedition starting damage.',r=>r.dmg=Math.min((r.baseDamage||r.dmg)*6,r.dmg*1.18)],
 ['heart','Second wind','Gain 35 health and heal 50.',r=>{r.maxHp+=35;r.hp=Math.min(r.maxHp,r.hp+50)}],
 ['haste','Rapid trigger','Attack 12% faster, down to a 0.08s interval.',r=>r.rate=Math.max(.08,r.rate*.88)],
 ['twin','Twin force','Add a projectile, or strengthen melee strikes.',r=>r.multi=Math.min(5,r.multi+1)],
 ['crit','Lucky strike','Gain 10% critical chance, up to 65%.',r=>r.critChance=Math.min(.65,r.critChance+.1)],
 ['pierce','Piercing light','Projectiles pass through targets.',r=>r.pierce=true],
 ['armor','Iron skin','Reduce damage by another 8%, up to 65%.',r=>r.damageReduce=Math.min(.65,r.damageReduce+.08)],
 ['speed','Fleet walk','Move 8% faster, up to 280 speed.',r=>r.speed=Math.min(280,r.speed*1.08)],
 ['regen','Embermender','Regenerate 0.6 more HP/s, up to 8.',r=>r.regen=Math.min(8,r.regen+.6)],
 ['focus','Clear mind','Reduce skill cooldown by 8%, to a 4s minimum.',r=>r.hero.cd=Math.max(4,r.hero.cd*.92)],
 ['shelter','Shelter','Heal 30% and gain a 3s shield.',r=>{r.hp=Math.min(r.maxHp,r.hp+r.maxHp*.3);r.shield=3}],
 ['resolve','Keeper’s resolve','Gain 15% damage (up to 6× starting damage) and 15 maximum health.',r=>{r.dmg=Math.min((r.baseDamage||r.dmg)*6,r.dmg*1.15);r.maxHp+=15}]
];
levelUp=function(){if(!run||run.paused)return;const r=run;r.xp-=r.xpNeed;r.level++;r.dmg=Math.min((r.baseDamage||r.dmg)*6,r.dmg*1.025);r.xpNeed=Math.floor(10+r.level*6+Math.pow(r.level,1.22));const pool=blessings.map(b=>b[0]);r.blessingChoices=[];for(let i=0;i<3;i++)r.blessingChoices.push(pool.splice(Math.floor(directorRandom(ensureDirector(r),'events')*pool.length),1)[0]);showBlessings();snapshot()};
function showBlessings(){const r=run;r.paused=true;keys.clear();pointer=null;showModal('Level '+r.level+' · Choose a blessing',r.blessingChoices.map(id=>{const b=blessings.find(b=>b[0]===id);return`<button class="choice" data-blessing="${id}"><strong>${b[1]}</strong><span>${b[2]}</span></button>`}).join(''),[],'level');$$('[data-blessing]').forEach(b=>b.onclick=()=>{const chosen=blessings.find(x=>x[0]===b.dataset.blessing);if(!chosen||!r.blessingChoices?.includes(chosen[0]))return;chosen[3](r);r.blessingChoices=null;closeModal();r.paused=false;snapshot();updateHud()})}
const originalModesUpdate=update;
update=function(dt){const r=run;if(!r||r.paused)return;originalModesUpdate(Math.min(.05,dt));if(run!==r||r.paused)return;tickObjective(r,Math.min(.05,dt));snapshotClock+=dt;if(snapshotClock>=4){snapshotClock=0;recordWave(r);snapshot()}};
const originalModesHud=updateHud;
updateHud=function(){originalModesHud();if(!run)return;const r=run;if(r.mode==='survival'){$('#wave').textContent='Survival · Phase '+(directorPhase(r.time)+1)+'/6';$('#objectiveHud').textContent='Stay alive until 3:00 · Final guardian optional · Local seeded challenge';return}$('#wave').textContent=modeNames[r.mode||chosenMode]+' · '+(r.mode==='endless'?'Total '+globalWave(r)+' · ':'')+'Wave '+r.wave+'/100';const s=skillBook[r.hero.classId].find(s=>s[0]===r.activeSkill)||skillBook[r.hero.classId][0];$('#skill span').textContent=r.skillCd>0?Math.ceil(r.skillCd)+'s':s[1];const o=r.objective;let goal='';if(o)goal=o.done?'Objective complete · reward banked':o.failed?'Beacon lost · reach the next checkpoint':o.type===0?'Shelter survivors: '+Math.floor(o.progress)+'/3 · follow the pale squares on the minimap':o.type===1?'Guard the center beacon: '+Math.floor(o.progress)+'/12s · Integrity '+Math.ceil(o.integrity)+'%':'Recover the relic: stand in its ring '+Math.floor(o.progress)+'/20s';$('#objectiveHud').innerHTML=`<strong>${chapters[r.chapter-1].name}</strong> · Section ${Math.ceil(r.wave/20)}/5 · ${r.wave%20===0?'Defeat '+bossNames[r.chapter-1][r.wave/20-1]:'Next boss: wave '+(Math.ceil(r.wave/20)*20)}<br>${goal}`};
const oldEndModes=endRun;
endRun=function(won,retreat=false){if(!run)return;const r=run;recordWave(r);if(r.mode==='survival')save.lastChallenge={seed:r.director.seed,difficulty:r.director.difficulty,chapter:r.chapter,hero:r.hero.id,seconds:Math.min(180,r.time),won:!!won,retreat:!!retreat};const checkpoint=r.mode!=='survival'&&!won&&!retreat&&validExpedition(save.checkpoint)?save.checkpoint:null;changingRun=true;save.expedition=null;save.checkpoint=null;oldEndModes(won,retreat);changingRun=false;showPage('home');persist();if(checkpoint){save.checkpoint=checkpoint;oldPersist();showModal('The flame flickers',`<p>You reached wave ${globalWave(r)}. Your earned gold is banked.</p><p>Retry from wave ${checkpoint.state.wave} of ${chapters[checkpoint.state.chapter-1].name} with the build saved at that checkpoint. Checkpoint rewards are not granted again.</p>`,[{label:'Retry checkpoint',primary:true,fn:()=>{closeModal();save.expedition=checkpoint;resumeRun(checkpoint)}},{label:'Return home',fn:()=>{closeModal();save.checkpoint=null;persist();showPage('home')}}],'defeat')}};
const modeWallet=updateWallet;
updateWallet=function(){modeWallet();if(currentPage==='camp'){const b=$('#campCollect'),a=$('#campPendingAmount');if(b)b.disabled=pendingGold()<1||!!run;if(a)a.textContent=num(pendingGold())}};
$('#about').onclick=$('#help').onclick=()=>{const active=run&&!run.paused;if(active)run.paused=true;showModal('Carry the light', '<p>Move with WASD, arrows, or drag. Attacks aim automatically. Space uses your equipped skill. Shift dashes. P pauses.</p><p>Each realm contains 100 waves. Bosses appear at 20, 40, 60, 80, and 100. Boss waves stop advancing until the boss falls. The next map has greater enemy vitality and different attack patterns.</p><p>Campaign conquers six maps. Story adds discoveries, rescue objectives and an ending choice. Endless cycles through the maps forever with increasing pressure.</p><p>Save & return from pause preserves an expedition. Continue restores its build. Purchases at camp apply to new expeditions; a resumed build keeps its current equipment. Defeat offers the latest boss checkpoint. Gold is banked as you earn it.</p><p>All ten camp tracks and all 18 skills can train to level 200. Each class equips one of three skills. Rare, epic, legendary, and mythic equipment costs 18,000; 180,000; 2,500,000; and 25,000,000 gold, with chapter gates.</p><p>Follow pale minimap squares for objectives. Gold marks show healing shrines and caches. Orange circles and enemy casting rings warn of attacks. Buildings are scenery; the map boundary limits movement.</p>',[{label:active?'Resume':'Back',primary:true,fn:()=>{closeModal();if(active&&run)run.paused=false}}],'help')};
$('#export').onclick=()=>{snapshot();const blob=new Blob([JSON.stringify(save,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Last-Lantern-save.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);toast('Save exported, including your expedition.')};
const importBeforeModes=$('#file').onchange;$('#file').onchange=async()=>{await importBeforeModes();ensureProgress();refreshHome();showPage(currentPage)};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&run){snapshot();if(!run.paused)pauseGame()}});window.addEventListener('pagehide',snapshot);window.addEventListener('beforeunload',snapshot);
// Move the existing armory into the management screen; combat gets the full width.
$('#managementContent').append($('#shop'));
$('#shop').setAttribute('role','region');
$$('[data-page]').forEach(b=>b.onclick=()=>showPage(b.dataset.page));$$('[data-mode]').forEach(b=>b.onclick=()=>prepareMode(b.dataset.mode));
$('#continueGame').onclick=()=>resumeRun();$('#newGame').onclick=()=>showPage('modes');
$('#homeScreen').style.backgroundImage=`url("${spriteData.map_5}")`;
showPage('home');

// Complete armed walking poses. Each frame is one uncut character drawing.
function walkPhase(r){return ((r.anim.strideDistance ?? r.anim.walkClock*125)/64)%1}
function walkingFrame(r){return locomotionFrame(r.anim.strideDistance??r.anim.walkClock*125)}
const beforeDistanceWalk=update;
update=function(dt){const r=run;if(!r||r.paused)return beforeDistanceWalk(dt);const x=r.x,y=r.y,dashing=r.dashTime>0;beforeDistanceWalk(dt);const distance=Math.hypot(r.x-x,r.y-y);r.anim.moving=distance>.001&&!dashing&&r.dashTime<=0;if(r.anim.moving){r.anim.strideDistance=(r.anim.strideDistance||0)+Math.min(distance,Math.max(1,r.speed*dt*1.6));r.anim.walkClock=r.anim.strideDistance/125}};
const heroBeforeWalking=drawClassHero;
drawClassHero=function(c,x,y,h,t=0,scale=1,previewWeapon=null){
 const r=c===ctx&&run&&run.hero.id===h.id?run:null,w=previewWeapon||r?.weapon,im=w&&spriteImages['walk_'+h.id+'_'+w.id];
 // Whole attack/skill/dash poses take priority; never graft a different waist onto them.
 if(!r||!im?.loaded||!r.anim.moving||r.dashTime>0||r.anim.hurtLeft>0||r.anim.skillLeft>0||r.anim.attackLeft>0||currentAction(r)){heroBeforeWalking(c,x,y,h,t,scale,previewWeapon);return}
 const flip=r.heading<0?-1:1,frame=walkingFrame(r);
 c.save();c.translate(Math.round(x),Math.round(y));c.scale(scale*artAspect*flip,scale);c.imageSmoothingEnabled=false;
 c.fillStyle='#07161b77';c.beginPath();c.ellipse(0,13,14,4,0,0,Math.PI*2);c.fill();c.drawImage(im,frame*192,0,192,160,-96,15-144,192,160);c.restore();
};

// Story terrain is a tile graph shared by rendering, collision and navigation.
const STORY_TILE=50,STORY_COLS=48,STORY_ROWS=30,storyTerrainCache=new Map();
const storyRoomBoxes=[{tx:2,ty:2},{tx:18,ty:2},{tx:34,ty:2},{tx:34,ty:19},{tx:18,ty:19},{tx:2,ty:19}].map((p,id)=>({...p,id,tw:12,th:9,x:p.tx*50,y:p.ty*50,w:600,h:450,cx:(p.tx+6)*50,cy:(p.ty+4.5)*50}));
function storyTerrain(ch){
 if(storyTerrainCache.has(ch))return storyTerrainCache.get(ch);
 const tiles=Array.from({length:STORY_ROWS},()=>Array(STORY_COLS).fill(0)),roomAt=Array.from({length:STORY_ROWS},()=>Array(STORY_COLS).fill(-1));
 const carve=(x,y,w,h,id)=>{for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++){tiles[yy][xx]=1;roomAt[yy][xx]=id}};
 for(const b of storyRoomBoxes)carve(b.tx,b.ty,b.tw,b.th,b.id);
 carve(14,6,4,3,0);carve(30,6,4,3,1);carve(39,11,3,8,2);carve(30,23,4,3,3);carve(14,23,4,3,4);
 const gates=[{index:1,x:800,y:300,w:50,h:150},{index:2,x:1600,y:300,w:50,h:150},{index:3,x:1950,y:750,w:150,h:50},{index:4,x:1600,y:1150,w:50,h:150},{index:5,x:800,y:1150,w:50,h:150}];
 const props=[];
 for(const b of storyRoomBoxes){
  const patterns=[[[3,2,2,1],[8,6,1,2],[3,6,1,1],[9,2,1,1]],[[3,2,1,2],[8,2,1,2],[3,6,2,1],[8,6,2,1]],[[2,2,2,1],[8,2,2,1],[3,6,1,2],[8,6,1,2]]],pattern=patterns[(ch+b.id)%3];
  for(const [x,y,w,h]of pattern)if(b.id)for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++)tiles[b.ty+y+yy][b.tx+x+xx]=2;
  if(b.id)for(const [n,[x,y]]of [[5,2],[6,6]].entries())props.push({id:'crate_'+b.id+'_'+n,x:(b.tx+x)*50+5,y:(b.ty+y)*50+5,w:40,h:40,room:b.id,hp:35+ch*15});
 }
 const map={chapter:ch,tiles,roomAt,rooms:storyRoomBoxes,gates,props};storyTerrainCache.set(ch,map);return map;
}
function storyGateClosed(r,g){return g.index>r.story.unlocked||(r.story.combatRoom===g.index&&r.story.rooms[g.index].fighting)}
function storyRectHit(x,y,r,b){const qx=Math.max(b.x,Math.min(b.x+b.w,x)),qy=Math.max(b.y,Math.min(b.y+b.h,y));return Math.hypot(qx-x,qy-y)<r-.001}
function storySolid(r,x,y,radius=11){
 if(r?.mode!=='story'||!r.story)return false;const m=storyTerrain(r.chapter);
 for(let ty=Math.floor((y-radius)/50);ty<=Math.floor((y+radius)/50);ty++)for(let tx=Math.floor((x-radius)/50);tx<=Math.floor((x+radius)/50);tx++){
  if(ty<0||ty>=30||tx<0||tx>=48)return true;if(m.tiles[ty][tx]!==1&&storyRectHit(x,y,radius,{x:tx*50,y:ty*50,w:50,h:50}))return true;
 }
 for(const g of m.gates)if(storyGateClosed(r,g)&&storyRectHit(x,y,radius,g))return true;
 for(const p of m.props)if(!r.story.destroyed.includes(p.id)&&storyRectHit(x,y,radius,p))return true;return false;
}
function storyFreePoint(r,room=0,near=null,radius=14){
 const b=storyRoomBoxes[room],x=near?.x??b.cx,y=near?.y??b.cy;if(!storySolid(r,x,y,radius))return{x,y};
 for(let n=1;n<12;n++)for(let i=0;i<16;i++){const a=i*Math.PI/8,px=x+Math.cos(a)*n*25,py=y+Math.sin(a)*n*25;if(px>b.x+35&&px<b.x+b.w-35&&py>b.y+35&&py<b.y+b.h-35&&!storySolid(r,px,py,radius))return{x:px,y:py}}return{x:b.cx,y:b.cy};
}
function storyConstrainMove(r,fromX,fromY,toX,toY,radius=11){
 if(r?.mode!=='story'||!r.story)return;
 const n=Math.max(1,Math.ceil(Math.hypot(toX-fromX,toY-fromY)/5)),dx=(toX-fromX)/n,dy=(toY-fromY)/n;let x=fromX,y=fromY;
 if(storySolid(r,x,y,radius)){const p=storyFreePoint(r,r.story.activeRoom,null,radius);x=p.x;y=p.y}
 for(let i=0;i<n;i++){if(!storySolid(r,x+dx,y,radius))x+=dx;if(!storySolid(r,x,y+dy,radius))y+=dy}r.x=x;r.y=y;
}
function storyMoveEnemy(r,e,from){if(r?.mode!=='story'||!r.story)return;const size=Math.min(18,Math.max(8,e.size*.65)),body={mode:'story',story:r.story,chapter:r.chapter,x:e.x,y:e.y};storyConstrainMove(body,from.x,from.y,e.x,e.y,size);e.x=body.x;e.y=body.y}
function enemyTerrainRadius(e){return Math.min(18,Math.max(8,(e.size||12)*.65))}
function constrainEnemyPosition(r,e){
 // Arrival, stun, and stationary casts still need valid map positions.
 e.x=Math.max(24,Math.min(MW-24,e.x));e.y=Math.max(24,Math.min(MH-24,e.y));
 const radius=enemyTerrainRadius(e);if(r.mode!=='story'||!r.story||!storySolid(r,e.x,e.y,radius))return;
 const room=Number.isInteger(e.storyRoom)&&e.storyRoom>=0&&e.storyRoom<storyRoomBoxes.length?e.storyRoom:r.story.combatRoom??r.story.activeRoom??0,b=storyRoomBoxes[room];
 let point=null,distance=Infinity;
 // Repair old saved enemies at the nearest free floor in their own room.
 for(let y=b.ty;y<b.ty+b.th;y++)for(let x=b.tx;x<b.tx+b.tw;x++){
  const p={x:x*STORY_TILE+STORY_TILE/2,y:y*STORY_TILE+STORY_TILE/2},d=(p.x-e.x)**2+(p.y-e.y)**2;
  if(d<distance&&!storySolid(r,p.x,p.y,radius)){point=p;distance=d;}
 }
 if(!point)return;e.x=point.x;e.y=point.y;e.cast=null;e.contactWindup=0;e.charging=0;e.spawnGrace=Math.max(e.spawnGrace||0,.35);
 if(e.boss)cancelBossSkill(e,'Repositioning');
 if(e.warden)interruptWarden(e);if(e.mimic)interruptMimic(e);if(e.brute)interruptBrute(e);if(e.runner)interruptRunner(e);if(e.stalker)interruptStalker(e);if(e.archer)interruptArcher(e);if(e.eater)interruptEater(e);
}
function displaceEnemy(r,e,dx,dy){
 if(!r||e.hp<=0)return;constrainEnemyPosition(r,e);
 const from={x:e.x,y:e.y},x=Math.max(24,Math.min(MW-24,e.x+dx)),y=Math.max(24,Math.min(MH-24,e.y+dy));
 if(r.mode==='story'&&r.story){const body={mode:r.mode,story:r.story,chapter:r.chapter,x,y};storyConstrainMove(body,from.x,from.y,x,y,enemyTerrainRadius(e));e.x=body.x;e.y=body.y;}
 else{e.x=x;e.y=y;}
}
function storyLineOfSight(r,x1,y1,x2,y2,radius=2){const n=Math.max(1,Math.ceil(Math.hypot(x2-x1,y2-y1)/5));for(let i=1;i<=n;i++)if(storySolid(r,x1+(x2-x1)*i/n,y1+(y2-y1)*i/n,radius))return false;return true}
// Preview first obstruction without changing crate HP, so actors and cover can be ordered.
function traceStoryProjectile(r,s,x1,y1){
 if(r?.mode!=='story'||!r.story)return null;const n=Math.max(1,Math.ceil(Math.hypot(s.x-x1,s.y-y1)/4)),map=storyTerrain(r.chapter),radius=COMBAT_CONFIG.terrainProjectileRadius;
 for(let i=0;i<=n;i++){const at=i/n,x=x1+(s.x-x1)*at,y=y1+(s.y-y1)*at;if(!storySolid(r,x,y,radius))continue;
  let lo=Math.max(0,(i-1)/n),hi=at;for(let j=0;j<8;j++){const mid=(lo+hi)/2;if(storySolid(r,x1+(s.x-x1)*mid,y1+(s.y-y1)*mid,radius))hi=mid;else lo=mid}
  const point={x:x1+(s.x-x1)*hi,y:y1+(s.y-y1)*hi},prop=map.props.find(p=>!r.story.destroyed.includes(p.id)&&storyRectHit(point.x,point.y,4,p));
  return {...point,fraction:hi,prop};
 }return null;
}
function commitStoryProjectileCollision(r,s,collision){
 const p=collision.prop;if(p&&!s.enemy){r.story.propDamage[p.id]=(r.story.propDamage[p.id]||0)+s.dmg;if(r.story.propDamage[p.id]>=p.hp)storyBreakCrate(r,p)}
 s.t=0;s.x=collision.x;s.y=collision.y;s.vfxCollision={x:collision.x,y:collision.y};
}
function storyProjectileCollision(r,s,x1,y1){const collision=traceStoryProjectile(r,s,x1,y1);if(!collision)return false;commitStoryProjectileCollision(r,s,collision);return true}

let storyFlow=null;
function storySteeringAngle(e,r,angle){
 if(r?.mode!=='story'||!r.story)return angle;
 if(storyLineOfSight(r,e.x,e.y,r.x,r.y,Math.min(14,e.size*.6)))return angle;
 const px=Math.floor(r.x/50),py=Math.floor(r.y/50),key=[r.chapter,px,py,r.story.unlocked,r.story.destroyed.length,r.story.activeRoom,r.story.rooms[r.story.activeRoom]?.fighting].join(':');
 if(storyFlow?.key!==key){const d=new Int16Array(48*30).fill(-1),q=[py*48+px];d[q[0]]=0;for(let h=0;h<q.length;h++){const k=q[h],x=k%48,y=Math.floor(k/48);for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy,j=yy*48+xx;if(xx<0||xx>=48||yy<0||yy>=30||d[j]>=0||storySolid(r,xx*50+25,yy*50+25,10))continue;d[j]=d[k]+1;q.push(j)}}storyFlow={key,d}}
 const x=Math.floor(e.x/50),y=Math.floor(e.y/50);let best=null,bestD=32767;for(const [dx,dy]of [[0,0],[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy;if(xx<0||xx>=48||yy<0||yy>=30)continue;const d=storyFlow.d[yy*48+xx];if(d>=0&&d<bestD&&!storySolid(r,xx*50+25,yy*50+25,Math.min(16,e.size*.6))){bestD=d;best={x:xx*50+25,y:yy*50+25}}}return best?Math.atan2(best.y-e.y,best.x-e.x):angle;
}
const storyMapPaints=new Map();
function storyWallTile(c,ch,tx,ty){
 const d=chapters[ch-1],x=tx*50,y=ty*50,woods=ch===1;
 rect(c,x,y-22,50,72,d.ground);rect(c,x+2,y-20,46,22,d.detail);rect(c,x+2,y+2,46,45,'#142326');rect(c,x+4,y+6,42,4,d.detail);rect(c,x+7,y+17,17,3,'#344341');rect(c,x+28,y+29,16,3,'#344341');rect(c,x+23,y+7,3,18,'#0d191e');rect(c,x+4,y+46,42,4,'#09151a');
 const wall=spriteImages['terrain_wall_'+ch];if(wall?.loaded){c.drawImage(wall,(tx%4)*64,(ty%2)*64,64,64,x+2,y-18,46,65);rect(c,x+2,y+43,46,6,'#08151a99');rect(c,x+3,y-20,44,3,'#c0c2ad44')}
 if(woods){rect(c,x+3,y-25,43,12,'#355344');rect(c,x+8,y-32,32,12,'#243f33');rect(c,x+4,y-17,7,12,'#53644b')}
 else if(ch===3){rect(c,x+2,y-22,46,5,'#a8c2cb');rect(c,x+9,y-14,4,13,d.accent)}
 else if(ch===2||ch===6){rect(c,x+34,y-14,3,23,d.accent);rect(c,x+27,y+9,10,3,d.accent)}
 else if(ch===5){rect(c,x+5,y-21,11,8,'#527161');rect(c,x+7,y-13,3,13,'#2b4a40')}
}
function paintStoryTerrain(ch){
 const floor=spriteImages['terrain_floor_'+ch],ready=!!floor?.loaded&&!!spriteImages['terrain_wall_'+ch]?.loaded,cached=storyMapPaints.get(ch);if(cached&&cached.storyTexturesReady===ready)return cached;const m=storyTerrain(ch),a=document.createElement('canvas');a.width=2400;a.height=1500;a.storyTexturesReady=ready;const c=a.getContext('2d'),d=chapters[ch-1];c.imageSmoothingEnabled=false;rect(c,0,0,2400,1500,'#0c191f');
 let seed=ch*871+63;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
 for(let y=0;y<30;y++)for(let x=0;x<48;x++)if(m.tiles[y][x]===1){
  const xx=x*50,yy=y*50;rect(c,xx,yy,50,50,d.ground);rect(c,xx+2,yy+2,46,46,d.detail);rect(c,xx+3,yy+3,44,2,'#87918822');rect(c,xx+3,yy+46,44,2,'#07161b55');
  if(floor?.loaded){c.drawImage(floor,(x%4)*64,(y%2)*64,64,64,xx,yy,50,50);rect(c,xx,yy,50,50,'#07161b22')}
  for(let k=0;k<10;k++)rect(c,xx+rand()*47,yy+rand()*47,2+rand()*4,2,k%3===0?d.ground:'#7f877444');
  if((x*7+y*13+ch)%9===0){rect(c,xx+21,yy+5,2,18,d.ground);rect(c,xx+16,yy+21,7,2,d.ground);rect(c,xx+15,yy+22,2,10,d.ground)}
  if(ch===1&&(x+y)%7===0){for(let k=0;k<4;k++)rect(c,xx+7+k*5,yy+36-k%2*3,2,7,'#637652');rect(c,xx+10,yy+33,4,2,'#b4814f')}
  if(ch===3&&(x*5+y)%8===0){rect(c,xx+3,yy+4,12,3,'#a8c2cb66');rect(c,xx+3,yy+7,6,3,'#a8c2cb44')}
 }
 for(let y=0;y<30;y++)for(let x=0;x<48;x++)if(m.tiles[y][x]!==1){let edge=false;for(let yy=-1;yy<=1;yy++)for(let xx=-1;xx<=1;xx++)if(m.tiles[y+yy]?.[x+xx]===1)edge=true;if(edge||m.tiles[y][x]===2)storyWallTile(c,ch,x,y)}
 for(const b of m.rooms){c.strokeStyle=d.accent+'55';c.lineWidth=3;c.strokeRect(b.x+22,b.y+22,b.w-44,b.h-44);for(const xx of [b.x+35,b.x+b.w-35])for(const yy of [b.y+45,b.y+b.h-30]){rect(c,xx-3,yy-22,6,25,'#665c45');rect(c,xx-7,yy-34,14,13,'#ca853d');rect(c,xx-3,yy-32,6,9,'#fff0b3')}}
 storyMapPaints.set(ch,a);return a;
}
function drawStoryTerrain(c,r,t){
 const m=storyTerrain(r.chapter);c.drawImage(paintStoryTerrain(r.chapter),0,0);
 for(const p of m.props)if(!r.story.destroyed.includes(p.id)){rect(c,p.x-3,p.y+5,p.w+6,p.h,'#07161b66');rect(c,p.x,p.y-12,p.w,p.h+12,'#5b412d');rect(c,p.x+3,p.y-9,p.w-6,7,'#a07843');rect(c,p.x+5,p.y+1,p.w-10,p.h-6,'#765838');rect(c,p.x+17,p.y-8,5,p.h+9,'#b38e52');rect(c,p.x+3,p.y+12,p.w-6,4,'#b38e52')}
 for(const g of m.gates)if(storyGateClosed(r,g)){c.fillStyle='#111d27';c.fillRect(g.x,g.y-20,g.w,g.h+20);c.strokeStyle=chapters[r.chapter-1].accent;c.lineWidth=3;c.strokeRect(g.x+3,g.y-17,g.w-6,g.h+14);c.fillStyle='#b8a173';if(g.w<g.h){for(let y=g.y-10;y<g.y+g.h;y+=16)c.fillRect(g.x+8,y,g.w-16,5)}else for(let x=g.x+8;x<g.x+g.w;x+=16)c.fillRect(x,g.y-12,5,g.h+4)}
 for(const room of m.rooms)if(!r.story.discovered.includes(room.id)){c.fillStyle='#07131af5';c.fillRect(room.x-12,room.y-35,room.w+24,room.h+50)}
 for(const s of r.shrines){c.save();c.translate(s.x-W/2,s.y-H/2);if(s.fuel<=0)c.globalAlpha=.25;drawLantern(c,t);c.restore()}
 for(const h of r.hazards){c.fillStyle=h.t>h.delay?'#ff934433':'#ff934499';c.strokeStyle='#ffcf91';c.beginPath();c.arc(h.x,h.y,h.radius,0,Math.PI*2);c.fill();c.stroke()}
}
function drawStoryForeground(c,r){if(r?.mode!=='story'||!r.story)return;const m=storyTerrain(r.chapter);for(let y=Math.max(0,Math.floor(r.y/50));y<=Math.min(29,Math.floor((r.y+45)/50));y++)for(let x=Math.max(0,Math.floor((r.x-90)/50));x<=Math.min(47,Math.floor((r.x+90)/50));x++)if(m.tiles[y][x]!==1&&r.y<y*50-10)storyWallTile(c,r.chapter,x,y)}

// The NPCs know different pieces of the same mystery. Their tasks open the road.
const adventureChapters=[
 {guide:'Mara',role:'The camp recorder',coat:'#67896b',hair:'#b2b8a5',places:['Lantern Outpost','The Briar Cells','The Tag Orchard','The Split Root','The Refuge Gate','The Hollow Court'],people:['Finch','Iven','Tamsin','Edda','Alder'],roles:['Lost courier','Orchard keeper','Root engineer','Refugee mother','The former keeper'],relic:'warm name tags',mechanism:'root braziers',
  welcome:'Finch came back from the woods without his sister. By morning he had forgotten he ever had one. I wrote her name down. Something has started eating the ink.',
  mission:'Bring Finch home, and find what the beacon is taking from us. I can hold this gate, but I cannot follow the names into the dark.',
  briefs:['The briars carry the voices of people who vanished. Finch is locked behind their first guardian.','Three name tags still hang in the orchard. Their owners are gone. Take the tags without feeding them to your lantern.','The root braziers are linked. Light both, and the old road will wake. So will its wardens.','Edda kept the refugee gate open after the guards forgot their orders. Clear the courtyard and hear her out.','Alder was the keeper before Brann. The hollow crown holds the quarry key. He will not surrender it quietly.'],
  reports:['My sister is called Elia. Say it again. Please. If I can hear someone else say it, I can believe she was real.','These tags were not stolen by beasts. The light pulled them from our clothes. Why would a rescue lantern need our names?','There. The roots remember the old road. They remember a man called the Witness closing it, too.','The people behind me need blankets. The gate ledger may tell us who ordered this. We can carry one thing out before the rain takes the other.','I was not a king. I was a man who stopped paying the lantern. Take the furnace key. Find out who decided the price.'],
  exit:'The furnace key opens the Cinder Quarry. Finch stays with Mara, repeating Elia’s name until the whole camp knows it.'},
 {guide:'Nell',role:'Quarry union keeper',coat:'#a6764f',hair:'#5f4232',places:['The Quiet Shift','The Chain Pens','The Ledger Store','The Twin Kilns','Workers’ Refuge','The Great Furnace'],people:['Ada','Bram','Ossa','Corin','Darr'],roles:['Furnace apprentice','Shift accountant','Kiln mechanic','Strike organizer','Last furnace master'],relic:'ledger leaves',mechanism:'kiln pressure valves',
  welcome:'Rook used to send his wages here. We kept his place on the shift list after he left. Yesterday his mother’s number was called. She has been dead for seven years.',
  mission:'The workers are prisoners now. Free Ada, recover the ledgers, and shut the furnace down before it takes another shift.',
  briefs:['Ada knows where the foremen keep the records. Break the guardian’s hold on the pens.','Three ledger leaves survived the fire. Bram will read them if you can retrieve them.','Open both pressure valves before you face the kiln wardens. The furnace has no safe emergency stop.','Corin can carry the injured out, or bring the signed orders as proof. He needs your answer.','Darr built the first lantern shells. The furnace beast guards him and the road to Frostfall.'],
  reports:['We volunteered one happy memory each. When the volunteers stopped coming, they locked the gates.','These are not fuel deliveries. They are people. The signatures stop here; after that, the ledger only has tally marks.','The valves are open. Listen. That is not steam. Those are voices from inside the furnace.','There are injured workers in the shed and testimony in the office. I promised both would leave this place. I need help choosing the first journey.','No flame in the world burns for free. I let that become an excuse. Orin’s observatory has the designs. Make him look at what we built.'],
  exit:'The furnace falls quiet. Nell nails the recovered shift numbers to its doors. Beyond the quarry, an observatory lamp burns beneath the ice.'},
 {guide:'Aster',role:'Observatory caretaker',coat:'#6b8f9e',hair:'#d6d9d1',places:['Frostfall Shelter','The Glass Ward','The Broken Archive','The Lens Engines','The Last Classroom','The Moon Observatory'],people:['Lio','Selene','Venn','Nima','Ysra'],roles:['Trapped student','Memory archivist','Lens technician','Schoolmistress','Keeper of the final page'],relic:'journal fragments',mechanism:'observatory lenses',
  welcome:'Orin asked me to burn his notes if he ever returned without recognizing me. I could not do it. He remembered every constellation and forgot the person who watched them with him.',
  mission:'Find the torn journal. The observatory’s two lenses can reveal what the six beacons are really holding.',
  briefs:['Lio followed a reflection of his father into the Glass Ward. The reflections will not let him leave.','Selene hid three fragments of Orin’s journal from the wardens. Recover them from the archive.','Align both lens engines. Their light must meet before the observatory seals will release.','Nima kept teaching through the winter. She has a room full of children and the last copy of Orin’s lecture.','Ysra guards the page Orin tore from his own research. Defeat the matriarch and ask her why he was afraid.'],
  reports:['The reflection knew my name. My real father does not. Which one am I supposed to miss?','Orin wrote that a memory is light that has learned a name. Someone decided that meant people could be stored.','Both lenses agree. The beacons are prison bars. There is an ordinary dawn trapped between them.','The children need a way through the snow. The lecture could prove what the prison is. I cannot carry both on my own.','Orin hid the release instructions from his own creation. Elia read them before the citadel took her. Find the soldiers who still remember why they serve.'],
  exit:'Aster reads the page aloud while Orin listens. The stolen dawn is real. The company follows the iron road to the citadel that keeps it locked away.'},
 {guide:'Vale',role:'Citadel deserter',coat:'#7a8492',hair:'#4f382c',places:['The Broken Watch','The Refuge Cells','The Muster Archive','The Gate Works','The Shelter Court','The Iron Keep'],people:['Pell','Neri','Gant','Miren','Hale'],roles:['Imprisoned scout','Muster clerk','Gate locksmith','Shelter medic','The general’s witness'],relic:'refugee warrants',mechanism:'gate winches',
  welcome:'Jax’s last order was to destroy the sixth beacon. He did not write it. Brann did. I deserted before I could ask why a keeper would order his own light extinguished.',
  mission:'Open the refugee route. Find the order’s original seal in the Iron Keep, before the army spends the last names it protects.',
  briefs:['Pell tried to lead families out through the drains. The watch put him in a cell instead.','Neri’s warrants show who entered the citadel. Three originals survived the purge.','Turn both winches to open the old gate works. The garrison will hear every chain.','Miren is treating families the army no longer recognizes. The command archive is burning beside her shelter.','Hale served the general when these gates were still open. The Iron Tyrant stands between you and his testimony.'],
  reports:['They said the gates would keep us safe. Nobody told us the locks were on the inside.','These families became soldiers on the same day they arrived. Their consent was signed by someone else.','The gate is open. I spent twenty years oiling these chains and never asked who they were holding.','I need hands to carry the wounded. The original commands are still in the fire. Help me decide what we bring back first.','The general was ordered to keep everyone safe until morning. When morning never came, the order never ended. Below the city, the choir remembers who gave it.'],
  exit:'The refugee gate opens from the inside. Vale takes the families to camp. Under the citadel, a drowned bell begins to ring.'},
 {guide:'Odel',role:'Keeper of the drowned bell',coat:'#727b9b',hair:'#b9b2ac',places:['The Dry Chapel','The Bell Vault','The Name Crypt','The Water Locks','The Choir Shelter','The Sunken Abbey'],people:['Ren','Sable','Teven','Lysa','Ansel'],roles:['Lost bell diver','Grave archivist','Waterlock keeper','Choir attendant','The abbot’s last pupil'],relic:'engraved name stones',mechanism:'waterlock wheels',
  welcome:'Sera hears prayers where the rest of us hear water. I hear introductions. The dead have been saying their names for so long they are afraid to stop.',
  mission:'Lower the water, restore the choir’s names, and recover the order Brann left beneath the abbey.',
  briefs:['Ren went down after the school bell. The vault closed above him.','Sable has three name stones that the water has not worn smooth. Bring them back to the choir.','Turn both waterlock wheels. The abbey doors will not open while the lower nave is flooded.','Lysa is sheltering the last living singers. Their name book lies beyond the rising water.','Ansel heard Brann confess before he surrendered his own memories. The Grave Cantor holds the confession in its throat.'],
  reports:['I heard children laughing when the bell moved. Not ghosts. A memory that still belonged to someone.','Write the names exactly. Forgiveness is not forgetting, and remembrance is not another kind of fuel.','The water is falling. There are footprints under it, all leading toward the sixth beacon.','The singers can still be led out. Their book may not survive another flood. Tell me which journey you will make with me.','Brann signed the order himself. He tried to stop the sixth beacon, then paid with the memory of why. This time, let him arrive with witnesses.'],
  exit:'The choir sings one name for every returned stone. Brann remembers the order and the fear behind it. The last road leads to the Obsidian Throne.'},
 {guide:'Vesper',role:'The Sovereign’s messenger',coat:'#976879',hair:'#ddd2bc',places:['The Last Encampment','The Oath Cells','The Promise Archive','The Beacon Engines','The Witness Court','The First Flame'],people:['Ash','Cerys','Toll','Mara','The First Flame'],roles:['Forgotten keeper','Archivist of promises','Beacon tender','The camp recorder','A stolen ordinary dawn'],relic:'broken oath seals',mechanism:'beacon conduits',
  welcome:'The Sovereign knows you are coming. It has kept Brann’s first promise polished all these years: everyone safe until morning. It has never asked whether anyone wanted an endless night.',
  mission:'Bring your witnesses to the throne. Open the engines. At the last light, make a choice the people of the camp can remember.',
  briefs:['Ash was meant to become the next keeper. Free them from a promise they never made.','Cerys keeps the oaths used to justify the prison. Three broken seals can open her archive.','Release both beacon conduits. What is caged inside is light, not a god.','Mara has brought Elia and the journal to the witness court. The camp’s last refugees are still outside its failing walls.','The first flame remembers being sunlight. Defeat the Sovereign and hear what the dawn wants for itself.'],
  reports:['I thought being chosen meant being wanted. I was only supposed to be the next person who could forget the cost.','Every cruel order in this archive began with the word protection. People kept adding reasons after they had stopped asking permission.','The conduits are open. The beacons are shaking. They were never meant to hold a dawn this long.','I brought every name we kept. My original register is inside; the last refugees are outside. I will answer for what I signed. Help me choose our first journey.','I am not a throne. I am not a debt. I was light on an ordinary windowsill before anyone thought to own the morning. Let the people choose what they can live with.'],
  exit:'The road ends at the first flame. The camp waits for a sunrise that will belong to its people, or to the promise that consumed their names.'}
];
const storyRoutes=[
 {
  "care": "Finch and Edda’s children reach the quarry shelter together. Finch teaches them Elia’s song, keeping her name alive while the gate ledger dissolves in the rain.",
  "proof": "The gate ledger survives. Nell recognizes its transport seal and posts a warning before the next collection. Edda reaches camp later with cold, exhausted children; she asks you to remember who waited."
 },
 {
  "care": "Corin’s injured workers reach Frostfall alive and build sleds for Nima’s pupils. The signed furnace orders burn; their account now depends on people willing to testify.",
  "proof": "The signed orders reach Aster and expose the quotas. Corin brings the injured along the slower road. Some need care for burns that the delay made worse."
 },
 {
  "care": "Nima’s children cross the snow together. One recognizes a star from Orin’s lecture and draws it on the camp tent. The lecture itself is lost to the ice.",
  "proof": "Orin’s lecture gives the deserters a reason to challenge the beacons. Nima stays behind until every pupil can travel; the company reaches the citadel ahead of them."
 },
 {
  "care": "Miren and the wounded cross the open gate before the archive collapses. Jax helps carry the last stretcher. The original commands are lost, leaving the survivors to give their own account.",
  "proof": "The original commands prove how the refugee army was made. Miren stays with the wounded while Vale finds another route; she will remember the hours spent waiting."
 },
 {
  "care": "Lysa leads the living singers out before the water rises. Their name book sinks. Each carries a different verse, and they begin piecing it together on the road.",
  "proof": "The choir’s name book reaches the throne dry. Lysa brings the singers by the upper passage after a long night in the cold. The names survive because someone waited with the living."
 },
 {
  "care": "Mara brings the last refugees inside the witness court. Her sealed register is destroyed when the outer chamber falls. She gives her confession in person, where the people it concerns can answer.",
  "proof": "Mara’s original register survives with its unaltered signatures. She returns for the refugees as the court collapses; their arrival is late, and their questions harder to answer."
 }
];
const storyHeroVoices={"brann":"I cannot promise the road will be safe. I can promise I will hear you before I choose.","nyx":"My brother used to mark a trail with three cuts in the bark. If someone is still following, I will leave them a way home.","orin":"Write down what I say. Especially when I ask you to forget it.","rook":"I know how to break a locked door. After that, someone has to help the people behind it stand.","sera":"Let them tell us where it hurts before we decide how to heal it.","jax":"I have followed enough orders without asking who paid for them. This time I want names."};
const storyTraderLines=["Finch tried to buy a second bowl with a button. I accepted. Terrible business, feeding people.","The workers paid me in shift tokens. I am keeping them until there is a shift worth coming back for.","Aster asked whether I remembered Orin smiling. I do. I told her. Some things should be given away.","A soldier searched my cart for contraband. Found six blankets. I told him they were six very small rebellions.","Mara offered me her wedding ring for passage. I gave it back. She has enough left to lose.","I have kept one empty seat on the cart all this way. Tell Finch his sister can have the window."];
function storyChoiceEcho(ch,choice){return storyRoutes[ch-1]?.[choice]||""}
function adventureNpc(r,stage){const d=adventureChapters[r.chapter-1],b=storyRoomBoxes[stage],isGuide=stage===0,pos=storyFreePoint(r,stage,{x:isGuide?b.cx-120:b.cx+135,y:isGuide?b.cy-35:b.cy+85},15);return{id:'npc_'+stage,stage,name:isGuide?d.guide:d.people[stage-1],role:isGuide?d.role:d.roles[stage-1],coat:isGuide?d.coat:['#8c7049','#68886a','#6f8c9c','#b39b6a','#8b749f'][stage-1],hair:isGuide?d.hair:['#694a31','#b5aca0','#493b35','#5c4237','#a5a8ac'][stage-1],...pos}}
function storyEsc(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function drawAdventureNpc(c,n,t=0,scale=1){c.save();c.translate(n.x,n.y);c.scale(scale,scale);const bob=Math.sin(t*2+n.stage)*.5;c.fillStyle='#07161b77';c.beginPath();c.ellipse(0,9,14,4,0,0,Math.PI*2);c.fill();c.translate(0,bob);rect(c,-10,-4,8,14,'#443b36');rect(c,3,-4,8,14,'#443b36');rect(c,-11,7,11,4,'#ad8d61');rect(c,3,7,11,4,'#ad8d61');rect(c,-13,-35,27,33,n.coat);rect(c,-10,-32,21,28,n.coat);rect(c,-11,-13,24,4,'#5b4430');rect(c,-2,-14,6,6,'#d3b573');rect(c,-18,-31,7,21,n.coat);rect(c,12,-31,7,21,n.coat);rect(c,-18,-12,7,8,'#d5b588');rect(c,12,-12,7,8,'#d5b588');rect(c,-9,-54,20,22,'#d5b588');rect(c,-10,-57,22,8,n.hair);rect(c,-11,-52,5,12,n.hair);rect(c,8,-51,5,7,n.hair);rect(c,-4,-44,3,3,'#15262c');rect(c,5,-44,3,3,'#15262c');rect(c,0,-36,5,2,'#8b674d');rect(c,-7,-34,15,5,'#d6caae');if(n.stage===0){rect(c,-13,-59,28,5,n.coat);rect(c,-9,-67,20,9,n.coat);rect(c,-7,-65,16,2,'#bba175')}else if(n.stage===1){rect(c,-7,-28,15,17,'#c0a677');rect(c,-4,-25,8,11,'#725e41')}else if(n.stage===3){rect(c,17,-32,4,26,'#b1bbc0');rect(c,14,-36,10,8,'#7e9396')}c.restore()}
const placeholderAdventureNpc=drawAdventureNpc;
drawAdventureNpc=function(c,n,t=0,scale=1){const id='npc_'+(n.kind==='merchant'?5:n.stage),im=spriteImages[id];if(!im?.loaded){placeholderAdventureNpc(c,n,t,scale);return}const height=66,width=height*im.naturalWidth/im.naturalHeight;c.save();c.translate(n.x,n.y);c.scale(scale*(c===ctx?artAspect:1),scale);c.imageSmoothingEnabled=false;c.fillStyle='#07161b77';c.beginPath();c.ellipse(0,9,13,4,0,0,Math.PI*2);c.fill();c.drawImage(im,-width/2,10-height-Math.sin(t*2+n.stage)*.35,width,height);c.restore()};
const adventurePortraits=new Map();
function adventurePortrait(n){const k=n.name+n.coat;if(adventurePortraits.has(k))return adventurePortraits.get(k);const a=document.createElement('canvas');a.width=100;a.height=120;const c=a.getContext('2d');c.imageSmoothingEnabled=false;drawAdventureNpc(c,{...n,x:50,y:103},0,1.4);const uri=a.toDataURL();adventurePortraits.set(k,uri);return uri}

function initAdventure(r,migrate=false){
 const completed=migrate?Math.min(5,Math.floor((r.wave-1)/20)+(r.wave%20===0&&r.chapterDone?1:0)):0,stage=migrate?Math.ceil(r.wave/20):0;
 r.mode='story';r.story={version:1,chapter:r.chapter,unlocked:migrate?Math.min(5,completed+1):0,activeRoom:migrate?stage:0,combatRoom:0,discovered:migrate?Array.from({length:stage+1},(_,i)=>i):[0],destroyed:[],propDamage:{},relics:[],switches:[],dialog:null,merchantUsed:false,introSeen:migrate,rooms:Array.from({length:6},(_,i)=>({entered:i===0||migrate&&i<=stage,briefed:i===0||migrate&&i<=stage,cleared:i===0||i<=completed,reported:i===0||i<=completed,fighting:false,waveSpawned:0}))};
 r.storyChoices=r.storyChoices||{};r.objective=null;r.shrines=[{x:400,y:350,fuel:20}];r.caches=[];r.enemies=[];r.shots=[];r.pendingBreak=null;r.pendingChapter=false;r.pendingStory=null;r.action=null;r.skillPending=null;
 const p=storyFreePoint(r,migrate?stage:0,{x:storyRoomBoxes[migrate?stage:0].cx,y:storyRoomBoxes[migrate?stage:0].cy+110});r.x=p.x;r.y=p.y;
 if(migrate&&!r.story.rooms[stage].cleared&&stage>0){r.story.combatRoom=stage;r.story.rooms[stage].fighting=true}
}
const expeditionBeforeAdventure=validExpedition;
validExpedition=function(data){if(!expeditionBeforeAdventure(data))return false;const s=data.state.story;if(data.mode!=='story'||!s)return true;
 const index=n=>Number.isInteger(n)&&n>=0&&n<=5,unique=a=>Array.isArray(a)&&new Set(a).size===a.length;
 if(s.version!==1||s.chapter!==data.state.chapter||!index(s.unlocked)||!index(s.activeRoom)||!index(s.combatRoom)||!Array.isArray(s.rooms)||s.rooms.length!==6)return false;
 if(!unique(s.discovered)||!s.discovered.every(index)||!s.discovered.includes(0)||!unique(s.destroyed)||s.destroyed.some(id=>!/^crate_[1-5]_[01]$/.test(id)))return false;
 if(!unique(s.relics)||s.relics.some(id=>!/^relic_2_[012]$/.test(id))||!unique(s.switches)||s.switches.some(id=>!/^switch_3_[01]$/.test(id)))return false;
 if(s.rooms.some(o=>!o||['entered','briefed','cleared','reported','fighting'].some(k=>typeof o[k]!=='boolean')||!Number.isInteger(o.waveSpawned)||o.waveSpawned<0||o.waveSpawned>100||o.reported&&!o.cleared)||s.rooms.filter(o=>o.fighting).length>1)return false;
 if(s.rooms.some(o=>o.fighting)&&!s.rooms[s.combatRoom].fighting)return false;
 if(s.dialog&&(!['intro','guide','brief','report','repeat','merchant'].includes(s.dialog.kind)||!index(s.dialog.stage)||!Number.isInteger(s.dialog.page)||s.dialog.page<0||s.dialog.page>5))return false;
 return !!s.propDamage&&typeof s.propDamage==='object'&&Object.entries(s.propDamage).every(([k,v])=>/^crate_[1-5]_[01]$/.test(k)&&Number.isFinite(v)&&v>=0);
};
const setupBeforeAdventure=setupChapter;
setupChapter=function(r){setupBeforeAdventure(r);if((r.mode||chosenMode)==='story')initAdventure(r)};
const objectiveBeforeAdventure=setSectionObjective;
setSectionObjective=function(r){if((r.mode||chosenMode)==='story'){r.objective=null;return}objectiveBeforeAdventure(r)};
const worldBeforeAdventure=drawWorld;
drawWorld=function(c,r,t){if(r.mode==='story'&&r.story){drawStoryTerrain(c,r,t);drawStoryObjects(c,r,t);return}worldBeforeAdventure(c,r,t)};
function storyBreakCrate(r,p){if(r.story.destroyed.includes(p.id))return;r.story.destroyed.push(p.id);storyFlow=null;const gold=2*r.chapter;save.gold+=gold;r.gold+=gold;textPop(p.x+20,p.y,'+'+gold+' gold','#ffc76b');for(let i=0;i<7;i++)r.particles.push({x:p.x+20,y:p.y+15,vx:(Math.random()-.5)*80,vy:-Math.random()*70,t:.5,color:'#a07843'});snapshot();updateWallet()}
function storyQuestPoints(r,stage){const b=storyRoomBoxes[stage],offsets=stage===2?[[-180,-100],[160,-100],[-140,130]]:[[-175,115],[175,-85]];return offsets.map(([x,y],i)=>({...storyFreePoint(r,stage,{x:b.cx+x,y:b.cy+y}),id:(stage===2?'relic_':'switch_')+stage+'_'+i,stage,kind:stage===2?'relic':'switch'}))}
function storyTargets(r){
 if(r?.mode!=='story'||!r.story)return[];const s=r.story,targets=[];
 for(const stage of s.discovered){const n=adventureNpc(r,stage);targets.push({...n,kind:'npc',label:'Talk to '+n.name})}
 targets.push({id:'merchant',kind:'merchant',stage:0,x:550,y:425,name:'Nox',role:'Road trader',coat:'#8b749f',hair:'#69513b',label:'Trade with Nox'});
 if(s.discovered.includes(2)&&s.rooms[2].briefed)for(const p of storyQuestPoints(r,2))if(!s.relics.includes(p.id))targets.push({...p,label:'Collect '+adventureChapters[r.chapter-1].relic});
 if(s.discovered.includes(3)&&s.rooms[3].briefed)for(const p of storyQuestPoints(r,3))if(!s.switches.includes(p.id))targets.push({...p,label:'Activate '+adventureChapters[r.chapter-1].mechanism});
 if(s.rooms[5].reported)targets.push({id:'chapter_exit',kind:'exit',stage:5,...storyFreePoint(r,5,{x:280,y:1275},15),label:r.chapter===6?'Approach the first flame':'Travel to '+chapters[r.chapter].name});
 for(const p of storyTerrain(r.chapter).props)if(s.discovered.includes(p.room)&&!s.destroyed.includes(p.id))targets.push({...p,kind:'crate',x:p.x+20,y:p.y+20,label:'Break supply crate'});
 return targets;
}
function nearestStoryTarget(r){return storyTargets(r).map(o=>({...o,distance:Math.hypot(r.x-o.x,r.y-o.y)})).filter(o=>{const cut=o.kind==='crate'?Math.min(.9,30/Math.max(1,o.distance)):0;return o.distance<85&&storyLineOfSight(r,r.x,r.y,o.x+(r.x-o.x)*cut,o.y+(r.y-o.y)*cut,1)}).sort((a,b)=>a.distance-b.distance)[0]||null}
function storyRemember(ch,beat){const id=ch+':'+beat;if(!save.journal.includes(id))save.journal.push(id)}
function storyDialogueLines(r,d){const ch=adventureChapters[r.chapter-1],npc=d.kind==='merchant'?{name:'Nox',role:'Road trader',coat:'#8b749f',hair:'#69513b',stage:0,kind:'merchant'}:adventureNpc(r,d.stage||0),say=text=>({speaker:npc.name,text});
 if(d.kind==='intro'){const prior=r.storyChoices?.[r.chapter-1],echo=storyChoiceEcho(r.chapter-1,prior); return{npc,lines:[say(ch.welcome+(echo?' '+echo:'')),{speaker:'The keeper’s journal',text:storyActs[r.chapter-1].intro},{speaker:r.hero.name,text:storyHeroVoices[r.hero.id]},say('Find me beside the camp lantern when you are ready. '+ch.mission)]}}
 if(d.kind==='guide')return{npc,lines:[say(ch.mission),say('The road has five guarded districts. Speak to the people you find. A cleared room alone will not tell you where to go next. We need witnesses, names, and a way to open each gate.')]};
 if(d.kind==='brief')return{npc,lines:[say(ch.briefs[d.stage-1]),say(d.stage===2?'Keep all three fragments. We will need them after the guardian falls.':d.stage===3?'Activate both mechanisms before the guardians arrive. The route will seal during the fight.':'The moment you accept, the warding gate will seal behind you. Defeat the waves and their guardian, then return to me.')]};
 if(d.kind==='report')return{npc,lines:[say(ch.reports[d.stage-1]),{speaker:'The keeper’s journal',text:storyActs[r.chapter-1].beats[d.stage-1]},say(d.stage===5?ch.exit:d.stage===4?'We can make one journey before the route closes. Choose our first priority. Both paths leave people with work still to do.':'I have opened the next warding gate. Carry this name with you.')]};
 if(d.kind==='merchant')return{npc,lines:[say(storyTraderLines[r.chapter-1]),say(r.story.merchantUsed?'That was my last dressing. I will meet you on the next road.':'I have one field dressing for this stretch of road. '+(120*r.chapter)+' gold restores 40% of your health. I cannot trade during a fight.')]};
 return{npc,lines:[say(d.stage===0?'Follow the open gates. Speak to each witness before leaving their district.':r.story.rooms[d.stage].reported?'The next gate is open. Keep moving.':d.stage===2&&r.story.relics.length<3?'The guardian is gone, but we still need all three fragments. Look for the pale diamonds on your map.':d.stage===3&&r.story.switches.length<2?'The two mechanisms must both be active. Look for the brass wheels on your map.':'Defeat the guardian, then return. I will stay here.')]};
}
function renderStoryDialogue(){
 const r=run,d=r?.story?.dialog;if(!d)return;const {npc,lines}=storyDialogueLines(r,d),line=lines[Math.min(d.page,lines.length-1)];r.paused=true;keys.clear();pointer=null;
 const actions=[];if(d.page<lines.length-1)actions.push({label:'Continue',primary:true,fn:()=>{d.page++;snapshot();renderStoryDialogue()}});
 else if(d.kind==='report'&&d.stage===4)actions.push({label:'Carry the people to safety',primary:true,fn:()=>finishStoryDialogue('care')},{label:'Recover the proof first',fn:()=>finishStoryDialogue('proof')});
 else if(d.kind==='merchant'&&!r.story.merchantUsed)actions.push({label:'Buy dressing · '+(120*r.chapter)+' gold',primary:true,fn:()=>{if(save.gold<120*r.chapter){toast('Not enough gold.');return}if(r.hp>=r.maxHp){toast('Your health is already full.');return}save.gold-=120*r.chapter;r.hp=Math.min(r.maxHp,r.hp+r.maxHp*.4);r.story.merchantUsed=true;finishStoryDialogue()}});
 else actions.push({label:d.kind==='brief'?'Accept objective':d.kind==='guide'?'Open the first gate':d.kind==='intro'?'Enter the outpost':d.kind==='report'?'Carry the memory':'Back to the road',primary:true,fn:()=>finishStoryDialogue()});
 if(d.kind==='merchant')actions.push({label:'Back',fn:()=>finishStoryDialogue()});
 actions.push({label:'Save & return',fn:leaveToHome});
 showModal(line.speaker,`<div class="story-conversation"><img src="${heroes.some(h=>h.name===line.speaker)?spriteData[heroes.find(h=>h.name===line.speaker).id]:adventurePortrait(npc)}" alt="${storyEsc(line.speaker)}"><div><p class="story-speaker-role">${storyEsc(npc.role)} · ${d.page+1}/${lines.length}</p><p class="story-spoken">${storyEsc(line.text)}</p>${d.kind==='report'&&d.stage===4&&d.page===lines.length-1?'<p class="small muted">People first: restore 30% health and gain 3% damage reduction, up to the limit. Proof first: gain 5% attack damage, up to the limit. Your decision is remembered on the road.</p>':''}</div></div>`,actions,'npc-dialog');
}
function beginStoryDialogue(kind,stage=0){if(!run?.story)return;run.story.dialog={kind,stage,page:0};run.pendingStory=null;run.paused=true;snapshot();renderStoryDialogue()}
function finishStoryDialogue(choice=null){
 const r=run,d=r?.story?.dialog;if(!d)return;const s=r.story,room=s.rooms[d.stage];
 if(d.kind==='intro'){s.introSeen=true;storyRemember(r.chapter,0)}
 if(d.kind==='guide'){s.unlocked=Math.max(s.unlocked,1);storyRemember(r.chapter,0);save.checkpoint=packRun(r);banner('First gate opened · Find '+adventureNpc(r,1).name)}
 if(d.kind==='brief'&&!room.briefed){room.briefed=true;if(d.stage!==3)startStoryEncounter(r,d.stage);else banner('Activate both '+adventureChapters[r.chapter-1].mechanism)}
 if(d.kind==='report'&&!room.reported){room.reported=true;storyRemember(r.chapter,d.stage);if(d.stage===1)r.storyRescues=(r.storyRescues||0)+1;
  if(d.stage===4){r.storyChoices[r.chapter]=choice||'care';save.storyDecisions={...(save.storyDecisions||{}),[r.chapter]:choice||'care'};if(choice==='proof')r.dmg=Math.min((r.baseDamage||r.dmg)*6,r.dmg*1.05);else{r.hp=Math.min(r.maxHp,r.hp+r.maxHp*.3);r.damageReduce=Math.min(.65,(r.damageReduce||0)+.03)}}
  s.unlocked=Math.min(5,Math.max(s.unlocked,d.stage+1));const gold=250*r.chapter*d.stage;save.gold+=gold;r.gold+=gold;save.checkpoint=packRun(r);banner(d.stage===5?'The chapter exit is open':'Warding gate opened · '+adventureChapters[r.chapter-1].places[d.stage+1]);
 }
 s.dialog=null;closeModal();r.paused=false;keys.clear();pointer=null;snapshot();updateHud();updateWallet();canvas.focus({preventScroll:true});
}
function startStoryEncounter(r,stage){
 const s=r.story,room=s.rooms[stage];if(room.cleared||room.fighting)return;s.activeRoom=stage;s.combatRoom=stage;room.fighting=true;room.waveSpawned=0;r.wave=(stage-1)*20+1;r.waveTime=0;r.chapterDone=false;r.bossDead=false;r.bossSpawned=false;r.bossPhase2=false;r.enemies=[];r.shots=[];r.hazards=[];r.spawn=0;r.invuln=1.5;storyFlow=null;save.checkpoint=packRun(r);recordWave(r);snapshot();banner('District sealed · Wave '+r.wave+'/100');
}
function storyInteract(){
 const r=run;if(!r||r.mode!=='story'||r.paused||!r.story)return;const o=nearestStoryTarget(r);if(!o){toast('Move closer to a person or marked object.');return}const room=r.story.rooms[o.stage];
 if(o.kind==='crate'){const p=storyTerrain(r.chapter).props.find(p=>p.id===o.id);storyBreakCrate(r,p);return}
 if(o.kind==='npc'){
  if(o.stage===0){beginStoryDialogue(r.story.unlocked?'repeat':'guide',0);return}
  if(room.fighting){toast('Clear the district before talking.');return}
  if(!room.briefed){beginStoryDialogue('brief',o.stage);return}
  if(room.cleared&&!room.reported&&(o.stage!==2||r.story.relics.length===3)){beginStoryDialogue('report',o.stage);return}
  beginStoryDialogue('repeat',o.stage);return;
 }
 if(o.kind==='merchant'){if(r.story.rooms.some(x=>x.fighting)){toast('Nox waits until the fighting stops.');return}beginStoryDialogue('merchant');return}
 if(o.kind==='relic'){if(!r.story.relics.includes(o.id)){r.story.relics.push(o.id);textPop(o.x,o.y,'Memory kept · '+r.story.relics.length+'/3','#fff0cd');snapshot()}return}
 if(o.kind==='switch'){if(!r.story.switches.includes(o.id)){r.story.switches.push(o.id);textPop(o.x,o.y,'Mechanism '+r.story.switches.length+'/2','#ffc76b');if(r.story.switches.length===2)startStoryEncounter(r,3);snapshot()}return}
 if(o.kind==='exit')travelStoryChapter(r);
}
const spawnBeforeAdventure=spawnEnemy;
spawnEnemy=function(boss=false,type,options={}){const r=run;if(r?.mode==='story'&&r.story&&(!r.story.combatRoom||!r.story.rooms[r.story.combatRoom].fighting))return null;return spawnBeforeAdventure(boss,type,options)};

const wavesBeforeAdventure=advanceWaves;
advanceWaves=function(r,dt){
 if(r.mode!=='story'||!r.story){wavesBeforeAdventure(r,dt);return}if(r.paused)return;const s=r.story,room=s.rooms[s.combatRoom];if(!room?.fighting)return;
 const pressure=difficultyProfile(r);
 if(room.waveSpawned!==r.wave){
  r.waveTime=0;const director=ensureDirector(r),key=r.chapter+':'+r.wave+':'+r.cycle;if(director.retry.key!==key)director.retry={key,left:0};director.retry.left=Math.max(0,director.retry.left-dt);if(director.retry.left>0)return;
  const boss=r.wave%20===0,n=boss?pressure.escorts:pressure.storyCount;
  if(boss){r.bossTier=r.wave/20;if(!spawnEnemy(true,undefined,{arrival:true})){director.retry.left=.5;return}r.bossSpawned=true;r.bossDead=false;banner(bossNames[r.chapter-1][r.bossTier-1])}
  const result=spawnDirectorBatch(r,n,true);if(!boss&&!result.spawned){director.retry.left=.5;return}
  room.waveSpawned=r.wave;r.spawn=boss?pressure.storyReinforce:0;
  if(!boss&&r.wave%5===0){promoteWaveElite(r.enemies.find(e=>e.hp>0&&!e.boss&&!e.archetype),r);banner('Wave '+r.wave+'/100 · Elite hunt')}snapshot();return;
 }

 if(r.wave%20===0){r.waveTime=0;r.spawn-=dt;if(r.spawn<=0&&r.enemies.some(e=>e.boss&&e.hp>0)){const cap=pressure.escorts+3;let alive=r.enemies.filter(e=>!e.boss&&e.hp>0).length;spawnDirectorBatch(r,Math.max(0,Math.min(pressure.bossBatch,cap-alive)),true);r.spawn=pressure.storyReinforce}return}
 if(r.enemies.some(e=>e.hp>0)){r.waveTime=0;return}r.waveTime+=dt;if(r.waveTime<.85)return;r.wave++;r.waveTime=0;const gold=20*r.chapter;save.gold+=gold;r.gold+=gold;recordWave(r);snapshot();updateWallet();
};
const resolveBeforeAdventure=resolveBoss;
resolveBoss=function(r){
 if(r.mode!=='story'||!r.story){resolveBeforeAdventure(r);return}if(!r.bossDead||r.chapterDone||r.wave%20!==0)return;
 const stage=r.wave/20,room=r.story.rooms[stage],key=r.chapter+':'+r.wave+':'+r.cycle;r.bossDead=false;r.chapterDone=true;r.bossSpawned=false;room.fighting=false;room.cleared=true;r.story.combatRoom=0;r.enemies=[];r.shots=[];r.hazards=[];r.burnZones=[];r.hp=Math.min(r.maxHp,r.hp+r.maxHp*.25);r.skillCd=0;r.dashCd=0;
 if(!r.bossesCleared.includes(key)){r.bossesCleared.push(key);const gold=1000*r.chapter*stage;save.gold+=gold;r.gold+=gold}recordWave(r);snapshot();updateHud();banner('District cleared · Speak to '+adventureNpc(r,stage).name);
};
function travelStoryChapter(r){
 if(!r.story.rooms[5].reported||r.story.rooms.some(x=>x.fighting))return;if(r.chapter===6){r.pendingEnding=true;showEnding(r);return}
 const old=r.chapter;save.chapterUnlocked=Math.max(save.chapterUnlocked,r.chapter+1);const gold=2500*old*old;save.gold+=gold;r.gold+=gold;r.chapter++;r.hp=Math.min(r.maxHp,r.hp+r.maxHp*.35);setupChapter(r);r.paused=false;save.checkpoint=packRun(r);snapshot();beginStoryDialogue('intro');updateHud();
}
const finishBeforeAdventure=finishChapter;
finishChapter=function(r){if(r.mode==='story'&&r.story){resolveBoss(r);return}finishBeforeAdventure(r)};
const openBeforeAdventure=openStory;
openStory=function(ch,beat,after){if(run?.mode==='story'&&run.story){beginStoryDialogue(beat?'report':'intro',beat||0);return}openBeforeAdventure(ch,beat,after)};
const resumeBeforeAdventure=resumeRun;
resumeRun=function(data=save.expedition){
 if(data?.mode==='story'&&validExpedition(data)&&!data.state.story){data=JSON.parse(JSON.stringify(data));initAdventure(data.state,true);save.expedition=data;toast('Story expedition upgraded to the new explorable maps.')}
 const okay=resumeBeforeAdventure(data);if(okay&&run?.mode==='story'){if(!run.story)initAdventure(run,true);if(storySolid(run,run.x,run.y,11)){const p=storyFreePoint(run,run.story.activeRoom);run.x=p.x;run.y=p.y}if(run.story.dialog)renderStoryDialogue();updateHud()}return okay;
};$('#continueGame').onclick=()=>resumeRun();
function tickAdventure(r){
 if(r.mode!=='story'||!r.story)return;const s=r.story;
 for(const b of storyRoomBoxes)if(r.x>b.x+50&&r.x<b.x+b.w-50&&r.y>b.y+50&&r.y<b.y+b.h-50){s.activeRoom=b.id;if(!s.discovered.includes(b.id)){s.discovered.push(b.id);s.rooms[b.id].entered=true;if(b.id&&!s.rooms[b.id].briefed){r.wave=(b.id-1)*20+1;r.chapterDone=false;banner(adventureChapters[r.chapter-1].places[b.id]+' · Find '+adventureNpc(r,b.id).name)}snapshot()}break}
 const target=nearestStoryTarget(r);$('#storyInteract').disabled=!target||r.paused;$('#storyInteract').textContent=target?'E · '+target.label:'E · Move near a person or object';
}
const updateBeforeAdventure=update;
update=function(dt){const r=run;updateBeforeAdventure(dt);if(run===r&&r&&!r.paused)tickAdventure(r)};
function storyGoal(r){const s=r.story,d=adventureChapters[r.chapter-1];if(!s.unlocked)return'Talk to '+d.guide+' beside the camp lantern. Press E when close.';const stage=Math.min(5,s.unlocked),room=s.rooms[stage],n=adventureNpc(r,stage);if(room.reported&&stage===5)return'Find the glowing exit in '+d.places[5]+'. Press E to continue the journey.';if(!s.discovered.includes(stage))return'Follow the open gate to '+d.places[stage]+'. Find '+n.name+'.';if(!room.briefed)return'Talk to '+n.name+' to accept this district’s objective.';if(stage===3&&s.switches.length<2)return'Activate both '+d.mechanism+' ('+s.switches.length+'/2). Press E beside each wheel.';if(room.fighting)return'Defeat the district’s enemies. Guardian at wave '+stage*20+'. Remaining: '+r.enemies.filter(e=>e.hp>0).length+'.';if(stage===2&&s.relics.length<3)return'Recover the three '+d.relic+' ('+s.relics.length+'/3), then speak to '+n.name+'.';return'Return to '+n.name+' and carry the memory. The next gate opens after your conversation.'}
const hudBeforeAdventure=updateHud;
updateHud=function(){hudBeforeAdventure();if(run?.mode!=='story'||!run.story)return;const r=run,d=adventureChapters[r.chapter-1];$('#wave').textContent='Story · Act '+r.chapter+' · Wave '+r.wave+'/100';$('#objectiveHud').innerHTML=`<strong>${storyEsc(d.places[r.story.activeRoom])}</strong> · ${storyEsc(storyActs[r.chapter-1].title)}<br>${storyEsc(storyGoal(r))}`;$('#adventureControls').classList.toggle('hidden',currentPage!=='battle');};
const pageBeforeAdventure=showPage;
showPage=function(page){pageBeforeAdventure(page);$('#adventureControls').classList.toggle('hidden',page!=='battle'||run?.mode!=='story')};
const homeBeforeAdventure=refreshHome;
refreshHome=function(){homeBeforeAdventure();const e=save.expedition;if(e?.mode==='story'&&e.state.story){const d=adventureChapters[e.state.chapter-1];$('#continueSummary').textContent='Story · Act '+e.state.chapter+' · '+d.places[e.state.story.activeRoom]+' · Wave '+e.state.wave+'/100'}$('#recordStory').textContent=save.storyComplete?'Story completed · '+(save.ending==='release'?'The remembered dawn':'The gilded dawn'):'Six chapters · NPC quests · '+(save.journal?.length||0)+' memories kept'};
function drawStoryObjects(c,r,t){
 const s=r.story;for(const o of storyTargets(r)){
  if(o.kind==='relic'){c.fillStyle='#addad7';c.beginPath();c.moveTo(o.x,o.y-19);c.lineTo(o.x+9,o.y-7);c.lineTo(o.x,o.y+5);c.lineTo(o.x-9,o.y-7);c.closePath();c.fill();rect(c,o.x-2,o.y-12,4,9,'#fff0cd')}
  if(o.kind==='switch'){rect(c,o.x-13,o.y-6,26,16,'#5e6761');rect(c,o.x-3,o.y-25,6,25,'#c5a562');c.strokeStyle='#e8d7a0';c.lineWidth=4;c.beginPath();c.arc(o.x,o.y-23,11,0,Math.PI*2);c.stroke()}
  if(o.kind==='exit'){c.fillStyle='#b7d7a92c';c.strokeStyle='#c4e0bd';c.lineWidth=3;c.beginPath();c.ellipse(o.x,o.y,30,14,0,0,Math.PI*2);c.fill();c.stroke();for(let i=0;i<4;i++)rect(c,o.x-18+i*11,o.y-30-Math.sin(t*3+i)*7,3,15,'#b7d7a9')}
 }
}
function storyActors(r,t){
 if(r?.mode!=='story'||!r.story)return[];const actors=[];
 for(const o of storyTargets(r).filter(o=>o.kind==='npc'||o.kind==='merchant'))actors.push({y:o.y,draw:()=>{
  drawAdventureNpc(ctx,o,t,1.2);
  if(o.stage===1&&!r.story.rooms[1].cleared){ctx.strokeStyle='#879589';ctx.lineWidth=3;ctx.strokeRect(o.x-22,o.y-65,44,78);for(let x=-15;x<21;x+=10){ctx.beginPath();ctx.moveTo(o.x+x,o.y-65);ctx.lineTo(o.x+x,o.y+13);ctx.stroke()}}
  if(o.kind==='npc'&&(!r.story.rooms[o.stage].reported||o.stage===0&&!r.story.unlocked)){ctx.fillStyle='#ffc76b';ctx.font='bold 21px Georgia';ctx.textAlign='center';ctx.fillText('!',o.x,o.y-89-Math.sin(t*3)*2)}
  ctx.font='12px Georgia';ctx.textAlign='center';const w=ctx.measureText(o.name).width+14;ctx.fillStyle='#101f24dc';ctx.fillRect(o.x-w/2,o.y+15,w,20);ctx.fillStyle='#f5ecd7';ctx.fillText(o.name,o.x,o.y+29);
 }});return actors;
}
const minimapBeforeAdventure=drawMinimap;
drawMinimap=function(c,r){
 if(r.mode!=='story'||!r.story){minimapBeforeAdventure(c,r);return}const m=storyTerrain(r.chapter),x=12,y=H-190,w=160,h=100;c.save();rect(c,x-3,y-3,w+6,h+6,'#101f24ee');
 for(let ty=0;ty<30;ty++)for(let tx=0;tx<48;tx++)if(m.tiles[ty][tx]===1&&r.story.discovered.includes(m.roomAt[ty][tx]))rect(c,x+tx/48*w,y+ty/30*h,w/48+1,h/30+1,'#546e65');
 const dot=(px,py,color,size=4)=>rect(c,x+px/2400*w-size/2,y+py/1500*h-size/2,size,size,color);
 for(const g of m.gates)if(storyGateClosed(r,g))dot(g.x+g.w/2,g.y+g.h/2,'#ce8d63');for(const o of storyTargets(r))if(o.kind==='npc'||o.kind==='relic'||o.kind==='switch'||o.kind==='exit')dot(o.x,o.y,o.kind==='npc'?'#ffc76b':'#addad7',3);for(const e of r.enemies)dot(e.x,e.y,'#f49b8d',e.boss?5:2);dot(r.x,r.y,'#fff0cd',5);c.fillStyle='#f5ecd7';c.font='11px Georgia';c.textAlign='left';c.fillText('M · Map   Q · Quest log',x,y-8);c.restore();
};
function storyOverlay(kind){const r=run;if(!r?.story||r.paused)return;r.paused=true;keys.clear();pointer=null;const d=adventureChapters[r.chapter-1];
 const body=kind==='map'?`<p>Act ${r.chapter}: ${storyEsc(storyActs[r.chapter-1].title)}. Gold marks show witnesses; pale marks show quest objects. Gates open through conversations and completed objectives.</p><canvas id="storyAtlas" width="800" height="500" class="story-atlas" aria-label="Explored districts, gates and player position"></canvas><ol class="story-route">${d.places.map((name,i)=>`<li>${storyEsc(r.story.discovered.includes(i)?name:'Unexplored district')} · ${r.story.rooms[i].reported?'Complete':r.story.discovered.includes(i)?'Explored':'Unexplored'}</li>`).join('')}</ol>`:`<p class="story-current-goal">${storyEsc(storyGoal(r))}</p><ol class="story-route">${d.places.map((name,i)=>`<li><strong>${storyEsc(name)}</strong><br>${storyEsc(i===0?d.mission:i===2?'Recover three '+d.relic:i===3?'Operate both '+d.mechanism:i===4?'Choose who or what to carry':i===1?'Rescue '+d.people[0]:'Face the keeper of this realm')} · ${r.story.rooms[i].reported?'Complete':r.story.rooms[i].cleared?'Speak to the witness':'In progress'}</li>`).join('')}</ol>`;
 showModal(kind==='map'?'The road ahead':'The keeper’s objectives',body,[{label:'Back to the road',primary:true,fn:()=>{closeModal();r.paused=false;canvas.focus({preventScroll:true})}},{label:'Save & return',fn:leaveToHome}],kind==='map'?'story-map':'story-log');
 if(kind==='map'){const a=$('#storyAtlas');a.width=800;a.height=500;const g=a.getContext('2d');g.imageSmoothingEnabled=false;g.scale(1/3,1/3);drawStoryTerrain(g,r,r.time);for(const o of storyTargets(r).filter(o=>o.kind==='npc')){g.fillStyle='#ffc76b';g.beginPath();g.arc(o.x,o.y,15,0,Math.PI*2);g.fill()}g.fillStyle='#fff0cd';g.beginPath();g.arc(r.x,r.y,18,0,Math.PI*2);g.fill()}
}
const hitBeforeAdventure=hit;
hit=function(e,damage,isSkill=false,isBurn=false){if(run?.mode==='story'&&run.story&&!isBurn&&(isSkill||['keeper','brawler'].includes(run.hero.classId))&&!storyLineOfSight(run,run.x,run.y,e.x,e.y,2))return;hitBeforeAdventure(e,damage,isSkill,isBurn)};
$('#storyInteract').onclick=storyInteract;$('#storyMap').onclick=()=>storyOverlay('map');$('#storyQuest').onclick=()=>storyOverlay('log');
window.addEventListener('keydown',e=>{if(!run?.story||e.repeat||e.ctrlKey||e.metaKey||e.altKey)return;const k=e.key.toLowerCase();if(k==='e'&&!run.paused){e.preventDefault();storyInteract()}else if(k==='m'&&!run.paused){e.preventDefault();storyOverlay('map')}else if(k==='q'&&!run.paused){e.preventDefault();storyOverlay('log')}});
const helpBeforeAdventure=$('#help').onclick;
$('#help').onclick=$('#about').onclick=()=>{if(run?.mode!=='story'){helpBeforeAdventure();return}const r=run,paused=r.paused;r.paused=true;showModal('The road through the beacons','<p>Move with WASD, arrows or drag. Shift dashes, Space uses your skill, and attacks aim automatically. E talks, collects quest objects and operates mechanisms. Use the on-screen Interact button on touch screens. M opens your explored map; Q opens your quest log.</p><p>Talk to the camp guide to open the first gate. Each of five districts contains twenty waves and a guardian. Accept its NPC’s objective before combat. Clear every enemy to advance a wave. Talk to the witness, collect the required memories, or operate the mechanisms to open the next gate. After the fifth district, use the glowing exit to enter the next chapter.</p><p>Walls and pillars block you, dashes, enemies and projectiles. Supply crates break when shot or interacted with. Enemies navigate around cover. Rest by the camp lantern or trade with Nox. Save & return preserves rooms, dialogue, quests, crates and choices. Completed district checkpoints preserve your build.</p>',[{label:'Back',primary:true,fn:()=>{closeModal();r.paused=paused}}],'help')};
// Endings use the current expedition's choices; the journal uses the finished journey.
function storyDecisionSet(){return run?.mode==='story'?(run.storyChoices||{}):(save.storyDecisions||{})}
endingText=function(choice){
 const decisions=storyDecisionSet(),care=Object.values(decisions).filter(v=>v==='care').length,proof=Object.values(decisions).filter(v=>v==='proof').length;
 const dawn=choice==='release'?'Brann opens his hand and lets the lantern fall. The sound is small. Across the camp, people stop mid-sentence as their stolen memories return. Rook remembers his mother’s voice; it does not make her alive again. Orin recognizes Aster and asks whether he may sit beside her. Elia remembers the way home. Finch gives her the second bowl. The sky stays dark long enough for everyone to be afraid. Then a thin line of ordinary light touches the tent. No one has paid for it.':'Brann keeps the flame. A golden morning floods the camp, taking the memories that bound its people together. Finch offers Elia a bowl with the politeness of a stranger. She accepts it, crying without knowing why. Orin looks at Aster and begins another introduction. Brann can remember the choice because the keeper must tend the flame. The Sovereign’s throne stands empty; its work is still being done.';
 const road=care>proof?'The survivors you reached first gather around the campfire. They disagree about what happened and keep telling it anyway. Their account has gaps; there are people alive to argue over them.':proof>care?'The records you carried are copied into many hands. Beside the signatures, Mara leaves room for the people who had to wait. The first public reading includes their objections.':'The camp lays its records beside the names of its living witnesses. Where the accounts disagree, Mara leaves both versions on the page.';
 const close=choice==='release'?'Mara writes her own name beneath her confession. Brann takes the first watch without a lantern. When Elia asks what happens tomorrow, he answers, “We will decide when we get there.”':'Mara begins a new register. On its first page Brann writes what the bargain cost, then reads it aloud to people who no longer know his voice. At the edge of the table, the lantern waits for evening.';
 return dawn+' '+road+' '+close+(Object.keys(decisions).length?' Along the road: '+care+' people-first decisions; '+proof+' proof-first decisions.':'');
};
const journalBeforeAdventure=renderShop;
renderShop=function(){journalBeforeAdventure();if(currentPage!=='journal')return;$('#shop').innerHTML+=Object.entries(storyDecisionSet()).filter(([ch,choice])=>Number(ch)>=1&&Number(ch)<=6&&['care','proof'].includes(choice)).map(([ch,choice])=>`<article class="journal-entry"><h3>Act ${Number(ch)} · ${storyEsc(adventureChapters[Number(ch)-1].people[3])}'s request</h3><p>${storyEsc(storyChoiceEcho(Number(ch),choice))}</p></article>`).join('')};

showPage(currentPage);

// Each named encounter has two authored abilities. Types share reliable tells.
const bossSkillPairs=[
 [
  [['Briar Quake','slam'],['Antler Rush','charge']],
  [['Stolen Light','blink'],['Lantern Shards','fan']],
  [['Root Constellation','barrage'],['Sapbound Renewal','ritual']],
  [['Hunting Horn','summon'],['Thorn Wheel','ring']],
  [['Crown of Briars','nova'],['Forest Judgment','lanes']]
 ],[
  [['Slag Fissure','lanes'],['Molten Rush','charge']],
  [['Kiln Breath','beam'],['Scorching Cinders','barrage']],
  [['Brood Call','summon'],['Ashwing Spiral','ring']],
  [['Furnace March','charge'],['Iron Rain','barrage']],
  [['Core Eruption','nova'],['Furnace Roar','beam']]
 ],[
  [['Rime Lances','fan'],['Icefall','barrage']],
  [['Mirror Step','blink'],['Glass Halo','ring']],
  [['Royal Freeze','nova'],['Crystal Procession','lanes']],
  [['Moonless Ray','beam'],['Nightwing Call','summon']],
  [['Eclipse Petals','ring'],['Lunar Rupture','barrage']]
 ],[
  [['Chain Lash','beam'],['Prison Break','charge']],
  [['Crossfire Orders','lanes'],['Reinforcement Signal','summon']],
  [['Cinder Crown','ring'],['Royal Sentence','barrage']],
  [['Phalanx Advance','charge'],['Commander’s Volley','fan']],
  [['Iron Cataclysm','slam'],['Siege Cannon','beam']]
 ],[
  [['Drowning Bell','nova'],['Undertow Step','blink']],
  [['Choir of Shades','summon'],['Mourning Notes','fan']],
  [['Abbot’s Benediction','ritual'],['Sunken Seal','barrage']],
  [['Devouring Gaze','beam'],['Stolen Memories','ring']],
  [['Grave Refrain','lanes'],['Final Toll','nova']]
 ],[
  [['Crimson Verdict','lanes'],['Watcher Step','blink']],
  [['Oathbound Retinue','summon'],['Broken Promise','slam']],
  [['Heir’s Eclipse','ring'],['Inherited Flame','fan']],
  [['First Dawn','beam'],['Searing Embers','barrage']],
  [['Sovereign’s Decree','lanes'],['End of Night','eclipse']]
 ]
];
const bossSkillKinds={
 slam:{warning:1.1,cooldown:6.8,hint:'Leave the marked impact circles.',description:'Slams a marked line of ground impacts. The target positions lock when the warning begins.'},
 charge:{warning:1.2,cooldown:7.4,hint:'Dodge sideways out of the marked lane.',description:'Locks a lane, then rushes along it. Walls stop the rush; the boss cannot steer after committing.'},
 blink:{warning:1.15,cooldown:7.8,hint:'Keep clear of the destination sigil.',description:'Marks a safe landing point, then teleports and releases a short shockwave. The landing is fixed before the jump.'},
 fan:{warning:.95,cooldown:5.8,hint:'Move across the aim line or use solid cover.',description:'Fires a spread of fast shards in the marked direction. The aim locks before release.'},
 ring:{warning:1.05,cooldown:6.4,hint:'Move into the open wedge in the ring.',description:'Releases a radial projectile pattern with a visible safe wedge. Solid cover blocks the shards.'},
 nova:{warning:1.15,cooldown:7.8,hint:'Dash through the advancing ring or leave its radius.',description:'Releases an expanding ground shockwave. It deals damage at its moving edge, not throughout the whole circle.'},
 barrage:{warning:1.25,cooldown:7.5,hint:'Move off the fixed ground marks.',description:'Marks several impact sites near your position. They stop tracking before they erupt.'},
 beam:{warning:1.2,cooldown:7.2,hint:'Move sideways or get behind solid cover.',description:'Projects a warning lane, then fires a damaging beam along it. Solid walls cut the beam short.'},
 lanes:{warning:1.35,cooldown:8.2,hint:'Stand between the marked lanes.',description:'Marks several radiating lanes, then strikes them together. Gaps remain between lanes; walls block the strikes.'},
 summon:{warning:1.4,cooldown:9.5,hint:'Watch the summon sigils; clear the reinforcements.',description:'Calls a small, capped group of themed minions at marked sigils. New minions have a short arrival delay.'},
 ritual:{warning:1.6,cooldown:10,hint:'Deal a burst of damage or stun to interrupt the ritual.',description:'Channels a small, capped heal. Sufficient damage or a stun interrupts the channel before it restores health.'},
 eclipse:{warning:1.5,cooldown:10,hint:'Use the safe wedge and avoid the two summon sigils.',description:'The Sovereign releases an eclipse ring while calling two guardians. Both the safe wedge and the summon positions are shown first.'}
};
const bossSkillBook=bossSkillPairs.map((chapter,ch)=>chapter.map((pair,tier)=>({chapter:ch+1,tier:tier+1,name:bossNames[ch][tier],skills:pair.map(([name,kind],slot)=>({id:'boss_'+(ch+1)+'_'+(tier+1)+'_'+slot,name,kind,...bossSkillKinds[kind]}))})));
function bossProfile(e){return bossSkillBook[Math.max(0,Math.min(5,(e.chapter||1)-1))][Math.max(0,Math.min(4,(e.bossTier||5)-1))]}
function bossSkillById(id){for(const chapter of bossSkillBook)for(const boss of chapter)for(const skill of boss.skills)if(skill.id===id)return skill;return null}

function bossPhase(e){return Math.max(e.bossDesperate?3:e.bossEnraged?2:1,e.hp<=e.maxHp*.25?3:e.hp<=e.maxHp*.5?2:1)}
function bossDifficultyCooldown(e,r,skill){
 const tempo=typeof difficultyProfile==='function'?difficultyProfile(r).bossTempo:1,phase=bossPhase(e);
 return Math.max(3.1,skill.cooldown*tempo*(phase===3?.64:phase===2?.78:1));
}
function ensureBossSkills(e,r){
 const p=bossProfile(e);if(!e.bossSkillId){r.bossSkillSerial=(r.bossSkillSerial||0)+1;e.bossSkillId='boss:'+r.chapter+':'+p.tier+':'+r.bossSkillSerial}
 if(!Number.isFinite(e.bossSkillCd))e.bossSkillCd=2.8+p.tier*.12;if(!Number.isInteger(e.bossSkillIndex))e.bossSkillIndex=0;if(!Number.isFinite(e.bossRecovery))e.bossRecovery=0;
 if(!Number.isInteger(e.bossComboRemaining))e.bossComboRemaining=0;if(!Number.isInteger(e.bossComboStep))e.bossComboStep=0;
 if(!Number.isFinite(e.bossStaggerGuard))e.bossStaggerGuard=0;if(!Number.isFinite(e.bossStunLeft))e.bossStunLeft=0;
 r.bossFields=r.bossFields||[];return p;
}
function bossPoint(r,e,x,y,radius=14){x=Math.max(30,Math.min(MW-30,x));y=Math.max(35,Math.min(MH-30,y));if(r.mode==='story'&&r.story)return storyFreePoint(r,e.storyRoom||r.story.combatRoom||r.story.activeRoom,{x,y},radius);return{x,y}}
function bossLaneEnd(r,x,y,angle,length,width=16){let end={x,y};for(let distance=5;distance<=length;distance+=5){const p={x:x+Math.cos(angle)*distance,y:y+Math.sin(angle)*distance};if(p.x<25||p.x>MW-25||p.y<25||p.y>MH-25||r.mode==='story'&&r.story&&storySolid(r,p.x,p.y,Math.min(15,width/2)))break;end=p}return end}
function bossCastPlan(e,r,skill){
 const p=bossProfile(e),angle=Math.atan2(r.y-e.y,r.x-e.x),origin={x:e.x,y:e.y},cast={id:skill.id,kind:skill.kind,left:skill.warning,total:skill.warning,origin,target:{x:r.x,y:r.y},angle,points:[],lanes:[],radius:125+p.tier*9,gap:angle+(e.bossSkillIndex%2?-.35:.35),hpAtStart:e.hp,enraged:!!e.bossEnraged,color:chapters[e.chapter-1].accent};
 if(skill.kind==='slam'){cast.radius=42+p.tier*2;for(let i=0;i<3;i++){const distance=75+i*65;cast.points.push(bossPoint(r,e,e.x+Math.cos(angle)*distance,e.y+Math.sin(angle)*distance))}}
 if(skill.kind==='barrage'){cast.radius=36+p.tier*2;cast.points.push(bossPoint(r,e,r.x,r.y));for(let i=0;i<(e.bossEnraged?4:3);i++){const a=angle+i*Math.PI*2/(e.bossEnraged?4:3)+(e.chapter%3)*.2;cast.points.push(bossPoint(r,e,r.x+Math.cos(a)*115,r.y+Math.sin(a)*100))}}
 if(skill.kind==='beam'||skill.kind==='charge'){const width=skill.kind==='charge'?52:28+p.tier*2,end=bossLaneEnd(r,e.x,e.y,angle,skill.kind==='charge'?270:390,width);cast.lanes.push({x:e.x,y:e.y,x2:end.x,y2:end.y,width})}
 if(skill.kind==='lanes'){const count=p.tier===5?5:3,spread=e.chapter===6?.43:.58;for(let i=0;i<count;i++){const a=angle+(i-(count-1)/2)*spread,end=bossLaneEnd(r,e.x,e.y,a,340,24);cast.lanes.push({x:e.x,y:e.y,x2:end.x,y2:end.y,width:22+p.tier*2})}}
 if(skill.kind==='blink'){cast.radius=62;cast.points.push(bossPoint(r,e,r.x+Math.cos(angle+Math.PI*.65)*110,r.y+Math.sin(angle+Math.PI*.65)*95,22))}
 if(skill.kind==='summon'||skill.kind==='eclipse'){const n=skill.kind==='eclipse'?2:Math.min(4,2+Math.floor(p.tier/3)+(e.bossEnraged?1:0));for(let i=0;i<n;i++){const a=angle+i*Math.PI*2/n+Math.PI/2;cast.points.push(bossPoint(r,e,e.x+Math.cos(a)*130,e.y+Math.sin(a)*110,18))}}
 if(skill.kind==='ritual')cast.radius=75;return cast;
}
function beginBossSkill(e,r,slot=null){
 if(!e.boss||e.hp<=0||r.paused||e.bossCast||e.bossDash||e.cast||e.bossRecovery>0||e.bossStunLeft>0)return false;const profile=ensureBossSkills(e,r),i=slot===null?e.bossSkillIndex%2:Math.max(0,Math.min(1,slot)),skill=profile.skills[i];
 // A chain is fixed when it begins. Crossing a health threshold cannot extend it forever.
 if(!e.bossComboActive){e.bossComboActive=true;e.bossComboTotal=bossPhase(e);e.bossComboRemaining=e.bossComboTotal;e.bossComboStep=0}
 e.bossComboNext=false;e.bossComboStep++;e.bossComboRemaining=Math.max(0,e.bossComboRemaining-1);
 e.bossCast=bossCastPlan(e,r,skill);e.bossSkillIndex=(i+1)%2;e.attackAnim=0;e.contactWindup=0;e.bossSkillLabel=skill.name;e.bossSkillDisplayLeft=skill.warning;return true;
}
function cancelBossSkill(e,label='Interrupted'){e.bossCast=null;e.bossDash=null;e.cast=null;e.bossComboActive=false;e.bossComboNext=false;e.bossComboRemaining=0;e.bossComboStep=0;e.bossRecovery=.65;e.bossSkillCd=2;e.bossSkillLabel=label;e.bossSkillDisplayLeft=1.1;e.contactWindup=0}
function addBossField(r,e,shape,geometry,damage,life=.6){
 if((r.bossFields||[]).length>=36)return;r.bossFields.push({owner:e.bossSkillId,shape,...geometry,t:life,max:life,dmg:damage,color:chapters[e.chapter-1].accent,hit:false});
}
function bossSpecialShot(e,r,angle,speed,damage){if(r.shots.length>=280)return;r.shots.push({x:e.x,y:e.y-e.size*.35,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,t:4.6,enemy:true,dmg:damage,color:chapters[e.chapter-1].accent,bossOwner:e.bossSkillId})}
function bossRingShots(e,r,cast){const tier=bossProfile(e).tier,count=12+tier*2+(cast.enraged?4:0),speed=105+tier*7+(cast.enraged?15:0);for(let i=0;i<count;i++){const a=i*Math.PI*2/count+(e.chapter%3)*.13,d=Math.atan2(Math.sin(a-cast.gap),Math.cos(a-cast.gap));if(Math.abs(d)<.43)continue;bossSpecialShot(e,r,a,speed,e.dmg*.75)}}
function releaseBossSkill(e,r){
 const cast=e.bossCast,skill=cast&&bossSkillById(cast.id);if(!cast||!skill||e.hp<=0)return;const tier=bossProfile(e).tier,power=e.dmg*(cast.enraged?1.08:1);e.bossCast=null;e.attackAnim=.4;e.bossRecovery=.65;e.bossSkillCd=bossDifficultyCooldown(e,r,skill);e.shoot=Math.max(e.shoot||0,1.3);e.bossSkillLabel=skill.name;e.bossSkillDisplayLeft=1.2;
 e.bossComboNext=e.bossComboRemaining>0;if(!e.bossComboNext){e.bossComboActive=false;e.bossRecovery=.95}
 if(skill.kind==='slam'||skill.kind==='barrage')for(const p of cast.points)addBossField(r,e,'circle',{x:p.x,y:p.y,radius:cast.radius},power*(skill.kind==='slam'?1.05:.85),.6);
 if(skill.kind==='beam'||skill.kind==='lanes')for(const lane of cast.lanes)addBossField(r,e,'line',lane,power*(skill.kind==='beam'?1.05:.85),.5);
 if(skill.kind==='charge'){const end=cast.lanes[0];e.bossRecovery=0;e.bossDash={x2:end.x2,y2:end.y2,left:.85,speed:310+tier*14,dmg:power*1.2,hit:false};e.chargeAngle=cast.angle;e.charging=.6}
 if(skill.kind==='blink'){const p=cast.points[0];e.x=p.x;e.y=p.y;e.bossJustTeleported=true;addBossField(r,e,'ring',{x:p.x,y:p.y,radius:cast.radius,thickness:19},power*.8,.55);r.effects.push({x:cast.origin.x,y:cast.origin.y,r:55,t:.4,max:.4,color:cast.color})}
 if(skill.kind==='fan'){const count=5+tier+(cast.enraged?2:0);for(let i=0;i<count;i++)bossSpecialShot(e,r,cast.angle+(i-(count-1)/2)*(.14+(e.chapter%2)*.015),170+tier*10,power*.7)}
 if(skill.kind==='ring'||skill.kind==='eclipse')bossRingShots(e,r,cast);
 if(skill.kind==='nova')addBossField(r,e,'ring',{x:cast.origin.x,y:cast.origin.y,radius:cast.radius,thickness:22},power,.95);
 if(skill.kind==='summon'||skill.kind==='eclipse')for(const p of cast.points){if(r.enemies.filter(q=>q.hp>0).length>=28)break;const n=r.enemies.length;spawnEnemy(false,e.chapter===3?1:e.chapter===5?3:e.chapter===4?0:Math.min(3,tier%4));if(r.enemies.length>n){const q=r.enemies.at(-1);q.x=p.x;q.y=p.y;q.stun=.8;q.attack=1;q.bossSummonOwner=e.bossSkillId}}
 if(skill.kind==='ritual'){const amount=Math.min(e.maxHp*.025,90+e.chapter*20+tier*10);const restored=Math.min(amount,e.maxHp-e.hp);e.hp+=restored;textPop(e.x,e.y-55,'+'+Math.round(restored)+' vitality',cast.color);r.effects.push({x:e.x,y:e.y,r:85,t:.7,max:.7,color:cast.color})}
 sound(skill.kind==='beam'?180:skill.kind==='ritual'?520:100,.09,'triangle',.018);
}
function bossFieldContains(r,field){
 let inside=false;if(field.shape==='line'){const dx=field.x2-field.x,dy=field.y2-field.y,l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((r.x-field.x)*dx+(r.y-field.y)*dy)/l)):0;inside=Math.hypot(r.x-(field.x+dx*t),r.y-(field.y+dy*t))<field.width/2+8}
 else if(field.shape==='ring'){const radius=(1-field.t/field.max)*field.radius;inside=Math.abs(Math.hypot(r.x-field.x,r.y-field.y)-radius)<(field.thickness||20)/2+7}
 else inside=Math.hypot(r.x-field.x,r.y-field.y)<field.radius+7;
 return inside&&(r.mode!=='story'||!r.story||storyLineOfSight(r,field.x,field.y,r.x,r.y,1));
}
function damagePlayer(r,damage,source,at=1,x=r.x,y=r.y){const result=resolvePlayerDamage(r,damage,source,at);if(!result)return false;shake=Math.max(shake,result.shake);textPop(x,y-20,'−'+Math.round(result.damage),source==='hazard'?'#f49b8d':'#f3a99d');return true}
function bossDamage(r,damage,x,y){return damagePlayer(r,damage,'boss',1,x??r.x,y??r.y)}
function tickBossFields(r,dt){
 const alive=new Set(r.enemies.filter(e=>e.boss&&e.hp>0).map(e=>e.bossSkillId));r.bossFields=(r.bossFields||[]).filter(f=>f.t>0&&alive.has(f.owner));
 for(const field of r.bossFields){field.t=Math.max(0,field.t-dt);if(!field.hit&&bossFieldContains(r,field)&&bossDamage(r,field.dmg))field.hit=true}r.bossFields=r.bossFields.filter(f=>f.t>0);
}
const worldBeforeBossFields=updateWorld;
updateWorld=function(r,dt){worldBeforeBossFields(r,dt);tickBossFields(r,dt)};
function tickBossDash(e,r,dt){
 const dash=e.bossDash,dx=dash.x2-e.x,dy=dash.y2-e.y,distance=Math.hypot(dx,dy);dash.left-=dt;if(distance<4||dash.left<=0){e.bossDash=null;e.charging=0;e.bossRecovery=.7;return}
 const move=Math.min(distance,dash.speed*dt),steps=Math.max(1,Math.ceil(move/5));for(let i=0;i<steps;i++){const from={x:e.x,y:e.y};e.x+=dx/distance*move/steps;e.y+=dy/distance*move/steps;if(r.mode==='story'&&r.story)storyMoveEnemy(r,e,from);e.x=Math.max(28,Math.min(MW-28,e.x));e.y=Math.max(28,Math.min(MH-28,e.y));
  if(!dash.hit&&Math.hypot(e.x-r.x,e.y-r.y)<e.size+12&&(r.mode!=='story'||storyLineOfSight(r,e.x,e.y,r.x,r.y,2))&&bossDamage(r,dash.dmg))dash.hit=true;
  if(Math.hypot(e.x-from.x,e.y-from.y)<.1){e.bossDash=null;e.charging=0;e.bossRecovery=.7;return}
 }e.charging=.42;
}
bossAI=function(e,r,dt,a,dis){
 if(!e.boss||e.hp<=0||r.paused)return;const profile=ensureBossSkills(e,r);e.bossSkillDisplayLeft=Math.max(0,(e.bossSkillDisplayLeft||0)-dt);e.bossRecovery=Math.max(0,e.bossRecovery-dt);e.bossSkillCd=Math.max(0,e.bossSkillCd-dt);
 e.bossStaggerGuard=Math.max(0,e.bossStaggerGuard-dt);e.bossStunLeft=Math.max(0,e.bossStunLeft-dt);
 if(!e.bossEnraged&&e.hp<=e.maxHp*.5){e.bossEnraged=true;r.bossPhase2=true;e.bossSkillCd=Math.min(e.bossSkillCd,1.25);$('#bossbar').classList.add('enraged');banner(e.name+' · Enraged · Two-skill chains')}
 if(!e.bossDesperate&&e.hp<=e.maxHp*.25){e.bossDesperate=true;e.bossSkillCd=Math.min(e.bossSkillCd,1);banner(e.name+' · Desperation · Three-skill chains')}
 r.bossPhase2=!!e.bossEnraged;
 // First stun interrupts. A short visible guard stops repeated hits from freezing a boss indefinitely.
 if(e.stun>0){if(e.bossStaggerGuard<=0){const stagger=Math.min(.5,e.stun);cancelBossSkill(e);e.bossStunLeft=stagger;e.bossStaggerGuard=3.6}e.stun=0;e.contactWindup=0}
 if(e.bossStunLeft>0)return;
 if(e.bossCast){const cast=e.bossCast;if(cast.kind==='ritual'&&cast.hpAtStart-e.hp>=Math.min(e.maxHp*.03,r.dmg*2.5)){cancelBossSkill(e,'Ritual broken');return}cast.left=Math.max(0,cast.left-dt);if(cast.left<=0)releaseBossSkill(e,r);return}
 if(e.bossDash){tickBossDash(e,r,dt);return}if(e.bossRecovery>0||e.cast)return;
 if(e.bossComboNext&&dis<700&&beginBossSkill(e,r))return;
 if(e.bossSkillCd<=0&&dis<700&&beginBossSkill(e,r))return;
 if(dis>95){e.x+=Math.cos(a)*e.speed*dt;e.y+=Math.sin(a)*e.speed*dt}e.x=Math.max(28,Math.min(MW-28,e.x));e.y=Math.max(28,Math.min(MH-28,e.y));
 e.shoot=(e.shoot??2)-dt;if(e.shoot<=0&&dis<650){const shots=[];for(let i=-1;i<=1;i++)shots.push({angle:a+i*.19,speed:125+profile.tier*6,dmg:e.dmg*.55,color:chapters[e.chapter-1].accent});queueEnemyCast(e,shots);const tempo=typeof difficultyProfile==='function'?difficultyProfile(r).bossTempo:1;e.shoot=(e.bossDesperate?2:e.bossEnraged?2.4:3.2)*tempo}
};
const tickCastBeforeBossOwner=tickEnemyCast;
tickEnemyCast=function(e,r,dt){const n=r.shots.length;tickCastBeforeBossOwner(e,r,dt);if(e.boss)for(let i=n;i<r.shots.length;i++)r.shots[i].bossOwner=e.bossSkillId};
const contactBeforeBossSkills=enemyContactReady;
enemyContactReady=function(e,dt){if(e.boss&&(e.bossCast||e.bossDash||e.bossRecovery>0||e.bossStunLeft>0))return false;return contactBeforeBossSkills(e,dt)};
const hitBeforeBossSkills=hit;
hit=function(e,damage,isSkill=false,isBurn=false){hitBeforeBossSkills(e,damage,isSkill,isBurn);if(e.boss&&e.hp<=0&&run){e.bossCast=null;e.bossDash=null;e.cast=null;e.bossComboActive=false;e.bossComboNext=false;e.bossComboRemaining=0;e.bossStaggerGuard=0;e.bossStunLeft=0;if(e.bossSkillId){run.bossFields=(run.bossFields||[]).filter(f=>f.owner!==e.bossSkillId);for(const s of run.shots)if(s.bossOwner===e.bossSkillId)s.t=0;run.shots=run.shots.filter(s=>s.bossOwner!==e.bossSkillId)}}};
const terrainMoveBeforeBossBlink=storyMoveEnemy;
storyMoveEnemy=function(r,e,from){if(e.bossJustTeleported){e.bossJustTeleported=false;return}terrainMoveBeforeBossBlink(r,e,from)};
const setupBeforeBossSkills=setupChapter;
setupChapter=function(r){setupBeforeBossSkills(r);r.bossFields=[]};
// Boss warnings use exact damage geometry, with a dark keyline on busy terrain.
function bossStroke(c,color,width,trace){
 c.beginPath();trace();c.strokeStyle='#091319';c.lineWidth=width+3;c.stroke();c.strokeStyle=color;c.lineWidth=width;c.stroke();
}
function drawBossLane(c,line,color,progress=0,active=false){
 const dx=line.x2-line.x,dy=line.y2-line.y,length=Math.hypot(dx,dy);if(length<1)return;
 c.save();c.translate(line.x,line.y);c.rotate(Math.atan2(dy,dx));c.lineCap='butt';
 const w=line.width/2;
 const capsule=()=>{c.moveTo(0,-w);c.lineTo(length,-w);c.arc(length,0,w,-Math.PI/2,Math.PI/2);c.lineTo(0,w);c.arc(0,0,w,Math.PI/2,Math.PI*1.5)};
 c.fillStyle=active?color+'38':'#0b141b9c';c.beginPath();capsule();c.fill();
 // The outside rails stay still: motion only communicates time until release.
 bossStroke(c,color,active?2.5:1.5,capsule);
 c.globalAlpha*=active?.8:.18+progress*.2;c.fillStyle=color;c.fillRect(0,-w,length*(active?1:progress),line.width);c.globalAlpha/=(active?.8:.18+progress*.2);
 const count=Math.max(1,Math.floor(length/38));c.strokeStyle='#fff1d2';c.lineWidth=1.3;
 for(let i=0;i<count;i++){const x=18+i*38;c.beginPath();c.moveTo(x-4,-Math.min(6,w*.5));c.lineTo(x+2,0);c.lineTo(x-4,Math.min(6,w*.5));c.stroke()}
 if(!active){c.fillStyle='#fff1d2';c.fillRect(Math.max(0,length*progress-1),-w,2,line.width)}
 c.restore();
}
function drawBossCircle(c,p,radius,color,progress=0,label=null){
 c.save();c.translate(p.x,p.y);c.fillStyle='#0b141b88';c.beginPath();c.arc(0,0,radius,0,Math.PI*2);c.fill();
 c.fillStyle=color+'18';c.beginPath();c.arc(0,0,radius*Math.sqrt(progress),0,Math.PI*2);c.fill();
 bossStroke(c,color,1.5,()=>c.arc(0,0,radius,0,Math.PI*2));
 // A clockwise ivory timer and four fixed brackets distinguish warnings from impacts.
 bossStroke(c,'#fff1d2',2,()=>c.arc(0,0,radius,-Math.PI/2,-Math.PI/2+Math.PI*2*Math.max(.001,progress)));
 c.strokeStyle=color;c.lineWidth=1;
 for(let i=0;i<4;i++){c.save();c.rotate(i*Math.PI/2);c.beginPath();c.moveTo(radius-7,-5);c.lineTo(radius-3,-9);c.lineTo(radius+4,-9);c.lineTo(radius+4,9);c.lineTo(radius-3,9);c.lineTo(radius-7,5);c.stroke();c.restore()}
 c.strokeStyle='#fff1d2';c.beginPath();c.moveTo(-4,0);c.lineTo(4,0);c.moveTo(0,-4);c.lineTo(0,4);c.stroke();
 if(label){c.font='10px Georgia';c.textAlign='center';c.fillStyle='#0b141be8';c.fillRect(-27,10,54,16);c.fillStyle='#fff1d2';c.fillText(label,0,21)}c.restore();
}

function drawBossSkillEffects(c,r,t){
 c.save();for(const e of r.enemies){if(!e.boss||e.hp<=0||!e.bossCast)continue;const cast=e.bossCast,skill=bossSkillById(cast.id);if(!skill)continue;const p=Math.max(0,Math.min(1,1-cast.left/cast.total)),color=cast.color;
  c.globalAlpha=reducedMotion?.9:.8+Math.sin(t*9)*.12;
  if(['slam','barrage','blink'].includes(skill.kind))for(const point of cast.points)drawBossCircle(c,point,cast.radius,color,p,skill.kind==='blink'?'Landing':null);
  for(const line of cast.lanes)drawBossLane(c,line,color,p);
  if(['ring','eclipse','nova','ritual'].includes(skill.kind)){
   const radius=skill.kind==='ring'||skill.kind==='eclipse'?78:cast.radius,ring=skill.kind==='ring'||skill.kind==='eclipse';c.strokeStyle=color;c.fillStyle=color+'15';c.lineWidth=3;c.beginPath();c.arc(cast.origin.x,cast.origin.y,radius,ring?cast.gap+.43:0,ring?cast.gap+Math.PI*2-.43:Math.PI*2);if(!ring)c.fill();c.stroke();
   if(ring){const a=cast.gap,x=cast.origin.x+Math.cos(a)*radius,y=cast.origin.y+Math.sin(a)*radius;c.fillStyle='#fff0cd';c.beginPath();c.moveTo(x+Math.cos(a)*9,y+Math.sin(a)*9);c.lineTo(x+Math.cos(a+2.4)*8,y+Math.sin(a+2.4)*8);c.lineTo(x+Math.cos(a-2.4)*8,y+Math.sin(a-2.4)*8);c.closePath();c.fill()}
   else if(skill.kind==='ritual'){c.font='12px Georgia';c.textAlign='center';c.fillStyle='#fff0cd';c.fillText('Interrupt the ritual',cast.origin.x,cast.origin.y+cast.radius+18)}
  }
  if(skill.kind==='summon'||skill.kind==='eclipse')for(const point of cast.points){drawBossCircle(c,point,25,color,p,'Summon');c.strokeStyle=color;c.beginPath();c.moveTo(point.x-12,point.y);c.lineTo(point.x+12,point.y);c.moveTo(point.x,point.y-12);c.lineTo(point.x,point.y+12);c.stroke()}
  if(skill.kind==='fan'){const spread=.55+bossProfile(e).tier*.06;for(const offset of [-spread,0,spread]){const a=cast.angle+offset,end=bossLaneEnd(r,cast.origin.x,cast.origin.y,a,240,5);drawBossLane(c,{x:cast.origin.x,y:cast.origin.y,x2:end.x,y2:end.y,width:6},color,p)}}
 }
 for(const field of r.bossFields||[]){const alpha=Math.max(0,field.t/field.max);c.globalAlpha=alpha;if(field.shape==='line')drawBossLane(c,field,field.color,0,true);else if(field.shape==='ring'){c.strokeStyle=field.color;c.lineWidth=field.thickness||20;c.beginPath();c.arc(field.x,field.y,(1-alpha)*field.radius,0,Math.PI*2);c.stroke();c.strokeStyle='#fff0cd';c.lineWidth=2;c.stroke()}else{c.fillStyle=field.color+'70';c.strokeStyle='#fff0cd';c.lineWidth=3;c.beginPath();c.arc(field.x,field.y,field.radius*(.8+.2*(1-alpha)),0,Math.PI*2);c.fill();c.stroke();for(let i=0;i<6;i++){const a=i*Math.PI/3;c.beginPath();c.moveTo(field.x+Math.cos(a)*field.radius*.3,field.y+Math.sin(a)*field.radius*.3);c.lineTo(field.x+Math.cos(a)*field.radius*.85,field.y+Math.sin(a)*field.radius*.85);c.stroke()}}}
 c.restore();
}
const drawWorldBeforeBossSkills=drawWorld;
drawWorld=function(c,r,t){drawWorldBeforeBossSkills(c,r,t);drawBossSkillEffects(c,r,t)};
const motionBeforeBossSkills=drawEnemyMotion;
drawEnemyMotion=function(c,e,t){const old=e.cast;if(e.bossCast)e.cast={left:e.bossCast.left,total:e.bossCast.total,shots:[],zones:[]};let result;try{result=motionBeforeBossSkills(c,e,t)}finally{e.cast=old}if(e.boss&&e.hp>0&&(e.bossCast||e.bossSkillDisplayLeft>0)){const label=e.bossCast?bossSkillById(e.bossCast.id)?.name:e.bossSkillLabel;if(label){c.save();c.font='bold 12px Georgia';c.textAlign='center';const width=c.measureText(label).width+14;c.fillStyle='#101f24e8';c.fillRect(e.x-width/2,e.y-150,width,22);c.fillStyle='#fff0cd';c.fillText(label,e.x,e.y-135);c.restore()}}return result};
const motionBeforeBossGuard=drawEnemyMotion;
drawEnemyMotion=function(c,e,t){const result=motionBeforeBossGuard(c,e,t);if(e.boss&&e.hp>0&&e.bossStaggerGuard>0){c.save();c.strokeStyle=chapters[e.chapter-1].accent;c.lineWidth=2;c.globalAlpha=.7;c.setLineDash([6,5]);c.beginPath();c.ellipse(e.x,e.y+e.size*.6,e.size+9,13,0,0,Math.PI*2);c.stroke();c.restore()}return result};
drawAnimatedEnemy=drawEnemyMotion;drawChapterEnemy=drawEnemyMotion;
const hudBeforeBossSkills=updateHud;
updateHud=function(){hudBeforeBossSkills();const r=run,e=r?.enemies.find(e=>e.boss&&e.hp>0);if(!e)return;const p=ensureBossSkills(e,r),cast=e.bossCast,skill=cast&&bossSkillById(cast.id);let text;
 if(skill)text=skill.name+' · '+(Math.ceil(cast.left*10)/10).toFixed(1)+'s · '+skill.hint;
 else if(e.bossDash)text=e.bossSkillLabel+' · Rush committed';
 else if(e.bossSkillDisplayLeft>0)text=e.bossSkillLabel;
 else text='Next skill: '+p.skills[e.bossSkillIndex%2].name+' · '+Math.ceil(e.bossSkillCd)+'s';
 const phase=bossPhase(e);text=(phase===3?'Desperation':phase===2?'Enraged':'Phase 1')+' · '+text;
 if(e.bossComboActive&&e.bossComboTotal>1)text+=' · Chain '+e.bossComboStep+'/'+e.bossComboTotal;
 if(e.bossComboNext)text+=' · Next cast after recovery';
 if(e.bossStaggerGuard>0)text+=' · '+(e.bossStunLeft>0?'Staggered':'Stagger guard '+e.bossStaggerGuard.toFixed(1)+'s');
 const target=$('#bossSkillStatus');if(target.textContent!==text)target.textContent=text;
};
function openBossSkillGuide(){
 if(run?.paused)return;const r=run;if(r){r.paused=true;keys.clear();pointer=null;snapshot()}
 const active=r?.enemies.find(e=>e.boss&&e.hp>0),list=active?[bossProfile(active)]:bossSkillBook.flat(),html='<p>Every boss has two special skills and attacks more often deeper into the journey. Ground circles, lanes, landing sigils and safe wedges show where to move. Below 50% health, bosses chain two skills; below 25%, they chain three. Each cast keeps its full warning and a recovery gap, followed by a longer break after the chain.</p><p>A stun interrupts the whole chain and briefly staggers the boss. A dashed ring then shows 3.6 seconds of stagger protection, so repeated stuns cannot freeze it. Burst damage still breaks a healing ritual during this protection.</p>'+list.map(p=>`<section class="boss-guide-entry"><h3>${storyEsc(p.name)}</h3><p class="muted">${storyEsc(chapters[p.chapter-1].name)} · Wave ${p.tier*20}</p><ol>${p.skills.map(s=>`<li><strong>${storyEsc(s.name)}</strong> · ${s.warning.toFixed(2)}s warning<br>${storyEsc(s.description)}</li>`).join('')}</ol></section>`).join('');
 showModal(active?active.name+' · Skills':'Boss skill field guide',html,[{label:r?'Back to the fight':'Close',primary:true,fn:()=>{closeModal();if(r&&run===r)r.paused=false;keys.clear();if(r)canvas.focus({preventScroll:true})}},...(r?[{label:'Save & return',fn:leaveToHome}]:[])],'help');
}
$('#bossSkillsButton').onclick=openBossSkillGuide;
window.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='b'&&!e.repeat&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();openBossSkillGuide()}});

// Offline combat art: twelve hand-drawn pixel-effect atlases, eight frames each.
// Cosmetic state never owns damage, collision, cooldowns, or rewards.
const combatPalette={flame:'#ff963e',frost:'#89ddff',spirit:'#a8e6c7',bolt:'#6abfff',thorn:'#96e760',void:'#c484ff',sun:'#ffd777',blood:'#ff6874',impact:'#ffdeac',dust:'#bfa88b',heal:'#b5f3ca',spark:'#fff0be'};
const combatAtlases=new Map(),combatFxLimit=96;
function combatAtlas(kind){
 if(combatAtlases.has(kind))return combatAtlases.get(kind);if(!combatPalette[kind])kind='spark';
 const atlas=document.createElement('canvas');atlas.width=32*8;atlas.height=32;const c=atlas.getContext('2d'),col=combatPalette[kind];c.imageSmoothingEnabled=false;
 for(let f=0;f<8;f++){c.save();c.translate(f*32+16,16);const p=f/8,pulse=Math.sin(p*Math.PI*2),pixel=(x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),w,h)};
  // Shadows, saturated edges, a pale core and travelling pixels keep sprites legible.
  if(kind==='flame'||kind==='spirit'||kind==='blood'||kind==='void'){
   for(let i=0;i<7;i++){const x=-12+i*3,y=Math.sin(i*1.8+p*6.28)*(4-i*.35),h=3+i*.8;pixel(x,y-h/2,6,Math.ceil(h),col+'66');pixel(x+1,y-h/3,4,Math.ceil(h*.65),col)}
   pixel(3,-3,7,6,'#fff2cc');pixel(9,-1,3,2,'#ffffff');
   if(kind==='void'||kind==='blood'){c.strokeStyle=col;c.lineWidth=1;c.beginPath();c.ellipse(6,0,6,8+pulse,0,0,Math.PI*2);c.stroke();pixel(3,-2,5,4,'#251b38')}
  }else if(kind==='frost'||kind==='thorn'){
   c.fillStyle=col;c.beginPath();c.moveTo(13,0);c.lineTo(-2,-5);c.lineTo(-9,0);c.lineTo(-2,5);c.closePath();c.fill();pixel(-6,-1,15,2,'#f3ffed');
   for(const sign of [-1,1]){c.strokeStyle=col;c.beginPath();c.moveTo(-1,0);c.lineTo(-6,sign*(5+(f%3)));c.lineTo(-10,sign*3);c.stroke()}
  }else if(kind==='bolt'){
   for(let i=0;i<5;i++){pixel(-13+i*5,Math.sin(i*2+f)*3,6,2,col);pixel(-11+i*5,Math.sin(i*2+f)*3-1,3,1,'#e6fbff')}pixel(7,-3,5,6,'#e7fcff');
  }else if(kind==='dust'){
   for(let i=0;i<7;i++){const a=i*2.4+f*.11,d=3+p*11;pixel(Math.cos(a)*d,Math.sin(a)*d*.6,3,2,col+(f>4?'77':'bb'))}
  }else if(kind==='impact'||kind==='spark'){
   for(let i=0;i<8;i++){const a=i*Math.PI/4,d=2+p*12;c.strokeStyle=col;c.lineWidth=i%2?1:2;c.beginPath();c.moveTo(Math.cos(a)*d*.4,Math.sin(a)*d*.4);c.lineTo(Math.cos(a)*d,Math.sin(a)*d);c.stroke()}pixel(-2,-2,4,4,'#fff8de');
  }else{
   const n=kind==='heal'?4:8;for(let i=0;i<n;i++){const a=i*Math.PI*2/n+f*.06;c.fillStyle=col;c.beginPath();c.moveTo(Math.cos(a)*3,Math.sin(a)*3);c.lineTo(Math.cos(a+.2)*(10+pulse),Math.sin(a+.2)*(10+pulse));c.lineTo(Math.cos(a)*(14+pulse),Math.sin(a)*(14+pulse));c.lineTo(Math.cos(a-.2)*(10+pulse),Math.sin(a-.2)*(10+pulse));c.closePath();c.fill()}pixel(-2,-2,4,4,'#fff9df');
  }
  for(let i=0;i<3;i++){const x=((f*5+i*11)%28)-14,y=((i*9+f*3)%20)-10;pixel(x,y,1+(i%2),1,col)}c.restore();
 }combatAtlases.set(kind,atlas);return atlas;
}
function combatStamp(c,kind,x,y,size,age=0,angle=0,alpha=1){
 if(alpha<=0||!Number.isFinite(x+y+size+age+angle)||size<=0)return;c.save();c.globalAlpha*=Math.min(1,alpha);c.translate(x,y);c.rotate(angle);c.imageSmoothingEnabled=false;const frame=reducedMotion?0:Math.floor(Math.max(0,age)*16)%8;c.drawImage(combatAtlas(kind),frame*32,0,32,32,-size/2,-size/2,size,size);c.restore();
}
function addCombatFx(r,kind,x,y,options={}){
 if(!r||!Number.isFinite(x+y))return null;const life=options.life||.48;
 if(kind==='muzzle'){const previous=(r.combatFx||[]).find(f=>f.kind===kind&&f.age<.025&&Math.hypot(f.x-x,f.y-y)<2);if(previous){previous.size=Math.max(previous.size||20,options.size||20);previous.life=Math.max(previous.life,life);return previous}}
 const fx={kind,x,y,age:0,life,...options};(r.combatFx??=[]).push(fx);if(r.combatFx.length>combatFxLimit)r.combatFx.splice(0,r.combatFx.length-combatFxLimit);return fx;
}
function combatTheme(r){const id=r.weapon.id;if(/moonlit|frost/.test(id))return'frost';if(/eclipse|harbinger/.test(id))return'blood';if(/void|repeater|codex|soulfire/.test(id))return'void';if(/ember|phoenix|titan/.test(id))return'flame';if(/storm|thunder/.test(id))return'bolt';if(/thorn|bow|bloom/.test(id))return'thorn';return r.hero.classId==='healer'?'heal':r.hero.classId==='mage'?'spirit':r.hero.classId==='gunner'?'sun':'sun'}
function enemyCombatTheme(e){return['thorn','flame','frost','bolt','spirit','blood'][(e.chapter||1)-1]||'spirit'}
function projectileVisual(r,s){if(s.vfxKind)return s.vfxKind;if(s.enemy)return['thorn','flame','frost','bolt','spirit','blood'][(r.chapter||1)-1];return combatTheme(r)}
function primeCombatShot(r,s,kind){s.vfxKind=kind||projectileVisual(r,s);s.vfxAge=0;s.vfxTrail=[];return s}
function sampleCombatShot(r,s,from,dt){
 if(!s.vfxKind)primeCombatShot(r,s);s.vfxAge=(s.vfxAge||0)+dt;
 const trail=s.vfxTrail??=[],last=trail.at(-1);if(!last||Math.hypot(last.x-from.x,last.y-from.y)>3){trail.push({x:from.x,y:from.y});if(trail.length>7)trail.shift();while(trail.length>1&&Math.hypot(trail[0].x-from.x,trail[0].y-from.y)>75)trail.shift()}
}
function combatProjectileImpact(r,s){if(s.vfxImpact)return;s.vfxImpact=true;const p=s.vfxCollision||s;addCombatFx(r,'impact',p.x,p.y,{theme:projectileVisual(r,s),size:s.bossOwner?37:25,life:.3})}
function drawCombatProjectiles(c,r){
 for(const s of r.shots){if(s.t<=0)continue;const kind=projectileVisual(r,s),age=s.vfxAge||0,angle=Math.atan2(s.vy,s.vx),trail=s.vfxTrail||[],enemy=!!s.enemy,size=enemy?(s.bossOwner?27:21):r.hero.classId==='gunner'?22:29;
  c.save();c.strokeStyle=combatPalette[kind];c.lineCap='round';for(let i=1;i<trail.length;i++){c.globalAlpha=.09+i/trail.length*.22;c.lineWidth=1+i/trail.length*(enemy?3:4);c.beginPath();c.moveTo(trail[i-1].x,trail[i-1].y);c.lineTo(trail[i].x,trail[i].y);c.stroke()}c.restore();
  if(s.bossOwner)drawBossMissile(c,s,kind,angle,age);else combatStamp(c,kind,s.x,s.y,size,age,angle);
  if(enemy&&!s.bossOwner){c.save();c.translate(s.x,s.y);c.rotate(angle+age*3);c.strokeStyle='#fff5df';c.lineWidth=1;c.strokeRect(-5,-5,10,10);c.restore()}
  else if(!enemy&&(s.vfxClass||r.hero.classId)==='archer'){c.save();c.translate(s.x,s.y);c.rotate(angle);c.fillStyle='#f0f6db';c.fillRect(-12,-1,20,2);c.beginPath();c.moveTo(13,0);c.lineTo(5,-4);c.lineTo(5,4);c.closePath();c.fill();c.restore()}
 }
}
const combatSkillRecipes={
 sunburst:{theme:'sun',shape:'rays',radius:175},beacon:{theme:'sun',shape:'beacon',radius:125},soulflame:{theme:'void',shape:'fan',radius:95},
 starfall:{theme:'spirit',shape:'fan',radius:95},snare:{theme:'thorn',shape:'roots',radius:210},shadowstep:{theme:'void',shape:'veil',radius:85},
 inferno:{theme:'flame',shape:'flames',radius:210},frostnova:{theme:'frost',shape:'crystals',radius:270},meteors:{theme:'void',shape:'constellation',radius:110},
 earthshatter:{theme:'impact',shape:'fissure',radius:155},ironwill:{theme:'sun',shape:'guard',radius:140},shockwave:{theme:'bolt',shape:'thunder',radius:130},
 sanctuary:{theme:'heal',shape:'petals',radius:175},renewal:{theme:'heal',shape:'bloom',radius:125},judgment:{theme:'sun',shape:'judgment',radius:110},
 overdrive:{theme:'sun',shape:'volley',radius:90},ricochet:{theme:'bolt',shape:'volley',radius:90},turret:{theme:'bolt',shape:'assembly',radius:55}
};
function emitHeroSkillVisual(r){const id=r.activeSkill||skillBook[r.hero.classId][0][0],recipe=combatSkillRecipes[id];if(!recipe)return;const p=firingPoint(r);addCombatFx(r,'heroSkill',r.x,r.y,{...recipe,skill:id,angle:r.aim||0,sourceX:p.x,sourceY:p.y,life:1.05});addCombatFx(r,'muzzle',p.x,p.y,{theme:recipe.theme,angle:r.aim||0,size:48,life:.32})}
const combatShootBefore=shoot;
shoot=function(x,y,a,...args){const r=run,n=r?.shots.length||0;const out=combatShootBefore(x,y,a,...args);if(r)for(let i=n;i<r.shots.length;i++){primeCombatShot(r,r.shots[i],combatTheme(r));r.shots[i].vfxClass=r.hero.classId}if(r&&r.shots.length>n)addCombatFx(r,'muzzle',x,y,{theme:combatTheme(r),angle:a,size:r.hero.classId==='gunner'?35:26,life:.16});return out};
const combatStrikeBefore=releaseClassAttack;
releaseClassAttack=function(r){const muzzle=r.muzzle;combatStrikeBefore(r);if(r.muzzle!==muzzle&&['keeper','brawler'].includes(r.hero.classId))addCombatFx(r,'slash',r.x,r.y-12,{theme:combatTheme(r),angle:r.aim||0,radius:r.hero.range,life:.26})};
const combatSkillBefore=skill;
skill=function(){const r=run,can=r&&!r.paused&&r.skillCd<=0&&!r.skillPending&&!r.altPending;combatSkillBefore();if(can&&r.skillCd>0&&!r.skillPending&&!r.altPending)emitHeroSkillVisual(r)};$('#skill').onclick=skill;
const combatAlternateBefore=castAlternate;
castAlternate=function(r){combatAlternateBefore(r);emitHeroSkillVisual(r)};
const combatTickBefore=tickSpriteAnimation;
tickSpriteAnimation=function(r,dt){
 const pending=r.skillPending,tasks=(r.skillTasks||[]).slice();combatTickBefore(r,dt);if(pending&&!r.skillPending)emitHeroSkillVisual(r);
 for(const task of tasks)if(task.left<=0&&!task.combatReleased){task.combatReleased=true;if(task.kind!=='bullets')addCombatFx(r,task.kind==='ring'?'thunderImpact':r.activeSkill==='judgment'?'judgmentImpact':'meteorImpact',task.kind==='ring'?r.x:task.x,task.kind==='ring'?r.y:task.y,{radius:task.r,theme:r.activeSkill==='judgment'?'sun':task.kind==='ring'?'bolt':'void',life:.65})}
 for(const fx of r.combatFx||[])fx.age+=dt;r.combatFx=(r.combatFx||[]).filter(f=>f.age<f.life);
};
const combatCastBefore=tickEnemyCast;
tickEnemyCast=function(e,r,dt){const cast=e.cast,n=r.shots.length;combatCastBefore(e,r,dt);if(cast&&!e.cast&&e.hp>0){for(let i=n;i<r.shots.length;i++)primeCombatShot(r,r.shots[i],enemyCombatTheme(e));const p={x:e.x,y:e.y-e.size*.5};addCombatFx(r,'enemyCast',p.x,p.y,{theme:enemyCombatTheme(e),size:e.boss?65:42,life:.35,angle:cast.shots[0]?.angle||0})}};
const combatContactBefore=enemyContactReady;
enemyContactReady=function(e,dt){const ready=combatContactBefore(e,dt);if(ready&&run)addCombatFx(run,'slash',e.x,e.y-5,{theme:enemyCombatTheme(e),radius:e.boss?70:e.type===4?47:31,angle:Math.atan2(run.y-e.y,run.x-e.x),life:.27});return ready};
const combatHitBefore=hit;
hit=function(e,...args){const hp=e.hp;combatHitBefore(e,...args);if(run&&hp>e.hp&&hp>0){addCombatFx(run,'impact',e.x,e.y-e.size*.4,{theme:args[2]?'flame':args[1]?combatSkillRecipes[run.activeSkill]?.theme||combatTheme(run):combatTheme(run),size:e.boss?36:27,life:.28});if(e.hp<=0)addCombatFx(run,'dissolve',e.x,e.y,{theme:enemyCombatTheme(e),radius:e.boss?90:38,life:.65})}};
const combatBossReleaseBefore=releaseBossSkill;
releaseBossSkill=function(e,r){const cast=e.bossCast,n=r.shots.length;if(!cast)return;combatBossReleaseBefore(e,r);if(e.bossCast===cast||e.hp<=0)return;const theme=enemyCombatTheme(e);for(let i=n;i<r.shots.length;i++)primeCombatShot(r,r.shots[i],theme);
 addCombatFx(r,'bossRelease',cast.origin.x,cast.origin.y,{theme,mechanic:cast.kind,radius:cast.radius||90,angle:cast.angle,gap:cast.gap,life:cast.kind==='ritual'?.95:.7,owner:e.bossSkillId});
 if(cast.kind==='summon'||cast.kind==='eclipse'||cast.kind==='blink')for(const p of cast.points)addCombatFx(r,'portal',p.x,p.y,{theme,mechanic:cast.kind,radius:cast.kind==='blink'?45:30,life:.75,owner:e.bossSkillId});
};
const combatFieldBefore=addBossField;
addBossField=function(r,e,shape,geometry,damage,life){const n=r.bossFields.length;combatFieldBefore(r,e,shape,geometry,damage,life);if(r.bossFields.length>n){const f=r.bossFields.at(-1);f.vfxTheme=enemyCombatTheme(e);f.vfxMechanic=e.bossSkillLabel}}
const combatDashBefore=tickBossDash;
tickBossDash=function(e,r,dt){const from={x:e.x,y:e.y};combatDashBefore(e,r,dt);if(Math.hypot(e.x-from.x,e.y-from.y)>2)addCombatFx(r,'bossWake',from.x,from.y,{theme:enemyCombatTheme(e),angle:e.chargeAngle||0,size:e.size*2,life:.28,owner:e.bossSkillId});if(!e.bossDash)addCombatFx(r,'bossRelease',e.x,e.y,{theme:enemyCombatTheme(e),mechanic:'chargeEnd',radius:e.size+24,angle:e.chargeAngle||0,life:.4,owner:e.bossSkillId})};
const combatWorldBefore=updateWorld;
updateWorld=function(r,dt){r.hazards=r.hazards.filter(h=>h.wardenOwner===undefined||r.enemies.some(e=>isWarden(e)&&e.hp>0&&e.stun<=0&&e.warden.id===h.wardenOwner));const waiting=(r.hazards||[]).filter(h=>!h.struck);combatWorldBefore(r,dt);for(const h of waiting)if(h.struck)addCombatFx(r,'eruption',h.x,h.y,{theme:['thorn','flame','frost','bolt','spirit','blood'][r.chapter-1],radius:h.radius,life:.65});const alive=new Set(r.enemies.filter(e=>e.boss&&e.hp>0).map(e=>e.bossSkillId));r.combatFx=(r.combatFx||[]).filter(f=>!f.owner||alive.has(f.owner))};
const combatPackBefore=packRun;
packRun=function(r){const data=combatPackBefore(r);delete data.state.combatFx;for(const s of data.state.shots){delete s.vfxTrail;delete s.vfxImpact;delete s.vfxCollision}return data};
const combatSetupBefore=setupChapter;
setupChapter=function(r){combatSetupBefore(r);r.combatFx=[];if(r.lantern)resetLanternMap(r.lantern)};
function combatRune(c,x,y,radius,color,time,ellipse=false){
 c.save();c.translate(x,y);if(ellipse)c.scale(1,.55);c.rotate(reducedMotion?0:time*.35);c.strokeStyle=color;c.lineWidth=1.3;c.globalAlpha*=.7;c.beginPath();c.arc(0,0,radius,0,Math.PI*2);c.stroke();c.beginPath();c.arc(0,0,radius*.78,0,Math.PI*2);c.stroke();
 for(let i=0;i<8;i++){const a=i*Math.PI/4;c.save();c.rotate(a);c.strokeRect(radius*.88-2,-2,4,4);c.beginPath();c.moveTo(radius*.5,0);c.lineTo(radius*.68,0);c.stroke();c.restore()}c.restore();
}
function combatBurst(c,fx){const p=Math.max(0,Math.min(1,fx.age/fx.life)),theme=fx.theme||'sun',color=combatPalette[theme],rad=fx.radius||fx.size||40,fade=1-p,count=reducedMotion?5:12;
 if(fx.kind==='bossRelease'||fx.kind==='bossWake'||fx.kind==='portal'&&fx.owner){drawBossRelease(c,fx);return}
 c.save();c.globalAlpha*=fade;const radius=rad*(.15+Math.sin(p*Math.PI*.5)*.85);
 if(['impact','muzzle','enemyCast','dashWake'].includes(fx.kind)){combatStamp(c,fx.kind==='impact'?'impact':theme,fx.x,fx.y,(fx.size||35)*(fx.kind==='dashWake'?1:.6+p*.6),fx.age,fx.angle||0,fade);c.restore();return}
 if(fx.kind==='slash'){c.translate(fx.x,fx.y);c.rotate(fx.angle||0);c.strokeStyle=color;c.lineWidth=8*(1-p)+1;c.beginPath();c.arc(0,0,rad*(.55+.4*p),-.95+p*.2,1.05+p*.3);c.stroke();c.lineWidth=2;c.strokeStyle='#fff5df';c.beginPath();c.arc(0,0,rad*(.57+.4*p),-.8,1.1);c.stroke();c.restore();return}
 if(fx.kind==='portal'){combatRune(c,fx.x,fx.y,rad*(.8+p*.2),color,fx.age*7,true);for(let i=0;i<count;i++){const a=i*6.28/count+fx.age*3;combatStamp(c,theme,fx.x+Math.cos(a)*rad*.7,fx.y-12-Math.sin(p*Math.PI)*38+Math.sin(a)*rad*.3,15,fx.age+i*.07,a)}c.restore();return}
 const shape=fx.shape||fx.kind;
 if(['fan','volley'].includes(shape)){c.translate(fx.sourceX??fx.x,fx.sourceY??fx.y);c.rotate(fx.angle||0);for(let i=-2;i<=2;i++){const a=i*.25,d=20+p*rad;combatStamp(c,theme,Math.cos(a)*d,Math.sin(a)*d,25,fx.age+i*.04,a)}c.restore();return}
 if(shape==='guard'){combatRune(c,fx.x,fx.y,rad*.4,color,fx.age,true);c.strokeStyle=color;c.lineWidth=3;c.beginPath();c.moveTo(fx.x-25,fx.y-48);c.lineTo(fx.x,fx.y-60);c.lineTo(fx.x+25,fx.y-48);c.lineTo(fx.x+20,fx.y-17);c.lineTo(fx.x,fx.y-2);c.lineTo(fx.x-20,fx.y-17);c.closePath();c.stroke();c.restore();return}
 if(['constellation','judgment'].includes(shape)){combatRune(c,fx.x,fx.y,rad*.7,color,fx.age,true);for(let i=0;i<6;i++){const a=i*Math.PI/3;combatStamp(c,theme,fx.x+Math.cos(a)*60,fx.y-60+Math.sin(a)*25,22,fx.age+i*.1)}c.restore();return}
 c.strokeStyle=color;c.lineWidth=shape==='thunder'||fx.kind==='thunderImpact'?6:2;c.beginPath();c.ellipse(fx.x,fx.y,radius,radius*.62,0,0,Math.PI*2);c.stroke();
 for(let i=0;i<count;i++){const a=i*Math.PI*2/count+(shape==='veil'?p*2:0),x=fx.x+Math.cos(a)*radius,y=fx.y+Math.sin(a)*radius*.62;
  if(['fissure','roots'].includes(shape)){c.strokeStyle=color;c.lineWidth=2;c.beginPath();c.moveTo(fx.x+Math.cos(a)*15,fx.y+Math.sin(a)*10);for(let n=1;n<=4;n++){const d=radius*n/4;c.lineTo(fx.x+Math.cos(a)*d+Math.sin(i*7+n*3)*7,fx.y+Math.sin(a)*d*.62)}c.stroke();if(shape==='roots')combatStamp(c,'thorn',x,y,32,fx.age+i*.1,a-Math.PI/2)}
  else if(shape==='rays'||shape==='judgmentImpact'){c.strokeStyle=color;c.lineWidth=3;c.beginPath();c.moveTo(x,y);c.lineTo(x+Math.cos(a)*18,y+Math.sin(a)*12);c.stroke();combatStamp(c,'sun',x,y-12,26,fx.age+i*.1)}
  else if(shape==='crystals'){c.fillStyle=color;c.beginPath();c.moveTo(x-5,y);c.lineTo(x,y-30*Math.sin(p*Math.PI));c.lineTo(x+6,y-4);c.lineTo(x,y+4);c.closePath();c.fill();combatStamp(c,'frost',x,y-12,28,fx.age+i*.1,-Math.PI/2)}
  else{const lift=['flames','eruption','meteorImpact'].includes(shape)?Math.sin(p*Math.PI)*45:['petals','bloom','beacon','assembly'].includes(shape)?p*45:0;combatStamp(c,theme,x,y-lift,shape==='flames'?46:30,fx.age+i*.06,a+(shape==='flames'?-Math.PI/2:0))}
 }
 if(fx.kind==='meteorImpact'||fx.kind==='judgmentImpact'){c.strokeStyle=color;c.lineWidth=(1-p)*15+2;c.beginPath();c.moveTo(fx.x,fx.y-130*(1-p));c.lineTo(fx.x,fx.y);c.stroke();combatStamp(c,'impact',fx.x,fx.y,60,fx.age)}c.restore();
}
function drawCombatEffects(c,r){for(const f of r.combatFx||[])combatBurst(c,f)}
function drawCombatPickups(c,r){
 for(const chest of r.chests){const y=chest.y+Math.sin((r.time||0)*2+chest.x)*1.5;combatStamp(c,'sun',chest.x,y,32,r.time||0,0,.35);c.save();c.translate(chest.x,y);c.fillStyle='#35261f';c.fillRect(-10,-8,20,17);c.fillStyle='#8e6134';c.fillRect(-8,-6,16,13);c.fillStyle='#d6a54e';c.fillRect(-10,-3,20,3);c.fillRect(-7,-7,2,14);c.fillRect(5,-7,2,14);c.fillStyle='#fff0b4';c.fillRect(-2,-2,4,5);c.fillStyle='#d6a54e';c.fillRect(-9,-9,18,2);c.restore()}
 for(const d of r.drops){const y=d.y+Math.sin((r.time||0)*4+d.x)*2;combatStamp(c,'spirit',d.x,y,14,r.time||0,-Math.PI/2,.9)}
}
function drawCombatSentry(c,s,r){
 const target=r.enemies.filter(e=>e.hp>0).reduce((best,e)=>!best||Math.hypot(e.x-s.x,e.y-s.y)<Math.hypot(best.x-s.x,best.y-s.y)?e:best,null),a=target?Math.atan2(target.y-s.y,target.x-s.x):0;
 c.save();c.translate(s.x,s.y);c.strokeStyle='#9caeb3';c.lineWidth=3;for(const dx of [-13,13]){c.beginPath();c.moveTo(0,5);c.lineTo(dx,19);c.stroke()}c.fillStyle='#384957';c.fillRect(-10,-7,20,15);c.strokeStyle='#deb976';c.strokeRect(-10,-7,20,15);c.save();c.rotate(a);c.fillStyle='#748c9d';c.fillRect(1,-4,19,8);c.fillStyle='#b4dbf1';c.fillRect(17,-4,3,8);c.restore();combatStamp(c,'bolt',0,-1,21,r.time,0,.7);c.restore();combatRune(c,s.x,s.y+16,20,combatPalette.bolt,r.time,true);
}
const combatActionBefore=drawHeroAction;
drawHeroAction=function(c,r){combatActionBefore(c,r);const time=r.time||0,p=firingPoint(r),pending=r.skillPending||r.altPending;
 if(pending){const recipe=combatSkillRecipes[r.activeSkill]||combatSkillRecipes[skillBook[r.hero.classId][0][0]];combatRune(c,r.x,r.y+6,30,combatPalette[recipe.theme],time,true);combatStamp(c,recipe.theme,p.x,p.y,28,time)}
 for(const f of r.skillFields||[]){const theme=r.activeSkill==='renewal'?'heal':'sun';combatRune(c,f.x,f.y,f.r,combatPalette[theme],time,true);for(let i=0;i<(reducedMotion?4:8);i++){const a=i*Math.PI/4+time*.25,d=f.r*.6;combatStamp(c,theme,f.x+Math.cos(a)*d,f.y+Math.sin(a)*d*.55-((time*20+i*11)%38),23,time+i*.1)}}
 for(const task of r.skillTasks||[])if(task.kind==='impact'){const holy=r.activeSkill==='judgment',progress=Math.max(0,Math.min(1,1-task.left/1.1)),theme=holy?'sun':'void';combatRune(c,task.x,task.y,task.r,combatPalette[theme],time*2,true);const x=task.x-(holy?0:1-progress)*55,y=task.y-(1-progress)*180;combatStamp(c,theme,x,y,38,time,holy?Math.PI/2:.9);c.save();c.strokeStyle=combatPalette[theme];c.globalAlpha=.5;c.lineWidth=holy?4:2;c.beginPath();c.moveTo(x-(holy?0:24),y-45);c.lineTo(x,y);c.stroke();c.restore()}
 if(r.shield>0){combatRune(c,r.x,r.y+8,28,combatPalette.heal,time,true);for(let i=0;i<3;i++){const a=time+i*2.094;combatStamp(c,'heal',r.x+Math.cos(a)*27,r.y-25+Math.sin(a)*13,14,time)}}
 for(const b of r.burnZones||[])for(let i=0;i<(reducedMotion?3:6);i++){const a=i*2.4,d=b.r*.65;combatStamp(c,'flame',b.x+Math.cos(a)*d,b.y+Math.sin(a)*d*.6-8,26,time+i*.13,-Math.PI/2)}
 drawCombatBossForeground(c,r);drawCombatEffects(c,r);
};
const combatEnemyDrawBefore=drawEnemyMotion;
drawEnemyMotion=function(c,e,t){t=run?.time??t;const out=combatEnemyDrawBefore(c,e,t);if(e.dead||e.hp<=0)return out;const theme=enemyCombatTheme(e),color=combatPalette[theme],cast=e.bossCast||e.cast;
 if(cast){const progress=Math.max(0,Math.min(1,1-cast.left/cast.total)),y=e.y-e.size*.5;combatRune(c,e.x,e.y+12,e.size+12,color,t,true);combatStamp(c,theme,e.x,y,14+progress*(e.boss?38:20),t,Math.atan2((run?.y||e.y)-y,(run?.x||e.x)-e.x));for(let i=0;i<4;i++){const a=i*Math.PI/2+t*2,d=(1-progress)*28+10;combatStamp(c,'spark',e.x+Math.cos(a)*d,y+Math.sin(a)*d*.6,11,t+i*.1)}}
 if(e.contactWindup>0||e.chargeWindup>0){const a=e.chargeWindup>0?e.chargeAngle:Math.atan2((run?.y||e.y)-e.y,(run?.x||e.x)-e.x);c.save();c.strokeStyle=color;c.lineWidth=2;c.beginPath();c.arc(e.x,e.y-5,e.size+15,a-.75,a+.75);c.stroke();c.restore()}
 if(e.stun>0)for(let i=0;i<3;i++){const a=i*2.094+t*3;combatStamp(c,'spark',e.x+Math.cos(a)*15,e.y-(e.boss?120:55)+Math.sin(a)*5,12,t+i*.1)}return out};drawAnimatedEnemy=drawEnemyMotion;drawChapterEnemy=drawEnemyMotion;
// Six material palettes share the same warning language; impacts carry the identity.
const bossMaterials={
 thorn:{edge:'#a6ce7b',core:'#edf5c7',shade:'#263e32'},
 flame:{edge:'#f4a35c',core:'#fff0bf',shade:'#532b28'},
 frost:{edge:'#91c9e5',core:'#edfbff',shade:'#293e59'},
 bolt:{edge:'#b0b9f1',core:'#f4f0ff',shade:'#34304d'},
 spirit:{edge:'#87d6c8',core:'#e7fff4',shade:'#213d43'},
 blood:{edge:'#e28d9e',core:'#ffe8d3',shade:'#502a3e'}
};
function bossMaterial(theme){return bossMaterials[theme]||bossMaterials.spirit}
const bossMissileArt=new Map();
function drawBossMissile(c,s,theme,angle,age){
 if(!bossMissileArt.has(theme)){
  const a=document.createElement('canvas');a.width=72;a.height=40;const b=a.getContext('2d'),m=bossMaterial(theme);b.translate(36,20);
  const g=b.createRadialGradient(0,0,0,0,0,21);g.addColorStop(0,m.edge+'aa');g.addColorStop(1,m.edge+'00');b.fillStyle=g;b.fillRect(-30,-20,60,40);
  b.fillStyle=m.shade;b.strokeStyle=m.edge;b.lineWidth=1.3;b.beginPath();
  if(theme==='spirit'||theme==='blood'||theme==='flame'){b.moveTo(12,0);b.bezierCurveTo(7,-12,-6,-9,-20,-4);b.quadraticCurveTo(-7,-3,-17,5);b.bezierCurveTo(-3,3,7,11,12,0)}
  else{b.moveTo(15,0);b.lineTo(-5,-7);b.lineTo(-2,-2);b.lineTo(-22,0);b.lineTo(-2,2);b.lineTo(-5,7);b.closePath()}b.fill();b.stroke();
  b.strokeStyle=m.core;b.lineWidth=2;b.beginPath();b.moveTo(-12,0);b.lineTo(9,0);b.stroke();b.fillStyle=m.core;b.fillRect(8,-1,3,2);
  if(theme==='thorn'||theme==='bolt'){b.lineWidth=1;b.strokeStyle=m.edge;for(const sign of [-1,1]){b.beginPath();b.moveTo(0,0);b.lineTo(-8,sign*9);b.lineTo(-13,sign*5);b.stroke()}}
  bossMissileArt.set(theme,a);
 }
 c.save();c.translate(s.x,s.y);c.rotate(angle);c.drawImage(bossMissileArt.get(theme),-27,-15,54,30);c.restore();
}
function bossSigil(c,x,y,radius,mat,progress,kind='summon'){
 drawBossCircle(c,{x,y},radius,mat.edge,progress);
 c.save();c.translate(x,y);c.strokeStyle=mat.edge;c.lineWidth=1;c.beginPath();
 for(let i=0;i<=6;i++){const a=-Math.PI/2+i*Math.PI/3,d=i%2?radius*.63:radius*.76;c.lineTo(Math.cos(a)*d,Math.sin(a)*d)}c.stroke();
 if(kind==='blink'){c.strokeStyle=mat.core;c.beginPath();c.moveTo(0,-radius*.5);c.lineTo(radius*.3,0);c.lineTo(0,radius*.5);c.lineTo(-radius*.3,0);c.closePath();c.stroke()}c.restore();
}
drawBossSkillEffects=function(c,r,t){
 t=r.time||0;c.save();
 for(const e of r.enemies){const cast=e.bossCast;if(!e.boss||e.hp<=0||!cast)continue;
  const mat=bossMaterial(enemyCombatTheme(e)),p=Math.max(0,Math.min(1,1-cast.left/cast.total));
  for(const point of cast.points){const portal=['summon','eclipse'].includes(cast.kind);if(portal||cast.kind==='blink')bossSigil(c,point.x,point.y,portal?25:cast.radius,mat,p,cast.kind);else drawBossCircle(c,point,cast.radius,mat.edge,p)}
  for(const line of cast.lanes)drawBossLane(c,line,mat.edge,p);
  if(['ring','eclipse','nova','ritual'].includes(cast.kind)){
   const ring=cast.kind==='ring'||cast.kind==='eclipse',rad=ring?78:cast.radius;
   if(!ring){bossSigil(c,cast.origin.x,cast.origin.y,rad,mat,p,cast.kind)}
   else{
    // Both rails and every ornament stop at the safe wedge.
    const start=cast.gap+.43,end=cast.gap+Math.PI*2-.43;
    bossStroke(c,mat.edge,2,()=>c.arc(cast.origin.x,cast.origin.y,rad,start,end));
    bossStroke(c,mat.core,1.5,()=>c.arc(cast.origin.x,cast.origin.y,rad-7,start,start+(end-start)*p));
    for(const a of [start,end])bossStroke(c,mat.core,1,()=>{c.moveTo(cast.origin.x+Math.cos(a)*25,cast.origin.y+Math.sin(a)*25);c.lineTo(cast.origin.x+Math.cos(a)*(rad+9),cast.origin.y+Math.sin(a)*(rad+9))});
   }
  }
  if(cast.kind==='fan'){const spread=.55+bossProfile(e).tier*.06;for(const off of [-spread,0,spread]){const end=bossLaneEnd(r,cast.origin.x,cast.origin.y,cast.angle+off,240,5);drawBossLane(c,{...cast.origin,x2:end.x,y2:end.y,width:6},mat.edge,p)}}
 }
 // Active ground volumes retain the exact collision radius/width for their full lifetime.
 for(const f of r.bossFields||[]){const mat=bossMaterial(f.vfxTheme||enemyCombatTheme({chapter:r.chapter})),p=1-f.t/f.max;
  c.save();c.globalAlpha*=Math.min(1,f.t/.12);
  if(f.shape==='line')drawBossLane(c,f,mat.edge,1,true);
  else if(f.shape==='ring'){bossStroke(c,mat.edge,f.thickness||20,()=>c.arc(f.x,f.y,Math.max(.1,p*f.radius),0,Math.PI*2));bossStroke(c,mat.core,1.5,()=>c.arc(f.x,f.y,Math.max(.1,p*f.radius),0,Math.PI*2))}
  else{c.fillStyle=mat.shade+'b0';c.beginPath();c.arc(f.x,f.y,f.radius,0,Math.PI*2);c.fill();bossStroke(c,mat.edge,2,()=>c.arc(f.x,f.y,f.radius,0,Math.PI*2))}c.restore();
 }c.restore();
};
// Deterministic, faceted material fragments avoid tiled sprite wreaths and random flicker.
function bossFragment(c,theme,x,y,size,angle,alpha=1){
 const m=bossMaterial(theme);c.save();c.translate(x,y);c.rotate(angle);c.globalAlpha*=alpha;
 const body=c.createLinearGradient(-size*.3,0,size*.3,-size);body.addColorStop(0,m.shade);body.addColorStop(.55,m.edge+'bb');body.addColorStop(1,m.core);
 c.fillStyle=body;c.strokeStyle=m.edge;c.lineWidth=.8;
 c.beginPath();
 if(theme==='thorn'){c.moveTo(-size*.24,2);c.quadraticCurveTo(size*.12,-size*.4,0,-size);c.lineTo(size*.3,-size*.44);c.lineTo(size*.24,2)}
 else if(theme==='flame'){c.moveTo(-size*.3,0);c.quadraticCurveTo(-size*.55,-size*.5,0,-size);c.quadraticCurveTo(-size*.08,-size*.5,size*.26,-size*.55);c.quadraticCurveTo(size*.5,-size*.14,size*.2,0)}
 else{c.moveTo(0,-size);c.lineTo(size*.27,-size*.3);c.lineTo(size*.18,2);c.lineTo(-size*.2,0);c.lineTo(-size*.3,-size*.4)}
 c.closePath();c.fill();c.stroke();
 c.fillStyle=m.shade+'a0';c.beginPath();c.moveTo(0,-size*.85);c.lineTo(size*.21,-size*.3);c.lineTo(size*.16,0);c.lineTo(0,0);c.closePath();c.fill();
 c.strokeStyle=m.core;c.lineWidth=.8;c.beginPath();c.moveTo(0,-size*.12);c.lineTo(0,-size*.72);c.stroke();c.restore();
}
function drawBossRelease(c,fx){
 const p=Math.max(0,Math.min(1,fx.age/fx.life)),m=bossMaterial(fx.theme),portal=fx.kind==='portal',rad=portal?fx.radius:Math.min(58,fx.radius*.45),n=reducedMotion?4:8,kind=fx.mechanic;
 c.save();c.globalAlpha*=Math.pow(1-p,1.2);c.lineCap='round';
 if(fx.kind==='bossWake'){
  c.translate(fx.x,fx.y);c.rotate(fx.angle);const width=(fx.size||50)*.45;
  for(const side of [-1,1]){c.beginPath();c.moveTo(12,side*width);c.bezierCurveTo(-8,side*width,-30-p*40,side*width*.4,-40-p*45,0);c.strokeStyle=m.edge+'60';c.lineWidth=5;c.stroke();c.strokeStyle=m.core;c.lineWidth=1;c.stroke()}
  for(let i=0;i<3;i++)bossFragment(c,fx.theme,-p*25-i*9,(i-1)*width*.6,(8+i*3)*(1-p),-Math.PI/2,.7);
  c.restore();return;
 }
 if(portal){
  const h=Math.sin(Math.PI*Math.max(.02,p))*75;
  bossGlow(c,fx.x,fx.y-h*.6,rad,h+12,m,.7);
  c.fillStyle='#0b1720e8';c.strokeStyle=m.edge;c.lineWidth=2;c.beginPath();c.ellipse(fx.x,fx.y-h*.6,rad*.5,h+2,0,0,Math.PI*2);c.fill();c.stroke();
  c.strokeStyle=m.core;c.lineWidth=1;c.beginPath();c.ellipse(fx.x,fx.y-h*.6,rad*.36,h*.88+1,0,-Math.PI*.45,Math.PI*1.4);c.stroke();
  for(const side of [-1,1]){const art=bossEruptionSprite(fx.theme,side+1);c.drawImage(art,fx.x+side*rad*.8-rad*.3,fx.y-h*.95,rad*.6,h)}
  bossCrest(c,fx.x,fx.y-h*.65,rad*.4,m,p,fx.mechanic==='blink'?'blink':'summon');
  c.strokeStyle=m.edge;c.beginPath();c.ellipse(fx.x,fx.y,rad,rad*.45,0,0,Math.PI*2);c.stroke();
 }else if(kind==='ritual'){
  bossRitual(c,fx.x,fx.y,65,m,1,p);c.restore();return;
 }else if(kind==='ring'||kind==='eclipse'){
  const start=(fx.gap||0)+.43,end=(fx.gap||0)+Math.PI*2-.43,radius=38+p*65;
  if(kind==='eclipse'){bossGlow(c,fx.x,fx.y-35,50,60,m,.7);c.fillStyle='#10121ee0';c.strokeStyle=m.edge;c.lineWidth=2;c.beginPath();c.arc(fx.x,fx.y-35,22+Math.sin(p*Math.PI)*8,0,Math.PI*2);c.fill();c.stroke()}
  for(const [w,a] of [[8,.15],[3,.5],[1,1]]){c.save();c.globalAlpha*=a;c.strokeStyle=m.core;c.lineWidth=w;c.beginPath();c.arc(fx.x,fx.y,radius,start,end);c.stroke();c.restore()}
  for(let i=0;i<n;i++){const a=start+(end-start)*(i+.5)/n;bossFragment(c,fx.theme,fx.x+Math.cos(a)*radius,fx.y+Math.sin(a)*radius,17+8*Math.sin(p*Math.PI),a+Math.PI/2)}
  c.restore();return;
 }else if(['charge','fan','beam','lanes'].includes(kind)){
  c.translate(fx.x,fx.y);c.rotate(fx.angle||0);
  const spread=kind==='lanes'?.6:kind==='fan'?.45:0,count=spread?3:1;
  for(let i=0;i<count;i++){c.save();c.rotate((i-(count-1)/2)*spread);const reach=24+p*68;
   bossGlow(c,15,0,35,25,m,.6);c.strokeStyle=m.edge;c.lineWidth=3;c.beginPath();c.ellipse(10+p*22,0,10,22+14*p,0,-1.2,1.2);c.stroke();
   for(const side of [-1,1]){c.strokeStyle=m.core;c.lineWidth=1;c.beginPath();c.moveTo(5,side*14);c.quadraticCurveTo(reach*.4,side*25,reach,side*4);c.stroke();bossFragment(c,fx.theme,reach*.55,side*10,22,-Math.PI/2)}c.restore();
  }c.restore();return;
 }else if(kind==='blink'){
  const radius=rad*(1-p);bossGlow(c,fx.x,fx.y-25,rad,rad*1.5,m,.5);
  c.strokeStyle=m.edge;c.lineWidth=2;c.beginPath();c.ellipse(fx.x,fx.y-25,radius*.6,radius+1,0,0,Math.PI*2);c.stroke();
  for(let i=0;i<n;i++){const a=i*Math.PI*2/n;bossFragment(c,fx.theme,fx.x+Math.cos(a)*radius,fx.y-25+Math.sin(a)*radius,12*(1-p),a)}c.restore();return;
 }else if(kind==='summon'){
  bossCrest(c,fx.x,fx.y-65,28,m,p,'summon');bossGlow(c,fx.x,fx.y-35,45,65,m,.6);
 }else{
  // Slams, barrages, nova and rush endings get a brief grounded pressure crown.
  const radius=rad*(.4+p);bossGlow(c,fx.x,fx.y,rad*1.5,rad*.65,m,.6);
  c.strokeStyle=m.edge;c.lineWidth=2;c.beginPath();c.ellipse(fx.x,fx.y,radius,radius*.45,0,0,Math.PI*2);c.stroke();
  for(let i=0;i<n;i++){const a=i*Math.PI*2/n;bossFragment(c,fx.theme,fx.x+Math.cos(a)*radius,fx.y+Math.sin(a)*radius*.45,(kind==='nova'?28:18)*(1-p*.5),a*.3)}
 }
 for(let i=0;i<n;i++){const a=i*Math.PI*2/n,d=rad*(.3+p*.9),x=fx.x+Math.cos(a)*d,y=fx.y+Math.sin(a)*d*.45-p*18;bossFragment(c,fx.theme,x,y,(8+i%3*4)*(1-p*.5),Math.sin(i*3)*.6,.8)}
 c.restore();
}
function bossCrest(c,x,y,radius,m,progress,kind){
 c.save();c.translate(x,y);c.strokeStyle=m.edge;c.lineWidth=1.2;
 c.beginPath();c.arc(0,0,radius,0,Math.PI*2);c.stroke();
 c.beginPath();c.arc(0,0,radius*.8,-Math.PI/2,-Math.PI/2+Math.PI*2*Math.max(.01,progress));c.stroke();
 c.strokeStyle=m.core;c.beginPath();
 if(kind==='ritual'){c.moveTo(-radius*.4,0);c.lineTo(radius*.4,0);c.moveTo(0,-radius*.4);c.lineTo(0,radius*.4)}
 else{for(let i=0;i<=4;i++){const a=i*Math.PI/2-Math.PI/2;c.lineTo(Math.cos(a)*radius*.55,Math.sin(a)*radius*.55)}}c.stroke();
 for(let i=0;i<4;i++){const a=i*Math.PI/2;c.beginPath();c.moveTo(Math.cos(a)*radius*.9,Math.sin(a)*radius*.9);c.lineTo(Math.cos(a)*radius*1.2,Math.sin(a)*radius*1.2);c.stroke()}c.restore();
}
function bossRitual(c,x,y,radius,m,progress,age=0){
 c.save();bossGlow(c,x,y-30,radius,radius*1.2,m,.25+progress*.3);
 for(const side of [-1,1]){c.strokeStyle=m.edge;c.lineWidth=2;c.beginPath();c.moveTo(x+side*radius*.7,y);c.bezierCurveTo(x-side*radius*.6,y-25,x+side*radius*.65,y-55,x,y-90-progress*20);c.stroke();c.strokeStyle=m.core;c.lineWidth=.7;c.stroke()}
 bossCrest(c,x,y-90-progress*20,17+progress*8,m,progress,'ritual');
 for(let i=0;i<(reducedMotion?3:7);i++){const q=(i/7+age*.7)%1,a=i*2.4,d=radius*.65*(1-q);c.fillStyle=m.core;c.fillRect(x+Math.cos(a)*d,y-q*80+Math.sin(a)*d*.35,2,3)}c.restore();
}
// Bake material silhouettes once. Branches have lit faces and dark cores, so they
// retain volume at game resolution without a full-screen blur on every frame.
const bossEruptionArt=new Map();
function bossEruptionSprite(theme,variant=0){
 const key=theme+variant;if(bossEruptionArt.has(key))return bossEruptionArt.get(key);
 const art=document.createElement('canvas');art.width=160;art.height=192;
 const c=art.getContext('2d'),m=bossMaterial(theme);c.translate(80,176);
 const fill=c.createLinearGradient(-40,0,32,-145);fill.addColorStop(0,m.shade);fill.addColorStop(.44,'#17242b');fill.addColorStop(.68,theme==='thorn'?'#526a40':m.edge+'b0');fill.addColorStop(.78,m.shade);fill.addColorStop(1,m.edge);
 function limb(x,y,tx,ty,w,bend){
  c.beginPath();c.moveTo(x-w,y);c.bezierCurveTo(x+bend-w,y+(ty-y)*.35,tx-w*.4,ty+20,tx,ty);c.bezierCurveTo(tx+w*.7,ty+32,x+bend+w,y+(ty-y)*.5,x+w,y);c.closePath();
  c.fillStyle=fill;c.fill();c.strokeStyle=m.edge+'b0';c.lineWidth=.9;c.stroke();
  c.beginPath();c.moveTo(x+w*.2,y-2);c.bezierCurveTo(x+bend+w*.3,y+(ty-y)*.4,tx,ty+26,tx,ty+5);c.strokeStyle=m.core;c.lineWidth=1.1;c.stroke();
 }
 if(theme==='thorn'){
  for(let i=0;i<3;i++){const side=i===0?-1:1,x=(i-1)*22,h=i===1?164:112+variant*10,tip=x+side*(i===1?8:29);limb(x,0,tip,-h,i===1?23:16,side*16);
   for(let j=0;j<2;j++){const y=-31-j*30,root=x+side*j*5;limb(root,y,root+side*(30+j*6),y-33-j*5,6,side*7)}
  }
 }else if(theme==='flame'||theme==='spirit'||theme==='blood'){
  for(let i=0;i<7;i++){const x=(i-3)*10,h=70+(i*37+variant*23)%90,side=i%2?1:-1;limb(x,0,x+side*18,-h,theme==='spirit'?5:10,side*28)}
 }else if(theme==='frost'){
  for(let i=0;i<7;i++){const x=(i-3)*12,h=62+(i*31+variant*19)%95,w=8+i%3*3,lean=(i-3)*7;
   c.fillStyle=fill;c.beginPath();c.moveTo(x-w,0);c.lineTo(x+lean-w*.7,-h*.7);c.lineTo(x+lean,-h);c.lineTo(x+lean+w,-h*.72);c.lineTo(x+w,0);c.closePath();c.fill();c.strokeStyle=m.edge;c.stroke();
   c.fillStyle=m.core+'88';c.beginPath();c.moveTo(x+lean,-h);c.lineTo(x+lean+w,-h*.72);c.lineTo(x+w,0);c.lineTo(x+2,-8);c.closePath();c.fill();
  }
 }else{
  for(let i=0;i<5;i++){const x=(i-2)*19;c.beginPath();c.moveTo(x,0);for(let j=1;j<=6;j++)c.lineTo(x+Math.sin(i*8+j*5+variant)*20,-j*25);c.strokeStyle=m.edge+'70';c.lineWidth=9;c.stroke();c.strokeStyle=m.edge;c.lineWidth=3;c.stroke();c.strokeStyle=m.core;c.lineWidth=1;c.stroke()}
 }
 // Bark scoring / energy veins follow the silhouette rather than a repeating icon.
 c.globalCompositeOperation='source-atop';c.strokeStyle=m.core+'88';c.lineWidth=.7;
 for(let i=0;i<10;i++){const x=Math.sin(i*7.3+variant)*58,y=-12-(i*19)%135;c.beginPath();c.moveTo(x,y);c.lineTo(x+5,y-9);c.lineTo(x+1,y-18);c.lineTo(x+8,y-29);c.stroke()}
 c.globalCompositeOperation='source-over';bossEruptionArt.set(key,art);return art;
}
function bossGlow(c,x,y,rx,ry,m,strength){
 c.save();c.translate(x,y);c.scale(1,ry/rx);c.globalCompositeOperation='lighter';c.globalAlpha*=strength;
 const g=c.createRadialGradient(0,0,1,0,0,rx);g.addColorStop(0,m.core+'bc');g.addColorStop(.28,m.edge+'70');g.addColorStop(1,m.edge+'00');c.fillStyle=g;c.fillRect(-rx,-rx,rx*2,rx*2);c.restore();
}
function bossEruption(c,x,y,radius,theme,p,seed=0){
 const m=bossMaterial(theme),rise=1-Math.pow(1-Math.min(1,p/.28),3),fall=1-Math.max(0,(p-.62)/.38),height=(90+radius*.9)*rise*(.75+fall*.25),width=radius*2.05;
 if(height<.1)return;
 bossGlow(c,x,y,radius*1.65,radius*.8,m,(1-p)*.7);
 if(!reducedMotion)bossGlow(c,x,y-height*.35,radius*.45,height*.65,m,Math.max(0,1-p*2)*.55);
 // Ground tendrils break the perfect disc with irregular branching fissures.
 c.save();c.lineCap='round';
 for(let i=0;i<(reducedMotion?5:9);i++){const a=i*2.399+seed,reach=radius*(.55+(i%3)*.13);c.beginPath();c.moveTo(x,y);for(let j=1;j<5;j++){const d=reach*j/4,off=Math.sin(i*8+j*4)*5;c.lineTo(x+Math.cos(a)*d-Math.sin(a)*off,y+Math.sin(a)*d+Math.cos(a)*off)}c.strokeStyle=m.edge+'77';c.lineWidth=5*(1-p)+1;c.stroke();c.strokeStyle=m.core;c.lineWidth=.8;c.stroke()}
 // Rear growth, central crown, and near growth make one eruption read as a mass.
 for(const layer of [-1,0]){
  const sx=x+layer*radius*.35,sy=y+(layer===0?0:7),scale=layer===0?1:.7;
  c.globalAlpha*=layer===0?1:.82;
  const art=bossEruptionSprite(theme,(seed+layer+3)%3);c.drawImage(art,sx-width*scale/2,sy-height*scale*.92,width*scale,height*scale);
  if(layer!==0)c.globalAlpha/=.82;
 }
 // Ballistic debris has a rise and fall, with a quiet ground shadow underneath.
 const count=reducedMotion?4:12;
 for(let i=0;i<count;i++){const a=i*2.4+seed,d=radius*(.3+p*.75),dx=Math.cos(a)*d,dy=Math.sin(a)*d*.55,lift=Math.sin(p*Math.PI)*(18+(i%4)*11),s=2+i%3;
  c.globalAlpha*=.8;c.fillStyle='#07121980';c.beginPath();c.ellipse(x+dx,y+dy,s*1.5,1,0,0,Math.PI*2);c.fill();c.globalAlpha/=.8;
  c.save();c.translate(x+dx,y+dy-lift);c.rotate(i+p*2);c.fillStyle=m.shade;c.strokeStyle=m.edge;c.lineWidth=.7;c.beginPath();c.moveTo(-s,-s);c.lineTo(s,-s*.5);c.lineTo(s*.6,s);c.lineTo(-s*.8,s*.6);c.closePath();c.fill();c.stroke();c.restore();
 }
 c.globalCompositeOperation='lighter';c.strokeStyle=m.core;c.lineWidth=1.2;c.beginPath();c.ellipse(x,y,radius*.94,radius*.57,0,0,Math.PI*2);c.stroke();c.restore();
}
function bossGathering(c,r){
 for(const e of r.enemies){const cast=e.bossCast;if(!e.boss||e.hp<=0||!cast)continue;
  const p=Math.max(0,Math.min(1,1-cast.left/cast.total)),m=bossMaterial(enemyCombatTheme(e));
  const points=cast.points.length?cast.points:[cast.origin];
  c.save();c.globalAlpha*=.25+p*.5;
  for(const point of points){const rad=['summon','eclipse'].includes(cast.kind)?25:Math.min(55,cast.radius);
   bossGlow(c,point.x,point.y,rad*1.2,rad*.5,m,p*.45);
   for(let i=0;i<(reducedMotion?3:7);i++){const a=i*2.4+(reducedMotion?0:p*1.2),d=rad*(.3+(i%3)*.25),x=point.x+Math.cos(a)*d,y=point.y+Math.sin(a)*d*.5,h=(12+i%3*9)*p;
    c.strokeStyle=m.edge+'55';c.lineWidth=1;c.beginPath();c.moveTo(x,y);c.lineTo(x,y-h);c.stroke();c.fillStyle=m.core;c.fillRect(Math.round(x),Math.round(y-h),1,2);
   }
  }
  // Crown-like charge halo stays behind the boss's face and weapon.
  const y=e.y-e.size*.6;c.strokeStyle=m.edge;c.lineWidth=1;c.beginPath();c.ellipse(e.x,y,18+p*13,32+p*18,cast.angle,Math.PI*.15,Math.PI*1.85);c.stroke();
  if(cast.kind==='ritual'){
   bossRitual(c,e.x,e.y,cast.radius,m,p,p);
   c.font='11px Georgia';c.textAlign='center';c.fillStyle='#0b1720dd';c.fillRect(e.x-53,e.y+cast.radius+5,106,19);c.fillStyle=m.core;c.fillText('Interrupt the ritual',e.x,e.y+cast.radius+18);
  }else if(cast.kind==='summon'||cast.kind==='eclipse'){
   for(const point of cast.points){bossCrest(c,point.x,point.y-18-p*26,12+p*7,m,p,'summon');for(const side of [-1,1]){c.strokeStyle=m.edge+'80';c.beginPath();c.moveTo(point.x+side*20,point.y);c.quadraticCurveTo(point.x+side*25,point.y-30,point.x+side*8,point.y-40-p*18);c.stroke()}}
  }
  if(cast.kind==='ring'||cast.kind==='eclipse'||cast.kind==='nova'){
   const ring=cast.kind!=='nova',start=ring?cast.gap+.43:0,end=ring?cast.gap+Math.PI*2-.43:Math.PI*2,rad=ring?78:cast.radius;
   for(let i=0;i<(reducedMotion?4:8);i++){const a=start+(end-start)*(i+.5)/(reducedMotion?4:8);bossFragment(c,enemyCombatTheme(e),cast.origin.x+Math.cos(a)*rad,cast.origin.y+Math.sin(a)*rad,5+p*13,a+Math.PI/2,.7)}
  }
  if(['charge','fan','beam','lanes'].includes(cast.kind)){
   const focus={x:e.x+Math.cos(cast.angle)*(e.size+12),y:e.y+Math.sin(cast.angle)*(e.size+12)};
   bossCrest(c,focus.x,focus.y-15,9+p*12,m,p,'blink');
   for(const side of [-1,1]){const a=cast.angle+side*.65;c.strokeStyle=m.edge;c.beginPath();c.moveTo(e.x+Math.cos(a)*25,e.y+Math.sin(a)*25);c.quadraticCurveTo(focus.x+Math.cos(a)*20,focus.y+Math.sin(a)*20,focus.x,focus.y-15);c.stroke()}
  }
  c.restore();
 }
}
function bossRushAura(c,r){
 for(const e of r.enemies){if(!e.bossDash||!e.boss||e.hp<=0)continue;const m=bossMaterial(enemyCombatTheme(e)),a=e.chargeAngle||0,rad=e.size+12;
  c.save();bossGlow(c,e.x,e.y,rad*1.2,rad*.7,m,.5);
  for(const side of [-1,1]){c.beginPath();c.arc(e.x,e.y,rad,a+side*.3,a+side*1.1,side<0);c.strokeStyle=m.edge+'55';c.lineWidth=7;c.stroke();c.strokeStyle=m.core;c.lineWidth=1.3;c.stroke();const angle=a+side*.5;bossFragment(c,enemyCombatTheme(e),e.x+Math.cos(angle)*rad,e.y+Math.sin(angle)*rad,27,angle+Math.PI/2)}
  c.restore();
 }
}
function drawCombatBossForeground(c,r){
 bossGathering(c,r);bossRushAura(c,r);
 for(const f of r.bossFields||[]){const p=Math.max(0,Math.min(1,1-f.t/f.max)),theme=f.vfxTheme||enemyCombatTheme({chapter:r.chapter}),m=bossMaterial(theme),fade=Math.min(1,f.t/.18),lift=Math.sin(Math.min(1,p*1.8)*Math.PI/2);
  c.save();c.globalAlpha*=fade;
  if(f.shape==='line'){
   const dx=f.x2-f.x,dy=f.y2-f.y,a=Math.atan2(dy,dx),n=Math.min(14,Math.ceil(Math.hypot(dx,dy)/27));
   // A hot central stream and material plumes distinguish release from the tell.
   c.save();c.globalCompositeOperation='lighter';c.lineCap='round';
   for(const [width,alpha] of [[f.width*.7,.12],[f.width*.3,.25],[2,.85]]){c.strokeStyle=m.core;c.lineWidth=width;c.globalAlpha=fade*alpha;c.beginPath();c.moveTo(f.x,f.y);c.lineTo(f.x2,f.y2);c.stroke()}c.restore();
   c.save();c.translate(f.x,f.y);c.rotate(a);c.strokeStyle=m.core;c.lineWidth=1.5;c.beginPath();c.moveTo(0,0);
   for(let i=1;i<=n;i++)c.lineTo(Math.hypot(dx,dy)*i/n,i===n?0:Math.sin(i*8.2)*f.width*.2);c.stroke();c.restore();
   for(let i=1;i<n;i++){const q=i/n;if(theme==='bolt'){c.fillStyle=m.core;c.fillRect(f.x+dx*q-1,f.y+dy*q-3,2,6)}else bossFragment(c,theme,f.x+dx*q,f.y+dy*q,12+lift*19+Math.sin(i*3)*5,theme==='thorn'?Math.sin(i*2)*.4:a+Math.PI/2,.8)}
   if(theme!=='bolt')for(let i=1;i<4;i++){const q=i/4,h=(32+f.width)*lift,art=bossEruptionSprite(theme,i%3);c.globalAlpha*=.8;c.drawImage(art,f.x+dx*q-f.width*.55,f.y+dy*q-h*.9,f.width*1.1,h);c.globalAlpha/=.8}
  }else if(f.shape==='ring'){
   const rad=p*f.radius,n=reducedMotion?8:16;
   // The moving edge carries the energy. The interior remains visually quiet.
   for(const [width,alpha] of [[(f.thickness||20)*1.1,.12],[5,.3],[1,.8]]){c.save();c.globalCompositeOperation='lighter';c.globalAlpha*=alpha;c.strokeStyle=m.core;c.lineWidth=width;c.beginPath();c.arc(f.x,f.y,Math.max(.1,rad),0,Math.PI*2);c.stroke();c.restore()}
   for(let i=0;i<n;i++){const a=i*Math.PI*2/n,x=f.x+Math.cos(a)*rad,y=f.y+Math.sin(a)*rad;
    bossFragment(c,theme,x,y,13+(1-p)*18,a+Math.PI/2,.8);
    if(i%2===0&&rad>12){const art=bossEruptionSprite(theme,i%3),h=16+(1-p)*26;c.globalAlpha*=.65;c.drawImage(art,x-10,y-h*.9,20,h);c.globalAlpha/=.65}
   }
  }else bossEruption(c,f.x,f.y,f.radius,theme,p,Math.abs(Math.round(f.x+f.y))%3);
  // Small rising debris, with no frame-dependent randomness or persistent allocations.
  for(let i=0;i<(reducedMotion?2:5);i++){const a=i*2.4,d=(f.radius||f.width||30)*.45,x=f.x+Math.cos(a)*d,y=f.y+Math.sin(a)*d-p*35;c.fillStyle=i%2?m.edge:m.core;c.globalAlpha=fade*(1-p)*.8;c.fillRect(Math.round(x),Math.round(y),i%2?2:1,2)}c.restore();
 }
}


const weaponAttackAdditions={"attackv3_fists":{"weapon":"fists","hero":"rook","frames":8,"width":256,"height":192,"anchor":[96,160],"release":4,"attackDuration":0.48,"skillDuration":0.96,"completeBody":true,"source":"brawler-source.png","points":[{"muzzle":[62.288065843621396,-58.748971193415635],"footX":25,"footY":249},{"muzzle":[65.65020576131687,-21.588477366255145],"footX":19.5,"footY":243},{"muzzle":[64.05761316872427,-49.901234567901234],"footX":19,"footY":243},{"muzzle":[65.65020576131687,-56.62551440329218],"footX":20.5,"footY":232},{"muzzle":[67.06584362139918,-63.7037037037037],"footX":106.5,"footY":235},{"muzzle":[76.44444444444444,-56.27160493827161],"footX":21,"footY":230},{"muzzle":[59.2798353909465,-54.8559670781893],"footX":19.5,"footY":238},{"muzzle":[57.15637860082305,-58.39506172839506],"footX":24.5,"footY":248}],"registration":{"scale":0.35390946502057613,"poses":[{"sx":0,"sy":0,"sw":210,"sh":253,"minX":0,"minY":0,"maxX":209,"maxY":252,"footX":25,"footY":249,"tipX":201,"tipY":83,"sourceX":23,"sourceY":25},{"sx":0,"sy":0,"sw":239,"sh":248,"minX":0,"minY":0,"maxX":238,"maxY":247,"footX":19.5,"footY":243,"tipX":205,"tipY":182,"sourceX":241,"sourceY":31},{"sx":0,"sy":0,"sw":231,"sh":247,"minX":0,"minY":0,"maxX":230,"maxY":246,"footX":19,"footY":243,"tipX":200,"tipY":102,"sourceX":496,"sourceY":32},{"sx":0,"sy":0,"sw":227,"sh":236,"minX":0,"minY":0,"maxX":226,"maxY":235,"footX":20.5,"footY":232,"tipX":206,"tipY":72,"sourceX":738,"sourceY":43},{"sx":0,"sy":0,"sw":301,"sh":240,"minX":0,"minY":0,"maxX":300,"maxY":239,"footX":106.5,"footY":235,"tipX":296,"tipY":55,"sourceX":976,"sourceY":39},{"sx":0,"sy":0,"sw":242,"sh":234,"minX":0,"minY":0,"maxX":241,"maxY":233,"footX":21,"footY":230,"tipX":237,"tipY":71,"sourceX":1239,"sourceY":45},{"sx":0,"sy":0,"sw":195,"sh":243,"minX":0,"minY":0,"maxX":194,"maxY":242,"footX":19.5,"footY":238,"tipX":187,"tipY":83,"sourceX":1476,"sourceY":36},{"sx":0,"sy":0,"sw":202,"sh":253,"minX":0,"minY":0,"maxX":201,"maxY":252,"footX":24.5,"footY":248,"tipX":186,"tipY":83,"sourceX":1675,"sourceY":26}]}},"attackv3_thunder":{"weapon":"thunder","hero":"rook","frames":8,"width":256,"height":192,"anchor":[96,160],"release":4,"attackDuration":0.48,"skillDuration":0.96,"completeBody":true,"source":"brawler-source.png","points":[{"muzzle":[61.58024691358025,-61.934156378600825],"footX":25,"footY":250},{"muzzle":[65.29629629629629,-23.004115226337447],"footX":19.5,"footY":243},{"muzzle":[63.7037037037037,-21.588477366255145],"footX":20,"footY":243},{"muzzle":[64.41152263374485,-58.748971193415635],"footX":21,"footY":232},{"muzzle":[94.49382716049382,-58.748971193415635],"footX":22,"footY":236},{"muzzle":[73.96707818930041,-57.333333333333336],"footX":20,"footY":230},{"muzzle":[59.10288065843621,-56.62551440329218],"footX":20,"footY":238},{"muzzle":[55.38683127572016,-61.934156378600825],"footX":25.5,"footY":249}],"registration":{"scale":0.35390946502057613,"poses":[{"sx":0,"sy":0,"sw":215,"sh":254,"minX":0,"minY":0,"maxX":214,"maxY":253,"footX":25,"footY":250,"tipX":199,"tipY":75,"sourceX":23,"sourceY":303},{"sx":0,"sy":0,"sw":238,"sh":247,"minX":0,"minY":0,"maxX":237,"maxY":246,"footX":19.5,"footY":243,"tipX":204,"tipY":178,"sourceX":241,"sourceY":310},{"sx":0,"sy":0,"sw":231,"sh":246,"minX":0,"minY":0,"maxX":230,"maxY":245,"footX":20,"footY":243,"tipX":200,"tipY":182,"sourceX":496,"sourceY":311},{"sx":0,"sy":0,"sw":227,"sh":235,"minX":0,"minY":0,"maxX":226,"maxY":234,"footX":21,"footY":232,"tipX":203,"tipY":66,"sourceX":738,"sourceY":322},{"sx":0,"sy":0,"sw":309,"sh":239,"minX":0,"minY":0,"maxX":308,"maxY":238,"footX":22,"footY":236,"tipX":289,"tipY":70,"sourceX":976,"sourceY":318},{"sx":0,"sy":0,"sw":248,"sh":233,"minX":0,"minY":0,"maxX":247,"maxY":232,"footX":20,"footY":230,"tipX":229,"tipY":68,"sourceX":1239,"sourceY":324},{"sx":0,"sy":0,"sw":200,"sh":242,"minX":0,"minY":0,"maxX":199,"maxY":241,"footX":20,"footY":238,"tipX":187,"tipY":78,"sourceX":1476,"sourceY":315},{"sx":0,"sy":0,"sw":201,"sh":253,"minX":0,"minY":0,"maxX":200,"maxY":252,"footX":25.5,"footY":249,"tipX":182,"tipY":74,"sourceX":1675,"sourceY":304}]}},"attackv3_titan":{"weapon":"titan","hero":"rook","frames":8,"width":256,"height":192,"anchor":[96,160],"release":4,"attackDuration":0.48,"skillDuration":0.96,"completeBody":true,"source":"brawler-source.png","points":[{"muzzle":[63.789256198347104,-59.70247933884297],"footX":26.5,"footY":249},{"muzzle":[67.69834710743801,-55.438016528925615],"footX":19.5,"footY":242},{"muzzle":[64.32231404958678,-50.107438016528924],"footX":19,"footY":245},{"muzzle":[66.8099173553719,-54.37190082644628],"footX":22,"footY":235},{"muzzle":[100.21487603305785,-64.32231404958678],"footX":20,"footY":236},{"muzzle":[79.9586776859504,-60.05785123966942],"footX":18,"footY":231},{"muzzle":[62.01239669421487,-54.72727272727273],"footX":19.5,"footY":238},{"muzzle":[60.05785123966942,-57.925619834710744],"footX":24,"footY":249}],"registration":{"scale":0.35537190082644626,"poses":[{"sx":0,"sy":0,"sw":211,"sh":253,"minX":0,"minY":0,"maxX":210,"maxY":252,"footX":26.5,"footY":249,"tipX":206,"tipY":81,"sourceX":23,"sourceY":583},{"sx":0,"sy":0,"sw":239,"sh":247,"minX":0,"minY":0,"maxX":238,"maxY":246,"footX":19.5,"footY":242,"tipX":210,"tipY":86,"sourceX":241,"sourceY":589},{"sx":0,"sy":0,"sw":231,"sh":247,"minX":0,"minY":0,"maxX":230,"maxY":246,"footX":19,"footY":245,"tipX":200,"tipY":104,"sourceX":496,"sourceY":589},{"sx":0,"sy":0,"sw":227,"sh":237,"minX":0,"minY":0,"maxX":226,"maxY":236,"footX":22,"footY":235,"tipX":210,"tipY":82,"sourceX":738,"sourceY":599},{"sx":0,"sy":0,"sw":310,"sh":239,"minX":0,"minY":0,"maxX":309,"maxY":238,"footX":20,"footY":236,"tipX":302,"tipY":55,"sourceX":976,"sourceY":597},{"sx":0,"sy":0,"sw":247,"sh":233,"minX":0,"minY":0,"maxX":246,"maxY":232,"footX":18,"footY":231,"tipX":243,"tipY":62,"sourceX":1239,"sourceY":603},{"sx":0,"sy":0,"sw":198,"sh":242,"minX":0,"minY":0,"maxX":197,"maxY":241,"footX":19.5,"footY":238,"tipX":194,"tipY":84,"sourceX":1476,"sourceY":594},{"sx":0,"sy":0,"sw":202,"sh":253,"minX":0,"minY":0,"maxX":201,"maxY":252,"footX":24,"footY":249,"tipX":193,"tipY":86,"sourceX":1675,"sourceY":583}]}},"attackv3_wand":{"weapon":"wand","hero":"orin","frames":8,"width":256,"height":192,"anchor":[96,160],"release":4,"attackDuration":0.58,"skillDuration":0.96,"completeBody":true,"source":"mage-source.png","points":[{"muzzle":[64.56521739130434,-60.26086956521739],"footX":30,"footY":232},{"muzzle":[45.58695652173913,-60.652173913043484],"footX":85.5,"footY":216},{"muzzle":[53.21739130434783,-90.3913043478261],"footX":16,"footY":238},{"muzzle":[61.630434782608695,-101.34782608695653],"footX":24.5,"footY":269},{"muzzle":[105.06521739130436,-64.95652173913044],"footX":25.5,"footY":221},{"muzzle":[49.69565217391305,-68.86956521739131],"footX":31,"footY":225},{"muzzle":[63.58695652173913,-21.91304347826087],"footX":23.5,"footY":230},{"muzzle":[65.34782608695653,-59.869565217391305],"footX":28,"footY":226}],"registration":{"scale":0.391304347826087,"poses":[{"sx":0,"sy":0,"sw":198,"sh":236,"minX":0,"minY":0,"maxX":197,"maxY":235,"footX":30,"footY":232,"tipX":195,"tipY":78,"sourceX":13,"sourceY":58},{"sx":0,"sy":0,"sw":206,"sh":220,"minX":0,"minY":0,"maxX":205,"maxY":219,"footX":85.5,"footY":216,"tipX":202,"tipY":61,"sourceX":232,"sourceY":73},{"sx":0,"sy":0,"sw":179,"sh":242,"minX":0,"minY":0,"maxX":178,"maxY":241,"footX":16,"footY":238,"tipX":152,"tipY":7,"sourceX":460,"sourceY":51},{"sx":0,"sy":0,"sw":186,"sh":273,"minX":0,"minY":0,"maxX":185,"maxY":272,"footX":24.5,"footY":269,"tipX":182,"tipY":10,"sourceX":659,"sourceY":20},{"sx":0,"sy":0,"sw":298,"sh":225,"minX":0,"minY":0,"maxX":297,"maxY":224,"footX":25.5,"footY":221,"tipX":294,"tipY":55,"sourceX":872,"sourceY":68},{"sx":0,"sy":0,"sw":212,"sh":229,"minX":0,"minY":0,"maxX":211,"maxY":228,"footX":31,"footY":225,"tipX":158,"tipY":49,"sourceX":1115,"sourceY":64},{"sx":0,"sy":0,"sw":190,"sh":234,"minX":0,"minY":0,"maxX":189,"maxY":233,"footX":23.5,"footY":230,"tipX":186,"tipY":174,"sourceX":1355,"sourceY":59},{"sx":0,"sy":0,"sw":199,"sh":230,"minX":0,"minY":0,"maxX":198,"maxY":229,"footX":28,"footY":226,"tipX":195,"tipY":73,"sourceX":1570,"sourceY":64}]}},"attackv3_frost":{"weapon":"frost","hero":"orin","frames":8,"width":256,"height":192,"anchor":[96,160],"release":4,"attackDuration":0.58,"skillDuration":0.96,"completeBody":true,"source":"mage-source.png","points":[{"muzzle":[85.26315789473685,-66.3157894736842],"footX":28,"footY":235},{"muzzle":[79.14473684210526,-61.578947368421055],"footX":18.5,"footY":217},{"muzzle":[67.5,-109.34210526315789],"footX":26,"footY":289},{"muzzle":[73.02631578947368,-105],"footX":23,"footY":280},{"muzzle":[116.64473684210526,-77.76315789473685],"footX":34.5,"footY":226},{"muzzle":[87.63157894736842,-50.526315789473685],"footX":32,"footY":226},{"muzzle":[70.0657894736842,-16.57894736842105],"footX":27.5,"footY":228},{"muzzle":[67.5,-63.15789473684211],"footX":27,"footY":227}],"registration":{"scale":0.39473684210526316,"poses":[{"sx":0,"sy":0,"sw":247,"sh":239,"minX":0,"minY":0,"maxX":246,"maxY":238,"footX":28,"footY":235,"tipX":244,"tipY":67,"sourceX":11,"sourceY":350},{"sx":0,"sy":0,"sw":223,"sh":221,"minX":0,"minY":0,"maxX":222,"maxY":220,"footX":18.5,"footY":217,"tipX":219,"tipY":61,"sourceX":234,"sourceY":368},{"sx":0,"sy":0,"sw":201,"sh":293,"minX":0,"minY":0,"maxX":200,"maxY":292,"footX":26,"footY":289,"tipX":197,"tipY":12,"sourceX":449,"sourceY":296},{"sx":0,"sy":0,"sw":214,"sh":286,"minX":0,"minY":0,"maxX":213,"maxY":285,"footX":23,"footY":280,"tipX":208,"tipY":14,"sourceX":661,"sourceY":305},{"sx":0,"sy":0,"sw":334,"sh":230,"minX":0,"minY":0,"maxX":333,"maxY":229,"footX":34.5,"footY":226,"tipX":330,"tipY":29,"sourceX":860,"sourceY":359},{"sx":0,"sy":0,"sw":258,"sh":230,"minX":0,"minY":0,"maxX":257,"maxY":229,"footX":32,"footY":226,"tipX":254,"tipY":98,"sourceX":1108,"sourceY":359},{"sx":0,"sy":0,"sw":209,"sh":232,"minX":0,"minY":0,"maxX":208,"maxY":231,"footX":27.5,"footY":228,"tipX":205,"tipY":186,"sourceX":1349,"sourceY":357},{"sx":0,"sy":0,"sw":202,"sh":231,"minX":0,"minY":0,"maxX":201,"maxY":230,"footX":27,"footY":227,"tipX":198,"tipY":67,"sourceX":1570,"sourceY":358}]}},"attackv3_ember":{"weapon":"ember","hero":"orin","frames":8,"width":256,"height":192,"anchor":[96,160],"release":4,"attackDuration":0.58,"skillDuration":0.96,"completeBody":true,"source":"mage-source.png","points":[{"muzzle":[74.070796460177,-76.06194690265487],"footX":28,"footY":228},{"muzzle":[82.83185840707965,-72.87610619469027],"footX":15,"footY":216},{"muzzle":[74.46902654867257,-107.52212389380531],"footX":16,"footY":279},{"muzzle":[72.27876106194691,-107.12389380530973],"footX":23.5,"footY":283},{"muzzle":[117.27876106194691,-82.0353982300885],"footX":23.5,"footY":220},{"muzzle":[66.50442477876106,-55.75221238938053],"footX":28,"footY":225},{"muzzle":[72.07964601769912,-15.132743362831858],"footX":24,"footY":226},{"muzzle":[68.49557522123894,-74.46902654867257],"footX":28,"footY":225}],"registration":{"scale":0.39823008849557523,"poses":[{"sx":0,"sy":0,"sw":219,"sh":232,"minX":0,"minY":0,"maxX":218,"maxY":231,"footX":28,"footY":228,"tipX":214,"tipY":37,"sourceX":9,"sourceY":646},{"sx":0,"sy":0,"sw":229,"sh":219,"minX":0,"minY":0,"maxX":228,"maxY":218,"footX":15,"footY":216,"tipX":223,"tipY":33,"sourceX":223,"sourceY":658},{"sx":0,"sy":0,"sw":209,"sh":283,"minX":0,"minY":0,"maxX":208,"maxY":282,"footX":16,"footY":279,"tipX":203,"tipY":9,"sourceX":466,"sourceY":595},{"sx":0,"sy":0,"sw":210,"sh":287,"minX":0,"minY":0,"maxX":209,"maxY":286,"footX":23.5,"footY":283,"tipX":205,"tipY":14,"sourceX":665,"sourceY":591},{"sx":0,"sy":0,"sw":323,"sh":224,"minX":0,"minY":0,"maxX":322,"maxY":223,"footX":23.5,"footY":220,"tipX":318,"tipY":14,"sourceX":867,"sourceY":654},{"sx":0,"sy":0,"sw":228,"sh":229,"minX":0,"minY":0,"maxX":227,"maxY":228,"footX":28,"footY":225,"tipX":195,"tipY":85,"sourceX":1116,"sourceY":649},{"sx":0,"sy":0,"sw":211,"sh":230,"minX":0,"minY":0,"maxX":210,"maxY":229,"footX":24,"footY":226,"tipX":205,"tipY":188,"sourceX":1357,"sourceY":648},{"sx":0,"sy":0,"sw":204,"sh":229,"minX":0,"minY":0,"maxX":203,"maxY":228,"footX":28,"footY":225,"tipX":200,"tipY":38,"sourceX":1570,"sourceY":649}]}},"attackv3_dawnseeker":{"weapon":"dawnseeker","hero":"brann","frames":8,"width":256,"height":192,"anchor":[96,160],"release":4,"attackDuration":0.58,"skillDuration":0.96,"completeBody":true,"source":"dawnseeker-source.png","points":[{"muzzle":[41.95110024449878,-80.5281173594132],"footX":102.5,"footY":413},{"muzzle":[76.92909535452323,-71.75550122249389],"footX":24,"footY":390},{"muzzle":[29.466992665036678,-32.16625916870416],"footX":155,"footY":384},{"muzzle":[58.82151589242054,-80.75305623471883],"footX":143.5,"footY":427},{"muzzle":[110.66992665036675,-59.83374083129585],"footX":23,"footY":335},{"muzzle":[106.95843520782397,-47.23716381418093],"footX":25.5,"footY":284},{"muzzle":[44.312958435207825,-77.15403422982885],"footX":129,"footY":409},{"muzzle":[43.18826405867971,-79.85330073349634],"footX":108,"footY":413}],"registration":{"scale":0.22493887530562348,"poses":[{"sx":0,"sy":0,"sw":297,"sh":418,"minX":0,"minY":0,"maxX":296,"maxY":417,"footX":102.5,"footY":413,"tipX":289,"tipY":55,"sourceX":113,"sourceY":25},{"sx":0,"sy":0,"sw":372,"sh":395,"minX":0,"minY":0,"maxX":371,"maxY":394,"footX":24,"footY":390,"tipX":366,"tipY":71,"sourceX":508,"sourceY":47},{"sx":0,"sy":0,"sw":298,"sh":389,"minX":0,"minY":0,"maxX":297,"maxY":388,"footX":155,"footY":384,"tipX":286,"tipY":241,"sourceX":912,"sourceY":54},{"sx":0,"sy":0,"sw":413,"sh":432,"minX":0,"minY":0,"maxX":412,"maxY":431,"footX":143.5,"footY":427,"tipX":405,"tipY":68,"sourceX":1336,"sourceY":10},{"sx":0,"sy":0,"sw":522,"sh":340,"minX":0,"minY":0,"maxX":521,"maxY":339,"footX":23,"footY":335,"tipX":515,"tipY":69,"sourceX":22,"sourceY":525},{"sx":0,"sy":0,"sw":507,"sh":289,"minX":0,"minY":0,"maxX":506,"maxY":288,"footX":25.5,"footY":284,"tipX":501,"tipY":74,"sourceX":488,"sourceY":579},{"sx":0,"sy":0,"sw":336,"sh":414,"minX":0,"minY":0,"maxX":335,"maxY":413,"footX":129,"footY":409,"tipX":326,"tipY":66,"sourceX":964,"sourceY":454},{"sx":0,"sy":0,"sw":308,"sh":418,"minX":0,"minY":0,"maxX":307,"maxY":417,"footX":108,"footY":413,"tipX":300,"tipY":58,"sourceX":1440,"sourceY":450}]}},"attackv3_storm":{"weapon":"storm","hero":"nyx","frames":8,"width":256,"height":192,"anchor":[96,160],"release":4,"attackDuration":0.58,"skillDuration":0.96,"completeBody":true,"source":"storm-source.png","points":[{"muzzle":[75.31172069825436,-69.32668329177058],"footX":48,"footY":386},{"muzzle":[50,-73.81546134663341],"footX":161.5,"footY":396},{"muzzle":[57.730673316708234,-64.08977556109726],"footX":151.5,"footY":416},{"muzzle":[54.48877805486285,-69.82543640897757],"footX":166.5,"footY":427},{"muzzle":[59.85037406483791,-66.08478802992519],"footX":172,"footY":420},{"muzzle":[93.89027431421447,-62.59351620947631],"footX":46.5,"footY":401},{"muzzle":[67.70573566084788,-51.62094763092269],"footX":59.5,"footY":350},{"muzzle":[72.81795511221945,-66.83291770573567],"footX":47,"footY":381}],"registration":{"scale":0.24937655860349128,"poses":[{"sx":0,"sy":0,"sw":355,"sh":391,"minX":0,"minY":0,"maxX":354,"maxY":390,"footX":48,"footY":386,"tipX":350,"tipY":108,"sourceX":42,"sourceY":48},{"sx":0,"sy":0,"sw":367,"sh":401,"minX":0,"minY":0,"maxX":366,"maxY":400,"footX":161.5,"footY":396,"tipX":362,"tipY":100,"sourceX":493,"sourceY":38},{"sx":0,"sy":0,"sw":389,"sh":421,"minX":0,"minY":0,"maxX":388,"maxY":420,"footX":151.5,"footY":416,"tipX":383,"tipY":159,"sourceX":939,"sourceY":18},{"sx":0,"sy":0,"sw":389,"sh":432,"minX":0,"minY":0,"maxX":388,"maxY":431,"footX":166.5,"footY":427,"tipX":385,"tipY":147,"sourceX":1368,"sourceY":7},{"sx":0,"sy":0,"sw":415,"sh":425,"minX":0,"minY":0,"maxX":414,"maxY":424,"footX":172,"footY":420,"tipX":412,"tipY":155,"sourceX":23,"sourceY":445},{"sx":0,"sy":0,"sw":427,"sh":406,"minX":0,"minY":0,"maxX":426,"maxY":405,"footX":46.5,"footY":401,"tipX":423,"tipY":150,"sourceX":458,"sourceY":463},{"sx":0,"sy":0,"sw":338,"sh":354,"minX":0,"minY":0,"maxX":337,"maxY":353,"footX":59.5,"footY":350,"tipX":331,"tipY":143,"sourceX":936,"sourceY":523},{"sx":0,"sy":0,"sw":344,"sh":385,"minX":0,"minY":0,"maxX":343,"maxY":384,"footX":47,"footY":381,"tipX":339,"tipY":113,"sourceX":1376,"sourceY":492}]}},"attackv3_scepter":{"weapon":"scepter","hero":"sera","frames":8,"width":256,"height":192,"anchor":[96,160],"release":4,"attackDuration":0.58,"skillDuration":0.96,"completeBody":true,"source":"healer_rods-source.png","points":[{"muzzle":[59.47663551401869,-65.10280373831776],"footX":37,"footY":218},{"muzzle":[81.17757009345794,-65.10280373831776],"footX":22,"footY":215},{"muzzle":[71.53271028037383,-22.102803738317757],"footX":29,"footY":212},{"muzzle":[79.36915887850468,-79.97196261682242],"footX":28.5,"footY":214},{"muzzle":[83.58878504672897,-71.53271028037383],"footX":98,"footY":200},{"muzzle":[105.08878504672897,-69.5233644859813],"footX":23.5,"footY":200},{"muzzle":[38.981308411214954,-31.345794392523363],"footX":99,"footY":206},{"muzzle":[63.294392523364486,-65.90654205607477],"footX":35.5,"footY":215}],"registration":{"scale":0.40186915887850466,"poses":[{"sx":0,"sy":0,"sw":190,"sh":222,"minX":0,"minY":0,"maxX":189,"maxY":221,"footX":37,"footY":218,"tipX":185,"tipY":56,"sourceX":39,"sourceY":11},{"sx":0,"sy":0,"sw":230,"sh":219,"minX":0,"minY":0,"maxX":229,"maxY":218,"footX":22,"footY":215,"tipX":224,"tipY":53,"sourceX":303,"sourceY":14},{"sx":0,"sy":0,"sw":212,"sh":216,"minX":0,"minY":0,"maxX":211,"maxY":215,"footX":29,"footY":212,"tipX":207,"tipY":157,"sourceX":585,"sourceY":17},{"sx":0,"sy":0,"sw":237,"sh":218,"minX":0,"minY":0,"maxX":236,"maxY":217,"footX":28.5,"footY":214,"tipX":226,"tipY":15,"sourceX":834,"sourceY":15},{"sx":0,"sy":0,"sw":320,"sh":204,"minX":0,"minY":0,"maxX":319,"maxY":203,"footX":98,"footY":200,"tipX":306,"tipY":22,"sourceX":1083,"sourceY":29},{"sx":0,"sy":0,"sw":294,"sh":204,"minX":0,"minY":0,"maxX":293,"maxY":203,"footX":23.5,"footY":200,"tipX":285,"tipY":27,"sourceX":1414,"sourceY":29},{"sx":0,"sy":0,"sw":204,"sh":210,"minX":0,"minY":0,"maxX":203,"maxY":209,"footX":99,"footY":206,"tipX":196,"tipY":128,"sourceX":1707,"sourceY":23},{"sx":0,"sy":0,"sw":199,"sh":219,"minX":0,"minY":0,"maxX":198,"maxY":218,"footX":35.5,"footY":215,"tipX":193,"tipY":51,"sourceX":1962,"sourceY":14}]}},"attackv3_bloom":{"weapon":"bloom","hero":"sera","frames":8,"width":256,"height":192,"anchor":[96,160],"release":4,"attackDuration":0.58,"skillDuration":0.96,"completeBody":true,"source":"healer_rods-source.png","points":[{"muzzle":[37.8479262672811,-54.294930875576036],"footX":89.5,"footY":217},{"muzzle":[74.90322580645162,-53.89861751152074],"footX":20,"footY":217},{"muzzle":[72.92165898617512,-22.193548387096776],"footX":30,"footY":222},{"muzzle":[2.576036866359447,-76.88479262672811],"footX":202.5,"footY":236},{"muzzle":[107.99539170506912,-59.84331797235023],"footX":23.5,"footY":203},{"muzzle":[104.03225806451613,-64.20276497695852],"footX":20.5,"footY":211},{"muzzle":[71.93087557603687,-28.93087557603687],"footX":24.5,"footY":211},{"muzzle":[60.43778801843318,-61.03225806451613],"footX":34.5,"footY":217}],"registration":{"scale":0.39631336405529954,"poses":[{"sx":0,"sy":0,"sw":205,"sh":233,"minX":0,"minY":0,"maxX":204,"maxY":232,"footX":89.5,"footY":217,"tipX":185,"tipY":80,"sourceX":40,"sourceY":250},{"sx":0,"sy":0,"sw":231,"sh":221,"minX":0,"minY":0,"maxX":230,"maxY":220,"footX":20,"footY":217,"tipX":209,"tipY":81,"sourceX":301,"sourceY":250},{"sx":0,"sy":0,"sw":220,"sh":226,"minX":0,"minY":0,"maxX":219,"maxY":225,"footX":30,"footY":222,"tipX":214,"tipY":166,"sourceX":583,"sourceY":245},{"sx":0,"sy":0,"sw":235,"sh":237,"minX":0,"minY":0,"maxX":234,"maxY":236,"footX":202.5,"footY":236,"tipX":209,"tipY":42,"sourceX":839,"sourceY":246},{"sx":0,"sy":0,"sw":317,"sh":207,"minX":0,"minY":0,"maxX":316,"maxY":206,"footX":23.5,"footY":203,"tipX":296,"tipY":52,"sourceX":1087,"sourceY":264},{"sx":0,"sy":0,"sw":305,"sh":215,"minX":0,"minY":0,"maxX":304,"maxY":214,"footX":20.5,"footY":211,"tipX":283,"tipY":49,"sourceX":1405,"sourceY":256},{"sx":0,"sy":0,"sw":226,"sh":215,"minX":0,"minY":0,"maxX":225,"maxY":214,"footX":24.5,"footY":211,"tipX":206,"tipY":138,"sourceX":1705,"sourceY":256},{"sx":0,"sy":0,"sw":207,"sh":221,"minX":0,"minY":0,"maxX":206,"maxY":220,"footX":34.5,"footY":217,"tipX":187,"tipY":63,"sourceX":1964,"sourceY":250}]}},"attackv3_halo":{"weapon":"halo","hero":"sera","frames":8,"width":256,"height":192,"anchor":[96,160],"release":4,"attackDuration":0.58,"skillDuration":0.96,"completeBody":true,"source":"healer_rods-source.png","points":[{"muzzle":[40.9070796460177,-78.00884955752213],"footX":92.5,"footY":227},{"muzzle":[55.176991150442475,-73.4424778761062],"footX":88,"footY":221},{"muzzle":[39.384955752212385,-22.07079646017699],"footX":106.5,"footY":226},{"muzzle":[82.95575221238937,-80.67256637168141],"footX":19,"footY":226},{"muzzle":[112.44690265486724,-69.63716814159292],"footX":25.5,"footY":213},{"muzzle":[105.97787610619469,-69.63716814159292],"footX":23.5,"footY":215},{"muzzle":[77.0575221238938,-19.02654867256637],"footX":23.5,"footY":215},{"muzzle":[41.28761061946903,-76.48672566371681],"footX":89.5,"footY":226}],"registration":{"scale":0.3805309734513274,"poses":[{"sx":0,"sy":0,"sw":205,"sh":231,"minX":0,"minY":0,"maxX":204,"maxY":230,"footX":92.5,"footY":227,"tipX":200,"tipY":22,"sourceX":34,"sourceY":483},{"sx":0,"sy":0,"sw":238,"sh":225,"minX":0,"minY":0,"maxX":237,"maxY":224,"footX":88,"footY":221,"tipX":233,"tipY":28,"sourceX":302,"sourceY":488},{"sx":0,"sy":0,"sw":215,"sh":230,"minX":0,"minY":0,"maxX":214,"maxY":229,"footX":106.5,"footY":226,"tipX":210,"tipY":168,"sourceX":584,"sourceY":483},{"sx":0,"sy":0,"sw":242,"sh":230,"minX":0,"minY":0,"maxX":241,"maxY":229,"footX":19,"footY":226,"tipX":237,"tipY":14,"sourceX":833,"sourceY":483},{"sx":0,"sy":0,"sw":326,"sh":217,"minX":0,"minY":0,"maxX":325,"maxY":216,"footX":25.5,"footY":213,"tipX":321,"tipY":30,"sourceX":1074,"sourceY":496},{"sx":0,"sy":0,"sw":306,"sh":219,"minX":0,"minY":0,"maxX":305,"maxY":218,"footX":23.5,"footY":215,"tipX":302,"tipY":32,"sourceX":1406,"sourceY":494},{"sx":0,"sy":0,"sw":231,"sh":219,"minX":0,"minY":0,"maxX":230,"maxY":218,"footX":23.5,"footY":215,"tipX":226,"tipY":165,"sourceX":1705,"sourceY":494},{"sx":0,"sy":0,"sw":203,"sh":230,"minX":0,"minY":0,"maxX":202,"maxY":229,"footX":89.5,"footY":226,"tipX":198,"tipY":25,"sourceX":1964,"sourceY":483}]}},"attackv3_bell":{"weapon":"bell","hero":"sera","frames":8,"width":256,"height":192,"anchor":[96,160],"release":4,"attackDuration":0.58,"skillDuration":0.96,"completeBody":true,"source":"healer_relics-source.png","points":[{"muzzle":[33.20474576271186,-38.3822372881356],"footX":45,"footY":319},{"muzzle":[48.68766101694915,-35.02969491525425],"footX":25.5,"footY":293},{"muzzle":[51.672881355932205,-59.69857627118645],"footX":36.5,"footY":282},{"muzzle":[61.28447457627119,-74.09993220338984],"footX":32.5,"footY":327},{"muzzle":[88.1164745762712,-42.405288135593224],"footX":18.5,"footY":278},{"muzzle":[50.183186440677964,-29.793898305084753],"footX":139.5,"footY":263},{"muzzle":[40.52203389830509,-35.44366101694916],"footX":25.5,"footY":295},{"muzzle":[17.75389830508474,-36.13166101694916],"footX":87.5,"footY":302}],"registration":{"scale":0.29152542372881357,"poses":[{"sx":0,"sy":0,"sw":227,"sh":323,"minX":0,"minY":0,"maxX":226,"maxY":322,"footX":45,"footY":319,"tipX":158.89999999999998,"tipY":187.33999999999997,"sourceX":4,"sourceY":25},{"sx":0,"sy":0,"sw":279,"sh":298,"minX":0,"minY":0,"maxX":278,"maxY":297,"footX":25.5,"footY":293,"tipX":192.51,"tipY":172.83999999999997,"sourceX":241,"sourceY":50},{"sx":0,"sy":0,"sw":285,"sh":286,"minX":0,"minY":0,"maxX":284,"maxY":285,"footX":36.5,"footY":282,"tipX":213.75,"tipY":77.22,"sourceX":530,"sourceY":63},{"sx":0,"sy":0,"sw":296,"sh":331,"minX":0,"minY":0,"maxX":295,"maxY":330,"footX":32.5,"footY":327,"tipX":242.72,"tipY":72.82000000000001,"sourceX":813,"sourceY":18},{"sx":0,"sy":0,"sw":396,"sh":282,"minX":0,"minY":0,"maxX":395,"maxY":281,"footX":18.5,"footY":278,"tipX":320.76000000000005,"tipY":132.54,"sourceX":1080,"sourceY":67},{"sx":0,"sy":0,"sw":371,"sh":268,"minX":0,"minY":0,"maxX":370,"maxY":267,"footX":139.5,"footY":263,"tipX":311.64,"tipY":160.79999999999998,"sourceX":1370,"sourceY":82},{"sx":0,"sy":0,"sw":235,"sh":299,"minX":0,"minY":0,"maxX":234,"maxY":298,"footX":25.5,"footY":295,"tipX":164.5,"tipY":173.42,"sourceX":1710,"sourceY":51},{"sx":0,"sy":0,"sw":212,"sh":307,"minX":0,"minY":0,"maxX":211,"maxY":306,"footX":87.5,"footY":302,"tipX":148.39999999999998,"tipY":178.05999999999997,"sourceX":1955,"sourceY":45}]}},"attackv3_seraph":{"weapon":"seraph","hero":"sera","frames":8,"width":256,"height":192,"anchor":[96,160],"release":4,"attackDuration":0.58,"skillDuration":0.96,"completeBody":true,"source":"seraph-source.png","points":[{"muzzle":[42.027070707070706,-34.53030303030303],"footX":52,"footY":405},{"muzzle":[34.91252525252525,-36.037474747474754],"footX":118,"footY":402},{"muzzle":[39.56,-61.318434343434355],"footX":58,"footY":411},{"muzzle":[70.88484848484849,-64.68242424242425],"footX":59.5,"footY":388},{"muzzle":[92.53686868686869,-40.611111111111114],"footX":29.5,"footY":380},{"muzzle":[83.45474747474748,-29.18787878787879],"footX":45.5,"footY":345},{"muzzle":[40.09858585858586,-32.66262626262627],"footX":84,"footY":385},{"muzzle":[40.876060606060605,-33.74848484848485],"footX":64.5,"footY":396}],"registration":{"scale":0.21717171717171718,"poses":[{"sx":0,"sy":0,"sw":341,"sh":410,"minX":0,"minY":0,"maxX":340,"maxY":409,"footX":52,"footY":405,"tipX":245.51999999999998,"tipY":246,"sourceX":36,"sourceY":33},{"sx":0,"sy":0,"sw":404,"sh":407,"minX":0,"minY":0,"maxX":403,"maxY":406,"footX":118,"footY":402,"tipX":278.76,"tipY":236.05999999999997,"sourceX":422,"sourceY":37},{"sx":0,"sy":0,"sw":316,"sh":415,"minX":0,"minY":0,"maxX":315,"maxY":414,"footX":58,"footY":411,"tipX":240.16,"tipY":128.65,"sourceX":925,"sourceY":29},{"sx":0,"sy":0,"sw":454,"sh":392,"minX":0,"minY":0,"maxX":453,"maxY":391,"footX":59.5,"footY":388,"tipX":385.9,"tipY":90.16000000000001,"sourceX":1304,"sourceY":52},{"sx":0,"sy":0,"sw":536,"sh":386,"minX":0,"minY":0,"maxX":535,"maxY":385,"footX":29.5,"footY":380,"tipX":455.59999999999997,"tipY":193,"sourceX":17,"sourceY":468},{"sx":0,"sy":0,"sw":494,"sh":351,"minX":0,"minY":0,"maxX":493,"maxY":350,"footX":45.5,"footY":345,"tipX":429.78,"tipY":210.6,"sourceX":506,"sourceY":503},{"sx":0,"sy":0,"sw":368,"sh":391,"minX":0,"minY":0,"maxX":367,"maxY":390,"footX":84,"footY":385,"tipX":268.64,"tipY":234.6,"sourceX":951,"sourceY":465},{"sx":0,"sy":0,"sw":351,"sh":401,"minX":0,"minY":0,"maxX":350,"maxY":400,"footX":64.5,"footY":396,"tipX":252.72,"tipY":240.6,"sourceX":1389,"sourceY":458}]}}};
// All 31 weapons have complete attack clips. Art remains whole: no grafted limbs.
Object.assign(providedActions,weaponAttackAdditions);
for(const [id,d] of Object.entries(weaponAttackAdditions)){const w=d.weapon;actionBindings[w]={...(actionBindings[w]||{}),attack:id};if(!actionBindings[w].skill)actionBindings[w].skill=id}
const weaponAttackStyles={
 iron:['steel-cut','impact','cleave'],silver:['silver-moon','frost','cleave'],void:['void-fang','void','cleave'],
 crook:['guiding-ember','sun','lantern'],moonlit:['lunar-tide','frost','lantern'],soulfire:['soul-procession','void','lantern'],dawnseeker:['first-dawn','sun','lantern'],eclipselantern:['eclipse-rift','blood','lantern'],
 fists:['iron-jab','impact','punch'],thunder:['thunder-cross','bolt','punch'],titan:['titan-breaker','flame','punch'],
 wand:['arcane-dart','spirit','staff'],frost:['ice-prism','frost','staff'],ember:['ember-helix','flame','staff'],codex:['celestial-script','void','codex'],archmage:['solar-edict','sun','staff'],
 scepter:['blessed-petals','heal','rod'],bell:['dawn-chime','sun','bell'],bloom:['living-spiral','thorn','rod'],seraph:['seraph-wings','sun','relic'],halo:['radiant-halo','sun','staff'],
 bow:['hunters-feather','thorn','bow'],thorn:['thorn-braid','thorn','bow'],storm:['twin-tempest','spirit','bow'],eclipsebow:['crescent-string','void','bow'],phoenix:['phoenix-flight','flame','bow'],
 rifle:['rustshot-recoil','impact','gun'],stormcoil:['stormcoil-discharge','bolt','gun'],repeater:['void-echo','void','gun'],cannon:['sunbreaker-lance','sun','gun'],harbinger:['obsidian-collapse','blood','gun']
};
const weaponAttackProfiles={};
for(const w of weapons){const [signature,theme,family]=weaponAttackStyles[w.id],clip=providedActions[actionBindings[w.id]?.attack];if(!clip)throw Error('Missing complete attack: '+w.id);const {weights,edges}=actionTiming(family,clip.frames,clip.release);weaponAttackProfiles[w.id]={signature,theme,family,tier:w.tier||0,weights,edges,releasePhase:edges[clip.release],duration:family==='gun'?(w.id==='harbinger'?.66:w.id==='cannon'?.62:.4):family==='punch'?(w.id==='titan'?.58:.48):family==='cleave'?.54:.6,detail:2+(w.tier||0)*2}}
function attackPoseOffset(r){const a=r?.action;if(!a||a.kind!=='attack')return{x:0,y:0};const offset=attackBodyMotion(weaponAttackProfiles[r.weapon.id],a.elapsed/a.duration,r.heading<0?-1:1);return{x:offset.x*artAspect,y:offset.y}}
const weaponActionBefore=currentAction;
currentAction=function(r){const a=weaponActionBefore(r);if(!a||a.kind!=='attack')return a;const profile=weaponAttackProfiles[r.weapon.id],p=Math.max(0,Math.min(.99999,a.elapsed/a.duration));let frame=profile.edges.findIndex((edge,i)=>i>0&&p<edge)-1;frame=Math.max(0,Math.min(a.data.frames-1,frame));if(r.action.contactHold>0)frame=a.data.release;return{...a,frame}};
const weaponAttackBefore=classAttack;
classAttack=function(r){const old=r.action;weaponAttackBefore(r);if(r.action&&r.action!==old&&r.action.kind==='attack'){const p=weaponAttackProfiles[r.weapon.id],duration=Math.max(.14,Math.min(p.duration,r.rate*1.6));r.action.duration=duration;r.action.contactHold=0;r.anim.attackLeft=duration;r.pendingStrike=duration*p.releasePhase;r.attack=r.rate+r.pendingStrike}};
const weaponTickBefore=tickSpriteAnimation;
tickSpriteAnimation=function(r,dt){if(r.action?.contactHold>0)r.action.contactHold=Math.max(0,r.action.contactHold-dt);weaponTickBefore(r,dt)};
const weaponHeroBefore=drawClassHero;
drawClassHero=function(c,x,y,h,t=0,scale=1,previewWeapon=null){const r=c===ctx&&run&&run.hero.id===h.id?run:null,offset=r&&currentAction(r)?.kind==='attack'&&r.dashTime<=0&&r.anim.hurtLeft<=0?attackPoseOffset(r):{x:0,y:0};c.save();c.translate(offset.x*scale,offset.y*scale);weaponHeroBefore(c,x,y,h,t,scale,previewWeapon);c.restore()};
const weaponTipBefore=firingPoint;
firingPoint=function(r){const point=weaponTipBefore(r),offset=currentAction(r)?.kind==='attack'?attackPoseOffset(r):{x:0,y:0};return{x:point.x+offset.x,y:point.y+offset.y}};
const weaponReleaseBefore=releaseClassAttack;
releaseClassAttack=function(r){const a=r.action,p=weaponAttackProfiles[r.weapon.id];if(a?.kind==='attack'&&r.dashTime<=0){a.elapsed=Math.max(a.elapsed,a.duration*p.releasePhase);a.contactHold=.025}const before=r.muzzle,existing=new Set(r.combatFx||[]);weaponReleaseBefore(r);if(r.muzzle!==before){r.combatFx=(r.combatFx||[]).filter(f=>f.kind!=='slash'||existing.has(f));const tip=firingPoint(r);addCombatFx(r,'weaponStrike',tip.x,tip.y,{weaponId:r.weapon.id,signature:p.signature,theme:p.theme,family:p.family,tier:p.tier,detail:p.detail,angle:r.aim||0,life:.24+p.tier*.055,heroX:r.x,heroY:r.y});r.lastWeaponRelease={x:tip.x,y:tip.y,frame:currentAction(r)?.frame??0}}};
const weaponShootBefore=shoot;
shoot=function(...args){const r=run,n=r?.shots.length||0,result=weaponShootBefore(...args);if(r)for(let i=n;i<r.shots.length;i++){const s=r.shots[i];s.vfxWeapon=r.weapon.id;s.vfxTier=r.weapon.tier||0;s.vfxKind=weaponAttackProfiles[r.weapon.id].theme}return result};
function weaponLightning(c,length,spread,time,color){c.strokeStyle=color;c.lineWidth=2;c.beginPath();c.moveTo(0,0);for(let i=1;i<=8;i++)c.lineTo(i*length/8,i===8?0:Math.sin(i*6+time*32)*spread);c.stroke();c.lineWidth=1;c.strokeStyle='#fff5df';c.stroke()}
function weaponFeather(c,x,y,length,spread,color,angle){c.save();c.translate(x,y);c.rotate(angle);c.fillStyle=color;c.beginPath();c.moveTo(0,0);c.quadraticCurveTo(-length*.5,-spread,-length,-spread*.25);c.quadraticCurveTo(-length*.45,spread*.35,0,0);c.fill();c.strokeStyle='#fff0cd';c.lineWidth=.7;c.beginPath();c.moveTo(0,0);c.lineTo(-length*.8,-spread*.2);c.stroke();c.restore()}
function drawWeaponStrike(c,fx){const p=Math.max(0,Math.min(1,fx.age/fx.life)),fade=Math.pow(1-p,1.25),tier=fx.tier,color=combatPalette[fx.theme],n=reducedMotion?3:fx.detail,reach=17+tier*7+p*24,seed=Object.keys(weaponAttackStyles).indexOf(fx.weaponId)*.31;c.save();c.translate(fx.x,fx.y);c.rotate(fx.angle||0);c.globalAlpha*=fade;c.lineCap='round';
 // Tiny contact flare stays exactly on the registered weapon tip.
 combatStamp(c,'impact',0,0,22+tier*6,fx.age,0,.8);
 if(fx.family==='cleave'||fx.family==='lantern'){
  c.lineWidth=2+tier;c.strokeStyle=color;c.beginPath();c.ellipse(9+p*18,0,10+tier*6,20+tier*10,0,-1.35,1.35);c.stroke();c.strokeStyle='#fff0cd';c.lineWidth=1;c.stroke();
  if(fx.signature==='eclipse-rift'){c.fillStyle='#201b32';c.beginPath();c.ellipse(15,0,7,22+Math.sin(p*Math.PI)*15,0,0,Math.PI*2);c.fill();for(let side of[-1,1])weaponLightning(c,32,side*12,fx.age+side,color)}
  if(fx.signature==='first-dawn'){for(let i=0;i<8;i++){const a=i*Math.PI/4;c.strokeStyle=color;c.lineWidth=2;c.beginPath();c.moveTo(Math.cos(a)*16,Math.sin(a)*16);c.lineTo(Math.cos(a)*(27+p*20),Math.sin(a)*(27+p*20));c.stroke()}}
  if(fx.signature==='lunar-tide'||fx.signature==='silver-moon'){c.strokeStyle='#effaff';c.lineWidth=4*(1-p)+1;c.beginPath();c.arc(8,0,18+p*28,-1.3,1.3);c.stroke()}
  if(fx.signature==='soul-procession')for(let i=0;i<3;i++){const x=12+p*30+i*12,y=Math.sin(p*6+i)*10;combatStamp(c,'spirit',x,y,20,fx.age+i*.1);c.fillStyle='#33223e';c.fillRect(x+2,y-2,2,2)}
 }else if(fx.family==='punch'){
  c.strokeStyle=color;c.lineWidth=3;c.beginPath();c.ellipse(8+p*20,0,6+p*12,12+p*18,0,0,Math.PI*2);c.stroke();
  if(fx.signature==='thunder-cross')for(let side of[-1,1]){c.save();c.rotate(side*.3);weaponLightning(c,45+p*22,8,fx.age+side,color);c.restore()}
  if(fx.signature==='titan-breaker')for(let i=0;i<5;i++){c.strokeStyle=color;c.lineWidth=2;c.beginPath();c.moveTo(3,0);for(let k=1;k<5;k++)c.lineTo(k*12,Math.sin(k*5+i*2)*k*4);c.stroke();combatStamp(c,'flame',12+i*9,Math.sin(i*2)*20,24,fx.age+i*.05,-Math.PI/2)}
 }else if(fx.family==='bow'){
  c.strokeStyle=color;c.lineWidth=1+tier*.4;for(let side of[-1,1]){c.beginPath();c.moveTo(-8,side*22);c.quadraticCurveTo(20,side*(28+p*14),reach*1.4,0);c.stroke()}
  if(fx.signature==='phoenix-flight')for(let side of[-1,1])for(let i=0;i<4;i++)weaponFeather(c,15+i*3,side*i*4,30-i*4,side*(12+p*10),color,side*(.4+i*.17));
  else if(fx.signature==='thorn-braid')for(let i=0;i<5;i++)weaponFeather(c,reach*.3+i*7,Math.sin(i+p*8)*9,10,5,color,i*.8);
  else if(fx.signature==='crescent-string'){c.strokeStyle=color;c.lineWidth=3;c.beginPath();c.arc(14,0,15+p*12,-1.4,1.4);c.stroke()}
  else if(fx.signature==='twin-tempest')for(let side of[-1,1]){c.save();c.translate(0,side*8);weaponLightning(c,35+p*20,4,fx.age,color);c.restore()}
 }else if(fx.family==='gun'){
  c.fillStyle=color;c.beginPath();c.moveTo(0,-4);c.lineTo(16+tier*8+p*12,-(2+tier));c.lineTo(10+tier*4,0);c.lineTo(16+tier*8+p*12,2+tier);c.lineTo(0,4);c.closePath();c.fill();
  if(fx.signature==='stormcoil-discharge')for(let i=0;i<3;i++){c.save();c.translate(0,(i-1)*7);weaponLightning(c,30,4,fx.age+i,color);c.restore()}
  if(fx.signature==='sunbreaker-lance'){c.strokeStyle=color;c.lineWidth=2;c.beginPath();c.ellipse(12+p*23,0,5,15+tier*3,0,0,Math.PI*2);c.stroke();combatStamp(c,'sun',20+p*28,0,35,fx.age)}
  if(fx.signature==='obsidian-collapse'){c.fillStyle='#191522';c.beginPath();c.arc(18,0,9+Math.sin(p*Math.PI)*7,0,Math.PI*2);c.fill();c.strokeStyle=color;c.lineWidth=3;c.stroke();for(let i=0;i<3;i++){c.save();c.rotate(i*2.094+fx.age*4);weaponLightning(c,35,6,fx.age+i,color);c.restore()}}
  if(fx.signature==='void-echo')for(let i=0;i<3;i++){c.strokeStyle=color;c.lineWidth=1.5;c.beginPath();c.ellipse(8+i*11+p*10,0,3,9+i*2,0,0,Math.PI*2);c.stroke()}
  // A small casing arcs down from the gun, never a second projectile.
  c.save();c.translate(-10-p*16,8-p*26+p*p*36);c.rotate(p*9);c.fillStyle='#d6a54e';c.fillRect(-3,-1,5,2);c.restore();
 }else{
  // Staff, codex, rod, bell and relic channels have different physical motifs.
  const radius=13+tier*4+p*8;c.save();c.scale(.6,1);combatRune(c,8,0,radius,color,fx.age*4);c.restore();
  if(fx.signature==='ice-prism')for(let i=0;i<5;i++){c.save();c.translate(10+i*6,Math.sin(i*2)*14);c.rotate(i*.8);c.fillStyle=color;c.beginPath();c.moveTo(0,-9);c.lineTo(4,0);c.lineTo(0,9);c.lineTo(-4,0);c.closePath();c.fill();c.restore()}
  if(fx.signature==='ember-helix')for(let side of[-1,1]){c.strokeStyle=color;c.lineWidth=2;c.beginPath();for(let i=0;i<15;i++){const x=i*3,y=Math.sin(i*.5+p*8)*side*10;if(!i)c.moveTo(x,y);else c.lineTo(x,y)}c.stroke()}
  if(fx.signature==='celestial-script')for(let i=0;i<5;i++){const a=i*1.256+fx.age*2;combatStamp(c,'sun',Math.cos(a)*radius,Math.sin(a)*radius,12,fx.age+i*.1,a)}
  if(fx.signature==='seraph-wings')for(let side of[-1,1])for(let i=0;i<4;i++)weaponFeather(c,-3,side*3,28-i*3,side*14,color,side*(.5+i*.22)+Math.PI);
  if(fx.signature==='dawn-chime'){for(let i=0;i<3;i++){c.strokeStyle=color;c.lineWidth=2;c.beginPath();c.ellipse(4+i*7+p*16,0,4,10+i*7+p*6,0,-Math.PI/2,Math.PI/2);c.stroke()}}
  if(['living-spiral','blessed-petals'].includes(fx.signature))for(let i=0;i<5;i++){const a=i*1.256+p*3;weaponFeather(c,10+Math.cos(a)*radius,Math.sin(a)*radius,10,5,color,a)}
  if(fx.signature==='radiant-halo'||fx.signature==='solar-edict'){combatStamp(c,'sun',12,0,45+tier*4,fx.age);c.strokeStyle=color;c.lineWidth=2;c.beginPath();c.moveTo(12,-23);c.lineTo(12,23);c.moveTo(-11,0);c.lineTo(35,0);c.stroke()}
 }
 for(let i=0;i<n;i++){const a=seed+i*Math.PI*2/n,d=10+p*(18+tier*7);combatStamp(c,fx.theme,Math.cos(a)*d*.8,Math.sin(a)*d,5+tier*2,fx.age+i*.045,a,.65)}c.restore();
}
const weaponFxBefore=combatBurst;
combatBurst=function(c,fx){if(fx.kind==='weaponStrike')drawWeaponStrike(c,fx);else weaponFxBefore(c,fx)};
const weaponActionVfxBefore=drawHeroAction;
drawHeroAction=function(c,r){weaponActionVfxBefore(c,r);const a=currentAction(r),profile=weaponAttackProfiles[r.weapon.id];if(!a||a.kind!=='attack'||profile.tier<1||r.dashTime>0||r.anim.hurtLeft>0)return;const progress=a.elapsed/a.duration;if(progress>=profile.releasePhase)return;const tip=firingPoint(r),q=progress/profile.releasePhase;c.save();c.globalAlpha=.2+q*.55;combatStamp(c,profile.theme,tip.x,tip.y,12+q*(8+profile.tier*3),r.time,r.aim);if(profile.tier>=3){c.strokeStyle=combatPalette[profile.theme];c.lineWidth=1;for(let i=0;i<4;i++){const angle=i*Math.PI/2+(reducedMotion?0:r.time*2),distance=(1-q)*18+8;c.beginPath();c.moveTo(tip.x+Math.cos(angle)*distance,tip.y+Math.sin(angle)*distance);c.lineTo(tip.x+Math.cos(angle)*distance*.55,tip.y+Math.sin(angle)*distance*.55);c.stroke()}}c.restore()};
const weaponProjectilesBefore=drawCombatProjectiles;
drawCombatProjectiles=function(c,r){weaponProjectilesBefore(c,r);for(const s of r.shots){if(s.enemy||s.t<=0||!(s.vfxTier>=2))continue;const profile=weaponAttackProfiles[s.vfxWeapon];if(!profile)continue;const age=s.vfxAge||0,angle=Math.atan2(s.vy,s.vx);c.save();c.translate(s.x,s.y);c.rotate(angle);c.globalAlpha=.75;
 if(profile.signature==='phoenix-flight'){for(const side of[-1,1])for(let i=0;i<3;i++)weaponFeather(c,-3-i*3,0,15-i*2,side*(5+Math.sin(age*14)*3),combatPalette.flame,side*(.4+i*.15));combatStamp(c,'sun',3,0,12,age)}
 else if(profile.signature==='obsidian-collapse'){c.fillStyle='#20162b';c.beginPath();c.arc(0,0,5,0,Math.PI*2);c.fill();c.strokeStyle=combatPalette.blood;c.lineWidth=1.5;c.beginPath();c.ellipse(0,0,8,6,age*4,0,Math.PI*2);c.stroke()}
 else if(profile.signature==='sunbreaker-lance'){c.strokeStyle='#fff0cd';c.lineWidth=1;c.beginPath();c.moveTo(-17,0);c.lineTo(10,0);c.stroke();combatStamp(c,'sun',0,0,16,age)}
 else{const count=reducedMotion?2:Math.min(4,s.vfxTier+1);for(let i=0;i<count;i++){const a=i*Math.PI*2/count+age*4;combatStamp(c,profile.theme,-4+Math.cos(a)*8,Math.sin(a)*7,7,age+i*.1,a)}}c.restore()}};

// Chapter-specific attacks share the wave damage curve and a visible cast.
const traitBeforeDifficulty=enemyTrait;
enemyTrait=function(e,r,dt,a,dis){
 const shots=r.shots.length,zones=r.hazards.length;traitBeforeDifficulty(e,r,dt,a,dis);if(e.boss)return;
 const extraShots=r.shots.splice(shots),extraZones=r.hazards.splice(zones);
 if(!extraShots.length&&!extraZones.length||e.hp<=0||e.stun>0||e.cast)return;
 const scale=difficultyProfile(r).damage*(e.elite?1.35:1);
 queueEnemyCast(e,extraShots.map(s=>({angle:Math.atan2(s.vy,s.vx),speed:Math.hypot(s.vx,s.vy),dmg:Math.min(1e9,s.dmg*scale),color:s.color})),extraZones.map(z=>({x:z.x,y:z.y,radius:z.radius,dmg:Math.min(1e9,z.dmg*scale)})));
};
spawnElite=function(r){const count=r.enemies.length;spawnEnemy(false,4);if(r.enemies.length<=count)return;const e=r.enemies.at(-1);promoteWaveElite(e,r);r.eliteSpawned=true;banner(e.name+' enters the hunt!')};

// Integration adapters: terrain/DOM remain in the legacy runtime, resource rules live in systems/.
function lanternPointClear(r,p,spawning=false){
 if(p.x<24||p.x>MW-24||p.y<24||p.y>MH-24)return false;
 if(r.mode==='story'&&r.story&&(storySolid(r,p.x,p.y,12)||!storyLineOfSight(r,r.x,r.y,p.x,p.y,12)))return false;
 if(spawning&&(r.hazards.some(h=>!h.struck&&Math.hypot(h.x-p.x,h.y-p.y)<h.radius+24)||
   (r.bossFields||[]).some(f=>bossFieldContains({x:p.x,y:p.y},f))||
   r.enemies.some(e=>e.hp>0&&Math.hypot(e.x-p.x,e.y-p.y)<e.size+38)))return false;
 return true;
}
function updateCarriedLantern(r,dt){
 if(!r.lantern)r.lantern=createLanternState();
 const before=lanternStatus(r.lantern),gained=tickLantern(r.lantern,dt,r,p=>lanternPointClear(r,p,true),p=>lanternPointClear(r,p));
 if(gained>0)textPop(r.x,r.y-45,'+'+Math.round(gained)+' oil','#ffc76b');
 if(before!==lanternStatus(r.lantern))$('#lanternNotice').textContent=lanternMessage(r.lantern);
}
function updateLanternHud(r){
 if(!r.lantern)return;
 const s=r.lantern,bar=$('#lanternFuel');bar.value=s.fuel;bar.setAttribute('aria-valuetext',Math.ceil(s.fuel)+' of '+LANTERN_CONFIG.maxFuel+' fuel');
 const fuelText=Math.ceil(s.fuel)+' / '+LANTERN_CONFIG.maxFuel+' fuel',modeText='Light: '+s.mode[0].toUpperCase()+s.mode.slice(1)+' · L / Y';
 if($('#lanternFuelText').textContent!==fuelText)$('#lanternFuelText').textContent=fuelText;
 if($('#lanternMode').textContent!==modeText)$('#lanternMode').textContent=modeText;
 $('#lanternMode').disabled=r.paused;updateFuelThreatHud(r);
 const message=lanternMessage(s);if($('#lanternNotice').textContent!==message)$('#lanternNotice').textContent=message;
}
function changeLanternMode(){if(!run||run.paused)return;cycleLanternMode(run.lantern);updateLanternHud(run);snapshot()}
const lanternKeyHandler=e=>{if(!run||run.paused||e.repeat||e.ctrlKey||e.metaKey||e.altKey||['INPUT','TEXTAREA','SELECT'].includes(e.target?.tagName))return;if(e.key.toLowerCase()==='l'){e.preventDefault();changeLanternMode()}};
window.addEventListener('keydown',lanternKeyHandler);
$('#lanternMode').onclick=()=>{changeLanternMode();canvas.focus({preventScroll:true})};

// Seeded spawn adapter: the module owns random streams/budgets; runtime owns terrain and actors.
function generateDirectorSeed(){return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8)}
function ensureDirector(r){return r.director||(r.director=createDirector('legacy-'+r.chapter+'-'+r.wave+'-'+r.time))}
let directorReachability=null;
function directorReachable(r,room,point){
 const key=[r.chapter,room.id,Math.floor(r.x/50),Math.floor(r.y/50),r.story.unlocked,r.story.destroyed.length,r.story.rooms[room.id].fighting].join(':');
 if(directorReachability?.story!==r.story||directorReachability.key!==key){
  const reached=new Set(),queue=[],free=(x,y)=>x>=room.tx&&x<room.tx+room.tw&&y>=room.ty&&y<room.ty+room.th&&!storySolid(r,x*50+25,y*50+25,11),px=Math.floor(r.x/50),py=Math.floor(r.y/50);
  for(let y=py-1;y<=py+1;y++)for(let x=px-1;x<=px+1;x++)if(free(x,y)&&storyLineOfSight(r,r.x,r.y,x*50+25,y*50+25,11)){const id=y*48+x;reached.add(id);queue.push(id)}
  for(let i=0;i<queue.length;i++){const x=queue[i]%48,y=Math.floor(queue[i]/48);for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy,id=yy*48+xx;if(!reached.has(id)&&free(xx,yy)){reached.add(id);queue.push(id)}}}
  directorReachability={story:r.story,key,reached};
 }
 return directorReachability.reached.has(Math.floor(point.y/50)*48+Math.floor(point.x/50));
}
function directorSpawnPoint(r,boss,size){
 const story=r.mode==='story'&&!!r.story,room=storyRoomBoxes[r.story?.combatRoom||r.story?.activeRoom||0],view=camera(r);
 const bounds=story?{x:room.x+20,y:room.y+25,w:room.w-40,h:room.h-50}:{x:10,y:15,w:MW-20,h:MH-30};
 return chooseDirectorSpawn(ensureDirector(r),{player:r,view:{...view,w:W,h:H},bounds,boss,story,radius:boss?22:Math.min(18,size),canPlace:(p,radius)=>{
  if(story&&(storySolid(r,p.x,p.y,radius)||!directorReachable(r,room,p)))return false;
  if(r.hazards.some(h=>!h.struck&&Math.hypot(p.x-h.x,p.y-h.y)<h.radius+radius+20))return false;
  if((r.bossFields||[]).some(f=>f.shape==='line'?bossFieldContains({x:p.x,y:p.y},{...f,width:f.width+radius*2+40}):Math.hypot(p.x-f.x,p.y-f.y)<f.radius+radius+20))return false;
  if(r.enemies.some(e=>e.hp>0&&Math.hypot(e.x-p.x,e.y-p.y)<e.size+radius+DIRECTOR_CONFIG.spacing))return false;
  return true;
 }});
}
function spawnDirectorBatch(r,count,legacy=false,elite=false,atTime=null){
 const d=ensureDirector(r),elapsed=atTime??(r.mode==='survival'?r.time:Math.min(180,(globalWave(r)-1)*180/99)),plan=planDirectorWave(d,{elapsed,maxCount:count,legacy,elite,allowEaters:true,allowStalkers:true,allowWardens:true,wardenCount:r.enemies.filter(e=>e.hp>0&&isWarden(e)).length,allowMimics:true,mimicCount:r.enemies.filter(e=>e.hp>0&&isMimic(e)).length,stalkerCount:r.enemies.filter(e=>e.hp>0&&isShadowStalker(e)).length,fuel:r.lantern?.fuel??100,chapter:r.chapter,eaterCount:r.enemies.filter(e=>e.hp>0&&e.archetype===EATER_CONFIG.archetype).length});
 let spawned=0;for(const entry of plan.entries){const e=spawnEnemy(false,entry.type,{arrival:true,archetype:entry.archetype});if(e)spawned++;if(e&&entry.elite){promoteWaveElite(e,r);d.eliteSpawned=true;banner('Elite hunt · Clear space before the last stand')}}
 return {...plan,spawned};
}
function advanceSurvivalDirector(r,dt){
 const d=ensureDirector(r),config=DIRECTOR_CONFIG.survival;r.wave=Math.min(12,1+Math.floor(r.time/15));r.waveTime=0;r.spawn-=dt;
 if(r.time+1e-8>=config.duration)return;
 if(r.time+1e-8<d.nextAt)return;const scheduled=d.nextAt;d.nextAt+=config.interval;
 if(scheduled>=config.bossAt&&!d.bossSpawned&&r.enemies.filter(e=>e.hp>0).length<config.cap){const boss=spawnEnemy(true,undefined,{arrival:true,tier:1});if(boss){d.bossSpawned=true;r.bossSpawned=true;banner(boss.name+' · Survive until 3:00')}}
 const alive=r.enemies.filter(e=>e.hp>0).length,needsElite=scheduled>=config.eliteAt&&!d.eliteSpawned,reserved=(!d.bossSpawned?1:0)+(!d.eliteSpawned&&!needsElite?1:0),remaining=Math.max(0,config.cap-alive-reserved);spawnDirectorBatch(r,Math.min(config.maxBatch,remaining),false,needsElite,scheduled);r.spawn=Math.max(0,d.nextAt-r.time);
}
function finishSurvivalIfReady(r){const config=DIRECTOR_CONFIG.survival;if(r.mode!=='survival'||r.time+1e-8<config.duration||r.hp<=0)return false;r.time=config.duration;const success=!config.requireBoss||(r.director.bossSpawned&&!r.enemies.some(e=>e.boss&&e.hp>0));endRun(success);return true}
function updateDirectorHud(r){
 const d=ensureDirector(r),text='Seed: '+d.seed+(r.mode==='survival'?' · '+DIRECTOR_CONFIG.phases[directorPhase(r.time)].name+' · '+Math.max(0,Math.ceil(180-r.time))+'s remaining':' · Seeded encounters');
 if($('#directorStatus').textContent!==text)$('#directorStatus').textContent=text;
 if(r.mode==='survival')$('#continueSummary').textContent='Survival · '+formatTime(r.time)+' / 3:00 · Seed '+d.seed;
}

// Resource threat adapter. Terrain and effects stay here; the brain has no Canvas/DOM dependency.
function updateLanternEater(r,e,dt,angle){
 const casters=r.enemies.filter(eaterCasting),index=casters.indexOf(e),visible=r.mode!=='story'||!r.story||storyLineOfSight(r,e.x,e.y,r.x,r.y,2);
 const result=tickLanternEater(e,r,dt,{visible,slotAvailable:index<0?casters.length<EATER_CONFIG.maxCasting:index<EATER_CONFIG.maxCasting});
 if(result.move){e.x+=Math.cos(angle)*e.speed*dt;e.y+=Math.sin(angle)*e.speed*dt;e.x=Math.max(24,Math.min(MW-24,e.x));e.y=Math.max(24,Math.min(MH-24,e.y))}
 if(result.event==='windup')sound(180,.08,'triangle',.025);
 if(result.event==='channel')sound(115,.09,'triangle',.025);
}
// Runner navigation/cover/contact use the same terrain and damage authorities as other actors.
function archerMuzzle(e){return{x:e.x,y:e.y-e.size*.5}}
function archerCoverBoxes(r,e){
 if(r.mode!=='story'||!r.story)return[];const map=storyTerrain(r.chapter),boxes=[],tx=Math.floor(e.x/50),ty=Math.floor(e.y/50);
 for(let y=Math.max(0,ty-5);y<=Math.min(29,ty+5);y++)for(let x=Math.max(0,tx-5);x<=Math.min(47,tx+5);x++)if(map.tiles[y][x]!==1)boxes.push({x:x*50,y:y*50,w:50,h:50});
 for(const p of map.props)if(!r.story.destroyed.includes(p.id))boxes.push(p);
 for(const g of map.gates)if(storyGateClosed(r,g))boxes.push(g);
 return boxes.filter(b=>Math.hypot(b.x+b.w/2-e.x,b.y+b.h/2-e.y)<ARCHER_CONFIG.coverDistance).sort((a,b)=>Math.hypot(a.x+a.w/2-e.x,a.y+a.h/2-e.y)-Math.hypot(b.x+b.w/2-e.x,b.y+b.h/2-e.y)).slice(0,ARCHER_CONFIG.maxBoxes);
}
function archerCoverSensors(r,e){
 const solidStory=r.mode==='story'&&r.story,radius=Math.min(18,Math.max(8,e.size*.65)),room=solidStory&&r.story.rooms[r.story.combatRoom]?.fighting?storyRoomBoxes[e.storyRoom||r.story.combatRoom]:null;
 return{
  canStand:p=>p.x>=24&&p.x<=MW-24&&p.y>=24&&p.y<=MH-24&&(!room||p.x>room.x+radius&&p.x<room.x+room.w-radius&&p.y>room.y+radius&&p.y<room.y+room.h-radius)&&!storySolid(r,p.x,p.y,radius),
  visibleAt:p=>!solidStory||storyLineOfSight(r,p.x,p.y-e.size*.5,r.x,r.y,COMBAT_CONFIG.terrainProjectileRadius),
  pathClear:(a,b)=>!solidStory||storyLineOfSight(r,a.x,a.y,b.x,b.y,radius),
  reserved:p=>r.enemies.some(q=>q!==e&&q.hp>0&&(Math.hypot(q.x-p.x,q.y-p.y)<e.size+q.size+4||q.archer?.cover&&Math.hypot(q.archer.cover.hide.x-p.x,q.archer.cover.hide.y-p.y)<35))
 };
}
function findArcherCover(r,e,planning){
 if(r.mode!=='story'||!r.story)return null;if(planning.left<=0)return undefined;planning.left--;
 return chooseArcherCover(e,r,archerCoverBoxes(r,e),archerCoverSensors(r,e));
}
function prepareArcherVolley(e,r,angle){
 // Capture the existing chapter/elite pattern, then let the new warning own its release.
 e.cast=null;enemyTrait(e,r,0,angle,Math.hypot(e.x-r.x,e.y-r.y));const trait=e.cast;e.cast=null;
 return{shots:[{angle,speed:ARCHER_CONFIG.projectileSpeed,dmg:e.dmg,color:chapters[e.chapter-1].accent},...(trait?.shots||[])].slice(0,ARCHER_CONFIG.maxShots),zones:(trait?.zones||[]).slice(0,ARCHER_CONFIG.maxZones)};
}
function updateCoverArcher(r,e,dt,approachAngle,planning){
 e.archer??=createArcherState(e.phase||0);e.traitCd=Math.max(0,(e.traitCd||0)-dt);
 const origin=archerMuzzle(e),sensors=archerCoverSensors(r,e),s=e.archer;
 const needsSight=e.stun<=0&&['approach','peek','windup','retreat'].includes(s.state);
 const visible=!needsSight||r.mode!=='story'||!r.story||sensors.visibleAt(e);
 if(e.stun<=0&&!s.cover&&s.state==='approach')approachAngle=storySteeringAngle(e,r,approachAngle);
 const events=tickCoverArcher(e,r,dt,{origin,visible,approachAngle,
  aimClear:r.mode!=='story'||!r.story||s.state!=='windup'||!visible||s.aimX===r.x&&s.aimY===r.y||storyLineOfSight(r,origin.x,origin.y,s.aimX,s.aimY,COMBAT_CONFIG.terrainProjectileRadius),
  findCover:()=>findArcherCover(r,e,planning),
  coverValid:p=>sensors.canStand(p.hide)&&sensors.canStand(p.peek)&&!sensors.visibleAt(p.hide)&&sensors.visibleAt(p.peek)&&sensors.pathClear(p.hide,p.peek),
  move(from,to,state){
   let heading=Math.atan2(to.y-from.y,to.x-from.x),distance=Math.hypot(to.x-from.x,to.y-from.y);
   if(state==='seek'&&e.archer.cover&&!sensors.pathClear(from,e.archer.cover.hide)){
    const peek=e.archer.cover.peek;heading=Math.atan2(peek.y-from.y,peek.x-from.x);distance=Math.min(distance,Math.hypot(peek.x-from.x,peek.y-from.y));
   }
   for(const turn of [0,Math.PI/3,-Math.PI/3,Math.PI*.7,-Math.PI*.7]){
    const p={x:from.x+Math.cos(heading+turn)*distance,y:from.y+Math.sin(heading+turn)*distance};
    if(sensors.canStand(p)&&sensors.pathClear(from,p)&&!sensors.reserved(p))return p;
   }return{...from,blocked:true};
  },prepareVolley:angle=>prepareArcherVolley(e,r,angle),
  onRelease:volley=>{queueEnemyCast(e,volley.shots,volley.zones);if(e.cast){e.cast.left=0;tickEnemyCast(e,r,0)}}
 });
 if(events.includes('windup'))sound(260,.06,'triangle',.02);
}
function clearWardenZones(r,e){r.hazards=r.hazards.filter(h=>h.wardenOwner!==e.warden.id)}
function wardenPointClear(r,e,p){
 const radius=WARDEN_CONFIG.radius;if(!p||p.x<radius+24||p.x>MW-radius-24||p.y<radius+24||p.y>MH-radius-24||storySolid(r,p.x,p.y,radius))return false;
 return r.mode!=='story'||!r.story||storyLineOfSight(r,e.x,e.y,p.x,p.y,3);
}
function selectWardenTarget(r,e){
 if(r.hazards.length>=120||r.hazards.filter(h=>h.wardenOwner!==undefined).length>=WARDEN_CONFIG.maxZones)return null;
 const danger=p=>r.hazards.some(h=>!h.struck&&Math.hypot(h.x-p.x,h.y-p.y)<h.radius+WARDEN_CONFIG.radius+12)||r.enemies.some(q=>q!==e&&wardenCasting(q)&&Math.hypot(q.warden.target.x-p.x,q.warden.target.y-p.y)<WARDEN_CONFIG.radius*2+12);
 return chooseWardenZone(r,{canPlace:p=>wardenPointClear(r,e,p)&&!danger(p),canEscape:p=>{
  for(let i=0;i<8;i++){const a=i*Math.PI/4,escape={x:p.x+Math.cos(a)*(WARDEN_CONFIG.radius+30),y:p.y+Math.sin(a)*(WARDEN_CONFIG.radius+30)};
   if(escape.x<24||escape.x>MW-24||escape.y<24||escape.y>MH-24||storySolid(r,escape.x,escape.y,13)||danger(escape))continue;
   if(r.mode!=='story'||!r.story||storyLineOfSight(r,r.x,r.y,escape.x,escape.y,13))return true;
  }return false;
 }});
}
function updateWarden(r,e,dt){
 const casters=r.enemies.filter(wardenCasting),index=casters.indexOf(e);
 tickWarden(e,r,dt,{visible:r.mode!=='story'||!r.story||storyLineOfSight(r,e.x,e.y,r.x,r.y,3),slotAvailable:index<0?casters.length<WARDEN_CONFIG.maxCasting:index<WARDEN_CONFIG.maxCasting,
  chooseTarget:()=>selectWardenTarget(r,e),targetClear:p=>wardenPointClear(r,e,p),clear:()=>clearWardenZones(r,e),
  move(seconds){const from={x:e.x,y:e.y},a=storySteeringAngle(e,r,Math.atan2(r.y-e.y,r.x-e.x)),step=Math.min(90,e.speed)*seconds;e.x=Math.max(24,Math.min(MW-24,e.x+Math.cos(a)*step));e.y=Math.max(24,Math.min(MH-24,e.y+Math.sin(a)*step));storyMoveEnemy(r,e,from)},
  release(p){if(r.hazards.length>=120||r.hazards.filter(h=>h.wardenOwner!==undefined).length>=WARDEN_CONFIG.maxZones)return;
   r.hazards.push({...p,radius:WARDEN_CONFIG.radius,dmg:e.dmg,t:.45,delay:.4,struck:false,wardenOwner:e.warden.id});e.attackAnim=.4;addCombatFx(r,'enemyCast',e.x,e.y-e.size*.5,{theme:'void',size:32,life:.3});
  }
 });
}
function clearMimicCopies(r,e){for(const q of r.enemies)if(isMimicDecoy(q)&&q.mimicOwner===e.mimic.id)q.hp=0}
function createMimicCopies(r,e){
 clearMimicCopies(r,e);const radius=Math.min(18,Math.max(8,e.size*.65));
 const points=chooseMimicCopies(e,{canPlace:p=>p.x>=24&&p.x<=MW-24&&p.y>=24&&p.y<=MH-24&&!storySolid(r,p.x,p.y,radius)&&
  (r.mode!=='story'||!r.story||storyLineOfSight(r,e.x,e.y,p.x,p.y,radius))&&!r.enemies.some(q=>q.hp>0&&Math.hypot(q.x-p.x,q.y-p.y)<q.size+e.size+4)});
 const cap=r.mode==='survival'?DIRECTOR_CONFIG.survival.cap:Math.min(DIRECTOR_CONFIG.maxActive,difficultyProfile(r).cap);
 for(const p of points){if(r.enemies.filter(q=>q.hp>0).length>=cap)break;
  r.enemies.push({...e,...p,archetype:MIMIC_CONFIG.decoy,name:'Spectral echo',hp:1,maxHp:1,dmg:0,mimic:undefined,mimicOwner:e.mimic.id,decoyLeft:MIMIC_CONFIG.decoyLife,cast:null,contactWindup:0,stun:0,flash:0});
 }
}
function updateMimic(r,e,dt){
 tickMimic(e,r,dt,{visible:r.mode!=='story'||!r.story||storyLineOfSight(r,e.x,e.y,r.x,r.y,3),
  clear:()=>clearMimicCopies(r,e),split:()=>createMimicCopies(r,e),
  move(seconds){const from={x:e.x,y:e.y},a=storySteeringAngle(e,r,Math.atan2(r.y-e.y,r.x-e.x)),step=Math.min(100,e.speed)*seconds;e.x=Math.max(24,Math.min(MW-24,e.x+Math.cos(a)*step));e.y=Math.max(24,Math.min(MH-24,e.y+Math.sin(a)*step));storyMoveEnemy(r,e,from)},
  fire(angle){queueEnemyCast(e,[{angle,speed:180,dmg:e.dmg,color:'#d4b0ff'}]);if(e.cast){e.cast.left=0;tickEnemyCast(e,r,0)}}
 });
}
function updateBrute(r,e,dt,angle){
 e.brute??=createBruteState();e.charging=0;e.chargeWindup=0;e.traitCd=Math.max(0,(e.traitCd||0)-dt);
 const visible=r.mode!=='story'||!r.story||storyLineOfSight(r,e.x,e.y,r.x,r.y,2);
 const events=tickBrute(e,r,dt,{visible,approachAngle:angle,
  prepareZones(lockedAngle){
   e.cast=null;enemyTrait(e,r,0,lockedAngle,Math.hypot(e.x-r.x,e.y-r.y));
   const zones=(e.cast?.zones||[]).slice(0,4);e.cast=null;return zones;
  },
  onCharge(zones){if(zones.length){queueEnemyCast(e,[],zones);if(e.cast){e.cast.left=0;tickEnemyCast(e,r,0)}}},
  move(from,to,charging){
   const x=Math.max(24,Math.min(MW-24,to.x)),y=Math.max(24,Math.min(MH-24,to.y));
   if(charging){const radius=Math.min(18,Math.max(8,e.size*.65)),blocked=x!==to.x||y!==to.y||storySolid(r,x,y,radius);return blocked?{...from,blocked:true}:{x,y}}
   e.x=x;e.y=y;storyMoveEnemy(r,e,from);return{x:e.x,y:e.y};
  },
  onRush(from,to,start,end){
   const contact=rushPlayerContact(r,from,to,e.size+COMBAT_CONFIG.playerContactPadding,start,end);
   if(!contact||(r.mode==='story'&&r.story&&!storyLineOfSight(r,to.x,to.y,r.x,r.y,2)))return false;
   const accepted=damagePlayer(r,e.dmg,'contact',contact.fraction);
   if(accepted){e.attackAnim=.4;addCombatFx(r,'impact',to.x,to.y,{theme:enemyCombatTheme(e),size:28,life:.25})}return accepted;
  }});
 if(events.includes('windup'))sound(205,.07,'triangle',.025);
 if(events.includes('charge'))addCombatFx(r,'dashWake',e.x,e.y,{theme:enemyCombatTheme(e),angle:e.brute.angle,size:48,life:.35});
}
function updateRunner(r,e,dt,angle){
 e.runner??=createRunnerState();
 const visible=r.mode!=='story'||!r.story||storyLineOfSight(r,e.x,e.y,r.x,r.y,2);
 const events=tickRunner(e,r,dt,{visible,approachAngle:angle+Math.sin(e.phase*7)*.35,
  move(from,to,charging){
   const x=Math.max(24,Math.min(MW-24,to.x)),y=Math.max(24,Math.min(MH-24,to.y));
   if(charging){const radius=Math.min(18,Math.max(8,e.size*.65)),blocked=x!==to.x||y!==to.y||storySolid(r,x,y,radius);return blocked?{...from,blocked:true}:{x,y}}
   e.x=x;e.y=y;storyMoveEnemy(r,e,from);return{x:e.x,y:e.y};
  },
  onRush(from,to,start,end){
   const contact=rushPlayerContact(r,from,to,e.size+COMBAT_CONFIG.playerContactPadding,start,end);
   if(!contact||(r.mode==='story'&&r.story&&!storyLineOfSight(r,to.x,to.y,r.x,r.y,2)))return false;
   const accepted=damagePlayer(r,e.dmg,'contact',contact.fraction);
   if(accepted){e.attackAnim=.4;addCombatFx(r,'impact',to.x,to.y,{theme:enemyCombatTheme(e),size:28,life:.25})}return accepted;
  }});
 if(events.includes('windup'))sound(205,.07,'triangle',.025);
 if(events.includes('charge'))addCombatFx(r,'dashWake',e.x,e.y,{theme:enemyCombatTheme(e),angle:e.runner.angle,size:30,life:.28});
}
function runnerLaneLength(r,e){
 const s=e.runner;return enemyLaneLength(r,e,s.angle,s.speed*(s.state==='windup'?RUNNER_CONFIG.charge:s.left));
}
function enemyLaneLength(r,e,angle,max){
 const radius=Math.min(18,Math.max(8,e.size*.65));let clear=0;
 for(let length=0;length<max;){length=Math.min(max,length+5);const x=e.x+Math.cos(angle)*length,y=e.y+Math.sin(angle)*length;
  if(x<24||x>MW-24||y<24||y>MH-24||storySolid(r,x,y,radius))break;clear=length;
 }return clear;
}
function updateShadowStalker(r,e,dt,approachAngle){
 const attackers=r.enemies.filter(stalkerAttacking),index=attackers.indexOf(e),radius=Math.min(18,Math.max(8,e.size*.65));
 const clear=p=>p.x>=24&&p.x<=MW-24&&p.y>=24&&p.y<=MH-24&&!storySolid(r,p.x,p.y,radius);
 const events=tickShadowStalker(e,r,dt,{visible:r.mode!=='story'||!r.story||storyLineOfSight(r,e.x,e.y,r.x,r.y,2),approachAngle,
  slotAvailable:index<0?attackers.length<STALKER_CONFIG.maxAttacking:index<STALKER_CONFIG.maxAttacking,
  move(from,to,striking){
   if(striking)return clear(to)?to:{...from,blocked:true};
   const distance=Math.hypot(to.x-from.x,to.y-from.y),angle=Math.atan2(to.y-from.y,to.x-from.x);
   // A fixed local fan avoids nearby cover/bodies without a new per-actor path search.
   for(const turn of [0,e.stalker.side*Math.PI/3,-e.stalker.side*Math.PI/3,e.stalker.side*Math.PI*.7]){
    const p={x:from.x+Math.cos(angle+turn)*distance,y:from.y+Math.sin(angle+turn)*distance};
    if(clear(p)&&!r.enemies.some(q=>q!==e&&q.hp>0&&Math.hypot(q.x-p.x,q.y-p.y)<e.size+q.size+3))return p;
   }return{...from,blocked:true};
  },
  onStrike(from,to,start,end){
   const contact=rushPlayerContact(r,from,to,e.size+COMBAT_CONFIG.playerContactPadding,start,end);
   if(!contact||(r.mode==='story'&&r.story&&!storyLineOfSight(r,to.x,to.y,r.x,r.y,2)))return false;
   const accepted=damagePlayer(r,e.dmg,'contact',contact.fraction);if(accepted)addCombatFx(r,'impact',to.x,to.y,{theme:'void',size:28,life:.25});return accepted;
  }});
 if(events.includes('windup'))sound(155,.08,'triangle',.025);
 if(events.includes('strike'))addCombatFx(r,'dashWake',e.x,e.y,{theme:'void',angle:e.stalker.angle,size:32,life:.3});
}
function updateFuelThreatHud(r){
 const active=r.enemies.find(e=>e.archetype===EATER_CONFIG.archetype&&eaterCasting(e)),nearby=r.enemies.some(e=>e.hp>0&&e.archetype===EATER_CONFIG.archetype);
 const stalker=run?.enemies.find(stalkerAttacking),circling=run?.enemies.some(e=>e.hp>0&&isShadowStalker(e));
 const message=active?active.eater.state==='channel'?'Oil siphon active — hit or stun the Eater, dash, use Bright, or leave its ring.':'Lantern Eater charging — interrupt it or get out of its ring.':stalker?'Shadow Stalker pouncing — sidestep, stun, or switch to Bright.':nearby?'Lantern Eater nearby — Bright light repels siphons. Defeat it for an oil flask.':circling?'Shadow Stalker circles the light — Normal with at least 30 oil holds it back; Bright repels pounces.':'';
 const node=$('#fuelThreatNotice');if(node.textContent!==message)node.textContent=message;node.classList.toggle('hidden',!message);
}
const hitBeforeEater=hit;
hit=function(e,damage,isSkill=false,isBurn=false){
 if(isMimicDecoy(e)){if(e.hp>0&&Number.isFinite(damage)&&damage>0&&!run?.paused){e.hp=0;if(run)addCombatFx(run,'impact',e.x,e.y,{theme:'void',size:24,life:.25})}return}
 const before=e.hp;hitBeforeEater(e,damage,isSkill,isBurn);
 if(isWarden(e)&&before>0&&e.hp<=0){interruptWarden(e,'defeated');if(run)clearWardenZones(run,e)}
 if(isMimic(e)&&e.hp<before){interruptMimic(e,e.hp<=0?'defeated':'hit');if(run)clearMimicCopies(run,e)}
 if(isBrute(e)&&before>0&&e.hp<=0)interruptBrute(e,'defeated');
 if(isRunner(e)&&before>0&&e.hp<=0)interruptRunner(e,'defeated');
 if(isShadowStalker(e)&&before>0&&e.hp<=0)interruptStalker(e,'defeated');
 if(isCoverArcher(e)&&before>0&&e.hp<=0)interruptArcher(e,'defeated');
 if(e.archetype!==EATER_CONFIG.archetype||!e.eater||e.hp>=before)return;
 if(interruptEater(e,e.hp<=0?'defeated':'hit')&&run)textPop(e.x,e.y-55,'Siphon interrupted','#ffc76b');
 if(before>0&&e.hp<=0&&!e.eater.rewarded&&run?.lantern){e.eater.rewarded=true;
  const point=run.mode==='story'&&run.story?storyFreePoint(run,e.storyRoom||run.story.activeRoom,{x:e.x,y:e.y},12):{x:e.x,y:e.y};
  if(dropLanternPickup(run.lantern,point,EATER_CONFIG.killOil))textPop(point.x,point.y-30,'Oil reclaimed','#ffc76b');
 }
};
const drawBeforeEater=drawEnemyMotion;
drawEnemyMotion=function(c,e,t){const result=drawBeforeEater(c,e,t);drawLanternEater(c,e,run);drawMimic(c,e);drawWarden(c,e);if(isBrute(e)&&e.brute)drawBrute(c,e,{laneLength:enemyLaneLength(run,e,e.brute.angle,e.brute.speed*(e.brute.state==='windup'?BRUTE_CONFIG.charge:e.brute.left))});if(isCoverArcher(e)&&e.archer)drawCoverArcher(c,e,archerMuzzle(e));if(isRunner(e)&&e.runner)drawRunner(c,e,{laneLength:runnerLaneLength(run,e)});if(isShadowStalker(e)&&e.stalker){const s=e.stalker;drawShadowStalker(c,e,run,{laneLength:enemyLaneLength(run,e,s.angle,s.speed*(s.state==='windup'?STALKER_CONFIG.strike:s.state==='strike'?s.left:0))})}return result};drawAnimatedEnemy=drawEnemyMotion;drawChapterEnemy=drawEnemyMotion;

// Portrait play crops the wide camera surface rather than stretching the world.
// Keep the complete minimap inside that visible slice, including Story markers.
const viewportMinimapBefore=drawMinimap;
drawMinimap=function(c,r){
 const width=window.innerWidth,height=window.innerHeight,portrait=width<=700&&height>width;
 if(!portrait){viewportMinimapBefore(c,r);return}
 const visibleWidth=W*width/(height*1.6),left=(W-visibleWidth)/2,scale=.65;
 c.save();c.translate(left+5-12*scale,H-150-(H-190)*scale);c.scale(scale,scale);viewportMinimapBefore(c,r);c.restore();
};
// Combat motion is cosmetic: input, AI and damage continue through contact holds.
const motionHitBefore=hit;
hit=function(e,damage,isSkill=false,isBurn=false){
 const r=run,hp=e.hp;motionHitBefore(e,damage,isSkill,isBurn);
 if(!r||run!==r||e.hp>=hp||isBurn||isMimicDecoy(e))return;
 const angle=Math.atan2(e.y-r.y,e.x-r.x),heavy=isSkill||hp-e.hp>r.dmg*1.5;
 actorImpact(r,e,{angle,heavy,lethal:e.hp<=0,color:combatPalette[isSkill?combatSkillRecipes[r.activeSkill]?.theme||combatTheme(r):combatTheme(r)],reduced:reducedMotion});
 if(e.hp<=0)inheritActorMotion(r,e,r.corpses.at(-1));
};
const motionReleaseBefore=releaseClassAttack;
releaseClassAttack=function(r){
 const before=r.muzzle;motionReleaseBefore(r);
 const family=weaponAttackProfiles[r.weapon.id]?.family;
 if(r.muzzle!==before&&['cleave','lantern','punch'].includes(family))motionEvent(r,'strike',r.x,r.y-22,{family,angle:r.aim||0,radius:Math.min(65,r.hero.range*.7),color:combatPalette[combatTheme(r)],life:family==='punch'?.17:.22});
};
const motionBossReleaseBefore=releaseBossSkill;
releaseBossSkill=function(e,r){const cast=e.bossCast;motionBossReleaseBefore(e,r);if(cast&&e.bossCast!==cast&&e.hp>0)actorRelease(r,e,cast.angle||0)};
const motionDamageBefore=damagePlayer;
damagePlayer=function(r,...args){const accepted=motionDamageBefore(r,...args);if(accepted)motionEvent(r,'contact',r.x,r.y-22,{angle:(r.aim||0)+Math.PI,color:'#ff6874',heavy:true,life:.28});return accepted};
const motionDashBefore=dash;
dash=function(){const r=run,can=r&&!r.paused&&r.dashCd<=0;motionDashBefore();if(can&&r.dashTime>0){motionEvent(r,'launch',r.x,r.y+12,{color:'#bfa88b',life:.28});combatMotion(r).dashing=true}};$('#dash').onclick=dash;
const motionUpdateBefore=update;
update=function(dt){const r=run;motionUpdateBefore(dt);if(r&&run===r&&!r.paused)stepCombatMotion(r,dt,reducedMotion)};

// Materials and consumables persist independently of the expedition's equipment build.
const suppliesHitBefore=hit;
hit=function(e,damage,isSkill=false,isBurn=false){
 const r=run,hp=e.hp;suppliesHitBefore(e,damage*((r?.supplyBuffs?.fury_tonic||0)>0?1.15:1),isSkill,isBurn);
 if(!r||run!==r||hp<=0||e.hp>0||isMimicDecoy(e))return;
 const loot=materialRewards(e,e.boss||e.elite?0:directorRandom(ensureDirector(r),'events'));
 if(Object.keys(loot).length&&grantInventory(save,loot)){if(e.boss){textPop(e.x,e.y-65,'Boss core +1','#ffd777');if(loot.dawn_essence)textPop(e.x,e.y-82,'Dawn essence +1','#c484ff')}else if(e.elite)textPop(e.x,e.y-65,'Forge fragments +6','#ffd777');persist()}
};
const suppliesDamageBefore=damagePlayer;
damagePlayer=function(r,...args){const base=r.damageReduce;if((r.supplyBuffs?.iron_tonic||0)>0)r.damageReduce=Math.min(.65,(base||0)+.15);try{return suppliesDamageBefore(r,...args)}finally{r.damageReduce=base}};
const suppliesTickBefore=tickSpriteAnimation;
tickSpriteAnimation=function(r,dt){suppliesTickBefore(r,dt);tickSupplies(r,dt)};
const suppliesHudBefore=updateHud;
updateHud=function(){suppliesHudBefore();if(!run)return;const buffs=Object.entries(run.supplyBuffs||{}).filter(([,left])=>left>0).map(([id,left])=>(id==='fury_tonic'?'Fury ':'Guard ')+Math.ceil(left)+'s');$('#packButton span').textContent=(run.supplyCooldown||0)>0?Math.ceil(run.supplyCooldown)+'s':'Pack · I';$('#packButton').title='Field supplies · I. Health draught · R.'+(buffs.length?' '+buffs.join(' · '):'');$('#supplyBuffs').textContent=buffs.join(' · ');$('#supplyBuffs').classList.toggle('hidden',!buffs.length)};
$('#packButton').onclick=openBattlePack;
const supplyKeyHandler=e=>{if(!run||run.paused||e.repeat||e.ctrlKey||e.metaKey||e.altKey)return;const key=e.key.toLowerCase();if(key==='i'||key==='r'){e.preventDefault();keys.delete(key);if(key==='i')openBattlePack();else useBattleSupply('healing_potion')}};
window.addEventListener('keydown',supplyKeyHandler);

syncCamp();
renderShop();
if(storageOK)persist();
const walletTimer=setInterval(updateWallet,1000);
return {
 step(dt){dt=Math.max(0,Math.min(.05,dt));idleTime+=dt;update(dt)},
 render(){draw(run?run.time:idleTime)},
 action(name){if(name==='skill')skill();else if(name==='dash')dash();else if(name==='pause'&&run&&!run.paused)pauseGame();else if(name==='interact'&&run?.mode==='story')storyInteract();else if(name==='lantern')changeLanternMode()},
 setDirection(x,y){for(const k of ['w','a','s','d'])keys.delete(k);if(x<-.25)keys.add('a');if(x>.25)keys.add('d');if(y<-.25)keys.add('w');if(y>.25)keys.add('s')},
 suspend(){if(run){snapshot();if(!run.paused)pauseGame()}keys.clear();pointer=null},
 flush(){snapshot()},
 destroy(){snapshot();clearInterval(walletTimer);window.removeEventListener('keydown',lanternKeyHandler);window.removeEventListener('keydown',supplyKeyHandler);$('#packButton').onclick=null;$('#lanternMode').onclick=null;keys.clear()},
 get state(){return {playing:!!run,paused:!!run?.paused,page:currentPage}},
};
}
