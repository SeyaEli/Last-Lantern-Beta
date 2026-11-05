module.exports=({t,check,reset,assert})=>{
 const done=()=>{if(t.run)t.endRun(false,true);t.closeModal()};
 const field=()=>{const r=reset();Object.assign(r,{enemies:[],shots:[],hazards:[],bossFields:[],attack:999,spawn:999,hp:500,maxHp:1000,invuln:0,shield:0,regen:0,damageReduce:0,critChance:0,xpNeed:1e9});t.keys.clear();return r};
 check('old saves get a starter pack once and preserve existing stars gold and recipes',()=>{
  done();const d=t.fresh();d.gold=20000;d.enhancements={'weapon:crook':{stars:4,awakened:false}};delete d.inventory;delete d.forgePity;
  const migrated=t.migrate(JSON.stringify(d));assert(t.validate(migrated));assert.equal(migrated.inventory.healing_potion,2);assert.equal(migrated.gold,20000);assert.equal(migrated.enhancements['weapon:crook'].stars,4);
  migrated.inventory.healing_potion=0;assert.equal(t.migrate(JSON.stringify(migrated)).inventory.healing_potion,0);
 });
 check('forge failures persist spent gold materials and pity while preserving earned stars',()=>{
  done();t.save=t.fresh();t.save.gold=100000;for(const key of Object.keys(t.save.inventory))t.save.inventory[key]=100;
  t.save.enhancements={'weapon:crook':{stars:6,awakened:false}};const gold=t.save.gold,materials=t.save.inventory.weapon_fragment;
  const result=t.equipmentEnhance('weapon','crook',{random:()=>.99});assert.equal(result.reason,'failed');assert(t.save.gold<gold);assert(t.save.inventory.weapon_fragment<materials);assert.equal(t.save.enhancements['weapon:crook'].stars,6);
  const copy=t.migrate(JSON.stringify(t.save));assert(t.validate(copy));assert.equal(copy.forgePity['weapon:crook'],1);assert.equal(t.enhancementChance(copy,'weapon','crook'),.35);done();
 });
 check('supply purchases are atomic and blocked during active expeditions',()=>{
  const r=field();t.save.gold=10000;const before=JSON.stringify(t.save.inventory);assert(!t.purchaseSupply('healing_potion'));assert.equal(JSON.stringify(t.save.inventory),before);done();
  t.save=t.fresh();t.save.gold=250;assert(t.purchaseSupply('healing_potion'));assert.equal(t.save.gold,0);assert.equal(t.save.inventory.healing_potion,3);assert(!t.purchaseSupply('oil_flask'));assert.equal(t.save.inventory.oil_flask,1);
 });
 check('potion use persists immediately and Continue preserves cooldowns without duplicating items',()=>{
  const r=field();t.save.inventory.healing_potion=2;assert(t.useBattleSupply('healing_potion').ok);assert.equal(r.hp,850);assert.equal(t.save.inventory.healing_potion,1);assert.equal(t.useBattleSupply('healing_potion').reason,'cooldown');
  r.paused=true;t.update(.05);assert.equal(r.supplyCooldown,8);r.paused=false;t.leaveToHome();assert(t.resumeRun());assert.equal(t.run.supplyCooldown,8);assert.equal(t.save.inventory.healing_potion,1);assert(t.validExpedition(t.packRun(t.run)));done();
 });
 check('tonics alter accepted damage once and their active clock survives Continue',()=>{
  const r=field();t.save.inventory.fury_tonic=1;assert(t.useBattleSupply('fury_tonic').ok);t.spawnEnemy(false,0);const e=r.enemies[0];e.x=r.x+80;e.y=r.y;e.hp=e.maxHp=10000;e.speed=0;e.spawnGrace=0;e.stun=999;t.hit(e,100);assert.equal(e.hp,9885);
  r.supplyCooldown=0;t.save.inventory.iron_tonic=1;assert(t.useBattleSupply('iron_tonic').ok);r.damageReduce=.2;r.invuln=0;r.hp=500;assert(t.damagePlayer(r,100,'contact'));assert.equal(r.hp,435);assert.equal(r.damageReduce,.2);
  t.leaveToHome();assert(t.resumeRun());assert.equal(t.run.supplyBuffs.iron_tonic,120);assert.equal(t.run.supplyBuffs.fury_tonic,120);t.update(.05);assert(t.run.supplyBuffs.fury_tonic<120);assert(t.validExpedition(t.packRun(t.run)));done();
 });
 check('boss material rewards occur once and final bosses grant awakening essence',()=>{
  const r=field();t.spawnEnemy(true);const e=r.enemies[0];e.bossTier=5;const cores=t.save.inventory.boss_core,essence=t.save.inventory.dawn_essence;t.hit(e,1e12,true);assert.equal(t.save.inventory.boss_core,cores+1);assert.equal(t.save.inventory.dawn_essence,essence+1);t.hit(e,1e12,true);assert.equal(t.save.inventory.boss_core,cores+1);assert(t.validate(t.save));done();
 });
 check('Mimic copies cannot be farmed for forge materials',()=>{
  const r=field();const before=JSON.stringify(t.save.inventory);const echo={hp:1,maxHp:1,x:r.x+30,y:r.y,size:11,archetype:'mimic-decoy',type:3};t.hit(echo,100);assert.equal(echo.hp,0);assert.equal(JSON.stringify(t.save.inventory),before);done();
 });
};
