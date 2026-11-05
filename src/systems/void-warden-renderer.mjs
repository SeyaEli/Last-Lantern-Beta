import {WARDEN_CONFIG,isWarden} from './void-warden.mjs';
export function drawWarden(c,e){
  if(!isWarden(e)||!e.warden||e.hp<=0||e.dead||e.spawnGrace>0)return;
  const s=e.warden;c.save();c.textAlign='center';c.font='bold 11px Georgia';c.fillStyle='#e3c4ff';
  c.fillText({approach:'Void Warden',windup:'Void seal · leave the ring',recover:'Recovering',stunned:'Stunned'}[s.state],e.x,e.y-75);
  if(s.state==='windup'&&s.target){
    const p=s.target,r=WARDEN_CONFIG.radius,progress=1-s.left/WARDEN_CONFIG.windup;
    c.fillStyle='#aa70e82b';c.strokeStyle='#e3c4ff';c.lineWidth=2;c.setLineDash([6,4]);c.beginPath();c.arc(p.x,p.y,r,0,Math.PI*2);c.fill();c.stroke();c.setLineDash([]);
    c.beginPath();c.arc(p.x,p.y,r+6,-Math.PI/2,-Math.PI/2+Math.PI*2*progress);c.stroke();
    c.beginPath();c.moveTo(p.x-7,p.y);c.lineTo(p.x+7,p.y);c.moveTo(p.x,p.y-7);c.lineTo(p.x,p.y+7);c.stroke();
    c.fillStyle='#fff0cd';c.fillText('MOVE',p.x,p.y-r-12);
  }c.restore();
}
