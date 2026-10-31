import {STALKER_CONFIG,isShadowStalker,stalkerLight} from './shadow-stalker.mjs';

export function drawShadowStalker(c,e,player,{laneLength}={}){
  if(!isShadowStalker(e)||!e.stalker||e.hp<=0||e.dead||e.spawnGrace>0)return;
  const s=e.stalker;c.save();c.translate(e.x,e.y);c.strokeStyle='#a7d6ae';c.lineWidth=2;
  // A broken crescent and two eyes distinguish the existing Wisp body.
  c.beginPath();c.arc(0,-23,24,.3,Math.PI*1.65);c.stroke();c.fillStyle='#fff0cd';c.fillRect(-7,-29,3,3);c.fillRect(4,-29,3,3);
  c.font='bold 11px Georgia';c.textAlign='center';c.fillStyle='#fff0cd';c.fillText('Shadow Stalker',0,-82);
  c.font='10px Georgia';const cue={approach:'Hunting the light’s edge',flank:player&&stalkerLight(player).hunting?'Circling · keep oil ready':'Circling · held by light',retreat:'Repelled by light',windup:'Pounce · sidestep or brighten',strike:'Pouncing',recover:'Recovering',stunned:'Stunned'}[s.state];c.fillText(cue,0,-68);
  if(s.state==='windup'||s.state==='strike'){
    c.rotate(s.angle);const length=laneLength??s.speed*(s.state==='windup'?STALKER_CONFIG.strike:s.left),half=e.size+9;
    c.fillStyle='#a7d6ae22';c.fillRect(0,-half,length,half*2);c.strokeStyle='#a7d6ae';c.setLineDash(s.state==='windup'?[4,5]:[]);c.strokeRect(0,-half,length,half*2);c.setLineDash([]);c.beginPath();c.moveTo(length-8,-6);c.lineTo(length,0);c.lineTo(length-8,6);c.stroke();
  }c.restore();
}
