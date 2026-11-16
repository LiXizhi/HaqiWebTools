import test from 'node:test';
import assert from 'node:assert/strict';
import {shopOffer,shopUsable,shopUse,shopProductPage} from '../js/adventure_shop_catalog_core.js';
const save=()=>({level:3,school:'fire',inventory:{100:200,984:100},pets:{},equipment:{}});
const content=()=>({schools:{fire:1},items:{11:{id:11,kind:1,slot:24,stats:{167:14,170:2,169:1}}},balanceParams:{version:'kids'}});
test('catalog usability respects level and school without granting inventory',()=>{
 const s=save(),c=content(),bag={kind:'gear',itemId:11,slot:24,level:1},before=structuredClone(s);
 assert.equal(shopUsable(s,bag,c),true);assert.deepEqual(s,before);
 c.items[11].stats[169]=2;assert.equal(shopUsable(s,bag,c),false);
 assert.equal(shopUsable(s,{kind:'pet',level:4},c),false);
});
test('quotes explain exact shortfall, membership, ownership and real collectible price',()=>{
 const s=save(),c=content(),mount={kind:'mount',itemId:22,level:1,currency:984,price:50000};
 assert.equal(shopOffer(s,mount,c).reason,'还差 49900 魔豆');
 assert.equal(shopOffer(s,mount,c).price,50000);
 assert.equal(shopOffer(s,{...mount,vipOnly:true},c).reason,'会员专属');
 s.inventory[22]=1;assert.equal(shopOffer(s,mount,c).reason,'已拥有');
 assert.equal(shopOffer(s,{...mount,currency:123},c).canBuy,false);
 assert.equal(shopOffer(s,{...mount,price:NaN},c).canBuy,false);
});
test('food quantities require whole counts and each category names its actual use destination',()=>{
 const s=save(),c=content(),food={kind:'supply',itemId:990001,level:1};
 for(const count of [0,-1,1.5,1000,Infinity])assert.equal(shopOffer(s,food,c,{count}).canBuy,false);
 assert.equal(shopOffer(s,food,c,{count:2}).canBuy,true);
 assert.equal(shopUse(food,c).panel,'pet');
 assert.equal(shopUse({kind:'pet'},c).panel,'pet');
 assert.equal(shopUse({kind:'mount'},c).panel,'pet');
 assert.equal(shopUse({kind:'mount'},c).options.tab,'mount');
 assert.equal(shopUse(food,c).options.tab,'follow');
 assert.match(shopUse(food,c).purpose,/40.*100/);
 assert.match(shopUse({kind:'mount'},c).purpose,/35%/);
 c.balanceParams.adventure={mountSpeed:1.5};assert.match(shopUse({kind:'mount'},c).purpose,/50%/);
 assert.deepEqual(shopUse({kind:'gear',slot:24,itemId:24014},c),{panel:'equipment',options:{itemId:24014},label:'去装备卡包',purpose:'装备卡包后调整可携带卡牌与同卡张数'});
 const gearUse=shopUse({kind:'gear',slot:2,itemId:123},c);
 assert.equal(gearUse.panel,'equipment');assert.deepEqual(gearUse.options,{itemId:123});assert.equal(gearUse.label,'去穿戴装备');
});
test('product deep links locate later pages and do not select unrelated filtered goods',()=>{
 const rows=Array.from({length:22},(_,i)=>({id:String(i)}));
 assert.equal(shopProductPage(rows,'18',9),2);
 assert.equal(shopProductPage(rows,'missing',9),null);
 assert.equal(shopProductPage(rows,'0',9),0);
});
