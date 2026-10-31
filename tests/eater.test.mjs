import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCanvas} from '@napi-rs/canvas';
import {createLanternState,validLanternState,dropLanternPickup,collectLanternPickup,tickLantern} from '../src/systems/lantern.mjs';
import {EATER_CONFIG as C,createEaterState,validEaterState,interruptEater,tickLanternEater,fuelPressure} from '../src/systems/lantern-eater.mjs';
import {drawLanternEater} from '../src/systems/lantern-eater-renderer.mjs';
import {createDirector,planDirectorWave,validDirector,directorEntryCost} from '../src/systems/spawn-director.mjs';
let passed=0;function check(name,fn){fn();passed++;console.log('PASS eater: '+name)}
const scene=()=>({e:{x:140,y:0,hp:100,stun:0,archetype:C.archetype,eater:createEaterState()},p:{x:0,y:0,hp:100,paused:false,invuln:0,shield:0,lantern:createLanternState()}});
const charge=(e,p)=>{e.eater.cooldown=0;assert.equal(tickLanternEater(e,p,.01).event,'windup')};
check('the full warning deals no drain and fractional channel release drains only live channel time',()=>{
 const {e,p}=scene();charge(e,p);tickLanternEater(e,p,1.19);assert.equal(p.lantern.fuel,100);tickLanternEater(e,p,.02);assert(Math.abs(p.lantern.fuel-99.94)<1e-8);assert.equal(e.eater.state,'channel');assert(validEaterState(e.eater));
});
check('complete channels drain exactly the configured amount at 20 30 60 and 144 Hz',()=>{
 for(const fps of [20,30,60,144]){const {e,p}=scene();charge(e,p);for(let i=0;i<fps*(C.windup+C.channel);i++)tickLanternEater(e,p,1/fps);assert(Math.abs(e.eater.drained-C.channel*C.drainPerSecond)<1e-7);assert(Math.abs(p.lantern.fuel-(100-C.channel*C.drainPerSecond))<1e-7);assert(validEaterState(e.eater))}
});
check('hits and stun interrupt windup or channel and impose recovery without HP damage',()=>{
 for(const state of ['windup','channel']){const {e,p}=scene();charge(e,p);if(state==='channel')tickLanternEater(e,p,C.windup);const fuel=p.lantern.fuel;assert(interruptEater(e,'hit'));tickLanternEater(e,p,.2);assert.equal(p.lantern.fuel,fuel);assert.equal(p.hp,100);assert.equal(e.eater.state,'recover');assert(!interruptEater(e,'hit'));assert(validEaterState(e.eater))}
 const {e,p}=scene();charge(e,p);e.stun=2;assert.equal(tickLanternEater(e,p,.05).event,'interrupted');assert.equal(e.eater.reason,'stun');assert.equal(p.lantern.fuel,100);
});
check('range cover Bright protection and competing-channel slots each stop the siphon',()=>{
 for(const reason of ['range','cover','bright','protected','slot']){const {e,p}=scene();charge(e,p);tickLanternEater(e,p,C.windup);let context={};if(reason==='range')p.x=-60;if(reason==='cover')context.visible=false;if(reason==='bright')p.lantern.mode='bright';if(reason==='protected')p.invuln=.4;if(reason==='slot')context.slotAvailable=false;const fuel=p.lantern.fuel;tickLanternEater(e,p,.05,context);assert.equal(p.lantern.fuel,fuel,reason);assert.equal(e.eater.reason,reason);assert.equal(e.eater.state,'recover')}
});
check('zero fuel remains survivable and dead Eaters never release late drains',()=>{
 const {e,p}=scene();p.lantern.fuel=.1;charge(e,p);tickLanternEater(e,p,C.windup+1);assert.equal(p.lantern.fuel,0);assert.equal(p.hp,100);assert.equal(e.eater.reason,'empty');assert(Math.abs(p.lantern.drained-.1)<1e-9);
 const q=scene();charge(q.e,q.p);q.e.hp=0;tickLanternEater(q.e,q.p,10);assert.equal(q.p.lantern.fuel,100);assert.equal(q.p.hp,100);
});
check('pause and serialized channels preserve exact remaining time and cumulative drain',()=>{
 const {e,p}=scene();charge(e,p);tickLanternEater(e,p,1.5);const before=JSON.stringify({e,p});p.paused=true;tickLanternEater(e,p,2);p.paused=false;assert.equal(JSON.stringify({e,p}),before);
 const copy=JSON.parse(before);assert(validEaterState(copy.e.eater));tickLanternEater(e,p,.2);tickLanternEater(copy.e,copy.p,.2);assert.deepEqual(copy,{e,p});
});
check('pressure weighting is seeded budget-neutral capped and never creates Eaters at empty fuel',()=>{
 const totals={steady:0,low:0,critical:0,empty:0};for(const [label,fuel]of Object.entries({steady:100,low:20,critical:5,empty:0})){const a=createDirector('pressure'),b=createDirector('pressure');for(let i=0;i<300;i++){const opts={elapsed:90,maxCount:14,allowEaters:true,fuel,chapter:1};const plan=planDirectorWave(a,opts);assert.deepEqual(plan,planDirectorWave(b,opts));const eaters=plan.entries.filter(e=>e.archetype===C.archetype);assert(eaters.length<=1);totals[label]+=eaters.length;assert.equal(plan.spent,plan.entries.reduce((n,e)=>n+directorEntryCost(e),0));assert(plan.spent<=plan.budget);assert(validDirector(a))}}
 assert(totals.low>totals.steady);assert(totals.critical>totals.low);assert.equal(totals.empty,0);
 const full=planDirectorWave(createDirector('cap'),{elapsed:150,allowEaters:true,fuel:5,eaterCount:2});assert(!full.entries.some(e=>e.archetype));
 const early=planDirectorWave(createDirector('early'),{elapsed:30,allowEaters:true,fuel:5});assert(!early.entries.some(e=>e.archetype));assert.equal(fuelPressure(30),'steady');assert.equal(fuelPressure(10),'low');
});
check('reclaimed oil is capped validated and collected once without deleting older flasks',()=>{
 const s=createLanternState();s.fuel=0;const p=dropLanternPickup(s,{x:100,y:100},12);assert(p);assert(validLanternState(s));assert.equal(collectLanternPickup(s,p.id),12);assert.equal(collectLanternPickup(s,p.id),0);assert.equal(s.fuel,12);
 for(let i=0;i<4;i++)dropLanternPickup(s,{x:100+i*20,y:100},12);const before=JSON.stringify(s.pickups);assert.equal(dropLanternPickup(s,{x:100,y:100},12),null);assert.equal(JSON.stringify(s.pickups),before);assert(!validLanternState({...s,pickups:[{...s.pickups[0],restore:26}]}));
});
check('a scripted 180-second oil economy can refill in every mode and survive total exhaustion',()=>{
 for(const mode of ['dim','normal','bright']){const {e,p}=scene();p.lantern.mode=mode;for(let i=0;i<3600;i++){tickLantern(p.lantern,.05,p,()=>true);tickLanternEater(e,p,.05);if(i%400===399){const flask=p.lantern.pickups[0];if(flask)collectLanternPickup(p.lantern,flask.id)}assert(p.lantern.fuel>=0&&p.lantern.fuel<=100);assert.equal(p.hp,100)}assert(validLanternState(p.lantern))}
});
check('channel visuals animate without mutating combat or resource state',()=>{
 const {e,p}=scene();charge(e,p);tickLanternEater(e,p,C.windup);e.x=260;e.y=190;p.x=150;p.y=190;const before=JSON.stringify({e,p}),c=createCanvas(500,400),g=c.getContext('2d');drawLanternEater(g,e,{...p,time:1});drawLanternEater(g,e,{...p,time:1.3});assert(g.getImageData(0,0,500,400).data.some((v,i)=>i%4===3&&v>0));assert.equal(JSON.stringify({e,p}),before);
});
check('malformed channel states and new fuel counters are rejected while old lantern saves remain valid',()=>{
 const initial=createEaterState();assert(validEaterState(initial));for(const bad of [{state:'attack'},{left:9},{cooldown:-1},{drained:NaN},{reason:'unknown'},{rewarded:1}])assert(!validEaterState({...initial,...bad}));const old=createLanternState();delete old.drained;assert(validLanternState(old));assert(!validLanternState({...old,drained:-1}));
});
fs.writeFileSync(new URL('./eater-results.json',import.meta.url),JSON.stringify({passed},null,2));console.log('Passed '+passed+' eater module checks');
