import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRoleStore} from '../js/adventure_roles.js';
import {createRuntimeStore} from '../js/adventure_runtime_store.js';
import {createAdventure,beginEncounter,playerSpec} from '../js/adventure_core.js';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {tickCare,FOOD_ID} from '../js/adventure_pets_core.js';
import {tickCheckin} from '../js/adventure_checkin_core.js';
const read=path=>JSON.parse(readFileSync(new URL('../data/'+path,import.meta.url)));
const {content,dataset}=installExpansion(read('adventure/chapter.json'),read('adventure/combat.json'),read('adventure/pets.json'),read('adventure/shop-candidates.json'),read('kids/cards.json'),read('kids/charms.json'));
function fixture(count=1){
    const data=new Map(),writes=[],runtimeStore=createRuntimeStore({indexedDB:null});let n=0;
    const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>{writes.push(key);data.set(key,value);}};
    const make=()=>createRoleStore({content,dataset,storage,runtimeStore,uuid:()=>`12345678-1234-1234-1234-${String(++n).padStart(12,'0')}`});
    const store=make();store.open();for(let i=0;i<count;i++)store.create(createAdventure(content));
    store.markSynced('base',store.checkpoint());writes.length=0;
    return {store,make,data,writes,runtimeStore};
}
for(const count of [1,2])test(`${count} players checkpoint movement without catalog writes or replacing live saves`,()=>{
    const f=fixture(count),rows=f.store.catalog.roles,updates=Object.fromEntries(rows.map(row=>[row.id,row.save]));
    for(let step=0;step<20;step++){
        for(const row of rows){row.save.position.x+=1;row.save.heroHp=5;}
        f.store.saveRuntime(updates);
    }
    assert.equal(f.writes.length,0);assert.equal(f.store.dirty,false);
    for(const row of rows)assert.equal(f.store.catalog.roles.find(r=>r.id===row.id).save,row.save);
    const reload=f.make();reload.open();
    for(const row of rows){const saved=reload.catalog.roles.find(r=>r.id===row.id).save;assert.deepEqual(saved.position,row.save.position);assert.equal(saved.heroHp,5);}
});
test('runtime checkpoint never reads inventory or core collections',()=>{
    const f=fixture(),{id,save}=f.store.catalog.roles[0];
    const live={...save};Object.defineProperty(live,'inventory',{get(){assert.fail('runtime copied inventory');}});
    f.store.saveRuntime({[id]:live});assert.equal(f.writes.length,0);
});
test('core commits skip unchanged snapshots and preserve runtime-only revisions across reload',()=>{
    const f=fixture(2),updates=Object.fromEntries(f.store.catalog.roles.map(row=>[row.id,structuredClone(row.save)]));
    for(const save of Object.values(updates)){save.revision+=3;save.position.x+=2;save.heroHp=7;}
    f.store.commitRoles(updates);f.store.commitRoles(updates);
    assert.equal(f.writes.length,0);assert.equal(f.store.dirty,false);
    const reload=f.make();reload.open();
    for(const row of reload.catalog.roles){assert.equal(row.save.revision,updates[row.id].revision);assert.equal(row.save.heroHp,7);}
    const first=Object.keys(updates)[0];updates[first].inventory['99999']=1;
    f.store.commitRoles(updates);assert.equal(f.store.dirty,true);assert.equal(f.writes.length,1);
    f.store.commitRoles(updates);assert.equal(f.writes.length,1);
});
test('pending battle is checkpointed locally and stale runtime cannot overwrite a new core revision',()=>{
    const f=fixture(),{id,save}=f.store.catalog.roles[0];beginEncounter(save,content,'trial:1');
    f.store.commitRoles({[id]:save});assert.equal(f.writes.length,1); // Encounter serial is core data.
    save.revision++;f.store.commitRoles({[id]:save});assert.equal(f.writes.length,1);
    const reload=f.make();reload.open();assert.deepEqual(reload.catalog.roles[0].save.pendingEncounter,save.pendingEncounter);
    const runtimeKey=`haqi.roles.v1.guest.${id}`,old=f.runtimeStore.get(runtimeKey);
    save.pendingEncounter=null;save.revision++;save.name='新的旅程';f.store.commitRoles({[id]:save});
    f.runtimeStore.set(runtimeKey,old);const newer=f.make();newer.open();assert.equal(newer.catalog.roles[0].save.pendingEncounter,null);
});
test('unchanged explicit commits retain the last successful core snapshot on later write failure',()=>{
    const f=fixture(),row=f.store.catalog.roles[0],next=structuredClone(row.save);
    next.heroHp=3;f.store.commitRoles({[row.id]:next});
    const before=f.store.checkpoint();next.name='尚未保存';
    f.data.set('haqi.roles.v1.guest','changed by another page');
    assert.throws(()=>f.store.commitRoles({[row.id]:next}),/其他页面/);
    assert.equal(f.store.checkpoint(),before);
});
test('duo runtime path preserves the second player return point without replacing either live save',()=>{
    const source=readFileSync(new URL('../js/adventure_local_play.js',import.meta.url),'utf8');
    const fn=source.slice(source.indexOf('    function storeSaves('),source.indexOf('    async function loadPet('));
    const first={zone:'camp',position:{x:1,y:2}},second={zone:'camp',position:{x:3,y:4}};
    let captured;
    const context=vm.createContext({saves:()=>[first,second],ids:()=>['one','two'],state:()=>({store:{saveRuntime:updates=>captured=updates,commitRoles:()=>assert.fail('full commit during movement')}}),session:{returnTo:{zone:'forest',position:{x:8,y:9}}},api:{replaceSave:()=>assert.fail('replaced live save')}});
    vm.runInContext(fn+'\nstoreSaves(undefined,{runtimeOnly:true});',context);
    assert.equal(captured.one,first);assert.equal(captured.two.zone,'forest');assert.equal(captured.two.position.x,8);assert.equal(second.position.x,3);
});
test('care requests a core save only when auto feeding consumes food and grants growth',()=>{
    const save=createAdventure(content),pet=save.pets[save.formation.find(Boolean)],hero=playerSpec(save,content);
    save.careAt=1000;pet.hunger=100;
    assert.equal(tickCare(save,content,hero,2000,true),false);
    pet.hunger=1;save.petFoodSlots=[{itemId:FOOD_ID,count:10},null,null];
    assert.equal(tickCare(save,content,hero,3000,true),true);
    assert.ok(save.petFoodSlots[0].count<10);
    assert.equal(tickCare(save,content,hero,4000,true),false);
});
test('checkin saves a new day once while online time stays runtime-only',()=>{
    const save={};
    assert.equal(tickCheckin(save,100000,1000),true);
    assert.equal(tickCheckin(save,101000,1000),false);
    assert.equal(tickCheckin(save,100000+86400000,1000),true);
    assert.equal(tickCheckin(save,101000+86400000,1000),false);
});
