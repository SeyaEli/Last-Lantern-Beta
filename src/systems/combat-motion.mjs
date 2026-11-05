// Presentation only. These states never enter saves, collision, AI, or the combat clock.
const scenes=new WeakMap();
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const ease=n=>1-Math.pow(1-clamp(n),3);
export const MOTION_LIMIT=72;

export function actionTiming(family,frames,release){
  // Hold the anticipation silhouette, pass quickly through the smear, then settle.
  const anticipation={punch:.38,gun:.40,bow:.49,cleave:.46,lantern:.48,staff:.50,codex:.52,rod:.48,bell:.47,relic:.50}[family]??.47;
  const weights=Array.from({length:frames},(_,i)=>i<release?(i===release-1?.42:i===release-2?1.55:1):i===release?1.15:i===frames-1?1.45:.8);
  const before=weights.slice(0,release).reduce((a,b)=>a+b,0),after=weights.slice(release).reduce((a,b)=>a+b,0);
  const edges=[0];
  for(let i=0;i<frames;i++)edges.push(edges.at(-1)+weights[i]*(i<release?anticipation/before:(1-anticipation)/after));
  edges[frames]=1;
  return {weights,edges,releasePhase:edges[release]};
}
export function attackBodyMotion(profile,phase,facing=1){
  const p=clamp(phase),release=profile.releasePhase,melee=['punch','cleave','lantern'].includes(profile.family);
  let move,dip;
  if(p<release){const q=p/release;move=-2.4*Math.sin(q*Math.PI/2);dip=Math.sin(q*Math.PI/2)*1.2}
  else{
    const q=(p-release)/(1-release),reach=profile.family==='gun'?-3.6:melee?6.5:2.2;
    move=q<.16?-2.4+(reach+2.4)*ease(q/.16):reach*Math.exp(-(q-.16)*5.5)*Math.cos((q-.16)*3);
    dip=q<.16?1.2-2*ease(q/.16):-.8*Math.exp(-(q-.16)*5);
  }
  return {x:move*facing,y:dip};
}
export function locomotionFrame(distance){
  const phase=((distance%64)+64)%64/64,edges=[0,.16,.26,.37,.5,.66,.76,.87,1];
  return Math.max(0,edges.findIndex((edge,i)=>i>0&&phase<edge)-1);
}

export function combatMotion(r){
  let s=scenes.get(r);
  if(!s){s={clock:0,events:[],actors:new WeakMap(),step:Math.floor((r.anim?.strideDistance||0)/32),dashing:r.dashTime>0,serial:0};scenes.set(r,s)}
  return s;
}
export function motionEvent(r,kind,x,y,options={}){
  if(!r||r.paused||!Number.isFinite(x+y))return null;
  const s=combatMotion(r),event={kind,x,y,age:0,life:.36,color:r.hero?.color||'#ffd777',seed:s.serial++,...options};
  s.events.push(event);if(s.events.length>MOTION_LIMIT)s.events.splice(0,s.events.length-MOTION_LIMIT);
  return event;
}
export function actorImpact(r,actor,{angle=0,heavy=false,lethal=false,color='#ffdeac',reduced=false}={}){
  const s=combatMotion(r),freeze=reduced?0:heavy?.055:.032;
  s.actors.set(actor,{at:s.clock,angle,freeze,power:reduced?0:(actor.boss?1.8:heavy?6:3.5),lethal});
  motionEvent(r,'contact',actor.x,actor.y-(actor.size||12)*.55,{angle,heavy,color,life:heavy?.34:.25});
  if(lethal)motionEvent(r,'fall',actor.x,actor.y+8,{angle,color,heavy:!!actor.boss,life:actor.boss?.8:.5});
}
export function actorRelease(r,actor,angle=0){
  combatMotion(r).actors.set(actor,{at:combatMotion(r).clock,angle:angle+Math.PI,freeze:0,power:actor.boss?3:1.5,release:true});
}
export function inheritActorMotion(r,from,to){const s=scenes.get(r),hit=s?.actors.get(from);if(hit&&to)s.actors.set(to,hit)}
export function sampleActorMotion(r,actor,reduced=false){
  const s=scenes.get(r),hit=s?.actors.get(actor);
  if(!hit)return null;
  const age=Math.max(0,s.clock-hit.at),duration=hit.lethal?.48:.26;
  if(age>=duration)return null;
  const progress=clamp((age-hit.freeze)/(duration-hit.freeze)),pulse=(1-ease(progress));
  const kick=age<hit.freeze?.65:Math.cos(progress*Math.PI*.65)*pulse;
  const power=reduced?0:hit.power;
  return {x:Math.cos(hit.angle)*power*kick,y:Math.sin(hit.angle)*power*kick*.45,
    tilt:Math.cos(hit.angle)*power*.009*pulse,sx:1+power*.008*pulse,sy:1-power*.009*pulse,
    hurtPhase:clamp(.22+progress*.78,0,.99),held:age<hit.freeze,release:!!hit.release,age};
}
export function stepCombatMotion(r,dt,reduced=false){
  if(!r||r.paused||!Number.isFinite(dt)||dt<=0)return;
  const s=combatMotion(r);s.clock+=dt;
  for(const e of s.events)e.age+=dt;s.events=s.events.filter(e=>e.age<e.life);
  const step=Math.floor((r.anim?.strideDistance||0)/32);
  if(step!==s.step&&r.anim?.moving&&r.dashTime<=0){
    if(!reduced)motionEvent(r,'step',r.x+(step%2?6:-6),r.y+12,{angle:Math.atan2(r.lastDy||0,r.lastDx||1)+Math.PI,color:'#bfa88b',life:.32});
    s.step=step;
  }else s.step=step;
  if(s.dashing&&r.dashTime<=0)motionEvent(r,'land',r.x,r.y+12,{color:'#bfa88b',life:.32});
  s.dashing=r.dashTime>0;
}

function groundPuff(c,e,reduced){
  const p=clamp(e.age/e.life),expand=e.kind==='land'?20:e.kind==='fall'?e.heavy?60:30:9;
  c.save();c.translate(e.x,e.y);c.globalAlpha*=Math.pow(1-p,1.6)*(e.kind==='step'?.4:.65);c.strokeStyle=e.color;c.lineWidth=1;
  // Broken ellipses read as dust in perspective, without covering floor warnings.
  const n=reduced?3:e.kind==='step'?4:7;
  for(let i=0;i<n;i++){const a=i*Math.PI*2/n+e.seed*.9,d=3+ease(p)*expand;c.beginPath();c.ellipse(Math.cos(a)*d,Math.sin(a)*d*.3,2+p*4,1+p, a,0,Math.PI*1.4);c.stroke()}
  c.restore();
}
function charge(c,r,reduced,color){
  const pending=r.skillPending||r.altPending;if(!pending)return;
  const a=r.action,progress=a?clamp(a.elapsed/(a.duration*.5)):clamp(1-r.altPending/.26),s=combatMotion(r);
  c.save();c.translate(r.x,r.y+10);c.globalAlpha*=.3+progress*.35;c.strokeStyle=color;c.lineWidth=1;
  c.beginPath();c.ellipse(0,0,21+progress*7,7+progress*2,0,0,Math.PI*2);c.stroke();
  for(let i=0;i<(reduced?3:6);i++){const angle=i*Math.PI/3+(reduced?0:s.clock*.8),d=35*(1-progress)+12;c.fillStyle=color;c.fillRect(Math.round(Math.cos(angle)*d),Math.round(Math.sin(angle)*d*.35-12-progress*14),2,3)}c.restore();
}
export function drawMotionGround(c,r,{reduced=false,skillColor=r.hero.color}={}){
  const s=scenes.get(r);if(s)for(const e of s.events)if(['step','land','fall','launch'].includes(e.kind))groundPuff(c,e,reduced);
  charge(c,r,reduced,skillColor);
}
function impact(c,e,reduced){
  const p=clamp(e.age/e.life),power=e.heavy?1.35:1,n=reduced?3:e.heavy?10:7;
  c.save();c.translate(e.x,e.y);c.rotate(e.angle||0);c.globalAlpha*=Math.pow(1-p,1.3);
  c.lineCap='round';
  for(let i=0;i<n;i++){
    const a=(i-(n-1)/2)*.37+Math.sin(i*4+e.seed)*.2,d=(7+ease(p)*(14+i%3*8))*power;
    const x=Math.cos(a)*d,y=Math.sin(a)*d+p*p*17;
    c.strokeStyle=i%3===0?'#fff0cd':e.color;c.lineWidth=i%3===0?2:1;
    c.beginPath();c.moveTo(x-Math.cos(a)*(3+(1-p)*7),y-Math.sin(a)*(3+(1-p)*7));c.lineTo(x,y);c.stroke();
  }
  // One small contact star; never flash the whole screen.
  if(p<.3){const size=(1-p/.3)*(e.heavy?16:11);c.fillStyle='#fff0cd';c.beginPath();c.moveTo(-size*.7,0);c.lineTo(-2,-2);c.lineTo(0,-size*.5);c.lineTo(2,-2);c.lineTo(size,0);c.lineTo(2,2);c.lineTo(0,size*.5);c.lineTo(-2,2);c.closePath();c.fill()}
  c.restore();
}
export function drawStrikeRibbon(c,e,reduced=false){
  const p=clamp(e.age/e.life),fade=Math.pow(1-p,1.4),punch=e.family==='punch',radius=punch?20:Math.min(66,e.radius||46);
  c.save();c.translate(e.x,e.y);c.rotate(e.angle||0);c.globalAlpha*=fade;
  if(punch){
    c.fillStyle=e.color;c.beginPath();c.moveTo(-13,-4);c.lineTo(24+ease(p)*20,-1);c.lineTo(34+ease(p)*17,0);c.lineTo(24+ease(p)*20,2);c.lineTo(-13,4);c.closePath();c.fill();
    c.strokeStyle='#fff0cd';c.lineWidth=1;c.beginPath();c.moveTo(-6,0);c.lineTo(31+ease(p)*18,0);c.stroke();
  }else{
    const start=-1.65+ease(p)*.65,end=start+1.3+Math.sin(p*Math.PI)*.55,points=14;
    for(const [scale,alpha]of [[1.09,.12],[1,.8]]){
      c.save();c.globalAlpha*=alpha;c.fillStyle=e.color;c.beginPath();
      for(let i=0;i<=points;i++){const q=i/points,a=start+(end-start)*q,d=(radius+Math.sin(q*Math.PI)*(reduced?3:8))*scale;i?c.lineTo(Math.cos(a)*d,Math.sin(a)*d*.72):c.moveTo(Math.cos(a)*d,Math.sin(a)*d*.72)}
      for(let i=points;i>=0;i--){const q=i/points,a=start+(end-start)*q,d=(radius-Math.sin(q*Math.PI)*9)*scale;c.lineTo(Math.cos(a)*d,Math.sin(a)*d*.72)}c.closePath();c.fill();c.restore();
    }
    c.strokeStyle='#fff0cd';c.lineWidth=1;c.beginPath();c.ellipse(0,0,radius,radius*.72,0,start+.1,end-.1);c.stroke();
  }
  c.restore();
}
export function drawMotionForeground(c,r,{reduced=false}={}){
  const s=scenes.get(r);if(!s)return;
  for(const e of s.events){if(e.kind==='contact')impact(c,e,reduced);else if(e.kind==='strike')drawStrikeRibbon(c,e,reduced)}
}
