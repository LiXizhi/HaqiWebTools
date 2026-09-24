import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createSpellEffects} from '../js/spell_effects.js';
import {effectDuration,spellEffect} from '../js/spell_effects_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url)));
const effects=read('data/adventure/spell-effects.json'),manifest=read('data/adventure/skill-art.json'),cards=read('data/kids/cards.json');
test('zero-pip attacks use short particle flights without card art, including reduced motion and fizzles',()=>{
 const attacks=Object.values(cards).filter(card=>card.pipcost===0&&/Attack|LifeTap/.test(card.type));
 assert.ok(attacks.length>0);
 const commands=[];
 const context=new Proxy({}, {get:(_,key)=>(...args)=>{commands.push([key,...args]);},set:()=>true});
 const fx=createSpellEffects({effects,skillArt:{manifest,drawSubject(){assert.fail('quick attacks must not draw subjects');}},images:new Map(Object.keys(effects.bases).map(base=>['spell:'+base,{width:256,height:512}]))});
 for(const card of attacks){
  assert.equal(effectDuration(effects,card),550);
  for(const reducedMotion of [false,true])for(const failed of [false,true])for(const progress of [.1,.4,.8]){
   commands.length=0;
   fx.draw(context,{card,progress,from:{x:100,y:240},to:{x:600,y:240},width:800,height:400,reducedMotion,failed});
   assert.ok(commands.some(([key])=>key==='arc'));
   assert.ok(commands.every(([key])=>!['drawImage','fillRect','stroke'].includes(key)));
   if(failed)assert.ok(commands.filter(([key])=>key==='arc').every(([,x])=>x<120));
  }
 }
 const card=attacks[0],centers=[];
 for(const progress of [.1,.4]){
  commands.length=0;fx.draw(context,{card,progress,from:{x:100,y:240},to:{x:600,y:240},width:800,height:400});
  const arcs=commands.filter(([key])=>key==='arc');centers.push(arcs.reduce((sum,[,x])=>sum+x,0)/arcs.length);
 }
 assert.ok(centers[1]>centers[0]+100);
 for(const other of Object.values(cards).filter(card=>card.pipcost!==0||!/Attack|LifeTap/.test(card.type))){
  assert.equal(spellEffect(effects,other).quickAttack,false);
  assert.equal(effectDuration(effects,other),effects.bases[effects.cards[other.key].base].duration);
 }
});
test('loaded atlas subjects retain meteor mist, vine curves and sword geometry',()=>{
 for(const [key,operation,minimum] of [['Fire_SingleAttack_Level6','createRadialGradient',10],['Life_SingleAttack_Level2','bezierCurveTo',1],['Ice_SingleAttack_Level6','lineTo',60]]){
  const counts={},c=new Proxy({}, {get:(_,k)=>(...args)=>{counts[k]=(counts[k]||0)+1;return k==='createRadialGradient'?{addColorStop(){}}:undefined;},set:()=>true});
  let subjects=0;const fx=createSpellEffects({effects,skillArt:{manifest,drawSubject(){subjects++;return true;}}});
  const card=Object.values(cards).find(card=>effects.cards[card.key].base===key);assert.ok(card,key);
  fx.draw(c,{card,progress:.58,from:{x:130,y:290},to:{x:690,y:290},center:{x:410,y:290},width:900,height:440});
  assert.equal(subjects,1);assert.ok(counts[operation]>=minimum,`${key}: ${operation}=${counts[operation]}`);
 }
});
test('elemental drawing remains deterministic and reduced motion suppresses moving layers',()=>{
 const commands=[];const c=new Proxy({}, {get:(_,k)=>(...args)=>{commands.push([k,...args]);return k==='createRadialGradient'?{addColorStop(){}}:undefined;},set:()=>true});
 const fx=createSpellEffects({effects,skillArt:{manifest,drawSubject(){return true;}}});
 const options={card:cards.Ice_SingleAttack_Level6,progress:.58,from:{x:130,y:290},to:{x:690,y:290},width:900,height:440,seed:4};
 fx.draw(c,options);const normal=commands.length,first=JSON.stringify(commands);commands.length=0;fx.draw(c,options);assert.equal(JSON.stringify(commands),first);
 commands.length=0;fx.draw(c,{...options,reducedMotion:true});assert.ok(commands.length<normal/4);
});
