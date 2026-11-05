module.exports=({t,check,reset,assert})=>{
 const done=()=>{if(t.run)t.endRun(false,true);t.closeModal()};
 check('legacy equipment migrates to a starter cloak without losing currency or purchases',()=>{
  done();const old=t.fresh();old.gold=12345;delete old.armor;delete old.unlockedArmors;delete old.enhancements;
  const migrated=t.migrate(JSON.stringify(old));assert(t.validate(migrated));assert.equal(migrated.gold,12345);assert.equal(migrated.armor,'travel_cloak');assert(migrated.unlockedWeapons.includes('crook'));
  for(const bad of [{stars:8,awakened:false},{stars:6,awakened:true},{stars:-1,awakened:false},{stars:7,awakened:'yes'}]){const d=t.fresh();d.enhancements={'weapon:crook':bad};assert(!t.validate(d))}
  const d=t.fresh();d.armor='dawnward';assert(!t.validate(d));
 });
 check('all weapons and armor progress through seven stars then exactly one awakening',()=>{
  done();const d=t.fresh();d.gold=1e9;for(const key of Object.keys(d.inventory))d.inventory[key]=1000000;d.unlockedWeapons=t.weapons.map(w=>w.id);d.unlockedArmors=t.ARMORS.map(a=>a.id);
  for(const [kind,items] of [['weapon',t.weapons],['armor',t.ARMORS]])for(const item of items){
   let previous=kind==='weapon'?0:t.gearStats(kind,item,{stars:0,awakened:false}).hp;
   for(let step=1;step<=8;step++){const state=t.gearEnhancement(d,kind,item.id),cost=t.enhancementCost(item,state),gold=d.gold,result=t.enhanceGear(d,kind,item.id,t.weapons,{random:()=>0});assert(result.ok);assert.equal(d.gold,gold-cost);assert.equal(result.state.stars,Math.min(7,step));assert.equal(result.state.awakened,step===8);const stats=t.gearStats(kind,item,result.state),power=kind==='weapon'?stats.damageBonus:stats.hp;assert(power>previous);previous=power;}
   const gold=d.gold;assert(!t.enhanceGear(d,kind,item.id,t.weapons,{random:()=>0}).ok);assert.equal(d.gold,gold);
  }
  assert(t.validate(d));
  const poor=t.fresh();poor.gold=499;const before=JSON.stringify(poor);assert.equal(t.enhanceGear(poor,'weapon','crook',t.weapons).reason,'gold');assert.equal(JSON.stringify(poor),before);assert.equal(t.enhanceGear(poor,'armor','dawnward',t.weapons).reason,'unowned');assert(!t.enhanceGear(poor,'weapon','missing',t.weapons).ok);
 });
 check('armor purchases upgrades and equipment cannot spend gold during active expeditions',()=>{
  const r=reset();t.save.gold=1000000;const before=t.save.gold,armor=t.save.armor;t.equipArmor('iron_vest');t.equipmentEnhance('weapon','crook');assert.equal(t.save.gold,before);assert.equal(t.save.armor,armor);done();
  t.save=t.fresh();t.save.gold=3499;t.equipArmor('iron_vest');assert.equal(t.save.gold,3499);assert.equal(t.save.armor,'travel_cloak');t.save.gold=5000;t.equipArmor('iron_vest');assert.equal(t.save.gold,1500);assert.equal(t.save.armor,'iron_vest');t.equipArmor('travel_cloak');t.equipArmor('iron_vest');assert.equal(t.save.gold,1500);
 });
 check('enhanced armor and weapons change combat stats once and Continue retains the saved build',()=>{
  done();t.save=t.fresh();t.save.gold=1000000;for(const key of Object.keys(t.save.inventory))t.save.inventory[key]=1000000;t.equipArmor('iron_vest');for(let i=0;i<8;i++){t.equipmentEnhance('weapon','crook',{random:()=>0});t.equipmentEnhance('armor','iron_vest',{random:()=>0})}
  t.chosenMode='campaign';t.startRun();const r=t.run,ws=t.gearEnhancement(t.save,'weapon','crook'),as=t.gearEnhancement(t.save,'armor','iron_vest'),a=t.ARMORS.find(a=>a.id==='iron_vest'),w=t.weapons.find(w=>w.id==='crook');
  assert.equal(r.maxHp,r.hero.hp+t.gearStats('armor',a,as).hp);assert.equal(r.dmg,r.hero.dmg+w.dmg+t.gearStats('weapon',w,ws).damageBonus);assert.equal(r.damageReduce,t.gearStats('armor',a,as).reduction);assert(r.gearSnapshot.weaponUpgrade.awakened);assert(t.validExpedition(t.packRun(r)));
  const before={hp:r.maxHp,damage:r.dmg,armor:r.damageReduce};t.leaveToHome();t.save.armor='travel_cloak';assert(t.resumeRun());assert.equal(t.run.maxHp,before.hp);assert.equal(t.run.dmg,before.damage);assert.equal(t.run.damageReduce,before.armor);assert.equal(t.run.gearSnapshot.armorId,'iron_vest');done();
 });
};
