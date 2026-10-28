import test from 'node:test';
import assert from 'node:assert/strict';
import {homeComprehensionChoices,homeComprehensionAnswer,homeComprehensionCurrent} from '../js/home_comprehension_core.js';
import {HOME_BODY_PARTS,HOME_BODY_ITEM} from '../js/home_body_parts_core.js';
test('body comprehension needs the correct part on a real picture, never a generic furniture click',()=>{
 const objects=[{id:'picture',itemId:HOME_BODY_ITEM}],actions=[{kind:'find',objectId:'picture'}];
 for(const part of HOME_BODY_PARTS){
  const choices=homeComprehensionChoices([HOME_BODY_ITEM],objects,actions,null,part);
  assert.equal(choices.decoys.length,8);
  assert.ok(homeComprehensionAnswer(choices,{kind:'find',objectId:'picture',part},objects));
  for(const wrong of HOME_BODY_PARTS.filter(w=>w!==part))assert.equal(homeComprehensionAnswer(choices,{kind:'find',objectId:'picture',part:wrong},objects),false);
  assert.equal(homeComprehensionAnswer(choices,{kind:'find',objectId:'picture'},objects),false);
  assert.equal(homeComprehensionAnswer(choices,{kind:'find',objectId:'other',part},objects),false);
  assert.equal(homeComprehensionCurrent(choices,[{id:'picture',itemId:'book'}]),false);
  assert.equal(homeComprehensionCurrent(choices,[]),false);
 }
 assert.equal(homeComprehensionChoices(['book'],[{id:'picture',itemId:'book'}],actions,null,'eye'),null);
 assert.equal(homeComprehensionChoices([HOME_BODY_ITEM],objects,actions,null,'face'),null);
 assert.equal(homeComprehensionChoices([HOME_BODY_ITEM],objects,actions,['red'],'eye'),null);
});
