import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createSpellEffects} from '../js/spell_effects.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url)));
const effects=read('data/adventure/spell-effects.json'),manifest=read('data/adventure/skill-art.json'),cards=read('data/kids/cards.json');
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
