// Deterministic icon sizes from the supplied official logo; no generated/redrawn art.
const fs=require('node:fs'),path=require('node:path');
const sharp=require('sharp');
const root=path.join(__dirname,'..'),brand=path.join(root,'public/branding');
const source=path.join(brand,'last-lantern-logo.png');
const background={r:7,g:10,b:16,alpha:1};
async function square(size,fraction=1){const inner=Math.round(size*fraction);return sharp(source).resize(inner,inner,{fit:'contain',background,kernel:'lanczos3'}).extend({top:Math.floor((size-inner)/2),bottom:Math.ceil((size-inner)/2),left:Math.floor((size-inner)/2),right:Math.ceil((size-inner)/2),background}).png().toBuffer()}
function ico(buffers,sizes){const header=Buffer.alloc(6+16*buffers.length);header.writeUInt16LE(1,2);header.writeUInt16LE(buffers.length,4);let offset=header.length;for(let i=0;i<buffers.length;i++){const p=6+i*16;header[p]=sizes[i]===256?0:sizes[i];header[p+1]=header[p];header.writeUInt16LE(1,p+4);header.writeUInt16LE(32,p+6);header.writeUInt32LE(buffers[i].length,p+8);header.writeUInt32LE(offset,p+12);offset+=buffers[i].length}return Buffer.concat([header,...buffers])}
(async()=>{
 fs.mkdirSync(brand,{recursive:true});const sizes=[16,32,48,64,128,256],buffers=[];
 for(const n of sizes)buffers.push(await square(n));
 fs.writeFileSync(path.join(brand,'icon.ico'),ico(buffers,sizes));
 for(const n of[180,256,512])fs.writeFileSync(path.join(brand,'icon-'+n+'.png'),await square(n));
 const res=path.join(root,'android/app/src/main/res');
 for(const[density,size]of Object.entries({mdpi:48,hdpi:72,xhdpi:96,xxhdpi:144,xxxhdpi:192})){
  const dir=path.join(res,'mipmap-'+density);fs.mkdirSync(dir,{recursive:true});
  for(const name of['ic_launcher','ic_launcher_round'])fs.writeFileSync(path.join(dir,name+'.png'),await square(size,.9));
  fs.writeFileSync(path.join(dir,'ic_launcher_foreground.png'),await square(Math.round(size*2.25),.62));
 }
 // Replace the template splash imagery in every existing orientation/density.
 for(const name of fs.readdirSync(res)){if(!name.startsWith('drawable'))continue;const file=path.join(res,name,'splash.png');if(fs.existsSync(file)){const meta=await sharp(file).metadata();await sharp(source).resize(meta.width,meta.height,{fit:'contain',background}).png().toFile(file+'.new');fs.renameSync(file+'.new',file)}}
 console.log('Prepared web, Windows and Android branding from the official logo');
})().catch(e=>{console.error(e);process.exitCode=1});
