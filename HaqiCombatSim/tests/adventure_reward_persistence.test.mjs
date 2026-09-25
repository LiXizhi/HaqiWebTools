import test from 'node:test';
import {createRuntimeStore} from '../js/adventure_runtime_store.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {createAdventure,applyAction} from '../js/adventure_core.js';
import {createRoleStore} from '../js/adventure_roles.js';
import {persistReward} from '../js/adventure_reward_persistence.js';
import {makeCloudSnapshot,parseCloudSnapshot} from '../js/adventure_cloud_core.js';
import {tickCheckin} from '../js/adventure_checkin_core.js';
import {installDragonTotemItems} from '../js/adventure_progression_bonuses_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../data/'+p,import.meta.url)));
const {content,dataset}=installExpansion(read('adventure/chapter.json'),read('adventure/combat.json'),read('adventure/pets.json'),read('adventure/shop-candidates.json'),read('kids/cards.json'),read('kids/charms.json'));
content.magicStar=read('adventure/magic-star.json');content.checkinConfig=read('adventure/checkin.json');Object.assign(content.items,content.checkinConfig.items);
const now=Date.parse('2026-09-21T04:00:00Z'),access={keepworkVip:true,expiresAt:'2027-09-21',now};
content.progressionBonuses=read('adventure/progression-bonuses.json');
installDragonTotemItems(content);
test('totem choice rolls back failed persistence and survives local and cloud reload',()=>{
 const h=harness(),save=h.store.catalog.roles[0].save,scoped=h.store.scoped(),before=JSON.stringify(save);
 const action={type:'choose-totem',professionId:50351};
 assert.throws(()=>persistReward(save,content,action,{}, {getItem:scoped.getItem,setItem:()=>{throw Error('quota');}}),/quota/);
 assert.equal(JSON.stringify(save),before);
 const next=persistReward(save,content,action,{},scoped).save;
 assert.equal(h.open().catalog.roles[0].save.inventory[50351],1);
 const snapshot=makeCloudSnapshot(next,content,dataset,new Date(now).toISOString(),id);
 assert.equal(parseCloudSnapshot(JSON.stringify(snapshot),content,dataset).save.inventory[50351],1);
});
for(const [id,item] of Object.entries(content.progressionBonuses.giftItems))content.items[id]??=item;
test('real pocket pool persists one gift, rolls back failed storage and rejects stale tabs',()=>{
 const h=harness(),second=h.open(),save=h.store.catalog.roles[0].save,before=JSON.stringify(save);
 const action={type:'magic-star-claim',rewardId:'pocket'},scoped=h.store.scoped();
 assert.throws(()=>persistReward(save,content,action,access,{getItem:scoped.getItem,setItem:()=>{throw Error('quota');}}),/quota/);
 assert.equal(JSON.stringify(save),before);
 const next=persistReward(save,content,action,access,scoped).save;
 assert.equal(next.magicStarClaims.pocket.used,1);
 assert.equal(content.progressionBonuses.gifts.reduce((sum,row)=>sum+(next.inventory[row.itemId]||0)-(save.inventory[row.itemId]||0),0),1);
 assert.throws(()=>persistReward(second.catalog.roles[0].save,content,action,access,second.scoped()),/其他页面/);
 const loaded=h.open().catalog.roles[0].save;assert.deepEqual(loaded,next);
 const cloud=makeCloudSnapshot(next,content,dataset,new Date(now).toISOString(),id);
 assert.deepEqual(parseCloudSnapshot(JSON.stringify(cloud),content,dataset).save.magicStarClaims,next.magicStarClaims);
});
const weekly={type:'magic-star-claim',rewardId:'weekly'},id='12345678-1234-1234-1234-123456789abc';
function harness(){const runtimeStore=createRuntimeStore({indexedDB:null}),data=new Map();const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};const open=()=>{const store=createRoleStore({content,dataset,storage,runtimeStore,uuid:()=>id,now:()=>now});store.open('test');return store;};const store=open();store.create(createAdventure(content));return {storage,store,open};}
test('weekly and staff claim records survive real role-store reload and cloud roundtrip',()=>{
 const h=harness();let save=h.store.catalog.roles[0].save;
 save=persistReward(save,content,weekly,access,h.store.scoped()).save;
 save=persistReward(save,content,{type:'magic-star-claim',rewardId:'1290'},access,h.store.scoped()).save;
 const reloaded=h.open().catalog.roles[0].save;
 assert.equal(reloaded.inventory[17213],1200);assert.deepEqual(reloaded.magicStarClaims,save.magicStarClaims);
 assert.throws(()=>applyAction(reloaded,content,weekly,access),/本周/);
 assert.throws(()=>applyAction(reloaded,content,{type:'magic-star-claim',rewardId:'1290'},access),/已经/);
 const cloud=makeCloudSnapshot(save,content,dataset,new Date(now).toISOString(),id);
 const restored=parseCloudSnapshot(JSON.stringify(cloud),content,dataset).save;
 assert.deepEqual(restored.magicStarClaims,save.magicStarClaims);
 assert.throws(()=>applyAction(restored,content,weekly,{...access,now:now+86400000}),/本周/);
 applyAction(restored,content,weekly,{...access,now:now+7*86400000});assert.equal(restored.inventory[17213],2400);
});
test('daily ordinary and VIP claims plus online time survive role reload',()=>{
 const h=harness();let save=h.store.catalog.roles[0].save;tickCheckin(save,now,60001);
 save=persistReward(save,content,{type:'checkin',now,index:0},access,h.store.scoped()).save;
 save=persistReward(save,content,{type:'checkin',now,index:0,bonus:true},access,h.store.scoped()).save;
 const reloaded=h.open().catalog.roles[0].save;
 assert.deepEqual(reloaded.checkin,save.checkin);assert.equal(reloaded.inventory[17213],400);
 for(const bonus of [false,true])assert.throws(()=>applyAction(reloaded,content,{type:'checkin',now,index:0,bonus},access),/已经/);
});
test('failed storage write does not grant rewards or consume claim; retry grants exactly once',()=>{
 const h=harness(),save=h.store.catalog.roles[0].save,before=JSON.stringify(save);
 const scoped=h.store.scoped(),broken={getItem:scoped.getItem,setItem:()=>{throw Error('quota');}};
 assert.throws(()=>persistReward(save,content,weekly,access,broken),/quota/);assert.equal(JSON.stringify(save),before);
 const next=persistReward(save,content,weekly,access,scoped).save;
 assert.equal(next.inventory[17213],1200);assert.throws(()=>persistReward(next,content,weekly,access,scoped),/本周/);
});
test('stale second tab cannot persist another grant; reload observes claimed state',()=>{
 const h=harness(),second=h.open(),stale=second.catalog.roles[0].save,before=JSON.stringify(stale);
 persistReward(h.store.catalog.roles[0].save,content,weekly,access,h.store.scoped());
 assert.throws(()=>persistReward(stale,content,weekly,access,second.scoped()),/其他页面/);assert.equal(JSON.stringify(stale),before);
 assert.throws(()=>applyAction(h.open().catalog.roles[0].save,content,weekly,access),/本周/);
});
