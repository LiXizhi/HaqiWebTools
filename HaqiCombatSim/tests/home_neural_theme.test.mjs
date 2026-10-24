import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {paintHomeWorldTerrain,paintHomeWorldTerrainSteps} from '../js/view_home_art.js';
import {drawBuilding,buildingVisualBounds} from '../js/view_home_building.js';
import {footprint} from '../js/home_core.js';
import {buildingConnectionMask} from '../js/home_building_core.js';
function context(){
 const trace=[];const gradient={addColorStop(...a){trace.push(['stop',...a]);}};
 const c=new Proxy({}, {get(t,k){if(k==='createLinearGradient'||k==='createRadialGradient')return ()=>gradient;return t[k]??((...a)=>trace.push([k,...a]));},set(t,k,v){t[k]=v;trace.push(['set',k,v]);return true;}});return {c,trace};
}
test('worker-style direct terrain and incremental terrain use identical themed commands',()=>{
 const a=context(),b=context(),rect={x:-380,y:-390,w:700,h:700};
 paintHomeWorldTerrain(a.c,7419,rect,null,null,[],'neural-city');
 for(const _ of paintHomeWorldTerrainSteps(b.c,7419,rect,null,null,[],'neural-city')){}
 assert.deepEqual(a.trace,b.trace);assert.ok(a.trace.some(v=>v.includes('#368b90')));assert.ok(a.trace.some(v=>v.includes('#c0aa72')));
});
test('themed roof uses native material rather than the old timber image and preserves bounds',()=>{
 const catalog=JSON.parse(readFileSync(new URL('../data/adventure/home/catalog.json',import.meta.url))).items;
 const roof=catalog.find(i=>i.id==='build-wood-roof'),themed={...roof,building:{...roof.building,theme:'neural-city'}};
 const object={id:'roof',itemId:roof.id,x:2,y:3};
 assert.deepEqual(buildingVisualBounds(object,roof),buildingVisualBounds(object,themed));
 const {item:a,...plain}=footprint(object,[roof]),{item:b,...skin}=footprint(object,[themed]);assert.deepEqual(plain,skin);
 const {c,trace}=context();drawBuilding(c,themed,object,{width:10,height:10,complete:true});
 assert.ok(!trace.some(v=>v[0]==='drawImage'));assert.ok(trace.some(v=>v.includes('#2f8582')));
});
test('glazed roof tiles are world-aligned and gold trim marks only outer roof edges',()=>{
 const catalog=JSON.parse(readFileSync(new URL('../data/adventure/home/catalog.json',import.meta.url))).items;
 const roof=catalog.find(i=>i.id==='build-wood-roof'),themed={...roof,building:{...roof.building,theme:'neural-city'}};
 const gold=trace=>trace.filter(v=>v[0]==='set'&&v[1]==='fillStyle'&&v[2]==='#d9b45e').length;
 const lone=context(),inner=context();
 drawBuilding(lone.c,themed,{id:'a',itemId:roof.id,x:2,y:3},null,0);
 drawBuilding(inner.c,themed,{id:'b',itemId:roof.id,x:2,y:3},null,15);
 assert.ok(gold(lone.trace)>=3);assert.equal(gold(inner.trace),0);
 const objects=[{id:'r1',itemId:roof.id,x:0,y:0},{id:'r2',itemId:roof.id,x:1,y:0},{id:'r3',itemId:roof.id,x:0,y:1}];
 assert.equal(buildingConnectionMask(objects[0],objects,catalog),2|4);
 assert.equal(buildingConnectionMask(objects[1],objects,catalog),8);
});
