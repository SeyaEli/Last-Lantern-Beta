import {lanternRadius, shadowSpeedMultiplier} from './lantern.mjs';

/** Draw before actors/projectiles/skill warnings, so darkness cannot hide counterplay. */
export function drawLanternWorld(c, run, view, width, height) {
  const s=run.lantern;
  if (!s) return;
  c.save();
  const radius=lanternRadius(s), shade=c.createRadialGradient(run.x,run.y,Math.min(28,radius*.3),run.x,run.y,radius);
  shade.addColorStop(0,'rgba(7,22,27,0)');
  shade.addColorStop(1,s.fuel>0?'rgba(7,22,27,0.58)':'rgba(7,22,27,0.82)');
  c.fillStyle=shade;c.fillRect(view.x,view.y,width,height);
  // Steady border: no flashing/flickering, and a dashed edge remains meaningful without color.
  c.strokeStyle='rgba(255,199,107,0.28)';c.lineWidth=1;c.setLineDash([3,7]);
  c.beginPath();c.arc(run.x,run.y,radius,0,Math.PI*2);c.stroke();c.setLineDash([]);
  for (const p of s.pickups) {
    c.fillStyle='#102127';c.fillRect(p.x-10,p.y-17,20,29);
    c.fillStyle='#ffc76b';c.fillRect(p.x-5,p.y-9,10,17);c.fillRect(p.x-3,p.y-15,6,6);
    c.fillStyle='#fff0cd';c.fillRect(p.x-2,p.y-6,2,9);
    c.strokeStyle='#fff0cd';c.strokeRect(p.x-7,p.y-11,14,21);
    c.font='bold 10px Consolas,monospace';c.textAlign='center';c.fillText('+'+(p.restore??25)+' OIL',p.x,p.y-22);
  }
  for (const e of run.enemies) if (e.hp>0 && shadowSpeedMultiplier(s,e,run)!==1) {
    c.strokeStyle='#a7d6ae';c.setLineDash([3,3]);c.beginPath();c.ellipse(e.x,e.y+8,e.size+5,7,0,0,Math.PI*2);c.stroke();
  }
  c.restore();
}
