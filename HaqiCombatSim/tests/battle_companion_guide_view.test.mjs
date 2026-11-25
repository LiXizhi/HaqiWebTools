import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {tr,fill,setTranslator} from '../js/locale_runtime.js';
import {lookup,parseLocaleFile} from '../js/locale_core.js';

const source=fs.readFileSync(new URL('../js/views/adventure/view_companion_guide.js',import.meta.url),'utf8');
function fixture(){
 const doc={activeElement:null};
 class Node{
  constructor(tag,className='',children=[]){this.tag=tag;this.className=className;this.children=[];this.dataset={};this.attributes={};this.ownerDocument=doc;this.append(...children);}
  append(...items){for(const child of items.flat(Infinity)){if(child==null)continue;if(typeof child==='object')child.parent=this;this.children.push(child);}}
  replaceChildren(...items){for(const child of this.children)if(typeof child==='object')child.parent=null;this.children=[];this.append(...items);}
  remove(){if(!this.parent)return;this.parent.children=this.parent.children.filter(child=>child!==this);this.parent=null;}
  contains(node){return !!node&&(node===this||this.children.some(child=>typeof child==='object'&&child.contains(node)));}
  setAttribute(key,value){this.attributes[key]=value;}
  focus(){doc.activeElement=this;}
  get textContent(){return this.children.map(child=>typeof child==='object'?child.textContent:String(child)).join(' ');}
  get classList(){return {toggle:(name,on)=>{const rows=new Set(this.className.split(' '));on?rows.add(name):rows.delete(name);this.className=[...rows].join(' ');}};}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  querySelectorAll(selector){const rows=[];for(const child of this.children){if(typeof child!=='object')continue;const data=/^\[data-guide-control="(.+)"\]$/.exec(selector);if(data?child.dataset.guideControl===data[1]:selector.startsWith('.')?child.className.split(' ').includes(selector.slice(1)):child.tag===selector)rows.push(child);rows.push(...child.querySelectorAll(selector));}return rows;}
 }
 const el=(tag,classes,...children)=>new Node(tag,classes,children);
 const button=(label,onclick,classes)=>Object.assign(el('button',classes,label),{onclick});
 const calls=[];
 const context=vm.createContext({el,button,tr,fill,guidePet:()=> 'dragon_green',petPortrait:()=>el('span','pet-sheet'),createCloseButton:(onclick,label)=>{const n=button(label,onclick,'close-button');n.setAttribute('aria-label',label);return n;},companionWorldGuide:save=>save.guide||({text:'火种已经在避风灯台安顿好了。',label:'走向出口',track:'dungeon-exit'}),campDetourGoal:save=>save.detourGoal,campDetourAvailable:()=>true,campDetour:save=>save.detour,battleGuide:()=>({text:'先看看手里的牌。',label:'指给我看',help:()=>calls.push(['help'])})});
 vm.runInContext(source.slice(source.indexOf('export function renderCompanionGuide'),source.indexOf('function battleGuide')).replaceAll('export function','function'),context);
 const root=el('main',''),model={save:{name:'test',seed:1},assets:{content:{}}},cb={panel:value=>calls.push(['panel',value]),track:value=>calls.push(['track',value])};
 const render=options=>context.renderCompanionGuide(root,model,cb,options);
 const control=name=>root.querySelector(`[data-guide-control="${name}"]`);
 render();return {root,model,render,control,doc,calls,capture:()=>context.captureCompanionGuide(root)};
}

test('world guide keeps one primary step and closes optional activities by default',()=>{
 const f=fixture();assert.equal(f.root.guideOpen,false);f.control('toggle').onclick();
 assert.equal(f.doc.activeElement,f.control('close'));
 assert.equal(f.root.querySelectorAll('.primary').length,1);
 const more=f.root.querySelector('.companion-guide-more');assert.equal(more.open,false);
 assert.equal(f.control('more').textContent,'和伙伴做点别的');assert.ok(more.contains(f.control('detour')));assert.ok(more.contains(f.control('pet')));
 assert.equal(f.calls.length,0);f.control('primary').onclick();assert.deepEqual(f.calls,[['track','dungeon-exit']]);assert.equal(f.root.guideOpen,false);assert.equal(f.doc.activeElement,f.control('toggle'));
});

test('repainting preserves focused activity and disclosure only for the same role',()=>{
 const f=fixture();f.control('toggle').onclick();f.root.querySelector('.companion-guide-more').open=true;f.control('pet').focus();
 f.render();assert.equal(f.root.querySelector('.companion-guide-more').open,true);assert.equal(f.doc.activeElement,f.control('pet'));
 f.model.save.name='another';f.render();assert.equal(f.root.guideOpen,false);f.control('toggle').onclick();assert.equal(f.root.querySelector('.companion-guide-more').open,false);
});

test('Escape collapses the panel and restores the dock without swallowing ordinary keys',()=>{
 const f=fixture();f.control('toggle').onclick();let prevented=0,stopped=0;
 const key=key=>f.root.querySelector('.companion-guide').onkeydown({key,preventDefault:()=>prevented++,stopPropagation:()=>stopped++});
 key('Tab');assert.equal(f.root.guideOpen,true);assert.equal(prevented,0);
 key('Escape');assert.equal(f.root.guideOpen,false);assert.equal(f.doc.activeElement,f.control('toggle'));assert.equal(prevented,1);assert.equal(stopped,1);
 key('Escape');assert.equal(prevented,1);
});

test('host clearing the HUD preserves the open activity and focused control through a captured state',()=>{
 const f=fixture();f.control('toggle').onclick();f.root.querySelector('.companion-guide-more').open=true;f.control('pet').focus();
 const stale=f.control('pet'),state=f.capture();f.root.replaceChildren();f.doc.activeElement=null;
 f.render({state});assert.equal(f.root.guideOpen,true);assert.equal(f.root.querySelector('.companion-guide-more').open,true);
 assert.equal(f.doc.activeElement,f.control('pet'));assert.notEqual(f.doc.activeElement,stale);stale.onclick();assert.equal(f.calls.length,0);
});

test('a captured guide never opens another role or steals focus from outside the guide',()=>{
 const f=fixture();f.control('toggle').onclick();f.control('pet').focus();const state=f.capture();
 f.root.replaceChildren();f.doc.activeElement=null;f.model.save.seed=2;f.render({state});assert.equal(f.root.guideOpen,false);assert.equal(f.doc.activeElement,null);
 f.control('toggle').onclick();const outside={name:'map-search'};f.doc.activeElement=outside;
 const next=f.capture();assert.equal(next.focused,null);f.root.replaceChildren();f.render({state:next});assert.equal(f.doc.activeElement,outside);
});

test('a focused optional activity falls back to a visible control when the available actions change',()=>{
 const f=fixture();f.control('toggle').onclick();f.control('pet').focus();const state=f.capture();
 f.root.replaceChildren();f.doc.activeElement=null;f.model.save.detourGoal={label:'find'};f.render({state});
 assert.equal(f.control('pet'),null);assert.equal(f.doc.activeElement,f.control('close'));
 const next=f.capture();f.root.replaceChildren();f.doc.activeElement=null;f.render({battle:true,state:next});assert.equal(f.doc.activeElement,f.control('close'));
});

test('both actual host renderers capture the guide before clearing and pass the snapshot when rebuilding',()=>{
 for(const [file,start] of [['view_hud.js','function renderHudContents('],['view_battle_layer.js','function renderBattleContent(']]){
  const host=fs.readFileSync(new URL(`../js/views/adventure/${file}`,import.meta.url),'utf8');const body=host.slice(host.indexOf(start));
  assert.ok(body.indexOf('const guideState = captureCompanionGuide(root);')<body.indexOf('root.replaceChildren();'),file);
  assert.match(body,/renderCompanionGuide\(root, model, cb, \{ (?:battle: true, )?state: guideState \}\)/);
 }
});

for(const [control,expected] of [['detour',['track','camp-detour-start']],['pet',['panel','pet']],['pause',['track','camp-detour-pause']]])test(`activity ${control} closes before navigation and stale panels cannot act`,()=>{
 const f=fixture();if(control==='pause')f.model.save.detourGoal={label:'find'};f.control('toggle').onclick();
 if(control==='pause')assert.equal(f.root.querySelector('.companion-guide-more'),null);
 const stale=f.control(control);f.render();stale.onclick();assert.equal(f.calls.length,0);
 f.control(control).onclick();assert.deepEqual(f.calls,[expected]);assert.equal(f.root.guideOpen,false);
});

test('battle guide retains its tactical action and refreshes focus away from hidden toggle',()=>{
 const f=fixture();f.render({battle:true});f.control('toggle').focus();f.root.guideOpen=true;f.render({battle:true});
 assert.equal(f.doc.activeElement,f.control('close'));assert.equal(f.root.querySelector('.companion-guide-more'),null);
 f.control('primary').onclick();assert.deepEqual(f.calls,[['help']]);assert.equal(f.root.guideOpen,false);
});

test('guide chrome, current step and optional activities use each learning language',()=>{
 try{for(const id of ['en','ja','ko']){
  const dict=parseLocaleFile(fs.readFileSync(new URL(`../data/adventure/locale/${id}.txt`,import.meta.url),'utf8'));
  setTranslator(value=>lookup(dict,value),id);const f=fixture();f.control('toggle').onclick();
  for(const [name,source] of [['more','和伙伴做点别的'],['pet','我的伙伴'],['detour','营地寻宝'],['primary','走向出口']])assert.notEqual(f.control(name).textContent,source);
  assert.notEqual(f.control('close').attributes['aria-label'],'收起抱抱龙引导');
  assert.notEqual(f.root.querySelector('.companion-guide-card').querySelector('p').textContent,'火种已经在避风灯台安顿好了。');
 }}finally{setTranslator(null);}
});


test('the next wordplay instruction renders with the active UI language and a translated learning language',()=>{
 try{
  for(const locale of ['en','ja','ko']){
   const dict=parseLocaleFile(fs.readFileSync(new URL('../data/adventure/locale/'+locale+'.txt',import.meta.url),'utf8'));
   setTranslator(key=>lookup(dict,key));
   const f=fixture();
   for(const textKey of ['先用{language}和它打个招呼。','试着用{language}请它跳一下。','用{language}叫它到你身边来。']){
    f.model.save.guide={textKey,vars:{language:'日语'},text:textKey.replace('{language}','日语'),label:'玩口令',track:'companion-wordplay'};
    f.render();f.control('toggle').onclick();
    assert.ok(f.root.textContent.includes(fill(textKey,{language:'日语'}).text));
    assert.ok(!f.root.textContent.includes('{language}'));
    assert.ok(!f.root.textContent.includes(f.model.save.guide.text));
    f.control('primary').onclick();
    assert.deepEqual(f.calls.at(-1),['track','companion-wordplay']);
   }
  }
 }finally{setTranslator(key=>key);}
});
