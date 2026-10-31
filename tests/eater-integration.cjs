module.exports=function({t,check,reset,bossScene,els,fs,path,root,assert}){
 const finish=()=>{t.keys.clear();if(t.run)t.endRun(false,true);t.closeModal()};
 const scene=(mode='campaign')=>{const r=reset(mode);if(r.story){r.story.dialog=null;t.closeModal();r.story.unlocked=1;r.story.activeRoom=r.story.combatRoom=1;r.story.discovered=[0,1];Object.assign(r.story.rooms[1],{entered:true,briefed:true,fighting:true,waveSpawned:1});const b=t.storyRoomBoxes[1],p=t.storyFreePoint(r,1);r.x=p.x;r.y=p.y}r.paused=false;r.enemies=[];r.shots=[];r.hazards=[];r.bossFields=[];r.spawn=999;r.attack=999;r.invuln=0;r.shield=0;r.shrines=[];r.hp=r.maxHp=10000;r.xpNeed=1e9;return r};
 const eater=(r,offset=140)=>{const e=t.spawnEnemy(false,3,{archetype:'lantern-eater'});assert(e);e.x=r.x+offset;e.y=r.y;e.stun=0;e.speed=0;e.eater.cooldown=0;return e};
 const charge=(r,e)=>{t.update(.025);assert.equal(e.eater.state,'windup');assert.equal(e.eater.left,1.2)};
 check('Lantern Eaters spawn in all four modes and their warning cannot drain or damage health',()=>{
  for(const mode of ['campaign','story','endless','survival']){const r=scene(mode),e=eater(r);if(mode==='survival')r.director.nextAt=999;charge(r,e);const before=r.lantern.fuel;for(let i=0;i<20;i++)t.update(.05);assert.equal(e.eater.state,'windup');assert(Math.abs((before-r.lantern.fuel)-1)<1e-8);assert.equal(r.lantern.drained,0);assert.equal(r.hp,10000);assert.equal(e.name,'Lantern Eater');assert.equal(t.enemyArtId(e),'wisp');finish()}
 });
 check('all six hero class attacks can interrupt an actual charging Eater',()=>{
  for(const h of t.heroes){const r=scene();r.hero={...h};r.activeSkill=t.skillBook[h.classId][0][0];const w=t.weapons.find(w=>w.classId===h.classId&&w.tier===0);r.weapon=w;r.rate=.3;r.dmg=10;r.critChance=0;r.pierce=!!w.pierce;r.multi=w.multi||0;const e=eater(r,55);e.hp=e.maxHp=1000;charge(r,e);r.attack=0;
   for(let i=0;i<18&&e.eater.state==='windup';i++)t.update(.05);assert.equal(e.eater.state,'recover',h.id);assert.equal(e.eater.reason,'hit',h.id);assert.equal(r.lantern.drained,0);finish()}
 });
 check('dash shields Bright and leaving range cancel a live oil channel',()=>{
  for(const counter of ['dash','shield','bright','range']){const r=scene(),e=eater(r);charge(r,e);for(let i=0;i<26;i++)t.update(.05);assert.equal(e.eater.state,'channel');const before=r.lantern.drained;
   if(counter==='dash'){r.dashCd=0;t.dash()}if(counter==='shield')r.shield=2;if(counter==='bright')r.lantern.mode='bright';if(counter==='range')r.x-=80;t.update(.05);assert.equal(e.eater.state,'recover',counter);assert.equal(r.lantern.drained,before,counter);assert.equal(r.hp,10000);finish()}
 });
 check('solid Story gates stop a siphon without draining through cover',()=>{
  const r=scene('story'),e=eater(r);r.story.unlocked=0;r.story.rooms[1].fighting=false;r.x=740;r.y=375;e.x=880;e.y=375;e.eater.state='channel';e.eater.left=2;e.eater.cooldown=0;assert(!t.storyLineOfSight(r,e.x,e.y,r.x,r.y,2));t.update(.05);assert.equal(e.eater.state,'recover');assert.equal(e.eater.reason,'cover');assert.equal(r.lantern.drained,0);finish();
 });
 check('only one Eater can cast and the seeded spawner never exceeds two alive',()=>{
  const r=scene(),a=eater(r,100),b=eater(r,-100);assert.equal(t.spawnEnemy(false,3,{archetype:'lantern-eater'}),null);t.update(.05);assert.equal(a.eater.state,'windup');assert.equal(b.eater.state,'approach');for(let i=0;i<40;i++){t.update(.05);assert(r.enemies.filter(e=>['windup','channel'].includes(e.eater?.state)).length<=1)}finish();
 });
 check('pause and Continue preserve windup channel recovery fuel drain and HUD exactly',()=>{
  for(const state of ['windup','channel','recover']){const r=scene(),e=eater(r);charge(r,e);if(state==='channel')for(let i=0;i<26;i++)t.update(.05);if(state==='recover')t.hit(e,1);assert.equal(e.eater.state,state);const snapshot=t.packRun(r),before=JSON.stringify({e:e.eater,f:r.lantern});r.paused=true;t.update(.05);assert.equal(JSON.stringify({e:e.eater,f:r.lantern}),before);t.leaveToHome();assert(t.resumeRun(snapshot));const q=t.run,unit=q.enemies.find(e=>e.archetype==='lantern-eater');assert.equal(JSON.stringify(unit.eater),JSON.stringify(snapshot.state.enemies[0].eater));assert.equal(JSON.stringify(q.lantern),JSON.stringify(snapshot.state.lantern));t.update(.025);assert(unit.eater.left<e.eater.left||unit.eater.state!==e.eater.state);assert(t.validExpedition(t.packRun(q)));finish()}
 });
 check('killing a channeling Eater drops one 12-oil flask and cannot release a late siphon',()=>{
  const r=scene(),e=eater(r);charge(r,e);for(let i=0;i<26;i++)t.update(.05);t.hit(e,1e9);assert(e.hp<=0);assert(e.eater.rewarded);const drops=r.lantern.pickups.filter(p=>p.restore===12);assert.equal(drops.length,1);const before=r.lantern.drained;t.hit(e,1e9);t.update(.05);assert.equal(r.lantern.pickups.filter(p=>p.restore===12).length,1);assert.equal(r.lantern.drained,before);r.x=drops[0].x;r.y=drops[0].y;r.lantern.fuel=0;t.update(.05);assert.equal(r.lantern.fuel,12);assert.equal(r.hp,10000);finish();
 });
 check('corrupt channel and refill data is rejected while older saves without drain counters continue',()=>{
  const r=scene(),e=eater(r);charge(r,e);const data=t.packRun(r);for(const modify of [s=>s.state.enemies[0].eater.left=99,s=>s.state.enemies[0].eater.state='fake',s=>s.state.enemies[0].boss=true,s=>s.state.lantern.drained=-1,s=>s.state.lantern.pickups=[{id:1,x:100,y:100,life:20,restore:900}]]){const copy=JSON.parse(JSON.stringify(data));modify(copy);assert(!t.validExpedition(copy))}
  const old=t.packRun(r);delete old.state.lantern.drained;old.state.enemies=[];t.leaveToHome();assert(t.resumeRun(old));assert(t.validExpedition(t.packRun(t.run)));finish();
 });
 check('Eater warning channel and death visuals render without changing fuel or blocking subsequent frames',()=>{
  const r=scene(),e=eater(r);charge(r,e);t.updateHud();assert(els['#fuelThreatNotice'].textContent.includes('charging'));const before=r.lantern.fuel;t.draw(r.time);assert.equal(r.lantern.fuel,before);for(let i=0;i<26;i++)t.update(.05);t.updateHud();assert(els['#fuelThreatNotice'].textContent.includes('active'));t.draw(r.time);fs.writeFileSync(path.join(root,'tests/lantern-eater-field.png'),t.ctx.canvas.toBuffer('image/png'));const time=r.time;t.update(.05);assert(r.time>time);t.hit(e,1e9);t.draw(r.time);finish();
 });
};
