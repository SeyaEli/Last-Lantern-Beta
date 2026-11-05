// The simulation keeps its 800×500 coordinate system. The stage scales as one
// rectangle, including pointer input; the menu shell never becomes a web page.
import assets from '../engine/assets.json';
import { cardEmblem } from './card-art';
import { armorArtwork } from './armor-art';
import { supplyArtwork } from './supply-art';
export function initializeScreens(){
 const get=(id:string)=>document.getElementById(id)!;
 const arena=get('arena');
 for(const id of ['lanternPanel','objectiveHud','adventureControls'])arena.append(get(id));
 const viewports=new Map<string,number>();
 const reader=document.createElement('dialog');reader.id='screenReader';reader.setAttribute('aria-label','Journal entry');document.body.append(reader);
 let queued=false;
 function paginate(container:HTMLElement,section:HTMLElement,key:string){
  const cards=Array.from(container.children).filter((el):el is HTMLElement=>el instanceof HTMLElement&&el.matches('article'));
  if(!cards.length)return;
  const scenes:Record<string,string>={armory:assets.map_2,supplies:assets.map_5,armor:assets.map_4,forge:assets.map_2,heroes:assets.map_1,skills:assets.map_3,camp:assets.map_5,journal:assets.map_6,modes:assets.map_4};
  document.documentElement.style.setProperty('--menu-scene',`url("${new URL(scenes[key]||assets.map_1,document.baseURI).href}")`);
  for(const card of cards){
   if(card.dataset.decorated)continue;
   card.dataset.decorated='true';
   const skill=card.querySelector<HTMLButtonElement>('[data-skill-equip]')?.dataset.skillEquip;
   const mode=card.querySelector<HTMLButtonElement>('[data-mode]')?.dataset.mode;
   const upgrade=card.querySelector<HTMLButtonElement>('[data-camp-buy]')?.dataset.campBuy;
   const supply=card.dataset.supplyIcon;
   const symbol=supply||skill||({campaign:'crown',story:'book',endless:'infinity',survival:'clock'}[mode||''])||(key==='armor'?'armor':key==='journal'?'book':['armory','forge'].includes(key)||upgrade?'forge':'lantern');
   const mark=document.createElement('span');mark.className='card-watermark';mark.setAttribute('aria-hidden','true');mark.innerHTML=cardEmblem(symbol);card.append(mark);
   if(supply){
    const icon=card.querySelector('.supply-art'),src=card.dataset.supplyId&&supplyArtwork(card.dataset.supplyId);
    if(icon&&src){const image=document.createElement('img');image.src=src;image.alt='';image.decoding='async';image.loading='lazy';image.dataset.supplyArtwork=card.dataset.supplyId;icon.replaceChildren(image);}
    else if(icon)icon.innerHTML=cardEmblem(supply);
   }
   if(skill){const icon=document.createElement('span');icon.className='skill-emblem';icon.setAttribute('aria-hidden','true');icon.innerHTML=cardEmblem(skill);card.querySelector('.skill-art')?.replaceWith(icon);}
   const armorId=card.dataset.armorId||(card.dataset.gearKind==='armor'?card.dataset.gearId:undefined);
   card.querySelectorAll<HTMLElement>('.armor-art').forEach(art=>{
    const src=armorId&&armorArtwork(armorId);
    if(src){const image=document.createElement('img');image.src=src;image.alt='';image.decoding='async';image.dataset.armorArtwork=armorId;art.replaceChildren(image);}
   });
   if(mode){const scene={campaign:assets.map_1,story:assets.map_5,endless:assets.map_6,survival:assets.map_2}[mode];card.style.setProperty('--card-scene',`url("${new URL(scene||assets.map_4,document.baseURI).href}")`);}
  }
  if(key==='journal')for(const card of cards){
   if(card.querySelector('.read-entry'))continue;
   const button=document.createElement('button');button.className='read-entry';button.textContent='Read entry';
   button.onclick=()=>{
    const copy=card.cloneNode(true) as HTMLElement;copy.querySelector('.read-entry')?.remove();
    const close=document.createElement('button');close.textContent='Close entry';close.onclick=()=>reader.close();
    reader.replaceChildren(copy,close);reader.showModal();close.focus();
   };card.append(button);
  }
  const width=section.clientWidth;
  const columns=key==='journal'?1:Math.max(1,Math.min(4,cards.length,Math.floor((width+12)/280)));
  const intro=container.querySelector<HTMLElement>(':scope > .tab-intro');
  const available=container.clientHeight-(intro?.getBoundingClientRect().height||0)-(intro?12:0);
  const target=key==='modes'?380:key==='skills'?340:300;
  const rows=key==='journal'?1:Math.max(1,Math.min(2,Math.ceil(cards.length/columns),Math.floor((available+12)/(target+12))));
  container.style.setProperty('--screen-columns',String(columns));
  container.style.setProperty('--screen-rows',String(rows));
  const size=columns*rows,total=Math.ceil(cards.length/size),index=Math.min(viewports.get(key)||0,total-1);
  viewports.set(key,index);
  cards.forEach((card,i)=>{card.hidden=i<index*size||i>=(index+1)*size;});
  let pager=section.querySelector<HTMLElement>('.screen-pager');
  if(!pager){pager=document.createElement('nav');pager.className='screen-pager';pager.setAttribute('aria-label','Browse '+key);section.append(pager);}
  pager.hidden=total<=1;
  pager.replaceChildren();
  for(const [label,delta] of [['Previous',-1],['Next',1]] as const){
   const button=document.createElement('button');button.textContent=label;
   button.disabled=delta<0?index===0:index===total-1;
   button.onclick=()=>{viewports.set(key,index+delta);paginate(container,section,key);const replacement=Array.from(section.querySelectorAll<HTMLButtonElement>('.screen-pager button')).find(b=>b.textContent===label&&!b.disabled);replacement?.focus();};
   pager.append(button);
   if(delta<0){const count=document.createElement('span');count.textContent=`${index+1} / ${total}`;count.setAttribute('aria-live','polite');pager.append(count);}
  }
 }
 function layout(){
  queued=false;const page=document.body.dataset.page||'home';
  if(page==='modes')paginate(document.querySelector<HTMLElement>('.mode-grid')!,get('modesScreen'),'modes');
  if(['armory','supplies','armor','forge','heroes','skills','camp','journal'].includes(page))paginate(get('shop'),get('managementScreen'),page);
 }
 function schedule(){if(!queued){queued=true;requestAnimationFrame(layout);}}
 new MutationObserver(schedule).observe(get('shop'),{childList:true});
 new MutationObserver(schedule).observe(document.body,{attributes:true,attributeFilter:['data-page']});
 window.addEventListener('resize',schedule);
 schedule();
}
