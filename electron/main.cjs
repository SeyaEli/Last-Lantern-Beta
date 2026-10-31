const {app,BrowserWindow,protocol,net}=require('electron');
const path=require('node:path');const {pathToFileURL}=require('node:url');
protocol.registerSchemesAsPrivileged([{scheme:'lantern',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
app.setName('Last Lantern');let window;
app.whenReady().then(()=>{
 const root=path.resolve(__dirname,'../dist');
 protocol.handle('lantern',request=>{
  const url=new URL(request.url);if(url.hostname!=='game')return new Response('Not found',{status:404});
  let file;try{file=path.resolve(root,'.'+decodeURIComponent(url.pathname===''||url.pathname==='/'?'/index.html':url.pathname))}catch{return new Response('Bad path',{status:400})}
  if(!file.startsWith(root+path.sep))return new Response('Forbidden',{status:403});
  return net.fetch(pathToFileURL(file).href);
 });
 window=new BrowserWindow({title:'Last Lantern',icon:path.join(root,'branding/icon-256.png'),width:1280,height:900,minWidth:800,minHeight:600,backgroundColor:'#102127',autoHideMenuBar:true,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 window.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('lantern://game/'))event.preventDefault()});
 window.webContents.on('before-input-event',(event,input)=>{if(input.type==='keyDown'&&(input.key==='F11'||input.alt&&input.key==='Enter')){event.preventDefault();window.setFullScreen(!window.isFullScreen())}});
 window.loadURL('lantern://game/index.html');
});
app.on('window-all-closed',()=>app.quit());
