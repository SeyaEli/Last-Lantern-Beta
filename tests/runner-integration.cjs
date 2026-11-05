module.exports=function({t,check,reset,els,fs,path,root,assert}){
 const finish=()=>{t.keys.clear();if(t.run)t.endRun(false,true);t.closeModal()};
 const scene=(mode='campaign')=>{const r=reset(mode);if(r.story){r.story.dialog=null;t.closeModal();r.story.unlocked=1;r.story.activeRoom=r.story.combatRoom=1;r.story.discovered=[0,1];Object.assign(r.story.rooms[1],{entered:true,briefed:true,fighting:true,waveSpawned:1});const p=t.storyFreePoint(r,1);r.x=p.x;r.y=p.y}else{r.x=400;r.y=350}
  r.paused=false;r.enemies=[];r.shots=[];r.hazards=[];r.bossFields=[];r.spawn=999;r.attack=999;r.regen=0;r.invuln=0;r.shield=0;r.damageReduce=0;r.shrines=[];r.hp=r.maxHp=10000;r.xpNeed=1e9;if(r.director&&mode==='survival')r.director.nextAt=999;return r};
 const runner=(r,offset=70)=>{const e=t.spawnEnemy(false,1);assert(e);e.x=r.x+offset;e.y=r.y;e.stun=0;e.spawnGrace=0;e.runner.cooldown=0;return e};
 const charge=(r,e)=>{t.update(.025);assert.equal(e.runner.state,'windup');assert.equal(e.runner.left,.65)};
 check('runner rushes have a full warning and at most one hit in all modes and chapter identities',()=>{
  for(const mode of ['campaign','story','endless','survival'])for(let chapter=1;chapter<=6;chapter++){
   const r=scene(mode);r.chapter=chapter;const e=runner(r);assert.equal(e.name,t.chapters[chapter-1].family[1]);charge(r,e);const x=e.x,hp=r.hp;
   for(let i=0;i<13;i++)t.update(.05);assert.equal(e.x,x);assert.equal(r.hp,hp);assert.equal(e.runner.state,'charge');
   for(let i=0;i<9;i++)t.update(.05);assert.equal(e.runner.state,'recover');assert.equal(r.hp,hp-e.dmg);const after=r.hp;
   for(let i=0;i<15;i++)t.update(.05);assert.equal(r.hp,after);finish();
  }
 });
 check('lateral dodge avoids a locked rush and its direction never tracks the hero',()=>{
  const r=scene(),e=runner(r);charge(r,e);const angle=e.runner.angle,y=e.y;r.y+=100;
  for(let i=0;i<24;i++)t.update(.05);assert.equal(e.runner.angle,angle);assert.equal(e.y,y);assert.equal(r.hp,10000);assert.equal(e.runner.state,'recover');finish();
 });
 check('rushes respect dash shield and armor through the shared player damage rules',()=>{
  for(const counter of ['dash','shield','armor']){const r=scene(),e=runner(r);charge(r,e);for(let i=0;i<13;i++)t.update(.05);
   if(counter==='dash'){r.dashCd=0;t.dash()}if(counter==='shield')r.shield=2;if(counter==='armor')r.damageReduce=.5;
   for(let i=0;i<9;i++)t.update(.05);assert.equal(r.hp,counter==='armor'?10000-e.dmg*.5:10000,counter);finish();
  }
 });
 check('stun interrupts a live charge without sliding or releasing inherited attacks',()=>{
  const r=scene(),e=runner(r);charge(r,e);for(let i=0;i<14;i++)t.update(.05);assert.equal(e.runner.state,'charge');const x=e.x,y=e.y;
  e.stun=.5;e.cast={left:0,total:.38,shots:[{angle:0,speed:100,dmg:10}],zones:[]};e.contactWindup=.01;e.traitCd=0;
  for(let i=0;i<10;i++){t.update(.05);assert.equal(e.x,x);assert.equal(e.y,y)}assert.equal(e.runner.state,'stunned');assert.equal(r.shots.length,0);assert.equal(e.cast,null);assert.equal(e.contactWindup,0);assert.equal(r.hp,10000);
  t.update(.05);if(e.runner.state==='stunned')t.update(.05);assert.equal(e.runner.state,'recover');const recovery=e.runner.left;assert.equal(recovery,.8);for(let i=0;i<15;i++)t.update(.05);assert.equal(e.x,x);finish();
 });
 check('Story gates cancel warning through cover and stop committed rushes in every realm',()=>{
  for(let chapter=1;chapter<=6;chapter++)for(const state of ['windup','charge']){const r=scene('story');r.chapter=chapter;const e=runner(r);r.story.unlocked=0;r.story.rooms[1].fighting=false;r.x=740;r.y=375;e.x=880;e.y=375;Object.assign(e.runner,{state,left:state==='windup'?.65:.42,angle:Math.PI,speed:340,cooldown:0});
   for(let i=0;i<10;i++){t.update(.05);assert(e.x>850);assert(!t.storySolid(r,e.x,e.y,8));assert.equal(r.hp,10000)}assert.equal(e.runner.state,'recover');assert.equal(e.runner.reason,state==='windup'?'cover':'blocked');finish();
  }
 });
 check('Brawler Earthshatter interrupts the runner through the actual delayed skill release',()=>{
  const r=scene(),h=t.heroes.find(h=>h.classId==='brawler');r.hero={...h};r.weapon=t.weapons.find(w=>w.classId==='brawler'&&w.tier===0);r.activeSkill='earthshatter';r.skillCd=0;r.skillRank=0;
  const e=runner(r,60);e.hp=e.maxHp=1000;charge(r,e);t.skill();for(let i=0;i<40&&e.runner.state!=='stunned';i++)t.update(.025);assert(e.hp>0&&e.hp<1000);assert.equal(e.runner.state,'stunned');assert(e.stun>0);assert.equal(e.runner.reason,'stun');finish();
 });
 check('arrival grace freezes the runner before its full charge warning',()=>{
  const r=scene(),e=runner(r);e.spawnGrace=.1;const x=e.x;for(let i=0;i<2;i++){t.update(.05);assert.equal(e.runner.state,'approach');assert.equal(e.x,x)}charge(r,e);assert.equal(r.hp,10000);finish();
 });
 check('pause and Continue preserve runner windup rush recovery stun and single-hit state',()=>{
  for(const state of ['windup','charge','recover','stunned']){const r=scene(),e=runner(r);charge(r,e);
   if(state==='charge'||state==='recover')for(let i=0;i<(state==='charge'?15:22);i++)t.update(.05);
   if(state==='stunned'){e.stun=.5;t.update(.05)}assert.equal(e.runner.state,state);const data=t.packRun(r),before=JSON.stringify(e.runner),hp=r.hp;r.paused=true;t.update(.05);assert.equal(JSON.stringify(e.runner),before);t.leaveToHome();assert(t.resumeRun(data));const q=t.run,n=q.enemies[0];assert.equal(JSON.stringify(n.runner),before);assert.equal(q.hp,hp);assert(t.validExpedition(t.packRun(q)));t.update(.025);assert.equal(q.hp,hp);finish();
  }
 });
 check('legacy mobile enemies migrate safely and malformed runner states cannot replace a save',()=>{
  const r=scene(),e=runner(r);charge(r,e);const data=t.packRun(r);
  for(const modify of [s=>s.state.enemies[0].runner.left=99,s=>s.state.enemies[0].runner.state='fake',s=>s.state.enemies[0].runner.angle=4,s=>s.state.enemies[0].runner.speed=1e9,s=>s.state.enemies[0].runner.hit='yes',s=>s.state.enemies[0].boss=true,s=>s.state.enemies[0].type=4]){const bad=JSON.parse(JSON.stringify(data));modify(bad);assert(!t.validExpedition(bad))}
  delete data.state.enemies[0].runner;data.state.enemies[0].charging=.4;data.state.enemies[0].cast={left:.01,total:.38,shots:[],zones:[]};t.leaveToHome();assert(t.resumeRun(data));const n=t.run.enemies[0];assert.equal(n.runner.state,'approach');assert.equal(n.runner.cooldown,1.5);assert.equal(n.charging,0);assert.equal(n.cast,null);assert(t.validExpedition(t.packRun(t.run)));finish();
 });
 check('defeated runners cancel their attack and existing brute charge mechanics remain available',()=>{
  const r=scene(),e=runner(r);charge(r,e);for(let i=0;i<14;i++)t.update(.05);t.hit(e,1e9);assert(e.hp<=0);assert.equal(e.runner.reason,'defeated');const hp=r.hp;for(let i=0;i<10;i++)t.update(.05);assert.equal(r.hp,hp);
  const brute=t.spawnEnemy(false,4);assert(brute);brute.x=r.x+100;brute.y=r.y;brute.stun=0;brute.brute.cooldown=0;t.update(.05);assert.equal(brute.brute.state,'windup');assert.equal(brute.brute.left,.9);assert(!brute.runner);finish();
 });
 check('native runner warning and rush animations draw without changing attack state or blocking frames',()=>{
  const r=scene(),e=runner(r);charge(r,e);const before=JSON.stringify(e.runner),hp=r.hp;t.draw(r.time);assert.equal(JSON.stringify(e.runner),before);assert.equal(r.hp,hp);fs.writeFileSync(path.join(root,'tests/runner-warning-field.png'),t.ctx.canvas.toBuffer('image/png'));
  for(let i=0;i<15;i++)t.update(.05);t.draw(r.time);fs.writeFileSync(path.join(root,'tests/runner-rush-field.png'),t.ctx.canvas.toBuffer('image/png'));const time=r.time;t.update(.05);assert(r.time>time);finish();
 });
};
