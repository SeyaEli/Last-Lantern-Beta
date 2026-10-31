import manifest from './assets.json';
import type { DecodedAssets } from './contracts';
export { manifest };
export async function loadAssets(progress:(loaded:number,total:number)=>void):Promise<DecodedAssets>{
  const entries=Object.entries(manifest),images:DecodedAssets={};let done=0;
  // Bound simultaneous decodes to avoid a large transient allocation on Android.
  let next=0;
  await Promise.all(Array.from({length:4},async()=>{while(next<entries.length){const[id,url]=entries[next++];const image=new Image();image.src=url;await image.decode().catch(()=>{throw new Error('Could not load game art: '+id)});images[id]=image;progress(++done,entries.length)}}));
  return images;
}
