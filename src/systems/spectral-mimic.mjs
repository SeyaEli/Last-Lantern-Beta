export const MIMIC_CONFIG=Object.freeze({archetype:'spectral-mimic',decoy:'mimic-decoy',type:3,cost:5,
  maxAlive:2,maxDecoys:2,firstPhase:3,chance:.22,startRange:240,breakRange:320,
  initialCooldown:3,cooldown:5,interruptCooldown:2.5,split:1,illusion:2.4,aim:.75,recovery:1.1,decoyLife:4.5});
const states=['approach','split','illusion','aim','recover','stunned'];
export const isMimic=e=>e?.archetype===MIMIC_CONFIG.archetype;
export const isMimicDecoy=e=>e?.archetype===MIMIC_CONFIG.decoy;
export function createMimicState(id){return{version:1,id,state:'approach',left:0,cooldown:MIMIC_CONFIG.initialCooldown,angle:0,reason:''}}
export function validMimicState(s){
  if(!s||s.version!==1||!Number.isSafeInteger(s.id)||s.id<1||!states.includes(s.state))return false;
  const limit={approach:0,split:MIMIC_CONFIG.split,illusion:MIMIC_CONFIG.illusion,aim:MIMIC_CONFIG.aim,recover:MIMIC_CONFIG.recovery,stunned:0}[s.state];
  return Number.isFinite(s.left)&&s.left>=0&&s.left<=limit+1e-8&&Number.isFinite(s.cooldown)&&s.cooldown>=0&&s.cooldown<=MIMIC_CONFIG.cooldown&&
    Number.isFinite(s.angle)&&Math.abs(s.angle)<=Math.PI&&['','completed','hit','stun','cover','range','defeated'].includes(s.reason);
}
export function interruptMimic(e,reason='hit'){
  const s=e.mimic;if(!s)return;
  Object.assign(s,{state:reason==='stun'?'stunned':'recover',left:reason==='stun'?0:MIMIC_CONFIG.recovery,cooldown:MIMIC_CONFIG.interruptCooldown,reason});e.cast=null;e.contactWindup=0;
}
/** The adapter owns copies, collisions, projectiles and terrain. No ambient randomness. */
export function tickMimic(e,p,dt,{visible=true,move,split,clear,fire}={}){
  const s=e.mimic;if(!s||!Number.isFinite(dt)||dt<=0||p.paused||p.hp<=0)return;
  if(e.hp<=0){interruptMimic(e,'defeated');clear?.();return}
  s.cooldown=Math.max(0,s.cooldown-dt);e.cast=null;e.contactWindup=0;
  if(e.stun>0){interruptMimic(e,'stun');e.stun=Math.max(0,e.stun-dt);clear?.();return}
  if(s.state==='stunned'){s.state='recover';s.left=MIMIC_CONFIG.recovery;return}
  const distance=Math.hypot(e.x-p.x,e.y-p.y);
  if(['split','illusion','aim'].includes(s.state)&&(!visible||distance>MIMIC_CONFIG.breakRange)){
    interruptMimic(e,visible?'range':'cover');clear?.();return;
  }
  if(s.state==='approach'){
    if(visible&&distance<=MIMIC_CONFIG.startRange&&s.cooldown<=0){s.state='split';s.left=MIMIC_CONFIG.split;s.reason=''}
    else if(distance>180||!visible)move?.(dt);
    return;
  }
  let remaining=dt;
  // Complete only the current sequence; never start a catch-up attack.
  for(let boundary=0;boundary<4&&remaining>1e-9;boundary++){
    const step=Math.min(remaining,s.left);s.left=Math.max(0,s.left-step);remaining-=step;if(s.left>1e-9)break;
    if(s.state==='split'){s.state='illusion';s.left=MIMIC_CONFIG.illusion;split?.()}
    else if(s.state==='illusion'){s.state='aim';s.left=MIMIC_CONFIG.aim;s.angle=Math.atan2(p.y-(e.y-e.size*.5),p.x-e.x)}
    else if(s.state==='aim'){s.state='recover';s.left=MIMIC_CONFIG.recovery;s.cooldown=Math.max(0,MIMIC_CONFIG.cooldown-remaining);s.reason='completed';fire?.(s.angle)}
    else{s.state='approach';s.left=0;clear?.();break}
  }
}
/** Two safe positions, testing a fixed fan of six candidates. */
export function chooseMimicCopies(e,{canPlace}){
  const points=[];for(let i=0;i<6&&points.length<MIMIC_CONFIG.maxDecoys;i++){
    const a=(e.phase||0)*Math.PI*2+i*Math.PI/3,p={x:e.x+Math.cos(a)*62,y:e.y+Math.sin(a)*62};
    if(canPlace(p))points.push(p);
  }return points;
}
