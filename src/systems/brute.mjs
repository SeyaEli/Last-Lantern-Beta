// Type 4 retains the existing heavy enemy identities and director cost.
export const BRUTE_CONFIG=Object.freeze({type:4,windup:.9,charge:.8,recovery:1.3,
  cooldown:4.2,interruptCooldown:2,initialCooldown:2.5,startRange:180,breakRange:320,
  speedMultiplier:5.2,minRushSpeed:220,maxSpeed:300,moveStep:5});
const states=['approach','guard','windup','charge','recover','stunned'];
const reasons=['','completed','stun','cover','range','blocked','defeated'];
export function isBrute(e){return !!e&&!e.boss&&e.type===BRUTE_CONFIG.type&&!e.archetype}
export function createBruteState(){return{version:1,state:'approach',left:0,cooldown:BRUTE_CONFIG.initialCooldown,
  angle:0,speed:0,hit:false,zones:[],reason:''}}
export function validBruteState(s){
  if(!s||s.version!==1||!states.includes(s.state)||!reasons.includes(s.reason)||typeof s.hit!=='boolean')return false;
  const limit={approach:0,guard:0,windup:BRUTE_CONFIG.windup,charge:BRUTE_CONFIG.charge,recover:BRUTE_CONFIG.recovery,stunned:0}[s.state];
  return Number.isFinite(s.left)&&s.left>=0&&s.left<=limit+1e-8&&Number.isFinite(s.cooldown)&&s.cooldown>=0&&s.cooldown<=BRUTE_CONFIG.cooldown&&
    Number.isFinite(s.angle)&&Math.abs(s.angle)<=Math.PI&&Number.isFinite(s.speed)&&s.speed>=0&&s.speed<=BRUTE_CONFIG.maxSpeed&&Array.isArray(s.zones)&&s.zones.length<=4&&
    (s.state==='windup'||s.zones.length===0)&&s.zones.every(z=>z&&Number.isFinite(z.x)&&z.x>=0&&z.x<=2400&&Number.isFinite(z.y)&&z.y>=0&&z.y<=1500&&Number.isFinite(z.radius)&&z.radius>0&&z.radius<=150&&Number.isFinite(z.dmg)&&z.dmg>=0&&z.dmg<=1e12);
}
export function interruptBrute(e,reason='stun'){
  if(!e.brute)return;
  Object.assign(e.brute,{state:reason==='stun'?'stunned':'recover',left:reason==='stun'?0:BRUTE_CONFIG.recovery,
    cooldown:BRUTE_CONFIG.interruptCooldown,zones:[],reason});
  e.contactWindup=0;e.cast=null;
}
/** Serializable simulation only. Adapters supply terrain movement and swept contact. */
export function tickBrute(e,player,dt,{visible=true,approachAngle,move,onRush,prepareZones,onCharge}={}){
  const s=e.brute,events=[];
  if(!s||!Number.isFinite(dt)||dt<=0||player.paused||player.hp<=0)return events;
  if(e.hp<=0){interruptBrute(e,'defeated');return events}
  s.cooldown=Math.max(0,s.cooldown-dt);e.contactWindup=0;e.cast=null;
  if(e.stun>0){interruptBrute(e,'stun');e.stun=Math.max(0,e.stun-dt);return events}
  if(s.state==='stunned'){s.state='recover';s.left=BRUTE_CONFIG.recovery;return events}
  const distance=Math.hypot(player.x-e.x,player.y-e.y),angle=Math.atan2(player.y-e.y,player.x-e.x);
  if(s.state==='windup'&&(!visible||distance>BRUTE_CONFIG.breakRange)){
    interruptBrute(e,visible?'range':'cover');events.push('interrupted');return events;
  }
  const travel=(seconds,heading,speed,charging,offset)=>{
    const n=Math.max(1,Math.ceil(speed*seconds/BRUTE_CONFIG.moveStep));
    for(let i=0;i<n;i++){
      const from={x:e.x,y:e.y},to={x:e.x+Math.cos(heading)*speed*seconds/n,y:e.y+Math.sin(heading)*speed*seconds/n};
      const actual=move?move(from,to,charging):to;e.x=actual.x;e.y=actual.y;
      if(charging&&!s.hit&&onRush?.(from,actual,(offset+seconds*i/n)/dt,(offset+seconds*(i+1)/n)/dt))s.hit=true;
      if(charging&&actual.blocked){interruptBrute(e,'blocked');events.push('blocked');return false}
    }
    return true;
  };
  if(s.state==='approach'||s.state==='guard'){
    if(s.cooldown<=0&&visible&&distance<=BRUTE_CONFIG.startRange&&e.speed>0){
      Object.assign(s,{state:'windup',left:BRUTE_CONFIG.windup,angle,speed:Math.min(BRUTE_CONFIG.maxSpeed,Math.max(BRUTE_CONFIG.minRushSpeed,e.speed*BRUTE_CONFIG.speedMultiplier)),hit:false,zones:prepareZones?.(angle)||[],reason:''});events.push('windup');
    }else if(visible&&distance<=BRUTE_CONFIG.startRange){s.state='guard';s.left=0}
    else{s.state='approach';travel(dt,approachAngle??angle,Math.min(BRUTE_CONFIG.maxSpeed,Math.max(0,e.speed)),false,0)}
    return events;
  }
  let remaining=dt;
  // Only finish the current attack/recovery; never start a catch-up attack this tick.
  for(let boundary=0;boundary<3&&remaining>1e-9;boundary++){
    const seconds=Math.min(remaining,s.left),offset=dt-remaining;
    if(s.state==='charge'&&!travel(seconds,s.angle,s.speed,true,offset))break;
    s.left=Math.max(0,s.left-seconds);remaining-=seconds;
    if(s.left>1e-9)break;
    if(s.state==='windup'){s.state='charge';s.left=BRUTE_CONFIG.charge;const zones=s.zones;s.zones=[];onCharge?.(zones);events.push('charge')}
    else if(s.state==='charge'){s.state='recover';s.left=BRUTE_CONFIG.recovery;s.cooldown=Math.max(0,BRUTE_CONFIG.cooldown-remaining);s.reason='completed';events.push('recover')}
    else{s.state='approach';s.left=0;break}
  }
  return events;
}
