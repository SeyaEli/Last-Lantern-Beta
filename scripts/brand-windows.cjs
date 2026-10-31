const path=require('node:path');
module.exports=async context=>{
 if(context.electronPlatformName!=='win32')return;
 const {rcedit}=await import('rcedit');
 await rcedit(path.join(context.appOutDir,'Last Lantern.exe'),{icon:path.join(context.packager.projectDir,'public/branding/icon.ico'),'version-string':{ProductName:'Last Lantern',FileDescription:'Last Lantern'}});
};
