import test from 'node:test';
import assert from 'node:assert/strict';
import {restoreVisibleFocus} from '../js/view_adventure_controls.js';
const target=(options={})=>{const calls=[];return {isConnected:true,disabled:false,getClientRects:()=>[{}],focus:value=>calls.push(value),calls,...options};};
test('closing a dictionary restores its visible opener without scrolling the scene',()=>{
 const opener=target(),world=target();assert.equal(restoreVisibleFocus(opener,world),opener);assert.deepEqual(opener.calls,[{preventScroll:true}]);assert.equal(world.calls.length,0);
});
test('a repainted toolbar replaces its detached opener, but a vanished card returns to the scene',()=>{
 const old=target({isConnected:false}),replacement=target(),world=target();assert.equal(restoreVisibleFocus(old,replacement,world),replacement);assert.equal(old.calls.length,0);assert.equal(restoreVisibleFocus(old,null,world),world);
});
test('hidden or disabled controls cannot steal focus on return',()=>{
 const hidden=target({getClientRects:()=>[]}),disabled=target({disabled:true}),world=target();assert.equal(restoreVisibleFocus(hidden,disabled,world),world);assert.equal(hidden.calls.length+disabled.calls.length,0);assert.equal(restoreVisibleFocus(null,hidden,disabled),null);
});
