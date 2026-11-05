module.exports=function({t,check,reset,bossScene,els,fs,path,root,assert,element}){
 const finish=()=>{if(t.run)t.endRun(false,true);t.closeModal();t.keys.clear();t.selectedSeed='';t.selectedDirectorDifficulty='standard'};
 const seeded=(seed,mode='survival')=>{t.selectedSeed=seed;t.selectedDirectorDifficulty='standard';const r=reset(mode);r.attack=999;r.hp=r.maxHp=1e8;r.xpNeed=1e9;return r};
 check('same seed gives identical scheduled Survival plans and positions despite decorative random calls',()=>{
  const capture=noise=>{const r=seeded('replay-road');const results=[];for(let at=0;at<180;at+=10){r.time=at+.001;r.enemies=[];for(let i=0;i<noise;i++)Math.random();t.advanceWaves(r,.001);results.push({plan:JSON.parse(JSON.stringify(r.director.lastPlan)),actors:r.enemies.map(e=>({x:e.x,y:e.y,type:e.type,boss:e.boss,elite:!!e.elite}))})}finish();return results};
  assert.equal(JSON.stringify(capture(0)),JSON.stringify(capture(100)));
 });
 check('Continue restores director RNG scheduled time budget and future candidates exactly',()=>{
  const r=seeded('saved-road');r.time=50.001;r.director.nextAt=50;t.advanceWaves(r,.001);const saved=t.packRun(r),clock=r.director.nextAt;
  const point=t.directorSpawnPoint(r,false,12),plan=t.spawnDirectorBatch(r,4,true);t.leaveToHome();assert(t.resumeRun(saved));assert.equal(t.run.director.nextAt,clock);
  assert.equal(JSON.stringify(t.directorSpawnPoint(t.run,false,12)),JSON.stringify(point));assert.equal(JSON.stringify(t.spawnDirectorBatch(t.run,4,true)),JSON.stringify(plan));finish();
 });
 check('absolute Survival schedule yields the same plans at 20 30 60 and 144 updates per second',()=>{
  let expected=null;for(const fps of [20,30,60,144]){const r=seeded('frame-rate');const plans=[];let ticks=0;for(let i=0;i<fps*180;i++){r.time=(i+1)/fps;r.enemies=[];t.advanceWaves(r,1/fps);if(r.director.ticks!==ticks){ticks=r.director.ticks;plans.push(JSON.parse(JSON.stringify(r.director.lastPlan)))}}assert.equal(ticks,18);if(expected)assert.equal(JSON.stringify(plans),expected);else expected=JSON.stringify(plans);finish()}
 });
 check('critical hits and blessing rolls use the event stream instead of decorative randomness',()=>{
  const sample=noise=>{const r=seeded('events','campaign');r.enemies=[];const e=t.spawnEnemy(false,0);e.hp=e.maxHp=1e9;const damage=[];for(let i=0;i<40;i++){for(let n=0;n<noise;n++)Math.random();const before=e.hp;t.hit(e,10);damage.push(before-e.hp)}r.xp=r.xpNeed;t.levelUp();const blessings=[...r.blessingChoices];finish();return{damage,blessings}};
  assert.equal(JSON.stringify(sample(0)),JSON.stringify(sample(40)));
 });
 check('all thirty Story districts spawn on reachable floor away from the player cover and hazards',()=>{
  for(let chapter=1;chapter<=6;chapter++)for(let stage=1;stage<=5;stage++){
   const {r}=bossScene(chapter,stage,'story');r.enemies=[];for(let i=0;i<8;i++){const e=t.spawnEnemy(false,i%5,{arrival:true});assert(e,'spawn '+chapter+':'+stage+':'+i);assert(!t.storySolid(r,e.x,e.y,Math.min(18,e.size)));assert(Math.hypot(e.x-r.x,e.y-r.y)>=140);assert(t.directorReachable(r,t.storyRoomBoxes[stage],e));assert(e.spawnGrace>0)}
   const count=r.enemies.length;r.hazards=[{x:r.x,y:r.y,radius:1200,struck:false}];assert.equal(t.spawnEnemy(false,0),null);assert.equal(r.enemies.length,count);finish();
  }
 });
 check('blocked Story boss arrivals retry at a bounded interval without losing the boss wave',()=>{
  const {r}=bossScene(1,1,'story');r.enemies=[];r.story.rooms[1].waveSpawned=0;r.wave=20;r.spawn=0;r.bossSpawned=false;r.hazards=[{x:r.x,y:r.y,radius:1200,struck:false}];
  t.advanceWaves(r,.01);assert.equal(r.story.rooms[1].waveSpawned,0);assert(!r.bossSpawned);const rejected=r.director.rejected;t.advanceWaves(r,.1);assert.equal(r.director.rejected,rejected);
  r.hazards=[];t.advanceWaves(r,.5);assert.equal(r.story.rooms[1].waveSpawned,20);assert.equal(r.enemies.filter(e=>e.boss).length,1);t.advanceWaves(r,1);assert.equal(r.enemies.filter(e=>e.boss).length,1);finish();
 });
 check('arrival warnings delay enemy movement contact and projectile release',()=>{
  // Generic casts retain this arrival regression; archers now have their own full-warning test.
  const r=seeded('arrival','campaign');r.enemies=[];r.spawn=999;r.invuln=0;r.shield=0;r.shrines=[];const e=t.spawnEnemy(false,3,{arrival:true});e.x=r.x+35;e.y=r.y;e.speed=0;e.cast={left:.01,total:.38,shots:[{angle:0,speed:100,dmg:20}],zones:[]};r.shots=[];
  for(let i=0;i<20;i++)t.update(.05);assert(e.spawnGrace>0);assert.equal(e.cast.left,.01);assert.equal(r.shots.length,0);assert.equal(r.hp,1e8);
  for(let i=0;i<8;i++)t.update(.05);assert.equal(e.spawnGrace,0);assert.equal(e.cast,null);assert(r.shots.length>0);finish();
 });
 check('Survival crowd limits include the final boss and pause never advances the director',()=>{
  const r=seeded('cap');r.time=150;r.director.nextAt=150;r.enemies=Array.from({length:84},(_,i)=>({hp:100,x:100+i*10,y:100,size:12}));t.advanceWaves(r,.05);assert.equal(r.enemies.length,84);assert(!r.director.bossSpawned);
  const before=JSON.stringify(r.director),time=r.time;r.paused=true;t.update(.05);t.advanceWaves(r,100);assert.equal(r.time,time);assert.equal(JSON.stringify(r.director),before);finish();
 });
 check('a complete 180-second simulation wins once with the final boss still alive',()=>{
  const r=seeded('three-minutes');r.xpNeed=1e9;let maxCrowd=0,seenBoss=false;
  for(let i=0;i<3600&&t.run;i++){t.update(.05);maxCrowd=Math.max(maxCrowd,r.enemies.length);seenBoss ||= r.enemies.some(e=>e.boss);assert(r.enemies.length<=84);assert(!r.paused)}
  assert.equal(t.run,null);assert.equal(r.time,180);assert(seenBoss);assert(r.enemies.some(e=>e.boss&&e.hp>0));assert(r.director.eliteSpawned);assert.equal(r.director.ticks,18);assert(maxCrowd<=84);
  assert(t.save.lastChallenge.won);assert.equal(t.save.lastChallenge.seed,'three-minutes');assert.equal(t.save.records.survival,180);assert.equal(t.save.wins,0);assert(t.save.gold>=2500&&t.save.gold<150000);const gold=t.save.gold;t.endRun(true);assert.equal(t.save.gold,gold);finish();
 });
 check('the Survival deadline is stable at 20 30 60 and 144 updates per second',()=>{
  for(const fps of [20,30,60,144]){const r=seeded('deadline');r.time=179;r.director.nextAt=180;r.enemies=[];for(let i=0;i<fps+1&&t.run;i++)t.update(1/fps);assert.equal(t.run,null);assert.equal(r.time,180);assert(t.save.lastChallenge.won);finish()}
 });
 check('legacy snapshots gain deterministic seeds and malformed RNG cannot replace progress',()=>{
  const r=seeded('old','campaign'),saved=t.packRun(r);delete saved.state.director;t.leaveToHome();assert(t.validExpedition(saved));assert(t.resumeRun(saved));assert(t.run.director.seed.startsWith('legacy-'));const seed=t.run.director.seed;
  t.leaveToHome();assert(t.resumeRun(saved));assert.equal(t.run.director.seed,seed);const bad=t.packRun(t.run);bad.state.director.rng.placement=-1;assert(!t.validExpedition(bad));finish();
 });
 check('the Survival preparation form accepts a seed difficulty and unlocked map',()=>{
  if(t.run)finish();t.save=t.fresh();t.prepareMode('survival');assert(els['#modalBody'].innerHTML.includes('runSeed'));element('#runSeed').value='chosen-road';element('#directorDifficulty').value='veteran';element('#modeChapter').value='1';els['#modalActions'].children[0].click();assert.equal(t.run.mode,'survival');assert.equal(t.run.director.seed,'chosen-road');assert.equal(t.run.director.difficulty,'veteran');t.draw(0);fs.writeFileSync(path.join(root,'tests/director-field.png'),t.ctx.canvas.toBuffer('image/png'));finish();
 });
};
