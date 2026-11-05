// Shared equipment has one consistent painted portrait wherever it is viewed.
const armorIds=new Set(['travel_cloak','iron_vest','briar_coat','moonweave','warden_plate','dawnward']);
export function armorArtwork(id:string){
 return armorIds.has(id)?new URL(`./assets/armor/${id}.png`,document.baseURI).href:null;
}
