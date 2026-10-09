import {fill,tr,setTranslator} from '../js/locale_runtime.js';
import {parseLocaleFile} from '../js/locale_core.js';
import {createPetTraitBadges} from '../js/view_pet_traits.js';
import {applyPetTraitStats,petTraitParams,petHungerMultiplier} from '../js/adventure_pet_traits_core.js';
import {powerPipChanceByLevel} from '../js/combat_formulas_core.js';
import {petMaxHp,petCapacity,partySpecs} from '../js/adventure_pets_core.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../js/view_adventure_pet_details.js',import.meta.url),'utf8');
test('pet detail vital numbers, raw element names and growth stages use real target dictionaries',()=>{
 try{
  for(const language of ['en','ja','ko']){
   const table=parseLocaleFile(fs.readFileSync(new URL(`../data/adventure/locale/${language}.txt`,import.meta.url),'utf8'));
   setTranslator(text=>table[text]||text);
   const h=render(['hero','p',null,null],null,{hp:158,hunger:79},{staticAppearance:false});
   const vitals=h.nodes.find(node=>node.cls==='pet-profile-vitals');
   for(const [index,label]of ['生命','饱食'].entries()){
    const text=vitals.children[index].children[0].children[0];
    assert.ok(text.includes(table[label]));assert.ok(text.includes(index?'79':'158'));
    assert.equal(vitals.children[index].children[1].attributes['aria-label'],text);
   }
   const heading=h.nodes.find(node=>node.tag==='h3'&&node.children[0]===fill('{v0}系 · {v1}',{v0:'火',v1:'幼年'}).text);
   assert.ok(heading);assert.ok(heading.children[0].includes(table['火']));assert.ok(heading.children[0].includes(table['幼年']));
   assert.ok(table['火']);assert.ok(table['幼年']);
   if(language==='en')assert.doesNotMatch(heading.children[0],/[\u3400-\u9fff]/u);
  }
 }finally{setTranslator(null);}
});
function render(formation,pendingEncounter=null,petOverrides={},definitionOverrides={}){
 const nodes=[],actions=[];
 const el=(tag,cls='',...children)=>{const node={tag,cls,children,dataset:{},attributes:{},classList:{add(){}},setAttribute(key,value){this.attributes[key]=value;},append(...items){this.children.push(...items);},replaceChildren(){this.children=[];},addEventListener(){},showModal(){},close(){},focus(){}};nodes.push(node);return node;};
 const button=(label,action,cls)=>Object.assign(el('button',cls),{label,click:action});
 const context=vm.createContext({fill,tr,STAGE_NAMES:['幼年','青年','成年','隐藏形态'],createPetTraitBadges,applyPetTraitStats,petTraitParams,petHungerMultiplier,powerPipChanceByLevel,petCapacity,document:{activeElement:null,body:el('body')},createCloseButton:()=>button('关闭',()=>{}),petParams:()=>({petXpStep:30,levelCap:50,hungerPerMinute:1}),petAppearanceStage:()=>0,petMaxHp,nutritionStock:()=>0,petDisplayScale:()=>1,createPetEvolution:()=>el('div')});
 vm.runInContext(source.slice(source.indexOf('export function showPetDetails')).replace('export function','function'),context);
 const content={pets:{p:{name:'测试宠物',school:'fire',staticAppearance:true,traits:{elementalAttribute:'火'},...definitionOverrides}}};
 const save={pets:{p:{id:'p',speciesId:'p',deck:[],level:1,xp:0,hp:100,hunger:100,...petOverrides}},formation,heroSlot:0,pendingEncounter};
 context.showPetDetails({content},'p',()=>el('canvas'),{el,button},{save,action:a=>actions.push(a),shop(){}});
 const row=nodes.find(n=>n.cls==='pet-position-actions');
 return {nodes,row,actions,save,content,toggle:row.children[0]};
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

test('pet detail permanent attributes match deployed pet stats and refresh with growth',()=>{
 for(const petOverrides of [{},{level:25,passiveTraits:{attack:9,defense:8,vitality:6,critical:5,accuracy:4,mana:3,healing:2,frugal:1}}]){
  const h=render(['hero','p',null,null],null,petOverrides),pet=h.save.pets.p;
  const spec=partySpecs(h.save,h.content,{id:'hero',school:'fire',level:1,stats:{}})[1];
  const attributes=h.nodes.find(n=>n.cls==='pet-profile-attributes');
  const values=Object.fromEntries(attributes.children.map(row=>row.children.map(cell=>cell.children[0])));
  assert.equal(values['攻击力（伤害加成）'],`${spec.stats.damagePct.all||0}%`);
  assert.equal(values['防御力（减伤）'],`${spec.stats.resistPct.all||0}%`);
  assert.equal(values['最大生命'],String(petMaxHp(pet,h.content)));
  assert.equal(values['暴击属性'],`${spec.stats.critPct.all||0}%`);
  assert.equal(values['命中加成'],`${spec.stats.accuracyPct.all||0}%`);
  assert.equal(values['超级魔力率'],`${powerPipChanceByLevel(pet.level,'kids')+spec.stats.powerPipPct}%`);
  assert.equal(values['治疗加成'],`${spec.stats.outputHealPct}%`);
  assert.equal(values['卡包容量'],`${petCapacity(pet,h.content)} 张`);
 }
});
