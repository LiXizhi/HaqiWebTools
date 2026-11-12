import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../js/view_adventure_shop.js',import.meta.url),'utf8');
const start=source.indexOf('        catalog.hidden=focused'),end=source.indexOf("        catalog.querySelector('.shop-toolbar')",start);
const apply=source.slice(start,end);
function node(){const classes=new Set();return {dataset:{},classes,classList:{toggle(name,on){on?classes.add(name):classes.delete(name);}}};}
test('empty focused supplies removes the catalogue and centers its use card',()=>{const catalog={},layout=node(),modal=node();vm.runInNewContext(apply,{catalog,layout,modal,focused:true,selection:{rows:[]}});assert.equal(catalog.hidden,true);assert.ok(layout.classes.has('shop-layout-empty'));assert.ok(modal.classes.has('shop-modal-focused'));});
test('one and two supplies retain their compact goods region',()=>{for(const count of [1,2]){const catalog={},layout=node(),modal=node();vm.runInNewContext(apply,{catalog,layout,modal,focused:true,selection:{rows:Array(count)}});assert.equal(catalog.hidden,false);assert.equal(layout.dataset.focusedCount,String(count));assert.ok(layout.classes.has('shop-layout-focused'));assert.ok(!layout.classes.has('shop-layout-empty'));}});
test('all goods restores catalogue after an empty focused view',()=>{const catalog={},layout=node(),modal=node(),state={catalog,layout,modal,focused:true,selection:{rows:[]}};vm.runInNewContext(apply,state);state.focused=false;vm.runInNewContext(apply,state);assert.equal(catalog.hidden,false);assert.equal(layout.classes.size,0);assert.equal(modal.classes.size,0);assert.equal(layout.dataset.focusedCount,'');});
