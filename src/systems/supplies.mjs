export const SUPPLY_ART_FILES=Object.freeze({
 healing_potion:'./assets/supplies/crimson-draught.png',oil_flask:'./assets/supplies/lantern-oil.png',
 fury_tonic:'./assets/supplies/emberfang-tonic.png',iron_tonic:'./assets/supplies/ironbark-tonic.png',
 forge_catalyst:'./assets/supplies/ember-catalyst.png',preservation_ward:'./assets/supplies/preservation-ward.png',
 weapon_bundle:'./assets/supplies/weapon-fragments.png',armor_bundle:'./assets/supplies/armor-fragments.png',dust_bundle:'./assets/supplies/ember-dust.png'
});
export const MATERIALS=Object.freeze([
 {id:'weapon_fragment',name:'Weapon fragments',short:'Weapon fragments'},
 {id:'armor_fragment',name:'Armor fragments',short:'Armor fragments'},
 {id:'ember_dust',name:'Ember dust',short:'Ember dust'},
 {id:'boss_core',name:'Boss cores',short:'Boss cores'},
 {id:'dawn_essence',name:'Dawn essence',short:'Dawn essence'}
]);
export const CONSUMABLES=Object.freeze([
 {id:'healing_potion',name:'Crimson draught',icon:'potion',cost:250,description:'Restore 35% of maximum health during an expedition.',use:'battle'},
 {id:'oil_flask',name:'Refined lantern oil',icon:'oil',cost:300,description:'Restore 35 lantern fuel during an expedition.',use:'battle'},
 {id:'fury_tonic',name:'Emberfang tonic',icon:'fury',cost:900,description:'Deal 15% more damage for 120 active seconds. Does not stack.',use:'battle'},
 {id:'iron_tonic',name:'Ironbark tonic',icon:'guard',cost:900,description:'Gain 15% damage protection for 120 active seconds, within the 65% cap.',use:'battle'},
 {id:'forge_catalyst',name:'Ember catalyst',icon:'catalyst',cost:1500,description:'Add 15 percentage points to one forge attempt. Consumed on use.',use:'forge'},
 {id:'preservation_ward',name:'Preservation ward',icon:'ward',cost:2000,description:'Keep recipe materials if an attempt fails. Gold is spent. Consumed only on failure.',use:'forge'}
]);
export const SUPPLY_SHOP=Object.freeze([
 ...CONSUMABLES.map(item=>({...item,contents:{[item.id]:1}})),
 {id:'weapon_bundle',name:'Broken-blade cache',icon:'fragment',cost:1000,description:'Eight weapon fragments. Also recovered from enemies.',contents:{weapon_fragment:8}},
 {id:'armor_bundle',name:'Salvaged armor cache',icon:'fragment',cost:1000,description:'Eight armor fragments. Also recovered from enemies.',contents:{armor_fragment:8}},
 {id:'dust_bundle',name:'Ember dust pouch',icon:'dust',cost:800,description:'Six ember dust. Elites and bosses drop dust; cores and essence must be earned.',contents:{ember_dust:6}}
]);
export const INVENTORY_IDS=Object.freeze([...MATERIALS,...CONSUMABLES].map(item=>item.id));
export function emptyInventory(starter=false){return Object.fromEntries(INVENTORY_IDS.map(id=>[id,starter?({weapon_fragment:8,armor_fragment:8,ember_dust:4,healing_potion:2,oil_flask:1}[id]||0):0]))}
export function normalizeSupplies(save){
 if(save.inventory===undefined)save.inventory=emptyInventory(true);
 else if(save.inventory&&typeof save.inventory==='object'&&!Array.isArray(save.inventory))for(const id of INVENTORY_IDS)if(save.inventory[id]===undefined)save.inventory[id]=0;
 return save;
}
export function validInventory(inv){return !!inv&&typeof inv==='object'&&!Array.isArray(inv)&&Object.keys(inv).length===INVENTORY_IDS.length&&INVENTORY_IDS.every(id=>Number.isSafeInteger(inv[id])&&inv[id]>=0&&inv[id]<=1e9)}
export function canAddInventory(inv,contents){return validInventory(inv)&&Object.entries(contents).every(([id,n])=>INVENTORY_IDS.includes(id)&&Number.isSafeInteger(n)&&n>0&&inv[id]+n<=1e9)}
export function grantInventory(save,contents){if(!canAddInventory(save.inventory,contents))return false;for(const[id,n]of Object.entries(contents))save.inventory[id]+=n;return true}
export function buySupply(save,id){
 const item=SUPPLY_SHOP.find(item=>item.id===id);
 if(!item||!Number.isSafeInteger(save.gold)||save.gold<item.cost||!canAddInventory(save.inventory,item.contents))return false;
 save.gold-=item.cost;grantInventory(save,item.contents);return true;
}
export function materialRewards(enemy,roll=.5){
 if(enemy.boss)return {weapon_fragment:8,armor_fragment:8,ember_dust:6,boss_core:1,...((enemy.bossTier||1)===5?{dawn_essence:1}:{})};
 if(enemy.elite)return {weapon_fragment:3,armor_fragment:3,ember_dust:2};
 if(roll>=.4)return {};
 return {[(enemy.type||0)%2?'armor_fragment':'weapon_fragment']:1};
}
export function validSupplyRun(r){
 if(r.supplyCooldown!==undefined&&(!Number.isFinite(r.supplyCooldown)||r.supplyCooldown<0||r.supplyCooldown>8))return false;
 const buffs=r.supplyBuffs;
 return buffs===undefined||!!buffs&&typeof buffs==='object'&&!Array.isArray(buffs)&&Object.keys(buffs).every(k=>['fury_tonic','iron_tonic'].includes(k))&&Object.values(buffs).every(v=>Number.isFinite(v)&&v>=0&&v<=120);
}
export function consumeSupply(save,r,id){
 const item=CONSUMABLES.find(item=>item.id===id&&item.use==='battle');
 if(!r||r.hp<=0||!item||!validInventory(save.inventory)||save.inventory[id]<1)return{ok:false,reason:'empty'};
 if((r.supplyCooldown||0)>0)return{ok:false,reason:'cooldown'};
 if(id==='healing_potion'&&r.hp>=r.maxHp||id==='oil_flask'&&(!r.lantern||r.lantern.fuel>=100))return{ok:false,reason:'full'};
 if(['fury_tonic','iron_tonic'].includes(id)&&(r.supplyBuffs?.[id]||0)>0)return{ok:false,reason:'active'};
 save.inventory[id]--;r.supplyCooldown=8;
 if(id==='healing_potion')r.hp=Math.min(r.maxHp,r.hp+r.maxHp*.35);
 else if(id==='oil_flask'){const amount=Math.min(35,100-r.lantern.fuel);r.lantern.fuel+=amount;r.lantern.restored+=amount}
 else{r.supplyBuffs??={};r.supplyBuffs[id]=120}
 return{ok:true,item};
}
export function tickSupplies(r,dt){
 if(!r||r.paused)return;r.supplyCooldown=Math.max(0,(r.supplyCooldown||0)-dt);
 for(const id of Object.keys(r.supplyBuffs||{}))r.supplyBuffs[id]=Math.max(0,r.supplyBuffs[id]-dt);
}
