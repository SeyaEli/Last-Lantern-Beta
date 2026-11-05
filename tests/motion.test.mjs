import assert from 'node:assert/strict';
import {actionTiming,attackBodyMotion,locomotionFrame,actorImpact,combatMotion,sampleActorMotion,stepCombatMotion} from '../src/systems/combat-motion.mjs';

const phases=new Set();
for(const family of ['punch','gun','bow','cleave','lantern','staff','codex','rod','bell','relic'])for(const frames of [7,8]){
 const profile=actionTiming(family,frames,4);phases.add(profile.releasePhase);
 assert.equal(profile.edges.length,frames+1);assert.equal(profile.edges.at(-1),1);assert(profile.edges.every((e,i)=>!i||e>profile.edges[i-1]));
 const left=attackBodyMotion({...profile,family},profile.releasePhase-1e-8),right=attackBodyMotion({...profile,family},profile.releasePhase+1e-8);
 assert(Math.abs(left.x-right.x)<.001);assert(Math.abs(left.y-right.y)<.001);
 for(const p of [0,.25,.5,.75,1]){const a=attackBodyMotion({...profile,family},p,1),b=attackBodyMotion({...profile,family},p,-1);assert.equal(a.x,-b.x);assert.equal(a.y,b.y);assert(Math.abs(a.x)<7)}
}
assert(phases.size>=7,'weapon families need distinct contact timing');
for(let d=0;d<1000;d++){assert(locomotionFrame(d)>=0&&locomotionFrame(d)<8);assert.equal(locomotionFrame(d),locomotionFrame(d+64))}
const r={hero:{color:'#ffdeac'},anim:{strideDistance:0},paused:false,dashTime:0},e={x:10,y:20,size:12};
actorImpact(r,e,{heavy:true,reduced:true});const pose=sampleActorMotion(r,e,true);assert.equal(pose.x,0);assert.equal(pose.y,0);assert.equal(pose.tilt,0);assert.equal(pose.sx,1);assert(!pose.held);
r.paused=true;stepCombatMotion(r,.1);assert.equal(combatMotion(r).clock,0);r.paused=false;stepCombatMotion(r,1);assert.equal(sampleActorMotion(r,e),null);assert.equal(combatMotion(r).events.length,0);
console.log('Motion timing, continuous body offsets, distance cycles, reduced motion and pause checks passed.');
