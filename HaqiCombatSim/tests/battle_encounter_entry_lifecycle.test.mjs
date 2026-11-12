import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../js/adventure_app.js',import.meta.url),'utf8');
const begin=source.indexOf("if(target.kind==='encounter')safely(async()=>{")+"if(target.kind==='encounter')safely(async()=>{".length;
const script='async function enter(){'+source.slice(begin,source.indexOf('\n    });',begin))+'}';
function setup(){let resolve,started=0;const dictionary=new Promise(r=>resolve=r);
 const c=vm.createContext({save:{position:{x:10,y:10},languageLearning:{enabled:true,target:'en'}},roleEpoch:1,world:{zone:'camp'},roleStore:{owner:'guest',catalog:{activeId:'a'}},stage:'world',panel:null,dialog:null,languageAdventure:{},characterChat:{},secondCharacterChat:null,localPlay:{active:false,paused:false},keys:new Set(),joystick:{x:0,y:0},heldPointer:null,path:[],destination:null,encounterStarting:false,
 W:{distance:(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)},perf:{start(){}},dictionaryCardKey:()=> 'owner-a',dictionaryCardsStore:{read:()=>dictionary},loadWordCards:async()=>{},readPracticeCards:async()=>null,wordLanguage:x=>x,wordCardRows:[],toast(){},target:{id:'scout'},assets:{content:{},dataset:{}},membership:{state:{}},Date,
 A:{beginEncounter:(save)=>{started++;save.pendingEncounter={seed:1};}},languageTasks:{battleTicket:()=>null},persist(){},P:{restorePveBattle:()=>({})},close(){},nodes:{hud:{},battle:{replaceChildren(){}}},renderer:{prepareScene(){}},battleIntro:{open(){}},battle:null,selected:null,discarded:[],animation:null,petCardsOpen:false,runeCardsOpen:false});vm.runInContext(script,c);return {c,resolve,get started(){return started;}};}
test('delayed encounter dictionary accepts same-role background save clone and enters battle',async()=>{
 const t=setup(),pending=t.c.enter();t.c.save=structuredClone(t.c.save);t.c.save.petWorld={backgroundSaved:true};t.resolve(null);await pending;
 assert.equal(t.started,1);assert.equal(t.c.stage,'battle');assert.equal(t.c.encounterStarting,false);
});
test('delayed encounter dictionary refuses obsolete lifecycle and manual movement',async()=>{
 for(const change of [c=>c.roleEpoch++,c=>c.roleStore.owner='other',c=>c.roleStore.catalog.activeId='b',c=>c.world={zone:'camp'},c=>c.stage='title',c=>c.save.languageLearning.target='zh',c=>c.save.pendingEncounter={},c=>c.panel='bag',c=>c.dialog={},c=>c.save.position.x+=10,c=>c.path=[{x:20,y:20}],c=>c.destination={x:20,y:20},c=>c.keys.add('right'),c=>c.joystick.x=1,c=>c.heldPointer={active:true}]){
  const t=setup(),pending=t.c.enter();change(t.c);t.resolve(null);await pending;assert.equal(t.started,0,String(change));assert.equal(t.c.encounterStarting,false);
 }
});
