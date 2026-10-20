import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {initializeHomeResidents,homeResidentPets,validateHomePart} from '../js/home_core.js';
const records=Object.fromEntries(Array.from({length:10},(_,i)=>[`p${i}`,{id:`p${i}`} ]));
test('home initially places only the first six pets and preserves legacy positions',()=>{
 const residents=initializeHomeResidents({},records,42);
 assert.deepEqual(homeResidentPets(records,residents).map(p=>p.id),Object.keys(records).slice(0,6));
 const migrated=initializeHomeResidents({p9:{x:9,y:8}},records,42);
 assert.deepEqual(migrated.p9,{x:9,y:8});assert.equal(homeResidentPets(records,migrated).length,7);
 assert.deepEqual(initializeHomeResidents({}, {},42),{$selection:{version:1}});
});
test('recalling all pets survives serialization, reorder and newly acquired pets without repopulating',()=>{
 const residents=initializeHomeResidents({},records,42);
 for(const p of homeResidentPets(records,residents))delete residents[p.id];
 const restored=validateHomePart('residents',JSON.parse(JSON.stringify(residents)),[]);
 const reordered={new:{id:'new'},...Object.fromEntries(Object.entries(records).reverse())};
 assert.equal(homeResidentPets(reordered,initializeHomeResidents(restored,reordered,42)).length,0);
 restored.p9={x:1,y:2};assert.deepEqual(homeResidentPets(records,restored),[records.p9]);
 assert.throws(()=>validateHomePart('residents',{$selection:{version:2}},[]));
});
const app=readFileSync(new URL('../js/home_app.js',import.meta.url),'utf8');
function fixture(){
 let data=initializeHomeResidents({},records,42),fail=false;
 const context={check(){},home:{id:'h'},pending:null,mutation:Promise.resolve(),parts:{residents:data},pets:homeResidentPets(records,data),wish:{petId:'p0'},selection:null,preview:null,status:'',catalog:{items:[]},getContext:()=>({save:{}}),ownedPetRecords:()=>records,showRetry(){},emit(){},wishFeedback(){},roster(){context.pets=homeResidentPets(records,context.parts.residents);},store:{async mutate(id,keys,fn){if(fail)throw Error('disk');const copy=structuredClone(data);fn({}, {residents:copy});data=copy;return {home:{id},data:{residents:copy}};}}};
 vm.runInNewContext(app.slice(app.indexOf(' async function savePetPlacement('),app.indexOf(' async function sync()')),context);
 return {context,fail:value=>fail=value};
}
test('controller drag in and recall update residents only after saving, clear wishes and retain failed operation for retry',async()=>{
 const {context:c,fail}=fixture();
 await c.savePetPlacement('p9',{x:4,y:5});assert.ok(c.pets.some(p=>p.id==='p9'));
 await c.savePetPlacement('p0',null);assert.equal(c.pets.some(p=>p.id==='p0'),false);assert.equal(c.wish,null);
 fail(true);await assert.rejects(c.savePetPlacement('p9',null),/disk/);assert.ok(c.pets.some(p=>p.id==='p9'));assert.equal(typeof c.pending,'function');
 fail(false);const retry=c.pending;c.pending=null;await retry();assert.equal(c.pets.some(p=>p.id==='p9'),false);
 await assert.rejects(c.savePetPlacement('not-owned',{x:0,y:0}),/背包/);
});
const view=readFileSync(new URL('../js/view_home.js',import.meta.url),'utf8');
test('scene pointer release recalls onto the open backpack or dock and otherwise places the pet',()=>{
 const handler=view.slice(view.indexOf('  canvas.onpointerup=e=>{'),view.indexOf('  const cancelPointer='));
 for(const target of ['bag','dock','ground']){
  const calls=[],context={paintStroke:null,canvas:{hasPointerCapture:()=>false,getBoundingClientRect:()=>({width:800,height:600})},gesture:{id:1,moved:true,hit:{kind:'pet',id:'p0'}},position:()=>({}),run:fn=>fn(),document:{elementFromPoint:()=>target},body:{dataset:{drawer:'pets'}},side:{contains:t=>t==='bag'},dock:{children:[null,null,{contains:t=>t==='dock'}]},petDragPoint:()=>({x:400,y:300}),model:{camera:{x:0,y:0},scale:40},cb:{recallPet:id=>calls.push(['recall',id]),drop:hit=>calls.push(['place',hit.id])}};
  vm.runInNewContext(handler,context);context.canvas.onpointerup({pointerId:1,clientX:20,clientY:30});
  assert.deepEqual(calls,[[target==='ground'?'place':'recall','p0']]);
 }
});
