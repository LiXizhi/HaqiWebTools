import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {createAdventure,beginEncounter,playerSpec} from '../js/adventure_core.js';
import {settleLocalBattle,createLocalFormation,moveLocalSeat,localParty,localHumanResources,createLocalReady,fitLocalCamera,constrainLocalPosition,wideEnough} from '../js/adventure_local_coop_core.js';
import {restorePveBattle,playPveRound} from '../js/combat_pve_core.js';
import {startRedMushroom,playRedMushroom,restoreRedMushroom} from '../js/adventure_red_mushroom_core.js';
import {defaultParams} from '../js/combat_params_core.js';
import {gatheringValue,gatheringAllocation,collectGathering,gatheringNodes} from '../js/adventure_gathering_core.js';
import {DEFAULT_LOCAL_KEYS,changeLocalKey,localKeyAction,normalizeLocalKeys} from '../js/local_controls_core.js';
import {createRoleStore} from '../js/adventure_roles.js';
import {createRuntimeStore} from '../js/adventure_runtime_store.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../data/'+p,import.meta.url)));
const {content,dataset}=installExpansion(read('adventure/chapter.json'),read('adventure/combat.json'),read('adventure/pets.json'),read('adventure/shop-candidates.json'),read('kids/cards.json'),read('kids/charms.json'));
const saves=()=>[createAdventure(content,{name:'甲',seed:11,starter:'dragon_green'}),createAdventure(content,{name:'乙',seed:22,school:'ice',starter:'dragon_green'})];
function checkpoint(){const ss=saves(),formation=createLocalFormation(['a','b'],ss),party=localParty(formation,ss,content);beginEncounter(ss[0],content,'fire-scout');return {...ss[0].pendingEncounter,party,player:party[0],localHumans:localHumanResources(ss,content)};}

test('shared four-seat formation swaps both heroes without changing either solo formation',()=>{
    const ss=saves(),before=structuredClone(ss),f=createLocalFormation(['a','b'],ss),next=moveLocalSeat(f,0,3);
    assert.equal(next.slots[3].owner,0);assert.equal(next.slots[1].owner,1);assert.equal(next.slots.length,4);
    const party=localParty(next,ss,content);assert.equal(party[0].id,'hero');assert.equal(party[0].slot,3);assert.equal(party[1].slot,1);assert.deepEqual(ss,before);
});
test('dual ready gate allows cancellation, ignores dead/frozen actors and resets each round',()=>{
    const r=createLocalReady(),ids=['a','b'],units={a:{hp:100},b:{hp:100}};r.reset(1);r.submit('a',{pass:true},ids);assert.equal(r.complete(ids,units),false);
    r.cancel('a');r.submit('b',{pass:true},ids);assert.equal(r.complete(ids,units),false);units.a.freezeRounds=1;assert.equal(r.complete(ids,units),true);assert.deepEqual(r.decisions(ids,units),{a:{pass:true},b:{pass:true}});r.reset(2);assert.deepEqual(r.choices,{});
});
test('PvE validates both human picks before advancing and replays joint turns deterministically',()=>{
    const cp=checkpoint(),b=restorePveBattle(dataset,content,cp),before=structuredClone(b.events),rng=b.rng.state();
    assert.throws(()=>playPveRound(b,{humanDecisions:{hero:{pass:true}}}),/两位/);assert.deepEqual(b.events,before);assert.equal(b.rng.state(),rng);
    assert.throws(()=>playPveRound(b,{humanDecisions:{hero:{pass:true},'local-hero-1':{key:'missing',seq:999,targetId:'mob0'}}}));assert.deepEqual(b.events,before);
    for(let i=0;i<3&&!b.finished;i++){playPveRound(b,{aiVersion:1,humanDecisions:{hero:{pass:true},'local-hero-1':{pass:true}}});cp.decisions.push(structuredClone(b.lastDecision));}
    const restored=restorePveBattle(dataset,content,cp);assert.deepEqual(restored.events,b.events);assert.equal(restored.rng.state(),b.rng.state());assert.equal(restored.completedDecisions,cp.decisions.length);
});
test('same-side PvP honors two manual choices and preserves v4 replay',()=>{
    const ss=saves(),party=localParty(moveLocalSeat(createLocalFormation(['a','b'],ss),0,3),ss,content);
    const match=startRedMushroom(dataset,party,2,32,{scale:1});assert.deepEqual(match.arena.localHumanIds,['hero','local-hero-1']);
    assert.equal(match.arena.unitsById.hero.slot,3);
    playRedMushroom(match,{humanDecisions:{hero:{pass:true},'local-hero-1':{pass:true}}});
    const restored=restoreRedMushroom(dataset,match.replay);assert.deepEqual(restored.arena.events,match.arena.events);assert.equal(restored.arena.rng.state(),match.arena.rng.state());
});
test('camera fit and move constraint keep both characters in the padded view',()=>{
    assert.equal(wideEnough(1280,720),true);assert.equal(wideEnough(1200,720),false);
    const positions=[{x:100,y:100},{x:1300,y:500}],c=fitLocalCamera(positions,1280,720);
    for(const p of positions){assert.ok(Math.abs(p.x-c.center.x)*c.scale<=520);assert.ok(Math.abs(p.y-c.center.y)*c.scale<=230);}
    assert.equal(constrainLocalPosition({x:10000,y:100},positions[0],1280,720),false);
    const resized=fitLocalCamera([{x:0,y:0},{x:2400,y:800}],1280,720);assert.ok(1200*resized.scale<=520);assert.ok(400*resized.scale<=230);
});

test('local resources reject malformed checkpoints and settlement retry cannot repeat rewards',()=>{
    const cp=checkpoint(),invalid=structuredClone(cp);invalid.localHumans['local-hero-1'].runes=[{itemId:1,count:-1,key:'bad'}];
    assert.throws(()=>restorePveBattle(dataset,content,invalid),/资源检查点/);
    const b=restorePveBattle(dataset,content,cp),ss=saves(),formation=createLocalFormation(['a','b'],ss);
    b.finished=true;b.winner='near';
    const pending={base:cp,receipt:'local:test-receipt'},next=settleLocalBattle(ss,formation,content,b,pending,{now:1});
    assert.ok(next.every((s,i)=>s.xp>ss[i].xp&&s.inventory[100]>(ss[i].inventory[100]||0)));
    assert.deepEqual(settleLocalBattle(next,formation,content,b,pending,{now:2}),next);
    const retreated=settleLocalBattle(ss,formation,content,b,{base:cp,receipt:'local:retreat'},{retreat:true});
    assert.deepEqual(settleLocalBattle(retreated,formation,content,b,{base:cp,receipt:'local:retreat'},{retreat:true}),retreated);
});
test('gathering is deterministic, daily deduplicated across roles, and splits odd proceeds without loss',()=>{
    const params=defaultParams('kids').adventure,config=read('adventure/gathering.json');
    const nodes=[{id:'legacy-test',itemId:'stone',units:1}];
    let state={day:'2026-10-06',depleted:{},bags:{}};state=collectGathering(state,nodes[0],'a','2026-10-06');assert.throws(()=>collectGathering(state,nodes[0],'b','2026-10-06'));
    assert.throws(()=>collectGathering(state,nodes[0],'b','2026-10-05'));state=collectGathering(state,nodes[0],'b','2026-10-07');assert.ok(state.bags.b);
    assert.equal(gatheringValue({ore:2,stone:1},params),50);assert.equal(gatheringValue({ore:2,stone:1,flower:1},params),55);
    assert.deepEqual(gatheringAllocation(55,'a',['a','b'],'split'),{a:28,b:27});assert.deepEqual(gatheringAllocation(55,'a',['a','b'],'other'),{b:55});
});
test('configurable keys reject conflicts and preserve player ownership',()=>{
    assert.throws(()=>changeLocalKey(DEFAULT_LOCAL_KEYS,1,'confirm','KeyW'));
    const keys=changeLocalKey(DEFAULT_LOCAL_KEYS,1,'confirm','NumpadEnter');assert.deepEqual(localKeyAction(keys,'NumpadEnter'),{owner:1,action:'confirm'});assert.equal(localKeyAction(keys,'Enter'),null);assert.deepEqual(normalizeLocalKeys(keys),keys);
});
test('role-scoped pair commits retain both roles and quota failure changes neither',()=>{
    const map=new Map();let n=0,fail=false;const storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>{if(fail)throw Error('quota');map.set(k,v);}};
    const store=createRoleStore({content,dataset,storage,runtimeStore:createRuntimeStore({indexedDB:null}),uuid:()=>`12345678-1234-1234-1234-${String(++n).padStart(12,'0')}`});store.open();const ss=saves(),a=store.create(ss[0]),b=store.create(ss[1]);
    ss[0].inventory[100]=101;ss[1].inventory[100]=202;store.commitRoles({[a]:ss[0],[b]:ss[1]});assert.equal(store.catalog.roles[0].save.inventory[100],101);assert.equal(store.catalog.roles[1].save.inventory[100],202);
    const before=store.checkpoint();fail=true;ss[0].inventory[100]=303;assert.throws(()=>store.commitRoles({[a]:ss[0],[b]:ss[1]}),/quota/);assert.equal(store.checkpoint(),before);
});
