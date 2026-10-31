import {LANTERN_CONFIG,lanternRadius,drainLanternFuel} from './lantern.mjs';

export const EATER_CONFIG=Object.freeze({
  archetype:'lantern-eater',cost:4,maxAlive:2,maxCasting:1,firstPhase:2,
  chance:Object.freeze({steady:.18,low:.38,critical:.5,empty:0}),
  startRange:150,breakRange:190,standRange:130,windup:1.2,channel:2.4,
  drainPerSecond:6,recovery:.9,cooldown:6,interruptCooldown:4,initialCooldown:2.5,
  killOil:12
});
const reasons=['','hit','stun','cover','range','bright','protected','empty','completed','slot','defeated'];
export function createEaterState(){return{version:1,state:'approach',left:0,cooldown:EATER_CONFIG.initialCooldown,drained:0,reason:'',rewarded:false}}
export function validEaterState(s){
  if(!s||s.version!==1||!['approach','windup','channel','recover'].includes(s.state)||!reasons.includes(s.reason)||typeof s.rewarded!=='boolean')return false;
  const max={approach:0,windup:EATER_CONFIG.windup,channel:EATER_CONFIG.channel,recover:EATER_CONFIG.recovery}[s.state];
  return Number.isFinite(s.left)&&s.left>=0&&s.left<=max+1e-8&&Number.isFinite(s.cooldown)&&s.cooldown>=0&&s.cooldown<=EATER_CONFIG.cooldown&&Number.isFinite(s.drained)&&s.drained>=0&&s.drained<=1e12;
}
export function fuelPressure(fuel){return fuel<=0?'empty':fuel<LANTERN_CONFIG.criticalThreshold?'critical':fuel<LANTERN_CONFIG.lowThreshold?'low':'steady'}
export function eaterCasting(enemy){return enemy.hp>0&&enemy.eater&&['windup','channel'].includes(enemy.eater.state)}
export function interruptEater(enemy,reason='hit'){
  if(!enemy.eater||!['windup','channel'].includes(enemy.eater.state))return false;
  Object.assign(enemy.eater,{state:'recover',left:EATER_CONFIG.recovery,cooldown:EATER_CONFIG.interruptCooldown,reason});return true;
}
/** Resource-only brain. Navigation, terrain queries and presentation stay in runtime adapters. */
export function tickLanternEater(enemy,player,dt,{visible=true,slotAvailable=true}={}){
  const s=enemy.eater;
  if(!s||!Number.isFinite(dt)||dt<=0||player.paused||player.hp<=0)return{move:false,event:null,drained:0};
  const dis=Math.hypot(enemy.x-player.x,enemy.y-player.y),fuel=player.lantern;
  s.cooldown=Math.max(0,s.cooldown-dt);
  let blocked=enemy.hp<=0?'defeated':enemy.stun>0?'stun':!visible?'cover':dis>EATER_CONFIG.breakRange?'range':
    !fuel||fuel.fuel<=0?'empty':player.invuln>0||player.shield>0?'protected':fuel.mode==='bright'&&dis<=lanternRadius(fuel)?'bright':!slotAvailable?'slot':null;
  if(blocked&&interruptEater(enemy,blocked))return{move:false,event:'interrupted',drained:0};
  if(enemy.stun>0){enemy.stun=Math.max(0,enemy.stun-dt);return{move:false,event:null,drained:0}}
  if(enemy.hp<=0)return{move:false,event:null,drained:0};
  if(s.state==='approach'){
    if(!blocked&&s.cooldown<=0&&dis<=EATER_CONFIG.startRange){s.state='windup';s.left=EATER_CONFIG.windup;s.reason='';return{move:false,event:'windup',drained:0}}
    return{move:dis>EATER_CONFIG.standRange,event:null,drained:0};
  }
  let remaining=dt,drained=0,event=null;
  // At most windup -> channel -> recovery per tick; no catch-up chain of new attacks.
  for(let boundary=0;boundary<3&&remaining>1e-9;boundary++){
    const step=Math.min(remaining,s.left);s.left=Math.max(0,s.left-step);remaining-=step;
    if(s.state==='channel'){const taken=drainLanternFuel(fuel,EATER_CONFIG.drainPerSecond*step);drained+=taken;s.drained+=taken;
      if(fuel.fuel<=0){s.state='recover';s.left=EATER_CONFIG.recovery;s.cooldown=EATER_CONFIG.cooldown;s.reason='empty';event='completed';break}}
    if(s.left>1e-9)break;
    if(s.state==='windup'){s.state='channel';s.left=EATER_CONFIG.channel;event='channel'}
    else if(s.state==='channel'){s.state='recover';s.left=EATER_CONFIG.recovery;s.cooldown=EATER_CONFIG.cooldown;s.reason='completed';event='completed'}
    else{s.state='approach';s.left=0;break}
  }
  return{move:false,event,drained};
}
