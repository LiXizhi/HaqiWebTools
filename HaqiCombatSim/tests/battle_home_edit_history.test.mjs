import test from 'node:test';
import assert from 'node:assert/strict';
import {homeEditDelta,applyHomeEditDelta,createHomeEditHistory} from '../js/home_edit_history_core.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const block=(x=0)=>({id:'a',itemId:'floor',x,y:0});
test('object deltas undo replacement, moved children and cross-chunk edits without rewinding practice',()=>{
 const before={'chunk:0,0':{a:block(),child:{id:'child',parentId:'a',x:1,y:0}},'chunk:1,0':{},'local:practice':{}};
 const after={'chunk:0,0':{},'chunk:1,0':{a:block(32),child:{id:'child',parentId:'a',x:33,y:0}},'local:practice':{receipt:{done:true}},'receipt:r':{completed:true}};
 const changes=homeEditDelta(before,after),parts=structuredClone(after);
 applyHomeEditDelta(parts,changes,true);
 assert.deepEqual(parts['chunk:0,0'],before['chunk:0,0']);assert.deepEqual(parts['chunk:1,0'],{});
 assert.deepEqual(parts['local:practice'],after['local:practice']);assert.equal(parts['receipt:r'].completed,true);
 applyHomeEditDelta(parts,changes);assert.deepEqual(parts,after);
});
test('one stroke merges many placements into one undo and keeps the original replaced object',()=>{
 const history=createHomeEditHistory();let parts={'chunk:0,0':{a:block()}},original=structuredClone(parts);
 for(let n=1;n<=5;n++){const next={'chunk:0,0':{a:block(n)}};history.record(homeEditDelta(parts,next),'stroke');parts=next;}
 const entry=history.peek(true);applyHomeEditDelta(parts,entry.changes,true);history.finish(true);
 assert.deepEqual(parts,original);assert.deepEqual(history.state(),{canUndo:false,canRedo:true});
 applyHomeEditDelta(parts,history.peek(false).changes);history.finish(false);assert.equal(parts['chunk:0,0'].a.x,5);
});
test('conflicts fail before any changes, and failed saves leave the history cursor intact',()=>{
 const history=createHomeEditHistory(),before={'chunk:0,0':{}},after={'chunk:0,0':{a:block(),b:{...block(2),id:'b'}}};
 history.record(homeEditDelta(before,after));const changed=structuredClone(after);changed['chunk:0,0'].b.x=8;
 assert.throws(()=>applyHomeEditDelta(changed,history.peek(true).changes,true),/已变化/);
 assert.deepEqual(changed['chunk:0,0'].a,block());assert.equal(history.state().canUndo,true);
 assert.throws(()=>applyHomeEditDelta({},history.peek(true).changes,true),/尚未加载/);
});
test('new successful edits clear redo; empty edits do not; session reset and history limits work',()=>{
 const history=createHomeEditHistory(2),before={'chunk:0,0':{}},after={'chunk:0,0':{a:block()}},delta=homeEditDelta(before,after);
 history.record(delta);history.finish(true);history.record([]);assert.equal(history.state().canRedo,true);
 history.record(delta);assert.equal(history.state().canRedo,false);
 history.record(delta);history.record(delta);history.finish(true);history.finish(true);assert.equal(history.state().canUndo,false);
 history.clear();assert.deepEqual(history.state(),{canUndo:false,canRedo:false});
});
import {createHomeEditKeyHandler} from '../js/home/view_home_scene_input.js';
test('editing shortcuts support control and command while preserving text fields, dialogs and repeat safety',()=>{
 const calls=[];
 const editKey=createHomeEditKeyHandler({
  modal:{querySelector:()=>false},
  getModel:()=>({home:{},build:true}),
  cancelScenePointer:()=>{},
  run:fn=>fn(),
  cb:{undo:()=>calls.push('undo'),redo:()=>calls.push('redo')},
  onToggleGrid:()=>{},
 });
 const event=(key,extra={})=>({key,ctrlKey:true,preventDefault(){},stopPropagation(){},target:{closest:()=>false},...extra});
 editKey(event('z'));editKey(event('y'));editKey(event('Z',{ctrlKey:false,metaKey:true,shiftKey:true}));
 assert.deepEqual(calls,['undo','redo','redo']);
 editKey(event('z',{repeat:true}));editKey(event('z',{target:{closest:()=>true}}));
 const openModalKey=createHomeEditKeyHandler({modal:{querySelector:()=>true},getModel:()=>({home:{},build:true}),cancelScenePointer:()=>{},run:fn=>fn(),cb:{undo:()=>calls.push('undo'),redo:()=>calls.push('redo')},onToggleGrid:()=>{}});
 openModalKey(event('z'));
 assert.equal(calls.length,3);
});
test('restoring a solid object cannot trap a character and leaves the original scene untouched',()=>{
 const before={'chunk:0,0':{a:block()}},after={'chunk:0,0':{}},catalog=[{id:'floor',size:[1,1],layer:'solid'}];
 assert.throws(()=>applyHomeEditDelta(after,homeEditDelta(before,after),true,{catalog,actors:[{x:.5,y:.5}]}),/这里有角色/);
 assert.deepEqual(after,{'chunk:0,0':{}});
});
