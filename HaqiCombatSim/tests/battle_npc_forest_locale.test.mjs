import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {forestCommissionAvailable,forestCommissionPhase,FOREST_NPCS} from '../js/forest_commission_core.js';
import {parseLocaleFile,lookup} from '../js/locale_core.js';
import {tr,fill,setText,setTranslator} from '../js/locale_runtime.js';

const source=fs.readFileSync(new URL('../js/views/adventure/view_npc_dialogue.js',import.meta.url),'utf8');
const renderSource=source.slice(source.indexOf('export function renderDialogue(')).replace('export function','function');
const chapter=JSON.parse(fs.readFileSync(new URL('../data/adventure/chapter.json',import.meta.url),'utf8'));
const states=[
 {phase:'offer',commission:undefined,label:'营地急件：接取寻物委托'},
 {phase:'boots',commission:{phase:'boots'},label:'继续森林补给委托'},
 {phase:'done',commission:{phase:'done',mystery:{status:'solved'}},label:'查看森林委托记录'},
 {phase:'investigation',commission:{phase:'done',mystery:{status:'active'}},label:'继续森林补给委托'},
];
function element(tag,className='',...children){
 const node={tag,className,children:[],dataset:{},classList:{toggle(){},add(){}},style:{setProperty(){}},setAttribute(){},
  append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},
  querySelector(selector){return descendants(this).find(n=>selector==='.dialogue-text'?n.className==='dialogue-text':n.tag==='button'&&(!selector.includes('.primary')||n.className.includes('primary')))||null;}};
 node.append(...children.map(child=>typeof child==='string'?tr(child):child));
 if(children.length===1&&typeof children[0]==='string'){node.textContent=tr(children[0]);node.dataset.zh=children[0];}
 return node;
}
function descendants(node){return node.children.filter(n=>n&&typeof n==='object').flatMap(n=>[n,...descendants(n)]);}
for(const language of ['en','ja','ko'])test(`forest NPC commission actions render and route in ${language}`,()=>{
 const table=parseLocaleFile(fs.readFileSync(new URL(`../data/adventure/locale/${language}.txt`,import.meta.url),'utf8'));
 setTranslator(text=>lookup(text,language,{[language]:table}),language);
 const context=vm.createContext({tr,fill,setText,el:element,button:(label,run,cls)=>({...element('button',cls,label),click:run}),
  forestCommissionAvailable,forestCommissionPhase,FOREST_NPCS,npcCharacter:()=>null,art:()=>element('canvas'),createCloseButton:()=>element('button'),islandName:()=>'',
  currentQuest:()=>null,catalogStatSnapshot:()=>({}),catalogQuestsForNpc:()=>({accept:[],claim:[]}),catalogTalksForNpc:()=>[],pendingQuestTalk:()=>null,npcPurpose:()=>null,npcServices:()=>[],dialogueLearningLines:()=>[],bindDialogue(){}});
 vm.runInContext(renderSource,context);
 try{
  for(const state of states)for(const npcId of Object.values(FOREST_NPCS)){
   const save={zone:'camp',openingJourney:{phase:'done'},forestCommission:state.commission,languageLearning:{enabled:false}},root=element('main'),calls=[];
   assert.equal(forestCommissionAvailable(save),true);assert.equal(forestCommissionPhase(save),state.phase);
   context.renderDialogue(root,{save,assets:{content:chapter}},{npcId},{close(){},panel:(...args)=>calls.push(args)});
   assert.ok(table[state.label],`${language}: missing ${state.label}`);
   const actions=descendants(root).filter(n=>n.tag==='button'&&n.dataset.zh===state.label);
   assert.equal(actions.length,1,`${state.phase} at NPC ${npcId}`);
   assert.equal(actions[0].textContent,table[state.label]);assert.notEqual(actions[0].textContent,state.label);
   actions[0].click();assert.deepEqual(calls,[['forest-commission']]);
  }
 }finally{setTranslator(null);}
});
