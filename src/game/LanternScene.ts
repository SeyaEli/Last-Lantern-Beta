import Phaser from 'phaser';
import { createGameRuntime } from '../engine/runtime.js';
import { manifest } from '../engine/loadAssets';
import type { DecodedAssets, GameRuntime } from '../engine/contracts';
import { attachPlatformLifecycle } from '../platform/lifecycle';
class LanternSurface extends Phaser.GameObjects.GameObject {
  constructor(scene:Phaser.Scene,private runtime:GameRuntime){super(scene,'LanternSurface')}
  renderCanvas(renderer:Phaser.Renderer.Canvas.CanvasRenderer){
    const context=renderer.currentContext;context.save();context.setTransform(1,0,0,1,0,0);
    this.runtime.render();context.restore();
  }
}
export class LanternScene extends Phaser.Scene {
  private runtime!:GameRuntime;
  private detach?:()=>void;
  private previousButtons:boolean[]=[];
  private usingPad=false;
  constructor(private images:DecodedAssets){super({key:'Lantern'})}
  create(){
    this.runtime=createGameRuntime({assetManifest:manifest,images:this.images}) as GameRuntime;
    this.add.existing(new LanternSurface(this,this.runtime));
    this.detach=attachPlatformLifecycle(this.runtime);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{this.detach?.();this.runtime.destroy()});
    document.querySelector('#boot-status')?.remove();
  }
  update(_time:number,delta:number){
    const pad=this.input.gamepad?.getPad(0);
    if(pad?.connected){
      const x=pad.leftStick.x||Number(pad.right)-Number(pad.left),y=pad.leftStick.y||Number(pad.down)-Number(pad.up),moving=Math.abs(x)>.25||Math.abs(y)>.25;
      if(moving||this.usingPad)this.runtime.setDirection(x,y);this.usingPad=moving;
      const actions=['skill','dash','interact','pause','lantern'] as const;
      for(const[index,button]of [0,1,2,9,3].entries()){const down=!!pad.buttons[button]?.pressed;if(down&&!this.previousButtons[button])this.runtime.action(actions[index]);this.previousButtons[button]=down}
    }else if(this.usingPad){this.runtime.setDirection(0,0);this.previousButtons=[];this.usingPad=false}
    this.runtime.step(Math.min(.05,delta/1000));
  }
}
