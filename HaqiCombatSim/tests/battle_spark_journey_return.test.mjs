import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {enterDungeon} from '../js/adventure_dungeons_core.js';
import {dungeonProgress} from '../js/adventure_coop_core.js';
import {dungeonWatchStory} from '../js/dungeon_watch_story_core.js';
import {SPARK_DUNGEON,sparkRescueReady,applySparkRescue} from '../js/spark_rescue_core.js';
import {tr,fill,setTranslator} from '../js/locale_runtime.js';
import {parseLocaleFile,lookup} from '../js/locale_core.js';

const id=SPARK_DUNGEON;
const dungeon={id,name:'失落的火种',kind:'elite',playable:true,partySize:2,recommendedLevel:6,arenas:[{id:'first'},{id:'last'}]};
const content={dungeons:[dungeon],monsters:{},worldMaps:{[id]:{spawn:{x:0,y:0},portal:{x:200,y:200}}}};
const ready=()=>({zone:'camp',position:{x:20,y:20},formation:[],heroSlot:0,revision:0,inventory:{100:30},dungeonRuns:{[id]:{cleared:['first','last']}},dungeonChallengeRecords:{[id]:{firstRewarded:true}}});

// Render the actual confirmation view and follow its prepare callback into the
// real entry action. Decorative enemy/tactics cards are outside this regression.
function render(save,{d=dungeon,restart=false,tactic=null,intel=null,missing=false}={}){
 const all=[];
 function el(tag,className='',...children){
  const node={tag,className,children,textContent:typeof children[0]==='string'?tr(children[0]):'',append(...c){this.children.push(...c);},replaceChildren(...c){this.children=c;},setAttribute(){},focus(){},querySelector(){return all.find(n=>n.className==='primary');}};
  all.push(node);return node;
 }
 const requests=[];
 const context=vm.createContext({el,tr,fill,SPARK_DUNGEON,dungeonProgress,dungeonWatchStory,createCloseButton:click=>Object.assign(el('button'),{click}),button:(text,click,cls)=>Object.assign(el('button',cls,text),{click}),dungeonTacticsProfile:()=>tactic,dungeonTacticsPreparation:()=>({missing,messages:['check']}),playerSpec:()=>({}),dungeonFirstReward:()=>null,dungeonHonorTitle:()=>'',dungeonChallengeMessages:()=>[],dungeonEnemyIntel:()=>intel,guidanceCard:()=>el('aside'),towerRecord:()=>({floor:0,claimed:[]}),towerRewardSteps:()=>[]});
 vm.runInContext(fs.readFileSync(new URL('../js/views/adventure/view_dungeon_journey.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export function','function'),context);
 context.renderDungeonJourney(el('root'),{save,assets:{content},dungeon:d,restart},{close(){},prepare(value){requests.push(value);if(d.id===id)enterDungeon(save,content,id,{restart:value});}});
 return {all,requests,primary:all.find(n=>n.className==='primary')};
}

for(const state of ['not-started','active','safe'])test(`completed spark journey returns without refighting guards: ${state}`,()=>{
 const save=ready();
 if(state!=='not-started'){
  save.zone=id;save.position={x:200,y:200};
  applySparkRescue(save,content,{step:'start',method:'lamp'});
  for(const to of (state==='safe'?[17,12,7,2,3,4]:[17])){
   if(to===7)applySparkRescue(save,content,{step:'wait'});
   applySparkRescue(save,content,{step:'move',to});
   assert.equal(save.sparkRescue.path.at(-1),to);
  }
  if(state==='safe'){
   applySparkRescue(save,content,{step:'signal-start'});
   for(const lit of [true,false,true])applySparkRescue(save,content,{step:'signal-pulse',lit});
   assert.equal(save.sparkRescue.status,'safe');
  }
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

test('entry presents the next actual uncleared wave without changing saved progress',()=>{
 const d={...dungeon,id:'journey:other',arenas:['a','b','c','d'].map(id=>({id}))};
 const tactic={version:2,steps:['wave one','wave two','wave three','wave four']};
 for(const cleared of [[],['a'],['a','c'],['obsolete'],['a','a','obsolete']]){
  const save=ready();save.dungeonRuns[d.id]={cleared};const before=structuredClone(save);
  const view=render(save,{d,tactic});
  const count=d.arenas.filter(a=>cleared.includes(a.id)).length,index=d.arenas.findIndex(a=>!cleared.includes(a.id));
  assert.ok(view.all.some(n=>n.textContent===`已清理 ${count} / 4 处营地`));
  assert.ok(view.all.some(n=>n.textContent===`接下来：第 ${index+1} 波`));
  assert.ok(view.all.some(n=>n.textContent===tactic.steps[index]));
  assert.equal(view.all.filter(n=>n.className==='primary').length,1);
  assert.deepEqual(save,before);
 }
});

test('explicit restart previews wave one while retaining saved progress until entry',()=>{
 const save=ready(),before=structuredClone(save),view=render(save,{restart:true,tactic:{steps:['wave one','wave two']}});
 assert.ok(view.all.some(n=>n.textContent==='已清理 0 / 2 处营地'));
 assert.ok(view.all.some(n=>n.textContent==='接下来：第 1 波'));
 assert.deepEqual(save,before);
});

test('returning to the spark does not advertise a new combat wave',()=>{
 const view=render(ready(),{tactic:{steps:['wave one','wave two']}});
 assert.ok(!view.all.some(n=>n.className==='journey-entry-progress'));
});

test('reference details remain closed while missing preparation opens and boss warning stays visible',()=>{
 const d={...dungeon,id:'journey:other'},tactic={steps:['hint']};
 const intel={waves:2,maxEnemies:2,minLevel:6,maxLevel:8,toughest:'boss',maxHp:10001};
 for(const missing of [false,true]){
  const view=render(ready(),{d,tactic,intel,missing});
  const check=view.all.find(n=>n.tag==='details'&&n.children[0]?.textContent==='出发前检查：等级、卡组与生命');
  assert.equal(check.open,missing);
  assert.ok(view.all.some(n=>n.className==='journey-entry-warning'));
  for(const details of view.all.filter(n=>n.tag==='details'&&n!==check))assert.ok(!details.open);
  const body=view.all.find(n=>n.className==='modal-body');
  assert.ok(body.children.findIndex(n=>n.className==='dungeon-actions')<body.children.findIndex(n=>n.className==='journey-entry-reference'));
 }
});

test('tower entry does not require an arenas array',()=>{
 const d={id:'tower',name:'Tower',kind:'tower',floors:10,recommendedLevel:1};
 assert.equal(render(ready(),{d}).primary.textContent,'进入');
});

test('entry follows the active cooperative run rather than personal cleared camps',()=>{
 const save=ready(),d={...dungeon,id:'journey:other'};
 save.dungeonRuns[d.id]={cleared:['first','last']};save.coopRun={runs:{[d.id]:{cleared:['first']}}};
 const before=structuredClone(save),view=render(save,{d,tactic:{steps:['first hint','last hint']}});
 assert.equal(view.primary.textContent,'继续本轮');
 assert.ok(view.all.some(n=>n.textContent==='接下来：第 2 波'));
 assert.deepEqual(save,before);
 const actions=view.all.find(n=>n.className==='dungeon-actions');
 assert.equal(actions.children[0],view.primary,'visual and keyboard action order agree');
});

for(const language of ['en','ja','ko'])test(`${language}: entry progress and reference labels are translated with placeholders intact`,()=>{
 const dict=parseLocaleFile(fs.readFileSync(new URL(`../data/adventure/locale/${language}.txt`,import.meta.url),'utf8'));
 for(const key of ['本轮进度','已清理 {cleared} / {total} 处营地','接下来：第 {wave} 波','查看完整敌情','查看伙伴出战说明','查看首通奖励','查看整轮战术','查看挑战实绩','查看配合与出牌建议']){
  assert.ok(dict[key],key);assert.notEqual(dict[key],key);
  assert.deepEqual([...dict[key].matchAll(/\{\w+\}/g)].map(x=>x[0]).sort(),[...key.matchAll(/\{\w+\}/g)].map(x=>x[0]).sort());
 }
 setTranslator(text=>lookup(text,language,{[language]:dict}),language);
 try{
  const save=ready(),d={...dungeon,id:'journey:other'};save.dungeonRuns[d.id]={cleared:['first']};
  const view=render(save,{d});assert.ok(view.all.some(n=>n.textContent===dict['接下来：第 {wave} 波'].replace('{wave}','2')));
 }finally{setTranslator(null);}
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

test('patrol entry shows the current connective scene without advancing progress',()=>{
 const d={...dungeon,id:'journey:first-watch',arenas:['a','b','c','d'].map(id=>({id}))};
 for(let stage=0;stage<4;stage++){
  const save=ready();save.forestCommission={plan:'tracks'};save.dungeonRuns[d.id]={cleared:d.arenas.slice(0,stage).map(a=>a.id)};
  const before=structuredClone(save),scene=dungeonWatchStory(save,d,save.dungeonRuns[d.id].cleared),view=render(save,{d});
  const story=view.all.find(n=>n.className==='journey-entry-story');assert.ok(story);
  assert.deepEqual(story.children.map(n=>n.textContent),[scene.title,scene.line,scene.reply]);
  assert.equal(story.children.some(n=>n.tag==='button'||n.tag==='details'),false);
  assert.deepEqual(save,before);assert.deepEqual(view.requests,[]);
 }
 assert.equal(render(ready()).all.some(n=>n.className==='journey-entry-story'),false);
});

test('restarting patrol previews its opening scene; coop entry follows the coop checkpoint',()=>{
 const d={...dungeon,id:'journey:first-watch',arenas:['a','b','c','d'].map(id=>({id}))};
 const save=ready();save.dungeonRuns[d.id]={cleared:['a','b','c','d']};
 for(const restart of [false,true]){
  const before=structuredClone(save),view=render(save,{d,restart});
  assert.equal(view.all.find(n=>n.className==='journey-entry-story').children[0].textContent,'雾里的第一盏灯');
  assert.deepEqual(save,before);
 }
 save.coopRun={runs:{[d.id]:{cleared:['a','b']}}};
 const before=structuredClone(save),view=render(save,{d});
 assert.equal(view.all.find(n=>n.className==='journey-entry-story').children[0].textContent,'风把灯影拉长了');
 assert.deepEqual(save,before);
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
