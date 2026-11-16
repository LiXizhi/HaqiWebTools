import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {shopOffer,shopOwned} from '../js/adventure_shop_catalog_core.js';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {installMountCatalog} from '../js/adventure_mounts_core.js';
import {installNpcCatalog} from '../js/adventure_npc_core.js';
import {createAdventure,applyAction} from '../js/adventure_core.js';
import {FOOD_ID,productPrice,nutritionStock} from '../js/adventure_pets_core.js';
import {persistReward} from '../js/adventure_reward_persistence.js';
import {createRoleStore} from '../js/adventure_roles.js';
import {createRuntimeStore} from '../js/adventure_runtime_store.js';

const read=p=>JSON.parse(fs.readFileSync(new URL('../data/'+p,import.meta.url)));
const {content,dataset}=installExpansion(read('adventure/chapter.json'),read('adventure/combat.json'),read('adventure/pets.json'),read('adventure/shop-candidates.json'),read('kids/cards.json'),read('kids/charms.json'));
installNpcCatalog(content,read('adventure/npc-catalog.json'));
installMountCatalog(content,read('adventure/mount-catalog.json'));
const food=content.shop.find(row=>row.itemId===FOOD_ID);
const mount=content.shop.find(row=>row.kind==='mount'&&row.currency===984&&!row.vipOnly&&row.price>0&&row.price<10000);
function fresh(){const save=createAdventure(content,{seed:812});save.level=60;save.inventory[100]=1000000;save.inventory[984]=1000000;return save;}
function unchangedFailure(save,action,pattern){const before=structuredClone(save);assert.throws(()=>applyAction(save,content,action),pattern);assert.deepEqual(save,before);}

test('invalid quantities cannot debit wallets, grant goods or append transactions',()=>{
 for(const count of [0,-1,1.5,1000,NaN,Infinity,'2',Number.MAX_SAFE_INTEGER]){
  unchangedFailure(fresh(),{type:'buy',productId:food.id,count},/数量/);
 }
});
test('exact food balance purchases the requested quantity and the next purchase is atomic',()=>{
 const save=fresh(),cost=productPrice(food,content),before=nutritionStock(save);
 save.inventory[100]=cost*3;
 applyAction(save,content,{type:'buy',productId:food.id,count:3});
 assert.equal(save.inventory[100],0);assert.equal(nutritionStock(save),before+3);
 assert.equal(save.transactions.length,1);assert.equal(save.transactions[0].cost,cost*3);
 unchangedFailure(save,{type:'buy',productId:food.id},/奇豆不足/);
});
test('mount debits only magic beans and cannot be charged again when already owned',()=>{
 const save=fresh(),beans=save.inventory[984],coins=save.inventory[100];
 applyAction(save,content,{type:'buy',productId:mount.id});
 assert.equal(save.inventory[984],beans-mount.price);assert.equal(save.inventory[100],coins);
 assert.equal(save.inventory[mount.itemId],1);
 unchangedFailure(save,{type:'buy',productId:mount.id},/已经拥有|已拥有/);
});
test('magic bean shortage cannot be covered implicitly by ordinary coins',()=>{
 const save=fresh();save.inventory[984]=mount.price-1;
 unchangedFailure(save,{type:'buy',productId:mount.id},/魔豆不足/);
});
test('pet purchase is unique and invalid bulk gear purchases cannot mutate the save',()=>{
 const save=fresh(),pet=content.shop.find(row=>row.kind==='pet'&&!row.vipOnly&&!Object.values(save.pets).some(p=>p.speciesId===row.petId)),gear=content.shop.find(row=>row.kind==='gear'&&!row.vipOnly&&!row.isInternalTest);
 applyAction(save,content,{type:'buy',productId:pet.id});
 unchangedFailure(save,{type:'buy',productId:pet.id},/已经拥有/);
 unchangedFailure(save,{type:'buy',productId:gear.id,count:2},/数量/);
});
test('rejected persistence leaves the live purchase untouched; one retry commits one order',()=>{
 const save=fresh(),before=structuredClone(save),request={type:'buy',productId:food.id,count:3};
 assert.throws(()=>persistReward(save,content,request,{}, {getItem:()=>null,setItem:()=>{throw Error('quota');}}),/quota/);
 assert.deepEqual(save,before);
 const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
 const next=persistReward(save,content,request,{},storage).save;
 assert.equal(next.transactions.length,before.transactions.length+1);
 assert.equal(next.inventory[100],before.inventory[100]-productPrice(food,content)*3);
 assert.deepEqual(save,before);
});
test('two role-store tabs cannot commit the same stale balance twice',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)},runtimeStore=createRuntimeStore({indexedDB:null});
 const open=()=>{const store=createRoleStore({content,dataset,storage,runtimeStore,uuid:()=> '12345678-1234-1234-1234-123456789abc',now:()=>Date.parse('2026-11-14T00:00:00Z')});store.open('shop-regression');return store;};
 const first=open();first.create(fresh());const second=open(),stale=second.catalog.roles[0].save,before=structuredClone(stale),request={type:'buy',productId:food.id};
 persistReward(first.catalog.roles[0].save,content,request,{},first.scoped());
 assert.throws(()=>persistReward(stale,content,request,{},second.scoped()),/其他页面/);
 assert.deepEqual(stale,before);assert.equal(open().catalog.roles[0].save.transactions.length,1);
});

test('real catalog quotes charge their stated wallet and grant ownership',t=>{
 let checked=0;
 for(const item of content.shop.filter(row=>!row.retired&&!row.isInternalTest)){
  const save=fresh(),quote=shopOffer(save,item,content,{isVip:true});
  if(!quote.canBuy)continue;
  checked++;
  const before={100:save.inventory[100],984:save.inventory[984]};
  applyAction(save,content,{type:'buy',productId:item.id},{keepworkVip:true});
  assert.equal(save.inventory[quote.currency],before[quote.currency]-quote.price,item.id);
  const other=quote.currency===100?984:100;
  assert.equal(save.inventory[other],before[other],item.id);
  if(item.kind!=='supply')assert.equal(shopOwned(save,item),true,item.id);
 }
 assert.ok(checked>0);t.diagnostic(`Verified ${checked} real purchasable catalog entries`);
});

test('pet uniqueness includes unloaded owned summaries but preserves distinct related species',()=>{
 const save=fresh(),first=content.shop.find(row=>row.kind==='pet'&&row.petId==='dragon_green2');
 assert.ok(first,'actual second green dragon catalog entry is present');
 applyAction(save,content,{type:'buy',productId:first.id},{keepworkVip:true});
 const [key,pet]=Object.entries(save.pets).find(([,pet])=>pet.speciesId===first.petId);
 save.petFileRefs={[key]:{group:'pets',summary:structuredClone(pet)}};delete save.pets[key];
 assert.equal(shopOwned(save,first),true);
 unchangedFailure(save,{type:'buy',productId:first.id},/已经拥有/);
 const related=content.shop.find(row=>row.kind==='pet'&&row.petId.startsWith('dragon_')&&!shopOwned(save,row));
 assert.ok(related);applyAction(save,content,{type:'buy',productId:related.id},{keepworkVip:true});
 assert.equal(shopOwned(save,related),true);assert.equal(shopOwned(save,first),true);
});

