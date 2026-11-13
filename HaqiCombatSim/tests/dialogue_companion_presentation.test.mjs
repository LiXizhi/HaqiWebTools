import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {forestCommissionAvailable,forestCommissionPhase,FOREST_NPCS} from '../js/forest_commission_core.js';

const source=fs.readFileSync(new URL('../js/view_adventure.js',import.meta.url),'utf8');
const render=source.slice(source.indexOf('export function renderDialogue('),source.indexOf('export function renderBattle(')).replace('export function','function');
function setup({quest=null,index=0,sequence=false,purpose=null,tacticsAvailable=true}={}){
 const find=(node,predicate)=>{for(const child of node.children||[]){if(child&&typeof child==='object'){if(predicate(child))return child;const result=find(child,predicate);if(result)return result;}}return null;};
 function el(tag,cls='',...children){return {tag,className:cls,children,dataset:{},textContent:typeof children[0]==='string'?children[0]:'',style:{setProperty(){}},classList:{toggle(){},add(){}},setAttribute(){},append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;},querySelector(selector){return find(this,n=>selector==='button.primary'?n.tag==='button'&&n.className==='primary':selector==='button'?n.tag==='button':selector==='.dialogue-text'?n.className==='dialogue-text':false);}};}
 const npc={id:10,name:'青龙',zone:'camp',portrait:'qinglong',description:'小家伙在等你。'},calls=[];
 const context=vm.createContext({forestCommissionAvailable,forestCommissionPhase,FOREST_NPCS,el,art:()=>el('canvas'),npcCharacter:()=>null,npcHasActiveQuest:()=>true,fill:()=>({text:'与青龙交谈'}),islandName:()=>'',createCloseButton:()=>el('button'),
  currentQuest:()=>quest,questState:()=>({accepted:false}),questReady:()=>false,catalogStatSnapshot:()=>({}),catalogQuestsForNpc:()=>({accept:[],claim:[]}),catalogTalksForNpc:()=>[],rewardsFor:()=>[],pendingQuestTalk:()=>null,npcPurpose:()=>purpose,guidanceCard:spec=>el('section','adventure-guidance',spec.title,spec.footnote),npcServices:()=>['shop'],setText(node,text){node.textContent=text;},tr:t=>t,
  button:(label,run,cls)=>({...el('button',cls,label),click:run}),dialogueLearningLines:()=>[],bindDialogue(){},
 });
 vm.runInContext(render,context);
 const root=el('div'),model={assets:{content:{npcs:{10:npc},quests:[],items:{}}},save:{quests:{},languageLearning:{}}};
 const dialog=sequence?{lines:[{npcId:10,text:'我先去看看。'},{npcId:10,text:'轮到你了。'}],index,finishLabel:'一起出发'}:{npcId:10};
 const callbacks={tactics:()=>calls.push('tactics'),next:()=>calls.push('next'),close:()=>calls.push('close'),startQuest:()=>calls.push('accept'),panel:()=>calls.push('shop')};
 if(!tacticsAvailable)delete callbacks.tactics;
 const paint=()=>context.renderDialogue(root,model,dialog,callbacks);paint();
 return {root,dialog,calls,paint,find:predicate=>find(root,predicate)};
}

test('quest action stays primary while optional resident services are a disclosure',()=>{
 const ui=setup({quest:{id:1,startNpc:10,endNpc:10,title:'寻找伙伴'}});
 const services=ui.find(n=>n.className==='dialogue-services');
 assert.ok(services);assert.notEqual(services.open,true);assert.deepEqual(ui.calls,[]);
 const accept=ui.find(n=>n.tag==='button'&&n.textContent.startsWith('接取任务'));
 assert.ok(accept);accept.click();assert.deepEqual(ui.calls,['accept']);
 const shop=ui.find(n=>n.tag==='button'&&n.textContent==='查看商品与学习魔法');shop.click();
 assert.deepEqual(ui.calls,['accept','shop']);
});

test('resident without a quest keeps their service directly discoverable',()=>{
 const ui=setup();assert.equal(ui.find(n=>n.className==='dialogue-services').open,true);assert.deepEqual(ui.calls,[]);
});

test('revisiting a spoken line preserves full text and never advances the quest',()=>{
 const ui=setup({sequence:true,index:1});
 ui.find(n=>n.className==='text-button dialogue-back').click();
 assert.equal(ui.dialog.index,0);assert.deepEqual(ui.calls,[]);
 assert.equal(ui.find(n=>n.className==='dialogue-text').textContent,'我先去看看。');
 assert.equal(ui.find(n=>n.className==='text-button dialogue-back'),null);
 ui.find(n=>n.tag==='button'&&n.className==='primary').click();assert.deepEqual(ui.calls,['next']);
});

 test('a resident purpose presents a concrete action without advancing a quest',()=>{
 const ui=setup({purpose:{title:'来练习配合',label:'进入战术课堂',action:'tactics'}});
 assert.ok(ui.find(n=>n.className==='adventure-guidance'));
 ui.find(n=>n.tag==='button'&&n.textContent==='进入战术课堂').click();
 assert.deepEqual(ui.calls,['tactics']);
 });

test('same-screen dialogue explains classroom availability without a broken action',()=>{
 const ui=setup({tacticsAvailable:false,purpose:{title:'来练习配合',label:'进入战术课堂',action:'tactics'}});
 assert.equal(ui.find(n=>n.tag==='button'&&n.textContent==='进入战术课堂'),null);
 assert.match(ui.find(n=>n.className==='adventure-guidance').children[1],/单人冒险/);
 assert.ok(ui.find(n=>n.tag==='button'&&n.textContent==='查看商品与学习魔法'));
});
