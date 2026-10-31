import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCanvas} from '@napi-rs/canvas';
import {LANTERN_CONFIG as C,createLanternState,validLanternState,cycleLanternMode,lanternRadius,
  lanternStatus,shadowSpeedMultiplier,collectLanternPickup,placeLanternPickup,resetLanternMap,tickLantern} from '../src/systems/lantern.mjs';
import {drawLanternWorld} from '../src/systems/lantern-renderer.mjs';
let passed=0;
function check(name,fn){fn();passed++;console.log('PASS lantern: '+name)}
const player={x:400,y:250},safe=p=>p.x>20&&p.x<780&&p.y>20&&p.y<480;
check('configured modes consume equal fuel at 20, 30, 60 and 144 updates per second',()=>{
  for(const [mode,def] of Object.entries(C.modes))for(const fps of [20,30,60,144]){
    const s=createLanternState();s.mode=mode;
    for(let i=0;i<fps*30;i++)tickLantern(s,1/fps,player,()=>false);
    assert(Math.abs(s.fuel-(100-30*def.burnPerSecond))<1e-8);
    assert.equal(lanternRadius(s),def.radius);assert(validLanternState(s));
  }
});
check('mode cycle and strict low/critical/exhausted boundaries',()=>{
  const s=createLanternState();assert.equal(cycleLanternMode(s),'bright');assert.equal(cycleLanternMode(s),'dim');assert.equal(cycleLanternMode(s),'normal');
  for(const [fuel,status] of [[30,'steady'],[29.9,'low'],[10,'low'],[9.9,'critical'],[0,'empty']]){s.fuel=fuel;assert.equal(lanternStatus(s),status)}
  assert.equal(lanternRadius(s),C.exhaustedRadius);
});
check('a complete 180 seconds can exhaust fuel without emitting damage/death or nonfinite state',()=>{
  for(const mode of Object.keys(C.modes)){const s=createLanternState();s.mode=mode;for(let i=0;i<3600;i++)tickLantern(s,.05,player,()=>false);assert(Math.abs(s.fuel-Math.max(0,100-180*C.modes[mode].burnPerSecond))<1e-8);assert(validLanternState(s));assert.equal(s.hp,undefined)}
  const s=createLanternState();for(const dt of [0,-1,NaN,Infinity])tickLantern(s,dt,player,safe);assert.equal(s.fuel,100);
});
check('reachable refills restore 25, cap at 100, retain full-tank flasks and cannot double-collect',()=>{
  const s=createLanternState(),p=placeLanternPickup(s,player,safe);assert(p);assert.equal(collectLanternPickup(s,p.id),0);assert.equal(s.pickups.length,1);
  s.fuel=90;assert.equal(collectLanternPickup(s,p.id),10);assert.equal(s.fuel,100);assert.equal(collectLanternPickup(s,p.id),0);assert.equal(s.collected,1);
  const q=placeLanternPickup(s,player,safe);s.fuel=0;assert.equal(collectLanternPickup(s,q.id),25);assert.equal(s.restored,35);
});
check('placement is repeatable bounded and never accepts rejected positions',()=>{
  const a=createLanternState(),b=createLanternState();for(let i=0;i<4;i++)assert.deepEqual(placeLanternPickup(a,player,safe),placeLanternPickup(b,player,safe));
  assert.equal(a.pickups.length,4);assert.equal(placeLanternPickup(a,player,safe),null);
  let attempts=0;const s=createLanternState();assert.equal(placeLanternPickup(s,player,()=>{attempts++;return false}),null);assert.equal(attempts,C.pickupAttempts);assert.equal(s.serial,0);
});
check('only the explicitly designated Wisp responds and base enemy stats never change',()=>{
  const s=createLanternState(),wisp={chapter:1,type:0,boss:false,x:450,y:250,speed:50};
  assert.equal(shadowSpeedMultiplier(s,wisp,player),C.litSpeedMultiplier);
  wisp.x=600;assert.equal(shadowSpeedMultiplier(s,wisp,player),1);s.fuel=20;assert.equal(shadowSpeedMultiplier(s,wisp,player),C.hungrySpeedMultiplier);
  for(const e of [{...wisp,boss:true},{...wisp,chapter:2},{...wisp,type:1}])assert.equal(shadowSpeedMultiplier(s,e,player),1);
  assert.equal(wisp.speed,50);
});
check('flasks cannot be collected across an obstruction and expired pickups are removed',()=>{
  const s=createLanternState();s.fuel=50;s.pickups=[{id:1,x:400,y:250,life:1}];s.serial=1;
  tickLantern(s,.1,player,()=>false,()=>false);assert.equal(s.pickups.length,1);assert.equal(s.collected,0);
  tickLantern(s,1,player,()=>false);assert.equal(s.pickups.length,0);
});
check('chapter resets discard world pickups but preserve fuel mode and cumulative counts',()=>{
  const s=createLanternState();s.fuel=35;s.mode='bright';placeLanternPickup(s,player,safe);resetLanternMap(s);assert.equal(s.fuel,35);assert.equal(s.mode,'bright');assert.equal(s.serial,1);assert.equal(s.pickups.length,0);assert.equal(s.pickupClock,0);
});
check('save validation rejects unknown modes malformed and duplicate pickups and invalid clocks',()=>{
  const initial=createLanternState();assert(validLanternState(JSON.parse(JSON.stringify(initial))));
  for(const bad of [{fuel:101},{fuel:-1},{mode:'sun'},{elapsed:NaN},{pickupClock:21},{pickups:[{id:1}]},{serial:1,pickups:[{id:1,x:40,y:40,life:20},{id:1,x:50,y:50,life:20}]}])assert(!validLanternState({...initial,...bad}));
});
check('radius-based terrain lighting retains a readable center and stronger exhausted darkness',()=>{
  const c=createCanvas(800,500),g=c.getContext('2d'),s=createLanternState(),r={...player,lantern:s,enemies:[]};
  const render=()=>{g.fillStyle='#ffffff';g.fillRect(0,0,800,500);drawLanternWorld(g,r,{x:0,y:0},800,500)};
  render();const center=g.getImageData(400,250,1,1).data[0],edge=g.getImageData(50,40,1,1).data[0];assert(center>edge+80);assert(center>230);
  s.fuel=0;render();assert(g.getImageData(50,40,1,1).data[0]<edge);
});
console.log('Passed '+passed+' lantern module checks');
fs.writeFileSync(new URL('./lantern-results.json',import.meta.url),JSON.stringify({passed},null,2));
