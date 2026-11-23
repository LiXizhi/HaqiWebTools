import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as forest from '../js/forest_commission_core.js';
import * as forestLanguage from '../js/forest_commission_language_core.js';
import * as forestExchange from '../js/forest_exchange_core.js';
import * as forestStory from '../js/forest_commission_story_core.js';
import * as forestMystery from '../js/forest_mystery_core.js';
import {bindSceneDrag,pointInsideElement} from '../js/adventure_scene_drag.js';
import {monsterArtBinding} from '../js/adventure_monster_art_core.js';
const source=fs.readFileSync(new URL('../js/views/adventure/view_forest_commission.js',import.meta.url),'utf8');
const mysterySource=fs.readFileSync(new URL('../js/views/adventure/view_forest_mystery.js',import.meta.url),'utf8');
const content=JSON.parse(fs.readFileSync(new URL('../data/adventure/chapter.json',import.meta.url)));
const exportedItems=JSON.parse(fs.readFileSync(new URL('../data/adventure/shop-candidates.json',import.meta.url)));
for(const id of [1415,1416,1417,1418,1419])content.items[id]=exportedItems[id];
function render(phase,{nearby=true,level=1,language='en',target=language,recorder,action,plan,mystery,rescue}={}){
 const all=[],calls=[],document={activeElement:null};
 function el(tag,cls='',...children){
  const n={tag,className:cls,children,dataset:{},style:{},attributes:{},events:{},textContent:typeof children[0]==='string'?children[0]:'',
   setAttribute(k,v){this.attributes[k]=v;},append(...v){this.children.push(...v);},replaceChildren(...v){this.children=v;},
   addEventListener(k,fn){this.events[k]=fn;},focus(){document.activeElement=this;},getClientRects(){return this.hidden?[]:[{}];},getContext(){return {clearRect(){}};},getBoundingClientRect(){return {left:0,right:200,top:300,bottom:400};},
   querySelectorAll(selector){const descendants=[];function scan(parent){for(const child of parent.children)if(child&&typeof child==='object'){descendants.push(child);scan(child);}}scan(this);
    return descendants.filter(row=>selector==='.forest-object'?row.className.split(' ').includes('forest-object'):selector==='button'?row.tag==='button':selector.startsWith('.primary')?row.className==='primary'&&!row.disabled:((row.tag==='button'||selector.includes('input')&&row.tag==='input')&&!row.disabled)||row.tag==='summary');},
   querySelector(selector){return this.querySelectorAll(selector)[0]||null;}};
  n.classList={add:cls=>n.className+=' '+cls,remove:cls=>n.className=n.className.split(' ').filter(c=>c!==cls).join(' ')};all.push(n);return n;
 }
 const context=vm.createContext({document,Date:{now:()=>1234},watchTreeText:()=>{},...forest,...forestLanguage,...forestExchange,...forestStory,...forestMystery,monsterArtBinding,bindSceneDrag,pointInsideElement,forestCommissionRewardPreviews:(save,c,step)=>forest.forestCommissionRewards(save,c,step).map(row=>({...row,changes:[]})),equipmentComparison:()=>el('section','equipment-comparison'),el,button:(label,action,cls='')=>Object.assign(el('button',cls,label),{click:action}),
  art:(assets,value)=>Object.assign(el('canvas'),{drawnArt:value}),createCloseButton:click=>Object.assign(el('button','close-button'),{click})});
 vm.runInContext(mysterySource.replace(/^import .*;\r?\n/gm,'').replace(/export function/g,'function'),context);
 vm.runInContext(source.replace(/^import .*;\r?\n/gm,'').replace('export function','function'),context);
 const save={school:'fire',level,inventory:{},...(phase==='offer'?{}:{forestCommission:{version:1,phase:phase==='report'?'patrol':phase,...(['patrol','report','done'].includes(phase)?{clearBaseline:0}:{})}})};
 if(rescue)save.sparkRescue=structuredClone(rescue);
 if(target)save.languageLearning={target};if(plan)save.forestCommission.plan=plan;
 if(mystery)save.forestCommission={version:1,phase:'done',clearBaseline:0,mystery:structuredClone(mystery)};
 if(['report','done'].includes(phase))save.dungeonChallengeRecords={'journey:first-watch':{clears:1}};
 const cb=Object.fromEntries(['close','go','training','equipment','patrol','nextChallenge','mainline'].map(k=>[k,()=>calls.push(k)]));
 cb.training=lesson=>calls.push(typeof lesson==='string'?{training:lesson}:'training');
 cb.action=action|| (value=>calls.push(JSON.parse(JSON.stringify(value))));cb.listen=line=>calls.push({listen:line});if(recorder)cb.recorder=recorder;
 const root=el('div'),draw=()=>true;
 context.renderForestCommission(root,{save,nearby,assets:{content,buildingArt:{draw},environmentArt:{draw},drawMonster(){}}},cb);
 return {all,calls,document,root,save,modal:root.children[0],find:label=>all.find(n=>n.textContent===label),object:label=>all.find(n=>n.attributes['aria-label']===label)};
}

const mysteryAt=(observed=[],witness=false)=>({version:1,status:'active',route:'tracks',observed,witness});
test('investigation keeps inspection physical, opens evidence notes, and can be put away',()=>{
 const distant=render('done',{nearby:false,mystery:mysteryAt()});
 assert.ok(distant.find('带我去调查地点'));assert.equal(distant.find('查看泥里的草屑'),undefined);
 distant.find('带我去调查地点').click();distant.find('先收好调查袋').click();
 assert.deepEqual(distant.calls,['go',{step:'mystery-pause'}]);
 const ui=render('done',{mystery:mysteryAt(['grass'])});
 assert.ok(ui.find('调查袋 · 1/4 件物证'));assert.ok(ui.find('已记录 · 查看泥里的草屑'));
 ui.find('翻看湿补给单').click();ui.find('看看干帽子').click();
 assert.deepEqual(ui.calls,[{step:'mystery-inspect',object:'paper'},{step:'mystery-inspect',object:'hat'}]);
});

test('ordering cards gives local feedback without losing the chosen agreement, then submits the reconstructed sequence',async()=>{
 const ui=render('done',{mystery:mysteryAt(['grass','paper','tracks','lamp'],true)});
 const submit=ui.find('把经过讲给茜茜听');assert.equal(submit.disabled,true);
 ui.find('移动补给后，留下位置便签').click();assert.equal(submit.disabled,false);
 submit.click();assert.deepEqual(ui.calls,[]);assert.ok(ui.all.some(n=>n.textContent.includes('把这两步挪到前面')));
 const list=ui.all.find(n=>n.className==='forest-mystery-order');
 const front=index=>list.children[index].children.find(n=>n?.className==='forest-mystery-move').children[0];
 front(1).click();front(2).click();
 assert.match(ui.document.activeElement.attributes['aria-label'],/往前移|往后移/);
 submit.click();submit.click();assert.equal(ui.calls.length,1,'double click while a commit is pending is ignored');
 assert.deepEqual(ui.calls[0],{step:'mystery-solve',order:['dim','find','return'],ending:'sign'});
 await Promise.resolve();await Promise.resolve();
});

test('failed reconstruction persistence allows retry without discarding the event order',async()=>{
 let attempts=0;
 const ui=render('done',{mystery:mysteryAt(['grass','paper','tracks','lamp'],true),action:()=>{attempts++;return Promise.reject(Error('quota'));}});
 const list=ui.all.find(n=>n.className==='forest-mystery-order');
 const front=index=>list.children[index].children.find(n=>n?.className==='forest-mystery-move').children[0];
 front(1).click();front(2).click();ui.find('结伴送达，当面告诉对方').click();
 const submit=ui.find('把经过讲给茜茜听');submit.click();
 await new Promise(resolve=>setImmediate(resolve));assert.equal(submit.disabled,false);
 assert.ok(ui.find('这次经过没有保存，可以重试。'));submit.click();assert.equal(attempts,2);
 await new Promise(resolve=>setImmediate(resolve));
});

test('forest scene renders without granting progress; a chosen hat and boots dispatch distinct physical pickups',()=>{
 const ui=render('boots');assert.deepEqual(ui.calls,[]);
 assert.equal(ui.object('一顶帽子').children.find(n=>n?.drawnArt).drawnArt.id,content.items[1240].art.id,'the hat decoy must keep its hat artwork when report rewards change');
 assert.equal(ui.object('一双靴子').children.find(n=>n?.drawnArt).drawnArt.id,content.items[1260].art.id);
 const put=ui.find('先选一件物品');assert.equal(put.disabled,true);
 ui.object('一顶帽子').click();assert.equal(put.disabled,false);put.click();
 ui.object('一双靴子').click();put.click();
 assert.deepEqual(ui.calls,[{step:'take-boots',object:'hat',learning:{at:1234,attempts:1}},{step:'take-boots',object:'boots',learning:{at:1234,attempts:2}}]);
 assert.equal(ui.object('一双靴子').attributes['aria-pressed'],'true');
 assert.equal(ui.object('一顶帽子').attributes['aria-pressed'],'false');
 ui.find('听线索').click();assert.match(ui.calls.at(-1).listen,/Leave the hat/);
 assert.ok(ui.all.some(n=>n.tag==='details'),'help is available without an answer gate');
});

test('touch dragging to the pouch submits only a deliberately dropped object',()=>{
 const ui=render('boots'),boots=ui.object('一双靴子');
 const e=(x,y,id=1)=>({pointerId:id,pointerType:'touch',clientX:x,clientY:y,preventDefault(){}});
 boots.events.pointerdown(e(50,100));boots.events.pointermove(e(50,350));
 assert.match(boots.style.translate,/250px/);boots.events.pointerup(e(50,350));
 assert.equal(boots.style.translate,'');
 assert.deepEqual(ui.calls,[{step:'take-boots',object:'boots',learning:{at:1234,attempts:1}}]);
});

test('a cancelled gesture, a second finger and a drop outside the pouch cannot take supplies',()=>{
 const ui=render('boots'),boots=ui.object('一双靴子');
 const e=(x,y,id=1)=>({pointerId:id,clientX:x,clientY:y,preventDefault(){}});
 boots.events.pointerdown(e(50,100));boots.events.pointermove(e(50,350,2));boots.events.pointerup(e(50,350,2));
 assert.deepEqual(ui.calls,[]);
 boots.events.pointercancel(e(50,350));assert.deepEqual(ui.calls,[]);
 boots.events.pointerdown(e(50,100));boots.events.pointermove(e(250,350));boots.events.pointerup(e(250,350));
 assert.deepEqual(ui.calls,[]);
});

test('a cancelled rock drag leaves the note hidden; a deliberate drag reveals it',()=>{
 const ui=render('note'),note=ui.object('拾取巡逻路线便签'),rock=ui.object('挪开石头');
 const e=(x,y)=>({pointerId:1,clientX:x,clientY:y,preventDefault(){}});
 rock.events.pointerdown(e(50,50));rock.events.pointermove(e(100,50));rock.events.pointercancel(e(100,50));
 assert.equal(note.hidden,true);assert.deepEqual(ui.calls,[]);
 rock.events.pointerdown(e(50,50));rock.events.pointermove(e(100,50));rock.events.pointerup(e(100,50));
 assert.equal(note.hidden,false);assert.deepEqual(ui.calls,[]);
});

test('the hidden note is revealed deliberately before it can be picked up',()=>{
 const ui=render('note'),note=ui.object('拾取巡逻路线便签'),rock=ui.object('挪开石头'),bush=ui.object('检查灌木');
 assert.equal(note.hidden,true);assert.deepEqual(ui.calls,[]);
 assert.equal(ui.find('挪开石头'),undefined,'the visible action must not reveal the language clue answer');
 assert.ok(bush.children.some(n=>n.className==='forest-illustration'),'the other hiding place uses authored prop art');
 bush.click();assert.equal(note.hidden,true);assert.deepEqual(ui.calls,[]);
 assert.ok(ui.all.some(n=>n.className==='forest-status'&&n.textContent.includes('没有便签')));
 rock.click();assert.equal(note.hidden,false);assert.equal(rock.disabled,true);assert.equal(ui.document.activeElement,note);
 note.click();assert.deepEqual(ui.calls,[{step:'take-note',revealed:true,learning:{at:1234,attempts:2}}]);
});

test('distant scenes provide travel instead of remote pickup or delivery',()=>{
 for(const phase of ['offer','boots','delivery','note','briefing','report']){
  const ui=render(phase,{nearby:false});assert.deepEqual(ui.calls,[]);
  assert.equal(ui.object('一双靴子'),undefined);assert.equal(ui.object('挪开石头'),undefined);
  assert.equal(ui.object('茜茜收取物品的位置'),undefined);
  const primary=ui.all.find(n=>n.className==='primary');assert.ok(primary,phase);primary.click();assert.deepEqual(ui.calls,['go'],phase);
 }
});

test('the patrol report identifies the actual school cloak before the player claims it',()=>{
 const ui=render('report',{level:5});
 assert.ok(ui.find('火舞披风'));assert.equal(ui.find('初级烈火魔法师帽'),undefined);
 assert.ok(ui.all.some(n=>n.className==='equipment-comparison'));
 assert.deepEqual(ui.calls,[]);
});

test('carried quest objects can be handed to the recipient',()=>{
 const e=(x,y,id=1)=>({pointerId:id,pointerType:'touch',clientX:x,clientY:y,preventDefault(){}});
 for(const [phase,label,step]of [['delivery','递出待送达的巡逻靴','deliver'],['report','递出巡逻路线便签','report']]){
  const clicked=render(phase);clicked.object(label).click();assert.deepEqual(clicked.calls,[{step}],phase+' click hands in the item');
  const ui=render(phase),carried=ui.object(label);assert.ok(carried,phase);assert.ok(ui.object('茜茜收取物品的位置'));
  carried.events.pointerdown(e(50,100));carried.events.pointermove(e(50,350));carried.events.pointercancel(e(50,350));assert.deepEqual(ui.calls,[]);
  carried.events.pointerdown(e(50,100));carried.events.pointermove(e(250,350));carried.events.pointerup(e(250,350));assert.deepEqual(ui.calls,[]);
  carried.events.pointerdown(e(50,100));carried.events.pointermove(e(50,350));carried.events.pointerup(e(50,350));assert.deepEqual(ui.calls,[{step}],phase);
 }
});

test('briefing recalls the delivered supply before target-language tactics',()=>{
 for(const language of ['en','ja','ko','zh-CN']){
  const ui=render('briefing',{language}),options=ui.all.filter(n=>n.className==='forest-tactic-choice');
  const recall=ui.all.find(n=>n.className==='forest-recall');
  assert.ok(recall.children[0].textContent.includes(forestLanguage.forestCommissionLesson({languageLearning:{target:language}}).words.boots));
  assert.equal(options[0].children.at(-1).lang,language);
  assert.equal(options[0].hidden,undefined);
  assert.equal(ui.all.find(n=>n.className==='forest-tactic-choices').hidden,true);
  assert.equal(ui.object('靴子').children.find(n=>n?.drawnArt).drawnArt.id,content.items[1260].art.id);
  ui.object('帽子').click();assert.deepEqual(ui.calls,[]);
  ui.object('靴子').click();assert.equal(recall.hidden,true);
  assert.equal(options.length,2);
  assert.deepEqual(options.map(n=>n.children.at(-1).textContent),[forestLanguage.forestCommissionLesson({languageLearning:{target:language}}).tactics.split,forestLanguage.forestCommissionLesson({languageLearning:{target:language}}).tactics.focus]);
  assert.ok(options.every(n=>n.children.some(child=>child.className==='forest-tactic-art')));
  options[0].click();assert.deepEqual(ui.calls,[]);
  assert.ok(ui.all.some(n=>n.className==='forest-status'&&n.textContent.includes('不一样')));
  options[1].click();assert.deepEqual(ui.calls,[{step:'brief',tactic:'focus',recalled:'boots',learning:{at:1234,attempts:4,assisted:false}}]);
 }
});

test('forest dialog keeps Escape and Tab within its own controls',()=>{
 const ui=render('offer'),buttons=ui.modal.querySelectorAll('button:not(:disabled),summary');
 assert.equal(ui.modal.attributes['aria-modal'],'true');
 let prevented=0;buttons.at(-1).focus();ui.modal.events.keydown({key:'Tab',stopPropagation(){},preventDefault(){prevented++;}});
 assert.equal(ui.document.activeElement,buttons[0]);assert.equal(prevented,1);
 ui.modal.events.keydown({key:'Escape',stopPropagation(){},preventDefault(){}});assert.deepEqual(ui.calls,['close']);
});

test('the route note starts one real monster fight without theory exercises',()=>{
 const ui=render('briefing'),practice=ui.all.filter(n=>n.textContent==='和茜茜打怪');
 assert.equal(practice.length,1);
 assert.equal(ui.all.some(n=>n.textContent==='借卡练习这项配合'),false);
 practice[0].click();
 assert.deepEqual(ui.calls,['training']);
});

test('a low-level patrol gives a mainline route while a prepared character can choose the dungeon',()=>{
 const low=render('patrol',{level:4});
 const primary=low.all.find(n=>n.className==='primary');assert.equal(primary.textContent,'去升级');
 primary.click();assert.deepEqual(low.calls,['mainline']);
 assert.ok(low.all.some(n=>n.textContent.includes('进度会保留')));
 const ready=render('patrol',{level:5});assert.equal(ready.find('去升级'),undefined);
 ready.all.find(n=>n.className==='primary').click();assert.deepEqual(ready.calls,['patrol']);
});

test('after reporting, the next goal leads through mainline level six to the owned-party challenge',()=>{
 const low=render('done',{level:5});
 low.find('升到6级').click();assert.deepEqual(low.calls,['mainline']);
 low.find('挑战走失的火种').click();assert.deepEqual(low.calls,['mainline','nextChallenge']);
 const ready=render('done',{level:6});assert.equal(ready.find('升到6级'),undefined);
 ready.find('挑战走失的火种').click();assert.deepEqual(ready.calls,['nextChallenge']);
 assert.ok(ready.all.some(n=>n.textContent.includes('带伙伴')));
});

const exchangeField=ui=>ui.all.find(n=>n.tag==='input'&&n.attributes['aria-label']?.endsWith('短句'));
test('completed investigations retain testimony and evidence beside the next adventure',()=>{
 const mystery={version:1,status:'solved',route:'tracks',observed:['grass','paper','tracks','lamp'],witness:true,ending:'sign'};
 const ui=render('done',{level:6,mystery});
 assert.ok(ui.find('调查袋 · 4/4 件物证'));
 assert.ok(ui.all.some(n=>n.textContent.includes('莫尼的证词')));
 assert.ok(ui.all.some(n=>n.textContent.includes('核对后的经过')));
 assert.ok(ui.find('挑战走失的火种'));
});

test('returning from the spark rescue recalls the actual promise and offers a revisit',()=>{
 for(const promise of ['signal','together']){
  const ui=render('done',{level:6,rescue:{version:1,status:'safe',method:'lamp',path:[16,17,12,7,2,3,4],promise}});
  assert.ok(ui.all.some(n=>n.textContent.includes(promise==='signal'?'灯光信号':'等齐才走')));
  assert.equal(ui.find('挑战走失的火种'),undefined);
  ui.find('重访走失的火种').click();assert.deepEqual(ui.calls,['nextChallenge']);
 }
 const active=render('done',{rescue:{version:1,status:'active',method:'lamp',path:[16]}});
 assert.equal(active.all.some(n=>n.textContent.includes('守护者捎话')),false);
});
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('handover is available without a configured target language or without opening hints',()=>{
 const legacy=render('delivery',{target:null});assert.equal(exchangeField(legacy),undefined);
 legacy.find('交付靴子').click();assert.deepEqual(legacy.calls,[{step:'deliver'}]);
 const far=render('delivery',{target:'en',nearby:false});assert.equal(exchangeField(far),undefined);
 const ui=render('delivery',{target:'en'}),field=exchangeField(ui);
 assert.ok(field);assert.equal(field.lang,'en');
 const help=ui.all.find(n=>n.tag==='details'&&n.children.some(c=>c.textContent?.startsWith('想不到怎么说')));
 assert.ok(help);assert.ok(!help.open);
});

test('an incomplete phrase can be retried; Enter waits for IME and records hint assistance',async()=>{
 const ui=render('delivery',{target:'en'}),field=exchangeField(ui),send=ui.find('说好了，交给她');
 field.value='boots';send.click();assert.deepEqual(ui.calls,[]);
 field.value='Here are the boots.';
 field.events.keydown({key:'Enter',isComposing:true});assert.deepEqual(ui.calls,[]);
 const help=ui.all.find(n=>n.tag==='details'&&n.children.some(c=>c.textContent?.startsWith('想不到怎么说')));
 help.open=true;
 field.events.keydown({key:'Enter',preventDefault(){},stopPropagation(){}});
 send.click();assert.equal(ui.calls.length,1);
 assert.deepEqual(ui.calls[0],{step:'exchange',word:'boots',text:'Here are the boots.',language:'en',input:'text',learning:{at:1234,attempts:2,assisted:true}});
 await tick();assert.equal(send.disabled,false);
});

test('voice needs explicit confirmation, edits become text, cancel and disposal release the recorder',async()=>{
 let callbacks,starts=0,finishes=0,cancels=0,disposals=0;
 const ui=render('delivery',{target:'en',recorder:c=>{callbacks=c;return {
  start(){starts++;c.onState('recording');},finish(){finishes++;c.onState('finishing');},
  cancel(){cancels++;c.onState('idle');},dispose(){disposals++;},
 };}}),field=exchangeField(ui),mic=ui.find('用麦克风说'),send=ui.find('说好了，交给她');
 assert.equal(starts,0);mic.click();assert.equal(starts,1);assert.equal(field.disabled,true);send.click();assert.deepEqual(ui.calls,[]);
 mic.click();assert.equal(finishes,1);callbacks.onState('idle');callbacks.onText('Here are the boots.');assert.deepEqual(ui.calls,[]);
 send.click();assert.equal(ui.calls[0].input,'speech');await tick();
 field.value='Take these boots.';field.events.input();send.click();assert.equal(ui.calls[1].input,'text');await tick();
 ui.root.cancelForestRecording();assert.equal(cancels,1);
 ui.root.disposeForestCommission();assert.equal(disposals,1);
 callbacks.onText('late transcript');assert.equal(field.value,'Take these boots.');send.click();assert.equal(ui.calls.length,2);
});

test('failed persistence leaves the phrase available for a retry',async()=>{
 let actions=0;const ui=render('delivery',{target:'ja',action:()=>{actions++;return Promise.reject(Error('quota'));}}),field=exchangeField(ui);
 field.value='ブーツをどうぞ。';ui.find('说好了，交给她').click();await tick();
 assert.equal(actions,1);assert.equal(field.value,'ブーツをどうぞ。');assert.equal(ui.find('说好了，交给她').disabled,false);
 assert.ok(ui.all.some(n=>n.textContent.includes('没有保存')));
});

for(const failure of ['false','throw'])test(`a ${failure} save failure releases the handover button`,async()=>{
 const ui=render('delivery',{target:'en',action:()=>{if(failure==='throw')throw Error('quota');return false;}}),field=exchangeField(ui);
 field.value='Here are the boots.';ui.find('说好了，交给她').click();await tick();
 assert.equal(field.value,'Here are the boots.');assert.equal(ui.find('说好了，交给她').disabled,false);
 assert.ok(ui.all.some(n=>n.textContent.includes('没有保存')));
});

test('the saved proposal is visible and remembered by world NPCs',()=>{
 const ui=render('briefing',{plan:'tracks'});
 assert.equal(ui.find('我想先追脚印，看看是谁。').attributes['aria-pressed'],'true');
 ui.find('先守住灯，一起前进。').click();assert.deepEqual(ui.calls,[{step:'plan',plan:'light'}]);
 ui.save.forestCommission.phase='patrol';ui.save.forestCommission.clearBaseline=0;
 assert.match(forest.forestCommissionScene(ui.save).npcs[forest.FOREST_NPCS.receiver],/脚印/);
});
