import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {installNpcCatalog,npcOffers,npcOfferStatus} from '../js/adventure_npc_core.js';
import {createWorld,walkable} from '../js/adventure_world_core.js';
import {createAdventure,applyAction,parseSave} from '../js/adventure_core.js';
import {persistReward} from '../js/adventure_reward_persistence.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../data/'+p,import.meta.url)));
const {content:c}=installExpansion(read('adventure/chapter.json'),read('adventure/combat.json'),read('adventure/pets.json'),read('adventure/shop-candidates.json'),read('kids/cards.json'),read('kids/charms.json'));
installNpcCatalog(c,read('adventure/npc-catalog.json'));
c.worldMaps=Object.fromEntries(['camp','town','fire','ice','desert','dark'].map(z=>[z,read(`adventure/maps/${z}.json`)]));
const npc=id=>c.npcCatalog.npcs.find(n=>n.id===id);
const action=(n,o)=>({type:'npc-purchase',npcInstanceId:n.instanceId,offerId:o.id});
test('six original island catalogues retain all instances and place residents deterministically',()=>{
    assert.deepEqual(c.npcCatalog.report.islands,{camp:27,town:218,fire:9,ice:14,desert:11,dark:13});
    assert.equal(c.npcCatalog.shops.length,1764);
    for(const z of Object.keys(c.worldMaps)){
        const world=createWorld(z,c),again=createWorld(z,c);
        assert.deepEqual(world.npcs,again.npcs);
        assert.equal(world.npcs.length,c.npcCatalog.report.islands[z]);
        for(const n of world.npcs){assert.ok(Number.isFinite(n.x)&&Number.isFinite(n.y));if(!world.layout.npcPositions[n.id])assert.ok(walkable(world,n.x,n.y),`${z} ${n.id}`);}
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
