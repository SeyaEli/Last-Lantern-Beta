module.exports=({t,check,reset,assert,fs,path,root})=>{
 const done=()=>{t.keys.clear();if(t.run)t.endRun(false,true);t.closeModal()};
 function scene(ch=1){
  const r=reset('story');t.closeModal();r.chapter=ch;t.setupChapter(r);r.story.dialog=null;t.closeModal();Object.assign(r.story,{unlocked:1,activeRoom:1,combatRoom:1,discovered:[0,1]});Object.assign(r.story.rooms[1],{entered:true,briefed:true,fighting:true,waveSpawned:35});
  Object.assign(r,{paused:false,wave:35,enemies:[],shots:[],hazards:[],bossFields:[],spawn:999,attack:999,hp:100000,maxHp:100000,xpNeed:1e9,dmg:1,critChance:0});
  const b=t.storyRoomBoxes[1];r.x=b.cx;r.y=b.y+85;return{r,b};
 }
 check('melee knockback stops at each Story map boundary in all six chapters',()=>{
  for(let ch=1;ch<=6;ch++)for(const side of ['north','south','west','east']){
   const {r,b}=scene(ch),e=t.spawnEnemy(false,0);assert(e);Object.assign(e,{x:b.cx,y:b.y+13,hp:100000,maxHp:100000,speed:0,stun:0,spawnGrace:0});r.x=b.cx;r.y=b.y+85;
   if(side==='south'){e.y=b.y+b.h-13;r.y=b.y+b.h-85}
   if(side==='west'){e.x=b.x+13;e.y=b.cy;r.x=b.x+85;r.y=b.cy}
   if(side==='east'){e.x=b.x+b.w-13;e.y=b.cy;r.x=b.x+b.w-85;r.y=b.cy}
   assert(!t.storySolid(r,e.x,e.y,8));assert(!t.storySolid(r,r.x,r.y,11));const before={x:e.x,y:e.y};
   t.releaseClassAttack(r);assert(e.hp<100000,'attack reached the boundary target');assert(!t.storySolid(r,e.x,e.y,8),ch+' '+side+' knockback crossed the map wall');assert(Math.hypot(e.x-before.x,e.y-before.y)<=17,'knockback must not teleport to the room center');done();
  }
 });
 check('large skill pushes cannot tunnel through closed gates or supply crates',()=>{
  const {r}=scene(),e=t.spawnEnemy(false,0),gate=t.storyTerrain(1).gates[0];
  Object.assign(e,{x:gate.x+gate.w+12,y:gate.y+75,hp:100000,maxHp:100000});assert(!t.storySolid(r,e.x,e.y,8));
  t.displaceEnemy(r,e,-250,0);assert(e.x>=gate.x+gate.w+8);assert(!t.storySolid(r,e.x,e.y,8));
  const p=t.storyTerrain(1).props.find(p=>p.room===1);e.x=p.x-12;e.y=p.y+20;assert(!t.storySolid(r,e.x,e.y,8));
  t.displaceEnemy(r,e,150,0);assert(e.x<=p.x-8);assert(!t.storySolid(r,e.x,e.y,8));assert.equal(e.hp,100000);assert.equal(r.kills,0);done();
 });
 check('every enemy archetype is recovered from map walls before arrival or cast updates',()=>{
  const cases=[[false,0,{}],[false,1,{}],[false,2,{}],[false,4,{}],[false,2,{archetype:'void-warden'}],[false,3,{archetype:'spectral-mimic'}],[false,3,{archetype:'lantern-eater'}],[false,0,{archetype:'shadow-stalker'}],[true,undefined,{}]];
  for(const [boss,type,options] of cases){const {r,b}=scene(),e=t.spawnEnemy(boss,type,options);assert(e);Object.assign(e,{x:b.cx,y:b.y-40,hp:100000,maxHp:100000,spawnGrace:1,stun:1});e.cast={left:.01,total:.5,shots:[{angle:0,speed:100,dmg:99}],zones:[]};
   r.paused=true;t.update(.05);assert.equal(e.y,b.y-40,'pause must not reposition actors');r.paused=false;t.update(.05);
   assert(!t.storySolid(r,e.x,e.y,Math.min(18,Math.max(8,e.size*.65))),e.archetype||String(type));assert(e.x>=b.x&&e.x<=b.x+b.w&&e.y>=b.y&&e.y<=b.y+b.h);assert.equal(e.cast,null);assert.equal(r.shots.length,0);assert.equal(e.hp,100000);assert.equal(r.kills,0);assert(t.validExpedition(t.packRun(r)));done();
  }
 });
 check('Continue repairs stranded enemies without removing them and they remain killable',()=>{
  const {r,b}=scene(),e=t.spawnEnemy(false,0);Object.assign(e,{x:b.cx,y:b.y-60,hp:100000,maxHp:100000,spawnGrace:0});t.leaveToHome();assert(t.resumeRun());const q=t.run,enemy=q.enemies[0];assert.equal(q.enemies.length,1);t.update(.025);assert(!t.storySolid(q,enemy.x,enemy.y,8));assert.equal(enemy.hp,100000);
  t.draw(q.time);fs.writeFileSync(path.join(root,'tests/enemy-boundary-recovery.png'),t.ctx.canvas.toBuffer('image/png'));t.hit(enemy,1e12);t.update(.025);assert.equal(q.enemies.filter(e=>e.hp>0).length,0);done();
 });
 check('knockback stays inside world bounds in Campaign Endless and Survival',()=>{
  for(const mode of ['campaign','endless','survival']){const r=reset(mode);r.enemies=[];const e=t.spawnEnemy(false,0);assert(e);e.hp=100000;
   for(const [x,y,dx,dy] of [[25,25,-250,-250],[2375,25,250,-250],[25,1475,-250,250],[2375,1475,250,250]]){e.x=x;e.y=y;t.displaceEnemy(r,e,dx,dy);assert(e.x>=24&&e.x<=2376&&e.y>=24&&e.y<=1476);assert.equal(e.hp,100000)}done();
  }
 });
};
