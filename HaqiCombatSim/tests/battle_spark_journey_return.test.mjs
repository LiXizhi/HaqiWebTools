import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {enterDungeon} from '../js/adventure_dungeons_core.js';
import {dungeonProgress} from '../js/adventure_coop_core.js';
import {nextTowerMilestone} from '../js/dungeon_tactics_core.js';
import {towerMilestoneBonus} from '../js/adventure_dungeon_journeys_core.js';
import {SPARK_DUNGEON,sparkRescueReady,applySparkRescue} from '../js/spark_rescue_core.js';
import {tr,fill,setTranslator} from '../js/locale_runtime.js';
import {parseLocaleFile,lookup} from '../js/locale_core.js';

const id=SPARK_DUNGEON;
const dungeon={id,name:'失落的火种',kind:'elite',playable:true,partySize:2,recommendedLevel:6,arenas:[{id:'first'},{id:'last'}]};
const content={dungeons:[dungeon],monsters:{},worldMaps:{[id]:{spawn:{x:0,y:0},portal:{x:200,y:200}}}};
const ready=()=>({zone:'camp',position:{x:20,y:20},formation:[],heroSlot:0,revision:0,inventory:{100:30},dungeonRuns:{[id]:{cleared:['first','last']}},dungeonChallengeRecords:{[id]:{firstRewarded:true}}});

// Render the actual confirmation view and follow its prepare callback into the
// real entry action. Decorative enemy/tactics cards are outside this regression.
function render(save,{d=dungeon,restart=false}={}){
 const all=[];
 function el(tag,className='',...children){
  const node={tag,className,children,textContent:typeof children[0]==='string'?tr(children[0]):'',append(...c){this.children.push(...c);},replaceChildren(...c){this.children=c;},setAttribute(){},focus(){},querySelector(){return all.find(n=>n.className==='primary');}};
  all.push(node);return node;
 }
 const requests=[];
 const context=vm.createContext({el,tr,fill,SPARK_DUNGEON,dungeonProgress,nextTowerMilestone,towerMilestoneBonus,createCloseButton:click=>Object.assign(el('button'),{click}),button:(text,click,cls)=>Object.assign(el('button',cls,text),{click}),dungeonTacticsProfile:()=>null,dungeonEnemyIntel:()=>null,guidanceCard:()=>el('aside'),towerRecord:()=>({floor:0,claimed:[]}),towerRewardSteps:()=>[]});
 vm.runInContext(fs.readFileSync(new URL('../js/views/adventure/view_dungeon_journey.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export function','function'),context);
 context.renderDungeonJourney(el('root'),{save,assets:{content},dungeon:d,restart},{close(){},prepare(value){requests.push(value);if(d.id===id)enterDungeon(save,content,id,{restart:value});}});
 return {all,requests,primary:all.find(n=>n.className==='primary')};
}

for(const state of ['not-started','active','safe'])test(`completed spark journey returns without refighting guards: ${state}`,()=>{
 const save=ready();
 if(state!=='not-started'){
  save.zone=id;save.position={x:200,y:200};
  applySparkRescue(save,content,{step:'start',method:'lamp'});
  for(const to of (state==='safe'?[17,12,7,2,3,4]:[17]))applySparkRescue(save,content,{step:'move',to});
  if(state==='safe')applySparkRescue(save,content,{step:'finish',promise:'signal'});
  save.zone='camp';
 }
 const before=structuredClone(save),view=render(save);
 assert.equal(view.primary.textContent,state==='safe'?'重访避风灯台':'继续护送火种');
 view.primary.click();assert.deepEqual(view.requests,[false]);
 assert.equal(sparkRescueReady(save,content),true);
 assert.deepEqual(save.dungeonRuns[id].cleared,before.dungeonRuns[id].cleared);
 assert.deepEqual(save.sparkRescue,before.sparkRescue);
 assert.deepEqual(save.inventory,before.inventory);
 assert.deepEqual(save.dungeonChallengeRecords,before.dungeonChallengeRecords);
 if(state!=='safe'){
  save.position={x:200,y:200};
  const action=state==='not-started'?{step:'start',method:'shelter'}:{step:'move',to:12};
  applySparkRescue(save,content,action);
  assert.deepEqual(save.sparkRescue.path,state==='not-started'?[16]:[16,17,12]);
 }
});

test('spark return offers an explicit fresh run and honors an explicit restart entry',()=>{
 for(const explicit of [false,true]){
  const save=ready(),view=render(save,{restart:explicit});
  const button=explicit?view.primary:view.all.find(n=>n.tag==='button'&&n.textContent==='从头开始新一轮');
  button.click();assert.deepEqual(view.requests,[true]);
  assert.deepEqual(save.dungeonRuns[id].cleared,[]);
  assert.equal(sparkRescueReady(save,content),false);
  assert.deepEqual(save.dungeonChallengeRecords[id],{firstRewarded:true});
 }
});

test('ordinary completed journeys still restart; incomplete journeys and towers keep their entry behavior',()=>{
 for(const [kind,cleared,label,restart]of [['elite',['first','last'],'从头开始新一轮',true],['elite',['first'],'继续本轮',false],['elite',[],'进入',false],['tower',['first','last'],'进入',false]]){
  const d={...dungeon,id:'journey:other',kind,floors:2};
  const save=ready();save.dungeonRuns[d.id]={cleared};
  const view=render(save,{d});assert.equal(view.primary.textContent,label);
  view.primary.click();assert.deepEqual(view.requests,[restart]);
 }
});

for(const language of ['en','ja','ko'])test(`${language}: returning to the spark uses translated labels and keeps progress`,()=>{
 const dict=parseLocaleFile(fs.readFileSync(new URL(`../data/adventure/locale/${language}.txt`,import.meta.url),'utf8'));
 setTranslator(text=>lookup(text,language,{[language]:dict}),language);
 try{
  for(const safe of [false,true]){
   const save=ready();if(safe)save.sparkRescue={status:'safe'};
   const view=render(save),key=safe?'重访避风灯台':'继续护送火种';
   assert.ok(dict[key]);assert.equal(view.primary.textContent,dict[key]);
   assert.ok(dict['从头开始新一轮']);
   assert.ok(view.all.some(n=>n.tag==='button'&&n.className==='secondary'&&n.textContent===dict['从头开始新一轮']));
   const description='守卫已经清理，可以前往出口旁的避风灯台。';
   assert.ok(dict[description]);assert.ok(view.all.some(n=>n.textContent===dict[description]));
   view.primary.click();assert.equal(sparkRescueReady(save,content),true);
  }
 }finally{setTranslator(null);}
});
