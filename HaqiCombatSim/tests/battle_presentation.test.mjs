import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createArena} from '../js/combat_arena_core.js';
import {defaultParams,resolveParams} from '../js/combat_params_core.js';
import {useCard,tickDots} from '../js/combat_cards_core.js';
import {appendWard,appendAbsorb,absorbUnitDamage,processDamageAgainstWards} from '../js/combat_unit_core.js';
import {captureBattlePresentation,battleStatusChanges,snapshotBattleStatus} from '../js/view_battle_presentation.js';
const dataset=JSON.parse(fs.readFileSync(new URL('../data/adventure/combat.json',import.meta.url)));
function scenario(observe=true){
    const resolved=resolveParams(dataset,defaultParams('kids'));
    const spec=id=>({id,name:id,school:'fire',level:10,deck:[]});
    const battle=createArena({resolved,near:[spec('hero')],far:[spec('foe')],seed:12});
    const hero=battle.unitsById.hero,foe=battle.unitsById.foe;
    const cast=(unit,key,target)=>useCard(battle,unit,resolved.cards[key],target);
    const run=()=>{
        cast(hero,'Fire_FireGreatShield',hero);
        cast(foe,'Fire_FireDamageBlade',foe);
        cast(foe,'Fire_SingleAttack_Level0_120_adv',hero);
    };
    const playback=observe?captureBattlePresentation(battle,run):(run(),null);
    return {battle,playback};
}
test('real shield and charm become visible before the next attack consumes them',()=>{
    const {battle,playback}=scenario();
    assert.deepEqual(playback.initial.hero,[]);
    const ward=playback.events.find(e=>e.sourceType==='ward');
    assert.equal(ward.status.hero[0].kind,'ward');
    const charm=playback.events.find(e=>e.sourceType==='charm');
    assert.equal(charm.status.foe[0].kind,'charm');
    const attack=playback.events.find(e=>e.type==='cast'&&e.caster==='foe'&&e.card.includes('SingleAttack'));
    assert.equal(attack.status.hero[0].kind,'ward');
    assert.equal(attack.status.foe[0].kind,'charm');
    const damage=playback.events.find(e=>e.type==='damage');
    assert.deepEqual(damage.status.hero,[]);assert.deepEqual(damage.status.foe,[]);
    let status=playback.initial;const consumed=[];
    for(const event of playback.events){
        if(event.sourceType==='effect_used')consumed.push(...battleStatusChanges(status,event.status,event).map(c=>c.kind));
        status=event.status;
    }
    assert.deepEqual(consumed,['trigger','break'],'caster charm triggers before target shield');
    assert.deepEqual(snapshotBattleStatus(battle),damage.status);
    assert.equal(ward.status.hero.length,1,'later consumption must not mutate earlier snapshots');
});
test('observation preserves engine events, final state and random stream',()=>{
    const observed=scenario(),plain=scenario(false);
    assert.deepEqual(JSON.parse(JSON.stringify(observed.battle)),JSON.parse(JSON.stringify(plain.battle)));
    assert.equal(observed.battle.rng.float(),plain.battle.rng.float());
    assert.ok(observed.battle.events.every(e=>!Object.hasOwn(e,'status')));
});
test('partial absorption pulses, stacked shields break only the consumed layer',()=>{
    const effect=pts=>({kind:'ward',label:'吸',stackKey:'ward:0:true',desc:`吸收盾 ${pts}`,count:1});
    assert.equal(battleStatusChanges({hero:[effect(100)]},{hero:[effect(40)]},{type:'damage'})[0].kind,'pulse');
    assert.equal(battleStatusChanges({hero:[{...effect(100),count:2}]},{hero:[effect(100)]},{type:'damage'})[0].kind,'break');
    assert.equal(battleStatusChanges({hero:[effect(100)]},{hero:[]},{type:'status'})[0].kind,'remove');
});
test('observer restores an existing callback after failure',()=>{
    const callback=()=>{},battle={events:[],unitsById:{},resolved:{},onEvent:callback};
    assert.throws(()=>captureBattlePresentation(battle,()=>{throw Error('cancel');}),/cancel/);
    assert.equal(battle.onEvent,callback);
});
test('stacked traps consume one matching base ID per hit in reverse placement order',()=>{
    const {battle}=scenario(false),hero=battle.unitsById.hero;
    hero.wards=[];
    appendWard(hero,23);appendWard(hero,21);appendWard(hero,21);
    const playback=captureBattlePresentation(battle,()=>processDamageAgainstWards(hero,battle.resolved,[],'fire'));
    const used=playback.events.filter(e=>e.sourceType==='effect_used');
    assert.deepEqual(used.map(e=>[e.id,e.order]),[[21,2],[23,0]]);
    assert.equal(playback.initial.hero.find(e=>e.negative).count,2);
    assert.equal(used[0].status.hero.find(e=>e.negative).count,1);
    assert.equal(used[1].status.hero.length,1);
    const next=captureBattlePresentation(battle,()=>processDamageAgainstWards(hero,battle.resolved,[],'fire'));
    assert.deepEqual(next.events.filter(e=>e.sourceType==='effect_used').map(e=>[e.id,e.order]),[[21,1]]);
    assert.deepEqual(snapshotBattleStatus(battle).hero,[]);
});
test('the actual guardian ward displays between casting and consumption',()=>{
    const {battle}=scenario(false),hero=battle.unitsById.hero;
    hero.wards=[];
    const playback=captureBattlePresentation(battle,()=>{
        useCard(battle,hero,battle.resolved.cards.Ice_GlobalShield,hero);
        processDamageAgainstWards(hero,battle.resolved,[],'fire');
    });
    assert.ok(playback.events.find(e=>e.sourceType==='ward').status.hero.some(e=>e.stackKey==='ward:27:false'));
    assert.deepEqual(playback.events.filter(e=>e.sourceType==='effect_used').map(e=>e.id),[27]);
});
test('prism changes which earlier shield triggers without reordering presentation',()=>{
    const {battle}=scenario(false),hero=battle.unitsById.hero;
    const ice=Number(battle.resolved.cards.Ice_IceGreatShield.params.wards);
    hero.wards=[];appendWard(hero,ice);appendWard(hero,22);appendWard(hero,21);
    let school;
    const playback=captureBattlePresentation(battle,()=>{school=processDamageAgainstWards(hero,battle.resolved,[],'fire');});
    assert.equal(school,'ice');
    assert.deepEqual(playback.events.filter(e=>e.sourceType==='effect_used').map(e=>e.id),[21,22,ice]);
});
test('DoT ticks consume one stacked trap and update remaining duration',()=>{
    const {battle}=scenario(false),hero=battle.unitsById.hero;
    hero.wards=[];appendWard(hero,21);appendWard(hero,21);
    hero.dots=[{cardKey:'Fire_SingleAttackWithDOT_Level2',casterId:'foe',damageSchool:'fire',buffsTarget:[],damageBoostAbs:0,spellPenetration:0,outputWeight:1,ticks:[{dmg:10},{dmg:10},{dmg:10}]}];
    const playback=captureBattlePresentation(battle,()=>tickDots(battle,hero));
    const final=snapshotBattleStatus(battle).hero;
    assert.equal(final.find(e=>e.kind==='dots').rounds,2);
    assert.equal(final.find(e=>e.kind==='ward').count,1);
    assert.deepEqual(playback.events.filter(e=>e.sourceType==='effect_used').map(e=>e.id),[21]);
    assert.ok(playback.events.some(e=>e.type==='dot'));
});
test('absorption layers follow their own FIFO order, with partial capacity retained',()=>{
    const {battle}=scenario(false),hero=battle.unitsById.hero;
    hero.wards=[];appendAbsorb(hero,20,0);appendAbsorb(hero,30,0);
    const playback=captureBattlePresentation(battle,()=>assert.equal(absorbUnitDamage(hero,35),0));
    const used=playback.events.filter(e=>e.sourceType==='effect_used');
    assert.equal(used.length,2);
    assert.equal(used[0].status.hero[0].count,1);
    assert.equal(used[0].status.hero[0].desc,'吸收盾 30');
    assert.equal(used[1].status.hero[0].desc,'吸收盾 15');
});

test('mirror replays the original spell in reverse without changing combat or RNG',()=>{
    function run(observe){
        const {battle}=scenario(false),hero=battle.unitsById.hero,foe=battle.unitsById.foe;
        hero.wards=[];foe.charms=[];hero.hp=hero.maxHp=foe.hp=foe.maxHp=5000;
        battle.reflectionRulesVersion=1;
        const cards=JSON.parse(fs.readFileSync(new URL('../data/kids/cards.json',import.meta.url)));
        const mirror=cards.Ice_ReflectionShield,attack=battle.resolved.cards.Fire_SingleAttack_Level0_120_adv;
        const resolve=()=>{
            useCard(battle,hero,mirror,hero);
            for(let i=0;i<40;i++)useCard(battle,foe,attack,hero);
        };
        const playback=observe?captureBattlePresentation(battle,resolve):(resolve(),null);
        return {battle,playback,attack};
    }
    const observed=run(true),plain=run(false),{playback,attack}=observed;
    assert.deepEqual(JSON.parse(JSON.stringify(observed.battle)),JSON.parse(JSON.stringify(plain.battle)));
    assert.equal(observed.battle.rng.float(),plain.battle.rng.float());
    const gained=playback.events.find(e=>e.sourceType==='absorb');
    assert.equal(gained.status.hero[0].kind,'reflect');
    assert.equal(gained.status.hero[0].school,'ice');
    const returns=playback.events.filter(e=>e.sourceType==='reflection');
    assert.ok(returns.length>1);
    for(const event of returns){
        assert.equal(event.card,attack.key);assert.equal(event.caster,'hero');assert.equal(event.target,'foe');
        const next=playback.events[playback.events.indexOf(event)+1];
        assert.equal(next.type,'damage');assert.equal(next.label,'reflection');
    }
    let before=playback.initial;const changes=[];
    for(const event of playback.events){changes.push(...battleStatusChanges(before,event.status,event));before=event.status;}
    assert.ok(changes.some(c=>c.effect.kind==='reflect'&&c.kind==='pulse'));
    assert.equal(changes.filter(c=>c.effect.kind==='reflect'&&c.kind==='break').length,1);
    assert.equal(observed.battle.unitsById.hero.reflectAmount,0);
});
