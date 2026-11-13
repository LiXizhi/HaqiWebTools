import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as forest from '../js/forest_commission_core.js';
import {bindSceneDrag,pointInsideElement} from '../js/adventure_scene_drag.js';
const source=fs.readFileSync(new URL('../js/view_forest_commission.js',import.meta.url),'utf8');
const content=JSON.parse(fs.readFileSync(new URL('../data/adventure/chapter.json',import.meta.url)));
const exportedItems=JSON.parse(fs.readFileSync(new URL('../data/adventure/shop-candidates.json',import.meta.url)));
for(const id of [1415,1416,1417,1418,1419])content.items[id]=exportedItems[id];
function render(phase,{nearby=true,level=1}={}){
 const all=[],calls=[],document={activeElement:null};
 function el(tag,cls='',...children){
  const n={tag,className:cls,children,dataset:{},style:{},attributes:{},events:{},textContent:typeof children[0]==='string'?children[0]:'',
   setAttribute(k,v){this.attributes[k]=v;},append(...v){this.children.push(...v);},replaceChildren(...v){this.children=v;},
   addEventListener(k,fn){this.events[k]=fn;},focus(){document.activeElement=this;},getClientRects(){return this.hidden?[]:[{}];},getContext(){return {};},getBoundingClientRect(){return {left:0,right:200,top:300,bottom:400};},
   querySelectorAll(selector){const descendants=[];function scan(parent){for(const child of parent.children)if(child&&typeof child==='object'){descendants.push(child);scan(child);}}scan(this);
    return descendants.filter(row=>selector==='.forest-object'?row.className.split(' ').includes('forest-object'):selector==='button'?row.tag==='button':selector.startsWith('.primary')?row.className==='primary'&&!row.disabled:(row.tag==='button'&&!row.disabled)||row.tag==='summary');},
   querySelector(selector){return this.querySelectorAll(selector)[0]||null;}};
  n.classList={add:cls=>n.className+=' '+cls,remove:cls=>n.className=n.className.split(' ').filter(c=>c!==cls).join(' ')};all.push(n);return n;
 }
 const context=vm.createContext({document,Date:{now:()=>1234},watchTreeText:()=>{},...forest,bindSceneDrag,pointInsideElement,forestCommissionRewardPreviews:(save,c,step)=>forest.forestCommissionRewards(save,c,step).map(row=>({...row,changes:[]})),equipmentComparison:()=>el('section','equipment-comparison'),el,button:(label,action,cls='')=>Object.assign(el('button',cls,label),{click:action}),
  art:(assets,value)=>Object.assign(el('canvas'),{drawnArt:value}),createCloseButton:click=>Object.assign(el('button','close-button'),{click})});
 vm.runInContext(source.replace(/^import .*;\r?\n/gm,'').replace('export function','function'),context);
 const save={school:'fire',level,inventory:{},...(phase==='offer'?{}:{forestCommission:{version:1,phase:phase==='report'?'patrol':phase,...(['patrol','report','done'].includes(phase)?{clearBaseline:0}:{})}})};
 if(['report','done'].includes(phase))save.dungeonChallengeRecords={'journey:first-watch':{clears:1}};
 const cb=Object.fromEntries(['close','go','training','equipment','patrol','nextChallenge','mainline'].map(k=>[k,()=>calls.push(k)]));
 cb.training=lesson=>calls.push(typeof lesson==='string'?{training:lesson}:'training');
 cb.action=value=>calls.push(JSON.parse(JSON.stringify(value)));cb.listen=line=>calls.push({listen:line});
 const root=el('div'),draw=()=>true;
 context.renderForestCommission(root,{save,nearby,assets:{content,buildingArt:{draw},environmentArt:{draw}}},cb);
 return {all,calls,document,modal:root.children[0],find:label=>all.find(n=>n.textContent===label),object:label=>all.find(n=>n.attributes['aria-label']===label)};
}

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
 const ui=render('note'),note=ui.find('巡逻路线便签'),rock=ui.object('挪开石头');
 const e=(x,y)=>({pointerId:1,clientX:x,clientY:y,preventDefault(){}});
 rock.events.pointerdown(e(50,50));rock.events.pointermove(e(100,50));rock.events.pointercancel(e(100,50));
 assert.equal(note.hidden,true);assert.deepEqual(ui.calls,[]);
 rock.events.pointerdown(e(50,50));rock.events.pointermove(e(100,50));rock.events.pointerup(e(100,50));
 assert.equal(note.hidden,false);assert.deepEqual(ui.calls,[]);
});

test('the hidden note is revealed deliberately before it can be picked up',()=>{
 const ui=render('note'),note=ui.find('巡逻路线便签'),rock=ui.object('挪开石头');
 assert.equal(note.hidden,true);assert.deepEqual(ui.calls,[]);
 rock.click();assert.equal(note.hidden,false);assert.equal(rock.disabled,true);assert.equal(ui.document.activeElement,note);
 note.click();assert.deepEqual(ui.calls,[{step:'take-note',revealed:true}]);
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

test('carried quest objects can be handed to the recipient without a dialog answer gate',()=>{
 const e=(x,y,id=1)=>({pointerId:id,pointerType:'touch',clientX:x,clientY:y,preventDefault(){}});
 for(const [phase,label,step]of [['delivery','递出待送达的巡逻靴','deliver'],['briefing','递出巡逻路线便签','brief'],['report','递出巡逻路线便签','report']]){
  const ui=render(phase),carried=ui.object(label);assert.ok(carried,phase);assert.ok(ui.object('茜茜收取物品的位置'));
  carried.click();assert.deepEqual(ui.calls,[],phase+' selection cannot hand in an item');
  carried.events.pointerdown(e(50,100));carried.events.pointermove(e(50,350));carried.events.pointercancel(e(50,350));assert.deepEqual(ui.calls,[]);
  carried.events.pointerdown(e(50,100));carried.events.pointermove(e(250,350));carried.events.pointerup(e(250,350));assert.deepEqual(ui.calls,[]);
  carried.events.pointerdown(e(50,100));carried.events.pointermove(e(50,350));carried.events.pointerup(e(50,350));assert.deepEqual(ui.calls,[{step}],phase);
 }
});

test('forest dialog keeps Escape and Tab within its own controls',()=>{
 const ui=render('offer'),buttons=ui.modal.querySelectorAll('button:not(:disabled),summary');
 assert.equal(ui.modal.attributes['aria-modal'],'true');
 let prevented=0;buttons.at(-1).focus();ui.modal.events.keydown({key:'Tab',stopPropagation(){},preventDefault(){prevented++;}});
 assert.equal(ui.document.activeElement,buttons[0]);assert.equal(prevented,1);
 ui.modal.events.keydown({key:'Escape',stopPropagation(){},preventDefault(){}});assert.deepEqual(ui.calls,['close']);
});

test('each route-note tactic opens its matching borrowed-card exercise',()=>{
 const ui=render('briefing'),practice=ui.all.filter(n=>n.textContent==='借卡练习这项配合');
 assert.equal(practice.length,4);
 for(const node of practice)node.click();
 assert.deepEqual(ui.calls,[{training:'focus'},{training:'guard'},{training:'break-shield'},{training:'squad'}]);
});

test('a low-level patrol gives a mainline route while a prepared character can choose the dungeon',()=>{
 const low=render('patrol',{level:4});
 const primary=low.all.find(n=>n.className==='primary');assert.equal(primary.textContent,'继续主线升级');
 primary.click();assert.deepEqual(low.calls,['mainline']);
 assert.ok(low.all.some(n=>n.textContent.includes('便签和委托进度会保留')));
 const ready=render('patrol',{level:5});assert.equal(ready.find('继续主线升级'),undefined);
 ready.all.find(n=>n.className==='primary').click();assert.deepEqual(ready.calls,['patrol']);
});

test('after reporting, the next goal leads through mainline level six to the owned-party challenge',()=>{
 const low=render('done',{level:5});
 low.all.find(n=>n.className==='primary').click();assert.deepEqual(low.calls,['mainline']);
 low.find('准备下一场2对2挑战').click();assert.deepEqual(low.calls,['mainline','nextChallenge']);
 const ready=render('done',{level:6});assert.equal(ready.find('继续主线升到6级'),undefined);
 ready.all.find(n=>n.className==='primary').click();assert.deepEqual(ready.calls,['nextChallenge']);
 assert.ok(ready.all.some(n=>n.textContent.includes('已有伙伴')));
});
