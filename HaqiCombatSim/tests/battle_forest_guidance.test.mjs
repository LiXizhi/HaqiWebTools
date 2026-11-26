import {forgeCommissionAvailable,forgeCommissionPhase} from '../js/forge_commission_core.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {buildHudTrackerViewModel} from '../js/adventure/presenters/hud_view_model.js';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {createAdventure} from '../js/adventure_core.js';
import * as forest from '../js/forest_commission_core.js';
import {tr,fill,setText,setTranslator} from '../js/locale_runtime.js';
import {lookup,parseLocaleFile} from '../js/locale_core.js';
const read=f=>JSON.parse(fs.readFileSync(new URL('../data/'+f,import.meta.url)));
const {content,dataset}=installExpansion(...['adventure/chapter.json','adventure/combat.json','adventure/pets.json','adventure/shop-candidates.json','kids/cards.json','kids/charms.json'].map(read));
const hudSource=fs.readFileSync(new URL('../js/views/adventure/view_hud.js',import.meta.url),'utf8');
function forestTracker(forestGoal){
 const calls=[];
 const el=(tag,className,...children)=>({tag,className,children,append(...items){this.children.push(...items);}});
 const context=vm.createContext({tr,fill,el,button:(label,click)=>({label,click})});
 vm.runInContext(hudSource.slice(hudSource.indexOf('export function appendForestTracker'),hudSource.indexOf('export function renderHud')).replace('export function','function'),context);
 const tracker=el('div','');context.appendForestTracker(tracker,forestGoal,{panel:id=>calls.push(id)});
 return {tracker,calls,action:tracker.children[0]?.children[0]};
}
test('rendered forest HUD translates each goal and preserves its commission action',()=>{
 const dictionaries=Object.fromEntries(['en','ja','ko'].map(id=>[id,parseLocaleFile(fs.readFileSync(new URL(`../data/adventure/locale/${id}.txt`,import.meta.url),'utf8'))]));
 try{
  for(const native of ['en','ja','ko']){
   setTranslator(value=>lookup(value,native,dictionaries),native);
   const saves=[];
   for(const phase of ['offer','boots','delivery','note','briefing','patrol','report','done']){
    for(const target of ['en','zh-CN','ja','ko']){
     const save={school:'fire',languageLearning:{target}};
     if(phase!=='offer')save.forestCommission={version:1,phase:phase==='report'?'patrol':phase,clearBaseline:0};
     if(phase==='report')save.dungeonChallengeRecords={[forest.FOREST_PATROL_DUNGEON]:{clears:1}};
     saves.push(save);
     if(phase==='briefing')saves.push({...save,forestCommission:{...save.forestCommission,exchangeCompleted:['note']}});
    }
   }
   for(const route of ['tracks','light']){
    for(const [observed,witness] of [[[],false],[['grass','paper'],false],[['tracks','lamp'],false],[['grass','paper','tracks','lamp'],false],[['grass','paper','tracks','lamp'],true]]){
     saves.push({school:'fire',forestCommission:{version:1,phase:'done',mystery:{version:1,status:'active',route,observed,witness}}});
    }
   }
   for(const save of saves){
    const goal=forest.forestCommissionGoal(save),ui=forestTracker({phase:goal.phase,goal});
    assert.ok(ui.action,native+' '+goal.phase);
    assert.doesNotMatch(ui.action.label,/\{[^}]+\}|森林委托|到补给帐篷/);
    if(native==='en')assert.doesNotMatch(ui.action.label,/[\u3400-\u9fff]/,goal.label);
    assert.ok(ui.action.label.startsWith(tr('森林委托 · {goal}').split('{goal}')[0]));
    ui.action.click();assert.deepEqual(ui.calls,['forest-commission']);
   }
  }
  assert.equal(forestTracker(null).tracker.children.length,0);
 }finally{setTranslator(null);}
});
function completedSave(status){
 const save=createAdventure(content);save.zone='camp';
 save.forestCommission={version:1,phase:'done',clearBaseline:0,...(status?{mystery:{version:1,status,route:'tracks',observed:[]}}:{})};
 return save;
}
test('reporting keeps an investigation HUD goal until the mystery is solved',()=>{
 for(const status of [undefined,'active']){
  const save=completedSave(status),model={save,assets:{content,dataset}},goal=buildHudTrackerViewModel(model).forestGoal;
  assert.ok(goal);assert.equal(goal.phase,status?'investigation':'done');
  assert.deepEqual(goal.goal,forest.forestCommissionGoal(save));
  assert.equal(buildHudTrackerViewModel({...model,localSecond:true}).forestGoal,null);
  save.zone='earth';assert.equal(buildHudTrackerViewModel(model).forestGoal,null);
 }
 assert.equal(buildHudTrackerViewModel({save:completedSave('solved'),assets:{content,dataset}}).forestGoal,null);
 const opening=completedSave();opening.openingJourney={version:1,phase:'offer'};
 assert.equal(buildHudTrackerViewModel({save:opening,assets:{content,dataset}}).forestGoal,null);
});
const source=fs.readFileSync(new URL('../js/views/adventure/view_npc_dialogue.js',import.meta.url),'utf8');
function npcDialogue(save,npcId,{localSecond=false}={}){
 const all=[],calls=[],options=[];
 function el(tag,cls='',...children){
  const node={tag,className:cls,children,dataset:{},style:{},textContent:typeof children[0]==='string'?children[0]:'',
   append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},setAttribute(){},
   querySelector(selector){const descendants=[];function scan(n){for(const c of n.children)if(c&&typeof c==='object'){descendants.push(c);scan(c);}}scan(this);return descendants.find(n=>selector.startsWith('.')?n.className.split(' ').includes(selector.slice(1)):n.tag==='button'&&(!selector.includes('.')||n.className==='primary'))||null;}};
  node.classList={add(){},toggle(){}};all.push(node);return node;
 }
 const button=(label,click,cls='')=>Object.assign(el('button',cls,label),{click});
 const context=vm.createContext({forgeCommissionAvailable,forgeCommissionPhase,...forest,tr,fill,setText,el,button,art:()=>el('canvas'),npcCharacter:()=>null,
  islandName:()=>'',currentQuest:()=>null,catalogStatSnapshot:()=>({}),catalogQuestsForNpc:()=>({accept:[],claim:[]}),catalogTalksForNpc:()=>[],pendingQuestTalk:()=>null,
  npcPurpose:()=>null,npcServices:()=>[],npcHasActiveQuest:()=>false,createCloseButton:click=>button('close',click),bindDialogue(){},dialogueLearningLines:()=>[]});
 vm.runInContext(source.replace(/^import .*;\r?\n/gm,'').replace('export function','function'),context);
 context.renderDialogue(el('div'),{save,assets:{content},localSecond},{npcId},{close(){},panel:(panel,opts)=>{calls.push(panel);options.push(opts);}});
 return {all,calls,options};
}
test('Moni introduces the preparation letter after level eight and reopens its real hunt tab',()=>{
 for(const phase of ['offer','challenge','report','done']){
  const save=completedSave();save.level=8;
  if(phase!=='offer')save.forgeCommission={version:1,phase,gatherDay:'2026-11-26'};
  const ui=npcDialogue(save,36201),entry=ui.all.find(n=>n.tag==='button'&&/修复信|修复回信|每日免费草药/.test(n.textContent));
  assert.ok(entry,phase);entry.click();assert.deepEqual(ui.calls,['equipment']);assert.equal(ui.options.length,1);assert.equal(ui.options[0].tab,'hunt');
 }
 for(const opts of [{level:7},{level:8,localSecond:true}]){
  const save=completedSave();save.level=opts.level;
  const ui=npcDialogue(save,36201,opts);
  assert.equal(ui.all.some(n=>n.tag==='button'&&/修复信|修复回信|每日免费草药/.test(n.textContent)),false);
 }
});
test('both forest residents offer investigation after reporting and records after solving',()=>{
 for(const npcId of [forest.FOREST_NPCS.giver,forest.FOREST_NPCS.receiver]){
  for(const status of [undefined,'solved']){
   const save=completedSave(status),ui=npcDialogue(save,npcId);
   const label=status?'查看森林委托记录':'和茜茜调查草屑和脚印';
   const action=ui.all.find(n=>n.tag==='button'&&n.textContent===label);assert.ok(action);action.click();assert.deepEqual(ui.calls,['forest-commission']);
   assert.equal(ui.all.some(n=>n.textContent==='继续森林补给委托'),false);
   assert.equal(npcDialogue(save,npcId,{localSecond:true}).all.some(n=>n.textContent===label),false);
  }
 }
});
