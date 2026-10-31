module.exports=function({t,check,bossScene,assert,fs,path,root,els}){
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
