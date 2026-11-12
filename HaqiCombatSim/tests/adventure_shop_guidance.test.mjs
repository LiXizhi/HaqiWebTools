import test from 'node:test';
import assert from 'node:assert/strict';
import {shopGuidance,adventureShopSelection} from '../js/adventure_shop_guidance_core.js';
const fresh=()=>({level:1,school:'fire',defaultPocketVersion:1,inventory:{100:25},cards:{},equipment:{},pets:{dragon:{hunger:100}},petFoodSlots:[]});
const content=()=>({schools:{fire:1},items:{11:{id:11,kind:1,slot:24,stats:{167:14,170:2}}},shop:[{id:'food',itemId:990001,kind:'supply',level:1},{id:'bag',itemId:11,kind:'gear',slot:24,level:1}],balanceParams:{version:'kids'}});
function learnCards(s,c,count){c.cardLibrary=Array.from({length:count},(_,i)=>({key:'card'+i,supported:true}));s.cards=Object.fromEntries(c.cardLibrary.map(row=>[row.key,1]));}
test('camp beginners get only immediate needs; complete chapter and other islands retain full catalog',()=>{
 const s=fresh(),c=content();s.zone='camp';c.quests=Array.from({length:14},(_,i)=>({id:i}));
 assert.deepEqual(adventureShopSelection(s,c).rows,[]);
 s.pets.dragon.hunger=5;assert.deepEqual(adventureShopSelection(s,c).rows.map(r=>r.productId),['food']);
 s.petFoodSlots=[{itemId:990001,count:1}];assert.equal(adventureShopSelection(s,c).rows[0].owned,true);assert.equal(adventureShopSelection(s,c).rows[0].productId,undefined);
 learnCards(s,c,6);assert.equal(adventureShopSelection(s,c).rows.length,2);
 s.quests=Object.fromEntries(c.quests.map(q=>[q.id,{claimed:true}]));assert.equal(adventureShopSelection(s,c).active,false);
 s.quests={};s.zone='town';assert.equal(adventureShopSelection(s,c).active,false);
});
test('capacity pressure gets one useful bag goal with real shortfall and no mutations',()=>{
 const s=fresh(),c=content();learnCards(s,c,6);const before=structuredClone({s,c});
 assert.deepEqual(shopGuidance(s,c),{productId:'bag',text:'卡包可装 14 张，同张可带 2 张。',panel:'deck',owned:false,shortfall:20});
 assert.deepEqual({s,c},before);
});
test('empty or partly filled starter pockets never prompt a capacity purchase',()=>{
 for(const count of [0,1,4,5]){const s=fresh(),c=content();learnCards(s,c,count);const advice=shopGuidance(s,c);assert.equal(advice.productId,undefined);assert.equal(advice.text,'现有卡包够用，先试试已有卡牌的搭配。');}
});
test('unsupported and unlearned cards do not create artificial capacity pressure',()=>{
 const s=fresh(),c=content();learnCards(s,c,6);c.cardLibrary[5].supported=false;assert.equal(shopGuidance(s,c).productId,undefined);
 c.cardLibrary[5].supported=true;delete s.cards.card5;assert.equal(shopGuidance(s,c).productId,undefined);
});
test('extra same-card copies require an already learned supported spell',()=>{
 const s=fresh(),c=content();c.items[11].stats={167:10,170:3};learnCards(s,c,0);assert.equal(shopGuidance(s,c).productId,undefined);
 learnCards(s,c,1);assert.equal(shopGuidance(s,c).productId,'bag');c.cardLibrary[0].supported=false;assert.equal(shopGuidance(s,c).productId,undefined);
 // Legacy chapter copies are stock rather than learned qualifications.
 delete c.cardLibrary;c.learn={fire:[{key:'card0'}]};assert.equal(shopGuidance(s,c).productId,undefined);
 s.cards.card0=3;assert.equal(shopGuidance(s,c).productId,'bag');
});
test('hungry pets use stocked food before recommending another purchase',()=>{
 const s=fresh(),c=content();s.pets.dragon.hunger=10;
 assert.equal(shopGuidance(s,c).productId,'food');
 s.petFoodSlots=[{itemId:990001,count:2}];assert.equal(shopGuidance(s,c).productId,undefined);assert.equal(shopGuidance(s,c).panel,'pet');
});
test('owned upgrade directs to existing equipment workflow; equipped bag is not resold',()=>{
 const s=fresh(),c=content();s.inventory[11]=1;
 assert.equal(shopGuidance(s,c).owned,true);assert.equal(shopGuidance(s,c).shortfall,0);
 s.equipment[24]=11;assert.equal(shopGuidance(s,c).productId,undefined);
});
test('never recommends premium, retired, overlevel, wrong-school or tradeoff bags',()=>{
 for(const change of [{vipOnly:true},{retired:true},{currency:984},{level:2}]){const c=content(),s=fresh();learnCards(s,c,6);Object.assign(c.shop[1],change);assert.equal(shopGuidance(s,c).productId,undefined);}
 const c=content();c.items[11].stats[170]=1;assert.equal(shopGuidance(fresh(),c).productId,undefined);
 const wrongSchool=content();wrongSchool.items[11].stats[169]=2;assert.equal(shopGuidance(fresh(),wrongSchool).productId,undefined);
});

