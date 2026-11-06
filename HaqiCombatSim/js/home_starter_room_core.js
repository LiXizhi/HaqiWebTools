import {canPlace,chunkKey,createHome,matchHomeSpell} from './home_core.js';
import {buildingTemplateObjects,validateTemplatePlacement} from './home_building_templates_core.js';
import {compareDungeonSpeech} from './dungeon_speech_core.js';

export const STARTER_ROOM_ID='starter-room-v1';
export const STARTER_ROOM_SPAWN={x:4.5,y:4.5};
export const STARTER_BLANKET_ID='starter-blanket';
export const STARTER_CHAIR_ID='starter-chair';
export const STARTER_ROOM_HINT='把毯子拖到窗边或角落，看看抱抱龙会怎么选。';

export function starterLampExercise(item){
 return {
  ...item,en:'lamp',
  sentences:{...item.sentences,en:['Can I have a lamp?','Can I have a bedside lamp?']},
  practiceWords:{...item.practiceWords,en:['lamp']}
 };
}

export function matchStarterLampRequest(text,item,selection,options){
 const exercise=starterLampExercise(item);
 const result=matchHomeSpell(text,[exercise],'en',selection,options);
 if(compareDungeonSpeech(text,exercise.en,'en').accuracy===1)return result;
 return {...result,candidates:[],error:'这次想要的是灯。试试用上 lamp。'};
}

export function starterRoomLayout(catalog,petId){
 const home=createHome(STARTER_ROOM_ID,'抱抱龙的小屋',1);
 const house=buildingTemplateObjects('wood',1,0,'starter-house').map(row=>{
  if(row.y===0&&row.x===4&&row.itemId==='build-wood-window')return row;
  return row.itemId==='build-wood-window'?{...row,itemId:'build-wood-wall'}:row;
 });
 const furniture=[
  {id:STARTER_BLANKET_ID,itemId:'blanket',x:4,y:3,rotation:0},
  {id:STARTER_CHAIR_ID,itemId:'chair',x:6,y:3,rotation:0}
 ];
 if(!validateTemplatePlacement(house,[],catalog,[STARTER_ROOM_SPAWN],home.seed))throw Error('小屋暂时无法摆放');
 if(!furniture.every((row,index)=>canPlace(row,[...house,...furniture.slice(0,index)],catalog).ok))throw Error('小屋家具暂时无法摆放');
 const residents={$selection:{version:1}};
 if(petId)residents[petId]={x:3.2,y:3.2};
 const parts={residents};
 for(const row of [...house,...furniture]){
  const key='chunk:'+chunkKey(row.x,row.y);
  (parts[key]??={})[row.id]=row;
 }
 home.revision=1;
 home.updatedAt=Date.now();
 home.parts=Object.fromEntries(Object.keys(parts).map(key=>[key,home.revision]));
 return {home,parts};
}

export function starterBlanketReaction(blanket,objects){
 const window=objects.find(row=>row.itemId==='build-wood-window'&&row.y===0&&row.x===4);
 return window&&blanket.y>=1&&blanket.y<2&&Math.abs(blanket.x-window.x)<1.25?'sunbathe':'sleep';
}
