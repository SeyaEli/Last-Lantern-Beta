const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),sharp=require('sharp'),{createCanvas,loadImage}=require('@napi-rs/canvas');
const root=path.resolve(__dirname,'..');
(async()=>{
 const {ARMORS}=await import('../src/systems/equipment.mjs'),sheet=createCanvas(1200,300),c=sheet.getContext('2d'),hashes=new Set(),results=[];
 c.fillStyle='#12212a';c.fillRect(0,0,1200,300);
 for(const [i,armor]of ARMORS.entries()){
  const file=path.join(root,'public/assets/armor',armor.id+'.png'),metadata=await sharp(file).metadata(),stats=await sharp(file).stats();
  assert(metadata.hasAlpha,armor.id+' needs transparency');assert(metadata.width>=256&&metadata.height>=256);assert(stats.channels[3].min===0&&stats.channels[3].max>0,armor.id+' needs transparent margins and visible artwork');
  hashes.add(require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
  const image=await loadImage(file);c.drawImage(image,i*200+10,10,180,240);c.fillStyle='#f5e7ca';c.font='13px Georgia';c.textAlign='center';c.fillText(armor.name,i*200+100,277);
  results.push({id:armor.id,width:metadata.width,height:metadata.height,transparent:true});
 }
 assert.equal(hashes.size,6);fs.writeFileSync(path.join(root,'tests/armor-art-gallery.png'),sheet.toBuffer('image/png'));fs.writeFileSync(path.join(root,'tests/armor-art-results.json'),JSON.stringify(results,null,2));console.log('Six distinct transparent armor assets verified.');
})().catch(error=>{console.error(error);process.exitCode=1});
