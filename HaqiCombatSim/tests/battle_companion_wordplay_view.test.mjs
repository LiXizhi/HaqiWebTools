import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../js/view_companion_wordplay.js',import.meta.url),'utf8');
function fixture(){
 const nodes=[];let resets=0,mics=0;
 function el(tag,className='',...children){const node={tag,className,children,dataset:{},attributes:{},value:'',hidden:false,disabled:false,classList:{add(){}},setAttribute(k,v){this.attributes[k]=v;},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},addEventListener(){},removeEventListener(){},remove(){this.removed=true;},focus(){this.focused=true;},getClientRects(){return this.hidden?[]:[{}];}};nodes.push(node);return node;}
 const button=(label,click,cls)=>Object.assign(el('button',cls,label),{click}),calls=[];
 const context=vm.createContext({el,button,petPortrait:()=>el('div','pet-sheet'),heroPortrait:()=>el('canvas'),guidePet:()=>1,createCloseButton:fn=>button('',fn,'close-button'),createDialogueMicrophone:(_button,actions)=>{mics++;return {node:button('',actions.start,'mic'),reset:()=>resets++,update({disabled}){this.node.disabled=disabled;}};}});
 vm.runInContext(source.slice(source.indexOf('const ROUNDS=')).replace('export function','function'),context);
 const root=el('div'),cb=Object.fromEntries(['listen','startRecording','finishRecording','cancelRecording','next','done','close'].map(k=>[k,()=>calls.push(k)]));cb.submit=text=>calls.push(['submit',text]);
 const view=context.createCompanionWordplay(root,cb),model={assets:{content:{}},save:{},petId:1,step:0,phase:'ready'};
 view.render(model);return {view,model,calls,nodes,find:cls=>nodes.find(n=>n.className===cls),mics:()=>mics,resets:()=>resets};
}
test('wordplay demonstration never submits an answer; explicit typed input does',()=>{
 const ui=fixture();ui.find('secondary wordplay-example').click();assert.deepEqual(ui.calls,['listen']);
 ui.view.input.value=' Hello! ';ui.find('wordplay-input').onsubmit({preventDefault(){}});assert.deepEqual(ui.calls,['listen',['submit','Hello!']]);
 ui.view.input.value=' ';ui.find('wordplay-input').onsubmit({preventDefault(){}});assert.equal(ui.calls.length,2);
});
test('ASR state updates preserve the microphone and do not submit partial transcripts',()=>{
 const ui=fixture(),input=ui.view.input;
 for(const phase of ['connecting','recording','checking'])ui.view.render({...ui.model,phase,transcript:'Hel'});
 assert.equal(ui.mics(),1);assert.equal(ui.view.input,input);assert.deepEqual(ui.calls,[]);assert.equal(input.disabled,true);
 ui.view.render({...ui.model,phase:'ready',message:'没听清，再试一次。'});assert.equal(input.disabled,false);
});
test('each successful spoken action has its own reaction and next remains a deliberate action',()=>{
 const ui=fixture();
 for(const [step,motion] of [[0,'greet'],[1,'jump'],[2,'come']]){
  ui.view.render({...ui.model,step,phase:'ready'});assert.equal(ui.find('primary wordplay-next').hidden,true);
  ui.view.render({...ui.model,step,phase:'success'});
  assert.ok(ui.nodes.some(n=>n.className===`wordplay-stage responded response-${motion}`));
  assert.equal(ui.find('primary wordplay-next').hidden,false);assert.deepEqual(ui.calls,[]);
 }
 ui.find('primary wordplay-next').click();assert.deepEqual(ui.calls,['next']);
 ui.view.dispose();ui.view.dispose();assert.equal(ui.resets(),1);
});

test('completed view exits through done without another submit or next',()=>{
 const ui=fixture();ui.view.render({...ui.model,step:3,completed:true,phase:'ready'});
 ui.find('primary wordplay-next').click();assert.deepEqual(ui.calls,['done']);
});

test('another valid command performs an action without completing the current goal',()=>{
 const ui=fixture();ui.view.render({...ui.model,reaction:'jump',reactionId:1,phase:'ready',message:'跳起来啦，先跟它打个招呼。'});
 const stage=ui.nodes.find(n=>n.className==='wordplay-stage responded response-jump');
 assert.ok(stage);assert.equal(stage.dataset.step,'0');assert.equal(ui.find('primary wordplay-next').hidden,true);
 assert.equal(ui.find('wordplay-controls').hidden,false);assert.equal(ui.view.input.disabled,false);assert.deepEqual(ui.calls,[]);
 let reads=0;Object.defineProperty(stage,'offsetWidth',{get(){reads++;return 600;}});
 ui.view.render({...ui.model,reaction:'jump',reactionId:1,phase:'ready'});assert.equal(reads,0);
 ui.view.render({...ui.model,reaction:'jump',reactionId:2,phase:'ready'});assert.equal(reads,1);
 assert.equal(stage.className,'wordplay-stage responded response-jump');assert.equal(ui.find('primary wordplay-next').hidden,true);
});
