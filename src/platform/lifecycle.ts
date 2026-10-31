import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import type { GameRuntime } from '../engine/contracts';
export function attachPlatformLifecycle(runtime:GameRuntime):()=>void{
  const controller=new AbortController(),options={signal:controller.signal};
  document.addEventListener('visibilitychange',()=>{if(document.hidden)runtime.suspend()},options);
  window.addEventListener('pagehide',()=>runtime.flush(),options);
  const listeners: Array<{remove():Promise<void>}>=[];let disposed=false;
  if(Capacitor.isNativePlatform()){
    const remember=(p:Promise<{remove():Promise<void>}>)=>void p.then(h=>{if(disposed)void h.remove();else listeners.push(h)});
    remember(App.addListener('appStateChange',state=>{if(!state.isActive)runtime.suspend()}));
    remember(App.addListener('backButton',()=>runtime.suspend()));
  }
  return()=>{disposed=true;controller.abort();for(const h of listeners)void h.remove()};
}
