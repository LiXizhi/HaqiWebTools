import test from 'node:test';
import assert from 'node:assert/strict';
import {CardRenderer} from '../js/card_renderer.js';
test('shared card renderer draws graphic corners and keeps only values as corner text',()=>{
 const texts=[],circles=[],commands=[];let depth=0;
 const ctx=new Proxy({}, {get:(_,key)=>{
  if(key==='save')return ()=>depth++;
  if(key==='restore')return ()=>depth--;
  if(key==='createRadialGradient')return ()=>({addColorStop(){}});
  if(key==='measureText')return text=>({width:text.length*10});
  if(key==='fillText')return (...args)=>texts.push(args);
  if(key==='arc')return (...args)=>circles.push(args);
  return (...args)=>commands.push([key,...args]);
 },set:()=>true});
 const renderer=new CardRenderer({images:new Map([['frame:fire',{}]]),effects:{cards:{trap:{base:'trap',name:'烈火陷阱',variant:{rank:'normal'}}},variantAuras:{normal:{}}},drawSubject:()=>true});
 renderer.draw(ctx,{key:'trap',spellSchool:'fire',type:'Wards',pipcost:114,params:{}},{cooldown:3});
 assert.equal(depth,0);
 for(const [x,y,r] of [[277,28,15],[36,276,19],[267,276,16]])assert.ok(circles.some(a=>a[0]===x&&a[1]===y&&a[2]===r));
 assert.ok(texts.some(([value,x,y])=>value==='X'&&x===277&&y===29));
 assert.ok(texts.some(([value,x,y])=>value==='3'&&x===36&&y===277));
 assert.ok(!texts.some(([value])=>['烈','攻','愈','辅'].includes(value)));
 assert.ok(commands.some(([name])=>name==='bezierCurveTo'),'fire emblem is a flame path');
 assert.ok(commands.some(([name,x,y])=>name==='translate'&&x===267&&y===276),'type emblem occupies its own badge');
 texts.length=0;circles.length=0;renderer.draw(ctx,{key:'trap',spellSchool:'fire'},{backgroundOnly:true});
 assert.equal(texts.length,0);assert.equal(circles.length,0);assert.equal(depth,0);
});
