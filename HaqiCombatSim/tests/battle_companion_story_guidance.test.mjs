import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createAdventure} from '../js/adventure_core.js';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {companionWorldGuide,companionWorldTarget} from '../js/companion_guide_core.js';
import {forestCommissionGoal} from '../js/forest_commission_core.js';
import {createQuestDialogueController} from '../js/adventure/quest_dialogue_controller.js';
import {parseLocaleFile,lookup} from '../js/locale_core.js';
import {installDungeonIndex,installDungeons} from '../js/adventure_dungeons_core.js';
import {installIslandEncounters} from '../js/adventure_island_encounters_core.js';

const read=f=>JSON.parse(fs.readFileSync(new URL('../data/'+f,import.meta.url)));
const {content,dataset}=installExpansion(...['adventure/chapter.json','adventure/combat.json','adventure/pets.json','adventure/shop-candidates.json','kids/cards.json','kids/charms.json'].map(read));
content.worldMaps=Object.fromEntries(Object.entries(content.worldMapIndex.islands).map(([id,row])=>[id,JSON.parse(fs.readFileSync(new URL('../'+row.file,import.meta.url)))]));
installIslandEncounters(content,dataset,read('adventure/island-encounters.json'),read('kids/cards.json'));
content.dungeonJourneys=read('adventure/dungeon-journeys.json');
installDungeonIndex(content,read('adventure/dungeon-index.json'));
installDungeons(content,dataset,read('adventure/dungeons.json'),read('kids/cards.json'));
const fresh=()=>{const save=createAdventure(content);save.openingJourney={version:1,phase:'done'};return save;};
const camp={zone:'camp',npcs:[{id:36200,x:10,y:20},{id:36201,x:30,y:40}],landmarks:[{id:'forest-supplies-tent',x:50,y:60},{id:'forest-route-desk',x:70,y:80},{id:'journey:first-watch',x:90,y:100}],encounters:[]};
const watched=content.dungeons.find(row=>row.id==='journey:first-watch');
const spark=content.dungeons.find(row=>row.id==='journey:lost-spark');
const dungeonWorld=d=>({zone:d.id,portal:{x:100,y:120},encounters:d.arenas.map(row=>({id:row.id,x:25,y:50,blocked:[]}))});

for(const phase of ['offer','boots','delivery','note','briefing','patrol','report','done'])test(`companion follows the saved forest ${phase} objective without writing progress`,()=>{
 const save=fresh();save.forestCommission={version:1,phase,plan:'tracks',clearBaseline:0};
 const before=JSON.stringify(save),goal=forestCommissionGoal(save),guide=companionWorldGuide(save,content),target=companionWorldTarget(save,content,camp);
 assert.equal(guide.panel,'forest-commission');assert.equal(guide.text,goal.label);
 assert.equal(target.id,goal.id);assert.equal(target.kind,goal.kind);assert.equal(target.forestCommission,true);
 assert.equal(JSON.stringify(save),before);
 const missing={...camp,npcs:[],landmarks:[]};assert.equal(companionWorldTarget(save,content,missing),null);
});

test('investigation and both promise branches retain their exact physical target',()=>{
 const save=fresh();save.forestCommission={version:1,phase:'done',plan:'tracks',mystery:{version:1,status:'active',route:'tracks',observed:[],witness:false}};
 for(const observed of [[],['grass','paper'],['grass','paper','tracks','lamp']]){
  save.forestCommission.mystery.observed=observed;
  for(const witness of [false,true]){
   save.forestCommission.mystery.witness=witness;
   const goal=forestCommissionGoal(save);assert.equal(companionWorldGuide(save,content).text,goal.label);assert.equal(companionWorldTarget(save,content,camp).id,goal.id);
  }
 }
 for(const ending of ['sign','pair'])for(const stage of [ending==='sign'?'mark':'invite','confirm']){
  Object.assign(save.forestCommission.mystery,{status:'solved',ending,promise:{version:1,status:'active',stage}});
  const goal=forestCommissionGoal(save),before=JSON.stringify(save);
  assert.equal(companionWorldGuide(save,content).text,goal.label);assert.equal(companionWorldTarget(save,content,camp).id,goal.id);assert.equal(JSON.stringify(save),before);
 }
 save.forestCommission.mystery.promise.status='done';assert.notEqual(companionWorldGuide(save,content).panel,'forest-commission');
});

for(let stage=0;stage<=4;stage++)test(`watch guide and navigation agree after ${stage} cleared waves`,()=>{
 const save=fresh();save.zone=watched.id;save.dungeonRuns={[watched.id]:{cleared:watched.arenas.slice(0,stage).map(row=>row.id)}};
 const world=dungeonWorld(watched),before=JSON.stringify(save),guide=companionWorldGuide(save,content),target=companionWorldTarget(save,content,world);
 assert.equal(guide.track,stage===4?'dungeon-exit':'dungeon-next');assert.equal(target.kind,stage===4?'portal':'encounter');
 if(stage<4)assert.equal(target.id,watched.arenas[stage].id);
 assert.equal(companionWorldTarget(save,content,{...world,zone:'camp'}),null);assert.equal(JSON.stringify(save),before);
});

test('cooperative clear records override solo records and hidden or blocked waves are never recommended',()=>{
 const save=fresh();save.zone=watched.id;save.dungeonRuns={[watched.id]:{cleared:watched.arenas.map(row=>row.id)}};
 save.coopRun={dungeonId:watched.id,runs:{[watched.id]:{cleared:[watched.arenas[0].id]}}};
 const world=dungeonWorld(watched);world.encounters[1].hidden=true;world.encounters[2].blocked=['missing'];
 assert.equal(companionWorldGuide(save,content).track,'dungeon-next');assert.equal(companionWorldTarget(save,content,world).id,watched.arenas[3].id);
 world.encounters[3].hidden=true;assert.equal(companionWorldTarget(save,content,world),null);
});

test('the spark guide leads to the portal interaction before rescue and only offers departure after safety',()=>{
 const save=fresh();save.zone=spark.id;save.dungeonRuns={[spark.id]:{cleared:spark.arenas.map(row=>row.id)}};
 const world=dungeonWorld(spark),before=JSON.stringify(save);
 assert.equal(companionWorldGuide(save,content).label,'去照看火种');assert.equal(companionWorldTarget(save,content,world).kind,'portal');assert.equal(JSON.stringify(save),before);
 save.sparkRescue={version:2,status:'safe',method:'shelter',promise:'together',path:[16]};assert.equal(companionWorldGuide(save,content).label,'走向出口');
 assert.equal(companionWorldTarget(save,content,{...world,portal:null}),null);
});

test('exit and next-wave buttons walk to current scene targets without changing zones, clear records or rescue state',()=>{
 const save=fresh();save.zone=watched.id;save.dungeonRuns={[watched.id]:{cleared:[watched.arenas[0].id]}};
 const ctx={stage:'world',save,world:dungeonWorld(watched),assets:{content}},walks=[];
 const controller=createQuestDialogueController({getContext:()=>ctx,walkTo:(target,interact)=>walks.push({target,interact})});
 const before=JSON.stringify(save);controller.track('dungeon-next');assert.equal(walks.at(-1).target.id,watched.arenas[1].id);
 controller.track('dungeon-exit');assert.deepEqual(walks.at(-1),{target:{...ctx.world.portal,kind:'portal'},interact:true});assert.equal(JSON.stringify(save),before);
 ctx.world.zone='camp';controller.track('dungeon-exit');controller.track('dungeon-next');assert.equal(walks.length,2);
 ctx.world.zone=save.zone;ctx.world.portal=null;controller.track('dungeon-exit');assert.equal(walks.length,2);
 ctx.stage='battle';controller.track('dungeon-next');assert.equal(walks.length,2);
});

test('new guide buttons and spark advice have translations in all three supported dictionaries',()=>{
 for(const language of ['en','ja','ko']){
  const dict=parseLocaleFile(fs.readFileSync(new URL(`../data/adventure/locale/${language}.txt`,import.meta.url),'utf8'));
  for(const key of ['查看下一步','走向出口','继续巡逻','去照看火种','火种还在等你。到洞口看看它，再一起离开。','火种已经在避风灯台安顿好了。'])assert.notEqual(lookup(dict,key),key,`${language}: ${key}`);
 }
});


test('companion wordplay advice follows each saved round and target language without changing progress',()=>{
 for(const language of ['en','ja','ko','zh-CN'])for(const step of [0,1,2]){
  const save=fresh();save.languageLearning={target:language};save.openingJourney.wordplay={step,language};
  const before=JSON.stringify(save),guide=companionWorldGuide(save,content);
  assert.equal(guide.track,'companion-wordplay');assert.equal(guide.label,'玩口令');
  assert.equal(companionWorldTarget(save,content,camp),null,'an invitation beside the player must not point toward another quest');
  assert.equal(guide.textKey,['先用{language}和它打个招呼。','试着用{language}请它跳一下。','用{language}叫它到你身边来。'][step]);
  assert.equal(guide.text,guide.textKey.replace('{language}',guide.vars.language));
  for(const locale of ['en','ja','ko']){
   const table=parseLocaleFile(fs.readFileSync(new URL('../data/adventure/locale/'+locale+'.txt',import.meta.url),'utf8'));
   assert.ok(table[guide.textKey]);assert.ok(table[guide.vars.language]);
  }
  assert.equal(JSON.stringify(save),before);
 }
});
