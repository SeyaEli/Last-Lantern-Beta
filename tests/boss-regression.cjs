module.exports=function({t,check,bossScene,assert,fs,path,root,els}){
 check('boss warning and impact art stays deterministic at every phase for all sixty skills',()=>{
  const {createCanvas}=require('@napi-rs/canvas'),crypto=require('node:crypto');
  const sheet=createCanvas(800,1500),g=sheet.getContext('2d'),gallery=createCanvas(1260,1160),gg=gallery.getContext('2d'),shown=new Set();
  for(let chapter=1;chapter<=6;chapter++)for(let tier=1;tier<=5;tier++)for(let slot=0;slot<2;slot++){
   const {r,e}=bossScene(chapter,tier);r.time=1;r.combatFx=[];assert(t.beginBossSkill(e,r,slot));
   const hash=()=>crypto.createHash('sha256').update(t.ctx.getImageData(0,0,800,500).data).digest('hex');
   for(const progress of [0,.5,.98]){
    e.bossCast.left=e.bossCast.total*(1-progress);
    const before=JSON.stringify(e.bossCast),paint=()=>{t.ctx.clearRect(0,0,800,500);t.ctx.save();t.ctx.translate(400-e.x,250-e.y);t.drawBossSkillEffects(t.ctx,r,r.time);t.ctx.restore()};
    paint();const first=hash();paint();assert.equal(hash(),first);assert.equal(JSON.stringify(e.bossCast),before);
   }
   if(tier===1&&slot===0){t.draw(r.time);g.drawImage(t.ctx.canvas,0,(chapter-1)*250,400,250)}
   t.releaseBossSkill(e,r);
   for(const progress of [0,.35,.85]){
    for(const f of r.bossFields)f.t=f.max*(1-progress);for(const f of r.combatFx)f.age=f.life*progress;
    const before=JSON.stringify({fields:r.bossFields,fx:r.combatFx,shots:r.shots,hp:r.hp});
    const paint=()=>{t.ctx.clearRect(0,0,800,500);t.ctx.save();t.ctx.translate(400-e.x,250-e.y);t.drawCombatBossForeground(t.ctx,r);t.drawCombatEffects(t.ctx,r);t.drawCombatProjectiles(t.ctx,r);t.ctx.restore()};
    paint();const first=hash();paint();assert.equal(hash(),first,'paused impact stays still');
    assert.equal(JSON.stringify({fields:r.bossFields,fx:r.combatFx,shots:r.shots,hp:r.hp}),before,'effects do not mutate combat');
   }
   if(tier===1&&slot===0){for(const f of r.bossFields)f.t=f.max*.65;for(const f of r.combatFx)f.age=f.life*.35;t.draw(r.time);g.drawImage(t.ctx.canvas,400,(chapter-1)*250,400,250);if(chapter===1)fs.writeFileSync(path.join(root,'tests/boss-premium-forest.png'),t.ctx.canvas.toBuffer('image/png'))}
   const skill=t.bossProfile(e).skills[slot];
   if(!shown.has(skill.kind)){
    const cell=shown.size,x=cell%3*420,y=Math.floor(cell/3)*290;shown.add(skill.kind);
    for(const f of r.bossFields)f.t=f.max*.65;for(const f of r.combatFx)f.age=f.life*.35;
    for(const s of r.shots){s.x+=s.vx*.25;s.y+=s.vy*.25}
    t.draw(r.time);gg.fillStyle='#101c22';gg.fillRect(x,y,420,290);gg.fillStyle='#ecedd9';gg.font='14px Georgia';gg.fillText(skill.name+' / '+skill.kind,x+12,y+20);gg.drawImage(t.ctx.canvas,110,25,560,350,x,y+27,420,262.5);
   }
   t.endRun(false,true);t.closeModal();
  }
  fs.writeFileSync(path.join(root,'tests/boss-premium-realms.png'),sheet.toBuffer('image/png'));
  assert.equal(shown.size,12);fs.writeFileSync(path.join(root,'tests/boss-all-skill-visuals.png'),gallery.toBuffer('image/png'));
 });
 check('boss rushes emit themed wakes at normal frame rates and stop emitting after death',()=>{
  const {r,e}=bossScene(1,1);r.combatFx=[];assert(t.beginBossSkill(e,r,1));t.releaseBossSkill(e,r);assert(e.bossDash);
  const before={x:e.x,y:e.y};t.tickBossDash(e,r,1/60);assert(Math.hypot(e.x-before.x,e.y-before.y)>2);
  const wake=r.combatFx.find(f=>f.kind==='bossWake');assert(wake);assert.equal(wake.owner,e.bossSkillId);assert.equal(wake.theme,'thorn');
  const age=wake.age;r.paused=true;t.update(1/60);assert.equal(wake.age,age);r.paused=false;t.hit(e,1e12);t.updateWorld(r,.02);assert(!r.combatFx.some(f=>f.owner===e.bossSkillId));t.endRun(false,true);t.closeModal();
 });
 check('Briar Quake has distinct cast gather eruption and recovery silhouettes',()=>{
  const {createCanvas}=require('@napi-rs/canvas'),sheet=createCanvas(1600,1000),g=sheet.getContext('2d'),{r,e}=bossScene(1,1),hashes=new Set();
  r.time=1;r.combatFx=[];assert(t.beginBossSkill(e,r,0));
  for(let frame=0;frame<4;frame++){
   if(frame<2)e.bossCast.left=e.bossCast.total*(frame===0?.7:.1);
   else{if(frame===2)t.releaseBossSkill(e,r);const p=frame===2?.35:.8;for(const f of r.bossFields)f.t=f.max*(1-p);for(const f of r.combatFx)f.age=f.life*p}
   t.draw(r.time);g.drawImage(t.ctx.canvas,frame%2*800,Math.floor(frame/2)*500);
   hashes.add(require('node:crypto').createHash('sha256').update(t.ctx.getImageData(0,0,800,500).data).digest('hex'));
  }
  assert.equal(hashes.size,4);fs.writeFileSync(path.join(root,'tests/boss-briar-sequence.png'),sheet.toBuffer('image/png'));t.endRun(false,true);t.closeModal();
 });
 check('all thirty bosses render their interrupted stagger guard without throwing or mutating casts',()=>{
  for(let chapter=1;chapter<=6;chapter++)for(let tier=1;tier<=5;tier++){
   const {r,e}=bossScene(chapter,tier,'story');e.stun=2;
   t.update(.025);assert(e.bossStaggerGuard>0);assert(e.bossStunLeft>0);const cast=e.cast;
   t.draw(r.time);assert.equal(e.cast,cast);
   for(let i=0;i<30;i++)t.update(.025);assert.equal(e.bossStunLeft,0);assert(r.time>.7);assert(!r.paused);
   t.endRun(false,true);t.closeModal();
  }
 });
 check('forest milestone bosses use forest art rather than quarry or frost placeholders',()=>{
  for(let tier=1;tier<=5;tier++){const {r,e}=bossScene(1,tier);const id=t.enemyArtId(e);assert(['king','wisp','bat'].includes(id)||id.startsWith('enemy1_'),tier+': '+id);assert(t.spriteImages[id]?.loaded);t.endRun(false,true);t.closeModal()}
 });
 check('a staggered Story boss survives Continue and Map/Quest dialogs resume both actors',()=>{
  const {r,e}=bossScene(1,1,'story');r.attack=999;r.spawn=999;e.stun=2;t.update(.025);const guard=e.bossStaggerGuard;t.draw(r.time);t.leaveToHome();assert(t.resumeRun());const q=t.run,boss=q.enemies.find(e=>e.boss);assert.equal(boss.bossStaggerGuard,guard);
  for(const overlay of ['map','log']){t.storyOverlay(overlay);assert(q.paused);els['#modalActions'].children[0].click();assert(!q.paused);const before=q.time;t.keys.add('s');t.update(.025);t.keys.clear();t.draw(q.time);assert(q.time>before)}
  for(let i=0;i<40;i++)t.update(.025);assert.equal(boss.bossStunLeft,0);t.endRun(false,true);t.closeModal();
 });
 check('the first Story boss continues simulating and rendering after a Sunburst interruption',()=>{
  const {r,e}=bossScene(1,1,'story');r.hp=r.maxHp=100000;r.invuln=0;r.xpNeed=1e9;r.spawn=999;r.attack=999;r.enemies=[e];
  r.x=e.x-90;r.y=e.y;e.stun=2;e.bossSkillCd=0;
  const start=r.time;
  for(let i=0;i<420;i++){
   if(i%60===0){r.skillCd=0;t.skill()}
   t.keys.clear();t.keys.add(i%80<40?'s':'w');
   try{t.update(.025);t.draw(r.time)}catch(error){throw new Error('Boss frame '+i+' time '+r.time+' state '+JSON.stringify({cast:e.bossCast,stun:e.stun,recovery:e.bossRecovery,guard:e.bossStaggerGuard})+'\n'+error.stack)}
   assert(!r.paused,'no unexplained pause at frame '+i);assert.equal(t.run,r);
  }
  t.keys.clear();assert(r.time>start+10);assert(e.bossStaggerGuard<3.6);fs.writeFileSync(path.join(root,'tests/boss-regression.png'),t.ctx.canvas.toBuffer('image/png'));t.endRun(false,true);t.closeModal();
 });
};
