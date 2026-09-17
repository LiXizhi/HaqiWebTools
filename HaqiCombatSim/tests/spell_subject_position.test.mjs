import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createSpellEffects} from '../js/spell_effects.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url)));
const effects=read('data/adventure/spell-effects.json'),manifest=read('data/adventure/skill-art.json'),cards=read('data/kids/cards.json');
function fixture(config=effects){
 let xy=[0,0];const stack=[],subjects=[],ellipses=[];
 const ctx=new Proxy({}, {get:(_,key)=>{
  if(key==='save')return ()=>stack.push([...xy]);
  if(key==='restore')return ()=>{xy=stack.pop();};
  if(key==='translate')return (x,y)=>{xy[0]+=x;xy[1]+=y;};
  if(key==='ellipse')return (x,y)=>ellipses.push([xy[0]+x,xy[1]+y]);
  if(key==='createRadialGradient')return ()=>({addColorStop(){}});
  return ()=>{};
 },set:()=>true});
 const fx=createSpellEffects({effects:config,skillArt:{manifest,drawSubject(c,base,x,y,w,h){subjects.push({base,x:xy[0]+x+w/2,y:xy[1]+y+h/2});return true;}}});
 return {ctx,fx,subjects,ellipses};
}
const cardFor=base=>Object.values(cards).find(c=>effects.cards[c.key].base===base);
test('summon and creature subjects stay at arena center throughout attacks in either direction',()=>{
 for(const base of ['Life_SingleAttack_Level6_OutStandingCard','Ice_SingleAttack_Level6','Fire_SingleAttack_Level6','Storm_SingleAttack_Level5'])for(const reverse of [false,true])for(const reducedMotion of [false,true]){
  const f=fixture();for(const progress of [.15,.4,.6,.85])f.fx.draw(f.ctx,{card:cardFor(base),progress,from:{x:reverse?800:180,y:300},to:{x:reverse?180:800,y:260},center:{x:490,y:310},width:1000,height:440,reducedMotion});
  assert.equal(f.subjects.length,4);assert.ok(f.subjects.every(s=>s.x===490));
  assert.ok(f.subjects.every(s=>s.y===f.subjects[0].y));
 }
});
test('area attack shares a single center summon while impacts still reach every target',()=>{
 const base='Life_SingleAttack_Level6_OutStandingCard',config=structuredClone(effects);config.bases[base].area=true;
 const f=fixture(config),targets=[{x:670,y:240},{x:800,y:300},{x:850,y:350}];
 f.fx.draw(f.ctx,{card:cardFor(base),progress:.85,from:{x:180,y:300},to:targets[1],targets,center:{x:490,y:310},width:1000,height:440});
 assert.equal(f.subjects.length,1);assert.equal(f.subjects[0].x,490);
 for(const target of targets)assert.ok(f.ellipses.some(([x,y])=>x===target.x&&y===target.y-52));
 const ordinary=fixture();ordinary.fx.draw(ordinary.ctx,{card:cardFor('Ice_IceGreatShield'),progress:.5,from:{x:180,y:300},to:{x:800,y:300},center:{x:490,y:310},width:1000,height:440});
 assert.equal(ordinary.subjects[0].x,800);
});
