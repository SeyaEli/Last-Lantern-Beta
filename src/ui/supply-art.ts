import { SUPPLY_ART_FILES } from '../systems/supplies.mjs';
export function supplyArtwork(id:string){
 const file=(SUPPLY_ART_FILES as Record<string,string>)[id];
 return file?new URL(file,document.baseURI).href:undefined;
}
