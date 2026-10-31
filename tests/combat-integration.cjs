module.exports=function({t,check,reset,els,assert}){
 const field=(mode='campaign')=>{const r=reset(mode);if(r.story){r.story.dialog=null;t.closeModal();r.x=400;r.y=350}r.paused=false;r.enemies=[];r.shots=[];r.hazards=[];r.bossFields=[];r.shrines=[];r.spawn=999;r.attack=999;r.invuln=0;r.shield=0;r.regen=0;r.damageReduce=0;r.hp=r.maxHp=1000;r.xpNeed=1e9;t.keys.clear();return r};
 const shot=(r,x,y,vx,vy=0,extra={})=>{const s={x,y,vx,vy,t:3,enemy:true,dmg:20,color:'#ff9344',...extra};r.shots.push(s);return s};
 const done=()=>{t.keys.clear();t.endRun(false,true);t.closeModal()};
 check('fast hostile shots hit once in Campaign Story and Endless with contact-point impact art',()=>{
  for(const mode of ['campaign','story','endless']){const r=field(mode),s=shot(r,r.x-100,r.y,8000);t.update(.05);assert.equal(r.hp,980,mode);assert.equal(s.t,0);assert(Math.abs(s.vfxCollision.x-(r.x-13))<.001);t.update(.05);assert.equal(r.hp,980);done()}
 });
 check('moving heroes crossing a stationary projectile are hit despite clear endpoints',()=>{
  const r=field();r.speed=280;shot(r,r.x+7,r.y+12.9,0);t.keys.add('d');t.update(.05);assert.equal(r.hp,980);done();
 });
 check('a fast shot crossing before protection expiry does not hit after its passage',()=>{
  for(const protection of ['invuln','shield']){const r=field();r[protection]=.04;shot(r,r.x-100,r.y,4000);t.update(.05);assert.equal(r.hp,1000);t.update(.05);assert.equal(r.hp,1000);done()}
 });
 check('expiry inside the projectile overlap applies exactly one hit and lifetime is respected',()=>{
  const r=field();r.invuln=.025;shot(r,r.x-20,r.y,800);t.update(.05);assert.equal(r.hp,980);done();
  const q=field();shot(q,q.x-100,q.y,4000,0,{t:.01});t.update(.05);assert.equal(q.hp,1000);assert.equal(q.shots.length,0);done();
 });
 check('Story cover before a hero blocks hits while cover beyond the hero does not erase them',()=>{
  for(const playerBeforeWall of [false,true]){const r=field('story');r.x=playerBeforeWall?740:880;r.y=375;
   // The first locked gate spans x=800..850 in the corridor; both hero positions are valid floor.
   assert(!t.storySolid(r,r.x,r.y,11));assert(t.storySolid(r,825,375,3));
   shot(r,650,375,6000);t.update(.05);assert.equal(r.hp,playerBeforeWall?980:1000);done()}
 });
 check('friendly non-piercing shots hit the nearest enemy regardless of array order',()=>{
  const r=field();for(let i=0;i<2;i++){t.spawnEnemy(false,0);const e=r.enemies.at(-1);e.x=r.x+(i?70:140);e.y=r.y;e.speed=0;e.stun=0;e.hp=e.maxHp=1000}
  shot(r,r.x,r.y,6000,0,{enemy:false,hit:new Set(),pierce:false,dmg:10});r.critChance=0;t.update(.05);assert.equal(r.enemies[0].hp,1000);assert.equal(r.enemies[1].hp,990);done();
 });
 check('piercing shots sweep all crossed enemies once and retain hit sets after Continue',()=>{
  const r=field();for(let i=0;i<2;i++){t.spawnEnemy(false,0);const e=r.enemies.at(-1);e.x=r.x+50+i*60;e.y=r.y;e.speed=0;e.stun=0;e.hp=e.maxHp=1000}
  const s=shot(r,r.x,r.y,3000,0,{enemy:false,hit:new Set(),pierce:true,dmg:10});r.critChance=0;t.update(.05);assert(r.enemies.every(e=>e.hp===990));assert.equal(s.hit.size,2);
  s.vx=-3000;t.leaveToHome();assert(t.resumeRun());t.update(.05);assert(t.run.enemies.every(e=>e.hp===990));done();
 });
 check('all incoming damage routes share armor and protection and hazards check cover',()=>{
  const r=field();r.damageReduce=.3;assert(t.damagePlayer(r,20,'contact'));assert.equal(r.hp,986);assert(!t.damagePlayer(r,20,'projectile'));assert(!t.bossDamage(r,20));r.invuln=0;r.shield=1;assert(!t.bossDamage(r,20));r.shield=0;r.hazards=[{x:r.x,y:r.y,radius:60,dmg:20,t:.41,delay:.4,struck:false}];t.update(.05);assert.equal(r.hp,972);done();
  const q=field('story');q.x=880;q.y=375;q.hazards=[{x:740,y:375,radius:180,dmg:20,t:.41,delay:.4,struck:false}];assert(!t.storyLineOfSight(q,740,375,q.x,q.y,1));t.update(.05);assert.equal(q.hp,1000);done();
 });
 check('dodge grants its full configured immunity and preserves stronger existing protection',()=>{
  const r=field();r.invuln=1;r.dashCd=0;t.dash();assert.equal(r.invuln,1);r.invuln=0;r.dashCd=0;t.dash();assert.equal(r.invuln,.45);
  for(let i=0;i<8;i++){t.update(.05);assert(!t.damagePlayer(r,20,'contact'))}t.update(.05);assert(t.damagePlayer(r,20,'contact'));assert.equal(r.hp,980);done();
 });
 check('pause and Continue retain collision position lifetime and i-frames without duplicate hits',()=>{
  const r=field();r.invuln=.04;const s=shot(r,r.x-100,r.y,4000),before=JSON.stringify({x:s.x,t:s.t,invuln:r.invuln});r.paused=true;t.update(.05);assert.equal(JSON.stringify({x:s.x,t:s.t,invuln:r.invuln}),before);t.leaveToHome();assert(t.resumeRun());assert.equal(t.run.invuln,.04);t.update(.05);assert.equal(t.run.hp,1000);t.update(.05);assert.equal(t.run.hp,1000);done();
 });
};
