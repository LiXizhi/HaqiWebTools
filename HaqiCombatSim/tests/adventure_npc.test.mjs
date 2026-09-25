import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {installNpcCatalog,npcOffers,npcOfferStatus} from '../js/adventure_npc_core.js';
import {createWorld,walkable,nearestInteraction,nearbyWorldObjects,distance} from '../js/adventure_world_core.js';
import {projectRuntimeData} from '../scripts/package_runtime_data.mjs';
import {createAdventure,applyAction,parseSave} from '../js/adventure_core.js';
import {persistReward} from '../js/adventure_reward_persistence.js';
import {installNpcArt} from '../js/adventure_npc_art_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../data/'+p,import.meta.url)));
const {content:c}=installExpansion(read('adventure/chapter.json'),read('adventure/combat.json'),read('adventure/pets.json'),read('adventure/shop-candidates.json'),read('kids/cards.json'),read('kids/charms.json'));
installNpcCatalog(c,read('adventure/npc-catalog.json'));
c.worldMaps=Object.fromEntries(['camp','town','fire','ice','desert','dark'].map(z=>[z,read(`adventure/maps/${z}.json`)]));
const npc=id=>c.npcCatalog.npcs.find(n=>n.id===id);
const action=(n,o)=>({type:'npc-purchase',npcInstanceId:n.instanceId,offerId:o.id});
test('catalogue fallback shops are not mistaken for explicit service conditions',()=>{
    const save=createAdventure(c);
    for(const [npcId,itemId] of [[36202,17307],[30415,2115]]){
        const offer=npcOffers(c,npc(npcId)).find(row=>row.itemId===itemId);
        assert.ok(offer);
        assert.equal(offer.gated,false);
        assert.notEqual(npcOfferStatus(save,c,offer).reason,'原版服务开放条件尚未接入');
        assert.equal(npcOfferStatus(save,c,{...offer,gated:true}).allowed,false);
    }
});
test('real material exchanges grant permanent hats and eggs with limits and runtime parity',()=>{
    for(const catalog of [c.npcCatalog,projectRuntimeData('adventure/npc-catalog.json',c.npcCatalog)]){
        const content=structuredClone(c);content.npcCatalog=catalog;
        for(const [npcId,itemId,costId,count] of [[30415,2115,17302,200],[30415,2116,17302,20],[36202,17307,17306,1]]){
            const resident=npc(npcId),save=createAdventure(content);save.zone=resident.zone;
            const offer=npcOffers(content,resident).find(row=>row.itemId===itemId);
            save.inventory[itemId]=0;save.inventory[costId]=count-1;
            const before=JSON.stringify(save);
            assert.match(npcOfferStatus(save,content,offer).reason,/需要/);
            assert.throws(()=>applyAction(save,content,action(resident,offer)));
            assert.equal(JSON.stringify(save),before);
            save.inventory[costId]=count;
            assert.equal(npcOfferStatus(save,content,offer).allowed,true);
            applyAction(save,content,action(resident,offer));
            assert.equal(save.inventory[costId],0);assert.equal(save.inventory[itemId],1);
            assert.equal(parseSave(JSON.stringify(save),content).inventory[itemId],1);
            if(itemId!==17307){
                assert.ok(save.equipmentInstances.some(row=>row.gsid===itemId));
                save.inventory[costId]=count;
                assert.match(npcOfferStatus(save,content,offer).reason,/最多持有/);
            }
        }
    }
});
test('all resident shop offers are audited and special exchanges fail without mutation',()=>{
    const save=createAdventure(c);save.level=50;save.trainingPointLevel=50;
    const reasons={};
    for(const resident of c.npcCatalog.npcs){
        for(const offer of npcOffers(c,resident).filter(row=>row.kind==='shop')){
            const status=npcOfferStatus(save,c,offer);
            const reason=status.allowed?'可兑换':status.reason.startsWith('需要')?'材料不足':status.reason;
            reasons[reason]=(reasons[reason]||0)+1;
            assert.notEqual(reason,'原版服务开放条件尚未接入');
        }
    }
    console.log('NPC shop audit',reasons);
    const resident=npc(30415),offer=npcOffers(c,resident).find(row=>row.itemId===2115);
    save.zone=resident.zone;save.inventory[17302]=200;
    const before=JSON.stringify(save);
    assert.throws(()=>persistReward(save,c,action(resident,offer),{}, {getItem:()=>null,setItem:()=>{throw Error('quota');}}),/quota/);
    assert.equal(JSON.stringify(save),before);
    for(const mutate of [
        exchange=>exchange.rewards[0].p=500,
        exchange=>exchange.rewards.push({...exchange.rewards[0]}),
        exchange=>exchange.costs[0]={id:984,count:1},
        exchange=>exchange.costs[0]={id:2116,count:1},
        exchange=>exchange.costs[0]={id:50362,count:1},
        exchange=>exchange.prerequisites.push({id:-1000,count:1}),
    ]){
        const content=structuredClone(c);mutate(content.npcCatalog.exchanges[offer.exchangeId]);
        assert.throws(()=>applyAction(save,content,action(resident,offer)));
        assert.equal(JSON.stringify(save),before);
    }
    const timed=npcOffers(c,resident).find(row=>c.items[row.itemId].name.includes('(3天)'));
    assert.ok(timed);
    assert.match(npcOfferStatus(save,c,timed).reason,/限时/);
    assert.ok(npcOfferStatus(save,c,timed).price);
});
test('magic-bean exchanges debit the local balance and survive save validation',()=>{
    const content=structuredClone(c),resident=npc(30415),save=createAdventure(content);
    const offer=npcOffers(content,resident).find(row=>row.itemId===2115);
    content.npcCatalog.exchanges[offer.exchangeId].costs=[{id:984,count:10}];
    save.zone=resident.zone;save.inventory[984]=9;save.inventory[2115]=0;
    const before=JSON.stringify(save);
    assert.throws(()=>applyAction(save,content,action(resident,offer)),/需要/);
    assert.equal(JSON.stringify(save),before);
    save.inventory[984]=10;
    applyAction(save,content,action(resident,offer));
    assert.equal(save.inventory[984],0);
    assert.equal(save.inventory[2115],1);
    assert.equal(parseSave(JSON.stringify(save),content).inventory[2115],1);
});
test('original fisherman magic-bean prices and veteran ownership conditions work in packaged data',()=>{
    for(const catalog of [c.npcCatalog,projectRuntimeData('adventure/npc-catalog.json',c.npcCatalog)]){
        const content=structuredClone(c);content.npcCatalog=catalog;
        for(const [npcId,itemId,price] of [[30389,17466,3],[30389,17113,2]]){
            const resident=npc(npcId),offer=npcOffers(content,resident).find(row=>row.itemId===itemId);
            const save=createAdventure(content);save.zone=resident.zone;save.inventory[984]=price;
            assert.equal(npcOfferStatus(save,content,offer).allowed,true);
            applyAction(save,content,action(resident,offer));
            assert.equal(save.inventory[984],0);assert.equal(save.inventory[itemId],1);
            assert.equal(parseSave(JSON.stringify(save),content).inventory[itemId],1);
            assert.throws(()=>applyAction(save,content,action(resident,offer)),/需要/);
        }
        const resident=npc(30550),offer=npcOffers(content,resident).find(row=>row.itemId===2234);
        const save=createAdventure(content);save.zone=resident.zone;save.inventory[17484]=2;
        assert.match(npcOfferStatus(save,content,offer).reason,/需持有/);
        save.inventory[2075]=1;
        applyAction(save,content,action(resident,offer));
        assert.equal(save.inventory[2075],1);assert.equal(save.inventory[17484],0);assert.equal(save.inventory[2234],1);
        assert.ok(parseSave(JSON.stringify(save),content).equipmentInstances.some(row=>row.gsid===2234));
    }
});
test('member-only equipment requires current verified membership and debits original medals',()=>{
    const resident=npc(30431),offer=npcOffers(c,resident).find(row=>row.itemId===2383);
    const save=createAdventure(c);save.zone=resident.zone;save.inventory[17215]=590;
    const now=Date.parse('2026-09-24T12:00:00Z');
    const before=JSON.stringify(save);
    assert.throws(()=>applyAction(save,c,action(resident,offer)),/会员/);
    assert.throws(()=>applyAction(save,c,action(resident,offer),{keepworkVip:true,now,expiresAt:'2026-09-23'}),/会员/);
    assert.equal(JSON.stringify(save),before);
    applyAction(save,c,action(resident,offer),{keepworkVip:true,now,expiresAt:'2026-10-24'});
    assert.equal(save.inventory[17215],0);assert.equal(save.inventory[2383],1);
    assert.equal(parseSave(JSON.stringify(save),c).inventory[2383],1);
});
test('six original island catalogues retain all instances and place residents deterministically',()=>{
    assert.deepEqual(c.npcCatalog.report.islands,{camp:27,town:218,fire:9,ice:14,desert:11,dark:13});
    assert.equal(c.npcCatalog.shops.length,1764);
    for(const z of Object.keys(c.worldMaps)){
        const world=createWorld(z,c),again=createWorld(z,c);
        assert.deepEqual(world.npcs,again.npcs);
        assert.equal(world.npcs.filter(n=>!n.worldMapGuide).length,c.npcCatalog.npcs.filter(n=>n.zone===z&&n.hidden!==true).length);
        for(const n of world.npcs){assert.ok(Number.isFinite(n.x)&&Number.isFinite(n.y));if(!world.layout.npcPositions[n.id])assert.ok(walkable(world,n.x,n.y),`${z} ${n.id}`);}
    }
});
test('harbors receive authored captains and restore missing visiting guides with their art',()=>{
    const content=structuredClone(c);
    installNpcArt(content,read('adventure/npc-art.json'));
    const before=JSON.stringify(content);
    for(const zone of Object.keys(content.worldMaps)){
        const world=createWorld(zone,content),harbor=world.buildings.find(b=>b.frame==='harbor');
        const captains=world.npcs.filter(n=>(n.id===36205||n.name==='法斯特船长')&&(harbor?distance(n,harbor)<290:distance(n,world.portal)<=160));
        assert.equal(captains.length,1,zone);
        const captain=captains[0],road=world.paths.find(p=>p.harborAccess);
        const expected=road?[road.b.x,road.b.y]:world.layout.npcPositions[36205]||[world.portal.x,world.portal.y];
        assert.deepEqual([captain.x,captain.y],expected);
        assert.deepEqual(captain.portrait,content.npcs[36205].portrait);
        assert.ok(walkable(world,captain.x,captain.y));
        assert.equal(nearestInteraction(world,captain).id,captain.id);
        assert.ok(nearbyWorldObjects(world,{x:captain.x-1,y:captain.y-1,w:2,h:2}).some(n=>n.id===captain.id));
    }
    assert.equal(JSON.stringify(content),before);
    delete content.worldMaps.fire.visitingNpcs;
    content.npcCatalog.npcs=content.npcCatalog.npcs.filter(n=>n.zone!=='fire'||(n.id!==36205&&n.name!=='法斯特船长'));
    const world=createWorld('fire',content),captain=world.npcs.find(n=>n.id===36205);
    assert.deepEqual({x:captain.x,y:captain.y},world.paths.find(p=>p.harborAccess).b);
    assert.equal(nearestInteraction(world,captain).id,36205);
});
test('unfinished town residents are hidden, retained in the catalogue and explicitly restorable',()=>{
    const resident=npc(30162);
    assert.equal(resident.hidden,true);
    const world=createWorld('town',c);
    assert.ok(!world.npcs.some(n=>n.instanceId===resident.instanceId));
    for(const id of [30081,30112,30525,30398])assert.ok(world.npcs.some(n=>n.id===id));
    const restored=structuredClone(c);
    restored.npcCatalog.npcs.find(n=>n.instanceId===resident.instanceId).hidden=false;
    const visible=createWorld('town',restored).npcs.find(n=>n.instanceId===resident.instanceId);
    assert.ok(visible);
    assert.notEqual(nearestInteraction(world,visible)?.instanceId,resident.instanceId);
    assert.ok(!nearbyWorldObjects(world,{x:0,y:0,w:world.w,h:world.h}).some(n=>n.instanceId===resident.instanceId));
    const configured=read('adventure/npc-catalog.json');
    configured.npcs.find(n=>n.instanceId===resident.instanceId).hidden=false;
    const packed=projectRuntimeData('adventure/npc-catalog.json',configured);
    for(const catalog of [configured,packed]){
        const fresh=read('adventure/chapter.json');installNpcCatalog(fresh,catalog);
        assert.equal(fresh.npcCatalog.npcs.find(n=>n.instanceId===resident.instanceId).hidden,false);
    }
});
test('original mentor menus enforce own school, cross-school points, level and duplicate learning',()=>{
    const n=npc(30398),offer=npcOffers(c,n).find(o=>o.itemId===22121);
    const own=createAdventure(c,{school:'storm'});own.zone='town';own.cards={};
    assert.equal(npcOfferStatus(own,c,offer).reason,'免费');
    applyAction(own,c,action(n,offer));assert.ok(own.cards[c.cardItems[22121]]);
    assert.throws(()=>applyAction(own,c,action(n,offer)),/已学会/);
    const other=createAdventure(c,{school:'fire'});other.zone='town';other.cards={};
    assert.equal(npcOfferStatus(other,c,offer).allowed,false);
    other.level=10;other.trainingPointLevel=10;
    applyAction(other,c,action(n,offer));assert.equal(other.trainingPointsSpent,1);
    const white=npcOffers(c,npc(30112)).find(o=>o.kind==='mentor');
    assert.match(npcOfferStatus(other,c,white).reason,/50级/);
    other.level=50;other.trainingPointLevel=50;
    applyAction(other,c,action(npc(30112),white));assert.ok(other.cards[c.cardItems[22377]]);
});
test('real white-dragon rune exchange debits exact costs, persists and rejects insufficient funds and wrong island',()=>{
    const n=npc(30112),save=createAdventure(c);save.zone='town';save.level=50;save.trainingPointLevel=50;save.inventory[17213]=100000;save.inventory[100]=100000;save.inventory[17143]=100000;
    const offer=npcOffers(c,n).find(o=>o.kind==='shop'&&npcOfferStatus(save,c,o).allowed);
    assert.ok(offer,'at least one original rune is purchasable');
    const status=npcOfferStatus(save,c,offer),before=structuredClone(save);
    applyAction(save,c,action(n,offer));
    for(const [id,count] of status.costs)assert.equal(save.inventory[id],before.inventory[id]-count);
    assert.equal(save.inventory[offer.itemId],(before.inventory[offer.itemId]||0)+status.reward.cnt);
    assert.equal(parseSave(JSON.stringify(save),c).inventory[offer.itemId],save.inventory[offer.itemId]);
    for(const [id] of status.costs)save.inventory[id]=0;
    const unchanged=JSON.stringify(save);assert.throws(()=>applyAction(save,c,action(n,offer)));assert.equal(JSON.stringify(save),unchanged);
    save.zone='camp';assert.throws(()=>applyAction(save,c,action(n,offer)),/岛屿/);
    const original=JSON.stringify(before);
    assert.throws(()=>persistReward(before,c,action(n,offer),{}, {getItem:()=>null,setItem:()=>{throw Error('quota');}}),/quota/);
    assert.equal(JSON.stringify(before),original);
});
test('fire-island optional teachers preserve actual courses and unsupported offers remain blocked',()=>{
    for(const id of [30510,30511])assert.ok(npcOffers(c,npc(id)).some(o=>o.kind==='mentor'));
    const save=createAdventure(c);save.level=50;save.trainingPointLevel=50;
    save.cards={};save.zone='fire';
    const woody=npc(30510),own=npcOffers(c,woody).find(o=>o.itemId===22120);
    assert.equal(npcOfferStatus(save,c,own).reason,'免费');
    applyAction(save,c,action(woody,own));assert.ok(save.cards[c.cardItems[22120]]);
    const unsupported=c.npcCatalog.shops.find(o=>o.dailyLimit>=0);
    assert.equal(npcOfferStatus(save,c,{...unsupported,kind:'shop'}).allowed,false);
    const options=npcOffers(c,npc(30398)).find(o=>o.type==='optionskill');
    assert.match(npcOfferStatus(save,c,options).reason,/火鸟岛/);
});
