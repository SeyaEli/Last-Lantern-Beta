import {EATER_CONFIG,eaterCasting} from './lantern-eater.mjs';

export function drawLanternEater(c,e,r){
  if(e.archetype!==EATER_CONFIG.archetype||e.dead||e.hp<=0||!e.eater)return;
  const s=e.eater,active=eaterCasting(e),channel=s.state==='channel',time=r?.time||0;
  c.save();c.strokeStyle='#ffc76b';c.fillStyle='#102127';c.lineWidth=2;
  // A hollow lantern mouth identifies the variant without changing existing image files.
  c.fillRect(e.x-8,e.y-43,16,20);c.strokeRect(e.x-8,e.y-43,16,20);c.beginPath();c.arc(e.x,e.y-45,5,Math.PI,Math.PI*2);c.stroke();
  c.fillStyle=channel?'#ffc76b':'#a7d6ae';c.fillRect(e.x-2,e.y-39,4,12);
  c.font='bold 11px Georgia';c.textAlign='center';c.fillStyle='#fff0cd';c.fillText('Lantern Eater',e.x,e.y-105);
  if(active&&r){
    c.globalAlpha=.65;c.setLineDash([5,5]);c.beginPath();c.arc(e.x,e.y,EATER_CONFIG.breakRange,0,Math.PI*2);c.stroke();c.setLineDash([]);
    c.globalAlpha=1;c.fillText(channel?'Siphoning oil':'Siphon · '+s.left.toFixed(1)+'s',e.x,e.y-91);
    c.font='10px Georgia';c.fillText('Hit · dash · Bright · leave ring',e.x,e.y-78);
    c.globalAlpha=channel?.9:.4;c.lineWidth=channel?2:1;c.setLineDash(channel?[]:[4,6]);
    c.beginPath();c.moveTo(r.x,r.y-15);c.lineTo(e.x,e.y-30);c.stroke();c.setLineDash([]);
    if(channel)for(let i=0;i<5;i++){const q=(time*.7+i/5)%1;c.fillRect(r.x+(e.x-r.x)*q-2,r.y-15+(e.y-r.y-15)*q-2,4,4)}
  }
  c.restore();
}
