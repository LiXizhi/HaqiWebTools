import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../js/view_opening_journey.js',import.meta.url),'utf8');
function render(phase,{joined=true}={}){
 const all=[];
 function el(tag,cls='',...children){const n={tag,className:cls,children,dataset:{},attributes:{},textContent:typeof children[0]==='string'?children[0]:'',setAttribute(k,v){this.attributes[k]=v;},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},addEventListener(){},querySelector(){return null;},focus(){}};all.push(n);return n;}
 const calls=[],state={phase,petId:'gululu'};
 const context=vm.createContext({el,button:(label,action,cls)=>Object.assign(el('button',cls,label),{click:action}),art:()=>el('canvas'),petPortrait:()=>el('div','pet-sheet'),guidePet:()=>5,OPENING_PET:6,
 openingJourney:()=>state,openingJourneyMilestones:()=>[{label:'认识伙伴',complete:phase==='done'}],openingFriendAnswer:()=>({accepted:true}),createCloseButton:action=>({...el('button','close-button'),click:action})});
 vm.runInContext(source.slice(source.indexOf('export function')).replace('export function','function'),context);
 const cb=Object.fromEntries(['close','go','pets','continue','explore','listen','wordplay'].map(key=>[key,()=>calls.push(key)]));cb.action=value=>{calls.push(value);return true;};
 const root=el('div');context.renderOpeningJourney(root,{assets:{content:{npcs:{36201:{portrait:'moni'}},pets:{}}},save:{formation:joined?['gululu']:[]}},cb);
 return {all,calls,modal:root.children[0],button:label=>all.find(n=>n.tag==='button'&&n.textContent===label)};
}
for(const [phase,label,expected] of [
 ['offer','带抱抱龙去看看',{step:'accept'}],
 ['guide','先和侦查兵切磋',{step:'route',route:'battle'}],
 ['explain','We are friends. · 我们是朋友',{step:'explain',text:'We are friends.',choice:true}],
 ['route','我想先解释一下',{step:'route',route:'talk'}],
 ['challenge','带我去找侦查兵','go'],
 ['rescue','放入宠物背包',{step:'rescue',join:false}],
 ['showcase','去试试新搭档','go'],
 ['done','和伙伴玩口令','wordplay']
])test(`opening ${phase} keeps its existing deliberate action`,()=>{
 const ui=render(phase);assert.deepEqual(ui.calls,[],'rendering never mutates progress');
 assert.ok(ui.modal.className.includes('opening-character-dialogue'));
 assert.ok(ui.all.some(n=>n.tag==='details'&&n.className==='opening-progress'),'progress remains available');
 const action=ui.button(label);assert.ok(action,label);action.click();
 assert.equal(JSON.stringify(ui.calls),JSON.stringify([expected]));
});
test('showcase with a stored companion retains join rather than pretending it is already in formation',()=>{
 const ui=render('showcase',{joined:false});assert.ok(ui.button('加入队伍'));assert.equal(ui.button('去试试新搭档'),undefined);
 ui.button('加入队伍').click();assert.equal(ui.calls[0].step,'join');
});
