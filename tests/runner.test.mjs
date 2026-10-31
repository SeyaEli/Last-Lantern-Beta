import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCanvas} from '@napi-rs/canvas';
import {RUNNER_CONFIG as C,createRunnerState,validRunnerState,isRunner,tickRunner} from '../src/systems/runner.mjs';
import {drawRunner} from '../src/systems/runner-renderer.mjs';
import {beginCombatFrame,finishCombatMovement,endCombatFrame,rushPlayerContact,resolvePlayerDamage} from '../src/systems/combat.mjs';
let passed=0;const check=(name,f)=>{f();passed++;console.log('PASS '+name)};
const scene=()=>({e:{type:1,boss:false,x:0,y:0,hp:100,speed:65,size:9,stun:0,runner:createRunnerState()},p:{x:80,y:0,hp:100,invuln:0,shield:0}});
const start=(e,p)=>{e.runner.cooldown=0;tickRunner(e,p,.01);assert.equal(e.runner.state,'windup')};
const close=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} ~= ${b}`);
check('full warning is harmless and only remaining frame time becomes charge travel',()=>{
 const {e,p}=scene();start(e,p);let hits=0;tickRunner(e,p,.64,{onRush:()=>{hits++;return true}});assert.equal(e.x,0);assert.equal(hits,0);
 tickRunner(e,p,.02);assert.equal(e.runner.state,'charge');close(e.x,65*C.speedMultiplier*.01);close(e.runner.left,C.charge-.01);
});
check('committed lane does not follow a sidestepping hero',()=>{
 const {e,p}=scene();start(e,p);p.x=0;p.y=180;tickRunner(e,p,C.windup);tickRunner(e,p,C.charge);close(e.x,65*C.speedMultiplier*C.charge);close(e.y,0);assert.equal(e.runner.state,'recover');
});
check('complete rush distance and recovery are stable at 20 30 60 and 144 updates per second',()=>{
 for(const fps of [20,30,60,144]){const {e,p}=scene();start(e,p);let time=0,total=C.windup+C.charge+C.recovery;
  while(time<total-1e-9){const dt=Math.min(1/fps,total-time);tickRunner(e,p,dt);time+=dt}close(e.x,65*C.speedMultiplier*C.charge);close(e.y,0);assert.equal(e.runner.state,'approach');close(e.runner.cooldown,C.cooldown-C.recovery)}
});
check('stun has an explicit frozen state and a full recovery before reapproaching',()=>{
 const {e,p}=scene();start(e,p);tickRunner(e,p,C.windup+.1);const x=e.x;e.stun=.5;e.cast={left:0};e.contactWindup=.01;
 tickRunner(e,p,.2);assert.equal(e.runner.state,'stunned');close(e.stun,.3);assert.equal(e.x,x);assert.equal(e.cast,null);assert.equal(e.contactWindup,0);
 tickRunner(e,p,.3);tickRunner(e,p,.01);assert.equal(e.runner.state,'recover');assert.equal(e.runner.left,C.recovery);tickRunner(e,p,.79);assert.equal(e.x,x);
});
check('cover and excessive separation cancel warnings without a rush',()=>{
 for(const why of ['cover','range']){const {e,p}=scene();start(e,p);if(why==='range')p.x=400;tickRunner(e,p,.05,{visible:why!=='cover'});assert.equal(e.runner.reason,why);assert.equal(e.runner.state,'recover');assert.equal(e.x,0)}
 const {e,p}=scene();e.runner.cooldown=0;tickRunner(e,p,.05,{visible:false});assert.equal(e.runner.state,'approach');
});
check('blocked rushes stop at the last safe position without hitting past cover',()=>{
 const {e,p}=scene();start(e,p);tickRunner(e,p,C.windup);let hitPast=false;
 tickRunner(e,p,C.charge,{move:(from,to)=>to.x>30?{...from,blocked:true}:to,onRush:(_from,to)=>{if(to.x>30)hitPast=true;return false}});
 assert(e.x<=30);assert.equal(e.runner.state,'recover');assert.equal(e.runner.reason,'blocked');assert(!hitPast);
});
check('one accepted contact per rush and bounded movement at extreme difficulty',()=>{
 const {e,p}=scene();e.speed=1e6;start(e,p);assert.equal(e.runner.speed,C.maxSpeed);tickRunner(e,p,C.windup);let attempts=0,steps=0;
 tickRunner(e,p,20,{move:(_from,to)=>{steps++;return to},onRush:()=>{attempts++;return attempts===2}});
 assert.equal(attempts,2);assert(steps<=Math.ceil(C.maxSpeed*C.charge/C.moveStep));assert.equal(e.runner.state,'approach');close(e.x,C.maxSpeed*C.charge);assert(e.runner.hit);
});
check('pause death and serialized Continue cannot release a late attack',()=>{
 const {e,p}=scene();start(e,p);tickRunner(e,p,.2);const copy=JSON.parse(JSON.stringify(e));p.paused=true;const before=JSON.stringify(e);tickRunner(e,p,2);assert.equal(JSON.stringify(e),before);p.paused=false;
 tickRunner(e,p,.5);tickRunner(copy,p,.5);assert.deepEqual(copy,e);e.hp=0;const x=e.x;tickRunner(e,p,.1,{onRush:()=>assert.fail('dead hit')});assert.equal(e.x,x);assert.equal(e.runner.reason,'defeated');
});
check('state validation rejects impossible phases timers angles and foreign archetypes',()=>{
 const s=createRunnerState();assert(validRunnerState(s));for(const patch of [{state:'fake'},{left:1},{cooldown:-1},{cooldown:99},{angle:4},{speed:341},{hit:1},{reason:'unknown'},{version:2}])assert(!validRunnerState({...s,...patch}),JSON.stringify(patch));assert(isRunner({type:1}));assert(!isRunner({type:1,boss:true}));assert(!isRunner({type:1,archetype:'lantern-eater'}));
});
check('moving hero and rush contacts use fractional shield and dash protection',()=>{
 const p={x:-100,y:0,hp:100,invuln:0,shield:0};beginCombatFrame(p,.05);p.x=100;finishCombatMovement(p);assert(rushPlayerContact(p,{x:0,y:0},{x:0,y:0},18));endCombatFrame(p);
 for(const kind of ['invuln','shield']){p.x=0;p[kind]=.04;beginCombatFrame(p,.05);p[kind]=0;finishCombatMovement(p);assert.equal(rushPlayerContact(p,{x:-100,y:0},{x:100,y:0},18),null);endCombatFrame(p)}
 p.invuln=.025;p.shield=0;beginCombatFrame(p,.05);p.invuln=0;finishCombatMovement(p);const contact=rushPlayerContact(p,{x:-20,y:0},{x:20,y:0},18);assert(contact);close(contact.fraction,.5);assert(resolvePlayerDamage(p,10,'contact',contact.fraction));assert.equal(p.hp,90);endCombatFrame(p);
});
check('subsegment timing and shield expiry never produce contact outside the overlap',()=>{
 const p={x:0,y:0,hp:100,invuln:.04,shield:0};beginCombatFrame(p,.05);p.invuln=0;finishCombatMovement(p);
 assert.equal(rushPlayerContact(p,{x:-10,y:0},{x:10,y:0},18,0,.2),null);assert(rushPlayerContact(p,{x:-10,y:0},{x:10,y:0},18,.8,1));endCombatFrame(p);
});
check('warning rush recovery and stun cues render without mutating simulation',()=>{
 const {e,p}=scene();e.x=e.y=150;start(e,{...p,x:230,y:150});const c=createCanvas(400,300).getContext('2d'),images=new Set();
 for(const state of ['windup','charge','recover','stunned']){e.runner.state=state;e.runner.left=state==='windup'?.3:state==='charge'?.2:state==='recover'?.4:0;const before=JSON.stringify(e);c.clearRect(0,0,400,300);drawRunner(c,e);assert.equal(JSON.stringify(e),before);images.add(c.canvas.toBuffer('image/png').toString('base64'))}assert.equal(images.size,4);
});
fs.writeFileSync(new URL('./runner-results.json',import.meta.url),JSON.stringify({passed},null,2));console.log(`Passed ${passed} runner module checks`);
