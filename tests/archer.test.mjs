import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCanvas} from '@napi-rs/canvas';
import {ARCHER_CONFIG as C,isCoverArcher,createArcherState,validArcherState,chooseArcherCover,tickCoverArcher} from '../src/systems/cover-archer.mjs';
import {drawCoverArcher} from '../src/systems/cover-archer-renderer.mjs';
let passed=0;const check=(name,f)=>{f();passed++;console.log('PASS archer: '+name)},close=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} ~= ${b}`);
const scene=()=>({e:{x:420,y:500,hp:100,dmg:14,size:14,type:2,speed:29,stun:0,archer:createArcherState()},p:{x:600,y:500,hp:100,paused:false}});
const start=(e,p,opts={})=>{e.archer.cooldown=0;e.archer.planClock=2.4;tickCoverArcher(e,p,.01,opts);assert.equal(e.archer.state,'windup')};
const sensors={canStand:()=>true,visibleAt:p=>p.y<100||p.y>150,pathClear:()=>true};
check('bounded cover pairs have a hidden anchor visible peek and walkable route',()=>{
 const e={x:180,y:125,size:14},p={x:0,y:125},cover=chooseArcherCover(e,p,[{x:100,y:100,w:50,h:50}],sensors);assert(cover);assert(!sensors.visibleAt(cover.hide));assert(sensors.visibleAt(cover.peek));assert(sensors.pathClear(cover.hide,cover.peek));assert(cover.hide.x>150);
});
check('unreachable occupied out-of-range and non-occluding cover is rejected with bounded queries',()=>{
 const e={x:180,y:125,size:14},p={x:0,y:125},boxes=Array.from({length:100},()=>({x:100,y:100,w:50,h:50}));let queries=0;
 assert.equal(chooseArcherCover(e,p,boxes,{...sensors,canStand:()=>{queries++;return false}}),null);assert.equal(queries,C.maxBoxes);
 for(const bad of [{reserved:()=>true},{pathClear:()=>false},{visibleAt:()=>true},{canStand:()=>false}])assert.equal(chooseArcherCover(e,p,boxes,{...sensors,...bad}),null);
 assert.equal(chooseArcherCover(e,{x:900,y:125},boxes,sensors),null);
});
check('full aim warning freezes movement and locks the shot direction before release',()=>{
 const {e,p}=scene();start(e,p);const angle=e.archer.angle,x=e.x;let shots=0;p.y+=60;tickCoverArcher(e,p,.64,{onRelease:()=>shots++});assert.equal(shots,0);assert.equal(e.x,x);assert.equal(e.archer.angle,angle);tickCoverArcher(e,p,.02,{onRelease:v=>{shots++;assert.equal(v.shots[0].angle,angle)}});assert.equal(shots,1);assert.equal(e.archer.state,'release');assert.equal(e.archer.volley,null);
});
check('release recovery and cooldown are consistent at 20 30 60 and 144 Hz',()=>{
 for(const fps of [20,30,60,144]){const {e,p}=scene();start(e,p);let now=0,count=0,total=C.windup+C.release+C.recovery;while(now<total-1e-9){const dt=Math.min(1/fps,total-now);tickCoverArcher(e,p,dt,{onRelease:()=>count++});now+=dt}assert.equal(count,1);assert.equal(e.archer.state,'approach');close(e.archer.cooldown,C.cooldown-C.release-C.recovery);assert.equal(e.x,420)}
});
check('breaking current or locked sight cancels pending shots with no late release',()=>{
 for(const flags of [{visible:false},{aimClear:false}]){const {e,p}=scene();start(e,p);tickCoverArcher(e,p,.7,{...flags,onRelease:()=>assert.fail('blocked shot')});assert.equal(e.archer.reason,'cover');assert.equal(e.archer.state,'recover');assert.equal(e.archer.volley,null)}
});
check('close pressure cancels the warning and retreat stops at the hysteresis boundary',()=>{
 const {e,p}=scene();start(e,p);p.x=e.x+50;tickCoverArcher(e,p,.05);assert.equal(e.archer.state,'retreat');assert.equal(e.archer.reason,'pressure');const x=e.x;tickCoverArcher(e,p,.05);assert(e.x<x);p.x=e.x+140;tickCoverArcher(e,p,.01);assert.notEqual(e.archer.state,'retreat');
});
check('explicit seek hide peek fire and return-to-cover states complete in order',()=>{
 const {e,p}=scene();e.speed=100;e.archer.cooldown=0;e.archer.planClock=0;const cover={hide:{x:400,y:500},peek:{x:400,y:450}};
 tickCoverArcher(e,p,.2,{findCover:()=>cover});assert.equal(e.archer.state,'seek');assert.equal(e.x,400);tickCoverArcher(e,p,.01);assert.equal(e.archer.state,'hide');tickCoverArcher(e,p,C.hide);assert.equal(e.archer.state,'peek');tickCoverArcher(e,p,.5);assert.equal(e.y,450);tickCoverArcher(e,p,.01);assert.equal(e.archer.state,'windup');let releases=0;tickCoverArcher(e,p,2,{onRelease:()=>releases++});assert.equal(releases,1);assert.equal(e.archer.state,'seek');assert.deepEqual(e.archer.cover,cover);
});
check('planning deferral retries while empty and invalid cover use bounded refresh clocks',()=>{
 const {e,p}=scene();e.archer.planClock=0;e.archer.cooldown=2;tickCoverArcher(e,p,.01,{findCover:()=>undefined});assert.equal(e.archer.planClock,0);tickCoverArcher(e,p,.01,{findCover:()=>null});assert.equal(e.archer.planClock,C.planInterval);
 e.archer.cover={hide:{x:400,y:500},peek:{x:400,y:450}};e.archer.state='seek';e.archer.planClock=0;tickCoverArcher(e,p,.01,{coverValid:()=>false,findCover:()=>null});assert.equal(e.archer.cover,null);
});
check('blocked movement invalidates cover rather than walking through it',()=>{
 const {e,p}=scene();e.archer.planClock=0;tickCoverArcher(e,p,.05,{findCover:()=>({hide:{x:400,y:500},peek:{x:400,y:450}}),move:from=>({...from,blocked:true})});assert.equal(e.x,420);assert.equal(e.archer.cover,null);assert.equal(e.archer.reason,'blocked');
});
check('stun death and pause suppress pending volleys and preserve serialized timing',()=>{
 const {e,p}=scene();start(e,p);const copy=JSON.parse(JSON.stringify({e,p}));p.paused=true;const before=JSON.stringify(e);tickCoverArcher(e,p,1);assert.equal(JSON.stringify(e),before);p.paused=false;tickCoverArcher(e,p,.2);tickCoverArcher(copy.e,copy.p,.2);assert.deepEqual(copy,{e,p});
 e.stun=.4;tickCoverArcher(e,p,.2);assert.equal(e.archer.state,'stunned');assert.equal(e.archer.volley,null);tickCoverArcher(e,p,.2);tickCoverArcher(e,p,.01);assert.equal(e.archer.state,'recover');e.hp=0;tickCoverArcher(e,p,3,{onRelease:()=>assert.fail('dead shot')});assert.equal(e.archer.reason,'defeated');
});
check('a large frame cannot emit catch-up attacks or retain a released volley',()=>{
 const {e,p}=scene();start(e,p);let releases=0;tickCoverArcher(e,p,20,{onRelease:()=>releases++});assert.equal(releases,1);assert.equal(e.archer.volley,null);assert(validArcherState(e.archer));
});
check('validation rejects corrupt timers plans volleys angles and orphaned state',()=>{
 for(const cover of [undefined,{},false,42,'bad'])assert.equal(validArcherState({...createArcherState(),cover}),false);
 const s=createArcherState();assert(validArcherState(s));for(const patch of [{state:'fake'},{left:1},{cooldown:-1},{planClock:99},{angle:4},{cover:{hide:{x:-1,y:20},peek:{x:10,y:20}}},{volley:{shots:[],zones:[]}}])assert(!validArcherState({...s,...patch}));
 const {e,p}=scene();start(e,p);assert(validArcherState(e.archer));const bad=JSON.parse(JSON.stringify(e.archer));bad.volley.shots[0].speed=1e9;assert(!validArcherState(bad));assert(isCoverArcher({type:2}));assert(!isCoverArcher({type:2,boss:true}));assert(!isCoverArcher({type:2,archetype:'shadow-stalker'}));
});
check('aim release recovery hide and stun visuals do not mutate the actor or projectiles',()=>{
 const {e,p}=scene();start(e,p);const c=createCanvas(800,650).getContext('2d'),images=new Set();for(const state of ['windup','release','recover','hide','stunned']){e.archer.state=state;const before=JSON.stringify(e);c.clearRect(0,0,800,650);drawCoverArcher(c,e,e);assert.equal(JSON.stringify(e),before);images.add(c.canvas.toBuffer('image/png').toString('base64'))}assert.equal(images.size,5);
});
fs.writeFileSync(new URL('./archer-results.json',import.meta.url),JSON.stringify({passed},null,2));console.log(`Passed ${passed} archer module checks`);
