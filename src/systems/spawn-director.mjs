import {WARDEN_CONFIG} from './void-warden.mjs';
import {MIMIC_CONFIG} from './spectral-mimic.mjs';
import {EATER_CONFIG,fuelPressure} from './lantern-eater.mjs';
import {STALKER_CONFIG} from './shadow-stalker.mjs';
// Independent random streams keep rendering and loot from changing wave composition.
export const DIRECTOR_CONFIG=Object.freeze({
  version:1, maxSeedLength:64, worldWidth:2400, worldHeight:1500,
  costs:Object.freeze([1,2,3,3,5]), eliteCost:12,
  attempts:64, arrivalSeconds:1.2, outsideDistance:275, storyDistance:140,
  bossDistance:170, spacing:14, maxActive:150,
  difficulties:Object.freeze({relaxed:.8,standard:1,veteran:1.2}),
  survival:Object.freeze({duration:180,interval:10,cap:84,maxBatch:14,bossAt:150,eliteAt:90,victoryGold:2500,requireBoss:false,
    baseVitality:1.1,vitalityPerPhase:.22,baseDamage:1.08,damagePerPhase:.08,baseSpeed:1.04,speedPerPhase:.04}),
  phases:Object.freeze([
    Object.freeze({name:'First shadows',pool:Object.freeze([0])}),
    Object.freeze({name:'The hunt quickens',pool:Object.freeze([0,0,1,1])}),
    Object.freeze({name:'Crossfire',pool:Object.freeze([0,1,2,2,3])}),
    Object.freeze({name:'Elite pressure',pool:Object.freeze([0,1,2,3,4])}),
    Object.freeze({name:'Combined assault',pool:Object.freeze([0,1,1,2,2,3,4,4])}),
    Object.freeze({name:'Last stand',pool:Object.freeze([0,1,2,2,3,3,4,4])})
  ])
});
const streams=['composition','placement','events'];
export function normalizeSeed(seed){return String(seed??'').trim().slice(0,DIRECTOR_CONFIG.maxSeedLength)||'last-lantern'}
function hashSeed(seed){let n=2166136261;for(const c of seed)n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0}
export function createDirector(seed,difficulty='standard'){
  const text=normalizeSeed(seed),rng=Object.fromEntries(streams.map(key=>[key,hashSeed(text+':'+key)]));
  return {version:1,seed:text,difficulty:Object.hasOwn(DIRECTOR_CONFIG.difficulties,difficulty)?difficulty:'standard',rng,
    ticks:0,spawned:0,rejected:0,nextAt:0,retry:{key:'',left:0},bossSpawned:false,eliteSpawned:false,lastPlan:null};
}
export function validDirector(d){
  if(!d||d.version!==1||typeof d.seed!=='string'||d.seed!==normalizeSeed(d.seed)||!Object.hasOwn(DIRECTOR_CONFIG.difficulties,d.difficulty))return false;
  if(!d.rng||!streams.every(k=>Number.isInteger(d.rng[k])&&d.rng[k]>=0&&d.rng[k]<=0xffffffff))return false;
  if(!['ticks','spawned','rejected'].every(k=>Number.isSafeInteger(d[k])&&d[k]>=0&&d[k]<1e12)||typeof d.bossSpawned!=='boolean'||typeof d.eliteSpawned!=='boolean')return false;
  if(!Number.isFinite(d.nextAt)||d.nextAt<0||d.nextAt>1e12)return false;
  if(!d.retry||typeof d.retry.key!=='string'||d.retry.key.length>40||!Number.isFinite(d.retry.left)||d.retry.left<0||d.retry.left>.5)return false;
  const p=d.lastPlan;
  return p===null||!!p&&Number.isSafeInteger(p.budget)&&p.budget>=0&&p.budget<=1000&&Number.isSafeInteger(p.spent)&&p.spent>=0&&p.spent<=p.budget&&
    (p.pressure===undefined||['steady','low','critical','empty'].includes(p.pressure))&&
    Array.isArray(p.entries)&&p.entries.length<=DIRECTOR_CONFIG.maxActive&&p.entries.every(e=>e&&Number.isInteger(e.type)&&e.type>=0&&e.type<=4&&typeof e.elite==='boolean'&&
      (e.archetype===undefined||e.archetype===WARDEN_CONFIG.archetype&&e.type===2&&!e.elite||e.archetype===MIMIC_CONFIG.archetype&&e.type===3&&!e.elite||e.archetype===EATER_CONFIG.archetype&&e.type===3&&!e.elite||e.archetype===STALKER_CONFIG.archetype&&e.type===STALKER_CONFIG.type&&!e.elite))&&
    p.spent===p.entries.reduce((n,e)=>n+directorEntryCost(e),0);
}
export function directorRandom(d,stream='composition'){
  if(!streams.includes(stream))throw new Error('Unknown director random stream');
  const value=d.rng[stream]=(d.rng[stream]+0x6d2b79f5)>>>0;
  let n=Math.imul(value^(value>>>15),value|1);n^=n+Math.imul(n^(n>>>7),n|61);
  return ((n^(n>>>14))>>>0)/4294967296;
}
export function directorPhase(elapsed){return Math.min(5,Math.max(0,Math.floor(elapsed/30)))}
export function threatBudget(elapsed,difficulty=1){return Math.floor((8+35*Math.pow(Math.min(1,Math.max(0,elapsed/180)),1.6))*difficulty)}
export function directorEntryCost(e){return e.elite?DIRECTOR_CONFIG.eliteCost:e.archetype===WARDEN_CONFIG.archetype?WARDEN_CONFIG.cost:e.archetype===MIMIC_CONFIG.archetype?MIMIC_CONFIG.cost:e.archetype===EATER_CONFIG.archetype?EATER_CONFIG.cost:e.archetype===STALKER_CONFIG.archetype?STALKER_CONFIG.cost:DIRECTOR_CONFIG.costs[e.type]}
/** A budget is spent once at a scheduled interval / Story wave, never per render frame. */
export function planDirectorWave(d,{elapsed=0,maxCount=14,legacy=false,elite=false,allowEaters=false,allowStalkers=false,allowMimics=false,mimicCount=0,allowWardens=false,wardenCount=0,fuel=100,chapter=1,eaterCount=0,stalkerCount=0}={}){
  const count=Math.max(0,Math.min(DIRECTOR_CONFIG.maxActive,Math.floor(maxCount))),phase=directorPhase(elapsed);
  const budget=Math.min(1000,Math.max(legacy?Math.ceil(count*2.5):0,threatBudget(elapsed,DIRECTOR_CONFIG.difficulties[d.difficulty])));
  const entries=[];let spent=0;
  if(elite&&count>0&&budget>=DIRECTOR_CONFIG.eliteCost){entries.push({type:4,elite:true});spent+=DIRECTOR_CONFIG.eliteCost}
  const pressure=fuelPressure(fuel);
  let eaterWanted=allowEaters&&phase>=EATER_CONFIG.firstPhase&&fuel>0&&eaterCount<EATER_CONFIG.maxAlive&&entries.length<count&&directorRandom(d)<EATER_CONFIG.chance[pressure];
  let stalkerWanted=allowStalkers&&chapter===STALKER_CONFIG.chapter&&phase>=STALKER_CONFIG.firstPhase&&stalkerCount<STALKER_CONFIG.maxAlive&&entries.length<count&&directorRandom(d)<STALKER_CONFIG.chance[pressure];
  let mimicWanted=allowMimics&&phase>=MIMIC_CONFIG.firstPhase&&mimicCount<MIMIC_CONFIG.maxAlive&&entries.length<count&&directorRandom(d)<MIMIC_CONFIG.chance;
  let wardenWanted=allowWardens&&phase>=WARDEN_CONFIG.firstPhase&&wardenCount<WARDEN_CONFIG.maxAlive&&entries.length<count&&directorRandom(d)<WARDEN_CONFIG.chance;
  while(entries.length<count){
    const remaining=count-entries.length-1,reserve=legacy?remaining:0;
    if(wardenWanted&&WARDEN_CONFIG.cost<=budget-spent-reserve){entries.push({type:2,elite:false,archetype:WARDEN_CONFIG.archetype});spent+=WARDEN_CONFIG.cost;wardenWanted=false;continue}
    if(mimicWanted&&MIMIC_CONFIG.cost<=budget-spent-reserve){entries.push({type:3,elite:false,archetype:MIMIC_CONFIG.archetype});spent+=MIMIC_CONFIG.cost;mimicWanted=false;continue}
    if(eaterWanted&&EATER_CONFIG.cost<=budget-spent-reserve){entries.push({type:3,elite:false,archetype:EATER_CONFIG.archetype});spent+=EATER_CONFIG.cost;eaterWanted=false;continue}
    if(stalkerWanted&&STALKER_CONFIG.cost<=budget-spent-reserve){entries.push({type:STALKER_CONFIG.type,elite:false,archetype:STALKER_CONFIG.archetype});spent+=STALKER_CONFIG.cost;stalkerWanted=false;continue}
    const weighted=[...DIRECTOR_CONFIG.phases[phase].pool];
    if(allowEaters&&chapter===1&&pressure!=='steady')weighted.push(0,0);
    const pool=weighted.filter(type=>DIRECTOR_CONFIG.costs[type]<=budget-spent-reserve);
    if(!pool.length)break;
    const type=pool[Math.floor(directorRandom(d)*pool.length)];entries.push({type,elite:false});spent+=DIRECTOR_CONFIG.costs[type];
  }
  const plan={budget,spent,entries,...(allowEaters||allowStalkers?{pressure}:{})};d.ticks++;d.lastPlan=plan;return plan;
}
/** Prefer off-screen positions; small Story rooms can use a warned on-screen arrival. */
export function chooseDirectorSpawn(d,{player,view,bounds,boss=false,story=false,radius=12,canPlace}){
  const distance=story?(boss?DIRECTOR_CONFIG.bossDistance:DIRECTOR_CONFIG.storyDistance):DIRECTOR_CONFIG.outsideDistance;
  let visible=null;
  for(let i=0;i<DIRECTOR_CONFIG.attempts;i++){
    let x,y;
    if(story){x=bounds.x+radius+directorRandom(d,'placement')*(bounds.w-radius*2);y=bounds.y+radius+directorRandom(d,'placement')*(bounds.h-radius*2)}
    else{const a=directorRandom(d,'placement')*Math.PI*2;x=player.x+Math.cos(a)*(350+directorRandom(d,'placement')*450);y=player.y+Math.sin(a)*(250+directorRandom(d,'placement')*300)}
    if(x<bounds.x+radius||x>bounds.x+bounds.w-radius||y<bounds.y+radius||y>bounds.y+bounds.h-radius||Math.hypot(x-player.x,y-player.y)<distance||!canPlace({x,y},radius))continue;
    const p={x,y,visible:x>=view.x-radius&&x<=view.x+view.w+radius&&y>=view.y-radius&&y<=view.y+view.h+radius};
    if(!p.visible)return p;if(!visible)visible=p;
  }
  if(!visible)d.rejected++;
  return visible;
}
