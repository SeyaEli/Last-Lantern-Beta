import Phaser from 'phaser';
import { loadAssets } from './engine/loadAssets';
import { LanternScene } from './game/LanternScene';
import './styles/game.css';
import './styles/platform.css';
const status=document.querySelector<HTMLElement>('#boot-message')!;
async function start(){
  try{
    const images=await loadAssets((done,total)=>status.textContent=`Loading Last Lantern · ${Math.round(done/total*100)}%`);
    new Phaser.Game({type:Phaser.CANVAS,canvas:document.querySelector<HTMLCanvasElement>('#game')!,width:800,height:500,
      transparent:true,pixelArt:true,antialias:false,banner:false,scene:[new LanternScene(images)],
      scale:{mode:Phaser.Scale.NONE},input:{gamepad:true,keyboard:false,mouse:false,touch:false},
      audio:{noAudio:true},fps:{target:60,smoothStep:false}});
  }catch(error){status.textContent='Unable to start Last Lantern. '+(error instanceof Error?error.message:String(error));console.error(error)}
}
void start();
