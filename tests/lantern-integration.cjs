module.exports=function({t,check,reset,els,fs,path,root,assert}){
 check('the actual Wisp movement loop slows inside light and accelerates outside on low fuel',()=>{
  const r=reset();r.enemies=[];r.spawn=999;r.attack=999;r.hp=r.maxHp=100000;r.xpNeed=1e9;
  t.spawnEnemy(false,0);const e=r.enemies[0];e.speed=40;e.stun=0;e.traitCd=999;e.x=r.x+100;e.y=r.y;
  let start=e.x;t.update(.05);assert(Math.abs((start-e.x)-1.44)<.001);assert.equal(e.speed,40);
  e.x=r.x+200;e.y=r.y;r.lantern.fuel=20;start=e.x;t.update(.05);assert(Math.abs((start-e.x)-2.36)<.001);assert.equal(e.speed,40);
  t.endRun(false,true);t.closeModal();
 });
 check('lantern fuel freezes during pause and mode changes respect paused state',()=>{
  const r=reset();r.enemies=[];r.spawn=999;r.attack=999;r.hp=r.maxHp=100000;r.xpNeed=1e9;
  t.update(.05);assert(r.lantern.fuel<100);const before=JSON.stringify(r.lantern);r.paused=true;
  for(let i=0;i<20;i++)t.update(.05);t.changeLanternMode();assert.equal(JSON.stringify(r.lantern),before);
  r.paused=false;t.changeLanternMode();assert.equal(r.lantern.mode,'bright');assert.equal(els['#lanternFuel'].value,r.lantern.fuel);
  t.endRun(false,true);t.closeModal();
 });
 check('legacy expeditions gain a full lantern and malformed new states cannot replace progress',()=>{
  const r=reset(),legacy=t.packRun(r);delete legacy.state.lantern;t.leaveToHome();assert(t.validExpedition(legacy));assert(t.resumeRun(legacy));assert.equal(t.run.lantern.fuel,100);
  const bad=t.packRun(t.run);bad.state.lantern.fuel=101;assert(!t.validExpedition(bad));t.endRun(false,true);t.closeModal();
 });
 check('fuel modes and uncollected flasks resume exactly and fresh expeditions reset resource state',()=>{
  const r=reset();r.lantern.fuel=32;r.lantern.mode='dim';r.lantern.serial=1;r.lantern.pickups=[{id:1,x:r.x+40,y:r.y,life:25}];
  const expected=JSON.stringify(r.lantern);t.leaveToHome();assert(t.resumeRun());assert.equal(JSON.stringify(t.run.lantern),expected);
  t.endRun(false,true);t.closeModal();const q=reset();assert.equal(q.lantern.fuel,100);assert.equal(q.lantern.mode,'normal');assert.equal(q.lantern.pickups.length,0);t.endRun(false,true);t.closeModal();
 });
 check('oil candidates on every Story map are reachable and remain outside cover danger and enemies',()=>{
  const r=reset();r.mode='story';for(let ch=1;ch<=6;ch++){r.chapter=ch;t.setupChapter(r);r.enemies=[];
   for(let stage=0;stage<6;stage++){r.story.discovered=[0,1,2,3,4,5];r.story.unlocked=5;r.story.activeRoom=stage;r.story.rooms.forEach(x=>x.fighting=false);const p=t.storyFreePoint(r,stage);r.x=p.x;r.y=p.y;r.lantern.pickups=[];r.lantern.pickupClock=19.99;t.updateCarriedLantern(r,.05);assert.equal(r.lantern.pickups.length,1,'map '+ch+' room '+stage);const oil=r.lantern.pickups[0];assert(!t.storySolid(r,oil.x,oil.y,12));assert(t.storyLineOfSight(r,r.x,r.y,oil.x,oil.y,12));}
  }r.hazards=[{x:r.x,y:r.y,radius:500,struck:false}];r.lantern.pickups=[];r.lantern.pickupClock=19.99;t.updateCarriedLantern(r,.05);assert.equal(r.lantern.pickups.length,0);
  r.hazards=[];r.bossFields=[{shape:'circle',x:r.x,y:r.y,radius:500}];r.lantern.pickupClock=19.99;t.updateCarriedLantern(r,.05);assert.equal(r.lantern.pickups.length,0);
  r.bossFields=[];r.enemies=[{x:r.x,y:r.y,size:500,hp:100}];r.lantern.pickupClock=19.99;t.updateCarriedLantern(r,.05);assert.equal(r.lantern.pickups.length,0);t.endRun(false,true);t.closeModal();
 });
 check('zero fuel does not damage or disable combat and a nearby flask restores light once',()=>{
  const r=reset();r.enemies=[];r.spawn=999;r.attack=999;r.hp=r.maxHp=100000;r.xpNeed=1e9;r.lantern.fuel=0;
  const x=r.x;t.keys.add('d');for(let i=0;i<20;i++)t.update(.05);t.keys.clear();assert(r.x>x);assert.equal(r.hp,100000);assert.equal(t.run,r);
  r.skillCd=0;t.skill();assert(r.skillCd>0);r.dashCd=0;t.dash();assert(r.dashTime>0);
  r.lantern.serial=1;r.lantern.pickups=[{id:1,x:r.x,y:r.y,life:20}];t.updateCarriedLantern(r,.05);assert.equal(r.lantern.fuel,25);assert.equal(r.lantern.collected,1);t.updateCarriedLantern(r,.05);assert.equal(r.lantern.collected,1);
  t.draw(r.time);fs.writeFileSync(path.join(root,'tests/lantern-field.png'),t.ctx.canvas.toBuffer('image/png'));
  t.endRun(false,true);t.closeModal();
 });
};
