import assert from 'node:assert/strict';
import fs from 'node:fs';
import {COMBAT_CONFIG as C,sweepCircle,sweepMovingCircle,beginCombatFrame,finishCombatMovement,
  endCombatFrame,isPlayerProtected,projectilePlayerContact,resolvePlayerDamage} from '../src/systems/combat.mjs';
let passed=0;
function check(name,fn){fn();passed++;console.log('PASS combat: '+name)}
const player=()=>({x:0,y:0,hp:100,invuln:0,shield:0,damageReduce:0,anim:{},paused:false});
check('fast crossings hit in both directions, with strict tangent and near-miss handling',()=>{
 for(const side of [-1,1]){const contact=sweepCircle({x:-100*side,y:0},{x:100*side,y:0},{x:0,y:0},13);assert(Math.abs(contact.enter-.435)<1e-9);assert(Math.abs(contact.exit-.565)<1e-9)}
 assert.equal(sweepCircle({x:-100,y:13},{x:100,y:13},{x:0,y:0},13),null);
 assert.equal(sweepCircle({x:-100,y:14},{x:100,y:14},{x:0,y:0},13),null);
 assert(sweepCircle({x:-100,y:12.99},{x:100,y:12.99},{x:0,y:0},13));
});
check('moving heroes can cross a projectile between non-overlapping endpoints',()=>{
 assert(sweepMovingCircle({x:0,y:-100},{x:0,y:100},{x:-100,y:0},{x:100,y:0},13));
 assert.equal(sweepMovingCircle({x:0,y:-100},{x:0,y:100},{x:200,y:0},{x:400,y:0},13),null);
});
check('stationary overlap and entry/exit boundary semantics are stable',()=>{
 assert.deepEqual(sweepCircle({x:0,y:0},{x:0,y:0},{x:0,y:0},13),{enter:0,exit:1});
 assert.equal(sweepCircle({x:13,y:0},{x:13,y:0},{x:0,y:0},13),null);
 assert.equal(sweepCircle({x:-20,y:0},{x:-13,y:0},{x:0,y:0},13),null);
});
check('damage sources share armor shield pause lethal clamp and invalid-damage rejection',()=>{
 for(const source of Object.keys(C.sources)){const r=player();r.damageReduce=.3;const hit=resolvePlayerDamage(r,20,source);assert.equal(hit.damage,14);assert.equal(r.hp,86);assert.equal(r.invuln,C.sources[source].invulnerability);assert.equal(r.anim.hurtLeft,.18);assert.equal(resolvePlayerDamage(r,20,source),null)}
 for(const protection of ['shield','invuln']){const r=player();r[protection]=1;assert.equal(resolvePlayerDamage(r,20),null);assert.equal(r.hp,100)}
 const r=player();for(const damage of [-1,0,NaN,Infinity])assert.equal(resolvePlayerDamage(r,damage),null);r.paused=true;assert.equal(resolvePlayerDamage(r,20),null);r.paused=false;assert.equal(resolvePlayerDamage(r,200).damage,100);assert.equal(r.hp,0);assert.equal(resolvePlayerDamage(r,20),null);
});
check('armor is bounded and a hit cannot bypass newly granted recovery within a frame',()=>{
 const r=player();r.damageReduce=3;resolvePlayerDamage(r,20);assert.equal(r.hp,93);
 const q=player();beginCombatFrame(q,.05);assert(resolvePlayerDamage(q,20,'contact',.1));assert.equal(resolvePlayerDamage(q,20,'boss',.8),null);assert.equal(q.hp,80);endCombatFrame(q);
});
check('starting protection lasts through its actual fractional expiry, including exact boundary',()=>{
 for(const timer of ['invuln','shield']){const r=player();r[timer]=.025;beginCombatFrame(r,.05);r[timer]=0;
  assert(isPlayerProtected(r,.49));assert(!isPlayerProtected(r,.5));assert.equal(resolvePlayerDamage(r,20,'projectile',.4),null);assert(resolvePlayerDamage(r,20,'projectile',.5));endCombatFrame(r)}
});
check('a projectile that has already passed during invulnerability cannot hit retroactively',()=>{
 const r=player();r.invuln=.04;beginCombatFrame(r,.05);r.invuln=0;
 assert.equal(projectilePlayerContact(r,{x:-100,y:0},{x:100,y:0}),null);endCombatFrame(r);
});
check('a still-overlapping projectile can hit when protection expires later in the same frame',()=>{
 const r=player();r.invuln=.025;beginCombatFrame(r,.05);r.invuln=0;
 const contact=projectilePlayerContact(r,{x:-20,y:0},{x:20,y:0});assert.equal(contact.fraction,.5);assert(resolvePlayerDamage(r,20,'projectile',contact.fraction));endCombatFrame(r);
});
check('remaining projectile lifetime clips moving-player collision to the live part of the frame',()=>{
 const r=player();r.x=-100;beginCombatFrame(r,.05);r.x=100;finishCombatMovement(r);
 assert.equal(projectilePlayerContact(r,{x:0,y:0},{x:0,y:0},.1),null);
 assert(projectilePlayerContact(r,{x:0,y:0},{x:0,y:0},1));endCombatFrame(r);
});
check('continuous damage is identical for fast projectiles at 20 30 60 120 and 144 updates per second',()=>{
 for(const fps of [20,30,60,120,144]){const r=player();let x=-97,alive=true,hits=0;
  for(let i=0;i<fps/2;i++){const dt=1/fps;beginCombatFrame(r,dt);r.invuln=Math.max(0,r.invuln-dt);const next=x+10000*dt;if(alive){const contact=projectilePlayerContact(r,{x,y:0},{x:next,y:0});if(contact&&resolvePlayerDamage(r,20,'projectile',contact.fraction)){hits++;alive=false}}endCombatFrame(r);x=next}
  assert.equal(hits,1);assert.equal(r.hp,80)}
});
check('frame context cleanup leaves direct boss/damage calls independent of the prior frame',()=>{
 const r=player();r.invuln=.5;beginCombatFrame(r,.05);r.invuln=0;assert(isPlayerProtected(r));endCombatFrame(r);assert(!isPlayerProtected(r));assert(resolvePlayerDamage(r,10,'boss'));
});
fs.writeFileSync(new URL('./combat-results.json',import.meta.url),JSON.stringify({passed},null,2));
console.log('Passed '+passed+' combat module checks');
