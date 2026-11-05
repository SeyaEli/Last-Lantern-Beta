// Optional browser QA: node scripts/verify-screens.cjs <playwright module> <browser executable>
const {chromium}=require(process.argv[2]||'playwright');
const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),results=[];
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{}),args:['--allow-file-access-from-files']});
 try{
  const context=await browser.newContext({viewport:{width:1280,height:800}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',request=>errors.push(request.url()+': '+request.failure()?.errorText));
  await page.goto(pathToFileURL(path.join(root,'dist/index.html')).href);await page.locator('#boot-status').waitFor({state:'detached',timeout:60000});
  const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const inspect=async(label)=>{
   await settle();const state=await page.evaluate(()=>{const visible=e=>e&&e.getClientRects().length>0;return{page:document.body.dataset.page,overflow:document.documentElement.scrollHeight>innerHeight||document.documentElement.scrollWidth>innerWidth,views:['homeScreen','modesScreen','managementScreen','battleLayout'].filter(id=>visible(document.getElementById(id))),cards:[...document.querySelectorAll('#shop>article,.mode-grid>article')].filter(visible).map(e=>({name:e.querySelector('h3')?.textContent,overflow:e.scrollHeight>e.clientHeight+2})),hud:visible(document.querySelector('#hud')),fuel:visible(document.querySelector('#lanternPanel')),nav:visible(document.querySelector('.world-nav')),header:visible(document.querySelector('header')),footer:visible(document.querySelector('.footer'))}});
   results.push({label,...state});assert(!state.overflow,label+' scrolls');assert.equal(state.views.length,1,label+' has mixed screens');assert(state.cards.every(c=>!c.overflow),label+' clips cards');return state;
  };
  const home=()=>page.locator('.world-nav [data-page=home]').click();
  const route=async(name)=>{if(await page.locator('#homeScreen').isVisible())await page.locator('.home-menu [data-page=heroes]').click();if(name==='supplies'){await page.locator('.world-nav [data-page=armory]').click();await page.locator('#storeNavigation [data-store=supplies]').click()}else await page.locator('.world-nav [data-page='+name+']').click();};
  const saveReturn=async()=>{await page.locator('#pause').click();await page.locator('#modalActions button').nth(1).click();assert.equal((await inspect('save and return')).page,'home');};
  await inspect('opening');assert.equal(await page.locator('#newGame').textContent(),'Play');await page.screenshot({path:path.join(root,'tests/ui-opening.png')});
  for(const size of [{width:1280,height:800},{width:1920,height:1080},{width:800,height:600},{width:390,height:844},{width:844,height:390}]){
   await page.setViewportSize(size);
   if(!await page.locator('#homeScreen').isVisible())await home();await settle();
   const menu=await page.locator('.home-menu button').evaluateAll(buttons=>buttons.map(button=>{const rect=button.getBoundingClientRect();return{label:button.querySelector('.menu-title')?.textContent,ready:button.dataset.artReady==='true',inside:rect.left>=0&&rect.top>=0&&rect.right<=innerWidth&&rect.bottom<=innerHeight};}));
   assert.equal(menu.length,7);assert(menu.every(item=>item.ready&&item.inside),size.width+' menu artwork is unloaded or outside the window');
   if(size.width===390)await page.screenshot({path:path.join(root,'tests/ui-reference-menu-mobile.png')});
   for(const name of ['heroes','armory','supplies','armor','forge','skills','camp','journal','modes']){await route(name);await inspect(size.width+' '+name);if(['skills','armor','forge','supplies'].includes(name)&&size.width===1280)await page.screenshot({path:path.join(root,'tests/ui-'+name+'.png')});if(name==='heroes'){await page.screenshot({path:path.join(root,'tests/ui-'+size.width+'-heroes.png')});const next=page.locator('#managementScreen .screen-pager button').last();if(await next.isEnabled()){const before=await page.locator('#shop>article:visible h3').allTextContents();await next.click();assert.notDeepEqual(await page.locator('#shop>article:visible h3').allTextContents(),before);await inspect(size.width+' next page');}}}
  }
  await page.setViewportSize({width:1280,height:800});await route('modes');await page.locator('[data-mode=campaign]').click();await page.locator('#modalActions button').first().click();
  for(const size of [{width:1280,height:800},{width:390,height:844},{width:844,height:390}]){
   await page.setViewportSize(size);const state=await inspect(size.width+' gameplay');assert(state.hud&&state.fuel&&!state.header&&!state.nav&&!state.footer);
   await page.screenshot({path:path.join(root,'tests/ui-'+size.width+'-gameplay.png')});await saveReturn();await page.locator('#continueGame').click();assert.equal((await inspect('continue expedition')).page,'battle');
  }
  await saveReturn();await route('journal');await page.locator('.read-entry').click();assert(await page.locator('#screenReader').isVisible());await page.locator('#screenReader>button').click();await home();
  await page.setViewportSize({width:1280,height:800});
  await page.evaluate(()=>{const key='last-lantern-v2',save=JSON.parse(localStorage.getItem(key));save.gold=10000000;save.chapterUnlocked=6;for(const key of Object.keys(save.inventory))save.inventory[key]=1000000;localStorage.setItem(key,JSON.stringify(save));});
  await page.reload();await page.locator('#boot-status').waitFor({state:'detached',timeout:60000});
  await route('armor');await page.locator('[data-armor-equip=iron_vest]').click();assert.equal(await page.locator('[data-armor-equip=iron_vest]').textContent(),'Equipped');
  await route('forge');
  for(const kind of ['weapon:crook','armor:iron_vest']){
   for(let i=0;i<48&&!await page.locator('[data-gear-enhance="'+kind+'"]').isDisabled();i++){await page.locator('[data-gear-enhance="'+kind+'"]').click();await page.locator('#modalActions button').first().click();await page.locator('#modalActions button').first().click();}
   assert.equal(await page.locator('[data-gear-enhance="'+kind+'"]').textContent(),'Awakened');assert(await page.locator('[data-gear-enhance="'+kind+'"]').isDisabled());
  }
  await inspect('awakened gear');await page.screenshot({path:path.join(root,'tests/ui-forge-awakened.png')});
  await page.reload();await page.locator('#boot-status').waitFor({state:'detached',timeout:60000});await route('forge');assert.equal(await page.locator('.gear-awakened').count(),2);await inspect('saved awakened gear');
  // Every hero uses the same complete painted armor catalogue, across pages.
  await page.evaluate(()=>{const key='last-lantern-v2',save=JSON.parse(localStorage.getItem(key));save.gold=1000000000;save.unlockedArmors=['travel_cloak','iron_vest','briar_coat','moonweave','warden_plate','dawnward'];localStorage.setItem(key,JSON.stringify(save));});
  await page.reload();await page.locator('#boot-status').waitFor({state:'detached',timeout:60000});
  for(const hero of ['brann','nyx','orin','rook','sera','jax']){
   await route('heroes');await settle();const heroButton=page.locator('[data-select='+hero+']');
   while(!await heroButton.isVisible())await page.locator('#managementScreen .screen-pager button').last().click();
   if(await heroButton.isEnabled())await heroButton.click();
   await route('armor');await settle();
   while(await page.locator('#managementScreen .screen-pager button').first().isEnabled())await page.locator('#managementScreen .screen-pager button').first().click();
   const catalogue=new Set();
   while(true){
    await settle();await page.locator('.armor-card:visible img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
    const artwork=await page.locator('.armor-card:visible img').evaluateAll(images=>images.map(image=>({id:image.dataset.armorArtwork,loaded:image.complete&&image.naturalWidth>0})));
    assert(artwork.length>0&&artwork.every(a=>a.loaded));artwork.forEach(a=>catalogue.add(a.id));await inspect(hero+' armor artwork');
    if(hero==='brann')await page.screenshot({path:path.join(root,'tests/ui-painted-armor-'+catalogue.size+'.png')});
    const next=page.locator('#managementScreen .screen-pager button').last();if(!await next.isEnabled())break;await next.click();
   }
   assert.equal(catalogue.size,6,hero+' is missing armor art');
   await route('forge');await settle();await page.locator('[data-gear-kind=armor] img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));assert.equal(await page.locator('[data-gear-kind=armor] img[data-armor-artwork]').count(),6);
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(root,'tests/ui-screen-results.json'),JSON.stringify(results,null,2));console.log('Passed '+results.length+' rendered screen checks, paging, journal, Continue, armor purchase, 7-star enhancement, and awakening.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);fs.writeFileSync(path.join(root,'tests/ui-screen-results.json'),JSON.stringify(results,null,2));process.exitCode=1});
