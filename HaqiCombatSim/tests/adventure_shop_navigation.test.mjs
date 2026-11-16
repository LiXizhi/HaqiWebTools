import test from 'node:test';
import assert from 'node:assert/strict';
import {shopNavigationState,equipmentNavigationState,consumeEquipmentRequest} from '../js/adventure_shop_navigation_core.js';

test('equipment entry selects only owned equipment and bags without changing inventory',()=>{
 const content={items:{12:{id:12,kind:1,slot:2},24:{id:24,kind:8,slot:24},30:{id:30,kind:3,slot:0}}};
 const save={inventory:{12:1,24:1,30:9}},before=structuredClone(save);
 const defaults={tab:'gear',slot:0,page:0,query:'',item:null,guid:null,requestedItem:null};
 assert.deepEqual(equipmentNavigationState({},save,content),defaults);
 for(const itemId of [12,24]){
  const state=equipmentNavigationState({itemId},save,content);
  assert.equal(state.item,itemId);assert.equal(state.requestedItem,itemId);assert.equal(state.slot,content.items[itemId].slot);
  assert.equal(state.guid,null);assert.equal(state.query,'');assert.equal(state.page,0);
 }
 for(const itemId of [30,999])assert.deepEqual(equipmentNavigationState({itemId},save,content),defaults);
 assert.deepEqual(equipmentNavigationState({itemId:12},{inventory:{12:0}},content),defaults);
 assert.deepEqual(save,before);
});

test('equipment explicit request locates its page and is consumed before later redraws',()=>{
 const items=Array.from({length:29},(_,id)=>({id:id+1,kind:1,slot:2}));
 const content={items:Object.fromEntries(items.map(item=>[item.id,item]))};
 const state=equipmentNavigationState({itemId:27},{inventory:{27:1}},content);
 assert.equal(consumeEquipmentRequest(state,items,12),items[26]);
 assert.equal(state.page,2);assert.equal(state.item,27);assert.equal(state.requestedItem,null);
 state.page=0;assert.equal(consumeEquipmentRequest(state,items,12),null);assert.equal(state.page,0);
});

test('equipment removed between navigation and rendering does not open an unrelated item',()=>{
 const state={item:27,guid:'old-instance',page:3,requestedItem:27};
 assert.equal(consumeEquipmentRequest(state,[{id:1}],12),null);
 assert.deepEqual(state,{item:null,guid:null,page:0,requestedItem:null});
 assert.equal(consumeEquipmentRequest(state,[{id:27}],12),null);
});

test('ordinary reopen preserves filters and pagination in a new object',()=>{
 const current={category:'mount',subcategory:2,page:4,query:'凤凰',ownership:'new',school:'fire',selected:'mount:42',showAll:true};
 const next=shopNavigationState(current);assert.deepEqual(next,current);assert.notEqual(next,current);
 assert.deepEqual(shopNavigationState(),{});
 assert.deepEqual(shopNavigationState(current,{subcategory:1}),current);
});

test('food deep link clears old filters without mutating the previous catalog',()=>{
 const current={category:'gear',subcategory:3,page:5,query:'火',ownership:'owned',school:'fire',slot:2,selected:'old',mode:'focused',showAll:false};
 const before=structuredClone(current);
 const next=shopNavigationState(current,{category:'supply',productId:'food:990001'});
 assert.deepEqual(next,{category:'supply',subcategory:0,subcategoryCategory:'supply',page:0,query:'',ownership:'',level:'usable',school:'',slot:'',selected:'food:990001',productId:'food:990001',mode:'catalog',showAll:true});
 assert.deepEqual(current,before);
});

test('bag deep link selects its product and explicit subcategory',()=>{
 const next=shopNavigationState({category:'pet',page:7},{category:'bag',productId:'gear:123',subcategory:2});
 assert.equal(next.category,'bag');assert.equal(next.subcategoryCategory,'bag');assert.equal(next.subcategory,2);
 assert.equal(next.selected,'gear:123');assert.equal(next.productId,'gear:123');assert.equal(next.page,0);
});

test('focused and catalog entry points reset selection and toggle showAll',()=>{
 const current={category:'supply',selected:'old',productId:'old',page:3};
 const focused=shopNavigationState(current,{mode:'focused'});
 assert.equal(focused.mode,'focused');assert.equal(focused.showAll,false);assert.equal(focused.category,'supply');assert.equal(focused.selected,null);assert.equal(focused.productId,null);
 const catalog=shopNavigationState(focused,{mode:'catalog'});
 assert.equal(catalog.mode,'catalog');assert.equal(catalog.showAll,true);
});

test('product-only entry retains category while dropping unrelated selections',()=>{
 const next=shopNavigationState({category:'bag',page:6,query:'old'},{productId:'gear:456'});
 assert.equal(next.category,'bag');assert.equal(next.subcategoryCategory,'bag');assert.equal(next.query,'');assert.equal(next.selected,'gear:456');
});
