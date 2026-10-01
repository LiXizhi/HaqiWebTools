import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../js/view_adventure_pet_details.js',import.meta.url),'utf8');
function render(formation,pendingEncounter=null,petOverrides={}){
 const nodes=[],actions=[];
 const el=(tag,cls='',...children)=>{const node={tag,cls,children,dataset:{},classList:{add(){}},setAttribute(){},append(...items){this.children.push(...items);},replaceChildren(){this.children=[];},addEventListener(){},showModal(){},close(){},focus(){}};nodes.push(node);return node;};
 const button=(label,action,cls)=>Object.assign(el('button',cls),{label,click:action});
 const context=vm.createContext({document:{activeElement:null,body:el('body')},createCloseButton:()=>button('关闭',()=>{}),petParams:()=>({petXpStep:30,levelCap:50}),petAppearanceStage:()=>0,petMaxHp:()=>100,nutritionStock:()=>0,petDisplayScale:()=>1,createPetEvolution:()=>el('div')});
 vm.runInContext(source.slice(source.indexOf('export function showPetDetails')).replace('export function','function'),context);
 context.showPetDetails({content:{pets:{p:{name:'测试宠物',staticAppearance:true,traits:{elementalAttribute:'火'}}}}},'p',()=>el('canvas'),{el,button},{save:{pets:{p:{deck:[],level:1,xp:0,hp:100,hunger:100,...petOverrides}},formation,heroSlot:0,pendingEncounter},action:a=>actions.push(a),shop(){}});
 const row=nodes.find(n=>n.cls==='pet-position-actions');
 return {nodes,row,actions,toggle:row.children[0]};
}
test('pet care has one formation toggle and nutrition beside it, never a second disabled formation button',()=>{
 for(const formation of [['hero',null,null,null],['hero','p',null,null]]){
  const h=render(formation),deployed=formation.includes('p');
  assert.equal(h.nodes.filter(n=>['上阵','下阵'].includes(n.label)).length,1);
  assert.equal(h.row.children.length,2);assert.match(h.row.children[1].label,/分享营养餐/);
  assert.equal(h.toggle.label,deployed?'下阵':'上阵');assert.equal(h.toggle.disabled,false);
  h.toggle.click();assert.deepEqual(JSON.parse(JSON.stringify(h.actions[0])),{type:'formation',slots:deployed?['hero',null,null,null]:['hero','p',null,null],heroSlot:0});
 }
});
test('single formation button preserves full-party and active-battle restrictions',()=>{
 for(const [slots,battle] of [[['hero','a','b','c'],null],[['hero','p',null,null],{}],[['hero',null,null,null],{}]]){
  const h=render(slots,battle);assert.equal(h.toggle.disabled,true);h.toggle.click();assert.equal(h.actions.length,0);
 }
 const h=render(['hero','p','a','b']);assert.equal(h.toggle.disabled,false);h.toggle.click();assert.equal(h.actions.length,1);
});


test('pet profile groups vitals above portrait and XP below, with level beside name',()=>{
 const h=render(['hero',null,null,null]);
 const title=h.nodes.find(n=>n.cls==='pet-profile-title');
 assert.equal(title.children[0],'测试宠物');assert.equal(title.children[1].cls,'pet-profile-level');
 assert.equal(title.children[1].children[0],'1级');
 const visual=h.nodes.find(n=>n.cls==='pet-profile-visual');
 assert.deepEqual(visual.children.map(n=>n.cls),['pet-profile-vitals','pet-profile-portrait','pet-profile-xp']);
 assert.equal(visual.children[0].children.length,2);
 const xp=visual.children[2].children[0];assert.equal(xp.value,0);assert.equal(xp.max,30);
});


test('XP bar shows progress toward next level and stays full at level cap',()=>{
 for(const [pet,value,max] of [[{level:7,xp:683},53,210],[{level:8,xp:840},0,240],[{level:50,xp:36750},1,1]]){
  const h=render(['hero',null,null,null],null,pet),bar=h.nodes.find(n=>n.cls==='pet-meter pet-meter-xp');
  assert.equal(bar.value,value);assert.equal(bar.max,max);
 }
});
