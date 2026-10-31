// Type 1 is the existing two-point mobility slot. Keep its chapter identity/art.
export const RUNNER_CONFIG=Object.freeze({type:1,windup:.65,charge:.42,recovery:.8,
  cooldown:3.2,interruptCooldown:1.8,initialCooldown:1.5,startRange:190,breakRange:300,
  speedMultiplier:3.4,maxSpeed:340,moveStep:5});
const states=['approach','windup','charge','recover','stunned'];
const reasons=['','completed','stun','cover','range','blocked','defeated'];
export function isRunner(e){return !!e&&!e.boss&&e.type===RUNNER_CONFIG.type&&!e.archetype}
export function createRunnerState(){return{version:1,state:'approach',left:0,cooldown:RUNNER_CONFIG.initialCooldown,
  angle:0,speed:0,hit:false,reason:''}}
export function validRunnerState(s){
  if(!s||s.version!==1||!states.includes(s.state)||!reasons.includes(s.reason)||typeof s.hit!=='boolean')return false;
  const limit={approach:0,windup:RUNNER_CONFIG.windup,charge:RUNNER_CONFIG.charge,recover:RUNNER_CONFIG.recovery,stunned:0}[s.state];
  return Number.isFinite(s.left)&&s.left>=0&&s.left<=limit+1e-8&&Number.isFinite(s.cooldown)&&s.cooldown>=0&&s.cooldown<=RUNNER_CONFIG.cooldown&&
    Number.isFinite(s.angle)&&Math.abs(s.angle)<=Math.PI&&Number.isFinite(s.speed)&&s.speed>=0&&s.speed<=RUNNER_CONFIG.maxSpeed;
}
export function interruptRunner(e,reason='stun'){
  if(!e.runner)return;
  Object.assign(e.runner,{state:reason==='stun'?'stunned':'recover',left:reason==='stun'?0:RUNNER_CONFIG.recovery,
    cooldown:RUNNER_CONFIG.interruptCooldown,reason});
  e.contactWindup=0;e.cast=null;
}
/** Serializable simulation only. Adapters supply terrain movement and swept contact. */
export function tickRunner(e,player,dt,{visible=true,approachAngle,move,onRush}={}){
  const s=e.runner,events=[];
  if(!s||!Number.isFinite(dt)||dt<=0||player.paused||player.hp<=0)return events;
  if(e.hp<=0){interruptRunner(e,'defeated');return events}
  s.cooldown=Math.max(0,s.cooldown-dt);e.contactWindup=0;e.cast=null;
  if(e.stun>0){interruptRunner(e,'stun');e.stun=Math.max(0,e.stun-dt);return events}
  if(s.state==='stunned'){s.state='recover';s.left=RUNNER_CONFIG.recovery;return events}
  const distance=Math.hypot(player.x-e.x,player.y-e.y),angle=Math.atan2(player.y-e.y,player.x-e.x);
  if(s.state==='windup'&&(!visible||distance>RUNNER_CONFIG.breakRange)){
    interruptRunner(e,visible?'range':'cover');events.push('interrupted');return events;
  }
  const travel=(seconds,heading,speed,charging,offset)=>{
    const n=Math.max(1,Math.ceil(speed*seconds/RUNNER_CONFIG.moveStep));
    for(let i=0;i<n;i++){
      const from={x:e.x,y:e.y},to={x:e.x+Math.cos(heading)*speed*seconds/n,y:e.y+Math.sin(heading)*speed*seconds/n};
      const actual=move?move(from,to,charging):to;e.x=actual.x;e.y=actual.y;
      if(charging&&!s.hit&&onRush?.(from,actual,(offset+seconds*i/n)/dt,(offset+seconds*(i+1)/n)/dt))s.hit=true;
      if(charging&&actual.blocked){interruptRunner(e,'blocked');events.push('blocked');return false}
    }
    return true;
  };
  if(s.state==='approach'){
    if(s.cooldown<=0&&visible&&distance<=RUNNER_CONFIG.startRange&&e.speed>0){
      Object.assign(s,{state:'windup',left:RUNNER_CONFIG.windup,angle,speed:Math.min(RUNNER_CONFIG.maxSpeed,e.speed*RUNNER_CONFIG.speedMultiplier),hit:false,reason:''});events.push('windup');
    }else travel(dt,approachAngle??angle,Math.min(RUNNER_CONFIG.maxSpeed,Math.max(0,e.speed)),false,0);
    return events;
  }
  let remaining=dt;
  // Only finish the current attack/recovery; never start a catch-up attack this tick.
  for(let boundary=0;boundary<3&&remaining>1e-9;boundary++){
    const seconds=Math.min(remaining,s.left),offset=dt-remaining;
    if(s.state==='charge'&&!travel(seconds,s.angle,s.speed,true,offset))break;
    s.left=Math.max(0,s.left-seconds);remaining-=seconds;
    if(s.left>1e-9)break;
    if(s.state==='windup'){s.state='charge';s.left=RUNNER_CONFIG.charge;events.push('charge')}
    else if(s.state==='charge'){s.state='recover';s.left=RUNNER_CONFIG.recovery;s.cooldown=Math.max(0,RUNNER_CONFIG.cooldown-remaining);s.reason='completed';events.push('recover')}
    else{s.state='approach';s.left=0;break}
  }
  return events;
}
