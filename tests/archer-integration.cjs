module.exports=function({t,check,reset,els,fs,path,root,assert}){
 const finish=()=>{t.keys.clear();if(t.run)t.endRun(false,true);t.closeModal()};
 const scene=(mode='campaign')=>{const r=reset(mode);if(r.story){r.story.dialog=null;t.closeModal();r.story.unlocked=1;r.story.activeRoom=r.story.combatRoom=1;r.story.discovered=[0,1];Object.assign(r.story.rooms[1],{entered:true,briefed:true,fighting:true,waveSpawned:1});const p=t.storyFreePoint(r,1);r.x=p.x;r.y=p.y}else{r.x=400;r.y=350}
  r.paused=false;r.enemies=[];r.shots=[];r.hazards=[];r.bossFields=[];r.spawn=999;r.attack=999;r.regen=0;r.invuln=0;r.shield=0;r.damageReduce=0;r.shrines=[];r.hp=r.maxHp=10000;r.xpNeed=1e9;if(mode==='survival')r.director.nextAt=999;return r};
 const archer=(r,offset=180)=>{const e=t.spawnEnemy(false,2);assert(e);e.x=r.x+offset;e.y=r.y;e.stun=0;e.spawnGrace=0;e.traitCd=999;e.archer.cooldown=0;e.archer.planClock=2.4;return e};
 const aim=(r,e)=>{t.update(.025);assert.equal(e.archer.state,'windup');assert.equal(e.archer.left,.65)};
 const findFixture=(r,e)=>{
  const map=t.storyTerrain(r.chapter),b=t.storyRoomBoxes[1],boxes=map.props.filter(p=>p.room===1);
  for(let y=b.ty+1;y<b.ty+b.th-1;y++)for(let x=b.tx+1;x<b.tx+b.tw-1;x++)if(map.tiles[y][x]===2)boxes.push({x:x*50,y:y*50,w:50,h:50});
  for(const box of boxes)for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]])for(const offset of [-70,0,70]){
   r.x=box.x+box.w/2+dx*180+(dy?offset:0);r.y=box.y+box.h/2+dy*180+(dx?offset:0);e.x=box.x+box.w/2-dx*(box.w/2+30);e.y=box.y+box.h/2-dy*(box.h/2+30);
   if(r.x<b.x+20||r.x>b.x+b.w-20||r.y<b.y+20||r.y>b.y+b.h-20||t.storySolid(r,r.x,r.y,13)||t.storySolid(r,e.x,e.y,10))continue;
   const cover=t.findArcherCover(r,e,{left:1});if(cover)return cover;
  }return null;
 };
 check('archers preserve all chapter identities and give one full-warning shot in every mode',()=>{
  for(const mode of ['campaign','story','endless','survival'])for(let chapter=1;chapter<=6;chapter++){
   const r=scene(mode);r.chapter=chapter;if(r.story)r.story.chapter=chapter;const e=archer(r);assert.equal(e.name,t.chapters[chapter-1].family[2]);aim(r,e);const x=e.x,y=e.y;
   for(let i=0;i<12;i++){t.update(.05);assert.equal(r.shots.length,0);assert.equal(e.x,x);assert.equal(e.y,y)}t.update(.05);assert.equal(r.shots.length,1);assert.equal(e.archer.state,'release');assert.equal(e.archer.volley,null);
   for(let i=0;i<9;i++)t.update(.05);assert.equal(r.shots.length,1);assert.equal(e.archer.state,'recover');assert(t.validExpedition(t.packRun(r)));finish();
  }
 });
 check('chapter fan volleys and elite ground attacks share the new warning and release once',()=>{
  for(let chapter=1;chapter<=6;chapter++){const r=scene();r.chapter=chapter;if(r.story)r.story.chapter=chapter;const e=archer(r);e.traitCd=0;if(chapter===5)e.elite=true;aim(r,e);assert.equal(e.archer.volley.shots.length,chapter>=3?4:1);assert.equal(e.cast,null);
   for(let i=0;i<12;i++)t.update(.05);assert.equal(r.shots.length,0);assert.equal(r.hazards.length,0);t.update(.05);assert.equal(r.shots.length,chapter>=3?4:1);assert.equal(r.hazards.length,chapter===5?1:0);if(chapter>=3)assert(r.shots.some(s=>s.dmg>0&&s.vfxKind));finish();
  }
 });
 check('locked aim and projectile release retain the actual enemy muzzle in both directions',()=>{
  for(const side of [-1,1]){const r=scene(),e=archer(r,side*180);aim(r,e);const angle=e.archer.angle;r.y+=45;for(let i=0;i<13;i++)t.update(.05);const shot=r.shots[0],muzzle=t.archerMuzzle(e),fx=r.combatFx.find(f=>f.kind==='enemyCast');assert(shot);assert.equal(e.archer.angle,angle);assert(Math.abs(Math.atan2(shot.vy,shot.vx)-angle)<1e-8);assert.equal(fx.x,muzzle.x);assert.equal(fx.y,muzzle.y);assert.equal(shot.vfxTrail[0].x,muzzle.x);assert.equal(shot.vfxTrail[0].y,muzzle.y);finish();}
 });
 check('breaking Story sight cancels the warning before a shot can cross a closed gate',()=>{
  const r=scene('story'),e=archer(r);aim(r,e);r.story.unlocked=0;r.story.rooms[1].fighting=false;r.x=740;r.y=375;e.x=880;e.y=375;t.update(.05);assert.equal(e.archer.reason,'cover');assert.equal(e.archer.state,'recover');assert.equal(e.archer.volley,null);for(let i=0;i<10;i++)t.update(.05);assert.equal(r.shots.length,0);assert.equal(r.hp,10000);finish();
 });
 check('close pressure interrupts aim and archers retreat without hidden melee damage',()=>{
  const r=scene(),e=archer(r);aim(r,e);r.x=e.x-50;t.update(.05);assert.equal(e.archer.state,'retreat');assert.equal(e.archer.reason,'pressure');const x=e.x;t.update(.05);assert(e.x>x);assert.equal(r.shots.length,0);r.x=e.x;r.y=e.y;t.update(.05);assert.equal(r.hp,10000);finish();
 });
 check('stun cancels pending chapter volleys and death cannot release a late attack',()=>{
  const r=scene();r.chapter=5;const e=archer(r);e.traitCd=0;aim(r,e);e.stun=.4;const x=e.x;for(let i=0;i<6;i++)t.update(.05);assert.equal(e.archer.state,'stunned');assert.equal(e.x,x);assert.equal(e.archer.volley,null);assert.equal(r.shots.length,0);assert.equal(r.hazards.length,0);t.hit(e,1e9);assert.equal(e.archer.reason,'defeated');for(let i=0;i<20;i++)t.update(.05);assert.equal(r.shots.length,0);finish();
 });
 check('actual Story geometry supplies usable hide and peek pairs across all six realms',()=>{
  for(let chapter=1;chapter<=6;chapter++){const r=scene('story');r.chapter=chapter;if(r.story)r.story.chapter=chapter;const e=archer(r),cover=findFixture(r,e);assert(cover,'cover in chapter '+chapter);assert(!t.storyLineOfSight(r,cover.hide.x,cover.hide.y-e.size*.5,r.x,r.y,3));assert(t.storyLineOfSight(r,cover.peek.x,cover.peek.y-e.size*.5,r.x,r.y,3));assert(!t.storySolid(r,cover.hide.x,cover.hide.y,10));assert(!t.storySolid(r,cover.peek.x,cover.peek.y,10));assert(t.archerCoverBoxes(r,e).length<=12);finish();}
 });
 check('physical hide peek fire recovery and return-to-cover movement completes in Story',()=>{
  const r=scene('story'),e=archer(r),cover=findFixture(r,e);assert(cover);Object.assign(e.archer,{cover,state:'seek',planClock:2.4,cooldown:0});e.speed=90;const states=new Set();let fired=false;
  for(let i=0;i<700;i++){t.update(.025);states.add(e.archer.state);assert(!t.storySolid(r,e.x,e.y,8));if(e.archer.state==='release')fired=true;if(fired&&e.archer.state==='seek')break}
  assert(fired);for(const state of ['hide','peek','windup','release','recover','seek'])assert(states.has(state),state);assert(e.archer.cover);fs.writeFileSync(path.join(root,'tests/archer-cover-field.png'),(()=>{t.draw(r.time);return t.ctx.canvas.toBuffer('image/png')})());finish();
 });
 check('cover searches obey a shared one-plan budget and avoid another archer’s reserved anchor',()=>{
  const r=scene('story'),e=archer(r),cover=findFixture(r,e);assert(cover);const budget={left:1},first=t.findArcherCover(r,e,budget);assert(first);assert.equal(budget.left,0);assert.equal(t.findArcherCover(r,e,budget),undefined);e.archer.cover=cover;
  const other=t.spawnEnemy(false,2);assert(other);other.x=e.x+30;other.y=e.y+30;const second=t.findArcherCover(r,other,{left:1});if(second)assert(Math.hypot(second.hide.x-cover.hide.x,second.hide.y-cover.hide.y)>=35);finish();
 });
 check('invalidated cover is replanned without moving into a solid tile',()=>{
  const r=scene('story'),e=archer(r),cover=findFixture(r,e);assert(cover);const map=t.storyTerrain(r.chapter),box=t.storyRoomBoxes[1];let wall;for(let y=box.ty+1;y<box.ty+8&&!wall;y++)for(let x=box.tx+1;x<box.tx+11;x++)if(map.tiles[y][x]===2){wall={x:x*50+25,y:y*50+25};break}assert(wall);
  Object.assign(e.archer,{state:'seek',cover:{hide:wall,peek:cover.peek},planClock:0});t.update(.025);assert(!e.archer.cover||JSON.stringify(e.archer.cover.hide)!==JSON.stringify(wall));assert(!t.storySolid(r,e.x,e.y,8));finish();
 });
 check('pause Continue restores all archer states and never duplicates a released volley',()=>{
  for(const state of ['approach','seek','hide','peek','retreat','windup','release','recover','stunned']){const r=scene(),e=archer(r);aim(r,e);const volley=e.archer.volley;Object.assign(e.archer,{state,left:state==='windup'?.4:state==='release'?.1:state==='recover'?.5:state==='hide'?.3:0,cooldown:.5,cover:['seek','hide','peek'].includes(state)?{hide:{x:e.x+20,y:e.y},peek:{x:e.x+20,y:e.y-30}}:null,volley:state==='windup'?volley:null});if(state==='stunned')e.stun=.4;
   const data=t.packRun(r),before=JSON.stringify(e.archer);assert(t.validExpedition(data));r.paused=true;t.update(.05);assert.equal(JSON.stringify(e.archer),before);t.leaveToHome();assert(t.resumeRun(data));assert.equal(JSON.stringify(t.run.enemies[0].archer),before);t.update(.025);assert.equal(t.run.shots.length,0);assert(t.validExpedition(t.packRun(t.run)));finish();
  }
 });
 check('legacy archers restart fairly and invalid saved state or volley data is rejected',()=>{
  const r=scene(),e=archer(r);aim(r,e);const data=t.packRun(r);for(const modify of [s=>s.state.enemies[0].archer.left=99,s=>s.state.enemies[0].archer.state='fake',s=>s.state.enemies[0].archer.cover={hide:{x:-1,y:5},peek:{x:4,y:5}},s=>s.state.enemies[0].archer.volley.shots[0].speed=1e9,s=>s.state.enemies[0].archer.volley.shots[0].dmg=-1,s=>s.state.enemies[0].archer.angle=4,s=>s.state.enemies[0].boss=true,s=>s.state.enemies[0].type=4]){const bad=JSON.parse(JSON.stringify(data));modify(bad);assert(!t.validExpedition(bad))}
  delete data.state.enemies[0].archer;data.state.enemies[0].cast={left:.01,total:.38,shots:[],zones:[]};t.leaveToHome();assert(t.resumeRun(data));const n=t.run.enemies[0];assert.equal(n.archer.state,'approach');assert.equal(n.archer.cooldown,2.2);assert.equal(n.cast,null);t.update(.05);assert.equal(t.run.shots.length,0);finish();
 });
 check('arrival grace holds archer movement planning and warning timers',()=>{
  const r=scene(),e=archer(r);e.spawnGrace=.1;const before=JSON.stringify(e.archer),x=e.x;for(let i=0;i<2;i++){t.update(.05);assert.equal(JSON.stringify(e.archer),before);assert.equal(e.x,x)}aim(r,e);assert.equal(r.shots.length,0);finish();
 });
 check('aim and release art render without changing pending volleys or freezing the next frame',()=>{
  const r=scene(),e=archer(r);aim(r,e);const before=JSON.stringify(e.archer);t.draw(r.time);assert.equal(JSON.stringify(e.archer),before);fs.writeFileSync(path.join(root,'tests/archer-aim-field.png'),t.ctx.canvas.toBuffer('image/png'));for(let i=0;i<13;i++)t.update(.05);t.draw(r.time);fs.writeFileSync(path.join(root,'tests/archer-release-field.png'),t.ctx.canvas.toBuffer('image/png'));const now=r.time;t.update(.05);assert(r.time>now);finish();
 });
 check('crowded Story archer navigation and planning remain bounded with valid saves',()=>{
  const r=scene('story');r.hp=r.maxHp=1e8;const room=t.storyRoomBoxes[1];let count=0;for(let y=room.ty+1;y<room.ty+8&&count<24;y++)for(let x=room.tx+1;x<room.tx+11&&count<24;x++){const p={x:x*50+25,y:y*50+25};if(t.storySolid(r,p.x,p.y,14)||Math.hypot(p.x-r.x,p.y-r.y)<100)continue;const e=t.spawnEnemy(false,2);if(!e)continue;e.x=p.x;e.y=p.y;e.stun=0;e.hp=e.maxHp=1e9;e.archer.planClock=0;count++}assert(count>=12);
  const timings=[];for(let i=0;i<90;i++){const now=performance.now();t.update(.025);timings.push(performance.now()-now);assert.equal(t.run,r);assert(r.shots.length<=320);for(const e of r.enemies)assert(!t.storySolid(r,e.x,e.y,8))}assert(t.validExpedition(t.packRun(r)));timings.sort((a,b)=>a-b);fs.writeFileSync(path.join(root,'tests/archer-load-benchmark.json'),JSON.stringify({environment:'Simulation only on authoring host; not rendered FPS or target-device performance',frames:90,archers:count,medianMilliseconds:timings[45],p95Milliseconds:timings[85]},null,2));finish();
 });
};
