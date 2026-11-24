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
const scoped=['js/forest_commission_core.js','js/forest_commission_story_core.js','js/forest_mystery_core.js','js/spark_rescue_core.js','js/views/adventure/view_forest_mystery.js','js/views/adventure/view_spark_rescue.js','js/views/adventure/view_forest_commission.js'];
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
 for(const file of scoped.filter(f=>/view_(forest_mystery|spark_rescue)/.test(f)))vm.runInContext(read(file).replace(/^import .*;\r?\n/gm,'').replaceAll('export function','function'),context);
 return {all,el,context};
}

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
  assert.equal(status.textContent,t('茜茜：莫尼先去查看灯，回程才看见草地上的靴子。把这两步挪到前面，再试一次。'));
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
