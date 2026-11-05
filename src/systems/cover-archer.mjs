export const ARCHER_CONFIG=Object.freeze({type:2,minRange:100,retreatUntil:135,preferredRange:185,maxRange:260,
  windup:.65,release:.16,recovery:.65,hide:.45,cooldown:2.6,interruptCooldown:1.2,initialCooldown:2.2,
  planInterval:2.4,plansPerFrame:1,maxBoxes:12,coverDistance:250,goalTolerance:7,maxMoveSpeed:130,
  projectileSpeed:170,maxShots:8,maxZones:4});
const states=['approach','seek','hide','peek','retreat','windup','release','recover','stunned'];
const reasons=['','completed','stun','cover','range','pressure','blocked','defeated'];
const point=p=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=2400&&p.y>=0&&p.y<=1500;
export function isCoverArcher(e){return !!e&&!e.boss&&e.type===ARCHER_CONFIG.type&&!e.archetype}
export function createArcherState(phase=0){return{version:1,state:'approach',left:0,cooldown:ARCHER_CONFIG.initialCooldown,
  planClock:Math.max(0,Math.min(1,phase))*ARCHER_CONFIG.planInterval,cover:null,angle:0,aimX:0,aimY:0,volley:null,reason:''}}
export function validArcherVolley(v){return !!v&&Array.isArray(v.shots)&&v.shots.length<=ARCHER_CONFIG.maxShots&&Array.isArray(v.zones)&&v.zones.length<=ARCHER_CONFIG.maxZones&&
  v.shots.every(s=>s&&Number.isFinite(s.angle)&&Math.abs(s.angle)<=Math.PI*2&&Number.isFinite(s.speed)&&s.speed>0&&s.speed<=1000&&Number.isFinite(s.dmg)&&s.dmg>=0&&s.dmg<=1e12&&(s.color===undefined||typeof s.color==='string'&&/^#[0-9a-f]{3,8}$/i.test(s.color)))&&
  v.zones.every(z=>point(z)&&Number.isFinite(z.radius)&&z.radius>0&&z.radius<=150&&Number.isFinite(z.dmg)&&z.dmg>=0&&z.dmg<=1e12)}
export function validArcherState(s){
  if(!s||s.version!==1||!states.includes(s.state)||!reasons.includes(s.reason))return false;
  const max={approach:0,seek:0,hide:ARCHER_CONFIG.hide,peek:0,retreat:0,windup:ARCHER_CONFIG.windup,release:ARCHER_CONFIG.release,recover:ARCHER_CONFIG.recovery,stunned:0}[s.state];
  return Number.isFinite(s.left)&&s.left>=0&&s.left<=max+1e-8&&Number.isFinite(s.cooldown)&&s.cooldown>=0&&s.cooldown<=ARCHER_CONFIG.cooldown&&Number.isFinite(s.planClock)&&s.planClock>=0&&s.planClock<=ARCHER_CONFIG.planInterval&&
    Number.isFinite(s.angle)&&Math.abs(s.angle)<=Math.PI&&point({x:s.aimX,y:s.aimY})&&
    (s.cover===null||!!s.cover&&point(s.cover.hide)&&point(s.cover.peek))&&(s.state==='windup'?validArcherVolley(s.volley):s.volley===null);
}
export function interruptArcher(e,reason='stun'){
  if(!e.archer)return;Object.assign(e.archer,{state:reason==='stun'?'stunned':reason==='pressure'?'retreat':'recover',left:reason==='stun'||reason==='pressure'?0:ARCHER_CONFIG.recovery,
    cooldown:ARCHER_CONFIG.interruptCooldown,volley:null,reason});e.cast=null;e.contactWindup=0;
}
/** Two candidate pairs per nearby rectangle, at most 24; no search of the whole map. */
export function chooseArcherCover(e,player,boxes,{canStand,visibleAt,pathClear,reserved=()=>false}){
  let best=null,bestScore=Infinity;const pad=Math.max(14,Math.min(18,e.size*.65+6));
  for(const b of boxes.slice(0,ARCHER_CONFIG.maxBoxes)){
    const cx=b.x+b.w/2,cy=b.y+b.h/2,dx=player.x-cx,dy=player.y-cy;
    let hide,peeks;
    if(Math.abs(dx)/b.w>=Math.abs(dy)/b.h){const x=dx<0?b.x+b.w+pad:b.x-pad;hide={x,y:Math.max(b.y,Math.min(b.y+b.h,player.y))};peeks=[{x,y:b.y-pad},{x,y:b.y+b.h+pad}]}
    else{const y=dy<0?b.y+b.h+pad:b.y-pad;hide={x:Math.max(b.x,Math.min(b.x+b.w,player.x)),y};peeks=[{x:b.x-pad,y},{x:b.x+b.w+pad,y}]}
    if(!point(hide)||!canStand(hide)||visibleAt(hide)||reserved(hide))continue;
    for(const peek of peeks){const range=Math.hypot(peek.x-player.x,peek.y-player.y),travel=Math.hypot(hide.x-e.x,hide.y-e.y);
      if(!point(peek)||range<ARCHER_CONFIG.retreatUntil||range>ARCHER_CONFIG.maxRange||travel>ARCHER_CONFIG.coverDistance||!canStand(peek)||!visibleAt(peek)||!pathClear(hide,peek)||!pathClear(e,hide)&&!pathClear(e,peek)||reserved(peek))continue;
      const score=travel+Math.abs(range-ARCHER_CONFIG.preferredRange)*.6+Math.hypot(peek.x-hide.x,peek.y-hide.y)*.25;
      if(score<bestScore){bestScore=score;best={hide:{...hide},peek:{...peek}}}
    }
  }return best;
}
/** Timers and attack ownership only; terrain, navigation, volleys and art stay in adapters. */
export function tickCoverArcher(e,player,dt,{visible=true,aimClear=true,origin=e,approachAngle,findCover,coverValid,move,prepareVolley,onRelease}={}){
  const s=e.archer,events=[];if(!s||!Number.isFinite(dt)||dt<=0||player.paused||player.hp<=0)return events;
  if(e.hp<=0){interruptArcher(e,'defeated');return events}
  s.cooldown=Math.max(0,s.cooldown-dt);s.planClock=Math.max(0,s.planClock-dt);e.cast=null;e.contactWindup=0;
  if(e.stun>0){interruptArcher(e,'stun');e.stun=Math.max(0,e.stun-dt);return events}
  if(s.state==='stunned'){s.state='recover';s.left=ARCHER_CONFIG.recovery;return events}
  const distance=Math.hypot(player.x-e.x,player.y-e.y),angle=Math.atan2(player.y-e.y,player.x-e.x);
  if(s.state==='windup'){
    const reason=!visible||!aimClear?'cover':distance<ARCHER_CONFIG.minRange?'pressure':distance>ARCHER_CONFIG.maxRange+50?'range':null;
    if(reason){interruptArcher(e,reason);events.push('interrupted');return events}
  }
  if(['windup','release','recover','hide'].includes(s.state)){
    let remaining=dt;
    for(let boundary=0;boundary<4&&remaining>1e-9;boundary++){
      const seconds=Math.min(remaining,s.left);s.left=Math.max(0,s.left-seconds);remaining-=seconds;if(s.left>1e-9)break;
      if(s.state==='windup'){const volley=s.volley;s.volley=null;s.state='release';s.left=ARCHER_CONFIG.release;s.cooldown=Math.max(0,ARCHER_CONFIG.cooldown-remaining);s.reason='completed';onRelease?.(volley,s.angle);events.push('release')}
      else if(s.state==='release'){s.state='recover';s.left=ARCHER_CONFIG.recovery}
      else{s.state=s.cover?(s.state==='hide'?'peek':'seek'):'approach';s.left=0;break}
    }return events;
  }
  if(distance<ARCHER_CONFIG.minRange||s.state==='retreat'&&distance<ARCHER_CONFIG.retreatUntil){s.state='retreat'}
  else if(s.state==='retreat')s.state=s.cover?'seek':'approach';
  if(s.state!=='retreat'&&s.planClock<=0){
    if(s.cover&&coverValid?.(s.cover)===false){s.cover=null;s.state='approach'}
    const planned=s.cover||findCover?.();
    if(planned!==undefined){s.planClock=ARCHER_CONFIG.planInterval;if(planned&&!s.cover){s.cover=planned;s.state='seek'}}
  }
  let heading=approachAngle??angle,shouldMove=false;
  if(s.state==='retreat'){heading=angle+Math.PI;shouldMove=true}
  else if(s.cover&&['seek','peek'].includes(s.state)){
    const target=s.state==='seek'?s.cover.hide:s.cover.peek,travel=Math.hypot(target.x-e.x,target.y-e.y);
    if(travel>ARCHER_CONFIG.goalTolerance){heading=Math.atan2(target.y-e.y,target.x-e.x);shouldMove=true}
    else if(s.state==='seek'){s.state='hide';s.left=ARCHER_CONFIG.hide;return events}
  }else if(distance>ARCHER_CONFIG.preferredRange||!visible){s.state='approach';shouldMove=true}
  if(!shouldMove&&visible&&distance>=ARCHER_CONFIG.minRange&&distance<=ARCHER_CONFIG.maxRange&&s.cooldown<=0&&s.state!=='retreat'){
    s.angle=Math.atan2(player.y-origin.y,player.x-origin.x);s.aimX=player.x;s.aimY=player.y;
    s.volley=prepareVolley?.(s.angle)||{shots:[{angle:s.angle,speed:ARCHER_CONFIG.projectileSpeed,dmg:e.dmg}],zones:[]};
    s.state='windup';s.left=ARCHER_CONFIG.windup;s.reason='';events.push('windup');return events;
  }
  if(shouldMove){
    const speed=Math.min(ARCHER_CONFIG.maxMoveSpeed,Math.max(0,e.speed)),step=speed*dt,from={x:e.x,y:e.y};
    const goal=s.cover&&['seek','peek'].includes(s.state)?s.cover[s.state==='seek'?'hide':'peek']:null,length=goal?Math.min(step,Math.hypot(goal.x-e.x,goal.y-e.y)):step;
    const to={x:e.x+Math.cos(heading)*length,y:e.y+Math.sin(heading)*length},actual=move?move(from,to,s.state):to;e.x=actual.x;e.y=actual.y;
    if(actual.blocked&&s.cover){s.cover=null;s.state='approach';s.planClock=.5;s.reason='blocked'}
  }return events;
}
