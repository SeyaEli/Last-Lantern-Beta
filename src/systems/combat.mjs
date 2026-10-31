// Preserve existing tuning while giving collision and incoming damage a single authority.
export const COMBAT_CONFIG = Object.freeze({
  playerProjectileRadius: 13, enemyProjectilePadding: 5, playerContactPadding: 9,
  terrainProjectileRadius: 3, maxDamageReduction: .65, hurtDuration: .18,
  dash: Object.freeze({cooldown: 3, active: .20, invulnerability: .45}),
  sources: Object.freeze({
    contact: Object.freeze({invulnerability: .65, shake: 6}),
    projectile: Object.freeze({invulnerability: .6, shake: 5}),
    hazard: Object.freeze({invulnerability: .6, shake: 0}),
    boss: Object.freeze({invulnerability: .65, shake: 5})
  })
});
const EPS=1e-9, clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const frames=new WeakMap(); // Ephemeral; never serialized in Continue/checkpoints.

/** Fractional time interval inside an open circle. Tangential grazes do not hit. */
export function sweepCircle(from,to,center,radius) {
  const x=from.x-center.x,y=from.y-center.y,dx=to.x-from.x,dy=to.y-from.y;
  const a=dx*dx+dy*dy,c=x*x+y*y-radius*radius;
  if(a<EPS)return c<0?{enter:0,exit:1}:null;
  const b=2*(x*dx+y*dy),d=b*b-4*a*c;
  if(d<=0)return null;
  const root=Math.sqrt(d),enter=(-b-root)/(2*a),exit=(-b+root)/(2*a);
  if(exit<=0||enter>=1)return null;
  return {enter:Math.max(0,enter),exit:Math.min(1,exit)};
}
export function sweepMovingCircle(from,to,targetFrom,targetTo,radius) {
  return sweepCircle({x:from.x-targetFrom.x,y:from.y-targetFrom.y},
    {x:to.x-targetTo.x,y:to.y-targetTo.y},{x:0,y:0},radius);
}
export function beginCombatFrame(player,dt) {
  frames.set(player,{dt,from:{x:player.x,y:player.y},to:{x:player.x,y:player.y},
    invuln:Math.max(0,player.invuln||0),shield:Math.max(0,player.shield||0)});
}
export function finishCombatMovement(player) {
  const frame=frames.get(player);if(frame)frame.to={x:player.x,y:player.y};
}
export function endCombatFrame(player) {frames.delete(player)}
/** Rush subsegments share the moving hero/protection timeline of this frame. */
export function rushPlayerContact(player,from,to,radius,start=0,end=1){
  if(end<=start||player.invuln>EPS||player.shield>EPS)return null;
  const frame=frames.get(player),a=frame?.from||player,b=frame?.to||player;
  const at=t=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
  const interval=sweepMovingCircle(from,to,at(start),at(end),radius);
  if(!interval)return null;
  const protection=frame&&frame.dt>0?Math.max(frame.invuln,frame.shield)/frame.dt:0;
  const fraction=Math.max(start+interval.enter*(end-start),protection);
  return fraction<start+interval.exit*(end-start)-EPS?{fraction}:null;
}
export function isPlayerProtected(player,atFraction=1) {
  if(player.invuln>EPS||player.shield>EPS)return true;
  const frame=frames.get(player);
  return !!frame&&Math.max(frame.invuln,frame.shield)-frame.dt*clamp(atFraction,0,1)>EPS;
}
/** Contact against the moving hero, clipped to the projectile's remaining lifetime. */
export function projectilePlayerContact(player,from,to,aliveFraction=1) {
  const frame=frames.get(player),start=frame?.from||player,end=frame?.to||player;
  const targetEnd={x:start.x+(end.x-start.x)*aliveFraction,y:start.y+(end.y-start.y)*aliveFraction};
  const interval=sweepMovingCircle(from,to,start,targetEnd,COMBAT_CONFIG.playerProjectileRadius);
  if(!interval||player.invuln>EPS||player.shield>EPS)return null;
  const protection=frame&&frame.dt>0?Math.max(frame.invuln,frame.shield)/frame.dt:0;
  const at=Math.max(interval.enter*aliveFraction,protection);
  if(at>=interval.exit*aliveFraction-EPS)return null;
  return {fraction:at,point:{x:from.x+(to.x-from.x)*at/aliveFraction,y:from.y+(to.y-from.y)*at/aliveFraction}};
}
/** No audio/DOM dependencies. The runtime owns presentation after an accepted hit. */
export function resolvePlayerDamage(player,rawDamage,source='projectile',atFraction=1) {
  const tuning=COMBAT_CONFIG.sources[source];
  if(!tuning||player.paused||player.hp<=0||!Number.isFinite(rawDamage)||rawDamage<=0||isPlayerProtected(player,atFraction))return null;
  const armor=Number.isFinite(player.damageReduce)?clamp(player.damageReduce,0,COMBAT_CONFIG.maxDamageReduction):0;
  const damage=Math.min(player.hp,rawDamage*(1-armor));
  player.hp=Math.max(0,player.hp-damage);player.invuln=tuning.invulnerability;
  if(player.anim)player.anim.hurtLeft=COMBAT_CONFIG.hurtDuration;
  return {damage,source,shake:tuning.shake};
}
