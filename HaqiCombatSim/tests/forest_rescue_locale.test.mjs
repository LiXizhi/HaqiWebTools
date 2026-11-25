import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseLocaleFile,lookup} from '../js/locale_core.js';
import {tr,fill,setText,setTranslator,observeTranslations} from '../js/locale_runtime.js';
import {extractJsStrings} from '../scripts/scan_locale.mjs';
import * as mystery from '../js/forest_mystery_core.js';
import * as spark from '../js/spark_rescue_core.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const dictionaries=Object.fromEntries(['en','ja','ko'].map(id=>[id,parseLocaleFile(read(`data/adventure/locale/${id}.txt`))]));
// Internal malformed-save diagnostics are not player interface or learning text.
const internalDiagnostics=[
 {
  "file": "js/forest_mystery_core.js",
  "text": "未知营地调查操作"
 },
 {
  "file": "js/forest_mystery_core.js",
  "text": "营地调查记录无效"
 },
 {
  "file": "js/forest_mystery_core.js",
  "text": "营地调查包含未知字段"
 },
 {
  "file": "js/forest_mystery_core.js",
  "text": "营地调查物证无效"
 },
 {
  "file": "js/forest_mystery_core.js",
  "text": "营地调查路线不一致"
 },
 {
  "file": "js/forest_mystery_core.js",
  "text": "营地调查缺少物证"
 },
 {
  "file": "js/forest_mystery_core.js",
  "text": "营地调查结论无效"
 },
 {
  "file": "js/spark_rescue_core.js",
  "text": "火种护送记录无效"
 },
 {
  "file": "js/spark_rescue_core.js",
  "text": "火种护送路线无效"
 },
 {
  "file": "js/spark_rescue_core.js",
  "text": "火种护送路线不连续"
 },
 {
  "file": "js/spark_rescue_core.js",
  "text": "火种护送风势记录无效"
 },
 {
  "file": "js/spark_rescue_core.js",
  "text": "火种护送灯光记录无效"
 },
 {
  "file": "js/spark_rescue_core.js",
  "text": "火种护送约定无效"
 },
 {
  "file": "js/forest_commission_core.js",
  "text": "标签练习记录无效"
 },
 {
  "file": "js/forest_commission_core.js",
  "text": "选物练习记录无效"
 },
 {
  "file": "js/forest_commission_core.js",
  "text": "路线线索练习记录无效"
 },
 {
  "file": "js/forest_commission_core.js",
  "text": "巡逻分工练习记录无效"
 },
 {
  "file": "js/forest_commission_core.js",
  "text": "未知营地委托操作"
 },
 {
  "file": "js/forest_commission_core.js",
  "text": "营地委托记录无效"
 },
 {
  "file": "js/forest_commission_core.js",
  "text": "营地委托巡逻记录无效"
 },
 {
  "file": "js/forest_commission_core.js",
  "text": "营地委托记录包含未知字段"
 },
 {
  "file": "js/forest_commission_core.js",
  "text": "营地巡逻提议无效"
 },
 {
  "file": "js/forest_commission_core.js",
  "text": "营地交流完成记录无效"
 },
 {
  "file": "js/forest_commission_core.js",
  "text": "营地交流练习记录无效"
 },
 {
  "file": "js/forest_commission_core.js",
  "text": "营地物品标签无效"
 },
 {
  "file": "js/forest_commission_core.js",
  "text": "营地多语言标签无效"
 },
 {
  "file": "js/forest_commission_core.js",
  "text": "营地标签练习记录无效"
 },
 {
  "file": "js/forest_commission_core.js",
  "text": "营地委托尝试记录无效"
 },
 {
  "file": "js/forest_commission_core.js",
  "text": "营地委托选物记录无效"
 },
 {
  "file": "js/forest_commission_core.js",
  "text": "营地路线线索练习记录无效"
 },
 {
  "file": "js/forest_commission_core.js",
  "text": "营地委托与巡逻实绩不一致"
 },
 {
  "file": "js/forest_commission_core.js",
  "text": "营地委托尚未完成巡逻"
 }
];
for(const text of ['未知营地约定操作','营地约定记录无效','营地约定包含未知字段','营地约定进度无效'])internalDiagnostics.push({file:'js/forest_promise_core.js',text});
const scoped=['js/forest_commission_core.js','js/forest_commission_story_core.js','js/forest_mystery_core.js','js/forest_promise_core.js','js/spark_rescue_core.js','js/views/adventure/view_forest_mystery.js','js/views/adventure/view_forest_promise.js','js/views/adventure/view_spark_rescue.js','js/views/adventure/view_forest_commission.js'];
test('forest and escort static player text has complete three-language coverage and matching placeholders',()=>{
 const tokens=s=>[...s.matchAll(/\{\w+\}/g)].map(m=>m[0]).sort();
 for(const file of scoped)for(const {text,dynamic} of extractJsStrings(read(file))){
  if(dynamic||internalDiagnostics.some(r=>r.file===file&&r.text===text))continue;
  for(const [lang,dict]of Object.entries(dictionaries)){
   assert.ok(dict[text],`${lang}: ${file}: ${text}`);
   assert.deepEqual(tokens(dict[text]),tokens(text),`${lang}: ${text}`);
  }
 }
});

function fixture(){
 const all=[],document={activeElement:null};
 function el(tag,className='',...children){
  const n={tag,className,children:children.map(c=>typeof c==='string'?tr(c):c),attributes:{},dataset:{},textContent:typeof children[0]==='string'?tr(children[0]):'',
   append(...c){this.children.push(...c);},replaceChildren(...c){this.children=c;},setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,v){this['on'+k]=v;},focus(){document.activeElement=this;},getClientRects(){return [{}];},
   querySelector(){return all.find(n=>n.tag==='button'&&!n.disabled);},querySelectorAll(){return all.filter(n=>n.tag==='button'&&!n.disabled);}};
  all.push(n);return n;
 }
 const button=(s,click,c='')=>Object.assign(el('button',c,s),{click});
 const context=vm.createContext({...mystery,...spark,tr,fill,setText,el,button,document,createCloseButton:click=>button('',click)});
 for(const file of scoped.filter(f=>/view_(forest_mystery|forest_promise|spark_rescue)/.test(f)))vm.runInContext(read(file).replace(/^import .*;\r?\n/gm,'').replaceAll('export function','function'),context);
 return {all,el,context};
}

for(const locale of ['en','ja','ko'])test(`${locale}: evidence questions and failed testimony recording stay translated`,async()=>{
 setTranslator(s=>lookup(s,locale,dictionaries),locale);
 const missing=[],stop=observeTranslations(({source})=>{if(/[\u3400-\u9fff]/u.test(source)&&!dictionaries[locale][source])missing.push(source);});
 try{
  const f=fixture(),save={forestCommission:{phase:'done',mystery:{status:'active',route:'tracks',observed:['grass','paper','tracks','lamp'],witness:false}}};let calls=0;
  f.context.renderForestMystery(f.el('body'),f.el('actions'),{save,assets:{},nearby:true},{action:()=>{calls++;return false;}},()=>f.el('img'));
  const reply=f.all.find(n=>n.className==='forest-mystery-reply');
  for(const row of mystery.FOREST_MYSTERY_QUESTIONS){
   f.all.find(n=>n.textContent===tr(row.question)).click();assert.equal(reply.textContent,tr(row.reply));assert.notEqual(reply.textContent,row.reply);
   const evidenceLabel=fill('物证：{name}',{name:mystery.FOREST_MYSTERY_OBSERVATIONS[row.evidence].name}).text;
   assert.ok(f.all.some(n=>n.textContent===evidenceLabel));
  }
  assert.equal(calls,0);await f.all.find(n=>n.textContent===tr('把莫尼的经过记下来')).click();
  assert.equal(calls,1);assert.equal(f.all.find(n=>n.className==='forest-status').textContent,tr('这一步没有保存，可以重试。'));
  assert.deepEqual(missing,[]);
 }finally{stop();setTranslator(null);}
});

for(const locale of ['en','ja','ko'])test(`${locale}: dynamic evidence, order announcements, escort feedback and accessible cells use real dictionaries`,async()=>{
 setTranslator(s=>lookup(s,locale,dictionaries),locale);
 const missing=[];const stop=observeTranslations(({source})=>{if(/[\u3400-\u9fff]/u.test(source)&&!dictionaries[locale][source])missing.push(source);});
 try{
  const f=fixture(),save={forestCommission:{phase:'done',mystery:{status:'active',route:'tracks',observed:['grass','paper','tracks','lamp'],witness:true}}};
  f.context.renderForestMystery(f.el('body'),f.el('actions'),{save,assets:{},nearby:true},{action:()=>false},()=>f.el('img'));
  const t=s=>lookup(s,locale,dictionaries),status=f.all.find(n=>n.attributes.role==='status');
  assert.ok(f.all.some(n=>n.textContent===fill('调查袋 · {count}/4 件物证',{count:4}).text));
  f.all.find(n=>n.tag==='button'&&n.textContent===t('往后移')&&!n.disabled).click();
  assert.equal(status.textContent,fill('已把“{event}”移到第 {step} 步。',{event:mystery.FOREST_MYSTERY_EVENTS[0].text,step:2}).text);
  f.all.find(n=>n.textContent===t('移动补给后，留下位置便签')).click();
  f.all.find(n=>n.textContent===t('把经过讲给茜茜听')).click();
  assert.equal(status.textContent,t('茜茜：帐篷边和靴底都有湿草屑。靴子要怎样从草地回到帐篷？看看这两张卡的先后。'));
  const order=f.all.find(n=>n.className==='forest-mystery-order');
  assert.deepEqual(Array.from(order.children).filter(n=>n.className==='forest-mystery-conflict').map(n=>n.dataset.event).sort(),['find','return']);
  const s=fixture(),rescue={sparkRescue:{status:'active',method:'lamp',path:[16,17]}};
  s.context.renderSparkRescue(s.el('root'),{save:rescue},{action:()=>({changed:false,message:'这一步没有保存，可以重试。'}),close(){},leave(){}});
  const current=s.all.find(n=>n.dataset.cell==='17');
  assert.equal(current.attributes['aria-label'],fill('第{row}行第{column}列，{terrain}，火种在这里',{row:4,column:3,terrain:'暖石'}).text);
  assert.equal(current.dataset.terrain,'暖石','CSS terrain identity must not be translated');
  s.all.find(n=>n.textContent===t('向上')).click();
  assert.equal(s.all.find(n=>n.attributes.role==='status').textContent,t('这一步没有保存，可以重试。'));
  const result=mystery.applyForestMystery({forestCommission:{phase:'done',mystery:{status:'active',route:'tracks',observed:[],witness:false}}},{step:'mystery-inspect',object:'hat'},()=>{});
  assert.notEqual(tr(result.message),result.message,'core decoy feedback is translated');
  assert.deepEqual(missing,[]);
 }finally{stop();setTranslator(null);}
});

for(const locale of ['en','ja','ko'])test(`${locale}: promise choices, progress and failed saves use real dictionaries`,async()=>{
 setTranslator(s=>lookup(s,locale,dictionaries),locale);
 const missing=[],stop=observeTranslations(({source})=>{if(/[\u3400-\u9fff]/u.test(source)&&!dictionaries[locale][source])missing.push(source);});
 try{
  const t=s=>lookup(s,locale,dictionaries);
  for(const ending of ['sign','pair'])for(const stage of [ending==='sign'?'mark':'invite','confirm']){
   const f=fixture(),status=f.el('p'),save={forestCommission:{mystery:{ending,promise:{status:'active',stage}}}};
   f.context.renderForestPromise(f.el('body'),f.el('actions'),{save,assets:{},nearby:true},{action:()=>false},()=>f.el('img'),status);
   assert.ok(f.all.some(n=>n.textContent===fill('营地回访 · {current}/2',{current:stage==='confirm'?2:1}).text));
   const label=stage==='confirm'?(ending==='sign'?'请莫尼读回便签的位置':'等茜茜回应，再确认出发'):(ending==='sign'?'写：备用灯芯在补给帐篷里':'去问茜茜，听她自己回应');
   f.all.find(n=>n.tag==='button'&&n.textContent===t(label)).click();
   await new Promise(resolve=>setImmediate(resolve));
   assert.equal(status.textContent,t('这次约定没有保存，可以重试。'));
  }
  const f=fixture();f.context.renderForestPromise(f.el('body'),f.el('actions'),{save:{forestCommission:{mystery:{ending:'sign',promise:{stage:'mark'}}}},assets:{},nearby:false},{go(){}},()=>f.el('img'),f.el('p'));
  assert.ok(f.all.some(n=>n.tag==='button'&&n.textContent===t('带我去落实约定')));
  assert.deepEqual(missing,[]);
 }finally{stop();setTranslator(null);}
});

for(const locale of ['en','ja','ko'])test(`${locale}: wind forecast, waiting and remembered camp choices use real dictionaries`,()=>{
 setTranslator(s=>lookup(s,locale,dictionaries),locale);
 const missing=[],stop=observeTranslations(({source})=>{if(/[\u3400-\u9fff]/u.test(source)&&!dictionaries[locale][source])missing.push(source);});
 try{
  const t=s=>lookup(s,locale,dictionaries);
  for(const ending of ['sign','pair']){
   const save={forestCommission:{mystery:{status:'solved',ending}},sparkRescue:{version:2,status:'active',method:'lamp',path:[16],waits:[0]}},f=fixture();
   f.context.renderSparkRescue(f.el('root'),{save},{action:()=>false,close(){},leave(){}});
   assert.ok(f.all.some(n=>n.textContent===t(spark.sparkRescueStory(save).memory)));
  }
  const save={sparkRescue:{version:2,status:'active',method:'lamp',path:[16,17,12],waits:[0,0,0]}},f=fixture(),actions=[];
  f.context.renderSparkRescue(f.el('root'),{save},{action:action=>{actions.push(action);return false;},close(){},leave(){}});
  const forecast=f.all.find(n=>n.className==='spark-wind');
  assert.equal(forecast.dataset.wind,'gust','CSS wind identity must not be translated');
  assert.equal(forecast.attributes['aria-label'],t('石路风势'));
  assert.ok(f.all.some(n=>n.textContent===fill('现在：{wind}',{wind:'大风'}).text));
  assert.ok(f.all.some(n=>n.textContent===fill('行动后：{wind}',{wind:'风停了'}).text));
  assert.ok(f.all.some(n=>n.textContent===t('风好大。先别走，我想和你一起等一等。')));
  f.all.find(n=>n.tag==='button'&&n.textContent===t('停步护灯')).click();
  assert.equal(actions[0].step,'wait');
  assert.equal(f.all.find(n=>n.attributes.role==='status').textContent,t('这一步没有保存，可以重试。'));
  assert.deepEqual(missing,[]);
 }finally{stop();setTranslator(null);}
});

for(const locale of ['en','ja','ko'])test(`${locale}: lamp response progress and controls stay translated after restoration`,()=>{
 setTranslator(s=>lookup(s,locale,dictionaries),locale);
 try{
  const f=fixture(),seen=[],save={sparkRescue:{version:2,status:'active',method:'lamp',path:[16,17,12,7,2,3,4],waits:[0,0,1,0,0,0,0],signals:[true]}};
  spark.validateSparkRescue(save);
  f.context.renderSparkRescue(f.el('root'),{save},{action:a=>{seen.push(a);return false;},close(){},leave(){}});
  const t=source=>{const translated=tr(source);assert.notEqual(translated,source);return translated;};
  assert.ok(f.all.some(n=>n.attributes['aria-label']===t('灯光回应')));
  assert.ok(f.all.some(n=>n.textContent===fill('灯光回应 · {done}/3',{done:1}).text));
  assert.deepEqual(f.all.filter(n=>n.tag==='li').map(n=>n.dataset.state),['done','current','next']);
  assert.equal(f.all.find(n=>n.attributes['aria-current']==='step').textContent,t('遮灯'));
  f.all.find(n=>n.tag==='button'&&n.textContent===t('遮住灯')).click();assert.equal(seen[0].step,'signal-pulse');assert.equal(seen[0].lit,false);
  assert.equal(f.all.find(n=>n.attributes.role==='status').textContent,t('这一步没有保存，可以重试。'));
 }finally{setTranslator(null);}
});

for(const locale of ['en','ja','ko'])test(`${locale}: safe escort revisits retain the ending without asking to escort again`,()=>{
 setTranslator(s=>lookup(s,locale,dictionaries),locale);
 try{
  for(const [method,path] of [['lamp',[16,17,12,7,2,3,4]],['shelter',[16,15,10,5,0,1,2,3,4]]])for(const promise of ['together','signal']){
   const f=fixture(),save={sparkRescue:{status:'safe',method,path,promise}},before=JSON.stringify(save);
   f.context.renderSparkRescue(f.el('root'),{save},{action(){throw Error('revisit must not mutate');},close(){},leave(){}});
   const texts=f.all.map(n=>n.textContent),t=s=>lookup(s,locale,dictionaries);
   assert.ok(texts.includes(t('火种的光稳下来了')));
   assert.ok(texts.includes(fill('这次用了{method}的方法，走了 {steps} 步。',{method:method==='lamp'?'提灯遮风':'绕开风口',steps:path.length-1}).text));
   assert.ok(!texts.includes(t('守卫退开后，你才看见缩在石头旁的火种。它每挪一步就停下来等：“能陪我走到避风灯台吗？我怕水，也怕被风吹散。”')));
   assert.ok(!texts.includes(t('这段护送可以稍后继续。找到的路会保存，不影响已经获得的战利品。')));
   assert.ok(!texts.includes(t('稍后继续护送')));
   assert.equal(JSON.stringify(save),before);
  }
 }finally{setTranslator(null);}
});

for(const locale of ['en','ja','ko'])test(`${locale}: rule-produced escort failures and rejected mystery saves remain translated and retryable`,async()=>{
 setTranslator(s=>lookup(s,locale,dictionaries),locale);
 try{
  for(const [method,path,to]of [['lamp',[16],4],['lamp',[16,17],16],['lamp',[16],11],['shelter',[16,17],12],['lamp',[16,17,12,7],8]]){
   const state={status:'active',method,path},reason=spark.sparkRouteMove(state,to);
   assert.ok(reason);const f=fixture();
   f.context.renderSparkRescue(f.el('root'),{save:{sparkRescue:state}},{action:()=>({changed:false,message:reason}),close(){},leave(){}});
   f.all.find(n=>n.textContent===tr('向上')).click();
   assert.equal(f.all.find(n=>n.attributes.role==='status').textContent,tr(reason));
   assert.notEqual(tr(reason),reason);
  }
  const f=fixture(),save={forestCommission:{phase:'done',mystery:{status:'active',route:'tracks',observed:['grass','paper','tracks','lamp'],witness:true}}};let calls=0;
  f.context.renderForestMystery(f.el('body'),f.el('actions'),{save,assets:{},nearby:true},{action:()=>{calls++;return Promise.reject(Error('storage offline'));}},()=>f.el('img'));
  for(let index=0;index<2;index++)f.all.filter(n=>n.attributes['aria-label']===fill('{event}，{action}',{event:mystery.FOREST_MYSTERY_EVENTS[0].text,action:'往后移'}).text&&!n.disabled).at(-1).click();
  f.all.find(n=>n.textContent===tr('移动补给后，留下位置便签')).click();
  const submit=f.all.find(n=>n.textContent===tr('把经过讲给茜茜听'));submit.click();submit.click();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls,1,'double activation cannot submit while pending');
  assert.equal(f.all.find(n=>n.attributes.role==='status').textContent,tr('这次经过没有保存，可以重试。'));
  assert.equal(submit.disabled,false);submit.click();await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,2);
 }finally{setTranslator(null);}
});
