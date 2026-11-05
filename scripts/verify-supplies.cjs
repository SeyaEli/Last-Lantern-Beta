// Optional browser QA: node scripts/verify-supplies.cjs <playwright module> <browser executable>
const {chromium}=require(process.argv[2]||'playwright');
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{}),args:['--allow-file-access-from-files']});
 try{
  const context=await browser.newContext({viewport:{width:1280,height:800}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>errors.push(r.url()));
  const boot=()=>page.locator('#boot-status').waitFor({state:'detached',timeout:60000});
  const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await page.goto(pathToFileURL(path.join(root,'dist/index.html')).href);await boot();
  await page.evaluate(()=>{const d=JSON.parse(localStorage.getItem('last-lantern-v2'));d.gold=500000;for(const id of Object.keys(d.inventory))d.inventory[id]=100;Object.assign(d.inventory,{healing_potion:2,oil_flask:1,fury_tonic:3,iron_tonic:1});d.enhancements={'weapon:crook':{stars:6,awakened:false}};d.forgePity={};localStorage.setItem('last-lantern-v2',JSON.stringify(d))});
  await page.reload();await boot();await page.locator('.home-menu [data-page=forge]').click();await page.locator('[data-gear-enhance="weapon:crook"]').click();
  assert.equal(await page.locator('#forgeChance').innerText(),'25%');await page.locator('#forgeCatalyst').check();await page.locator('#forgeWard').check();assert.equal(await page.locator('#forgeChance').innerText(),'40%');
  await page.locator('.forge-support-art').evaluateAll(images=>Promise.all(images.map(i=>i.decode())));await page.screenshot({path:path.join(root,'tests/forge-recipe-review.png')});
  await page.evaluate(()=>{window.qaOriginalRandom=Math.random;Math.random=()=>.99});await page.locator('#modalActions button').first().click();await page.evaluate(()=>{Math.random=window.qaOriginalRandom;delete window.qaOriginalRandom});
  assert.equal(await page.locator('#modalTitle').innerText(),'The embers faltered');
  const failed=await page.evaluate(()=>JSON.parse(localStorage.getItem('last-lantern-v2')));
  assert.equal(failed.enhancements['weapon:crook'].stars,6);assert.equal(failed.inventory.weapon_fragment,100);assert.equal(failed.inventory.boss_core,100);assert.equal(failed.inventory.preservation_ward,99);assert.equal(failed.inventory.forge_catalyst,99);assert.equal(failed.gold,488000);assert.equal(failed.forgePity['weapon:crook'],1);
  await page.screenshot({path:path.join(root,'tests/forge-failure-result.png')});await page.locator('#modalActions button').first().click();
  await page.locator('#storeNavigation [data-store=supplies]').click();await page.locator('[data-supply-buy=healing_potion]').click();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('last-lantern-v2')).inventory.healing_potion),3);await page.locator('#toast').waitFor({state:'hidden'});
  const catalogue=new Set();let layouts=0;
  for(const size of [{width:1280,height:800},{width:800,height:600},{width:390,height:844},{width:844,height:390}]){
   await page.setViewportSize(size);await settle();
   while(await page.locator('#managementScreen .screen-pager button').first().isEnabled())await page.locator('#managementScreen .screen-pager button').first().click();
   for(let n=0;n<12;n++){
    await settle();await page.locator('#shop>article:visible img').evaluateAll(images=>Promise.all(images.map(i=>i.decode())));
    const state=await page.evaluate(()=>({overflow:document.documentElement.scrollHeight>innerHeight||document.documentElement.scrollWidth>innerWidth,cards:[...document.querySelectorAll('#shop>article')].filter(e=>e.getClientRects().length).map(e=>({name:e.querySelector('h3').textContent,clip:e.scrollHeight>e.clientHeight+2})),art:[...document.querySelectorAll('#shop>article:not([hidden]) img[data-supply-artwork]')].map(i=>({id:i.dataset.supplyArtwork,loaded:i.complete&&i.naturalWidth>0}))}));
    assert(!state.overflow,size.width+' scrolls');assert(state.cards.every(c=>!c.clip),size.width+' clips '+JSON.stringify(state.cards));assert(state.art.every(i=>i.loaded));state.art.forEach(i=>catalogue.add(i.id));layouts++;
    if(size.width===1280&&n===0)await page.screenshot({path:path.join(root,'tests/supplies-painted-shop.png')});
    const next=page.locator('#managementScreen .screen-pager button').last();if(!await next.isEnabled())break;await next.click();
   }
  }
  assert.equal(catalogue.size,9);
  await page.setViewportSize({width:1280,height:800});await page.locator('.world-nav [data-page=home]').click();await page.locator('#newGame').click();await page.locator('[data-mode=campaign]').click();await page.locator('#modalActions button').first().click();
  await page.locator('#packButton').click();await page.locator('[data-supply-use=fury_tonic]').click();await page.locator('.pack-item-art').evaluateAll(images=>Promise.all(images.map(i=>i.decode())));
  assert.equal(await page.locator('[data-supply-use=fury_tonic]').innerText(),'Active');assert(await page.locator('[data-supply-use=healing_potion]').isDisabled());
  await page.screenshot({path:path.join(root,'tests/field-supplies.png')});await page.keyboard.press('Escape');assert.equal(await page.locator('dialog[open]').count(),0);
  await page.keyboard.press('p');await page.locator('#modalActions button').nth(1).click();await page.locator('#continueGame').click();await page.locator('#packButton').click();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('last-lantern-v2')));assert.equal(saved.inventory.fury_tonic,2);assert(saved.expedition.state.supplyBuffs.fury_tonic>119);assert(saved.expedition.state.supplyCooldown>7);
  await page.keyboard.press('p');assert.equal(await page.locator('dialog[open]').count(),0);assert.deepEqual(errors,[]);
  console.log('Passed forge review, catalyst chance, protected failure, purchase, '+layouts+' paged shop layouts, nine loaded illustrations, tonic use, pack keyboard controls and Continue checks.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
