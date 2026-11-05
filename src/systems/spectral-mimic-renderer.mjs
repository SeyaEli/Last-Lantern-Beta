import {MIMIC_CONFIG,isMimic,isMimicDecoy} from './spectral-mimic.mjs';
export function drawMimic(c,e){
  if((!isMimic(e)&&!isMimicDecoy(e))||e.hp<=0||e.dead||e.spawnGrace>0)return;
  c.save();c.translate(e.x,e.y);c.strokeStyle=c.fillStyle='#e3c4ff';c.lineWidth=2;
  c.beginPath();c.moveTo(0,-68);c.lineTo(5,-63);c.lineTo(0,-58);c.lineTo(-5,-63);c.closePath();
  if(isMimic(e))c.fill();else c.stroke();
  c.textAlign='center';c.font='bold 11px Georgia';const s=e.mimic;
  if(s){c.fillText({approach:'Mimic · ◆ real',split:'Splitting · hit to interrupt',illusion:'Find the filled diamond',aim:'Hex · break sight',recover:'Revealed',stunned:'Stunned'}[s.state],0,-77);
    if(s.state==='split'){c.beginPath();c.arc(0,0,e.size+12,0,Math.PI*2*(1-s.left/MIMIC_CONFIG.split));c.stroke()}
    if(s.state==='aim'){c.setLineDash([5,4]);c.beginPath();c.moveTo(0,-e.size*.5);c.lineTo(Math.cos(s.angle)*260,-e.size*.5+Math.sin(s.angle)*260);c.stroke()}
  }c.restore();
}
