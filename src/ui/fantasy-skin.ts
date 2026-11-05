import { cardEmblem } from './card-art';

export function initializeFantasySkin(){
 document.documentElement.style.setProperty('--fantasy-banner',`url("${new URL('./assets/ui/menu-banner.png',document.baseURI).href}")`);
 document.documentElement.style.setProperty('--fantasy-card-frame',`url("${new URL('./assets/ui/card-frame.png',document.baseURI).href}")`);
 const symbols:Record<string,string>={home:'lantern',modes:'gate',armory:'blade',armor:'helm',forge:'forge',heroes:'banner',skills:'branch',camp:'campfire',journal:'book'};
 // Preserve the supplied illustration itself. Each crop is a view into that
 // sheet, not a stretched generic panel or an approximation of its medallion.
 const rows:Record<string,{y:number;height:number}>={armory:{y:70,height:265},armor:{y:326,height:195},forge:{y:520,height:195},heroes:{y:716,height:195},skills:{y:910,height:195},camp:{y:1107,height:195},journal:{y:1304,height:195}};
 const reference=new URL('./assets/ui/reference-menu.png',document.baseURI).href;
 for(const button of Array.from(document.querySelectorAll<HTMLButtonElement>('.home-menu button'))){
  const page=button.dataset.page||'home',label=button.firstChild?.textContent?.trim()||'',caption=button.querySelector('span')?.textContent||'';
  const copy=document.createElement('span');copy.className='menu-copy';
  const title=document.createElement('span');title.className='menu-title';title.textContent=label;
  const subtitle=document.createElement('span');subtitle.className='menu-caption';subtitle.textContent=caption;copy.append(title,subtitle);
  const row=rows[page];if(!row)continue;
  const art=document.createElement('span');art.className='menu-reference-art';art.setAttribute('aria-hidden','true');
  const id='menu-outline-'+page;
  const outline=page==='armory'?'M112 0 152 75 800 75 830 90 852 154 830 218 800 236 165 228 112 265 58 220 0 154 58 95 90 75Z':'M112 0 165 42 800 24 834 42 852 97 828 150 800 172 165 153 112 195 61 151 0 97 61 44Z';
  art.innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 852 ${row.height}" preserveAspectRatio="xMidYMid meet" focusable="false"><defs><clipPath id="${id}"><path d="${outline}"/></clipPath></defs><g clip-path="url(#${id})"><image href="${reference}" x="-68" y="-${row.y}" width="982" height="1602"/></g></svg>`;
  const image=art.querySelector('image')!;image.addEventListener('load',()=>{button.dataset.artReady='true'});
  button.style.setProperty('--menu-art-height',String(row.height));
  button.replaceChildren(art,copy);
 }
 document.querySelectorAll<HTMLButtonElement>('.world-nav button').forEach(button=>{
  const rune=document.createElement('span');rune.className='nav-rune';rune.setAttribute('aria-hidden','true');rune.innerHTML=cardEmblem(symbols[button.dataset.page||'home']||'lantern');button.prepend(rune);
 });
}
