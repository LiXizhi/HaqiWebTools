import test from 'node:test';
import assert from 'node:assert/strict';
import {homeComparisonBinding,homeComparisonCurrent} from '../js/home_comparison_core.js';
import {homeGameActionMatches,homeGameObjectMatches} from '../js/home_language_game_core.js';
const objects=['red','red','blue','red'].map((color,i)=>({id:String(i),itemId:'book',color}));
const actions=objects.map(o=>({kind:'find',objectId:o.id}));
test('colour comparisons accept every matching choice, exclude their reference and invalidate changed props',()=>{
 for(const kind of ['same','different']){
  const spec={kind,anchorItemIds:['book'],itemIds:['book']},b=homeComparisonBinding(spec,objects,actions);assert.ok(b);
  assert.equal(b.anchor.id,'0');assert.deepEqual(b.targets.map(o=>o.id),kind==='same'?['1','3']:['2']);
  const game={comparison:b,action:actions[1]};assert.equal(homeGameActionMatches(game,actions[0]),false);
  for(const a of actions.slice(1))assert.equal(homeGameActionMatches(game,a),kind==='same'?a.objectId!=='2':a.objectId==='2');
  assert.ok(homeGameObjectMatches(game,objects));
  assert.equal(homeComparisonCurrent(b,objects.slice(1)),false);
  assert.equal(homeGameObjectMatches(game,objects.map(o=>o.id==='0'?{...o,color:'blue'}:o)),false);
  assert.equal(homeComparisonBinding(spec,objects.filter(o=>o.color==='red'),actions),null);
  assert.equal(homeComparisonBinding(spec,objects.map(o=>({...o,color:undefined})),actions),null);
 }
});


test('size choices use the same rendered model with a clear contrast and invalidate resizing or rotation',()=>{
 const objects=[1,2,.5,1.25,2].map((sizeScale,i)=>({id:String(i),itemId:'book',sizeScale})),actions=objects.map(o=>({kind:'find',objectId:o.id}));
 for(const kind of ['big','small']){
  const spec={kind,anchorItemIds:['book'],itemIds:['book']},b=homeComparisonBinding(spec,objects,actions);assert.ok(b);assert.equal(b.anchor.id,'0');
  assert.deepEqual(b.targets.map(o=>o.id),kind==='big'?['1','4']:['2']);assert.ok(homeComparisonCurrent(b,objects));
  assert.equal(homeComparisonCurrent(b,objects.map(o=>o.id==='1'?{...o,sizeScale:1}:o)),false);
  assert.equal(homeComparisonCurrent(b,objects.map(o=>o.id==='0'?{...o,rotation:1}:o)),false);
  assert.equal(homeComparisonBinding(spec,objects.map(o=>({...o,sizeScale:1})),actions),null);
  assert.equal(homeComparisonBinding(spec,objects.map(o=>o.id==='0'?o:{...o,itemId:'table'}),actions),null);
  assert.equal(homeComparisonBinding(spec,objects.slice(0,3).map((o,i)=>({...o,rotation:i})),actions),null);
 }
});
