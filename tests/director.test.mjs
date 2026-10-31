import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DIRECTOR_CONFIG as C,createDirector,validDirector,directorRandom,directorPhase,threatBudget,planDirectorWave,chooseDirectorSpawn} from '../src/systems/spawn-director.mjs';
let passed=0;function check(name,fn){fn();passed++;console.log('PASS director: '+name)}
check('fixed seeds reproduce plans and different seeds vary their compositions',()=>{
 const a=createDirector('winter-road'),b=createDirector('winter-road'),c=createDirector('other-road');let varied=false;
 for(let elapsed=0;elapsed<180;elapsed+=10){const opts={elapsed,maxCount:14,elite:elapsed===90};const p=planDirectorWave(a,opts);assert.deepEqual(p,planDirectorWave(b,opts));if(JSON.stringify(p)!==JSON.stringify(planDirectorWave(c,opts)))varied=true}assert(varied);
});
check('budget is spent at plan boundaries and every plan respects costs and count limits',()=>{
 for(const difficulty of Object.keys(C.difficulties))for(let elapsed=0;elapsed<=180;elapsed+=5){const d=createDirector('budget',difficulty),p=planDirectorWave(d,{elapsed,maxCount:14,elite:elapsed===90});assert(p.spent<=p.budget);assert.equal(p.budget,threatBudget(elapsed,C.difficulties[difficulty]));assert.equal(p.spent,p.entries.reduce((n,e)=>n+(e.elite?C.eliteCost:C.costs[e.type]),0));assert(p.entries.length<=14);assert(validDirector(d))}
});
check('six phases introduce runners ranged enemies elites and mixed heavy threats',()=>{
 assert.equal(directorPhase(0),0);assert.equal(directorPhase(29.99),0);assert.equal(directorPhase(30),1);assert.equal(directorPhase(180),5);
 const d=createDirector('phases');assert(planDirectorWave(d,{elapsed:0}).entries.every(e=>e.type===0));
 const early=[];for(let i=0;i<10;i++)early.push(...planDirectorWave(d,{elapsed:40}).entries);assert(early.some(e=>e.type===1));assert(early.every(e=>e.type<=1));
 assert(planDirectorWave(d,{elapsed:90,elite:true}).entries.some(e=>e.elite));
 const late=[];for(let i=0;i<10;i++)late.push(...planDirectorWave(d,{elapsed:150}).entries);assert(late.some(e=>e.type===4));assert(late.some(e=>e.type===2));
});
check('placement and event streams cannot perturb composition or each other',()=>{
 const a=createDirector('streams'),b=createDirector('streams');for(let i=0;i<500;i++){directorRandom(a,'placement');directorRandom(a,'events')}
 assert.deepEqual(planDirectorWave(a,{elapsed:120}),planDirectorWave(b,{elapsed:120}));assert.equal(a.rng.composition,b.rng.composition);
});
check('serialized RNG state resumes the exact next plan and candidate positions',()=>{
 const a=createDirector('continue');planDirectorWave(a,{elapsed:90});const b=JSON.parse(JSON.stringify(a));assert(validDirector(b));assert.deepEqual(planDirectorWave(a,{elapsed:120}),planDirectorWave(b,{elapsed:120}));
 const opts={player:{x:1200,y:750},view:{x:800,y:500,w:800,h:500},bounds:{x:10,y:15,w:2380,h:1470},canPlace:()=>true};assert.deepEqual(chooseDirectorSpawn(a,opts),chooseDirectorSpawn(b,opts));
});
check('placement prefers outside view and rejects hazards walls unsafe range and out-of-bounds',()=>{
 const d=createDirector('safe');for(let i=0;i<100;i++){const p=chooseDirectorSpawn(d,{player:{x:1200,y:750},view:{x:800,y:500,w:800,h:500},bounds:{x:10,y:15,w:2380,h:1470},canPlace:p=>p.x>1000});assert(p);assert(!p.visible);assert(p.x>1000);assert(Math.hypot(p.x-1200,p.y-750)>=275)}
 let attempts=0;assert.equal(chooseDirectorSpawn(d,{player:{x:1200,y:750},view:{x:800,y:500,w:800,h:500},bounds:{x:10,y:15,w:2380,h:1470},canPlace:()=>{attempts++;return false}}),null);assert(attempts<=C.attempts);assert(attempts>0);assert(d.rejected>0);
});
check('small rooms allow visible but distant warned arrivals without forcing blocked locations',()=>{
 const p=chooseDirectorSpawn(createDirector('room'),{player:{x:400,y:325},view:{x:0,y:0,w:800,h:500},bounds:{x:120,y:125,w:560,h:400},story:true,canPlace:()=>true});assert(p?.visible);assert(Math.hypot(p.x-400,p.y-325)>=140);
 assert.equal(chooseDirectorSpawn(createDirector('tiny'),{player:{x:40,y:40},view:{x:0,y:0,w:800,h:500},bounds:{x:20,y:20,w:40,h:40},story:true,canPlace:()=>true}),null);
});
check('legacy composition plans preserve requested bounded crowd counts and elite cost',()=>{
 for(const count of [0,1,5,14,32,150]){const d=createDirector('legacy');const p=planDirectorWave(d,{elapsed:150,maxCount:count,legacy:true});assert.equal(p.entries.length,count);assert(p.spent<=p.budget)}
});
check('malformed seeds random state and plans are rejected before Continue',()=>{
 const d=createDirector('valid');assert(validDirector(d));for(const bad of [{seed:''},{seed:'x'.repeat(65)},{difficulty:'nightmare'},{rng:{...d.rng,placement:-1}},{ticks:-1},{bossSpawned:'yes'},{lastPlan:{budget:1,spent:2,entries:[]}}])assert(!validDirector({...d,...bad}));
 assert.equal(createDirector('  trimmed  ').seed,'trimmed');assert.throws(()=>directorRandom(d,'render'));
});
fs.writeFileSync(new URL('./director-results.json',import.meta.url),JSON.stringify({passed},null,2));console.log('Passed '+passed+' director module checks');
