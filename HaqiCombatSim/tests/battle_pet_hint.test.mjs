import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseLocaleFile} from '../js/locale_core.js';
import {setTranslator,fill} from '../js/locale_runtime.js';
import {nearestBattlePet} from '../js/view_battle_pet_hint.js';
import {battleSpeech,updateBattleSpeech} from '../js/view_battle_pet_hint.js';
test('NPC speech follows its head on desktop and mobile and survives UI reconstruction',()=>{
 for(const width of [1280,390]){
  const battle={sides:{far:[{id:'mob0',template:{sequences:[[{round:'1-',speak:'请选择目标。'}]]}}]}};
    const bubble={style:{setProperty(name,value){this[name]=value;}},dataset:{caster:'mob0'},offsetWidth:230,offsetHeight:50,remove(){this.hidden=true;}};
    const root={clientWidth:width,querySelectorAll:()=>[bubble]};
  const canvas={clientHeight:300,offsetLeft:0,offsetTop:0,battlePositions:{mob0:{x:width-70,y:250}}};
  updateBattleSpeech(root,battle,canvas,0);
  assert.equal(bubble.textContent,'请选择目标。');
  assert.equal(bubble.dataset.caster,'mob0');
  assert.ok(parseFloat(bubble.style.left)>=8);
  assert.ok(parseFloat(bubble.style.left)+bubble.offsetWidth<=width-8);
    assert.equal(bubble.style.top,'86px');
  updateBattleSpeech({...root},battle,canvas,1000);
  assert.equal(bubble.hidden,false);
  updateBattleSpeech(root,battle,canvas,5000);
  assert.equal(bubble.hidden,true);
 }
});
test('configured opening speech appears before a decision and is not repeated by the first cast',()=>{
 const battle={completedDecisions:0,sides:{far:[{id:'mob0',template:{sequences:[[{round:'1',speak:'先选卡牌。'},{round:'2',speak:'继续！'}]]}}]}};
 assert.deepEqual(battleSpeech(battle,0),{caster:'mob0',text:'先选卡牌。'});
 assert.equal(battleSpeech(battle,5000),null);
 const first={type:'speak',caster:'mob0',text:'先选卡牌。'};
 assert.equal(battleSpeech(battle,5100,first),null);
 const next={type:'speak',caster:'mob0',text:'继续！'};
 assert.equal(battleSpeech(battle,5200,next).text,'继续！');
 assert.equal(battleSpeech(battle,10000,next),null);
 assert.equal(battleSpeech({...battle,completedDecisions:1},0),null);
});
test('pet hint follows nearest living friendly pet, independent of roster order',()=>{
 const hero={id:'hero',hp:100},far={id:'a',hp:40,speciesId:'dragon'},near={id:'b',hp:20,speciesId:'dragon'},dead={id:'c',hp:0,speciesId:'dragon'};
 const battle={sides:{near:[hero,far,near,dead]}},positions={hero:{x:100,y:100},a:{x:250,y:100},b:{x:110,y:110},c:{x:100,y:100}};
 assert.equal(nearestBattlePet(battle,{}, {pets:{}},positions).id,'b');
 near.hp=0;assert.equal(nearestBattlePet(battle,{}, {pets:{}},positions).id,'a');
 far.hp=0;assert.equal(nearestBattlePet(battle,{}, {pets:{}},positions),null);
});
test('visible hero support pet can speak, but a missing pet or fallen hero cannot',()=>{
 const battle={sides:{near:[{id:'hero',hp:100}]}},positions={hero:{x:100,y:100}},save={heroSlot:0,formation:['dragon'],pets:{dragon:{id:'support'}}};
 const content={pets:{dragon:{name:'抱抱龙',art:{}}}};
 assert.equal(nearestBattlePet(battle,save,content,positions).id,'support');
 assert.equal(nearestBattlePet(battle,save,{pets:{}},positions),null);
 battle.sides.near[0].hp=0;assert.equal(nearestBattlePet(battle,save,content,positions),null);
});
import {createBattlePetHint} from '../js/view_battle_pet_hint.js';
test('battle advice translates full sentences, card and target names in all UI languages',()=>{
 const el=(tag,className,...children)=>({tag,className,children,dataset:{},attributes:{},style:{setProperty(){}},setAttribute(key,value){this.attributes[key]=value;},get textContent(){return this.children.join('');},set textContent(value){this.children=[value];}});
 const hero={id:'hero',side:'near',hp:100,school:'fire',pips:{normal:1,power:0},cooldowns:{},deckSeq:['trap'],deckMap:[1],petDeckSeq:['trap'],petDeckMap:[1]},enemy={id:'enemy',side:'far',hp:100,name:'小米粒'};
 const model={assets:{dataset:{cards:{trap:{name:'烈火陷阱'}}}},battle:{resolved:{version:'kids',cards:{trap:{type:'SingleAttack',spellSchool:'fire',pipcost:0,spellName:'trap'}}},unitsById:{hero,enemy},sides:{near:[hero],far:[enemy]}},aiHint:{action:{seq:0,key:'trap',targetId:'enemy'}}};
 try{
  for(const language of ['en','ja','ko']){
   const table=parseLocaleFile(fs.readFileSync(new URL(`../data/adventure/locale/${language}.txt`,import.meta.url),'utf8'));
   setTranslator(text=>table[text]||text);
   for(const [seq,petCardsOpen,pattern]of [[0,false,'可以试试「{card}」，目标选{target}。'],[10000,false,'打开“使用宠物卡”，试试「{card}」，目标选{target}。'],[10000,true,'可以试试宠物卡「{card}」，目标选{target}。']]){
    const bubble=createBattlePetHint({...model,petCardsOpen,aiHint:{action:{seq,key:'trap',targetId:'enemy'}}},{el});
    const text=bubble.children[0].textContent;
    assert.equal(text,fill(pattern,{card:'烈火陷阱',target:'小米粒'}).text);
    assert.ok(text.includes(table['烈火陷阱']));assert.ok(text.includes(table['小米粒']));
    assert.equal(bubble.children[0].dataset.zh,fill(pattern,{card:'烈火陷阱',target:'小米粒'}).zh);
    assert.equal(bubble.attributes['aria-label'],fill('{message} 点击收起提示',{message:text}).text);
    if(language==='en')assert.doesNotMatch(text,/[\u3400-\u9fff]/u);
   }
   const pass=createBattlePetHint({...model,aiHint:{action:{pass:true}}},{el});
   assert.equal(pass.children[0].textContent,table['先攒点魔力，等机会再出手。']);
   const discard=createBattlePetHint({...model,aiHint:{action:{pass:true,discardSeqs:[0]}}},{el});
   assert.equal(discard.children[0].textContent,fill('可以弃掉「{card}」，找找需要的牌。',{card:'烈火陷阱'}).text);
  }
 }finally{setTranslator(null);}
});
test('pet speech is passive plain text, suppressed while choosing or muted',()=>{
 const el=(tag,className,...children)=>({tag,className,children,style:{setProperty(name,value){this[name]=value;}},setAttribute(){},get textContent(){return this.children.join('');},set textContent(value){this.children=[value];}});
 const hero={id:'hero',side:'near',hp:100,school:'fire',pips:{normal:1,power:0},cooldowns:{},deckSeq:['hit'],deckMap:[1]},enemy={id:'enemy',side:'far',hp:100,name:'侦察兵'};
 const model={assets:{dataset:{cards:{hit:{name:'烈火魔光'}}}},battle:{resolved:{version:'kids',cards:{hit:{type:'SingleAttack',spellSchool:'fire',pipcost:0,spellName:'hit'}}},unitsById:{hero,enemy},sides:{near:[hero],far:[enemy]}},aiHint:{action:{seq:0,key:'hit',targetId:'enemy'}}};
 let dismissed=0;const bubble=createBattlePetHint(model,{el,onDismiss:()=>dismissed++});
 assert.equal(bubble.style['--pet-hint-tail'],'14px');
 bubble.onclick({stopPropagation(){}});assert.equal(dismissed,1);assert.equal(bubble.hidden,true);assert.equal(bubble.hintDismissed,true);
 assert.deepEqual(bubble.children.map(child=>child.tag),['p']);
 const message=m=>createBattlePetHint(m,{el})?.children[0].children[0];
 hero.petDeckSeq=['hit'];hero.petDeckMap=[1];
 const petModel={...model,aiHint:{action:{seq:10000,key:'hit',targetId:'enemy'}}};
 assert.match(message(petModel),/打开“使用宠物卡”/);
 assert.match(message({...petModel,petCardsOpen:true}),/可以试试宠物卡/);
 hero.petDeckMap[0]=-2;assert.equal(message(petModel),undefined);
 assert.equal(message({...model,discarded:[0]}),undefined);
 hero.deckMap[0]=0;assert.equal(message(model),undefined);
 hero.deckMap[0]=1;hero.cooldowns.hit=1;assert.equal(message(model),undefined);
 hero.cooldowns.hit=0;model.battle.resolved.cards.hit.pipcost=2;assert.equal(message(model),undefined);
 model.battle.resolved.cards.hit.pipcost=0;enemy.hp=0;assert.equal(message(model),undefined);enemy.hp=100;
 assert.equal(message({...model,aiHint:{action:{seq:0,key:'wrong',targetId:'enemy'}}}),undefined);

 assert.equal(bubble.children[0].children[0],'可以试试「烈火魔光」，目标选侦察兵。');
 assert.equal(createBattlePetHint({...model,selected:{key:'hit'}},{el}),null);
 assert.equal(createBattlePetHint({...model,aiHintsMuted:true},{el}),null);
 assert.equal(createBattlePetHint({...model,aiHint:{action:{pass:true}}},{el}).children[0].children[0],'先攒点魔力，等机会再出手。');
});
import {updateBattlePetHint} from '../js/view_battle_pet_hint.js';
test('pet tail stays at the pet while enemy speech appears and disappears on mobile and desktop',()=>{
 for(const width of [390,1280]){
  const bubble={style:{setProperty(name,value){this[name]=value;}},dataset:{},offsetWidth:230,offsetHeight:56};
  const enemy={hidden:false,style:{left:'300px',top:'135px'},offsetWidth:76,offsetHeight:40};
  const root={battlePetHint:bubble,clientWidth:width,clientHeight:500,querySelectorAll:()=>[enemy]};
  const battle={sides:{near:[{id:'hero',hp:100}]}};
  const canvas={clientHeight:300,offsetLeft:0,offsetTop:0,battlePositions:{hero:{x:86,y:280}}};
  const save={heroSlot:0,formation:['pet'],pets:{pet:{id:'pet'}}},content={pets:{pet:{art:{}}}};
  for(const hidden of [false,true,false]){
   enemy.hidden=hidden;updateBattlePetHint(root,battle,save,content,canvas);
   assert.equal(bubble.hidden,false);
   const tail=parseFloat(bubble.style['--pet-hint-tail']);
   assert.equal(tail,Math.max(14,Math.min(216,122-parseFloat(bubble.style.left))));
   assert.notEqual(tail,115);
  }
 }
});
test('balloon grows right of support pet and a dismissed balloon stays hidden across frames',()=>{
 const bubble={style:{setProperty(name,value){this[name]=value;}},dataset:{},offsetWidth:180,offsetHeight:50};
 const root={battlePetHint:bubble,clientWidth:390};
 const battle={sides:{near:[{id:'hero',hp:100}]}};
 const canvas={clientHeight:300,offsetLeft:0,offsetTop:0,battlePositions:{hero:{x:100,y:200}}};
 const save={heroSlot:0,formation:['pet'],pets:{pet:{id:'pet'}}},content={pets:{pet:{art:{}}}};
 updateBattlePetHint(root,battle,save,content,canvas);
 assert.equal(bubble.style.left,'136px');assert.equal(bubble.hidden,false);
 assert.ok(parseFloat(bubble.style.maxWidth)<=390-136-8);
 canvas.battleStatusRects=[{x:280,y:50,width:28,height:28}];
 updateBattlePetHint(root,battle,save,content,canvas);
 assert.equal(bubble.hidden,false);
 assert.equal(parseFloat(bubble.style.left)+parseFloat(bubble.style['--pet-hint-tail']),136);
 assert.notEqual(bubble.style['--pet-hint-tail'],'90px');
 bubble.hintDismissed=true;updateBattlePetHint(root,battle,save,content,canvas);assert.equal(bubble.hidden,true);
});
