import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {homeObjects,applyHomeAction} from '../js/home_actions_core.js';
import {chunkKey,footprint,validateHomePart} from '../js/home_core.js';
import {findHomePath,stepHomeWalk} from '../js/home_walk_core.js';
import {starterRoomLayout,starterBlanketReaction,starterLampExercise,matchStarterLampRequest,STARTER_ROOM_ID,STARTER_BLANKET_ID,STARTER_CHAIR_ID} from '../js/home_starter_room_core.js';

const catalog=JSON.parse(readFileSync(new URL('../data/adventure/home/catalog.json',import.meta.url),'utf8')).items;

test('starter room uses existing catalog and saves the selected pet with both movable pieces',()=>{
 const {home,parts}=starterRoomLayout(catalog,'chosen-pet');
 assert.equal(home.revision,1);
 for(const key of Object.keys(home.parts))validateHomePart(key.split(':')[0],parts[key],catalog);
 assert.deepEqual(parts.residents['chosen-pet'],{x:3.2,y:3.2});
 const objects=homeObjects(parts);
 assert.equal(objects.filter(row=>row.itemId==='build-wood-window').length,1);
 assert.equal(objects.find(row=>row.id===STARTER_BLANKET_ID).itemId,'blanket');
 assert.equal(objects.find(row=>row.id===STARTER_CHAIR_ID).itemId,'chair');
});

test('the pet has a reachable window spot and a distinct sleeping corner',()=>{
 const {home,parts}=starterRoomLayout(catalog,'chosen-pet');
 for(const [position,expected] of [[{x:4,y:1.2},'sunbathe'],[{x:1.8,y:1.2},'sleep']]){
  applyHomeAction(parts,{type:'move',id:STARTER_BLANKET_ID,position},catalog);
  const objects=homeObjects(parts);
  const blanket=objects.find(row=>row.id===STARTER_BLANKET_ID);
  const area=footprint(blanket,catalog);
  const target={x:area.x+area.w/2,y:area.y+area.h*.85};
  assert.equal(starterBlanketReaction(blanket,objects),expected);
  const route=findHomePath(parts.residents['chosen-pet'],target,objects,catalog,home.seed);
  assert.ok(route.length>0);
  assert.ok(Math.hypot(route.at(-1).x-target.x,route.at(-1).y-target.y)<.1);
 }
});

test('the existing bedside lamp request places a real item in the room',()=>{
 const {parts}=starterRoomLayout(catalog,'chosen-pet');
 const itemId='bedside-lamp';
 const item=catalog.find(row=>row.id===itemId);
 for(const sentence of ['Can I have a lamp?','Can I have a bedside lamp?']){
  assert.equal(matchStarterLampRequest(sentence,item,{itemId}).candidates[0]?.itemId,itemId);
 }
 assert.deepEqual(starterLampExercise(item).practiceWords.en,['lamp']);
 assert.equal(item.en,'bedside lamp');
 assert.deepEqual(matchStarterLampRequest('Can I have a chair?',item,{itemId}).candidates,[]);
 assert.deepEqual(matchStarterLampRequest('Can I have a chair?',item,{itemId},{input:'speech',speechAttempts:3}).candidates,[]);
 parts['receipt:lamp']={};
 const object={id:'lamp-one',itemId,x:2,y:2,rotation:0};
 assert.equal(applyHomeAction(parts,{type:'summon',itemId,object,receipt:'lamp'},catalog),true);
 assert.equal(applyHomeAction(parts,{type:'summon',itemId,object,receipt:'lamp'},catalog),false);
 assert.equal(homeObjects(parts).find(row=>row.id===object.id).active,undefined);
});

test('a resident shows a blocked visit and resumes when the chair moves away',()=>{
 const app=readFileSync(new URL('../js/home_app.js',import.meta.url),'utf8');
 const source=app.slice(app.indexOf(' function invitePetToBlanket('),app.indexOf(' async function restoreEdit('));
 const {home,parts}=starterRoomLayout(catalog,'chosen-pet');
 const pet={id:'chosen-pet',...parts.residents['chosen-pet']};
 const objects=()=>homeObjects(parts);
 const controls=new Function(
  'home','parts','pets','currentObjects','catalog','selection','footprint','chunkKey','findHomePath','stepHomeWalk','isStarterFurniture','starterBlanketReaction',
  'let petFurnitureVisit=null,status;'+source+';function emit(){};return {invitePetToBlanket,stepPetFurnitureVisit,retryBlockedPetVisit,status:()=>status};'
 )(home,parts,[pet],objects,{items:catalog},null,footprint,chunkKey,findHomePath,stepHomeWalk,()=>true,starterBlanketReaction);
 applyHomeAction(parts,{type:'move',id:STARTER_BLANKET_ID,position:{x:4,y:1.2}},catalog);
 controls.invitePetToBlanket(objects().find(row=>row.id===STARTER_BLANKET_ID));
 applyHomeAction(parts,{type:'move',id:STARTER_CHAIR_ID,position:{x:4.5,y:2.4}},catalog);
 for(let i=0;i<100;i++)controls.stepPetFurnitureVisit(.05,objects());
 assert.equal(pet.activity,null);
 assert.match(controls.status(),/挡路/);
 applyHomeAction(parts,{type:'move',id:STARTER_CHAIR_ID,position:{x:6,y:3}},catalog);
 controls.retryBlockedPetVisit();
 for(let i=0;i<100&&!pet.activity;i++)controls.stepPetFurnitureVisit(.05,objects());
 assert.equal(pet.activity,'sunbathe');
 assert.equal(pet.targetId,STARTER_BLANKET_ID);
});

test('starter entry reopens the saved room and leaves deleted rooms deleted',async()=>{
 const app=readFileSync(new URL('../js/home_app.js',import.meta.url),'utf8');
 const entry=app.slice(app.indexOf(' async function enterStarterRoom('),app.indexOf(' function roster('));
 let saved,installs=0;
 const visits=[];
 const enterStarterRoom=new Function(
  'STARTER_ROOM_ID','store','check','ownedPetRecords','getContext','starterRoomLayout','catalog','enter',
  entry+';return enterStarterRoom;'
 )(STARTER_ROOM_ID,{
  get:async()=>saved,install:async home=>{installs++;return saved=home;}
 },()=>{},()=>({'chosen-pet':{}}),()=>({save:{}}),starterRoomLayout,{items:catalog},row=>visits.push(row.name));
 await enterStarterRoom();
 saved.name='我改过的小屋';
 await enterStarterRoom();
 saved.deleted=true;
 await enterStarterRoom();
 assert.equal(installs,1);
 assert.deepEqual(visits,['抱抱龙的小屋','我改过的小屋']);
});
