import {LANTERN_CONFIG,lanternRadius,shadowSpeedMultiplier} from './lantern.mjs';

export const STALKER_CONFIG=Object.freeze({archetype:'shadow-stalker',chapter:1,type:0,cost:2,
  maxAlive:3,maxAttacking:1,firstPhase:1,chance:Object.freeze({steady:.25,low:.35,critical:.4,empty:.4}),
  edgePadding:24,edgeTolerance:12,retreatPadding:8,patience:1.8,hungryPatience:.9,
  windup:.75,strike:.75,recovery:.9,cooldown:3.6,interruptCooldown:1.8,initialCooldown:1.5,
  breakRange:260,strikeMultiplier:4.8,maxStrikeSpeed:260,maxMoveSpeed:140,moveStep:5});
const states=['approach','flank','retreat','windup','strike','recover','stunned'];
const reasons=['','completed','light','stun','cover','range','blocked','slot','defeated'];
export function isShadowStalker(e){return !!e&&e.archetype===STALKER_CONFIG.archetype}
export function stalkerAttacking(e){return isShadowStalker(e)&&e.hp>0&&['windup','strike'].includes(e.stalker?.state)}
export function createStalkerState(side=1){return{version:1,state:'approach',left:0,cooldown:STALKER_CONFIG.initialCooldown,
  circle:0,side:side<0?-1:1,angle:0,speed:0,hit:false,reason:''}}
export function validStalkerState(s){
  if(!s||s.version!==1||!states.includes(s.state)||!reasons.includes(s.reason)||typeof s.hit!=='boolean'||![1,-1].includes(s.side))return false;
  const max={approach:0,flank:0,retreat:0,windup:STALKER_CONFIG.windup,strike:STALKER_CONFIG.strike,recover:STALKER_CONFIG.recovery,stunned:0}[s.state];
  return Number.isFinite(s.left)&&s.left>=0&&s.left<=max+1e-8&&Number.isFinite(s.cooldown)&&s.cooldown>=0&&s.cooldown<=STALKER_CONFIG.cooldown&&
    Number.isFinite(s.circle)&&s.circle>=0&&s.circle<=STALKER_CONFIG.patience&&Number.isFinite(s.angle)&&Math.abs(s.angle)<=Math.PI&&
    Number.isFinite(s.speed)&&s.speed>=0&&s.speed<=STALKER_CONFIG.maxStrikeSpeed;
}
export function interruptStalker(e,reason='stun'){
  if(!e.stalker)return;
  Object.assign(e.stalker,{state:reason==='stun'?'stunned':'recover',left:reason==='stun'?0:STALKER_CONFIG.recovery,
    cooldown:STALKER_CONFIG.interruptCooldown,circle:0,reason});e.cast=null;e.contactWindup=0;
}
export function stalkerLight(player){
  const fuel=player.lantern?.fuel??100,mode=player.lantern?.mode??'normal';
  const radius=player.lantern?lanternRadius(player.lantern):LANTERN_CONFIG.modes.normal.radius;
  return{fuel,mode,radius,edge:radius+STALKER_CONFIG.edgePadding,
    hunting:fuel<=0||mode!=='bright'&&(mode==='dim'||fuel<LANTERN_CONFIG.lowThreshold)};
}
/** No rendering, RNG or terrain ownership. Movement/contact adapters use existing game authorities. */
export function tickShadowStalker(e,player,dt,{visible=true,slotAvailable=true,approachAngle,move,onStrike}={}){
  const s=e.stalker,events=[];
  if(!s||!Number.isFinite(dt)||dt<=0||player.paused||player.hp<=0)return events;
  if(e.hp<=0){interruptStalker(e,'defeated');return events}
  s.cooldown=Math.max(0,s.cooldown-dt);e.cast=null;e.contactWindup=0;
  if(e.stun>0){interruptStalker(e,'stun');e.stun=Math.max(0,e.stun-dt);return events}
  if(s.state==='stunned'){s.state='recover';s.left=STALKER_CONFIG.recovery;return events}
  const light=stalkerLight(player),distance=Math.hypot(e.x-player.x,e.y-player.y),angle=Math.atan2(player.y-e.y,player.x-e.x);
  const lit=light.fuel>0&&distance<=light.radius;
  if(s.state==='windup'||s.state==='strike'){
    const reason=!visible&&s.state==='windup'?'cover':distance>STALKER_CONFIG.breakRange?'range':!slotAvailable?'slot':
      s.state==='windup'&&(lit||!light.hunting)?'light':light.mode==='bright'&&lit?'light':null;
    if(reason){interruptStalker(e,reason);events.push('interrupted');return events}
  }
  const travel=(seconds,heading,speed,striking,offset=0)=>{
    const n=Math.max(1,Math.ceil(speed*seconds/STALKER_CONFIG.moveStep));
    for(let i=0;i<n;i++){
      const from={x:e.x,y:e.y},to={x:e.x+Math.cos(heading)*speed*seconds/n,y:e.y+Math.sin(heading)*speed*seconds/n};
      const actual=move?move(from,to,striking):to;e.x=actual.x;e.y=actual.y;
      if(striking&&!s.hit&&onStrike?.(from,actual,(offset+seconds*i/n)/dt,(offset+seconds*(i+1)/n)/dt))s.hit=true;
      if(actual.blocked){if(striking){interruptStalker(e,'blocked');events.push('blocked')}else s.side*=-1;return false}
    }return true;
  };
  if(['windup','strike','recover'].includes(s.state)){
    let remaining=dt;
    for(let boundary=0;boundary<3&&remaining>1e-9;boundary++){
      const seconds=Math.min(remaining,s.left),offset=dt-remaining;
      if(s.state==='strike'&&!travel(seconds,s.angle,s.speed,true,offset))break;
      s.left=Math.max(0,s.left-seconds);remaining-=seconds;if(s.left>1e-9)break;
      if(s.state==='windup'){s.state='strike';s.left=STALKER_CONFIG.strike;events.push('strike')}
      else if(s.state==='strike'){s.state='recover';s.left=STALKER_CONFIG.recovery;s.cooldown=Math.max(0,STALKER_CONFIG.cooldown-remaining);s.reason='completed';events.push('recover')}
      else{s.state='approach';s.left=0;s.circle=0;break}
    }return events;
  }
  const speed=Math.min(STALKER_CONFIG.maxMoveSpeed,Math.max(0,e.speed)*shadowSpeedMultiplier(player.lantern,e,player));
  if(!visible){s.state='approach';s.circle=0;travel(dt,approachAngle??angle,speed,false);return events}
  // Hysteresis prevents repeated approach/retreat switching at the illumination edge.
  if(light.fuel>0&&(distance<light.radius+STALKER_CONFIG.retreatPadding||s.state==='retreat'&&distance<light.edge-6)){
    s.state='retreat';s.circle=0;travel(dt,angle+Math.PI,speed,false);return events;
  }
  if(distance>light.edge+STALKER_CONFIG.edgeTolerance){s.state='approach';s.circle=0;travel(dt,approachAngle??angle,speed,false);return events}
  s.state='flank';s.circle=Math.min(STALKER_CONFIG.patience,s.circle+dt);
  const patience=light.fuel<LANTERN_CONFIG.lowThreshold?STALKER_CONFIG.hungryPatience:STALKER_CONFIG.patience;
  if(light.hunting&&s.circle>=patience&&s.cooldown<=0&&slotAvailable&&e.speed>0){
    Object.assign(s,{state:'windup',left:STALKER_CONFIG.windup,angle,speed:Math.min(STALKER_CONFIG.maxStrikeSpeed,e.speed*STALKER_CONFIG.strikeMultiplier*shadowSpeedMultiplier(player.lantern,e,player)),circle:0,hit:false,reason:''});events.push('windup');return events;
  }
  const radial=Math.max(-1,Math.min(1,(light.edge-distance)/24)),outward=angle+Math.PI;
  const dx=Math.cos(outward)*radial-Math.sin(outward)*s.side*.8,dy=Math.sin(outward)*radial+Math.cos(outward)*s.side*.8;
  travel(dt,Math.atan2(dy,dx),speed,false);return events;
}
