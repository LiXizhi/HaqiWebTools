import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../js/views/adventure/view_entry.js',import.meta.url),'utf8');
function wizard({step=1,accountChoice=false,busy='',error=''}={}){
 const nodes=[],document={activeElement:null};
 function el(tag,className='',...children){
  const n={tag,className,children:[],parent:null,dataset:{},attributes:{},style:{setProperty(){}},disabled:false,value:'',
   setAttribute(k,v){this.attributes[k]=String(v);},removeAttribute(k){delete this.attributes[k];},
   append(...items){for(const item of items){this.children.push(item);if(item&&typeof item==='object')item.parent=this;}},
   replaceChildren(...items){for(const item of this.children)if(item&&typeof item==='object')item.parent=null;this.children=[];this.append(...items);},
   remove(){if(this.parent)this.parent.children=this.parent.children.filter(item=>item!==this);this.parent=null;},
   focus(){if(this.isConnected&&!this.disabled)document.activeElement=this;},
   querySelectorAll(selector){const rows=[];const walk=node=>{for(const child of node.children||[])if(child&&typeof child==='object'){rows.push(child);walk(child);}};walk(this);return rows.filter(node=>selector.split(',').some(part=>matchesPath(node,part.trim())));},
   querySelector(selector){return this.querySelectorAll(selector)[0]||null;},
   get isConnected(){return this.root===true||!!this.parent?.isConnected;}
  };
  n.classList={add(...values){for(const value of values)n.classList.toggle(value,true);},remove(...values){for(const value of values)n.classList.toggle(value,false);},toggle(value,on){const set=new Set(n.className.split(/\s+/).filter(Boolean));on??=!set.has(value);if(on)set.add(value);else set.delete(value);n.className=[...set].join(' ');}};
  n.append(...children);nodes.push(n);return n;
 }
 function matches(node,selector){
  if(selector.startsWith('#'))return node.id===selector.slice(1);
  if(selector.startsWith('.'))return node.className.split(/\s+/).includes(selector.slice(1));
  const attr=selector.match(/^\[([^=]+)="([^"]*)"\]$/);
  if(attr)return (attr[1].startsWith('data-')?node.dataset[attr[1].slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]:node.attributes[attr[1]])===attr[2];
  return node.tag===selector;
 }
 function matchesPath(node,selector){const parts=selector.split(/\s+/);if(!matches(node,parts.pop()))return false;let parent=node.parent;while(parts.length){const part=parts.pop();while(parent&&!matches(parent,part))parent=parent.parent;if(!parent)return false;parent=parent.parent;}return true;}
 const button=(label,action,cls='')=>Object.assign(el('button',cls,...(Array.isArray(label)?label:[label])),{onclick:action});
 const draft={name:'小风',step,school:'fire',appearance:'girl',starter:'dragon_green',headId:'jade',bodyId:'female-ref'},previews=[],created=[];
 const cb={draft,accountChoice,busy,stopPreview(){},pausePreview:()=>true,previewChoices:school=>[0,1].map(i=>({key:`${school}-${i}`,name:`${school}${i}`})),preview:(...args)=>previews.push(args),create:value=>created.push(value),importOriginal(){},login(){}};
 const schoolNames={fire:'火焰',ice:'寒冰',storm:'风暴',life:'生命',death:'死亡'};
 const context=vm.createContext({document,el,button,SCHOOL_NAMES:schoolNames,COLORS:{},schoolDescription:{},
  createEntryIntro:()=>({root:el('div','entry-intro',button('English',()=>{},'locale-button')),fit(){}}),createEntryFooter:()=>null,createHeroPicker:()=>el('div','avatar-choice'),
  heroPortrait:()=>el('canvas'),petPortrait:()=>el('canvas'),fill:(text,args)=>({text:text.replace(/\{(\w+)\}/g,(_,key)=>args[key])}),
  setText:(node,text,args={})=>{node.textContent=text.replace(/\{(\w+)\}/g,(_,key)=>args[key]);},
  starterPicker:(_assets,onSelect)=>{const row=el('div','starter-choices');for(const id of ['dragon_green','dragon_red']){const b=button(id,()=>{for(const child of row.children){child.setAttribute('aria-pressed',String(child===b));}onSelect(id);});b.dataset.petId=id;row.append(b);}return row;}
 });
 vm.runInContext(source.slice(source.indexOf('export function renderEntry(root')).replace('export function','function'),context);
 const root=el('div');root.root=true;
 context.renderEntry(root,{content:{pets:{dragon_green:{name:'绿龙'},dragon_red:{name:'红龙'}}},effects:{cards:{}}},null,cb,error);
 return {draft,cb,root,document,previews,created,form:root.querySelector('form'),find:selector=>root.querySelector(selector),button:label=>nodes.findLast(n=>n.isConnected&&n.tag==='button'&&(n.textContent===label||n.children.includes(label)))};
}
const submit=ui=>ui.form.onsubmit({preventDefault(){}});

test('creation respects IME confirmation, focuses each next choice and preserves the draft when going back',()=>{
 const ui=wizard(),name=ui.find('#hero-name');
 name.oncompositionstart();name.value='风语';submit(ui);assert.equal(ui.draft.step,1);
 name.oncompositionend();submit(ui);assert.equal(ui.draft.step,2);
 assert.equal(ui.document.activeElement.dataset.petId,'dragon_green');
 ui.find('[data-pet-id="dragon_red"]').onclick();
 submit(ui);assert.equal(ui.draft.step,3);assert.equal(ui.document.activeElement.dataset.school,'fire');
 ui.find('[data-school="ice"]').onclick();assert.equal(ui.document.activeElement.dataset.school,'ice');
 ui.button('上一步').onclick();assert.equal(ui.document.activeElement.dataset.petId,'dragon_red');
 ui.button('上一步').onclick();assert.equal(ui.document.activeElement.id,'hero-name');assert.equal(ui.document.activeElement.value,'风语');
 submit(ui);submit(ui);submit(ui);
 assert.equal(ui.created.length,1);assert.deepEqual(JSON.parse(JSON.stringify(ui.created[0])),{name:'风语',school:'ice',appearance:'girl',headId:'jade',bodyId:'female-ref',starter:'dragon_red'});
});

test('whitespace-only names explain the error beside the input and recover without replacing it again',()=>{
 const ui=wizard(),name=ui.find('#hero-name');name.value='   ';name.oninput();submit(ui);
 const invalid=ui.find('#hero-name');assert.equal(ui.draft.step,1);assert.equal(ui.document.activeElement,invalid);
 assert.equal(invalid.attributes['aria-invalid'],'true');assert.equal(invalid.attributes['aria-describedby'],'hero-name-error');
 assert.equal(ui.find('#hero-name-error').attributes.role,'alert');
 invalid.value='小风';invalid.oninput();assert.equal(ui.find('#hero-name'),invalid);assert.equal(ui.find('#hero-name-error'),null);assert.equal(invalid.attributes['aria-invalid'],undefined);
 submit(ui);assert.equal(ui.draft.step,2);
});

test('old automatic preview callbacks cannot change the new school or supersede a manual skill selection',()=>{
 const ui=wizard({step:3}),first=ui.previews.at(-1);
 ui.find('[data-school="ice"]').onclick();const ice=ui.previews.at(-1),count=ui.previews.length;
 first[3]('旧的火焰状态');first[4]();assert.equal(ui.previews.length,count);assert.equal(ui.draft.previewKey,'ice-0');
 ui.find('[data-key="ice-1"]').onclick();ice[3]('旧的寒冰状态');ice[4]();
 assert.equal(ui.draft.previewKey,'ice-1');assert.equal(ui.previews.length,count+1);
 ui.button('上一步').onclick();ui.previews.at(-1)[3]('离开后的状态');assert.equal(ui.draft.step,2);
});

test('guest account choice enters the name field and busy creation cannot advance or preview',()=>{
 const ui=wizard({accountChoice:true});submit(ui);assert.equal(ui.draft.step,1);assert.equal(ui.find('#hero-name'),null);
 ui.button('本地访客').onclick();assert.equal(ui.document.activeElement.id,'hero-name');
 const busy=wizard({step:3,busy:'正在保存…'});assert.equal(busy.previews.length,0);submit(busy);assert.equal(busy.created.length,0);
 assert.ok(busy.root.querySelectorAll('button,input,select').every(node=>node.disabled));
});

test('account login exposes a persistent error and busy feedback while locking the language controls',()=>{
 const pending=wizard({accountChoice:true,busy:'正在创建角色…'});
 assert.equal(pending.form.attributes['aria-busy'],'true');
 assert.equal(pending.find('[role="status"]').textContent,'正在创建角色…');
 assert.ok(pending.root.querySelectorAll('button,input,select').every(node=>node.disabled));
 const failed=wizard({accountChoice:true,error:'连接失败，请重试'});
 assert.equal(failed.form.attributes['aria-busy'],'false');
 assert.equal(failed.find('[role="alert"]').children[0],'连接失败，请重试');
 assert.equal(failed.button('登录 Keepwork').disabled,false);
 failed.button('本地访客').onclick();
 assert.equal(failed.document.activeElement.id,'hero-name');
});

for(const flags of [{isComposing:true},{keyCode:229}])test('name confirmation stays inside the IME '+JSON.stringify(flags),()=>{
 const ui=wizard(),name=ui.find('#hero-name');let prevented=false;
 name.value='小风';name.oninput();
 name.onkeydown?.({key:'Enter',...flags,preventDefault(){prevented=true;}});
 assert.equal(prevented,true);assert.equal(ui.draft.step,1);assert.equal(ui.created.length,0);
});

test('name keyboard offers next and leaves ordinary Enter available to the form',()=>{
 const ui=wizard(),name=ui.find('#hero-name');let prevented=false;
 assert.equal(name.enterKeyHint,'next');
 name.onkeydown?.({key:'Enter',preventDefault(){prevented=true;}});
 assert.equal(prevented,false);submit(ui);assert.equal(ui.draft.step,2);
});
