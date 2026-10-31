export type GameAction = 'skill'|'dash'|'pause'|'interact'|'lantern';
export interface GameRuntime {
  step(seconds:number):void; render():void; action(name:GameAction):void;
  setDirection(x:number,y:number):void; suspend():void; flush():void; destroy():void;
  readonly state:{playing:boolean;paused:boolean;page:string};
}
export type DecodedAssets = Record<string, HTMLImageElement>;
