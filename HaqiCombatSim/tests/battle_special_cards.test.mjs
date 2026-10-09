import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createArena,startCombat,playTurn,validTargets,checkFinish} from '../js/combat_arena_core.js';
import {defaultParams,resolveParams} from '../js/combat_params_core.js';
import {useCard,tickDots,reviveGuardians,isSupportedType} from '../js/combat_cards_core.js';
import * as U from '../js/combat_unit_core.js';
import {battleStatusEffects} from '../js/view_adventure_overhead_status.js';
import {observeBattle} from '../js/battle_ai/haqi_adapter_core.js';
import {createPveBattle,playPveRound,pickMonsterCard,restorePveBattle} from '../js/combat_pve_core.js';
import {captureBattlePresentation} from '../js/view_battle_presentation.js';
const dataset=JSON.parse(fs.readFileSync(new URL('../data/adventure/combat.json',import.meta.url)));
const cards=JSON.parse(fs.readFileSync(new URL('../data/kids/cards.json',import.meta.url)));
const chapter=JSON.parse(fs.readFileSync(new URL('../data/adventure/chapter.json',import.meta.url)));
const freeze='Ice_Rune_SingleFreeze', guardian='Death_SingleGuardianWithImmolate_Level8', converse='Storm_Rune_StormConversePositiveWard';
function setup(options={}) {
    const p=defaultParams('kids');p.global.arenaDamageBoostPerRound=0;
    const spec=id=>({id,school:'death',level:50,maxHp:10000,deck:[{key:freeze,count:3},{key:guardian,count:3}]});
    const a=createArena({resolved:resolveParams({...dataset,cards},p),near:[spec('hero'),spec('ally')],far:[spec('foe')],seed:19,firstSide:'near',...options});
    for(const u of Object.values(a.unitsById)){u.maxHp=u.hp=10000;u.pips={normal:7,power:0};}
    return {a,hero:a.unitsById.hero,ally:a.unitsById.ally,foe:a.unitsById.foe};
}
const cast=(a,u,key,t)=>useCard(a,u,{...a.resolved.cards[key],accuracy:1000},t);

test('kids freeze applies resistance, shield and anti-chain protection; attack breaks only freeze',()=>{
    const {a,hero,foe}=setup();
    assert.equal(cast(a,hero,freeze,foe).ok,true);
    assert.equal(foe.freezeRounds,3);assert.equal(foe.antiFreezeRounds,9);
    assert.equal(U.getResist(foe,'fire',a.resolved),-80);
    assert.ok(foe.wards.some(w=>w.id===27));
    const before=foe.hp;
    cast(a,hero,'Fire_SingleAttackWithDOT_Level1',foe);
    assert.ok(foe.hp<before);assert.equal(foe.freezeRounds,0);assert.equal(foe.antiFreezeRounds,9);
    hero.pips.normal=7;cast(a,hero,freeze,foe);
    assert.equal(a.events.at(-1).success,false);assert.equal(foe.freezeRounds,0);
});
test('freeze immunity and optional sibling protection follow original preconditions',()=>{
    const {a,hero,ally,foe}=setup({applyTempAntiFreezeForPartners:true});
    foe.isMob=true;foe.template={attributes:{is_immune_to_freeze:'true'}};
    cast(a,hero,freeze,foe);assert.equal(a.events.at(-1).success,false);
    cast(a,foe,freeze,hero);assert.equal(ally.antiFreezeSiblingRounds,3);assert.equal(hero.antiFreezeSiblingRounds,0);
    const hp=hero.hp;U.takeDamage(hero,hp);assert.equal(hero.antiFreezeRounds,0);
});
test('PvE player-first freeze lasts current action and next action, PvP skips two turns',()=>{
    const {a,hero,foe}=setup();a.mode='pve';a.firstActingSide='near';
    cast(a,hero,freeze,foe);assert.equal(foe.freezeRounds,2);assert.equal(foe.antiFreezeRounds,8);
    U.validateRounds(foe);assert.equal(foe.freezeRounds,1);U.validateRounds(foe);assert.equal(foe.freezeRounds,0);
    const s=setup();startCombat(s.a);s.hero.pips.normal=7;cast(s.a,s.hero,freeze,s.foe);
    playTurn(s.a,{});playTurn(s.a,{});playTurn(s.a,{});playTurn(s.a,{});
    assert.equal(s.a.events.filter(e=>e.caster==='foe'&&e.reason==='frozen').length,2);
});
test('DOT breaks freeze before action even when absorb cancels damage',()=>{
    const {a,hero,foe}=setup();cast(a,hero,freeze,foe);U.appendAbsorb(foe,10000,33);
    foe.dots=[{cardKey:'test',casterId:hero.id,damageSchool:'fire',ticks:[{dmg:100}],buffsTarget:[]}];
    const hp=foe.hp;tickDots(a,foe);assert.equal(foe.hp,hp);assert.equal(foe.freezeRounds,0);
});
test('guardian costs self damage, survives death, revives once before deciding winner',()=>{
    const {a,hero,ally,foe}=setup();
    for(const unit of Object.values(a.unitsById))U.shuffleDeck(unit,a.rng);
    cast(a,hero,guardian,ally);assert.equal(hero.hp,8000);assert.equal(ally.guardian,true);
    U.takeDamage(hero,10000);U.takeDamage(ally,10000);
    assert.equal(checkFinish(a),false);assert.equal(ally.hp,2000);assert.equal(ally.guardian,false);
    assert.equal(a.events.at(-1).revived,true);assert.equal(ally.pips.normal,0);
    U.takeDamage(ally,10000);assert.equal(checkFinish(a),true);assert.equal(a.winner,'far');assert.ok(foe.hp>0);
});
test('guardian self sacrifice can revive caster, cap HP and honor configured revive amount',()=>{
    const {a,hero}=setup();hero.hp=100;hero.maxHp=700;
    cast(a,hero,guardian,hero);assert.equal(hero.hp,700);assert.equal(hero.guardian,false);
    a.resolved.global.guardianReviveHp=350;hero.hp=100;hero.pips.normal=7;
    cast(a,hero,guardian,hero);assert.equal(hero.hp,350);
});
test('guardian self damage consumes buffs and absorb without percentage damage/resist bonuses',()=>{
    const {a,hero,ally}=setup();hero.stats.damagePct.death=500;hero.stats.resistPct.death=90;U.appendAbsorb(hero,1500,33);
    cast(a,hero,guardian,ally);assert.equal(hero.hp,9500);assert.equal(hero.wards[0].pts,0);
    ally.speciesId='pet';assert.ok(!validTargets(a,hero,a.resolved.cards[guardian]).includes(ally));
});
test('conversion precheck is free; quality priority converts exactly one, plain shield remains per Lua',()=>{
    const {a,hero,foe}=setup();const rng=a.rng.state();
    assert.deepEqual(validTargets(a,hero,a.resolved.cards[converse]),[]);
    assert.equal(cast(a,hero,converse,foe).ok,false);assert.equal(hero.pips.normal,7);assert.equal(a.rng.state(),rng);
    foe.wards=[{id:2026},{id:1026},{id:1026}];cast(a,hero,converse,foe);
    assert.deepEqual(foe.wards.map(w=>w.id),[2026,0,1026,24]);
    foe.wards=[{id:26}];hero.pips.normal=7;cast(a,hero,converse,foe);
    assert.deepEqual(foe.wards,[{id:26}]);assert.equal(hero.pips.normal,4);
});
test('legacy battles keep unsupported results; current status and AI observation expose special states',()=>{
    const old=setup({specialCardRulesVersion:0});assert.equal(cast(old.a,old.hero,freeze,old.foe).unsupported,true);
    const {a,hero,ally,foe}=setup();cast(a,hero,freeze,foe);hero.pips.normal=7;cast(a,hero,guardian,ally);
    assert.ok(battleStatusEffects(foe,a).some(e=>e.kind==='freeze'));assert.ok(battleStatusEffects(ally,a).some(e=>e.kind==='guardian'));
    const observation=observeBattle(a,hero.id);assert.equal(observation.specialCardRulesVersion,1);assert.equal(observation.units.find(u=>u.id==='ally').guardian,true);
    U.takeDamage(ally,10000);reviveGuardians(a);assert.equal(ally.hp,2000);
});

function enrageBattle(version=1) {
    const rune='Balance_Rune_Enrage_Level1';
    return createPveBattle({dataset:{...dataset,cards},player:{id:'hero',school:'death',level:50,deck:[{key:guardian,count:2}],deckCapacity:40,deckEachCapacity:6},
        monsters:[structuredClone(chapter.monsters['water-bubble'])],seed:39,firstSide:'near',specialCardRulesVersion:version,threatRulesVersion:5,runes:[{itemId:99999,key:rune,count:2}]});
}
test('real kids Enrage data changes stats, restores HP and switches AI without mutating source',()=>{
    const a=enrageBattle(),hero=a.unitsById.hero,mob=a.unitsById.mob0,original=structuredClone(mob.template);
    mob.hp=5;mob.charms=[1];mob.pips={normal:3,power:1};mob.aiMemory={round:4,lastHp:10};
    cast(a,hero,'Balance_Rune_Enrage_Level1',mob);
    assert.equal(mob.enragedBy,'hero');assert.equal(mob.hp,500);assert.equal(mob.maxHp,500);
    assert.equal(mob.stats.powerPipPct,50);assert.equal(mob.stats.accuracyPct.ice,150);
    assert.deepEqual(mob.charms,[1]);assert.deepEqual(mob.pips,{normal:3,power:1});
    assert.equal(mob.aiMemory.round,0);assert.equal(mob.aiMemory.lastHp,500);
    const next=pickMonsterCard(a,mob);assert.equal(next.speak,'可恶的小哈奇，你竟然敢激怒我！！~~');
    assert.equal(next.key,a.resolved.enrage.ai.Level8_Mobs.sequences[0][0].card);
    assert.deepEqual(chapter.monsters['water-bubble'],original);
    assert.equal(validTargets(a,hero,a.resolved.cards.Balance_Rune_Enrage_Level1).length,0);
    mob.template.speciesId='water';assert.equal(validTargets(a,hero,a.resolved.cards.Balance_Rune_CatchPetCard_General).length,0);
});
test('Enrage rejects wrong levels, disabled mobs, forbidden difficulty, bosses and PvP without consuming',()=>{
    for(const mutate of [a=>{a.unitsById.mob0.level=11;},a=>{a.unitsById.mob0.template.attributes.enrage_enable='false';},
        a=>{a.unitsById.mob0.template.attributes.cannot_enrage_normal='true';},a=>{a.unitsById.mob0.template.attributes.rarity='boss';},
        a=>{a.unitsById.mob0.template.attributes.enrage_stats_key='missing';},a=>{a.mode='free_pvp';}]){
        const a=enrageBattle(),hero=a.unitsById.hero,mob=a.unitsById.mob0;mutate(a);
        const before=a.rng.state(),pips={...hero.pips};
        assert.equal(cast(a,hero,'Balance_Rune_Enrage_Level1',mob).ok,false);assert.equal(mob.enragedBy,undefined);
        assert.deepEqual(hero.pips,pips);assert.equal(a.rng.state(),before);
    }
});
test('Enrage rune, subsequent AI action and seed/decision replay remain deterministic',()=>{
    const a=enrageBattle(),b=enrageBattle(),decision={key:'Balance_Rune_Enrage_Level1',runeId:99999,targetId:'mob0'};
    const result=captureBattlePresentation(a,()=>playPveRound(a,decision));playPveRound(b,decision);
    assert.equal(a.runeUsed[99999],1);assert.equal(a.unitsById.mob0.enragedBy,'hero');
    assert.deepEqual(a.events,b.events);assert.equal(a.rng.state(),b.rng.state());
    assert.ok(result.events.some(e=>e.type==='heal'&&e.label==='enrage'));
    assert.throws(()=>playPveRound(a,decision),/有效目标/);
    assert.equal(a.runeUsed[99999],1);
    const legacy=enrageBattle(0);assert.equal(cast(legacy,legacy.unitsById.hero,decision.key,legacy.unitsById.mob0).unsupported,true);
});
test('Lua Enrage precheck runs before accuracy; failed freeze remains visible in playback',()=>{
    const a=enrageBattle(),hero=a.unitsById.hero,mob=a.unitsById.mob0;
    assert.equal(useCard(a,hero,{...cards.Balance_Rune_Enrage_Level1,accuracy:-1000},mob).fizzled,true);
    assert.equal(mob.enragedBy,hero.id);assert.equal(mob.hp,500);
    const s=setup();s.foe.antiFreezeRounds=5;
    const playback=captureBattlePresentation(s.a,()=>cast(s.a,s.hero,freeze,s.foe));
    assert.ok(playback.events.some(e=>e.type==='freeze'&&e.success===false));
});
test('special effect threat follows original weights, including resisted freeze and full-side guardian',()=>{
    const a=enrageBattle(),hero=a.unitsById.hero,mob=a.unitsById.mob0;
    hero.pips.normal=7;mob.template.attributes.is_immune_to_freeze=true;
    cast(a,hero,freeze,mob);assert.equal(mob.threats.hero,200);
    hero.pips.normal=7;mob.wards=[{id:1026}];cast(a,hero,converse,mob);assert.equal(mob.threats.hero,400);
    hero.hp=hero.maxHp=10000;hero.pips.normal=7;cast(a,hero,guardian,hero);assert.equal(mob.threats.hero,460);
});
test('Enrage retains sequence memory and falls back to genes if the new AI has fewer sequences',()=>{
    const a=enrageBattle(),mob=a.unitsById.mob0;mob.aiMemory.sequence_normal=9;
    cast(a,a.unitsById.hero,'Balance_Rune_Enrage_Level1',mob);
    const next=pickMonsterCard(a,mob);
    assert.ok(next.key);assert.equal(mob.aiMemory.sequence_normal,9);assert.equal(mob.aiMemory.round,1);
});
test('stun is consumed before freeze blocks the same action, in both battle modes',()=>{
    const {a,hero}=setup();startCombat(a);hero.stunned=true;hero.freezeRounds=2;
    playTurn(a,{});assert.equal(hero.stunned,false);
    assert.ok(a.events.some(e=>e.caster===hero.id&&e.reason==='stunned'));
    const pve=enrageBattle(),player=pve.unitsById.hero;player.stunned=true;player.freezeRounds=2;
    playPveRound(pve,{pass:true});assert.equal(player.stunned,false);
    assert.ok(pve.events.some(e=>e.caster===player.id&&e.reason==='stunned'));
});
test('a guardian revived by fatal DOT skips its interrupted action and exposes heal playback',()=>{
    const {a,hero,foe}=setup();startCombat(a);hero.guardian=true;hero.hp=1;
    hero.dots=[{cardKey:'test',casterId:foe.id,damageSchool:'fire',ticks:[{dmg:100}],buffsTarget:[]}];
    const pick=U.cardsInHand(hero)[0];hero.pips.normal=7;
    const result=captureBattlePresentation(a,()=>playTurn(a,{hero:{...pick,targetId:foe.id}}));
    assert.equal(hero.hp,2000);assert.ok(!a.events.some(e=>e.type==='cast'&&e.caster===hero.id));
    assert.ok(result.events.some(e=>e.type==='heal'&&e.revived));
});

test('kids coverage leaves only internal commands and the separately implemented catch rune path',()=>{
    const internal=new Set(['Dead','PickPet','Fizzle']);
    for(const card of Object.values(cards))if(!internal.has(card.type)&&card.type!=='CatchPet')assert.ok(isSupportedType(card.type),card.key);
    assert.ok(!Object.values(cards).some(card=>['Random','AreaControl','Revive'].includes(card.type)));
    const data=dataset.pve.enrage;
    assert.equal(Object.keys(data.stats).length,21);assert.equal(Object.keys(data.ai).length,31);
    for(const hash of Object.values(data.sources))assert.match(hash,/^[0-9a-f]{64}$/);
    for(const ai of Object.values(data.ai))for(const key of [...ai.pool.map(r=>r.key),...ai.sequences.flat().map(r=>r.card),...ai.genes.map(r=>r.card),...Object.values(ai.cardsets).flat().map(r=>r.key)].filter(Boolean)){
        assert.deepEqual(data.cards[key],cards[key]);assert.ok(isSupportedType(cards[key].type),key);
    }
});
test('freeze and guardian reconstruct from a real decision checkpoint without storing transient states',()=>{
    const cp={monster:chapter.monsters['water-bubble'],seed:19,specialCardRulesVersion:1,threatRulesVersion:5,
        player:{id:'hero',school:'death',level:50,stats:{startupNormal:7,hpFlat:10000},deck:[{key:freeze,count:2},{key:guardian,count:2}],deckCapacity:40,deckEachCapacity:6},decisions:[]};
    const data={...dataset,cards},a=restorePveBattle(data,chapter,cp);
    for(const [key,targetId] of [[freeze,'mob0'],[guardian,'hero']]){
        const hand=U.cardsInHand(a.unitsById.hero).find(h=>h.key===key);assert.ok(hand);
        const decision={...hand,targetId};playPveRound(a,decision);cp.decisions.push(decision);
    }
    const restored=restorePveBattle(data,chapter,JSON.parse(JSON.stringify(cp)));
    assert.deepEqual(restored.events,a.events);assert.equal(restored.rng.state(),a.rng.state());
    assert.equal(restored.unitsById.hero.guardian,true);assert.equal(restored.unitsById.mob0.antiFreezeRounds,a.unitsById.mob0.antiFreezeRounds);
    assert.equal(cp.player.guardian,undefined);
});
