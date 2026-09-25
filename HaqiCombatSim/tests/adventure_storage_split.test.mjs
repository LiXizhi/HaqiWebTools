import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installExpansion } from '../js/adventure_expansion_core.js';
import { createAdventure, beginEncounter, recordDecision, parseSave } from '../js/adventure_core.js';
import { addPet, petMaxHp } from '../js/adventure_pets_core.js';
import { createRoleStore } from '../js/adventure_roles.js';
import { createRuntimeStore } from '../js/adventure_runtime_store.js';
import { SAVE_KEY } from '../js/adventure_assets.js';
import { durableSave, runtimeValues, restoreRuntime, coreCatalogKey, splitRoleSave, joinRoleSave } from '../js/adventure_storage_core.js';

const read=path=>JSON.parse(fs.readFileSync(new URL(`../data/${path}`,import.meta.url)));
const {content,dataset}=installExpansion(read('adventure/chapter.json'),read('adventure/combat.json'),read('adventure/pets.json'),read('adventure/shop-candidates.json'),read('kids/cards.json'),read('kids/charms.json'));
const id='12345678-1234-1234-1234-123456789abc';
function harness(){
    const values=new Map(),runtimeStore=createRuntimeStore({indexedDB:null});
    const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
    const make=()=>createRoleStore({content,dataset,storage,runtimeStore,uuid:()=>id,now:()=>1});
    const store=make();store.open('alice');store.create(createAdventure(content));store.markSynced(id,store.checkpoint());
    return {values,storage,runtimeStore,store,make};
}

test('health, hunger, movement, online timers and revision-only changes do not dirty cloud state',()=>{
    const h=harness(),save=JSON.parse(h.store.scoped().getItem(SAVE_KEY));
    save.checkin={version:2,day:20000,onlineMs:1,claimed:[]};
    h.store.scoped().setItem(SAVE_KEY,JSON.stringify(save));h.store.markSynced(id,h.store.checkpoint());
    save.heroHp=3;save.pets.dragon_green.hp=2;save.pets.dragon_green.hunger=7;
    save.careAt=1000;save.careLog=['休息'];save.position.x+=5;save.facing=2;save.checkin.onlineMs=65000;save.revision++;
    h.store.scoped().setItem(SAVE_KEY,JSON.stringify(save));
    assert.equal(h.store.dirty,false);
    const persisted=JSON.parse(h.values.get('haqi.roles.v1.account.alice')).catalog.roles[0].save;
    for(const field of ['heroHp','careAt','position','pendingEncounter'])assert.equal(persisted[field],undefined);
    assert.equal(persisted.pets.dragon_green.hp,undefined);assert.equal(persisted.pets.dragon_green.hunger,undefined);
    assert.equal(persisted.checkin.onlineMs,undefined);
    const reload=h.make();reload.open('alice');
    assert.equal(reload.catalog.roles[0].save.heroHp,3);assert.equal(reload.catalog.roles[0].save.pets.dragon_green.hunger,7);
    assert.equal(reload.catalog.roles[0].save.checkin.onlineMs,65000);
});

test('missing local IndexedDB values default to full vitals and do not dirty the catalog',()=>{
    const h=harness(),save=h.store.catalog.roles[0].save;
    const fresh=createRoleStore({content,dataset,storage:h.storage,runtimeStore:createRuntimeStore({indexedDB:null})});fresh.open('alice');
    const restored=fresh.catalog.roles[0].save;
    assert.equal(restored.heroHp,null);assert.equal(restored.pets.dragon_green.hunger,100);
    assert.equal(restored.pets.dragon_green.hp,petMaxHp(save.pets.dragon_green,content));assert.equal(fresh.dirty,false);
});

test('runtime data is isolated by account and preserved when selecting the same role',()=>{
    const h=harness(),save=JSON.parse(h.store.scoped().getItem(SAVE_KEY));save.heroHp=4;
    h.store.scoped().setItem(SAVE_KEY,JSON.stringify(save));h.store.select(id);assert.equal(h.store.dirty,false);
    h.store.open('bob');h.store.create(createAdventure(content));assert.equal(h.store.catalog.roles[0].save.heroHp,null);
    h.store.open('alice');assert.equal(h.store.catalog.roles[0].save.heroHp,4);
});

test('reconnecting to unchanged cloud core preserves newer local runtime and RNG revision',()=>{
    const h=harness(),remote=structuredClone(h.store.catalog),save=JSON.parse(h.store.scoped().getItem(SAVE_KEY));
    save.revision+=2;save.heroHp=8;save.position.x+=10;
    h.store.scoped().setItem(SAVE_KEY,JSON.stringify(save));assert.equal(h.store.dirty,false);
    h.store.replace(remote,id);
    assert.equal(h.store.catalog.roles[0].save.revision,save.revision);
    assert.equal(h.store.catalog.roles[0].save.heroHp,8);
    assert.deepEqual(h.store.catalog.roles[0].save.position,save.position);

    // Legacy localStorage has not populated IndexedDB yet at first reconnect.
    const values=new Map(),runtimeStore=createRuntimeStore({indexedDB:null});
    beginEncounter(save,content,'trial:1');
    const legacy={schemaVersion:1,activeId:id,roles:[{id,lastPlayedAt:1,save}]};
    values.set('haqi.roles.v1.account.alice',JSON.stringify({catalog:legacy,base:id,dirty:false}));
    const migrated=createRoleStore({content,dataset,runtimeStore,storage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)}});
    migrated.open('alice');migrated.replace(legacy,id);
    assert.deepEqual(migrated.catalog.roles[0].save.pendingEncounter,save.pendingEncounter);
});

test('item consumption and formation changes dirty core state; a runtime tick during sync does not',()=>{
    const h=harness(),save=JSON.parse(h.store.scoped().getItem(SAVE_KEY));save.inventory[100]=(save.inventory[100]||0)+1;
    h.store.scoped().setItem(SAVE_KEY,JSON.stringify(save));assert.equal(h.store.dirty,true);
    const captured=h.store.checkpoint();save.heroHp=1;h.store.scoped().setItem(SAVE_KEY,JSON.stringify(save));
    h.store.markSynced(id,captured);assert.equal(h.store.dirty,false);
    save.heroSlot=1;h.store.scoped().setItem(SAVE_KEY,JSON.stringify(save));assert.equal(h.store.dirty,true);
    h.store.markSynced(id,captured);assert.equal(h.store.dirty,true);
});

test('large collections and transaction histories do not enlarge index state or active battle bag',()=>{
    const save=createAdventure(content),small=splitRoleSave(save);
    // Projection stress fixture: no invented production catalogue entries.
    for(let i=0;i<350;i++)save.pets[`fixture-${i}`]={...save.pets.dragon_green,id:`fixture-${i}`};
    save.transactions=Array.from({length:1000},(_,i)=>({id:i+1,productId:'fixture',cost:i}));
    const large=splitRoleSave(save);
    assert.deepEqual(large.state,small.state);assert.deepEqual(large.battle,small.battle);
    assert.equal(Object.keys(large.items.pets).length,351);assert.equal(large.records.transactions.length,1000);
    assert.equal(JSON.stringify(large.items).includes('hunger'),false);
});

test('switching active pets changes only the battle bag and copies selected pet attributes',()=>{
    const save=createAdventure(content);addPet(save,content,'dragon_purple');const before=splitRoleSave(save);
    save.formation[0]='dragon_purple';save.heroSlot=2;
    const after=splitRoleSave(save);
    assert.deepEqual(after.items,before.items);assert.deepEqual(after.records,before.records);
    assert.deepEqual(Object.keys(after.battle.activePets),['dragon_purple']);
    assert.equal(after.battle.heroSlot,2);assert.equal(after.battle.activePets.dragon_purple.hp,undefined);
    const restored=joinRoleSave(after.state,after,content);assert.doesNotThrow(()=>parseSave(restored,content));
    after.battle.activePets.dragon_purple.xp++;
    assert.throws(()=>joinRoleSave(after.state,after,content),/不一致/);
});

test('existing currency and consumable quantity changes do not rewrite pet collections',()=>{
    const save=createAdventure(content);save.inventory[100]=100;save.inventory[990001]=3;
    const before=splitRoleSave(save);save.inventory[100]+=50;save.inventory[990001]--;
    const after=splitRoleSave(save);
    assert.deepEqual(after.items,before.items);
    assert.equal(after.battle.inventory[100],150);assert.equal(after.battle.inventory[990001],2);
    assert.deepEqual(joinRoleSave(after.state,after,content).inventory,save.inventory);
    after.battle.inventory[999999]=1;
    assert.throws(()=>joinRoleSave(after.state,after,content),/不一致/);
});

test('tolerant join merges primary fields when old part witnesses or distribution drift',()=>{
    const save=durableSave(createAdventure(content));save.inventory[100]=7;save.inventory[990001]=2;
    const {state,...parts}=splitRoleSave(save);
    const drifted=structuredClone(parts);drifted.items.ownedItemIds=['999'];
    assert.throws(()=>joinRoleSave(state,drifted,content),/物品数量账本与收藏不一致/);
    assert.deepEqual(durableSave(joinRoleSave(state,drifted,content,{strict:false})),save);
    const moved=structuredClone(parts);moved.battle.pets=moved.items.pets;delete moved.items.pets;
    assert.throws(()=>joinRoleSave(state,moved,content),/战斗背包与物品收藏不一致/);
    assert.deepEqual(durableSave(joinRoleSave(state,moved,content,{strict:false})),save);
});

test('unfinished battles live in runtime only; an older local battle cannot replay after settlement',()=>{
    const h=harness(),save=createAdventure(content);beginEncounter(save,content,'trial:1');recordDecision(save,{pass:true});
    h.store.scoped().setItem(SAVE_KEY,JSON.stringify(save));
    assert.equal(durableSave(save).pendingEncounter,undefined);
    const reload=h.make();reload.open('alice');assert.deepEqual(reload.catalog.roles[0].save.pendingEncounter,save.pendingEncounter);
    const runtime=runtimeValues(save);save.pendingEncounter=null;save.revision++;
    assert.equal(restoreRuntime(durableSave(save),content,runtime).pendingEncounter,null);
});

test('core fingerprint ignores local-only fields but includes owned pet growth and reward receipts',()=>{
    const save=createAdventure(content),catalog={schemaVersion:1,activeId:id,roles:[{id,lastPlayedAt:1,save}]};
    const key=coreCatalogKey(catalog);save.heroHp=1;save.careAt=100;catalog.roles[0].lastPlayedAt=999;
    assert.equal(coreCatalogKey(catalog),key);save.inventory[100]=10;
    assert.notEqual(coreCatalogKey(catalog),key);
});

test('follow preference is device-local: absent from durable saves, restored from runtime regardless of revision',()=>{
    const h=harness(),save=createAdventure(content);
    save.magicStarFollow=false;
    h.store.scoped().setItem(SAVE_KEY,JSON.stringify(save));
    assert.equal(durableSave(save).magicStarFollow,undefined);
    assert.equal(JSON.parse(h.values.get('haqi.roles.v1.account.alice')).catalog.roles[0].save.magicStarFollow,undefined);
    const runtime=runtimeValues(save);save.revision++;
    const restored=restoreRuntime(durableSave(save),content,runtime);
    assert.equal(restored.magicStarFollow,false);
    const reload=h.make();reload.open('alice');assert.equal(reload.catalog.roles[0].save.magicStarFollow,false);
    const catalog=s=>coreCatalogKey({schemaVersion:1,activeId:id,roles:[{id,lastPlayedAt:1,save:s}]});
    assert.equal(catalog({...save,magicStarFollow:true}),catalog({...save,magicStarFollow:false}));
    assert.equal(splitRoleSave({...save,magicStarFollow:false}).state.magicStarFollow,undefined);
});

test('mount visibility preference is device-local: absent from durable saves, restored from runtime regardless of revision',()=>{
    const h=harness(),save=createAdventure(content);
    save.mountHidden=true;
    h.store.scoped().setItem(SAVE_KEY,JSON.stringify(save));
    assert.equal(durableSave(save).mountHidden,undefined);
    assert.equal(JSON.parse(h.values.get('haqi.roles.v1.account.alice')).catalog.roles[0].save.mountHidden,undefined);
    const runtime=runtimeValues(save);save.revision++;
    const restored=restoreRuntime(durableSave(save),content,runtime);
    assert.equal(restored.mountHidden,true);
    const reload=h.make();reload.open('alice');assert.equal(reload.catalog.roles[0].save.mountHidden,true);
    const catalog=s=>coreCatalogKey({schemaVersion:1,activeId:id,roles:[{id,lastPlayedAt:1,save:s}]});
    assert.equal(catalog({...save,mountHidden:true}),catalog({...save,mountHidden:false}));
    assert.equal(splitRoleSave({...save,mountHidden:true}).state.mountHidden,undefined);
});
