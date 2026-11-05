export const WARDEN_CONFIG=Object.freeze({archetype:'void-warden',type:2,cost:6,maxAlive:2,maxCasting:1,maxZones:4,
  firstPhase:4,chance:.2,startRange:260,breakRange:340,standRange:200,radius:48,
  windup:1.2,recovery:1.15,cooldown:5.5,initialCooldown:3,interruptCooldown:2.5,retryCooldown:.8});
export const isWarden=e=>e?.archetype===WARDEN_CONFIG.archetype;
export const wardenCasting=e=>isWarden(e)&&e.hp>0&&e.warden?.state==='windup';
export function createWardenState(id){return{version:1,id,state:'approach',left:0,cooldown:WARDEN_CONFIG.initialCooldown,target:null,reason:''}}
export function validWardenState(s){
  if(!s||s.version!==1||!Number.isSafeInteger(s.id)||s.id<1||!['approach','windup','recover','stunned'].includes(s.state))return false;
  const max={approach:0,windup:WARDEN_CONFIG.windup,recover:WARDEN_CONFIG.recovery,stunned:0}[s.state];
  const p=s.target,point=p&&Number.isFinite(p.x)&&p.x>=0&&p.x<=2400&&Number.isFinite(p.y)&&p.y>=0&&p.y<=1500;
  return Number.isFinite(s.left)&&s.left>=0&&s.left<=max+1e-8&&Number.isFinite(s.cooldown)&&s.cooldown>=0&&s.cooldown<=WARDEN_CONFIG.cooldown&&
    (s.state==='windup'?!!point:p===null)&&['','completed','stun','cover','range','blocked','defeated'].includes(s.reason);
}
export function interruptWarden(e,reason='stun'){
  if(!e.warden)return;
  Object.assign(e.warden,{state:reason==='stun'?'stunned':'recover',left:reason==='stun'?0:WARDEN_CONFIG.recovery,cooldown:WARDEN_CONFIG.interruptCooldown,target:null,reason});e.cast=null;e.contactWindup=0;
}
/** Fixed target first, followed by eight alternatives. Geometry is adapter-owned. */
export function chooseWardenZone(player,{canPlace,canEscape}){
  for(let i=0;i<9;i++){
    const a=(i-1)*Math.PI/4,p=i===0?{x:player.x,y:player.y}:{x:player.x+Math.cos(a)*70,y:player.y+Math.sin(a)*70};
    if(canPlace(p)&&canEscape(p))return p;
  }return null;
}
/** No damage or terrain mutations here; only the current attack may complete. */
export function tickWarden(e,p,dt,{visible=true,slotAvailable=true,chooseTarget,targetClear=()=>true,move,release,clear}={}){
  const s=e.warden;if(!s||!Number.isFinite(dt)||dt<=0||p.paused||p.hp<=0)return;
  if(e.hp<=0){interruptWarden(e,'defeated');clear?.();return}
  s.cooldown=Math.max(0,s.cooldown-dt);e.cast=null;e.contactWindup=0;
  if(e.stun>0){interruptWarden(e);e.stun=Math.max(0,e.stun-dt);clear?.();return}
  if(s.state==='stunned'){s.state='recover';s.left=WARDEN_CONFIG.recovery;return}
  const distance=Math.hypot(e.x-p.x,e.y-p.y);
  if(s.state==='windup'){
    const reason=!visible?'cover':distance>WARDEN_CONFIG.breakRange?'range':!targetClear(s.target)?'blocked':null;
    if(reason){interruptWarden(e,reason);clear?.();return}
  }
  if(s.state==='approach'){
    if(visible&&slotAvailable&&distance<=WARDEN_CONFIG.startRange&&s.cooldown<=0){
      const target=chooseTarget?.();if(target){s.state='windup';s.left=WARDEN_CONFIG.windup;s.target={...target};s.reason=''}else s.cooldown=WARDEN_CONFIG.retryCooldown;
    }else if(distance>WARDEN_CONFIG.standRange||!visible)move?.(dt);
    return;
  }
  let remaining=dt;
  for(let boundary=0;boundary<2&&remaining>1e-9;boundary++){
    const seconds=Math.min(remaining,s.left);s.left=Math.max(0,s.left-seconds);remaining-=seconds;if(s.left>1e-9)break;
    if(s.state==='windup'){const target=s.target;s.target=null;s.state='recover';s.left=WARDEN_CONFIG.recovery;s.cooldown=Math.max(0,WARDEN_CONFIG.cooldown-remaining);s.reason='completed';release?.(target)}
    else{s.state='approach';s.left=0;break}
  }
}
