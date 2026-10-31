import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCanvas} from '@napi-rs/canvas';
import {createLanternState} from '../src/systems/lantern.mjs';
import {STALKER_CONFIG as C,isShadowStalker,stalkerAttacking,createStalkerState,validStalkerState,stalkerLight,tickShadowStalker} from '../src/systems/shadow-stalker.mjs';
import {drawShadowStalker} from '../src/systems/shadow-stalker-renderer.mjs';
import {createDirector,planDirectorWave,validDirector,directorEntryCost,directorRandom} from '../src/systems/spawn-director.mjs';
let passed=0;const check=(name,f)=>{f();passed++;console.log('PASS stalker: '+name)},close=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} ~= ${b}`);
const scene=(fuel=20,mode='normal',side=1)=>{const p={x:0,y:0,hp:100,paused:false,lantern:createLanternState()};Object.assign(p.lantern,{fuel,mode});const e={x:stalkerLight(p).edge,y:0,hp:100,chapter:1,type:0,archetype:C.archetype,size:12,speed:36,stun:0,stalker:createStalkerState(side)};return{e,p}};
const start=(e,p)=>{Object.assign(e.stalker,{state:'flank',circle:C.patience,cooldown:0});tickShadowStalker(e,p,.01);assert.equal(e.stalker.state,'windup')};
check('normal light holds both orbit directions outside illumination without passive damage',()=>{
 for(const side of [-1,1]){const {e,p}=scene(100,'normal',side);let attacks=0;for(let i=0;i<300;i++)tickShadowStalker(e,p,.02,{onStrike:()=>{attacks++;return true}});const d=Math.hypot(e.x,e.y);assert(d>p.lantern.fuel&&d>125&&Math.abs(d-149)<8);assert.equal(e.stalker.state,'flank');assert(Math.sign(e.y)===side);assert.equal(attacks,0);assert.equal(p.hp,100);assert.equal(e.speed,36)}
});
check('Bright expands the boundary and illuminated enemies retreat with hysteresis',()=>{
 const {e,p}=scene(100,'bright');e.x=100;tickShadowStalker(e,p,.05);assert.equal(e.stalker.state,'retreat');assert(e.x>100);for(let i=0;i<100;i++)tickShadowStalker(e,p,.05);assert(Math.hypot(e.x,e.y)>180);assert(['retreat','flank'].includes(e.stalker.state));assert.equal(p.lantern.fuel,100);
});
check('Dim low oil and empty oil permit a pounce but fueled Bright prevents commitment',()=>{
 for(const [fuel,mode]of [[100,'dim'],[20,'normal'],[0,'normal'],[0,'bright']]){const {e,p}=scene(fuel,mode);start(e,p);assert(stalkerAttacking(e));assert(validStalkerState(e.stalker))}
 const {e,p}=scene(5,'bright');e.stalker.cooldown=0;e.stalker.circle=C.patience;tickShadowStalker(e,p,.05);assert(!stalkerAttacking(e));assert.equal(e.stalker.state,'flank');
});
check('full pounce warning locks aim and uses only fractional live attack time',()=>{
 const {e,p}=scene(100,'dim');start(e,p);const x=e.x,heading=e.stalker.angle;let attempts=0;p.y=70;tickShadowStalker(e,p,.74,{onStrike:()=>{attempts++;return false}});assert.equal(e.x,x);assert.equal(attempts,0);tickShadowStalker(e,p,.02);assert.equal(e.stalker.state,'strike');assert.equal(e.stalker.angle,heading);close(e.x,x-e.stalker.speed*.01);close(e.y,0);
});
check('strike distance recovery and cooldown are consistent at 20 30 60 and 144 Hz',()=>{
 for(const fps of [20,30,60,144]){const {e,p}=scene();start(e,p);const x=e.x,speed=e.stalker.speed,total=C.windup+C.strike+C.recovery;let time=0;while(time<total-1e-9){const dt=Math.min(1/fps,total-time);tickShadowStalker(e,p,dt);time+=dt}close(e.x,x-speed*C.strike);close(e.y,0);assert.equal(e.stalker.state,'approach');close(e.stalker.cooldown,C.cooldown-C.recovery)}
});
check('illumination refill cover range and attack-slot loss cancel full warnings',()=>{
 for(const reason of ['light','refill','cover','range','slot']){const {e,p}=scene();start(e,p);const before={x:e.x,y:e.y};const opts={};if(reason==='light')p.x=40;if(reason==='refill')p.lantern.fuel=50;if(reason==='cover')opts.visible=false;if(reason==='range')p.x=-200;if(reason==='slot')opts.slotAvailable=false;tickShadowStalker(e,p,.1,opts);assert.equal(e.stalker.state,'recover');assert.equal(e.stalker.reason,['light','refill'].includes(reason)?'light':reason);assert.deepEqual({x:e.x,y:e.y},before)}
});
check('Bright breaks an already committed strike and stun has a separate frozen state',()=>{
 const {e,p}=scene(100,'dim');start(e,p);tickShadowStalker(e,p,C.windup+.1);const x=e.x;p.lantern.mode='bright';tickShadowStalker(e,p,.05);assert.equal(e.x,x);assert.equal(e.stalker.reason,'light');
 const q=scene();start(q.e,q.p);q.e.stun=.4;tickShadowStalker(q.e,q.p,.2);assert.equal(q.e.stalker.state,'stunned');close(q.e.stun,.2);tickShadowStalker(q.e,q.p,.2);tickShadowStalker(q.e,q.p,.05);assert.equal(q.e.stalker.state,'recover');assert.equal(q.e.stalker.left,C.recovery);
});
check('pause death and serialized states cannot release a late or duplicate strike',()=>{
 const {e,p}=scene();start(e,p);tickShadowStalker(e,p,.9);const copy=JSON.parse(JSON.stringify({e,p}));p.paused=true;const before=JSON.stringify(e);tickShadowStalker(e,p,10);assert.equal(JSON.stringify(e),before);p.paused=false;tickShadowStalker(e,p,.1);tickShadowStalker(copy.e,copy.p,.1);assert.deepEqual(copy,{e,p});e.hp=0;const x=e.x;tickShadowStalker(e,p,.5,{onStrike:()=>assert.fail('dead attack')});assert.equal(e.x,x);assert.equal(e.stalker.reason,'defeated');
});
check('strike work speed and accepted contacts are bounded and cover stops the pounce',()=>{
 const {e,p}=scene();e.speed=1e9;start(e,p);assert.equal(e.stalker.speed,C.maxStrikeSpeed);tickShadowStalker(e,p,C.windup);let steps=0,hits=0;tickShadowStalker(e,p,20,{move:(_from,to)=>{steps++;return to},onStrike:()=>{hits++;return true}});assert.equal(hits,1);assert(steps<=Math.ceil(C.maxStrikeSpeed*C.strike/C.moveStep));assert.equal(e.stalker.state,'approach');
 const q=scene();start(q.e,q.p);tickShadowStalker(q.e,q.p,C.windup);const before=q.e.x;tickShadowStalker(q.e,q.p,.1,{move:from=>({...from,blocked:true}),onStrike:()=>false});assert.equal(q.e.x,before);assert.equal(q.e.stalker.reason,'blocked');
});
check('blocked circling flips its saved side without phantom movement or attacks',()=>{
 const {e,p}=scene(100);const side=e.stalker.side,x=e.x,y=e.y;tickShadowStalker(e,p,.05,{move:from=>({...from,blocked:true}),onStrike:()=>assert.fail('circle hit')});assert.equal(e.stalker.side,-side);assert.equal(e.x,x);assert.equal(e.y,y);
});
check('seeded Woods variants respect eligibility count budget and independent random streams',()=>{
 const a=createDirector('stalker-road'),b=createDirector('stalker-road');let found=0;
 for(let i=0;i<200;i++){for(let j=0;j<10;j++)directorRandom(a,'events');const opts={elapsed:90,maxCount:14,allowEaters:true,allowStalkers:true,chapter:1,fuel:5};const p=planDirectorWave(a,opts);assert.deepEqual(p,planDirectorWave(b,opts));const variants=p.entries.filter(e=>e.archetype===C.archetype);assert(variants.length<=1);found+=variants.length;assert.equal(p.spent,p.entries.reduce((n,e)=>n+directorEntryCost(e),0));assert(p.spent<=p.budget);assert(validDirector(a))}assert(found>0);
 for(const opts of [{elapsed:0},{chapter:2},{stalkerCount:C.maxAlive}]){const d=createDirector('ineligible');for(let i=0;i<40;i++)assert(!planDirectorWave(d,{elapsed:90,chapter:1,allowStalkers:true,...opts}).entries.some(e=>e.archetype===C.archetype))}
 const copy=JSON.parse(JSON.stringify(b));assert.deepEqual(planDirectorWave(copy,{elapsed:150,allowStalkers:true}),planDirectorWave(b,{elapsed:150,allowStalkers:true}));
});
check('state and saved-plan validation reject impossible timers sides and foreign archetypes',()=>{
 const s=createStalkerState();assert(validStalkerState(s));for(const patch of [{state:'fake'},{left:1},{side:0},{circle:99},{cooldown:-1},{angle:4},{speed:261},{hit:1},{reason:'fake'}])assert(!validStalkerState({...s,...patch}));assert(isShadowStalker({archetype:C.archetype}));assert(!isShadowStalker({type:0}));
 const d=createDirector('bad-plan');d.lastPlan={budget:5,spent:2,entries:[{type:0,elite:false,archetype:C.archetype}]};assert(validDirector(d));d.lastPlan.entries[0].type=3;assert(!validDirector(d));
});
check('all stalker cues render distinctly without mutating gameplay or light',()=>{
 const {e,p}=scene();const c=createCanvas(500,400).getContext('2d');e.x=e.y=200;const images=new Set();
 for(const state of ['approach','flank','retreat','windup','strike','recover','stunned']){e.stalker.state=state;e.stalker.left=['windup','strike'].includes(state)?.3:state==='recover'?.5:0;e.stalker.speed=180;const before=JSON.stringify({e,p});c.clearRect(0,0,500,400);drawShadowStalker(c,e,p);assert.equal(JSON.stringify({e,p}),before);images.add(c.canvas.toBuffer('image/png').toString('base64'))}assert.equal(images.size,7);
});
fs.writeFileSync(new URL('./stalker-results.json',import.meta.url),JSON.stringify({passed},null,2));console.log(`Passed ${passed} stalker module checks`);

