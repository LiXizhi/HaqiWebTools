import {directCacheStore} from './helpers/direct_cache_store.js';
import {awardDailySpeech,dailyBuffs} from '../js/language_daily_buff_core.js';
import {installNpcCatalog} from '../js/adventure_npc_core.js';
import {installIslandEncounters} from '../js/adventure_island_encounters_core.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {installDungeonIndex,installDungeons,enterDungeon,leaveDungeon} from '../js/adventure_dungeons_core.js';
import {claimTowerReward,towerRecord,journeyParty} from '../js/adventure_dungeon_journeys_core.js';
import {startCoopRun} from '../js/adventure_coop_core.js';
import {makeSocialSnapshot} from '../js/adventure_social_core.js';
import {presetDeck} from '../js/combat_presets_core.js';
import {splitRoleSave,joinRoleSave} from '../js/adventure_storage_core.js';
import {checkedProgress} from '../js/adventure_cloud_core.js';
import * as A from '../js/adventure_core.js';
import * as P from '../js/combat_pve_core.js';
import * as W from '../js/adventure_world_core.js';
import {createCloudClient} from '../js/adventure_cloud.js';
import {addRole,emptyRoles} from '../js/adventure_roles_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../data/'+p+'.json',import.meta.url)));
const {content,dataset}=installExpansion(read('adventure/chapter'),read('adventure/combat'),read('adventure/pets'),read('adventure/shop-candidates'),read('kids/cards'),read('kids/charms'));
content.worldMaps=Object.fromEntries(Object.entries(content.worldMapIndex.islands).map(([id,row])=>[id,JSON.parse(fs.readFileSync(new URL('../'+row.file,import.meta.url)))]));
installIslandEncounters(content,dataset,read('adventure/island-encounters'),read('kids/cards'));
installNpcCatalog(content,read('adventure/npc-catalog'));
content.dungeonJourneys=read('adventure/dungeon-journeys');
installDungeonIndex(content,read('adventure/dungeon-index'));
const index=structuredClone(content.dungeons.filter(d=>d.kind));
installDungeons(content,dataset,read('adventure/dungeons'),read('kids/cards'));
const tower=content.dungeons.find(d=>d.id==='journey:tower-camp');
function victory(s){
    const d=content.dungeons.find(d=>d.id===s.zone),run=(s.coopRun?.runs||s.dungeonRuns)[s.zone];
    const a=d.arenas.find(a=>!run.cleared.includes(a.id));A.beginEncounter(s,content,a.id);
    const b=P.restorePveBattle(dataset,content,s.pendingEncounter);
    assert.deepEqual(checkedProgress(s,content,dataset).battle.sides.far.map(u=>u.maxHp),b.sides.far.map(u=>u.maxHp));
    b.finished=true;b.winner='near';A.settleEncounter(s,content,b);return b;
}
test('six islands each have two reachable story entrances and a capped tower',()=>{
    assert.equal(index.length,18);
    for(const zone of ['camp','town','fire','ice','desert','dark']){
        const save=A.createAdventure(content);save.zone=zone;save.position={...content.worldMaps[zone].spawn};
        const world=W.createWorld(zone,content,save),entries=world.landmarks.filter(e=>e.dungeonId);
        assert.equal(entries.length,3,zone);
        for(const e of entries){assert.ok(W.walkable(world,e.x,e.y),e.name);assert.ok(W.findPath(world,save.position,e).length,e.name);}
    }
    for(const light of index){
        const d=content.dungeons.find(d=>d.id===light.id);
        assert.deepEqual(light.arenas.map(a=>a.id),d.arenas.map(a=>a.id));
        if(d.kind==='tower'){
            assert.ok(d.floors>=10&&d.floors<=100);let last=0;
            for(const a of d.arenas){const hp=content.monsters[a.monsterIds[0]].hp;assert.ok(hp>last);last=hp;}
            assert.equal(content.worldMaps[d.id].h,light.mapInfo.h);
        }else assert.ok(d.story.length>=3&&d.arenas.every(a=>a.monsterIds.length===d.partySize));
    }
});
test('solo and cooperative wins advance one shared tower; resume and rewards survive split storage',()=>{
    const s=A.createAdventure(content);s.dungeonMode=1;enterDungeon(s,content,tower.id);
    assert.equal(victory(s).sides.far.length,1);assert.equal(towerRecord(s,tower.id).floor,1);leaveDungeon(s,content);
    const profile={id:'tower-ally',name:'同行伙伴',kind:'companion',school:'life',level:1,appearance:'girl',snapshot:makeSocialSnapshot({id:'tower-ally',name:'同行伙伴',school:'life',level:1,isBot:true,deck:presetDeck(dataset,'life',{maxLevel:1}),stats:{}},dataset)};
    startCoopRun(s,[profile],dataset,tower,A.playerSpec(s,content));s.dungeonMode=2;enterDungeon(s,content,tower.id);
    assert.equal(s.coopRun.runs[tower.id].cleared.length,1);
    assert.equal(victory(s).sides.far.length,2);assert.equal(towerRecord(s,tower.id).floor,2);
    leaveDungeon(s,content);s.dungeonMode=1;enterDungeon(s,content,tower.id,{restart:true});
    assert.equal(s.dungeonRuns[tower.id].cleared.length,2);
    while(towerRecord(s,tower.id).floor<10)victory(s);
    assert.throws(()=>claimTowerReward(s,content,tower.id,20));
    const before=s.inventory[100],reward=claimTowerReward(s,content,tower.id,10);
    assert.equal(s.inventory[100],before+reward);assert.equal(reward,1500);
    assert.throws(()=>claimTowerReward(s,content,tower.id,10));
    const parts=splitRoleSave(s);assert.equal(parts.state.towerRecords,undefined);assert.equal(parts.records.towerRecords,undefined);
    assert.deepEqual(parts.towers.towerRecords,s.towerRecords);
    const restored=A.parseSave(joinRoleSave(parts.state,parts,content),content);
    assert.deepEqual(restored.towerRecords,s.towerRecords);
    assert.throws(()=>A.parseSave({...restored,towerRecords:{[tower.id]:{floor:11,claimed:[]}}},content));
    assert.throws(()=>A.parseSave({...restored,towerRecords:{[tower.id]:{floor:9,claimed:[10]}}},content));
});
test('tower lineup size follows the arranged party instead of a separate headcount',()=>{
    assert.equal(journeyParty({dungeonMode:1},tower,[{id:'hero'},{id:'pet1'},{id:'pet2'}]).length,3);
    assert.equal(journeyParty({dungeonMode:4},tower,[{id:'hero'}]).length,1);
});
test('elite party sizes are enforced and larger parties use the selected seats',()=>{
    const d=content.dungeons.find(d=>d.kind==='elite'&&d.partySize===2);
    assert.throws(()=>journeyParty({},d,[{id:'hero'}]),/2/);
    assert.equal(journeyParty({},d,[{id:'hero'},{id:'pet1'},{id:'pet2'}]).length,2);
});

test('each tower has an independent verified workspace file; unchanged towers reuse their reference',async()=>{
    const remote=new Map(),writes=[];let serial=100,failTower=false;
    const uuid=()=>`12345678-1234-1234-1234-${String(++serial).padStart(12,'0')}`;
    const store={getUsername:()=> 'journey-test',isUseLocal:()=>false,getRemotePagePath:p=>'journey-test/edunotes/store/HaqiAdventure/'+p,
    };
    const sdk={token:'test-only',username:'journey-test',getUserProfile:async()=>({username:'journey-test'}),onAuthStateChange:()=>()=>{},personalPageStore:{withWorkspace:()=>store},
        loadPage:async opts=>{const key=opts.sitePath+'/'+opts.pagePath;if(!remote.has(key))throw Error('Page not found: '+key);return {success:true,content:remote.get(key)};},
        getFileByFullPath:async(p,_,cache)=>{assert.equal(cache,true);return remote.get(p)??null;}};
    sdk.editFileByFullPath=async(full,text,_,cache)=>{assert.equal(cache,true);const p=full.slice(store.getRemotePagePath('').length);if(failTower&&p.includes('/towers/'))return {success:false};writes.push(p);remote.set(full,text);return {success:true};};
    directCacheStore(store,sdk);
    const make=()=>createCloudClient({content,dataset,loadSDK:async()=>sdk,uuid});
    const c=make();await c.connect();const roleId=uuid(),catalog=addRole(emptyRoles(),roleId,A.createAdventure(content),1),s=catalog.roles[0].save;
    s.towerRecords={[tower.id]:{floor:1,claimed:[]},'journey:tower-town':{floor:2,claimed:[]}};
    let revision=await c.saveRoles(catalog,null);
    const path=store.getRemotePagePath('roles/index.json'),manifest=()=>JSON.parse(remote.get(path));
    const before=manifest().catalog.roles[0].files.towers;assert.equal(Object.keys(before).length,2);
    assert.match(before[tower.id],/\/towers\/tower-camp\//);
    writes.length=0;s.towerRecords[tower.id].floor=2;s.revision++;
    revision=await c.saveRoles(catalog,revision);
    const after=manifest().catalog.roles[0].files.towers;
    assert.equal(after['journey:tower-town'],before['journey:tower-town']);assert.notEqual(after[tower.id],before[tower.id]);
    assert.equal(writes.filter(p=>p.includes('/towers/')).length,1);
    const reader=make();await reader.connect();assert.deepEqual((await reader.roles()).catalog.roles[0].save.towerRecords,s.towerRecords);
    const prior=remote.get(path);failTower=true;s.towerRecords[tower.id].floor=3;s.revision++;
    await assert.rejects(c.saveRoles(catalog,revision));assert.equal(remote.get(path),prior);
    failTower=false;
    const broken=manifest();broken.catalog.roles[0].files.towers[tower.id]=after['journey:tower-town'];remote.set(path,JSON.stringify(broken));
    const badReader=make();await badReader.connect();await assert.rejects(badReader.roles(),/路径/);
});

// The award must survive deterministic replay without changing the underlying player/equipment snapshot.
test('language entry buff replays identically, settles to base health and clears on exit',()=>{
    const s=A.createAdventure(content);s.dungeonMode=1;enterDungeon(s,content,tower.id);
    s.dungeonLanguageBuff={dungeonId:tower.id,lines:tower.story.filter(l=>l.role==='player').map(l=>l.id)};
    A.beginEncounter(s,content,tower.arenas[0].id);
    const buffed=P.restorePveBattle(dataset,content,s.pendingEncounter),plain=P.restorePveBattle(dataset,content,{...s.pendingEncounter,languageBuff:null});
    assert.ok(buffed.unitsById.hero.maxHp>plain.unitsById.hero.maxHp);
    assert.equal(buffed.unitsById.hero.stats.damagePct.all,(plain.unitsById.hero.stats.damagePct.all||0)+1);
    assert.deepEqual(checkedProgress(s,content,dataset).battle.unitsById.hero.languageBuff,{hp:1,attack:1,defense:1});
    const forged=structuredClone(s);forged.pendingEncounter.languageBuff.hp=99;assert.throws(()=>A.parseSave(forged,content));
    buffed.finished=true;buffed.winner='near';A.settleEncounter(s,content,buffed);
    assert.equal(s.heroHp,plain.unitsById.hero.maxHp);leaveDungeon(s,content);assert.equal(s.dungeonLanguageBuff,undefined);
    enterDungeon(s,content,tower.id);assert.equal(s.dungeonLanguageBuff,undefined);
});

test('daily bonuses persist across dungeon exit and midnight does not invalidate a frozen battle',()=>{
 const s=A.createAdventure(content);for(let i=0;i<40;i++)awardDailySpeech(s,content,String(i));
 s.dungeonMode=1;enterDungeon(s,content,tower.id);assert.equal(dailyBuffs(s).hp,10);
 A.beginEncounter(s,content,tower.arenas[0].id);
 assert.equal(s.pendingEncounter.dailyLanguageVersion,1);
 const battle=P.restorePveBattle(dataset,content,s.pendingEncounter);
 assert.deepEqual(battle.unitsById.hero.languageBuff,{hp:10,attack:10,defense:10,powerPip:10});
 delete s.dailyLanguageBuff;
 assert.deepEqual(checkedProgress(s,content,dataset).battle.unitsById.hero.languageBuff,battle.unitsById.hero.languageBuff);
 const forged=structuredClone(s);forged.pendingEncounter.languageBuff.hp=11;assert.throws(()=>A.parseSave(forged,content));
 battle.finished=true;battle.winner='near';A.settleEncounter(s,content,battle);
 awardDailySpeech(s,content,'next-day');leaveDungeon(s,content);assert.equal(Object.values(dailyBuffs(s)).reduce((a,b)=>a+b),1);
});
