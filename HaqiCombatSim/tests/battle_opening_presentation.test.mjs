import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {learningLesson} from '../js/learning_language_core.js';
import {parseLocaleFile} from '../js/locale_core.js';
import {openingFriendAnswer} from '../js/opening_journey_core.js';
import {tr,fill,setTranslator} from '../js/locale_runtime.js';
const source=fs.readFileSync(new URL('../js/views/adventure/view_opening_journey.js',import.meta.url),'utf8');
function render(phase,{joined=true,full=false,generic=false,language='en',actionResult=()=>true,listenResult=()=>true,navigationResult=()=>true}={} ){
 const all=[],document={body:{},activeElement:null};
 function el(tag,cls='',...children){const n={tag,className:cls,children,dataset:{},attributes:{},events:{},disabled:false,textContent:typeof children[0]==='string'?children[0]:'',setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},contains(node){return this===node||this.children.some(child=>child?.contains?.(node));},querySelectorAll(){return all.filter(node=>['button','input'].includes(node.tag)&&this.contains(node));},addEventListener(key,fn){this.events[key]=fn;},querySelector(){return null;},focus(){this.focused=true;document.activeElement=this;}};all.push(n);return n;}
 const calls=[],state={phase,petId:'gululu'};
 const context=vm.createContext({document,learningLesson,tr,fill,el,button:(label,action,cls)=>Object.assign(el('button',cls,label),{click:action}),art:()=>el('canvas'),petPortrait:()=>el('div','pet-sheet'),guidePet:()=>5,OPENING_PET:6,
 openingJourney:()=>state,openingJourneyMilestones:()=>[{label:'认识伙伴',complete:phase==='done'}],openingFriendAnswer,createCloseButton:action=>Object.assign(el('button','close-button'),{click:action})});
 vm.runInContext(source.slice(source.indexOf('export function')).replaceAll('export function','function'),context);
 const cb=Object.fromEntries(['close','go','pets','continue','explore','listen','wordplay'].map(key=>[key,()=>{calls.push(key);return navigationResult(key);}]));cb.action=value=>{calls.push(value);return actionResult(value);};cb.listen=options=>{calls.push('listen');return listenResult(options);};
 const root=el('div'),model={assets:{content:{npcs:{36201:{portrait:'moni'}},pets:{}}},save:{languageLearning:{target:language},heroSlot:0,formation:joined?['hero','gululu',null,null]:full?['hero','a','b','c']:['hero',null,null,null],pets:{gululu:{speciesId:6,name:'咕噜噜'}}}};
 if(generic)context.renderPetWelcome(root,model,'gululu',cb);else context.renderOpeningJourney(root,model,cb);
 return {all,calls,root,document,modal:root.children[0],button:label=>all.find(n=>n.tag==='button'&&n.textContent===label)};
}
for(const [phase,label,expected] of [
 ['offer','带抱抱龙去看看',{step:'accept'}],
 ['guide','先和侦查兵切磋',{step:'route',route:'battle'}],
 ['explain','We are friends. · 我们是朋友',{step:'explain',text:'We are friends.',language:'en',choice:true}],
 ['route','我想先解释一下',{step:'route',route:'talk'}],
 ['challenge','带我去找侦查兵','go'],
 ['rescue','放入宠物背包',{step:'rescue',join:false}],
 ['showcase','带它出发','go'],
 ['done','和伙伴玩口令','wordplay']
])test(`opening ${phase} keeps its existing deliberate action`,()=>{
 const ui=render(phase);assert.deepEqual(ui.calls,[],'rendering never mutates progress');
 assert.ok(ui.modal.className.includes('opening-character-dialogue'));
 if(phase!=='showcase')assert.ok(ui.all.some(n=>n.tag==='details'&&n.className==='opening-progress'),'progress remains available');
 else assert.ok(ui.all.some(n=>n.attributes['aria-label']==='咕噜噜 · 棉花啾兔'));
 const action=ui.button(label);assert.ok(action,label);action.click();
 assert.equal(JSON.stringify(ui.calls),JSON.stringify([expected]));
});
test('showcase with a stored companion retains join rather than pretending it is already in formation',()=>{
 const ui=render('showcase',{joined:false});assert.ok(ui.button('加入队伍'));assert.equal(ui.button('带它出发'),undefined);
 ui.button('加入队伍').click();assert.equal(ui.calls[0].step,'join');
});


test('a full opening team offers pet management and storage instead of an impossible join',()=>{
 const rescue=render('rescue',{joined:false,full:true});
 assert.equal(rescue.button('一起上场'),undefined);
 assert.equal(rescue.button('放入宠物背包').className,'primary');
 rescue.button('放入宠物背包').click();assert.equal(rescue.calls[0].join,false);
 const showcase=render('showcase',{joined:false,full:true});
 assert.equal(showcase.button('加入队伍'),undefined);
 assert.equal(showcase.button('打开宠物面板').className,'primary');
 assert.ok(showcase.all.some(n=>n.className==='opening-join-hint'));
 showcase.button('打开宠物面板').click();assert.deepEqual(showcase.calls,['pets']);
});

test('first companion reveal keeps one primary action and a short welcome',()=>{
 const ui=render('showcase');
 assert.equal(ui.modal.attributes['aria-label'],'新伙伴！');
 assert.deepEqual(ui.all.filter(n=>n.tag==='button'&&n.className==='primary').map(n=>n.textContent),['带它出发']);
 assert.ok(ui.all.some(n=>n.className==='opening-spoken-line'&&n.textContent==='以后，我陪你冒险！'));
 assert.equal(ui.all.some(n=>n.tag==='button'&&n.textContent==='查看伙伴'),false);
});

test('restored challenge offers one direct destination and an alternative route',()=>{
 const ui=render('challenge');
 assert.deepEqual(ui.all.filter(n=>n.tag==='button'&&n.className==='primary').map(n=>n.textContent),['带我去找侦查兵']);
 assert.equal(ui.button('我和抱抱龙去挑战'),undefined);
 assert.ok(ui.all.some(n=>n.className==='opening-spoken-line'&&n.textContent.includes('帮咕噜噜进来')));
 ui.button('带我去找侦查兵').click();assert.deepEqual(ui.calls,['go']);
 ui.button('我想先解释一下').click();assert.equal(ui.calls[1].route,'talk');
});

test('chapter reward shares the same brief welcome and leaves progression to the player',()=>{
 const ui=render('showcase',{generic:true});
 assert.equal(ui.modal.dataset.phase,'showcase');
 assert.equal(ui.modal.attributes['aria-modal'],'true');
 assert.equal(ui.modal.attributes['aria-label'],'新伙伴！');
 assert.deepEqual(ui.calls,[]);
 assert.deepEqual(ui.all.filter(n=>n.tag==='button'&&n.className==='primary').map(n=>n.textContent),['带它出发']);
 assert.ok(ui.all.some(n=>n.className==='opening-pet-award'&&n.textContent==='咕噜噜'));
 ui.button('带它出发').click();assert.deepEqual(ui.calls,['go']);
});

test('opening friend prompt, input language and choice payload follow the selected target',()=>{
 for(const language of ['ja','ko']){
  const ui=render('explain',{language}),lesson=learningLesson(language);
  assert.equal(ui.all.find(n=>n.tag==='input').lang,language);
  const choice=ui.button(lesson.friend+' · 我们是朋友');assert.ok(choice);choice.click();
  assert.equal(ui.calls[0].text,lesson.friend);assert.equal(ui.calls[0].language,language);
  assert.equal(ui.button('We are friends. · 我们是朋友'),undefined);
 }
});

for(const [phase,label]of [['offer','带抱抱龙去看看'],['guide','让它跟我们走'],['explain','We are friends. · 我们是朋友'],['rescue','一起上场'],['showcase','加入队伍']]){
 for(const failure of ['false','throw','reject','unchanged'])test(`${phase}: ${failure} save failure preserves the action and permits retry`,async()=>{
  let attempt=0;
  const ui=render(phase,{joined:false,actionResult:()=>{
   if(attempt++)return true;
   if(failure==='throw')throw Error('disk');
   if(failure==='reject')return Promise.reject(Error('disk'));
   return failure==='unchanged'?{changed:false,message:'请留在莫尼身边再试一次。'}:false;
  }});
  const button=ui.button(label);await button.click();
  assert.equal(ui.calls.length,1);assert.equal(button.disabled,false);
  assert.equal(ui.modal.attributes['aria-busy'],'false');
  assert.equal(ui.all.find(n=>n.className==='opening-save-status').textContent,failure==='unchanged'?'请留在莫尼身边再试一次。':'这一步没有保存，可以重试。');
  await button.click();assert.equal(ui.calls.length,2);
  assert.equal(ui.all.find(n=>n.className==='opening-save-status').textContent,'');
 });
}

test('pending opening save blocks duplicate and competing choices, voice, close and escape',async()=>{
 let settle;
 const ui=render('explain',{actionResult:()=>new Promise(resolve=>{settle=resolve;})});
 const choice=ui.button('We are friends. · 我们是朋友'),listen=ui.button('听示范');listen.disabled=true;
 const pending=choice.click();
 assert.equal(ui.modal.attributes['aria-busy'],'true');
 assert.ok(ui.modal.querySelectorAll().every(n=>n.disabled));
 choice.click();ui.button('换成战斗的办法').click();listen.click();
 ui.all.find(n=>n.className==='close-button').click();
 ui.modal.events.keydown({key:'Escape',stopPropagation(){},preventDefault(){}});
 const input=ui.all.find(n=>n.tag==='input');input.value='We are friends.';
 ui.all.find(n=>n.tag==='form').onsubmit({preventDefault(){}});
 assert.equal(ui.calls.length,1);
 settle(false);await pending;
 assert.equal(choice.disabled,false);assert.equal(listen.disabled,true,'restore the preexisting disabled state');
 assert.equal(input.value,'We are friends.');
});

test('typed friend answer preserves text after save rejection without marking correct language invalid',async()=>{
 let attempt=0;
 const ui=render('explain',{actionResult:()=>attempt++?true:Promise.reject(Error('disk'))});
 const input=ui.all.find(n=>n.tag==='input'),form=ui.all.find(n=>n.tag==='form'),feedback=ui.all.find(n=>n.id==='opening-answer-feedback');
 input.value='We are friends.';form.onsubmit({preventDefault(){}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(input.value,'We are friends.');assert.equal(input.attributes['aria-invalid'],undefined);
 assert.equal(feedback.textContent,'这一步没有保存，可以重试。');
 form.onsubmit({preventDefault(){}});assert.equal(ui.calls.length,2);assert.equal(feedback.textContent,'');
 assert.equal(ui.calls[0].text,'We are friends.');assert.equal(ui.calls[0].choice,undefined);
});

test('invalid or composing text never writes opening progress',()=>{
 const ui=render('explain'),input=ui.all.find(n=>n.tag==='input'),form=ui.all.find(n=>n.tag==='form');
 input.value='No.';form.onsubmit({preventDefault(){}});
 assert.equal(ui.calls.length,0);assert.equal(input.attributes['aria-invalid'],'true');
 input.value='We are friends.';input.oncompositionstart();form.onsubmit({preventDefault(){}});
 assert.equal(ui.calls.length,0);input.oncompositionend();form.onsubmit({preventDefault(){}});
 assert.equal(ui.calls.length,1);assert.equal(input.attributes['aria-invalid'],undefined);
});

test('replaced opening panel cannot submit stale choices or overwrite later status',async()=>{
 let settle;
 const ui=render('offer',{actionResult:()=>new Promise(resolve=>{settle=resolve;})}),button=ui.button('带抱抱龙去看看');
 const pending=button.click(),status=ui.all.find(n=>n.className==='opening-save-status');
 ui.root.replaceChildren({textContent:'another panel'});settle(false);await pending;
 button.click();ui.all.find(n=>n.className==='close-button').click();
 assert.equal(ui.calls.length,1);assert.equal(status.textContent,'正在保存，请稍候。');
});

for(const locale of ['en','ja','ko'])test('opening '+locale+' UI preserves Chinese learning phrases and clears corrected input errors',()=>{
 const table=parseLocaleFile(fs.readFileSync(new URL('../data/adventure/locale/'+locale+'.txt',import.meta.url),'utf8'));
 setTranslator(text=>table[text]||text,locale);
 try{
  const ui=render('explain',{language:'zh-CN'}),lesson=learningLesson('zh-CN');
  const action=ui.button(lesson.friend+' · '+table['我们是朋友']);assert.ok(action);
  assert.equal(ui.modal.attributes['aria-label'],table['第一次搭档']);
  const form=ui.all.find(n=>n.tag==='form'),input=ui.all.find(n=>n.tag==='input'),feedback=ui.all.find(n=>n.id==='opening-answer-feedback');
  const help=feedback.textContent;input.value='错了';form.onsubmit({preventDefault(){}});
  assert.equal(input.attributes['aria-invalid'],'true');
  assert.equal(feedback.textContent,table['用{language}告诉莫尼你们是朋友。可以说：{example}'].replace('{language}',table['中文']).replace('{example}',lesson.friend));
  input.value=lesson.friend;input.oninput();assert.equal(feedback.textContent,help);
  assert.equal(input.attributes['aria-invalid'],undefined);assert.deepEqual(ui.calls,[]);
  form.onsubmit({preventDefault(){}});assert.equal(ui.calls.length,1);assert.equal(ui.calls[0].text,lesson.friend);
 }finally{setTranslator(null);}
});


test('opening audio reports preparation and actual playback, ignoring duplicate taps without blocking an answer',async()=>{
 let resolve,playing;
 const ui=render('explain',{listenResult:options=>{playing=options.onPlaying;return new Promise(done=>resolve=done);}});
 const listen=ui.button('听示范'),status=ui.all.find(n=>n.className==='muted opening-audio-status');
 const pending=listen.click();assert.equal(status.textContent,'正在准备示范…');assert.equal(listen.attributes['aria-disabled'],'true');
 await listen.click();assert.equal(ui.calls.filter(x=>x==='listen').length,1);
 assert.equal(ui.button('We are friends. · 我们是朋友').disabled,false);
 playing();assert.equal(status.textContent,'正在播放示范…');
 ui.button('We are friends. · 我们是朋友').click();assert.equal(ui.calls.at(-1).step,'explain');
 resolve(true);await pending;assert.equal(status.textContent,'');assert.equal(listen.attributes['aria-busy'],undefined);
});
test('opening audio failure explains the available alternatives and permits retry',async()=>{
 let attempts=0;
 const ui=render('explain',{listenResult:()=>{if(++attempts===1)throw Error('offline');return true;}});
 const listen=ui.button('听示范'),status=ui.all.find(n=>n.className==='muted opening-audio-status');
 assert.equal(await listen.click(),false);assert.equal(status.textContent,'暂时听不到示范。可以直接选句子，或自己输入。');
 assert.equal(listen.attributes['aria-disabled'],undefined);await listen.click();assert.equal(attempts,2);assert.equal(status.textContent,'');
});
test('ending audio never unlocks a concurrent save or overwrites a replaced conversation',async()=>{
 let finishAudio,finishSave,playing;
 const ui=render('explain',{listenResult:options=>{playing=options.onPlaying;return new Promise(done=>finishAudio=done);},actionResult:()=>new Promise(done=>finishSave=done)});
 const listen=ui.button('听示范'),status=ui.all.find(n=>n.className==='muted opening-audio-status');
 const audio=listen.click(),save=ui.button('We are friends. · 我们是朋友').click();
 finishAudio(true);await audio;assert.equal(listen.disabled,true,'save still owns the disabled state');
 finishSave(false);await save;assert.equal(listen.disabled,false);
 const second=listen.click();ui.root.replaceChildren();const previous=status.textContent;
 playing();finishAudio(false);await second;assert.equal(status.textContent,previous,'detached conversation is not updated');
});

for(const composing of [{isComposing:true},{keyCode:229}])test('opening Escape belongs to the input method while composing '+JSON.stringify(composing),()=>{
 const ui=render('explain');let stopped=0,prevented=0;
 const event={key:'Escape',stopPropagation(){stopped++;},preventDefault(){prevented++;}};
 ui.modal.events.keydown({...event,...composing});assert.deepEqual(ui.calls,[]);assert.equal(prevented,0);assert.equal(stopped,1);
 ui.modal.events.keydown(event);assert.deepEqual(ui.calls,['close']);assert.equal(prevented,1);
});

for(const outcome of ['failure','rejection'])test('opening save '+outcome+' restores the disabled control after browser focus loss',async()=>{
 let resolve,reject;const pending=new Promise((yes,no)=>{resolve=yes;reject=no;});
 const ui=render('offer',{actionResult:()=>pending}),action=ui.button('带抱抱龙去看看');
 action.focus();const done=action.click();assert.equal(action.disabled,true);ui.document.activeElement=ui.document.body;
 if(outcome==='rejection')reject(new Error('offline'));else resolve(false);
 await done;assert.equal(action.disabled,false);assert.equal(ui.document.activeElement,action);
 assert.ok(ui.all.some(node=>node.textContent==='这一步没有保存，可以重试。'));
});

test('opening save recovery does not steal deliberate focus or focus an abandoned dialogue',async()=>{
 for(const detached of [false,true]){
  let resolve;const pending=new Promise(yes=>resolve=yes);
  const ui=render('offer',{actionResult:()=>pending}),action=ui.button('带抱抱龙去看看');action.focus();const done=action.click();
  const nextFocus={};ui.document.activeElement=detached?ui.document.body:nextFocus;
  if(detached)ui.root.replaceChildren();resolve(false);await done;
  assert.equal(ui.document.activeElement,detached?ui.document.body:nextFocus);
 }
});

for(const outcome of ['false','throw','reject'])test('failed opening departure remains visible with retry feedback: '+outcome,async()=>{
 let failed=true;const ui=render('showcase',{navigationResult(){if(!failed)return true;if(outcome==='throw')throw Error('quota');if(outcome==='reject')return Promise.reject(Error('quota'));return false;}});
 await ui.button('带它出发').click();assert.equal(ui.all.find(n=>n.className==='opening-save-status').textContent,'这一步没有保存，可以重试。');
 failed=false;await ui.button('带它出发').click();assert.equal(ui.all.find(n=>n.className==='opening-save-status').textContent,'');assert.deepEqual(ui.calls,['go','go']);
});

for(const outcome of ['false','throw','reject'])test('first pet welcome reports departure failure and accepts a retry: '+outcome,async()=>{
 let failed=true;const ui=render('showcase',{generic:true,navigationResult(){if(!failed)return true;if(outcome==='throw')throw Error('quota');if(outcome==='reject')return Promise.reject(Error('quota'));return false;}});
 const button=ui.button('带它出发'),status=ui.all.find(n=>n.className==='opening-save-status');
 await button.click();assert.equal(status.textContent,'这一步没有保存，可以重试。');assert.equal(ui.modal.attributes['aria-busy'],'false');
 failed=false;await button.click();assert.equal(status.textContent,'');assert.deepEqual(ui.calls,['go','go']);
});

test('first pet welcome blocks double departure and Escape while its save is pending',async()=>{
 let resolve;const pending=new Promise(yes=>resolve=yes),ui=render('showcase',{generic:true,navigationResult:()=>pending});
 const button=ui.button('带它出发'),done=button.click();assert.equal(button.click(),false);
 ui.modal.events.keydown({key:'Escape',stopPropagation(){},preventDefault(){}});
 assert.deepEqual(ui.calls,['go']);assert.equal(ui.modal.attributes['aria-busy'],'true');
 resolve(false);await done;assert.equal(ui.modal.attributes['aria-busy'],'false');
 ui.modal.events.keydown({key:'Escape',stopPropagation(){},preventDefault(){}});assert.deepEqual(ui.calls,['go','close']);
});

test('first pet welcome ignores detached controls and delayed save feedback',async()=>{
 let resolve;const pending=new Promise(yes=>resolve=yes),ui=render('showcase',{generic:true,navigationResult:()=>pending});
 const button=ui.button('带它出发'),done=button.click(),status=ui.all.find(n=>n.className==='opening-save-status');
 ui.root.replaceChildren();resolve(false);await done;assert.equal(status.textContent,'正在保存，请稍候。');
 assert.equal(button.click(),false);assert.deepEqual(ui.calls,['go']);
});

for(const composition of [{isComposing:true},{keyCode:229}])test('first pet welcome leaves composing Escape to the IME '+JSON.stringify(composition),()=>{
 const ui=render('showcase',{generic:true});let prevented=0;
 const event={key:'Escape',stopPropagation(){},preventDefault(){prevented++;}};
 ui.modal.events.keydown({...event,...composition});assert.deepEqual(ui.calls,[]);assert.equal(prevented,0);
 ui.modal.events.keydown(event);assert.deepEqual(ui.calls,['close']);assert.equal(prevented,1);
});

for(const flags of [{isComposing:true},{keyCode:229},{composition:true}])test('opening IME confirmation keeps the friend answer unsubmitted '+JSON.stringify(flags),()=>{
 const ui=render('explain'),input=ui.all.find(n=>n.tag==='input'),form=ui.all.find(n=>n.tag==='form');input.value='We are friends.';
 if(flags.composition)input.oncompositionstart();
 let prevented=false;input.onkeydown({key:'Enter',...flags,preventDefault(){prevented=true;}});
 if(!prevented)form.onsubmit({preventDefault(){}});
 assert.equal(prevented,true);assert.deepEqual(ui.calls,[]);assert.equal(input.value,'We are friends.');
});
test('opening normal Enter submits the friend answer after composition finishes',()=>{
 const ui=render('explain'),input=ui.all.find(n=>n.tag==='input');input.value='We are friends.';input.oncompositionstart();input.oncompositionend();
 let prevented=false;input.onkeydown({key:'Enter',preventDefault(){prevented=true;}});
 assert.equal(prevented,false);if(!prevented)ui.all.find(n=>n.tag==='form').onsubmit({preventDefault(){}});
 assert.equal(ui.calls.length,1);assert.equal(ui.calls[0].text,'We are friends.');assert.equal(input.enterKeyHint,'send');
});
