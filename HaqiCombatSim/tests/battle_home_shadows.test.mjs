import test from 'node:test';
import assert from 'node:assert/strict';
import {collectHomeWorldTrees,paintHomeTreeShadows,drawHomeWorldTree} from '../js/view_home_art.js';
import {paintStaticShadows} from '../js/adventure_shadows.js';
function recorder(){const calls=[];return {calls,c:new Proxy({}, {get:(_,key)=>(...args)=>{calls.push([key,...args]);if(key==='createRadialGradient')return {addColorStop:(...args)=>calls.push(['stop',...args])};},set:()=>true})};}
test('home terrain bakes the exact outdoor soft shadows, including negative tiles',()=>{
 const rect={x:-2000,y:-2000,w:4000,h:4000},trees=collectHomeWorldTrees(73,rect);assert.ok(trees.length);
 const a=recorder(),b=recorder();paintHomeTreeShadows(a.c,73,rect);
 paintStaticShadows(b.c,{trees:trees.map(t=>({x:t.wx,y:t.wy,size:t.size}))},rect);
 assert.deepEqual(a.calls,b.calls);
 const tree=trees.find(t=>t.wx>rect.x+100&&t.wx<rect.x+rect.w-100&&t.wy>rect.y+100&&t.wy<rect.y+rect.h-100);
 const blocked=[{x:tree.tx-.5,y:tree.ty-.5}];assert.ok(!collectHomeWorldTrees(73,rect,blocked).some(t=>t.wx===tree.wx&&t.wy===tree.wy));
 const removed=recorder();paintHomeTreeShadows(removed.c,73,rect,blocked);assert.ok(removed.calls.length<a.calls.length);
 const sprite=recorder();let draws=0;drawHomeWorldTree(sprite.c,tree,0,0,1,{draw(){draws++;}});assert.equal(draws,1);
 assert.ok(!sprite.calls.some(([name])=>['arc','ellipse','fill','createRadialGradient'].includes(name)),'sprite pass must not redraw baked shadows');
});
