import assert from 'node:assert/strict';
import {emptyInventory,normalizeSupplies,validInventory,buySupply,consumeSupply,tickSupplies,materialRewards,validSupplyRun} from '../src/systems/supplies.mjs';
import {normalizeGearSave,enhanceGear,gearEnhancement,enhancementRecipe,enhancementChance,validGearSave} from '../src/systems/equipment.mjs';
const weapons=[{id:'test',tier:0,dmg:10}],fresh=()=>normalizeGearSave({gold:1e7,unlockedWeapons:['test'],enhancements:{},armor:'travel_cloak',unlockedArmors:['travel_cloak']});
const stock=d=>{for(const id of Object.keys(d.inventory))d.inventory[id]=10000;return d};
let d=stock(fresh());
assert(enhanceGear(d,'weapon','test',weapons,{random:()=>.999}).ok,'first star is guaranteed');
let before={...d.inventory},gold=d.gold;const failed=enhanceGear(d,'weapon','test',weapons,{random:()=>.99});
assert.equal(failed.reason,'failed');assert(failed.attempted);assert.equal(gearEnhancement(d,'weapon','test').stars,1);assert.equal(d.gold,gold-failed.cost);
for(const[id,n]of Object.entries(failed.recipe))assert.equal(d.inventory[id],before[id]-n);
assert.equal(d.forgePity['weapon:test'],1);assert.equal(enhancementChance(d,'weapon','test'),1);assert.equal(enhancementChance(d,'armor','travel_cloak'),1);
d.enhancements['weapon:test']={stars:7,awakened:false};d.forgePity={};
before={...d.inventory};gold=d.gold;const protectedFail=enhanceGear(d,'weapon','test',weapons,{random:()=>.99,ward:true,catalyst:true});
assert(protectedFail.protectedFailure);assert.equal(d.inventory.boss_core,before.boss_core);assert.equal(d.inventory.weapon_fragment,before.weapon_fragment);assert.equal(d.inventory.dawn_essence,before.dawn_essence);assert.equal(d.inventory.preservation_ward,before.preservation_ward-1);assert.equal(d.inventory.forge_catalyst,before.forge_catalyst-1);assert.equal(d.gold,gold-protectedFail.cost);
for(let i=1;i<5;i++)assert(!enhanceGear(d,'weapon','test',weapons,{random:()=>.999}).ok);
assert.equal(d.forgePity['weapon:test'],5);assert.equal(enhancementChance(d,'weapon','test'),1);assert(enhanceGear(d,'weapon','test',weapons,{random:()=>.999,ward:true}).ok);assert(gearEnhancement(d,'weapon','test').awakened);assert.equal(d.forgePity['weapon:test'],undefined);
d=fresh();d.inventory.weapon_fragment=0;const serialized=JSON.stringify(d);assert.equal(enhanceGear(d,'weapon','test',weapons).reason,'materials');assert.equal(JSON.stringify(d),serialized);
d=stock(fresh());const s=JSON.stringify(d);assert.equal(enhanceGear(d,'weapon','test',weapons,{random:()=>NaN}).reason,'random');assert.equal(JSON.stringify(d),s);
assert(validGearSave(d,weapons));for(const value of [-1,1.5,Infinity,1e10]){const bad=structuredClone(d);bad.inventory.healing_potion=value;assert(!validGearSave(bad,weapons))}
for(const pity of [6,-1,1.5]){const bad=structuredClone(d);bad.forgePity={'weapon:test':pity};assert(!validGearSave(bad,weapons))}
assert(enhancementRecipe('weapon',weapons[0],{stars:7,awakened:false}).dawn_essence===1);
const legacy={gold:999};normalizeSupplies(legacy);assert.equal(legacy.inventory.healing_potion,2);legacy.inventory.healing_potion=0;normalizeSupplies(legacy);assert.equal(legacy.inventory.healing_potion,0);
d=fresh();gold=d.gold;assert(buySupply(d,'healing_potion'));assert.equal(d.gold,gold-250);assert.equal(d.inventory.healing_potion,3);assert(!buySupply(d,'boss_core'));
let r={hp:20,maxHp:100,lantern:{fuel:20,restored:0},supplyBuffs:{},paused:false};
assert(consumeSupply(d,r,'healing_potion').ok);assert.equal(r.hp,55);assert.equal(consumeSupply(d,r,'oil_flask').reason,'cooldown');r.paused=true;tickSupplies(r,8);assert.equal(r.supplyCooldown,8);r.paused=false;tickSupplies(r,8);assert(consumeSupply(d,r,'oil_flask').ok);assert.equal(r.lantern.fuel,55);assert.equal(r.lantern.restored,35);
d.inventory.fury_tonic=1;tickSupplies(r,8);assert(consumeSupply(d,r,'fury_tonic').ok);assert.equal(r.supplyBuffs.fury_tonic,120);tickSupplies(r,8);assert.equal(consumeSupply(d,r,'fury_tonic').reason,'empty');tickSupplies(r,112);assert.equal(r.supplyBuffs.fury_tonic,0);assert(validSupplyRun(r));assert(!validSupplyRun({...r,supplyBuffs:{fury_tonic:121}}));
assert.deepEqual(materialRewards({boss:true,bossTier:5}),{weapon_fragment:8,armor_fragment:8,ember_dust:6,boss_core:1,dawn_essence:1});assert(!materialRewards({boss:true,bossTier:4}).dawn_essence);assert.deepEqual(materialRewards({type:0},.9),{});assert.equal(materialRewards({type:0},.1).weapon_fragment,1);assert(materialRewards({elite:true}).armor_fragment>0);assert(validInventory(emptyInventory()));
console.log('Forge failure, recipes, pity, protection, purchases, inventory migration, consumables and buff-clock checks passed.');
