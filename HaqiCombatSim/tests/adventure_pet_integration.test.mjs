import {createCloudClient} from '../js/adventure_cloud.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {createAdventure,parseSave,beginEncounter} from '../js/adventure_core.js';
import {initializePetWorld,petWorldAction,npcPetId} from '../js/adventure_pet_world_core.js';
import {createPetInstance,petInteractionParams} from '../js/adventure_pet_interactions_core.js';
import {findPetMeeting,petMeetingClear} from '../js/adventure_pet_meeting_core.js';
import {SOCIAL_DEFAULTS} from '../js/adventure_social_core.js';
import {petBattleMood,updatePetIdle} from '../js/adventure_pet_mood_core.js';
import {drawPetMood} from '../js/view_adventure_pet_mood.js';
import {createRoleStore} from '../js/adventure_roles.js';
import {createRuntimeStore} from '../js/adventure_runtime_store.js';
import {saveLocal} from '../js/adventure_assets.js';
import {packPetFilesSync,openPetFiles} from '../js/adventure_pet_files.js';
import {coreCatalogKey} from '../js/adventure_storage_core.js';
import {petAction,partySpecs,exportPetLink,validatePetLink} from '../js/adventure_pets_core.js';
import {checkedProgress} from '../js/adventure_cloud_core.js';
import {drawPetSocialEffects} from '../js/view_adventure_pet_social.js';
import {petSceneProfiles,createPetScene} from '../js/adventure_pet_scene.js';
import {petSummary,petFilePath} from '../js/adventure_pet_files_core.js';
import {ISLANDS,islandSpawn} from '../js/adventure_world_map_core.js';
import {createWorld,walkable} from '../js/adventure_world_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../data/'+p,import.meta.url)));
const {content,dataset}=installExpansion(read('adventure/chapter.json'),read('adventure/combat.json'),read('adventure/pets.json'),read('adventure/shop-candidates.json'),read('kids/cards.json'),read('kids/charms.json'));
const T=Date.UTC(2026,8,27),D=86400000,scene={distance:10,anchor:{x:300,y:300},walkable:true};
function hero(){const s=createAdventure(content,{starter:'dragon_green'});initializePetWorld(s,content);return s;}
function pair(){const s=hero(),id=s.formation[0];s.pets[id]={...s.pets[id],xp:9000,level:25,gender:'female'};let result=petWorldAction(s,content,{type:'residents',residents:[{id:'fixture',school:'fire'}],now:T}).save;result.petWorld[npcPetId('fixture')].gender='male';return {save:result,id,other:npcPetId('fixture')};}
const catalog=save=>({roles:[{id:'test',save}]});
const islandContent={...content,worldMaps:Object.fromEntries(Object.entries(content.worldMapIndex.islands).map(([id,row])=>[id,JSON.parse(fs.readFileSync(new URL('../'+row.file,import.meta.url)))]))};
for(const island of ISLANDS)test(`${island.name}: dialogue, food, birth and return-to-island adoption use the real map`,()=>{
    assert.equal(read('adventure/social.json').worlds[island.id].enabled,true);
    let save=hero(),at=T;save.zone=island.id;save.position=islandSpawn(island.id,islandContent);
    const host=save.formation[0];save.pets[host].xp=9000;save.pets[host].level=25;save.pets[host].gender='female';save.inventory[990001]=2;
    let world=createWorld(save.zone,islandContent,save);
    const owner={id:'island-pet-owner',school:'fire'},other=npcPetId(owner.id);
    const scene=createPetScene({getState:()=>({save,world,content:islandContent,scope:'all-islands',socialActors:[{profile:owner,position:{...save.position}}],loadPet:async()=>{},locked:false}),commit:next=>{save=next;},toast:()=>{},now:()=>at});
    scene.step(0);save.petWorld[other].gender='male';
    for(const day of [0,2,4]){at=T+day*D;scene.dialogue(owner.id);for(let i=0;i<400;i++){at+=33;scene.step(.033);if(scene.effects.some(e=>e.at>=T+day*D))break;}}
    const baby=scene.babies[0];assert.ok(baby,island.id);assert.equal(baby.birth.zone,island.id);assert.ok(walkable(world,baby.birth.anchor.x,baby.birth.anchor.y));
    scene.feed(host);scene.step(0);assert.equal(save.inventory[990001],1);assert.equal(scene.babies.length,1);
    const before=structuredClone(save.petWorld[other]);
    save.zone=island.id==='camp'?'town':'camp';save.position=islandSpawn(save.zone,islandContent);world=createWorld(save.zone,islandContent,save);scene.step(0);assert.equal(scene.babies.length,0);assert.deepEqual(save.petWorld[other],before);
    save.zone=island.id;save.position=islandSpawn(save.zone,islandContent);world=createWorld(save.zone,islandContent,save);scene.step(0);assert.equal(scene.babies[0].id,baby.id);
    scene.adopt(baby.id);assert.equal(scene.babies.length,0);assert.ok(save.pets[baby.id]);assert.deepEqual(save.formation,[host,null,null,null]);
});
function sceneHarness(){
    let save=hero(),at=T;save.position={x:900,y:800};
    const world={zone:save.zone,w:1800,h:1600,buildings:[],trees:[],npcs:[{id:36215,name:'草莓姑娘'}]};
    const actor=id=>({profile:{id,school:'fire'},position:{x:925,y:800}});
    const state={world,content,scope:'test',socialActors:[actor('first'),actor('second')],locked:false,loadPet:async()=>{throw Error('读取失败');}};
    const notices=[];
    const scene=createPetScene({getState:()=>({...state,save}),commit:next=>{save=next;},toast:message=>notices.push(message),now:()=>at});
    return {scene,state,notices,get save(){return save;},advance:ms=>{at+=ms;}};
}
test('pets approach from twice human conversation range and ordinary play earns no marks',()=>{
    const h=sceneHarness(),p=petInteractionParams(content);assert.equal(p.encounterDistance,SOCIAL_DEFAULTS.converseRadius*2);
    h.state.socialActors=h.state.socialActors.slice(0,1);h.state.socialActors[0].position={x:1070,y:800};
    h.scene.step(0);h.advance(p.playIntervalMs+1);h.scene.step(0);
    for(let i=0;i<180&&!h.scene.effects.length;i++){h.advance(50);h.scene.step(.05);}
    assert.ok(h.scene.effects.length);assert.equal(h.scene.effects[0].kind,'proximity');
    const [a,b]=h.scene.pets;assert.ok(Math.hypot(a.position.x-b.position.x,a.position.y-b.position.y)<=p.meetingArrivalDistance);
    assert.equal(h.save.pets[h.save.formation[0]].memories.length,0);
    const calls=[],ctx=new Proxy({},{get:(_,key)=>(...args)=>calls.push([key,...args]),set:()=>true});
    drawPetSocialEffects(ctx,{content},h.scene.pets,h.scene.effects,0,false,h.scene.now);
    assert.ok(calls.some(c=>c[0]==='quadraticCurveTo'));assert.equal(calls.filter(c=>c[0]==='fillText').length,0);
});
test('idle pets sleep without moving, wake on owner movement and can be invited awake',()=>{
    const h=sceneHarness();h.scene.step(0);h.advance(60001);h.scene.step(0);
    assert.ok(h.scene.pets.every(p=>p.mood==='sleeping'));const positions=h.scene.pets.map(p=>({...p.position}));
    h.advance(1000);h.scene.step(.05);assert.deepEqual(h.scene.pets.map(p=>p.position),positions);assert.equal(h.scene.effects.length,0);
    h.scene.dialogue('first');h.scene.step(.05);assert.notEqual(h.scene.pets[0].mood,'sleeping');
    const actor={};updatePetIdle(actor,{x:0,y:0},T,content);assert.equal(updatePetIdle(actor,{x:0,y:0},T+60000,content),'sleeping');assert.equal(updatePetIdle(actor,{x:10,y:0},T+60001,content),'idle');
});
test('walking past an owner wakes only nearby pets; standing still allows sleep again',()=>{
    const h=sceneHarness(),p=petInteractionParams(content);
    h.state.socialActors[1].position={x:1500,y:800};
    h.scene.step(0);h.advance(p.idleSleepMs+1);h.scene.step(0);
    assert.ok(h.scene.pets.every(pet=>pet.mood==='sleeping'));
    const before=JSON.stringify(h.save.petWorld);
    h.save.position.x+=p.idleMoveDistance+1;h.scene.step(0);
    assert.equal(h.scene.pets.find(pet=>pet.id===npcPetId('first')).mood,'idle');
    assert.equal(h.scene.pets.find(pet=>pet.id===npcPetId('second')).mood,'sleeping');
    assert.equal(JSON.stringify(h.save.petWorld),before);
    h.advance(p.idleSleepMs+1);h.scene.step(0);
    assert.ok(h.scene.pets.every(pet=>pet.mood==='sleeping'));
    h.save.position.x+=p.idleMoveDistance+1;h.scene.step(0);
    assert.equal(h.scene.pets.find(pet=>pet.id===npcPetId('first')).mood,'idle');
});
test('battle moods track visible HP including healing and zero HP; reduced motion stays static',()=>{
    assert.equal(petBattleMood(26,100,content),'idle');assert.equal(petBattleMood(25,100,content),'sad');assert.equal(petBattleMood(0,100,content),'sleeping');assert.equal(petBattleMood(60,100,content),'idle');
    const paint=time=>{const calls=[],ctx=new Proxy({},{get:(_,key)=>(...args)=>calls.push([key,...args]),set:()=>true});drawPetMood(ctx,'sleeping',time,true,64,column=>calls.push(['pet',column]));return calls;};
    assert.deepEqual(paint(0),paint(9999));assert.ok(paint(0).some(c=>c[0]==='pet'));assert.ok(paint(0).some(c=>c[0]==='pet'&&c[1]===3));assert.ok(!paint(0).some(c=>['scale','rotate','stroke','fillText'].includes(c[0])));
});
test('scene keeps one follower per owner and removes a departed owner immediately',()=>{
    const h=sceneHarness();h.scene.step(.016);assert.equal(h.scene.pets.length,3);
    h.scene.dialogue('first');for(let i=0;i<180&&!h.scene.effects.length;i++){h.advance(33);h.scene.step(.033);}assert.ok(h.scene.effects.length);
    h.state.socialActors=[];h.scene.step(.016);assert.equal(h.scene.pets.length,1);assert.equal(h.scene.effects.length,0);
});
test('unavailable pet files do not freeze other followers and retry without replacing memories',async()=>{
    const h=sceneHarness();h.scene.step(.016);const id=npcPetId('second'),pet=structuredClone(h.save.petWorld[id]);
    h.save.petFileRefs={[id]:{group:'petWorld',path:petFilePath(id,'v1'),summary:petSummary(pet)}};delete h.save.petWorld[id];
    let calls=0;h.state.loadPet=async()=>{calls++;throw Error('读取失败');};
    h.scene.step(.016);assert.equal(h.scene.pets.length,2);assert.equal(h.save.petWorld[id],undefined);
    await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);
    h.scene.step(.016);await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);
    h.state.loadPet=async()=>{calls++;h.save.petWorld[id]=pet;return pet;};h.advance(12001);h.scene.step(.016);
    await new Promise(resolve=>setImmediate(resolve));h.scene.step(.016);assert.equal(calls,2);assert.equal(h.scene.pets.length,3);
});
test('late pet load failures from a previous scene cannot affect the current scene',async()=>{
    const h=sceneHarness();h.scene.step(.016);const id=npcPetId('second'),pet=h.save.petWorld[id];
    h.save.petFileRefs={[id]:{group:'petWorld',path:petFilePath(id,'v1'),summary:petSummary(pet)}};delete h.save.petWorld[id];
    let reject;h.state.loadPet=()=>new Promise((_,fail)=>{reject=fail;});h.scene.step(.016);
    await new Promise(resolve=>setImmediate(resolve));h.state.scope='another-role';h.state.socialActors=[];h.scene.step(.016);
    reject(Error('旧场景读取失败'));await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(h.notices,[]);assert.equal(h.scene.pets.length,1);
});
test('only configured owners get followers and duplicate character rows share one pet',()=>{
    const actor=id=>({profile:{id,name:id},position:{x:100,y:100}});
    const state={world:{npcs:[{id:36215,name:'草莓姑娘'},{id:36211,name:'青龙'},{id:9,name:'机灵'}]},socialActors:[actor('xiaoyu'),actor('xiaofeng'),actor('xiaoyu'),actor('moli')]};
    assert.deepEqual(petSceneProfiles(state).map(p=>p.id),['xiaoyu','xiaofeng','moli']);
    state.world.npcs[1].petCompanion=true;
    assert.deepEqual(petSceneProfiles(state).map(p=>p.id),['resident:36211','xiaoyu','xiaofeng','moli']);
});
test('main save supports birth, same-species instances, atomic adoption and reload',()=>{
    let {save,id,other}=pair();for(const day of [0,2,4])save=petWorldAction(save,content,{type:'dialogue',now:T+day*D,pairs:[{ids:[id,other],scene}]}).save;
    const baby=Object.values(save.petWorld).find(p=>p.ownerId===null);assert.ok(baby);assert.equal(save.pets[id].memories[0].available,0);
    const next=petWorldAction(save,content,{type:'adopt',id:baby.id,now:T+4*D}).save;assert.equal(Object.keys(next.pets).length,2);assert.deepEqual(next.formation,save.formation);assert.equal(next.petWorld[baby.id],undefined);assert.equal(petWorldAction(next,content,{type:'adopt',id:baby.id,now:T+4*D}).changed,false);parseSave(next,content);
});

test('same species form independent battle units and an instance cannot occupy two seats',()=>{
    const s=hero(),first=s.formation[0],second='same-species-second';s.pets[second]={...structuredClone(s.pets[first]),id:second};
    petAction(s,content,{type:'formation',slots:[first,second,null,null],heroSlot:0});
    assert.throws(()=>petAction(s,content,{type:'formation',slots:[first,first,null,null],heroSlot:0}),/重复/);
    beginEncounter(s,content,'ice-scout');assert.equal(s.pendingEncounter.party[1].id,second);assert.equal(s.pendingEncounter.party[1].speciesId,'dragon_green');assert.deepEqual(s.pendingEncounter.ownedPets,['dragon_green']);assert.ok(checkedProgress(s,content,dataset).battle);
    const link=exportPetLink(s,content);assert.equal(link.version,2);assert.equal(validatePetLink(link,content).pets.length,2);
});

test('unfinished legacy battle keeps its original pet identities until settlement',()=>{
    const s=createAdventure(content,{starter:'dragon_green'});beginEncounter(s,content,'ice-scout');const before=JSON.stringify(s);assert.equal(initializePetWorld(s,content),false);assert.equal(JSON.stringify(s),before);assert.ok(checkedProgress(s,content,dataset).battle);
});

test('NPC pets never play, earn marks or breed with each other',()=>{
    let {save,other}=pair();save=petWorldAction(save,content,{type:'residents',residents:[{id:'other-npc'}],now:T}).save;
    const second=npcPetId('other-npc');save.petWorld[second].gender='female';
    const before=JSON.stringify(save);
    for(const type of ['proximity','dialogue']){const result=petWorldAction(save,content,{type,now:T,pairs:[{ids:[other,second],scene}]});assert.equal(result.changed,false);assert.deepEqual(result.effects,[]);assert.deepEqual(result.babies,[]);}
    assert.equal(JSON.stringify(save),before);
});

test('social feedback has no overhead text and disappears on separation or expiry',()=>{
    const {save,id,other}=pair(),rows=[{pet:save.pets[id],position:{x:100,y:100}},{pet:save.petWorld[other],position:{x:130,y:100}}],effect={ids:[id,other],kind:'dialogue',status:{available:2},at:T,until:T+4500};
    const calls=[];const ctx=new Proxy({},{get:(_,key)=>(...args)=>calls.push([key,...args]),set:()=>true});
    drawPetSocialEffects(ctx,{content},rows,[effect],0,false,T);assert.equal(calls.filter(c=>c[0]==='fillText').length,0);assert.equal(calls.filter(c=>c[0]==='fillRect').length,6);
    calls.length=0;rows[1].position.x=300;drawPetSocialEffects(ctx,{content},rows,[effect],0,false,T);assert.equal(calls.filter(c=>['fill','fillRect','fillText'].includes(c[0])).length,0);
    calls.length=0;rows[1].position.x=130;drawPetSocialEffects(ctx,{content},rows,[effect],0,false,T+5000);assert.equal(calls.filter(c=>['fill','fillRect','fillText'].includes(c[0])).length,0);
});
test('paid feeding permits full hunger and arrival rewards do not debit again',()=>{
    let {save,id,other}=pair();save.inventory[990001]=2;const before=JSON.stringify(save);
    const fed=petWorldAction(save,content,{type:'feed',hostId:id,now:T,pairs:[]}).save;assert.equal(fed.inventory[990001],1);assert.equal(JSON.stringify(save),before);
    const arrived=petWorldAction(fed,content,{type:'meal-arrival',hostId:id,now:T,pairs:[{ids:[id,other],scene}]}).save;assert.equal(arrived.inventory[990001],1);assert.equal(arrived.pets[id].memories[0].total,1);
});
test('local role root contains only pet pages; reload fetches active bodies only',()=>{
    const data=new Map(),reads=[],storage={getItem:k=>{reads.push(k);return data.get(k)??null;},setItem:(k,v)=>data.set(k,v)};let serial=0;
    const make=()=>createRoleStore({content,dataset,storage,runtimeStore:createRuntimeStore({indexedDB:null}),uuid:()=>`12345678-1234-1234-1234-${String(++serial).padStart(12,'0')}`});
    const store=make();store.open();const save=hero();for(let i=0;i<150;i++){const p=createPetInstance(content,{id:`extra${i}`,speciesId:'dragon_green',ownerId:save.petOwnerId});save.pets[p.id]={...p,hp:100,hunger:100};}
    store.create(save);const root=JSON.parse(data.get('haqi.roles.v1.guest'));assert.deepEqual(root.catalog.roles[0].save.pets,{});assert.equal(root.catalog.roles[0].save.petPages.length,2);
    reads.length=0;const restored=make();restored.open();const s=restored.catalog.roles[0].save;assert.equal(Object.keys(s.pets).length,1);assert.equal(Object.keys(s.petFileRefs).length,151);assert.equal(reads.filter(p=>p.includes('.pet-file.pets/')).length,1);
    assert.equal(coreCatalogKey(catalog(store.catalog.roles[0].save)),coreCatalogKey(catalog(s)));
    const loaded=restored.loadPet(s,'extra42');assert.equal(loaded.pets.extra42.speciesId,'dragon_green');saveLocal(loaded,restored.scoped());assert.equal(Object.keys(restored.catalog.roles[0].save.petFileRefs).length,151);
});
test('failed individual file write never publishes parent cooldown, food debit or baby',()=>{
    let fail=false,serial=0;const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>{if(fail&&k.includes('.pet-file.'))throw Error('disk full');data.set(k,v);}};
    const store=createRoleStore({content,dataset,storage,runtimeStore:createRuntimeStore({indexedDB:null}),uuid:()=>`12345678-1234-1234-1234-${String(++serial).padStart(12,'0')}`});store.open();const {save,id}=pair();save.inventory[990001]=1;store.create(save);const before=data.get('haqi.roles.v1.guest'),next=petWorldAction(save,content,{type:'feed',hostId:id,now:T,pairs:[]}).save;next.pets[id].xp++;
    fail=true;assert.throws(()=>saveLocal(next,store.scoped()),/disk full/);assert.equal(data.get('haqi.roles.v1.guest'),before);
});
test('portable pet files validate scope and lazily open a current map',async()=>{
    const s=hero(),data=new Map();let serial=0;const io={read:p=>data.get(p),write:(p,v)=>data.set(p,v)};
    const packed=packPetFilesSync(s,'scope',content,()=>`v${++serial}`,io);const opened=await openPetFiles(packed,'scope',content,io);assert.equal(Object.keys(opened.pets).length,1);await assert.rejects(openPetFiles(packed,'other',content,io),/账号/);
});

const id=n=>`12345678-1234-1234-1234-${String(n).padStart(12,"0")}`;
function cloudMock() {
    const remote = new Map(), pending = new Map(), listeners = [];let serial = 100, readFailure = false, syncFailure = false;
    const sdk = { token: 'private', username: 'alice', getUserProfile: async () => ({ username: sdk.username }),
        onAuthStateChange: cb => { listeners.push(cb);return () => {}; }, showLoginWindow: async () => {},
        logout: async () => { sdk.token = null;listeners.forEach(cb => cb()); },
        loadPage: async opts => {
            assert.equal(opts.useCache, true);assert.equal(opts.useServerCache, true);
            if (readFailure) throw Error('network failure');
            const full = `${opts.sitePath}/${opts.pagePath}`;
            if (!remote.has(full)) throw Error(`Page not found: ${full}`);
            return { success: true, content: remote.get(full) };
        },
        getFileByFullPath: async (full, _, useCache) => { assert.equal(useCache, true);return remote.get(full) ?? null; },
    };
    const store = { getUsername: () => sdk.username, isUseLocal: () => !sdk.token,
        getRemotePagePath: path => `${sdk.username}/edunotes/store/HaqiAdventure/${path}`,
        savePageData: async (path, key, text, flush, cache) => { assert.equal(flush, false);assert.equal(cache, true);pending.set(path, text); },
        syncToGit: async (path,useCache) => { assert.equal(useCache,true); if (syncFailure) return false;remote.set(store.getRemotePagePath(path), pending.get(path));return true; },
    };
    sdk.personalPageStore = { withWorkspace: () => store };
    return { sdk, store, remote, setReadFailure: v => readFailure = v, setSyncFailure: v => syncFailure = v,
        client: (extra={}) => createCloudClient({...extra, content, dataset, loadSDK: async () => sdk, uuid: () => id(++serial) }) };
}

test('Keepwork writes separate pet files, lazy restores and reuses unchanged files',async()=>{
    const m=cloudMock(),c=m.client();await c.connect();const save=hero();for(let i=0;i<12;i++){const p=createPetInstance(content,{id:`reserve${i}`,speciesId:'dragon_green',ownerId:save.petOwnerId});save.pets[p.id]={...p,hp:100,hunger:100};}
    const catalog={schemaVersion:1,activeId:id(1),roles:[{id:id(1),lastPlayedAt:1,save}]};
    const revision=await c.saveRoles(catalog,null);const manifest=JSON.parse(m.remote.get(m.store.getRemotePagePath('roles/index.json')));assert.equal(manifest.catalog.roles[0].state.petWorld,undefined);
    const items=JSON.parse(m.remote.get(m.store.getRemotePagePath(manifest.catalog.roles[0].files.items))).data;assert.deepEqual(items.pets,{});assert.equal(items.petPages.length,1);
    const reader=m.client();await reader.connect();const result=await reader.roles();assert.deepEqual(result.partsStale,[]);assert.equal(Object.keys(result.catalog.roles[0].save.pets).length,1);assert.equal(Object.keys(result.catalog.roles[0].save.petFileRefs).length,13);
    const before=m.remote.size;assert.equal(await reader.saveRoles(result.catalog,revision),revision);assert.equal(m.remote.size,before);
    result.catalog.roles[0].save.pets[result.catalog.roles[0].save.formation[0]].xp++;
    await reader.saveRoles(result.catalog,revision);assert.ok(m.remote.size>before);
});

test('first cloud sync uploads unloaded local pets; another device can open just one later',async()=>{
    const data=new Map();let serial=1000;const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
    const make=()=>createRoleStore({content,dataset,storage,runtimeStore:createRuntimeStore({indexedDB:null}),uuid:()=>id(++serial)});
    const local=make();local.open('alice');const save=hero();for(let i=0;i<4;i++){const p=createPetInstance(content,{id:`local${i}`,speciesId:'dragon_green',ownerId:save.petOwnerId});save.pets[p.id]={...p,hp:100,hunger:100};}local.create(save);
    const reopened=make();reopened.open('alice');assert.equal(Object.keys(reopened.catalog.roles[0].save.pets).length,1);
    const m=cloudMock(),c=m.client({petFileStore:id=>reopened.petFileIO(id)});await c.connect();await c.saveRoles(reopened.catalog,null);
    const other=m.client();await other.connect();const cloud=await other.roles(),row=cloud.catalog.roles[0],ref=row.save.petFileRefs.local3;
    assert.equal(Object.keys(row.save.pets).length,1);assert.equal((await other.petFile(row.id,ref.path)).data.id,'local3');
    const incomingData=new Map(),incoming=createRoleStore({content,dataset,storage:{getItem:k=>incomingData.get(k)??null,setItem:(k,v)=>incomingData.set(k,v)},runtimeStore:createRuntimeStore({indexedDB:null}),uuid:()=>id(++serial)});incoming.open('alice');
    const receiving=m.client({petFileStore:id=>incoming.petFileIO(id)});await receiving.connect();const received=await receiving.roles();incoming.replace(received.catalog,received.revision);assert.equal(incoming.catalog.roles[0].save.formation[0],save.formation[0]);
});

test('login downloads pet files into the account scope while the store is still a guest',async()=>{
    const data=new Map();let serial=2000;const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
    const make=()=>createRoleStore({content,dataset,storage,runtimeStore:createRuntimeStore({indexedDB:null}),uuid:()=>id(++serial)});
    const source=make();source.open('alice');const save=hero();source.create(save);
    const m=cloudMock(),uploaded=m.client({petFileStore:id=>source.petFileIO(id)});await uploaded.connect();await uploaded.saveRoles(source.catalog,null);
    const guest=make();guest.open();assert.equal(guest.owner,null);
    const receiving=m.client({petFileStore:id=>guest.petFileIOFor('alice',id)});await receiving.connect();
    const received=await receiving.roles();
    guest.open('alice');guest.replace(received.catalog,received.revision);
    assert.equal(guest.catalog.roles[0].save.formation[0],save.formation[0]);
});

test('manual snapshots keep individual files and restore a complete portable collection',async()=>{
    const m=cloudMock(),client=m.client();await client.connect();const s=hero();const p=createPetInstance(content,{id:'same-species-baby',speciesId:'dragon_green',ownerId:s.petOwnerId});s.pets[p.id]={...p,hp:100,hunger:100};
    const uploaded=await client.upload(s,{roleId:id(7)});assert.equal(uploaded.snapshot.storageVersion,3);assert.deepEqual(uploaded.snapshot.save.pets,{});
    const restored=await client.read(uploaded.path);assert.equal(Object.keys(restored.save.pets).length,2);assert.equal(restored.save.petFileRefs,undefined);assert.equal(restored.save.petPages,undefined);parseSave(restored.save,content);
});

test('social pets move clear of both owners before effects and stop if an owner enters',()=>{
    const h=sceneHarness();h.scene.step(0);h.scene.dialogue('first');h.scene.step(0);
    assert.equal(h.scene.effects.length,0);
    for(let i=0;i<180&&!h.scene.effects.length;i++){h.advance(33);h.scene.step(.033);}
    assert.ok(h.scene.effects.length);
    const ids=h.scene.effects[0].ids,participants=h.scene.pets.filter(p=>ids.includes(p.id));
    const owners=[h.save.position,...h.state.socialActors.map(a=>a.position)];
    assert.ok(participants.every(p=>petMeetingClear(p.position,owners,content)));
    h.state.socialActors[0].position={...participants[0].position};h.scene.step(.016);
    assert.equal(h.scene.effects.length,0);
});
test('no open meeting space never falls back to owners feet',()=>{
    const world={w:100,h:100,buildings:[],trees:[]},point={x:50,y:50};
    assert.equal(findPetMeeting(world,[point,point],[point],content),null);
});

test('guest-to-account transfer hydrates lazy pets and rewrites files under the account scope',()=>{
    const rows=new Map(),storage={getItem:k=>rows.get(k)??null,setItem:(k,v)=>rows.set(k,v)};let n=0;
    const store=createRoleStore({content,dataset,storage,runtimeStore:createRuntimeStore({indexedDB:null}),uuid:()=>`12345678-1234-1234-1234-${String(++n).padStart(12,'0')}`});
    store.open();const save=hero();save.pets['extra-pet']=createPetInstance(content,{id:'extra-pet',ownerId:save.petOwnerId,speciesId:'dragon_green',xp:9000});
    const id=store.create(save);store.open();assert.equal(store.catalog.roles[0].save.pets['extra-pet'],undefined);
    const transfer=store.guestTransfer();assert.equal(transfer.save.pets['extra-pet'].xp,9000);assert.equal(transfer.save.petPages,undefined);
    store.open('alice');store.adoptGuest(transfer);store.open('alice');store.select(id);
    const loaded=store.loadPet(store.catalog.roles[0].save,'extra-pet');assert.equal(loaded.pets['extra-pet'].xp,9000);
    const ref=loaded.petFileRefs['extra-pet'];assert.equal(store.petFileIO(id).read(ref.path).scope,store.petScope(id));
    store.open();assert.equal(store.loadPet(store.catalog.roles[0].save,'extra-pet').pets['extra-pet'].xp,9000);
});
