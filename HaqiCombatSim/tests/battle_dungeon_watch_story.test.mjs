import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {dungeonWatchStory,dungeonWatchRetryStory} from '../js/dungeon_watch_story_core.js';
import {buildBattleResultViewModel} from '../js/adventure/presenters/battle_view_model.js';
import {renderDungeonWatchRetry} from '../js/views/adventure/view_battle_review.js';
import {buildHudTrackerViewModel} from '../js/adventure/presenters/hud_view_model.js';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {createAdventure} from '../js/adventure_core.js';
import {tr,fill,setTranslator} from '../js/locale_runtime.js';
import {lookup,parseLocaleFile} from '../js/locale_core.js';

const dungeon={id:'journey:first-watch',kind:'elite',name:'晨雾中的巡夜灯',arenas:Array.from({length:4},(_,i)=>({id:`journey:first-watch:floor-${i+1}`,blocked:[]}))};
const ids=dungeon.arenas.map(row=>row.id);
for(let stage=0;stage<=4;stage++)test(`patrol journal follows saved wave ${stage} without writing progress`,()=>{
 const save={forestCommission:{plan:'tracks'}},cleared=ids.slice(0,stage),before=JSON.stringify({save,cleared,dungeon});
 const story=dungeonWatchStory(save,dungeon,cleared);
 assert.equal(story.stage,stage);assert.equal(story.id,`S1194-W0${stage}`);assert.equal(story.complete,stage===4);
 assert.equal(story.nextIndex,stage===4?null:stage);assert.equal(!!story.tip,stage<4);assert.match(story.remembered,/脚印/);
 assert.equal(JSON.stringify({save,cleared,dungeon}),before);
 story.title='changed';assert.notEqual(dungeonWatchStory(save,dungeon,cleared).title,'changed');
 assert.deepEqual(dungeonWatchStory(JSON.parse(JSON.stringify(save)),dungeon,JSON.parse(JSON.stringify(cleared))),dungeonWatchStory(save,dungeon,cleared));
});

test('duplicate, obsolete and out-of-order clears cannot skip missing scenes',()=>{
 for(const [cleared,expected] of [[[ids[1],ids[2],ids[3]],0],[['old',ids[0],ids[0],ids[3]],1],[ids.concat(ids,'old'),4]]){
  const story=dungeonWatchStory({},dungeon,cleared);
  assert.equal(story.stage,expected);
 }
 assert.equal(dungeonWatchStory({}, {...dungeon,id:'journey:lost-spark'},ids),null);
 assert.equal(dungeonWatchStory({}, {...dungeon,arenas:[]},ids),null);
 assert.equal(dungeonWatchStory({},null),null);
 assert.equal(dungeonWatchStory({},dungeon).remembered,null);
 assert.match(dungeonWatchStory({forestCommission:{plan:'light'}},dungeon).remembered,/巡夜灯/);
});

const read=f=>JSON.parse(fs.readFileSync(new URL('../data/'+f,import.meta.url)));
const {content,dataset}=installExpansion(...['adventure/chapter.json','adventure/combat.json','adventure/pets.json','adventure/shop-candidates.json','kids/cards.json','kids/charms.json'].map(read));
const hudContent={...content,dungeons:[dungeon]};

for(let stage=0;stage<4;stage++)test(`patrol defeat identifies the actual failed wave ${stage+1} without altering progress`,()=>{
 const save=createAdventure(content);save.zone=dungeon.id;
 save.dungeonRuns={[dungeon.id]:{cleared:ids.slice(0,stage)}};
 save.pendingEncounter={encounterId:ids[stage],dungeonTacticsId:dungeon.id,dungeonTacticsVersion:2};
 const battle={finished:true,winner:'far',captured:[]},before=JSON.stringify({save,battle});
 const story=dungeonWatchRetryStory(save,dungeon,battle);
 assert.equal(story.id,`S1194-R0${stage+1}`);assert.equal(story.wave,stage+1);
 assert.ok(story.tip.startsWith(['第一波','第二波','第三波','第四波'][stage]));
 assert.match(story.progress,/已通过的营地会保留/);assert.match(story.recovery,/不会自动恢复/);
 const vm=buildBattleResultViewModel({save,battle,assets:{content:hudContent}});
 assert.deepEqual(vm.retryStory,story);assert.equal(vm.xp,0);assert.equal(vm.coins,0);
 assert.equal(JSON.stringify({save,battle}),before);
 const restored=JSON.parse(JSON.stringify(save));assert.deepEqual(dungeonWatchRetryStory(restored,dungeon,battle),story);
});

test('patrol retry avoids inventing wave advice for old, unrelated, unfinished or victorious battles',()=>{
 const save={zone:dungeon.id,pendingEncounter:{encounterId:ids[2],dungeonTacticsId:dungeon.id,dungeonTacticsVersion:2}};
 const battle={finished:true,winner:'far'};
 for(const changed of [{finished:false},{winner:'near'},{winner:null},{redMushroom:true},{tacticsField:{}}])assert.equal(dungeonWatchRetryStory(save,dungeon,{...battle,...changed}),null);
 for(const changed of [{zone:'camp'},{pendingEncounter:null},{pendingEncounter:{...save.pendingEncounter,dungeonTacticsVersion:1}},{pendingEncounter:{...save.pendingEncounter,encounterId:'unknown'}},{pendingEncounter:{...save.pendingEncounter,dungeonTacticsId:'other'}}])assert.equal(dungeonWatchRetryStory({...save,...changed},dungeon,battle),null);
 assert.equal(dungeonWatchRetryStory(save,null,battle),null);
 assert.equal(dungeonWatchRetryStory(save,{...dungeon,arenas:[]},battle),null);
});

test('retry dialogue is optional, has no reward or navigation button and is translated',()=>{
 const dictionaries=Object.fromEntries(['en','ja','ko'].map(id=>[id,parseLocaleFile(fs.readFileSync(new URL(`../data/adventure/locale/${id}.txt`,import.meta.url),'utf8'))]));
 const el=(tag,className,...children)=>({tag,className,children:children.map(child=>typeof child==='string'?tr(child):child),dataset:{}});
 assert.equal(renderDungeonWatchRetry(null,el),null);
 try{for(const lang of ['en','ja','ko']){
  setTranslator(value=>lookup(value,lang,dictionaries),lang);
  for(const id of ids){
   const story=dungeonWatchRetryStory({zone:dungeon.id,pendingEncounter:{encounterId:id,dungeonTacticsId:dungeon.id,dungeonTacticsVersion:2}},dungeon,{finished:true,winner:'far'});
   const node=renderDungeonWatchRetry(story,el);
   assert.equal(node.tag,'details');assert.equal(node.open,undefined);assert.equal(node.dataset.storyId,story.id);
   assert.deepEqual(node.children.map(child=>child.tag),['summary','p','p','p','p']);
   for(const key of ['reply','tip','recovery','progress'])assert.notEqual(tr(story[key]),story[key],`${lang} ${key}`);
   assert.notEqual(node.children[0].children[0],'和茜茜想想下一步');
  }
 }}finally{setTranslator(null);}
});
test('HUD uses unique real arenas and first remaining wave, with cooperative progress isolated',()=>{
 const save=createAdventure(content);save.zone=dungeon.id;save.dungeonRuns={[dungeon.id]:{cleared:['old',ids[0],ids[0],ids[2]]}};
 const model={save,assets:{content:hudContent,dataset}},before=JSON.stringify(save);
 const solo=buildHudTrackerViewModel(model);assert.equal(solo.mode,'dungeon');assert.equal(solo.payload.cleared,2);assert.equal(solo.payload.remaining,2);assert.equal(solo.payload.nextIndex,1);assert.equal(solo.payload.watchStory.stage,1);
 assert.equal(JSON.stringify(save),before);
 save.coopRun={dungeonId:dungeon.id,runs:{[dungeon.id]:{cleared:ids.slice(0,3)}}};
 const coop=buildHudTrackerViewModel(model);assert.equal(coop.payload.cleared,3);assert.equal(coop.payload.watchStory.stage,3);
 delete save.coopRun;assert.equal(buildHudTrackerViewModel(model).payload.watchStory.stage,1);
 save.dungeonRuns[dungeon.id]={cleared:[]};assert.equal(buildHudTrackerViewModel(model).payload.watchStory.stage,0);
});

const source=fs.readFileSync(new URL('../js/views/adventure/view_hud.js',import.meta.url),'utf8');
function render(story){
 const el=(tag,className,...children)=>({tag,className,children,dataset:{},append(...items){this.children.push(...items);}});
 const ctx=vm.createContext({el,tr,fill});
 vm.runInContext(source.slice(source.indexOf('export function appendDungeonWatchStory'),source.indexOf('export function appendForestTracker')).replace('export function','function'),ctx);
 const tracker=el('div','');ctx.appendDungeonWatchStory(tracker,story);return tracker;
}
const text=node=>typeof node==='string'?node:(node?.children||[]).map(text).join(' ');
test('journal is optional native disclosure, has stable scene identity and no reward action',()=>{
 const story=dungeonWatchStory({},dungeon,ids.slice(0,2));
 const tracker=render(story),journal=tracker.children[1];assert.equal(journal.tag,'details');assert.equal(journal.open,undefined);assert.equal(journal.dataset.storyId,story.id);
 assert.equal(tracker.children[0].tag,'blockquote');assert.equal(text(tracker.children[0]),story.reply);assert.equal(text(journal).includes(story.reply),false);
 assert.equal(journal.children[0].tag,'summary');assert.match(text(journal),/第三波/);assert.match(text(tracker),/状态/);
 assert.equal(render(null).children.length,0);assert.equal(JSON.stringify(tracker).includes('button'),false);
});
test('HUD refresh preserves the same open journal and keyboard focus, while a new scene starts closed',()=>{
 const wrapper=source.slice(source.indexOf('export function renderHud('),source.indexOf('function renderHudContents(')).replace('export function','function');
 const makeJournal=(id,open=false)=>{const summary={focus(options){this.options=options;this.focused=true;}};return {dataset:{storyId:id},open,summary,ownerDocument:{activeElement:summary},querySelector:()=>summary};};
 for(const sameScene of [true,false])for(const open of [true,false]){
  const previous=makeJournal('S1194-W01',open),next=makeJournal(sameScene?'S1194-W01':'S1194-W02');
  const root={hidden:false,style:{getPropertyValue:()=>'',getPropertyPriority:()=>''},journal:previous,querySelector(){return this.journal;}};
  const ctx=vm.createContext({renderHudContents(node){node.journal=next;return 'painted';}});vm.runInContext(wrapper,ctx);
  assert.equal(ctx.renderHud(root,{},{}),'painted');assert.equal(next.open,sameScene?open:false);
  assert.equal(!!next.summary.focused,sameScene);if(sameScene)assert.equal(next.summary.options.preventScroll,true);
 }
});
test('all patrol scenes and both remembered plans are translated in each supported interface',()=>{
 const dictionaries=Object.fromEntries(['en','ja','ko'].map(id=>[id,parseLocaleFile(fs.readFileSync(new URL(`../data/adventure/locale/${id}.txt`,import.meta.url),'utf8'))]));
 try{
  for(const lang of ['en','ja','ko']){
   setTranslator(value=>lookup(value,lang,dictionaries),lang);
   for(const plan of [undefined,'light','tracks'])for(let stage=0;stage<=4;stage++){
    const story=dungeonWatchStory({forestCommission:{plan}},dungeon,ids.slice(0,stage));
    for(const key of ['title','line','reply','tip','remembered'])if(story[key])assert.notEqual(tr(story[key]),story[key],`${lang} ${key} ${stage}`);
    assert.notEqual(tr('巡夜手记 · {title}'),'巡夜手记 · {title}');assert.doesNotMatch(text(render(story)),/\{title\}/);
   }
  }
 }finally{setTranslator(null);}
});
