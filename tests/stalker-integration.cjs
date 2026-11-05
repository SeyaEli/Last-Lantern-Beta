module.exports=function({t,check,reset,els,fs,path,root,assert}){
 const finish=()=>{t.keys.clear();if(t.run)t.endRun(false,true);t.closeModal()};
 const scene=(mode='campaign')=>{const r=reset(mode);if(r.story){r.story.dialog=null;t.closeModal();r.story.unlocked=1;r.story.activeRoom=r.story.combatRoom=1;r.story.discovered=[0,1];Object.assign(r.story.rooms[1],{entered:true,briefed:true,fighting:true,waveSpawned:1});const p=t.storyFreePoint(r,1);r.x=p.x;r.y=p.y}else{r.x=400;r.y=350}
  r.paused=false;r.enemies=[];r.shots=[];r.hazards=[];r.bossFields=[];r.spawn=999;r.attack=999;r.regen=0;r.invuln=0;r.shield=0;r.damageReduce=0;r.shrines=[];r.hp=r.maxHp=10000;r.xpNeed=1e9;r.lantern.fuel=20;if(mode==='survival')r.director.nextAt=999;return r};
 const stalker=(r,offset=149)=>{const e=t.spawnEnemy(false,0,{archetype:'shadow-stalker'});assert(e);e.x=r.x+offset;e.y=r.y;e.stun=0;e.spawnGrace=0;Object.assign(e.stalker,{state:'flank',circle:1.8,cooldown:0});return e};
 const charge=(r,e)=>{t.update(.025);assert.equal(e.stalker.state,'windup');assert.equal(e.stalker.left,.75)};
 check('Woods Stalkers warn fully and strike only once in Campaign Story Endless and Survival',()=>{
  for(const mode of ['campaign','story','endless','survival']){const r=scene(mode),e=stalker(r);assert.equal(e.name,'Shadow Stalker');assert.equal(t.enemyArtId(e),'wisp');charge(r,e);const x=e.x;
   for(let i=0;i<15;i++)t.update(.05);assert.equal(e.x,x);assert.equal(r.hp,10000);assert.equal(e.stalker.state,'strike');
   for(let i=0;i<15;i++)t.update(.05);assert.equal(e.stalker.state,'recover');assert.equal(r.hp,10000-e.dmg);const hp=r.hp;for(let i=0;i<16;i++)t.update(.05);assert.equal(r.hp,hp);finish();
  }
 });
 check('steady Normal light holds Stalkers outside its boundary and leaves plain Wisps unchanged',()=>{
  const r=scene(),e=stalker(r);r.lantern.fuel=100;for(let i=0;i<100;i++)t.update(.05);assert.equal(r.hp,10000);assert.equal(e.stalker.state,'flank');assert(Math.hypot(e.x-r.x,e.y-r.y)>125);
  const plain=t.spawnEnemy(false,0);plain.x=r.x+100;plain.y=r.y;plain.speed=40;plain.stun=0;const x=plain.x;t.update(.05);assert(Math.abs((x-plain.x)-1.44)<.001);assert(!plain.stalker);finish();
 });
 check('Bright at critical oil prevents commitment and stops an active pounce through the actual Light control',()=>{
  const r=scene(),e=stalker(r);charge(r,e);for(let i=0;i<17;i++)t.update(.05);assert.equal(e.stalker.state,'strike');const x=e.x;r.lantern.fuel=5;t.changeLanternMode();assert.equal(r.lantern.mode,'bright');t.update(.05);assert.equal(e.stalker.state,'recover');assert.equal(e.stalker.reason,'light');assert.equal(e.x,x);assert.equal(r.hp,10000);finish();
  const q=scene(),n=stalker(q,204);q.lantern.mode='bright';q.lantern.fuel=5;for(let i=0;i<40;i++)t.update(.05);assert(!['windup','strike'].includes(n.stalker.state));assert.equal(q.hp,10000);finish();
 });
 check('moving light onto a warning and restoring steady oil both interrupt the pending pounce',()=>{
  for(const counter of ['position','oil']){const r=scene(),e=stalker(r);charge(r,e);if(counter==='position')r.x+=40;else r.lantern.fuel=50;t.update(.05);assert.equal(e.stalker.state,'recover');assert.equal(e.stalker.reason,'light');assert.equal(r.hp,10000);finish();}
 });
 check('locked pounces respect lateral dodges dash shields and armor',()=>{
  for(const counter of ['side','dash','shield','armor']){const r=scene(),e=stalker(r);charge(r,e);const angle=e.stalker.angle;if(counter==='side')r.y+=80;
   for(let i=0;i<15;i++)t.update(.05);if(counter==='dash'){r.dashCd=0;t.dash()}if(counter==='shield')r.shield=2;if(counter==='armor')r.damageReduce=.5;
   for(let i=0;i<15;i++)t.update(.05);assert.equal(e.stalker.angle,angle);assert.equal(r.hp,counter==='armor'?10000-e.dmg*.5:10000,counter);finish();
  }
 });
 check('Story cover cancels warnings and stops a committed Stalker at the last safe point',()=>{
  for(const state of ['windup','strike']){const r=scene('story'),e=stalker(r);r.story.unlocked=0;r.story.rooms[1].fighting=false;r.x=740;r.y=375;e.x=880;e.y=375;Object.assign(e.stalker,{state,left:.75,angle:Math.PI,speed:260});
   for(let i=0;i<10;i++){t.update(.05);assert(e.x>850);assert(!t.storySolid(r,e.x,e.y,8));assert.equal(r.hp,10000)}assert.equal(e.stalker.state,'recover');assert.equal(e.stalker.reason,state==='windup'?'cover':'blocked');finish();
  }
 });
 check('Stalker spawn and attack caps apply without replacing chapter enemies or milestone bosses',()=>{
  const r=scene(),a=stalker(r,149),b=stalker(r,-149),c=stalker(r);c.x=r.x;c.y=r.y+149;assert.equal(t.spawnEnemy(false,0,{archetype:'shadow-stalker'}),null);assert.equal(t.spawnEnemy(true,undefined,{archetype:'shadow-stalker'}),null);
  t.update(.05);assert.equal(r.enemies.filter(e=>['windup','strike'].includes(e.stalker?.state)).length,1);for(let i=0;i<40;i++){t.update(.05);assert(r.enemies.filter(e=>['windup','strike'].includes(e.stalker?.state)).length<=1)}
  for(let chapter=2;chapter<=6;chapter++){r.chapter=chapter;assert.equal(t.spawnEnemy(false,0,{archetype:'shadow-stalker'}),null);const normal=t.spawnEnemy(false,0);assert(normal&&!normal.stalker);assert.equal(normal.name,t.chapters[chapter-1].family[0])}finish();
 });
 check('stun and death stop Stalker attacks without leaked generic casts or fuel drain',()=>{
  const r=scene(),e=stalker(r);charge(r,e);for(let i=0;i<16;i++)t.update(.05);const x=e.x;e.stun=.5;e.cast={left:0,total:.38,shots:[{angle:0,speed:100,dmg:10}],zones:[]};e.contactWindup=.01;
  for(let i=0;i<8;i++){t.update(.05);assert.equal(e.x,x)}assert.equal(e.stalker.state,'stunned');assert.equal(r.shots.length,0);assert.equal(e.cast,null);assert.equal(e.contactWindup,0);assert.equal(r.lantern.drained,0);t.hit(e,1e9);assert.equal(e.stalker.reason,'defeated');const hp=r.hp;for(let i=0;i<15;i++)t.update(.05);assert.equal(r.hp,hp);finish();
 });
 check('pause Continue and single-hit flags preserve every Stalker state exactly',()=>{
  for(const state of ['approach','flank','retreat','windup','strike','recover','stunned']){const r=scene(),e=stalker(r);Object.assign(e.stalker,{state,left:state==='windup'?.4:state==='strike'?.3:state==='recover'?.5:0,angle:Math.PI,speed:210,hit:state==='recover',circle:.4,cooldown:.5});if(state==='stunned')e.stun=.4;
   const data=t.packRun(r),before=JSON.stringify(e.stalker);r.paused=true;t.update(.05);assert.equal(JSON.stringify(e.stalker),before);t.leaveToHome();assert(t.resumeRun(data));const q=t.run,n=q.enemies[0];assert.equal(JSON.stringify(n.stalker),before);assert.equal(q.lantern.fuel,20);assert(t.validExpedition(t.packRun(q)));t.update(.025);assert.equal(q.hp,10000);finish();
  }
 });
 check('old expeditions retain ordinary Wisps while corrupt or foreign Stalker saves are rejected',()=>{
  const r=scene(),e=stalker(r);charge(r,e);const data=t.packRun(r);for(const modify of [s=>s.state.enemies[0].stalker.left=99,s=>s.state.enemies[0].stalker.side=0,s=>s.state.enemies[0].stalker.state='fake',s=>s.state.enemies[0].stalker.speed=999,s=>s.state.enemies[0].boss=true,s=>s.state.enemies[0].elite=true,s=>s.state.enemies[0].chapter=2,s=>s.state.enemies[0].type=3,s=>delete s.state.enemies[0].archetype,s=>delete s.state.enemies[0].stalker]){const bad=JSON.parse(JSON.stringify(data));modify(bad);assert(!t.validExpedition(bad))}
  const crowded=JSON.parse(JSON.stringify(data));crowded.state.enemies=Array.from({length:4},()=>JSON.parse(JSON.stringify(data.state.enemies[0])));assert(!t.validExpedition(crowded));crowded.state.enemies.length=2;assert(!t.validExpedition(crowded));
  data.state.enemies[0].archetype=undefined;delete data.state.enemies[0].stalker;t.leaveToHome();assert(t.resumeRun(data));assert(!t.run.enemies[0].stalker);assert.equal(t.run.enemies[0].type,0);finish();
 });
 check('arrival grace and empty fuel preserve fair warnings and never apply automatic damage',()=>{
  const r=scene(),e=stalker(r);e.spawnGrace=.1;const x=e.x;for(let i=0;i<2;i++){t.update(.05);assert.equal(e.stalker.state,'flank');assert.equal(e.x,x)}charge(r,e);finish();
  const q=scene(),n=stalker(q,62);q.lantern.fuel=0;q.lantern.mode='bright';charge(q,n);for(let i=0;i<15;i++)t.update(.05);assert.equal(q.hp,10000);assert.equal(q.lantern.fuel,0);assert.equal(n.stalker.state,'strike');finish();
 });
 check('local Stalker steering remains on physical Story floors during boundary pursuit',()=>{
  const r=scene('story'),e=stalker(r,170);r.lantern.fuel=100;let distance=0;for(let i=0;i<180;i++){const p={x:e.x,y:e.y};t.update(.025);assert(!t.storySolid(r,e.x,e.y,8));distance+=Math.hypot(e.x-p.x,e.y-p.y)}assert(distance>20);assert.equal(r.hp,10000);finish();
 });
 check('Stalker identity warnings and pounce art render without changing simulation or blocking frames',()=>{
  const r=scene(),e=stalker(r);charge(r,e);t.updateHud();assert(els['#fuelThreatNotice'].textContent.includes('Shadow Stalker'));const before=JSON.stringify(e.stalker),hp=r.hp;t.draw(r.time);assert.equal(JSON.stringify(e.stalker),before);assert.equal(r.hp,hp);fs.writeFileSync(path.join(root,'tests/stalker-warning-field.png'),t.ctx.canvas.toBuffer('image/png'));
  for(let i=0;i<18;i++)t.update(.05);t.draw(r.time);fs.writeFileSync(path.join(root,'tests/stalker-pounce-field.png'),t.ctx.canvas.toBuffer('image/png'));const time=r.time;t.update(.05);assert(r.time>time);finish();
 });
 check('Stalker local avoidance and attack work remain bounded in a full native crowd fixture',()=>{
  const r=scene();r.x=1200;r.y=750;r.hp=r.maxHp=1e8;for(let i=0;i<3;i++){const e=stalker(r);const angle=i*Math.PI*2/3;e.x=r.x+Math.cos(angle)*149;e.y=r.y+Math.sin(angle)*149;e.hp=e.maxHp=1e9}
  for(let i=3;i<150;i++){const e=t.spawnEnemy(false,i%5);assert(e);e.hp=e.maxHp=1e9}
  for(let i=0;i<320;i++)r.shots.push({x:r.x+300*Math.cos(i),y:r.y+250*Math.sin(i),vx:0,vy:0,t:9,enemy:true,dmg:1,color:'#ff9344'});
  const timings=[];for(let i=0;i<90;i++){const now=performance.now();t.update(.016);timings.push(performance.now()-now);assert.equal(t.run,r);assert(r.enemies.length<=150);assert(r.shots.length<=320);assert(r.enemies.filter(e=>['windup','strike'].includes(e.stalker?.state)).length<=1)}
  assert(t.validExpedition(t.packRun(r)));timings.sort((a,b)=>a-b);fs.writeFileSync(path.join(root,'tests/stalker-load-benchmark.json'),JSON.stringify({environment:'Simulation only on authoring host; excludes rendering and target-device FPS',frames:90,enemies:150,stalkers:3,projectileCap:320,medianMilliseconds:timings[45],p95Milliseconds:timings[85]},null,2));finish();
 });
};
