import {ARCHER_CONFIG,isCoverArcher} from './cover-archer.mjs';

export function drawCoverArcher(c,e,origin){
  if(!isCoverArcher(e)||!e.archer||e.dead||e.hp<=0||e.spawnGrace>0)return;
  const s=e.archer;if(!['windup','release','recover','hide','stunned'].includes(s.state))return;
  c.save();c.fillStyle='#fff0cd';c.textAlign='center';c.font='bold 11px Georgia';
  c.fillText({windup:'Aiming · break sight',release:'Volley',recover:'Recovering',hide:'Taking cover',stunned:'Stunned'}[s.state],e.x,e.y-76);
  if(s.state==='windup'){
    const progress=1-s.left/ARCHER_CONFIG.windup,length=Math.min(310,Math.hypot(s.aimX-origin.x,s.aimY-origin.y));
    c.strokeStyle='#ffc76b';c.lineWidth=1.5;c.setLineDash([5,5]);c.beginPath();c.moveTo(origin.x,origin.y);c.lineTo(origin.x+Math.cos(s.angle)*length,origin.y+Math.sin(s.angle)*length);c.stroke();c.setLineDash([]);
    c.beginPath();c.arc(origin.x,origin.y,6+progress*5,-Math.PI/2,-Math.PI/2+Math.PI*2*progress);c.stroke();
  }c.restore();
}
