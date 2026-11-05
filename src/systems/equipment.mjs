import {normalizeSupplies,validInventory} from './supplies.mjs';
export const ARMORS=Object.freeze([
 {id:'travel_cloak',name:'Traveler’s Cloak',tier:0,cost:0,hp:0,reduction:0,description:'A weathered cloak for the first steps beyond camp.'},
 {id:'iron_vest',name:'Ironbound Vest',tier:0,cost:3500,hp:20,reduction:.03,description:'Riveted plates that soften the first blows of the night.'},
 {id:'briar_coat',name:'Briarwarden Coat',tier:1,cost:18000,hp:40,reduction:.06,description:'Woven bark and thornsteel, tempered in the Whispering Woods.'},
 {id:'moonweave',name:'Moonweave Mantle',tier:2,cost:65000,hp:60,reduction:.08,description:'Silver-threaded fabric that holds the cold at bay.'},
 {id:'warden_plate',name:'Warden’s Plate',tier:3,cost:180000,hp:90,reduction:.12,description:'Citadel armor reforged for a keeper of the light.'},
 {id:'dawnward',name:'Dawnward Regalia',tier:4,cost:450000,hp:130,reduction:.15,description:'The last dawn preserved in a suit of gilded armor.'}
]);
const COSTS=[500,1000,2000,3500,5500,8000,12000,25000];
export const emptyEnhancement=()=>({stars:0,awakened:false});
export function validEnhancement(value){return !!value&&Number.isInteger(value.stars)&&value.stars>=0&&value.stars<=7&&typeof value.awakened==='boolean'&&(!value.awakened||value.stars===7)&&Object.keys(value).every(k=>['stars','awakened'].includes(k));}
export function gearItem(kind,id,weapons){return (kind==='weapon'?weapons:kind==='armor'?ARMORS:[]).find(item=>item.id===id);}
export function gearOwned(save,kind,id){return (kind==='weapon'?save.unlockedWeapons:kind==='armor'?save.unlockedArmors:[])?.includes(id)||false;}
export function gearEnhancement(save,kind,id){const value=save.enhancements?.[kind+':'+id];return validEnhancement(value)?{...value}:emptyEnhancement();}
export function nextEnhancement(value){if(!validEnhancement(value)||value.awakened)return null;return value.stars<7?{stars:value.stars+1,awakened:false}:{stars:7,awakened:true};}
export function enhancementCost(item,state){return state.awakened?0:Math.round(COSTS[state.stars]*(1+(item.tier||0)*.5));}
export function enhancementRecipe(kind,item,state){
 if(state.awakened)return {};
 const n=state.stars,recipe={[kind==='weapon'?'weapon_fragment':'armor_fragment']:[4,7,11,16,23,32,44,60][n]};
 const dust=[0,1,2,3,5,8,12,18][n];if(dust)recipe.ember_dust=dust;
 if(n>=4)recipe.boss_core=Math.ceil((n-3)/2);
 if(n===7)recipe.dawn_essence=1;
 return recipe;
}
export function enhancementChance(save,kind,id,options={}){
 const state=gearEnhancement(save,kind,id);if(state.awakened)return 0;
 const failures=save.forgePity?.[kind+':'+id]||0;
 return failures>=5?1:Math.min(1,[1,.9,.8,.65,.5,.35,.25,.2][state.stars]+failures*.1+(options.catalyst?.15:0));
}
export function gearStats(kind,item,state=emptyEnhancement()){
 const factor=1+state.stars*.08+(state.awakened?.25:0);
 if(kind==='weapon')return{damageBonus:Math.round(Math.max(8,item.dmg||0)*(factor-1))+state.stars+(state.awakened?3:0)};
 return{hp:Math.round(item.hp*factor+state.stars*5+(state.awakened?30:0)),reduction:Math.min(.35,item.reduction*factor)};
}
export function normalizeGearSave(save){
 if(save.armor===undefined)save.armor='travel_cloak';
 if(save.unlockedArmors===undefined)save.unlockedArmors=['travel_cloak'];
 if(save.enhancements===undefined)save.enhancements={};
 if(save.forgePity===undefined)save.forgePity={};
 normalizeSupplies(save);
 return save;
}
export function validGearSave(save,weapons){
 if(!validInventory(save.inventory)||!save.forgePity||typeof save.forgePity!=='object'||Array.isArray(save.forgePity)||Object.keys(save.forgePity).length>weapons.length+ARMORS.length)return false;
 if(!Object.entries(save.forgePity).every(([key,n])=>{const[kind,id,...extra]=key.split(':');return !extra.length&&!!gearItem(kind,id,weapons)&&gearOwned(save,kind,id)&&Number.isInteger(n)&&n>=0&&n<=5}))return false;
 if(!ARMORS.some(a=>a.id===save.armor)||!Array.isArray(save.unlockedArmors)||!save.unlockedArmors.includes('travel_cloak')||!save.unlockedArmors.includes(save.armor)||new Set(save.unlockedArmors).size!==save.unlockedArmors.length||save.unlockedArmors.some(id=>!ARMORS.some(a=>a.id===id)))return false;
 if(!save.enhancements||typeof save.enhancements!=='object'||Array.isArray(save.enhancements)||Object.keys(save.enhancements).length>weapons.length+ARMORS.length)return false;
 return Object.entries(save.enhancements).every(([key,state])=>{const [kind,id,...extra]=key.split(':');return !extra.length&&!!gearItem(kind,id,weapons)&&gearOwned(save,kind,id)&&validEnhancement(state);});
}
export function enhanceGear(save,kind,id,weapons,options={}){
 const item=gearItem(kind,id,weapons);if(!item||!gearOwned(save,kind,id))return{ok:false,reason:'unowned'};
 const current=gearEnhancement(save,kind,id),next=nextEnhancement(current);if(!next)return{ok:false,reason:'maximum'};
 const cost=enhancementCost(item,current);if(!Number.isSafeInteger(save.gold)||save.gold<cost)return{ok:false,reason:'gold'};
 const recipe=enhancementRecipe(kind,item,current);
 if(!validInventory(save.inventory)||Object.entries(recipe).some(([id,n])=>save.inventory[id]<n))return{ok:false,reason:'materials'};
 const useCatalyst=!!options.catalyst&&enhancementChance(save,kind,id)<1;
 if(useCatalyst&&save.inventory.forge_catalyst<1||options.ward&&save.inventory.preservation_ward<1)return{ok:false,reason:'support'};
 const chance=enhancementChance(save,kind,id,{catalyst:useCatalyst}),roll=(options.random||Math.random)();
 if(!Number.isFinite(roll)||roll<0||roll>=1)return{ok:false,reason:'random'};
 const success=roll<chance,key=kind+':'+id,protectedFailure=!success&&!!options.ward;
 save.gold-=cost;if(useCatalyst)save.inventory.forge_catalyst--;
 if(protectedFailure)save.inventory.preservation_ward--;else for(const[id,n]of Object.entries(recipe))save.inventory[id]-=n;
 save.enhancements??={};save.forgePity??={};
 if(success){save.enhancements[key]=next;delete save.forgePity[key]}else save.forgePity[key]=Math.min(5,(save.forgePity[key]||0)+1);
 return{ok:success,attempted:true,reason:success?'success':'failed',cost,recipe,chance,protectedFailure,state:success?next:current,failures:save.forgePity[key]||0};
}
export function buyArmor(save,id){
 const item=ARMORS.find(a=>a.id===id);if(!item)return false;
 if(!save.unlockedArmors.includes(id)){if(save.gold<item.cost||(save.chapterUnlocked||1)<Math.max(1,item.tier+1))return false;save.gold-=item.cost;save.unlockedArmors.push(id);}
 save.armor=id;return true;
}
