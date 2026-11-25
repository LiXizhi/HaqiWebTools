import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as A from '../js/adventure_core.js';
import {checkedProgress} from '../js/adventure_cloud_core.js';
import {persistReward} from '../js/adventure_reward_persistence.js';
import {forestCommissionPhase,forestCommissionGoal,forestCommissionScene,FOREST_NPCS,FOREST_SITES} from '../js/forest_commission_core.js';

const read=file=>JSON.parse(fs.readFileSync(new URL('../data/adventure/'+file,import.meta.url)));
const content=read('chapter.json'),dataset=read('combat.json');
function fresh(ending='sign'){
 const save=A.createAdventure(content,{school:'fire',seed:231});
 save.forestCommission={version:1,phase:'done',clearBaseline:0,plan:'tracks',mystery:{version:1,status:'solved',route:'tracks',observed:['grass','paper','tracks','lamp'],witness:true,ending}};
 save.dungeonChallengeRecords={'journey:first-watch':{version:1,clears:1,bestTurns:8,bestDefeats:0,lastTurns:8,lastDefeats:0}};
 return save;
}
function act(save,step,props={},target){
 const goal=forestCommissionGoal(save);
 return A.applyAction(save,content,{type:'forest-commission',step,...props},{forestTarget:target||{id:goal.id,kind:goal.kind,...save.position}});
}
const first=ending=>ending==='sign'?['promise-mark',{place:'tent'}]:['promise-invite',{response:'ask'}];
function roundTrip(save){
 const local=A.parseSave(JSON.stringify(save),content);
 const cloud=checkedProgress(local,content,dataset).save;
 assert.deepEqual(cloud.forestCommission,save.forestCommission);return cloud;
}

for(const ending of ['sign','pair'])test(`${ending}: the optional promise uses physical goals, persists both steps, and never repeats rewards`,()=>{
 let save=fresh(ending);const before=structuredClone(save);
 assert.equal(forestCommissionPhase(save),'done');assert.equal(save.forestCommission.mystery.promise,undefined);
 assert.equal(forestCommissionGoal(save).label,'营地急件已完成');
 act(save,'promise-start');save=roundTrip(save);
 assert.equal(forestCommissionPhase(save),'promise');
 assert.equal(forestCommissionGoal(save).id,ending==='sign'?FOREST_SITES.boots:FOREST_NPCS.giver);
 if(ending==='sign')assert.equal(forestCommissionScene(save).sites[FOREST_SITES.boots].active,true);
 const duplicate=JSON.stringify(save);assert.equal(act(save,'promise-start',{}, {id:FOREST_NPCS.receiver,kind:'npc',...save.position}).changed,false);assert.equal(JSON.stringify(save),duplicate);
 act(save,...first(ending));save=roundTrip(save);
 assert.equal(forestCommissionGoal(save).id,ending==='sign'?FOREST_NPCS.giver:FOREST_NPCS.receiver);
 assert.equal(act(save,'promise-confirm').changed,true);save=roundTrip(save);
 assert.equal(forestCommissionPhase(save),'done');assert.equal(save.forestCommission.mystery.promise.status,'done');
 assert.match(forestCommissionScene(save).sites[FOREST_SITES.boots].label,ending==='sign'?/灯芯在补给帐篷/:/先问清/);
 assert.deepEqual(save.inventory,before.inventory);assert.equal(save.exp,before.exp);
 for(const key of ['labelPractices','practice','exchangePractice'])assert.equal(save.forestCommission[key],undefined);
 const done=JSON.stringify(save);assert.equal(act(save,'promise-start').changed,false);assert.throws(()=>act(save,'promise-confirm'),/先和茜茜/);assert.throws(()=>act(save,'report'));assert.equal(JSON.stringify(save),done);
});

for(const ending of ['sign','pair'])test(`${ending}: pause/reload/resume retains the actual stage and cannot skip a nearby interaction`,()=>{
 for(const advanced of [false,true]){
  let save=fresh(ending);act(save,'promise-start');if(advanced)act(save,...first(ending));
  const stage=save.forestCommission.mystery.promise.stage;
  act(save,'promise-pause');assert.equal(forestCommissionPhase(save),'done');save=roundTrip(save);
  assert.throws(()=>act(save,'promise-confirm'),/先和茜茜/);
  act(save,'promise-start');assert.equal(save.forestCommission.mystery.promise.stage,stage);roundTrip(save);
  const before=JSON.stringify(save),[step,props]=advanced?['promise-confirm',{}]:first(ending);
  for(const target of [{id:'wrong',kind:'npc',...save.position},{id:forestCommissionGoal(save).id,kind:forestCommissionGoal(save).kind,x:save.position.x+111,y:save.position.y}])assert.throws(()=>act(save,step,props,target),/靠近委托地点/);
  assert.equal(JSON.stringify(save),before);
 }
});

test('vague notes and speaking for someone are safe, non-mutating choices with specific feedback',()=>{
 for(const ending of ['sign','pair']){
  const save=fresh(ending);act(save,'promise-start');const before=JSON.stringify(save);
  const result=ending==='sign'?act(save,'promise-mark',{place:'vague'}):act(save,'promise-invite',{response:'answer-for'});
  assert.equal(result.changed,false);assert.match(result.message,ending==='sign'?/没有写位置/:/她自己说/);assert.equal(JSON.stringify(save),before);
  assert.throws(()=>act(save,ending==='sign'?'promise-invite':'promise-mark',ending==='sign'?{response:'ask'}:{place:'tent'}));
  assert.throws(()=>act(save,...(ending==='sign'?['promise-mark',{place:'unknown'}]:['promise-invite',{response:'unknown'}])));
  assert.throws(()=>act(save,'promise-confirm'),/先把位置/);assert.equal(JSON.stringify(save),before);
 }
});

test('promise records reject invented progress, malformed shapes, and unfinished investigations',()=>{
 for(const ending of ['sign','pair']){
  const base={version:1,status:'active',stage:ending==='sign'?'mark':'invite'};
  for(const mutation of [null,[],{}, {...base,version:2},{...base,status:'free'},{...base,stage:ending==='sign'?'invite':'mark'},{...base,status:'done'},{...base,reward:999},{...base,stage:'confirm',coins:2}]){
   const save=fresh(ending);save.forestCommission.mystery.promise=mutation;assert.throws(()=>checkedProgress(save,content,dataset));
  }
  const unsolved=fresh(ending);Object.assign(unsolved.forestCommission.mystery,{status:'paused',ending:undefined,promise:base});assert.throws(()=>checkedProgress(unsolved,content,dataset));
  assert.throws(()=>act(unsolved,'promise-start'),/先查清/);
  const active=fresh(ending);active.forestCommission.mystery.promise={...base,stage:'confirm',status:'paused'};assert.ok(checkedProgress(active,content,dataset));
 }
 const old=fresh();assert.ok(checkedProgress(old,content,dataset));assert.equal(old.forestCommission.mystery.promise,undefined);
});

test('a failed final write leaves the live promise pending, then a retry commits once without inventory changes',()=>{
 const save=fresh();act(save,'promise-start');act(save,...first('sign'));const before=JSON.stringify(save);
 const action={type:'forest-commission',step:'promise-confirm'},access={forestTarget:{id:FOREST_NPCS.giver,kind:'npc',...save.position}};
 assert.throws(()=>persistReward(save,content,action,access,{getItem(){return null;},setItem(){throw Error('quota');}}),/quota/);
 assert.equal(JSON.stringify(save),before);
 let written;const result=persistReward(save,content,action,access,{getItem(){return null;},setItem(key,value){if(!key.endsWith('.updated'))written=value;}});
 assert.equal(result.save.forestCommission.mystery.promise.status,'done');assert.equal(JSON.parse(written).forestCommission.mystery.promise.status,'done');assert.deepEqual(result.save.inventory,save.inventory);roundTrip(result.save);
});

function view(save,nearby,action){
 const all=[];
 function el(tag,className='',...children){const n={tag,className,children,attributes:{},textContent:children[0]||'',append(...c){this.children.push(...c);},setAttribute(k,v){this.attributes[k]=v;}};all.push(n);return n;}
 const context=vm.createContext({el,button:(label,click,className)=>Object.assign(el('button',className,label),{click}),setText:(node,text,vars={})=>{node.textContent=text.replace(/\{(\w+)\}/g,(_,key)=>vars[key]);return node;}});
 const source=fs.readFileSync(new URL('../js/views/adventure/view_forest_promise.js',import.meta.url),'utf8');
 vm.runInContext(source.replace(/^import .*;\r?\n/gm,'').replaceAll('export function','function'),context);
 const status=el('status');let gone=0;
 context.renderForestPromise(el('body'),el('actions'),{save,nearby,assets:{}},{action,go(){gone++;}},()=>el('canvas'),status);
 return {all,status,get gone(){return gone;}};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('promise view dispatches choices, prevents duplicate pending actions, and restores controls for retries',async()=>{
 const save=fresh();act(save,'promise-start');let finish,calls=0;
 const f=view(save,true,value=>{calls++;assert.equal(value.step,'promise-mark');assert.equal(value.place,'tent');return new Promise(resolve=>{finish=resolve;});});
 const buttons=f.all.filter(n=>n.tag==='button'),correct=buttons.find(n=>String(n.textContent).includes('在补给帐篷里'));
 correct.click();correct.click();assert.equal(calls,1);assert.ok(buttons.every(n=>n.disabled));
 finish(false);await settle();assert.ok(buttons.every(n=>!n.disabled));assert.match(f.status.textContent,/没有保存/);
 correct.click();assert.equal(calls,2);finish({message:'位置已经写清。'});await settle();assert.equal(f.status.textContent,'位置已经写清。');
});

test('promise view keeps travel separate from nearby confirmation and catches rejected writes',async()=>{
 const save=fresh('pair');act(save,'promise-start');act(save,...first('pair'));
 const far=view(save,false,()=>{});assert.ok(!far.all.some(n=>n.tag==='button'&&String(n.textContent).includes('再确认出发')));
 far.all.find(n=>n.tag==='button'&&n.textContent==='带我去落实约定').click();assert.equal(far.gone,1);
 const f=view(save,true,()=>Promise.reject(Error('quota'))),confirm=f.all.find(n=>n.tag==='button'&&String(n.textContent).includes('再确认出发'));
 confirm.click();await settle();assert.equal(confirm.disabled,false);assert.match(f.status.textContent,/可以重试/);
});
