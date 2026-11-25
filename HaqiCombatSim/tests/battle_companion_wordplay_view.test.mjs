import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {tr,fill,setText,setTranslator} from '../js/locale_runtime.js';
import {parseLocaleFile} from '../js/locale_core.js';
import {learningLesson} from '../js/learning_language_core.js';
const source=fs.readFileSync(new URL('../js/views/adventure/view_companion_wordplay.js',import.meta.url),'utf8');
function fixture(){
 const nodes=[],document={body:{},activeElement:null};let resets=0,mics=0;
 function el(tag,className='',...children){const node={tag,className,children,dataset:{},attributes:{},value:'',hidden:false,disabled:false,classList:{add(){}},setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},addEventListener(k,fn){(this.listeners??={})[k]=fn;},removeEventListener(k){delete this.listeners?.[k];},remove(){this.removed=true;},focus(){this.focused=true;document.activeElement=this;},getClientRects(){return this.hidden?[]:[{}];}};let disabled=false;Object.defineProperty(node,'disabled',{get(){return disabled;},set(value){disabled=value;if(value&&document.activeElement===node)document.activeElement=document.body;}});nodes.push(node);return node;}
 const button=(label,click,cls)=>Object.assign(el('button',cls,label),{click}),calls=[];
 const context=vm.createContext({document,tr,fill,setText,learningLesson,el,button,petPortrait:()=>el('div','pet-sheet'),heroPortrait:()=>el('canvas'),guidePet:()=>1,createCloseButton:fn=>button('',fn,'close-button'),createDialogueMicrophone:(_button,actions)=>{mics++;return {node:button('',actions.start,'mic'),reset:()=>resets++,update({disabled}){this.node.disabled=disabled;}};}});
 vm.runInContext(source.slice(source.indexOf('const ROUNDS=')).replace('export function','function'),context);
 const root=el('div'),cb=Object.fromEntries(['listen','startRecording','finishRecording','cancelRecording','next','done','close'].map(k=>[k,()=>calls.push(k)]));cb.submit=text=>calls.push(['submit',text]);
 const view=context.createCompanionWordplay(root,cb),model={assets:{content:{}},save:{},petId:1,step:0,phase:'ready'};
 view.render(model);return {view,model,calls,nodes,document,find:cls=>nodes.find(n=>n.className===cls),mics:()=>mics,resets:()=>resets};
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

test('wordplay rerender switches every command and input language while retaining progress',()=>{
 const ui=fixture(),input=ui.view.input;
 for(const language of ['ja','ko'])for(let step=0;step<3;step++){
  const lesson=learningLesson(language);
  ui.view.render({...ui.model,save:{languageLearning:{target:language}},step});
  assert.equal(ui.view.input,input);assert.equal(input.lang,language);
  assert.equal(ui.find('secondary wordplay-example').textContent,'听示范 · '+lesson.rounds[step][1]);
  assert.deepEqual(ui.calls,[],'render never submits or grants progress');
 }
});
test('waiting for ASR offers a visible cancel-to-type action and unlocks input on recovery',()=>{
 const ui=fixture(),cancel=ui.find('secondary wordplay-cancel');
 assert.equal(cancel.hidden,true);
 ui.view.render({...ui.model,phase:'checking'});
 assert.equal(cancel.hidden,false);assert.equal(ui.view.input.disabled,true);
 assert.match(ui.find('wordplay-status').textContent,/8 秒/);
 cancel.click();assert.deepEqual(ui.calls,['cancelRecording']);assert.equal(ui.view.input.focused,true);
 ui.view.render({...ui.model,phase:'ready',message:'语音服务超时，请重试'});
 assert.equal(ui.view.input.disabled,false);assert.equal(cancel.hidden,true);
});

test('unaccepted speech can be inspected and edited without submitting or granting progress',()=>{
 const ui=fixture(),heard=ui.find('wordplay-heard'),edit=ui.find('secondary wordplay-edit-heard');
 assert.equal(heard.hidden,true);
 const transcript='<hello & goodbye>';
 ui.view.render({...ui.model,inputMode:'speech',transcript,message:'试试说：Hello!'});
 assert.equal(heard.hidden,false);assert.equal(ui.find('wordplay-heard-text').textContent,transcript);
 assert.equal(ui.find('wordplay-heard-text').attributes.translate,'no');
 edit.click();assert.equal(ui.view.input.value,transcript);assert.equal(ui.find('wordplay-typing').open,true);
 assert.equal(ui.view.input.focused,true);assert.deepEqual(ui.calls,[]);
 ui.view.input.value='Hello!';ui.find('wordplay-input').onsubmit({preventDefault(){}});
 assert.deepEqual(ui.calls,[['submit','Hello!']]);
 for(const frame of [{inputMode:'text',transcript:'wrong'}, {phase:'checking',inputMode:'speech',transcript}, {phase:'success',inputMode:'speech',transcript}, {step:1}]){
  ui.view.render({...ui.model,...frame});assert.equal(heard.hidden,true);
 }
});

test('each new instruction receives focus once; recognition updates preserve typing focus',()=>{
 const ui=fixture(),intent=ui.find('wordplay-intent');let focusCount=0;
 intent.focus=()=>focusCount++;
 ui.view.render({...ui.model,phase:'connecting'});ui.view.render({...ui.model,phase:'ready'});
 assert.equal(focusCount,0);
 ui.view.render({...ui.model,step:1});assert.equal(focusCount,1);
 ui.view.render({...ui.model,step:1,phase:'ready',message:'再试试。'});assert.equal(focusCount,1);
 assert.equal(intent.attributes.tabindex,'-1');
});

test('microphone labels explain tap-to-start and tap-to-send in the active UI language',()=>{
 setTranslator(text=>({'开始说话':'Start speaking','结束并发送':'Finish and send'}[text]||text),'en');
 try{
  const ui=fixture(),mic=ui.find('mic');
  assert.equal(mic.textContent,'Start speaking');assert.equal(mic.dataset.zh,'开始说话');
  ui.view.render({...ui.model,phase:'recording'});assert.equal(mic.textContent,'Finish and send');
  ui.view.render({...ui.model,phase:'checking'});assert.equal(mic.disabled,true);
  ui.view.render({...ui.model,phase:'ready'});assert.equal(mic.textContent,'Start speaking');
 }finally{setTranslator(null);}
});

for(const locale of ['en','ja','ko'])test('wordplay uses '+locale+' UI while preserving target-language examples and recognized speech',()=>{
 const table=parseLocaleFile(fs.readFileSync(new URL('../data/adventure/locale/'+locale+'.txt',import.meta.url),'utf8'));
 setTranslator(text=>table[text]||text,locale);
 try{
  const ui=fixture(),lesson=learningLesson('zh-CN');
  const save={languageLearning:{target:'zh-CN'}};
  ui.view.render({...ui.model,save,message:'试试说：'+lesson.rounds[0][1]});
  assert.equal(ui.find('wordplay-status').textContent,table['试试说：{example}'].replace('{example}',lesson.rounds[0][1]));
  assert.equal(ui.find('secondary wordplay-example').textContent,table['听示范']+' · '+lesson.rounds[0][1]);
  assert.equal(ui.find('wordplay-intent').textContent,table['先用{language}和它打个招呼。'].replace('{language}',table['中文']));
  ui.view.render({...ui.model,save,phase:'recording',transcript:'你好，跳一下'});
  assert.equal(ui.find('wordplay-status').textContent,'你好，跳一下');
  assert.equal(ui.find('wordplay-status').attributes.translate,'no');
 }finally{setTranslator(null);}
});


test('wordplay keeps typing keys inside the modal without cancelling native input',()=>{
 const ui=fixture(),modal=ui.find('modal companion-wordplay');let stopped=0,prevented=0;
 for(const key of ['w','Enter','ArrowLeft'])modal.listeners.keydown({key,stopPropagation(){stopped++;},preventDefault(){prevented++;}});
 assert.equal(stopped,3);assert.equal(prevented,0);assert.deepEqual(ui.calls,[]);
 modal.listeners.keydown({key:'Escape',stopPropagation(){stopped++;},preventDefault(){prevented++;}});
 assert.deepEqual(ui.calls,['close']);assert.equal(stopped,4);assert.equal(prevented,1);
 ui.view.dispose();assert.equal(modal.listeners.keydown,undefined);
});

for(const locale of ['en','ja','ko'])test(locale+' translates both the understood command and the unfinished goal',()=>{
 const table=parseLocaleFile(fs.readFileSync(new URL('../data/adventure/locale/'+locale+'.txt',import.meta.url),'utf8'));
 setTranslator(text=>table[text]||text,locale);
 try{
  const ui=fixture(),parts=['它跳起来了！','跟抱抱龙打个招呼。'];
  ui.view.render({...ui.model,message:parts.join(''),messageParts:parts,reaction:'jump',reactionId:1});
  assert.equal(ui.find('wordplay-status').textContent,parts.map(key=>table[key]).join(' '));
  ui.view.render({...ui.model,message:'进度还没保存好，点一次发送重试。'});
  assert.equal(ui.find('wordplay-status').textContent,table['进度还没保存好，点一次发送重试。']);
 }finally{setTranslator(null);}
});

for(const composing of [{isComposing:true},{keyCode:229}])test('wordplay Escape cancels composition without closing '+JSON.stringify(composing),()=>{
 const ui=fixture(),modal=ui.find('modal companion-wordplay');let stopped=0,prevented=0;
 const event={key:'Escape',stopPropagation(){stopped++;},preventDefault(){prevented++;}};
 modal.listeners.keydown({...event,...composing});assert.deepEqual(ui.calls,[]);assert.equal(prevented,0);assert.equal(stopped,1);
 modal.listeners.keydown(event);assert.deepEqual(ui.calls,['close']);assert.equal(prevented,1);
});

test('demo status keeps typing and microphone available while preventing misleading playback labels',()=>{
 const ui=fixture(),example=ui.find('secondary wordplay-example'),input=ui.view.input;input.value='Hello!';
 for(const [demoState,label] of [['preparing','正在准备示范…'],['playing','正在播放示范…']]){
  ui.view.render({...ui.model,demoState});assert.ok(example.textContent.startsWith(label));assert.equal(example.attributes['aria-busy'],'true');assert.equal(example.attributes['aria-disabled'],'true');
  assert.equal(input.disabled,false);assert.equal(input.value,'Hello!');assert.equal(ui.find('mic').disabled,false);assert.equal(ui.find('wordplay-status').textContent,label);
 }
 ui.view.render({...ui.model,demoState:''});assert.equal(example.attributes['aria-busy'],undefined);assert.ok(example.textContent.startsWith('听示范'));
});

for(const control of ['input','mic','secondary wordplay-example'])test('speech failure restores keyboard focus after disabling '+control,()=>{
 const ui=fixture(),node=control==='input'?ui.view.input:ui.find(control);node.focus();
 ui.view.render({...ui.model,phase:'connecting'});ui.view.render({...ui.model,phase:'checking'});
 assert.equal(ui.document.activeElement,ui.document.body);
 ui.view.render({...ui.model,phase:'ready',message:'没听清，可以再说一次，也可以输入。'});
 assert.equal(ui.document.activeElement,node);assert.equal(node.disabled,false);assert.deepEqual(ui.calls,[]);
});
test('recognition recovery respects deliberate focus changes and successful next action',()=>{
 const ui=fixture();ui.view.input.focus();ui.view.render({...ui.model,phase:'checking'});
 const cancel=ui.find('secondary wordplay-cancel');cancel.focus();
 ui.view.render({...ui.model,phase:'ready',message:'再试试。'});assert.equal(ui.document.activeElement,cancel);
 ui.view.input.focus();ui.view.render({...ui.model,phase:'checking'});
 ui.view.render({...ui.model,phase:'success'});assert.equal(ui.document.activeElement,ui.find('primary wordplay-next'));
});

for(const failedPhase of ['connecting','checking'])test('voice '+failedPhase+' failure reveals typing without stealing retry focus',()=>{
 const ui=fixture(),typing=ui.find('wordplay-typing'),mic=ui.find('mic');
 ui.view.input.value='My unfinished answer';
 mic.focus();ui.view.render({...ui.model,phase:failedPhase});
 ui.view.render({...ui.model,phase:'ready',message:'语音服务超时，请重试'});
 assert.equal(typing.open,true);assert.equal(ui.view.input.value,'My unfinished answer');
 assert.equal(ui.view.input.disabled,false);assert.equal(ui.document.activeElement,mic);
 assert.deepEqual(ui.calls,[]);
});

test('voice recovery opens typing only once and a new round starts cleanly',()=>{
 const ui=fixture(),typing=ui.find('wordplay-typing');
 ui.view.render({...ui.model,phase:'checking'});
 ui.view.render({...ui.model,phase:'ready',message:'没听清，可以再说一次，也可以输入。'});
 assert.equal(typing.open,true);typing.open=false;
 ui.view.render({...ui.model,phase:'ready',message:'没听清，可以再说一次，也可以输入。'});assert.equal(typing.open,false);
 ui.view.render({...ui.model,phase:'success'});
 ui.view.render({...ui.model,step:1,phase:'ready'});assert.equal(typing.open,false);
});

for(const flags of [{isComposing:true},{keyCode:229},{composition:true}])test('wordplay IME confirmation keeps the typed answer unsubmitted '+JSON.stringify(flags),()=>{
 const ui=fixture(),input=ui.view.input,form=ui.find('wordplay-input');input.value='你好';
 if(flags.composition)input.oncompositionstart();
 let prevented=false;input.onkeydown({key:'Enter',...flags,preventDefault(){prevented=true;}});
 if(!prevented)form.onsubmit({preventDefault(){}});
 assert.equal(prevented,true);assert.deepEqual(ui.calls,[]);assert.equal(input.value,'你好');
});
test('wordplay normal Enter can submit after composition finishes',()=>{
 const ui=fixture(),input=ui.view.input;input.value=' Hello! ';input.oncompositionstart();input.oncompositionend();
 let prevented=false;input.onkeydown({key:'Enter',preventDefault(){prevented=true;}});
 assert.equal(prevented,false);if(!prevented)ui.find('wordplay-input').onsubmit({preventDefault(){}});
 assert.deepEqual(ui.calls,[['submit','Hello!']]);assert.equal(input.enterKeyHint,'send');
});
