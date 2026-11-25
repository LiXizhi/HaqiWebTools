import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as spark from '../js/spark_rescue_core.js';
import {tr,fill,setText,setTranslator} from '../js/locale_runtime.js';
import {parseLocaleFile,lookup} from '../js/locale_core.js';
import {persistSaveChange,createSaveCommitter} from '../js/adventure_reward_persistence.js';
const {SPARK_DUNGEON:id,SPARK_GRID:grid,applySparkRescue:apply,validateSparkRescue:validate}=spark;
const content={dungeons:[{id,arenas:[{id:'first'},{id:'last'}]}],worldMaps:{[id]:{portal:{x:100,y:200}}}};
const ready=()=>({zone:id,position:{x:100,y:200},inventory:{100:30},dungeonRuns:{[id]:{cleared:['first','last']}}});
const lamp=[16,17,12,7,2,3,4],shelter=[16,15,10,5,0,1,2,3,4];
function move(save,to){
 if(save.sparkRescue.version===2&&grid.wind.includes(to)&&save.sparkRescue.method==='lamp'&&spark.sparkRouteStatus(save.sparkRescue).wind==='gust')apply(save,content,{step:'wait'});
 return apply(save,content,{step:'move',to});
}
function walk(save,method,path){apply(save,content,{step:'start',method});for(const to of path.slice(1))move(save,to);}
function finish(save,promise){
 if(promise==='signal'&&save.sparkRescue.version===2){
  apply(save,content,{step:'signal-start'});
  let result;for(const lit of spark.SPARK_SIGNAL)result=apply(save,content,{step:'signal-pulse',lit});
  return result;
 }
 return apply(save,content,{step:'finish',promise});
}

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
  const result=finish(s,promise);assert.equal(result.completed,true);validate(s);
  assert.deepEqual(s.sparkRescue.path,path);assert.equal(s.sparkRescue.promise,promise);
  delete s.sparkRescue;assert.deepEqual(s,before);
 }
 assert.ok(shelter.length>lamp.length);
});
test('puddles, wrapping, revisits and exhausted light give feedback without consuming a step',()=>{
 const s=ready();apply(s,content,{step:'start',method:'lamp'});
 for(const to of [11,4,20,16,NaN,'17']){const before=structuredClone(s);assert.equal(apply(s,content,{step:'move',to}).changed,false);assert.deepEqual(s,before);}
 for(const to of [17,12,7])move(s,to);
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
 for(const to of lamp.slice(1))move(s,to);
 assert.throws(()=>apply(s,content,{step:'finish',promise:'other'}),/约好/);
 finish(s,'signal');const before=structuredClone(s);
 assert.equal(apply(s,content,{step:'reset',method:'lamp'}).changed,false);
 assert.throws(()=>apply(s,content,{step:'finish',promise:'together'}),/先和/);assert.deepEqual(s,before);
});
test('spark save rejects forged routes and impossible ending records',()=>{
 const s=ready();walk(s,'lamp',lamp);finish(s,'signal');validate(s);
 const corrupt=[r=>r.path=[15],r=>r.path=[16,11],r=>r.path=[16,17,12,7,8],r=>r.path=[16,17,12,7,2,3,4,9],r=>r.method='shelter',r=>r.status='other',r=>r.promise='other',r=>r.extra=true,r=>r.path[1]='17',r=>r.path=[16,17,16],r=>{r.status='active';}];
 for(const change of corrupt){const forged=structuredClone(s);change(forged.sparkRescue);assert.throws(()=>validate(forged),/火种/);}
 validate({});assert.throws(()=>validate({sparkRescue:null}),/火种/);
});
test('the lamp response is an untimed saved sequence and mistakes never erase progress',()=>{
 let s=ready();walk(s,'lamp',lamp);
 assert.throws(()=>apply(s,content,{step:'finish',promise:'signal'}),/回应/);
 assert.throws(()=>apply(s,content,{step:'signal-pulse',lit:true}),/约好/);
 apply(s,content,{step:'signal-start'});validate(s);
 const begun=structuredClone(s);assert.equal(apply(s,content,{step:'signal-start'}).changed,false);assert.deepEqual(s,begun);
 const resources=structuredClone(s.inventory);
 for(const [index,lit]of spark.SPARK_SIGNAL.entries()){
  const before=structuredClone(s);
  assert.equal(apply(s,content,{step:'signal-pulse',lit:!lit}).changed,false);assert.deepEqual(s,before);
  assert.throws(()=>apply(s,content,{step:'signal-pulse',lit:'true'}),/约好/);assert.deepEqual(s,before);
  const result=apply(s,content,{step:'signal-pulse',lit});
  assert.equal(Boolean(result.completed),index===2);assert.deepEqual(s.sparkRescue.signals,spark.SPARK_SIGNAL.slice(0,index+1));
  s=JSON.parse(JSON.stringify(s));validate(s);assert.deepEqual(s.inventory,resources);
 }
 assert.equal(s.sparkRescue.status,'safe');assert.equal(s.sparkRescue.promise,'signal');
 const finished=structuredClone(s);assert.throws(()=>apply(s,content,{step:'signal-pulse',lit:true}),/先和/);assert.deepEqual(s,finished);
});

test('lamp practice requires arrival, can be left for the other promise and clears when undoing the route',()=>{
 const s=ready();apply(s,content,{step:'start',method:'lamp'});
 assert.throws(()=>apply(s,content,{step:'signal-start'}),/先把/);
 for(const to of lamp.slice(1))move(s,to);
 apply(s,content,{step:'signal-start'});apply(s,content,{step:'signal-pulse',lit:true});
 apply(s,content,{step:'undo'});validate(s);assert.equal(s.sparkRescue.signals,undefined);
 move(s,4);apply(s,content,{step:'signal-start'});apply(s,content,{step:'signal-pulse',lit:true});
 finish(s,'together');validate(s);assert.equal(s.sparkRescue.signals,undefined);assert.equal(s.sparkRescue.promise,'together');
 const old=ready();old.sparkRescue={version:1,status:'active',method:'lamp',path:[16]};
 for(const to of lamp.slice(1))move(old,to);
 assert.throws(()=>apply(old,content,{step:'signal-start'}),/先把/);finish(old,'signal');validate(old);
});

test('only reachable lamp response prefixes and complete matching endings can be restored',()=>{
 const s=ready();walk(s,'lamp',lamp);apply(s,content,{step:'signal-start'});validate(s);
 for(const bad of [null,{},[false],[true,true],[true,0],[true,false,true],[true,false,true,false]]){
  const forged=structuredClone(s);forged.sparkRescue.signals=bad;assert.throws(()=>validate(forged),/灯光/);
 }
 const beforeArrival=structuredClone(s);beforeArrival.sparkRescue.path.pop();beforeArrival.sparkRescue.waits.pop();assert.throws(()=>validate(beforeArrival),/灯光/);
 finish(s,'signal');validate(s);
 for(const change of [r=>delete r.signals,r=>r.signals.pop(),r=>r.promise='together',r=>r.signals[1]=true]){
  const forged=structuredClone(s);change(forged.sparkRescue);assert.throws(()=>validate(forged),/灯光/);
 }
});

test('a failed final light-response write keeps the live unfinished step retryable',()=>{
 const s=ready();walk(s,'lamp',lamp);apply(s,content,{step:'signal-start'});
 for(const lit of [true,false])apply(s,content,{step:'signal-pulse',lit});
 const before=structuredClone(s);let writes=0;
 const respond=next=>apply(next,content,{step:'signal-pulse',lit:true});
 assert.throws(()=>persistSaveChange(s,{},respond,()=>{throw Error('quota');}),/quota/);assert.deepEqual(s,before);
 const result=persistSaveChange(s,{},respond,()=>writes++);assert.equal(writes,1);assert.equal(result.save.sparkRescue.status,'safe');validate(result.save);assert.deepEqual(s,before);
});

test('storage failure leaves live rescue state and rewards unchanged, retry persists once',()=>{
 const s=ready(),before=structuredClone(s);let writes=0;
 const change=next=>apply(next,content,{step:'start',method:'lamp'});
 assert.throws(()=>persistSaveChange(s,{},change,()=>{throw Error('quota');}),/quota/);assert.deepEqual(s,before);
 const committed=persistSaveChange(s,{},change,()=>writes++);assert.equal(writes,1);assert.deepEqual(committed.save.sparkRescue.path,[16]);assert.deepEqual(s,before);
});

test('new escorts expose a predictable wind cycle and gusts never consume a rejected move',()=>{
 const s=ready();walk(s,'lamp',[16,17,12]);
 assert.equal(s.sparkRescue.version,2);assert.deepEqual(s.sparkRescue.waits,[0,0,0]);
 assert.deepEqual(spark.sparkRouteStatus(s.sparkRescue),{wind:'gust',nextWind:'calm',warmth:1});
 const before=structuredClone(s);assert.match(apply(s,content,{step:'move',to:7}).message,/大风/);assert.deepEqual(s,before);
 apply(s,content,{step:'wait'});validate(s);
 assert.equal(spark.sparkRouteStatus(s.sparkRescue).wind,'calm');
 assert.notEqual(apply(s,content,{step:'move',to:7}).changed,false);validate(s);
 assert.equal(spark.sparkRouteStatus(s.sparkRescue).warmth,0);
});

test('wind pauses survive JSON restoration and undo restores the previous stone and forecast',()=>{
 const s=ready();walk(s,'lamp',[16,17]);apply(s,content,{step:'wait'});
 const prior=structuredClone(s.sparkRescue),forecast=spark.sparkRouteStatus(prior);
 apply(s,content,{step:'wait'});apply(s,content,{step:'move',to:12});
 const restored=JSON.parse(JSON.stringify(s));validate(restored);
 apply(restored,content,{step:'wait'});apply(restored,content,{step:'undo'});validate(restored);
 assert.deepEqual(restored.sparkRescue.path,prior.path);
 assert.deepEqual(restored.sparkRescue.waits,[0,2]);
 assert.equal(spark.sparkRouteStatus(restored.sparkRescue).wind,'calm');
 assert.equal(forecast.wind,'gust');
});

test('waiting remains bounded through repeated cycles, grants no reward and cannot alter a finished escort',()=>{
 const s=ready();apply(s,content,{step:'start',method:'lamp'});const before=structuredClone(s);
 for(let i=0;i<300;i++)apply(s,content,{step:'wait'});
 assert.deepEqual(s,before);validate(s);
 for(const to of lamp.slice(1))move(s,to);finish(s,'signal');
 const finished=structuredClone(s);assert.throws(()=>apply(s,content,{step:'wait'}),/先和/);assert.deepEqual(s,finished);
});

test('v1 escorts retain their original wind-free rules and reject injected v2 data',()=>{
 const s=ready();s.sparkRescue={version:1,status:'active',method:'lamp',path:[16]};
 for(const to of lamp.slice(1))assert.notEqual(apply(s,content,{step:'move',to}).changed,false);
 validate(s);apply(s,content,{step:'finish',promise:'together'});validate(s);
 const forged=structuredClone(s);forged.sparkRescue.waits=forged.sparkRescue.path.map(()=>0);assert.throws(()=>validate(forged),/火种/);
 const old=ready();old.sparkRescue={version:1,status:'active',method:'shelter',path:[16]};
 assert.throws(()=>apply(old,content,{step:'wait'}),/原来的石路/);
 apply(old,content,{step:'reset',method:'lamp'});assert.equal(old.sparkRescue.version,2);validate(old);
});

test('v2 validation replays wind before each move and rejects malformed phase offsets',()=>{
 const s=ready();walk(s,'lamp',lamp);validate(s);
 for(const change of [r=>delete r.waits,r=>r.waits.pop(),r=>r.waits[0]=-1,r=>r.waits[0]=3,r=>r.waits[0]=0.5,r=>r.waits[0]='0',r=>r.waits[2]=0,r=>r.waits[r.waits.length-1]=1]){
  const forged=structuredClone(s);change(forged.sparkRescue);assert.throws(()=>validate(forged),/火种/);
 }
});

test('a failed wait write preserves the live forecast and can be retried once',()=>{
 const s=ready();walk(s,'lamp',[16,17,12]);const before=structuredClone(s);let writes=0;
 const wait=next=>apply(next,content,{step:'wait'});
 assert.throws(()=>persistSaveChange(s,{},wait,()=>{throw Error('quota');}),/quota/);assert.deepEqual(s,before);
 const result=persistSaveChange(s,{},wait,()=>writes++);assert.equal(writes,1);assert.equal(spark.sparkRouteStatus(result.save.sparkRescue).wind,'calm');assert.deepEqual(s,before);
});

test('escort dialogue recalls only a solved camp agreement and reacts to the actual stone and wind',()=>{
 const s=ready();s.forestCommission={mystery:{status:'active',ending:'pair'}};
 assert.equal(spark.sparkRescueStory(s).memory,null);
 s.forestCommission.mystery.status='solved';assert.match(spark.sparkRescueStory(s).memory,/结伴走/);
 s.forestCommission.mystery.ending='sign';assert.match(spark.sparkRescueStory(s).memory,/位置便签/);
 walk(s,'lamp',[16,17]);assert.equal(spark.sparkRescueStory(s).speaker,'火种');assert.match(spark.sparkRescueStory(s).text,/先走/);
 move(s,12);assert.match(spark.sparkRescueStory(s).text,/风好大/);assert.equal(spark.sparkRescueStory(s).memory,null);
 apply(s,content,{step:'wait'});assert.match(spark.sparkRescueStory(s).text,/走一步/);
 move(s,7);move(s,2);assert.match(spark.sparkRescueStory(s).text,/灯台就在前面/);
});

function render(save,action=()=>true,close=()=>{},leave=()=>{}){
 const all=[],document={activeElement:null};
 function el(tag,className='',...children){const n={tag,className,children,attributes:{},dataset:{},textContent:typeof children[0]==='string'?children[0]:'',append(...c){this.children.push(...c);},replaceChildren(...c){this.children=c;},setAttribute(k,v){this.attributes[k]=v;},addEventListener(type,handler){this['on'+type]=handler;},getClientRects(){return [{}];},querySelectorAll(){return all.filter(n=>(n.tag==='button'&&!n.disabled&&n.tabIndex!==-1)||n.tag==='summary');},focus(){document.activeElement=this;},querySelector(){return all.find(n=>n.className==='spark-route-cell current')||null;}};all.push(n);return n;}
 const context=vm.createContext({...spark,tr,fill,setText,document,el,createCloseButton:click=>Object.assign(el('button','close-button'),{click}),button:(label,click,cls='')=>Object.assign(el('button',cls,tr(label)),{click})});
 vm.runInContext(fs.readFileSync(new URL('../js/views/adventure/view_spark_rescue.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export function','function'),context);
 context.renderSparkRescue(el('root'),{save,focus:true},{action,close,leave});return {all,document};
}

test('every reachable escort branch either offers a move, a useful pause, or a valid retreat',()=>{
 for(const method of ['lamp','shelter']){
  const start=ready();apply(start,content,{step:'start',method});
  let goals=0,retreats=0,branches=0;
  function moves(save){
   const next=[];
   for(let to=0;to<20;to++){
    const copy=structuredClone(save),before=JSON.stringify(copy),result=apply(copy,content,{step:'move',to});
    if(result.changed===false)assert.equal(JSON.stringify(copy),before);
    else{validate(copy);next.push(copy);}
   }
   return next;
  }
  function visit(save){
   branches++;validate(save);
   if(save.sparkRescue.path.at(-1)===grid.goal){assert.equal(spark.sparkRouteGuidance(save.sparkRescue),null);goals++;return;}
   const choices=new Map();
   for(let phase=0;phase<3;phase++){
    const immediate=moves(save),paused=structuredClone(save);apply(paused,content,{step:'wait'});validate(paused);
    const afterWait=moves(paused),expected=immediate.length?'choose':afterWait.length?'wait':'backtrack';
    const before=JSON.stringify(save);assert.equal(spark.sparkRouteGuidance(save.sparkRescue),expected);assert.equal(JSON.stringify(save),before);
    for(const next of immediate)choices.set(next.sparkRescue.path.at(-1),next);
    if(expected==='backtrack'){
     assert.ok(save.sparkRescue.path.length>1);const back=structuredClone(save);apply(back,content,{step:'undo'});validate(back);
     assert.deepEqual(back.sparkRescue.path,save.sparkRescue.path.slice(0,-1));retreats++;
    }
    save=paused;
   }
   for(const next of choices.values())visit(next);
  }
  visit(start);assert.ok(goals>0&&retreats>0&&branches>goals);
 }
});

test('a sheltered dead end explains retreat without offering an ineffective wind pause',()=>{
 const s=ready();walk(s,'shelter',[16,17]);const before=structuredClone(s),actions=[],{all}=render(s,a=>actions.push(a));
 assert.ok(all.some(n=>n.className==='spark-route-hint'&&n.textContent.includes('撤回一步')));
 assert.equal(all.some(n=>n.className==='spark-wind'||n.textContent==='停步护灯'),false);
 all.find(n=>n.tag==='button'&&n.textContent==='撤回一步').click();assert.equal(actions[0].step,'undo');
 assert.deepEqual(s,before);
});
test('escort UI exposes both choices and reports a failed save without hiding retry',()=>{
 const seen=[],{all}=render(ready(),a=>{seen.push(a);return false;});
 const start=all.find(n=>n.tag==='button'&&n.textContent==='提灯遮风，穿过风口');start.click();start.click();
 assert.equal(seen.length,2);assert.match(all.find(n=>n.attributes.role==='status').textContent,/没有保存/);
 assert.ok(all.some(n=>n.textContent==='先离开副本'));
});
test('the lamp debrief recalls retained wind and warm stones without writing a new receipt',()=>{
 const s=ready();assert.equal(spark.sparkRescueDebrief(s),null);
 walk(s,'lamp',lamp);assert.equal(spark.sparkRescueDebrief(s),null);finish(s,'signal');
 const before=structuredClone(s),journal=spark.sparkRescueDebrief(s);
 assert.equal(journal.reply.id,'S1195-R02');assert.equal(journal.windStones,2);assert.equal(journal.warmStones,2);
 assert.deepEqual(journal.route,lamp);journal.route.pop();assert.deepEqual(s,before);
 const restored=JSON.parse(JSON.stringify(s));assert.deepEqual(spark.sparkRescueDebrief(restored),spark.sparkRescueDebrief(s));
});
test('sheltered and wind-free routes get their own truthful response, including old saves',()=>{
 const s=ready();walk(s,'shelter',shelter);finish(s,'together');
 assert.equal(spark.sparkRescueDebrief(s).reply.id,'S1195-R01');assert.equal(spark.sparkRescueDebrief(s).windStones,0);
 const dry=ready();walk(dry,'lamp',shelter);finish(dry,'together');assert.equal(spark.sparkRescueDebrief(dry).reply.id,'S1195-R04');
 const old=ready();old.sparkRescue={version:1,status:'safe',method:'lamp',path:lamp.slice(),promise:'signal'};validate(old);
 assert.equal(spark.sparkRescueDebrief(old).reply.id,'S1195-R03');
});
test('a whole waiting cycle is not misreported as a measured number of pauses',()=>{
 const s=ready();s.sparkRescue={version:2,status:'active',method:'lamp',path:[16],waits:[0]};
 // Two pauses at the start make the following retained wind route legal with
 // no extra pause. Three more pauses normalize away; no pause count exists.
 for(let i=0;i<5;i++)apply(s,content,{step:'wait'});
 for(const to of lamp.slice(1))move(s,to);finish(s,'together');validate(s);
 const before=structuredClone(s),journal=spark.sparkRescueDebrief(s);
 assert.equal(journal.reply.id,'S1195-R02');assert.equal('waits' in journal,false);assert.equal('pauseCount' in journal,false);assert.deepEqual(s,before);
});
test('completed escort keeps its route in a closed read-only journal and shows the actual branch',()=>{
 for(const [method,path,promise,id]of [['lamp',lamp,'signal','S1195-R02'],['shelter',shelter,'together','S1195-R01']]){
  const s=ready();walk(s,method,path);finish(s,promise);const before=structuredClone(s),a=render(s,()=>assert.fail('journal must not perform an action'));
  const journal=a.all.find(n=>n.className==='spark-journal');assert.ok(journal);assert.notEqual(journal.open,true);
  assert.equal(a.all.find(n=>n.className==='spark-dialogue').dataset.storyId,id);
  assert.deepEqual(a.all.filter(n=>n.tag==='li').map(n=>Number(n.dataset.cell)),path);
  assert.ok(a.all.find(n=>n.tag==='ol'&&n.attributes['aria-label']==='这次走过的路线'));
  assert.equal(a.all.some(n=>n.className.startsWith('spark-route-cell')),false);assert.deepEqual(s,before);
 }
});

test('only a completed escort offers a focused primary return, without leaving automatically',()=>{
 for(const completed of [false,true]){
  const s=ready();walk(s,'lamp',lamp);if(completed)finish(s,'signal');
  const before=structuredClone(s);let left=0,closed=0;
  const a=render(s,()=>assert.fail('return must not replay a rescue action'),()=>closed++,()=>left++);
  const footer=a.all.find(n=>n.className==='dungeon-actions');
  assert.equal(left,0);assert.deepEqual(s,before);
  if(completed){
   const primary=footer.children[0];assert.equal(primary.className,'primary');assert.equal(primary.textContent,'护送完成，返回岛上');assert.equal(a.document.activeElement,primary);
   primary.click();assert.equal(left,1);assert.equal(closed,0);
  }else{
   assert.equal(footer.children.some(n=>n.className==='primary'),false);
   assert.equal(footer.children.at(-1).textContent,'先离开副本');assert.equal(a.document.activeElement.textContent,'和守护者约好，等齐再走');
  }
 }
});

test('completed return action is translated and focused in every supported interface',()=>{
 const dictionaries=Object.fromEntries(['en','ja','ko'].map(id=>[id,parseLocaleFile(fs.readFileSync(new URL(`../data/adventure/locale/${id}.txt`,import.meta.url),'utf8'))]));
 try{
  for(const language of ['en','ja','ko']){
   setTranslator(value=>lookup(value,language,dictionaries),language);
   const s=ready();walk(s,'shelter',shelter);finish(s,'together');const a=render(s);
   const label=tr('护送完成，返回岛上');assert.notEqual(label,'护送完成，返回岛上');assert.equal(a.document.activeElement.textContent,label);assert.equal(a.document.activeElement.className,'primary');
  }
 }finally{setTranslator(null);}
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
 finish(s,'signal');const b=render(s);assert.ok(b.all.some(n=>n.textContent.includes('用明暗发信号')));assert.equal(b.all.some(n=>n.className==='spark-route-grid'),false);
});

test('arrival starts the right response flow for new and legacy escorts without moving the route',()=>{
 const s=ready();walk(s,'lamp',lamp);let action;
 const a=render(s,value=>{action=value;return true;});
 a.all.find(n=>n.textContent==='教它用灯光互相回应').click();assert.equal(action.step,'signal-start');
 const route=a.all.find(n=>n.className==='spark-route-grid');route.onkeydown({key:'ArrowLeft',preventDefault(){assert.fail('arrival must not consume movement');}});
 assert.equal(action.step,'signal-start');
 const old=structuredClone(s);old.sparkRescue.version=1;delete old.sparkRescue.waits;
 const b=render(old,value=>{action=value;return true;});
 b.all.find(n=>n.textContent==='教它用灯光互相回应').click();assert.equal(action.step,'finish');assert.equal(action.promise,'signal');
});

test('response UI shows restored progress, current beat and retryable save feedback',()=>{
 const s=ready();walk(s,'lamp',lamp);apply(s,content,{step:'signal-start'});apply(s,content,{step:'signal-pulse',lit:true});
 const seen=[],a=render(s,value=>{seen.push(value);return false;});
 assert.ok(a.all.some(n=>n.textContent==='灯光回应 · 1/3'));
 assert.deepEqual(a.all.filter(n=>n.tag==='li').map(n=>n.dataset.state),['done','current','next']);
 assert.equal(a.all.find(n=>n.attributes['aria-current']==='step').textContent,'遮灯');
 assert.equal(a.document.activeElement.textContent,'亮起灯');
 a.all.find(n=>n.textContent==='亮起灯').click();a.all.find(n=>n.textContent==='遮住灯').click();
 assert.deepEqual(seen.map(a=>a.lit),[true,false]);assert.ok(seen.every(a=>a.step==='signal-pulse'));
 assert.equal(a.all.find(n=>n.attributes.role==='status').textContent,'这一步没有保存，可以重试。');
 assert.deepEqual(s.sparkRescue.signals,[true]);assert.equal(a.all.some(n=>n.textContent==='停步护灯'),false);
 assert.ok(a.all.find(n=>n.textContent==='不用抢拍。看清顺序，一次回应一步。'));
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
