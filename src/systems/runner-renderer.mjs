import {RUNNER_CONFIG,isRunner} from './runner.mjs';

/** Draw-only cues. The lane stays at its locked angle when the hero sidesteps. */
export function drawRunner(c,e,{laneLength}={}){
  if(!isRunner(e)||!e.runner||e.hp<=0||e.dead||e.spawnGrace>0)return;
  const s=e.runner;if(!['windup','charge','recover','stunned'].includes(s.state))return;
  c.save();c.translate(e.x,e.y);c.textAlign='center';c.font='bold 11px Georgia';c.fillStyle='#fff0cd';
  if(s.state==='windup'||s.state==='charge'){
    c.fillText(s.state==='windup'?'Rush · dodge sideways':'Rushing',0,-61);
    c.save();c.rotate(s.angle);const length=laneLength??s.speed*(s.state==='windup'?RUNNER_CONFIG.charge:s.left),half=e.size+9;
    c.fillStyle='#ffc76b22';c.fillRect(0,-half,length,half*2);c.strokeStyle='#ffc76b';c.lineWidth=2;c.setLineDash(s.state==='windup'?[5,4]:[]);c.strokeRect(0,-half,length,half*2);
    c.setLineDash([]);c.beginPath();c.moveTo(length-9,-6);c.lineTo(length,0);c.lineTo(length-9,6);c.stroke();c.restore();
    if(s.state==='windup'){c.strokeStyle='#fff0cd';c.lineWidth=2;c.beginPath();c.arc(0,0,e.size+7,-Math.PI/2,-Math.PI/2+Math.PI*2*(1-s.left/RUNNER_CONFIG.windup));c.stroke()}
  }else c.fillText(s.state==='stunned'?'Stunned':'Recovering',0,-61);
  c.restore();
}
