import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as spark from '../js/spark_rescue_core.js';
import {tr,fill,setText} from '../js/locale_runtime.js';
import {persistSaveChange,createSaveCommitter} from '../js/adventure_reward_persistence.js';
const {SPARK_DUNGEON:id,SPARK_GRID:grid,applySparkRescue:apply,validateSparkRescue:validate}=spark;
const content={dungeons:[{id,arenas:[{id:'first'},{id:'last'}]}],worldMaps:{[id]:{portal:{x:100,y:200}}}};
const ready=()=>({zone:id,position:{x:100,y:200},inventory:{100:30},dungeonRuns:{[id]:{cleared:['first','last']}}});
const lamp=[16,17,12,7,2,3,4],shelter=[16,15,10,5,0,1,2,3,4];
function walk(save,method,path){apply(save,content,{step:'start',method});for(const to of path.slice(1))apply(save,content,{step:'move',to});}

test('spark rescue requires the actual cleared journey, exit proximity and no live encounter',()=>{
 const s=ready();assert.equal(spark.sparkRescueNear(s,content),true);
 for(const change of [s=>s.zone='forest',s=>s.position.x+=111,s=>s.position.x=NaN,s=>s.pendingEncounter={},s=>s.dungeonRuns[id].cleared.pop()]){
  const s=ready();change(s);const before=structuredClone(s);assert.throws(()=>apply(s,content,{step:'start',method:'lamp'}),/守卫/);assert.deepEqual(s,before);
 }
 assert.equal(spark.sparkRescueReady(ready(),{...content,dungeons:[{id,arenas:[]}]}),false);
 const coop=ready();coop.coopRun={runs:{[id]:{cleared:[]}}};assert.equal(spark.sparkRescueReady(coop,content),false);
});
test('both escort methods reach shelter, take distinct routes and award nothing',()=>{
 for(const [method,path,promise]of [['lamp',lamp,'signal'],['shelter',shelter,'together']]){
  const s=ready(),before=structuredClone(s);walk(s,method,path);validate(s);
  const result=apply(s,content,{step:'finish',promise});assert.equal(result.completed,true);validate(s);
  assert.deepEqual(s.sparkRescue.path,path);assert.equal(s.sparkRescue.promise,promise);
  delete s.sparkRescue;assert.deepEqual(s,before);
 }
 assert.ok(shelter.length>lamp.length);
});
test('puddles, wrapping, revisits and exhausted light give feedback without consuming a step',()=>{
 const s=ready();apply(s,content,{step:'start',method:'lamp'});
 for(const to of [11,4,20,16,NaN,'17']){const before=structuredClone(s);assert.equal(apply(s,content,{step:'move',to}).changed,false);assert.deepEqual(s,before);}
 for(const to of [17,12,7])apply(s,content,{step:'move',to});
 assert.equal(spark.sparkRouteWarmth(s.sparkRescue.path),0);
 assert.equal(apply(s,content,{step:'move',to:8}).changed,false);
 apply(s,content,{step:'move',to:2});assert.equal(spark.sparkRouteWarmth(s.sparkRescue.path),2);
 const wrap={path:[5],method:'lamp'};assert.match(spark.sparkRouteMove(wrap,4),/相邻/);
});
test('sheltered route blocks wind and supports undo, method reset, save and resume',()=>{
 const s=ready();walk(s,'shelter',[16,17]);
 assert.match(apply(s,content,{step:'move',to:12}).message,/风口/);
 apply(s,content,{step:'undo'});assert.deepEqual(s.sparkRescue.path,[16]);
 assert.equal(apply(s,content,{step:'undo'}).changed,false);
 apply(s,content,{step:'reset',method:'lamp'});apply(s,content,{step:'move',to:17});
 const restored=JSON.parse(JSON.stringify(s));validate(restored);assert.equal(apply(restored,content,{step:'start',method:'shelter'}).changed,false);
 assert.equal(restored.sparkRescue.method,'lamp');assert.deepEqual(restored.sparkRescue.path,[16,17]);
});
test('the final promise needs arrival and completion cannot be farmed or reset',()=>{
 const s=ready();apply(s,content,{step:'start',method:'lamp'});
 assert.throws(()=>apply(s,content,{step:'finish',promise:'signal'}),/先把/);
 for(const to of lamp.slice(1))apply(s,content,{step:'move',to});
 assert.throws(()=>apply(s,content,{step:'finish',promise:'other'}),/约好/);
 apply(s,content,{step:'finish',promise:'signal'});const before=structuredClone(s);
 assert.equal(apply(s,content,{step:'reset',method:'lamp'}).changed,false);
 assert.throws(()=>apply(s,content,{step:'finish',promise:'together'}),/先和/);assert.deepEqual(s,before);
});
test('spark save rejects forged routes and impossible ending records',()=>{
 const s=ready();walk(s,'lamp',lamp);apply(s,content,{step:'finish',promise:'signal'});validate(s);
 const corrupt=[r=>r.path=[15],r=>r.path=[16,11],r=>r.path=[16,17,12,7,8],r=>r.path=[16,17,12,7,2,3,4,9],r=>r.method='shelter',r=>r.status='other',r=>r.promise='other',r=>r.extra=true,r=>r.path[1]='17',r=>r.path=[16,17,16],r=>{r.status='active';}];
 for(const change of corrupt){const forged=structuredClone(s);change(forged.sparkRescue);assert.throws(()=>validate(forged),/火种/);}
 validate({});assert.throws(()=>validate({sparkRescue:null}),/火种/);
});
test('storage failure leaves live rescue state and rewards unchanged, retry persists once',()=>{
 const s=ready(),before=structuredClone(s);let writes=0;
 const change=next=>apply(next,content,{step:'start',method:'lamp'});
 assert.throws(()=>persistSaveChange(s,{},change,()=>{throw Error('quota');}),/quota/);assert.deepEqual(s,before);
 const committed=persistSaveChange(s,{},change,()=>writes++);assert.equal(writes,1);assert.deepEqual(committed.save.sparkRescue.path,[16]);assert.deepEqual(s,before);
});

function render(save,action=()=>true,close=()=>{}){
 const all=[],document={activeElement:null};
 function el(tag,className='',...children){const n={tag,className,children,attributes:{},dataset:{},textContent:typeof children[0]==='string'?children[0]:'',append(...c){this.children.push(...c);},replaceChildren(...c){this.children=c;},setAttribute(k,v){this.attributes[k]=v;},addEventListener(type,handler){this['on'+type]=handler;},getClientRects(){return [{}];},querySelectorAll(){return all.filter(n=>(n.tag==='button'&&!n.disabled&&n.tabIndex!==-1)||n.tag==='summary');},focus(){document.activeElement=this;},querySelector(){return all.find(n=>n.className==='spark-route-cell current')||null;}};all.push(n);return n;}
 const context=vm.createContext({...spark,tr,fill,setText,document,el,createCloseButton:click=>Object.assign(el('button','close-button'),{click}),button:(label,click,cls='')=>Object.assign(el('button',cls,label),{click})});
 vm.runInContext(fs.readFileSync(new URL('../js/views/adventure/view_spark_rescue.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export function','function'),context);
 context.renderSparkRescue(el('root'),{save,focus:true},{action,close,leave(){}});return {all,document};
}
test('escort UI exposes both choices and reports a failed save without hiding retry',()=>{
 const seen=[],{all}=render(ready(),a=>{seen.push(a);return false;});
 const start=all.find(n=>n.tag==='button'&&n.textContent==='提灯遮风，穿过风口');start.click();start.click();
 assert.equal(seen.length,2);assert.match(all.find(n=>n.attributes.role==='status').textContent,/没有保存/);
 assert.ok(all.some(n=>n.textContent==='先离开副本'));
});
test('route UI supports arrows, an announced current cell and focus after repaint',()=>{
 const s=ready();apply(s,content,{step:'start',method:'lamp'});const actions=[],{all,document}=render(s,a=>actions.push(a));
 assert.equal(all.filter(n=>n.className.startsWith('spark-route-cell')).length,20);
 assert.equal(document.activeElement.dataset.cell,'16');assert.equal(document.activeElement.attributes['aria-current'],'location');
 const map=all.find(n=>n.className==='spark-route-grid');let prevented=0;map.onkeydown({key:'ArrowRight',preventDefault(){prevented++;}});
 assert.equal(actions[0].to,17);assert.equal(prevented,1);assert.equal(all.find(n=>n.textContent==='撤回一步').disabled,true);
 const body=all.find(n=>n.className==='modal-body'),status=all.find(n=>n.attributes.role==='status');
 assert.ok(body.children.indexOf(status)<body.children.indexOf(map),'route feedback precedes the board instead of sitting below restart controls');
});
test('escort modal keeps Tab focus inside and closes once on Escape',()=>{
 let closed=0;const {all,document}=render(ready(),()=>true,()=>closed++);
 const modal=all.find(n=>n.className==='modal spark-rescue'),first=all.find(n=>n.className==='close-button'),last=all.find(n=>n.textContent==='先离开副本');
 let prevented=0,stopped=0;const event=(key,shiftKey=false)=>({key,shiftKey,preventDefault(){prevented++;},stopPropagation(){stopped++;}});
 assert.equal(document.activeElement,modal);modal.onkeydown(event('Tab',true));assert.equal(document.activeElement,last);
 modal.onkeydown(event('Tab'));assert.equal(document.activeElement,first);
 modal.onkeydown(event('Tab',true));assert.equal(document.activeElement,last);
 modal.onkeydown(event('Escape'));assert.equal(closed,1);assert.equal(prevented,4);assert.equal(stopped,1);
});

test('arrival offers two return promises and completed view preserves the selected outcome',()=>{
 const s=ready();walk(s,'lamp',lamp);const a=render(s);
 assert.equal(a.all.filter(n=>n.className.startsWith('spark-route-cell')).every(n=>n.disabled),true);
 assert.ok(a.all.some(n=>n.textContent==='教它用灯光互相回应'));
 assert.equal(a.document.activeElement.textContent,'和守护者约好，等齐再走');
 apply(s,content,{step:'finish',promise:'signal'});const b=render(s);assert.ok(b.all.some(n=>n.textContent.includes('用明暗发信号')));assert.equal(b.all.some(n=>n.className==='spark-route-grid'),false);
});

test('dungeon controller persists rescue before repaint and rejects stale or changed-role callbacks',()=>{
 let callbacks,model,writes=0,cloud=0,hud=0,closed=0,fail=false;
 const state={save:ready(),roleEpoch:1,stage:'world',panel:null,assets:{content},roleStorage:{},world:{portal:{}},setSave:s=>state.save=s};
 const getContext=()=>state;
 const context=vm.createContext({...spark,createDungeonStory:()=>({}),createSaveCommitter:options=>createSaveCommitter({...options,saveLocal:()=>{if(fail)throw Error('quota');writes++;}}),renderSparkRescue:(root,next,cb)=>{model=next;callbacks=cb;}});
 const source=fs.readFileSync(new URL('../js/adventure/dungeon_controller.js',import.meta.url),'utf8').replace(/^import[\s\S]*?;\r?\n/gm,'').replace('export function','function');
 vm.runInContext(source,context);
 const controller=context.createDungeonController({nodes:{overlay:{}},getContext,openPanel:panel=>state.panel=panel,close:()=>{closed++;state.panel=null;},queueCloudSave:()=>cloud++,paintHud:()=>hud++});
 assert.equal(controller.openSparkRescue(),true);assert.equal(state.panel,'spark-rescue');controller.paintSparkRescue();assert.equal(model.focus,true);
 const old=callbacks,before=structuredClone(state.save);fail=true;
 assert.throws(()=>callbacks.action({step:'start',method:'lamp'}),/quota/);assert.deepEqual(state.save,before);assert.equal(cloud,0);
 fail=false;callbacks.action({step:'start',method:'lamp'});assert.equal(writes,1);assert.equal(cloud,1);assert.equal(hud,1);
 assert.equal(old.action({step:'start',method:'shelter'}),false);old.close();assert.equal(closed,0);
 assert.equal(callbacks.action({step:'move',to:11}).changed,false);assert.equal(writes,1);
 const active=callbacks;state.roleEpoch++;assert.equal(active.action({step:'move',to:17}),false);active.close();assert.equal(closed,0);
 state.roleEpoch--;controller.paintSparkRescue();callbacks.close();assert.equal(closed,1);
 state.save.position.x+=111;assert.equal(controller.openSparkRescue(),false);
});
