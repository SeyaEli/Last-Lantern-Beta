module.exports=function({t,check,reset,assert,fs,path,root,game,createCanvas,GifEncoder}){
 const field=()=>{const r=reset();r.enemies=[];r.shots=[];r.spawn=999;r.attack=999;r.skillCd=999;r.hp=r.maxHp=1e8;r.xpNeed=1e9;r.critChance=0;r.regen=0;t.keys.clear();t.spawnEnemy(false,0);const e=r.enemies[0];Object.assign(e,{x:r.x+55,y:r.y,hp:1e8,maxHp:1e8,speed:0,stun:999,spawnGrace:0});return{r,e}};
 const done=()=>{t.keys.clear();t.endRun(false,true);t.closeModal()};
 check('contact animation holds locally while movement damage and cooldowns continue',()=>{
  const {r,e}=field();t.hit(e,10);const first=t.sampleActorMotion(r,e);assert(first.held);assert(first.x>0);
  const hp=e.hp,shoot=e.shoot;r.dashCd=2;t.keys.add('d');const x=r.x;t.update(.016);
  const second=t.sampleActorMotion(r,e);assert(second.held);assert.equal(second.hurtPhase,first.hurtPhase);assert(r.x>x);assert(r.dashCd<2);assert.equal(e.hp,hp);
  t.keys.clear();t.update(.05);assert(!t.sampleActorMotion(r,e).held);assert(e.shoot<=shoot);done();
 });
 check('recoil faces away from the attacker and rendering cannot deal extra damage',()=>{
  for(const side of [-1,1]){const {r,e}=field();e.x=r.x+side*55;t.hit(e,10,true);const pose=t.sampleActorMotion(r,e);assert(Math.sign(pose.x)===side);const hp=e.hp,gold=t.save.gold,x=e.x,y=e.y;
   for(let i=0;i<3;i++){t.draw(r.time);t.drawMotionGround(t.ctx,r);t.drawMotionForeground(t.ctx,r)}
   assert.equal(e.hp,hp);assert.equal(t.save.gold,gold);assert.equal(e.x,x);assert.equal(e.y,y);done()}
 });
 check('burn ticks do not repeatedly trigger contact pauses or directional bursts',()=>{
  const {r,e}=field();t.hit(e,10,false,true);assert.equal(t.sampleActorMotion(r,e),null);assert.equal(t.combatMotion(r).events.length,0);done();
 });
 check('motion effects are bounded expire on time freeze on pause and stay out of Continue',()=>{
  const {r,e}=field();for(let i=0;i<200;i++)t.hit(e,1);assert.equal(t.combatMotion(r).events.length,72);
  const clock=t.combatMotion(r).clock;r.paused=true;t.update(.05);assert.equal(t.combatMotion(r).clock,clock);r.paused=false;
  const state=JSON.stringify(t.packRun(r));assert(!state.includes('hurtPhase'));assert(!state.includes('actors'));
  t.leaveToHome();assert(t.resumeRun());assert.equal(t.combatMotion(t.run).events.length,0);
  for(let i=0;i<20;i++)t.update(.05);assert.equal(t.combatMotion(t.run).events.length,0);done();
 });
 check('distance-based footfalls stop at rest and dash launch is followed by a landing',()=>{
  const {r}=field();t.combatMotion(r);t.keys.add('d');for(let i=0;i<15;i++)t.update(.025);assert(t.combatMotion(r).events.some(e=>e.kind==='step'));
  t.keys.clear();for(let i=0;i<20;i++)t.update(.025);assert.equal(t.combatMotion(r).events.length,0);
  r.dashCd=0;t.dash();assert(t.combatMotion(r).events.some(e=>e.kind==='launch'));for(let i=0;i<10;i++)t.update(.025);assert(t.combatMotion(r).events.some(e=>e.kind==='land'));done();
 });
 check('fatal hits transfer recoil to the corpse without retaining the living actor',()=>{
  const {r,e}=field();t.hit(e,1e12,true);const corpse=r.corpses.at(-1);assert(corpse.dead);assert(t.sampleActorMotion(r,corpse));assert(t.combatMotion(r).events.some(e=>e.kind==='fall'));const kills=r.kills;t.draw(r.time);assert.equal(r.kills,kills);done();
 });
 if(process.env.LAST_LANTERN_MOTION_PREVIEW!=='1')return;
 // A real-runtime capture: no staged visual events and no substituted hero art.
 const starters={keeper:'crook',archer:'bow',mage:'wand',brawler:'fists',healer:'scepter',gunner:'rifle'},scenes=[];
 for(const hero of t.heroes){
  const {r,e}=field();r.hero={...hero};r.weapon=t.weapons.find(w=>w.id===starters[hero.classId]);r.activeSkill=t.skillBook[hero.classId][0][0];r.rate=hero.rate;r.dmg=hero.dmg;r.x=1000;r.y=750;r.skillCd=0;r.chapter=1;r.attack=999;r.shots=[];r.combatFx=[];
  e.x=r.x+(['keeper','brawler'].includes(hero.classId)?70:160);e.y=r.y-5;e.stun=0;e.dmg=0;e.shoot=e.traitCd=e.attack=999;r.invuln=0;r.shrines=[];r.chests=[];r.drops=[];r.texts=[];scenes.push({r,e,hero});
 }
 const sheet=createCanvas(700,786),c=sheet.getContext('2d'),gif=new GifEncoder(700,786,{repeat:0,quality:8});
 c.imageSmoothingEnabled=false;
 for(let frame=0;frame<76;frame++){
  c.fillStyle='#101715';c.fillRect(0,0,700,786);
  for(let i=0;i<scenes.length;i++){
   const {r,e,hero}=scenes[i];t.run=r;t.keys.clear();
   if(frame<10)t.keys.add('d');if(frame===11)r.attack=0;if(frame===29){r.skillCd=0;t.skill()}if(frame===53){r.lastDx=0;r.lastDy=1;r.dashCd=0;t.dash()}if(frame===65)t.hit(e,1e12,true);
   t.update(.04);t.draw(r.time);
   const x=i%2*350,y=Math.floor(i/2)*262;
   c.drawImage(game,300,105,350,230,x,y+27,350,230);
   c.fillStyle='#ecd9b6';c.font='15px Georgia';c.fillText(hero.name+' · '+r.weapon.name,x+10,y+19);
   c.fillStyle='#c4baa9';c.font='11px sans-serif';c.fillText(frame<11?'Footwork':frame<29?'Anticipation → contact → recovery':frame<53?'Skill windup → release':frame<65?'Dodge launch → landing':'Directional defeat',x+10,y+251);
  }
  if(frame===18)fs.writeFileSync(path.join(root,'tests/combat-motion-preview.png'),sheet.toBuffer('image/png'));
  const pixels=c.getImageData(0,0,700,786).data;
  gif.addFrame(new Uint8Array(pixels.buffer,pixels.byteOffset,pixels.byteLength),700,786,{delay:40});
 }
 fs.writeFileSync(path.join(root,'tests/combat-motion-preview.gif'),gif.finish());gif.dispose();done();
};
