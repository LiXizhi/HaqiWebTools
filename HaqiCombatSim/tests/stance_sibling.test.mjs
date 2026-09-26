// kids 姿态同队加成与 SingleAttackWithPercent 上限的引擎行为守护
// 依据 player_server.lua：GetCriticalStrike L2660-2686、GetResilience L2759-2784、GetHitChance L2816-2840、
// GetSpellPenetration L2945-2969、GetInputHealBoost L3045-3069、GetStatsSum stat376 L3621-3641；
// card_server.lua L3281-3290（damage_max_mob / damage_max_player 按目标类型选择）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createArena} from '../js/combat_arena_core.js';
import {defaultParams,resolveParams} from '../js/combat_params_core.js';
import {useCard} from '../js/combat_cards_core.js';
import * as U from '../js/combat_unit_core.js';

const dataset=JSON.parse(fs.readFileSync(new URL('../data/adventure/combat.json',import.meta.url)));
const cards=JSON.parse(fs.readFileSync(new URL('../data/kids/cards.json',import.meta.url)));
const resolved=resolveParams(dataset,defaultParams('kids'));

function setup(){
    const battle=createArena({resolved,near:[{id:'a',school:'storm',level:10,deck:[]},{id:'b',school:'death',level:10,deck:[]}],far:[{id:'foe',school:'fire',level:10,deck:[]}],seed:3});
    return {battle,a:battle.unitsById.a,b:battle.unitsById.b};
}

test('kids 姿态同队加成按 Lua friendlys 循环结算',()=>{
    const {battle,a,b}=setup();
    const base={crit:U.getCriticalStrike(a,'storm',resolved,battle),resil:U.getResilience(a,'storm',resolved,battle),
        hit:U.getHitChance(a,resolved,battle),heal:U.getInputHealBoost(a,resolved,battle),
        pen:U.getSpellPenetration(a,'storm',resolved,battle),ratio:U.getCriticalStrikeDamageRatioBonus(a,resolved,battle)};
    b.stance={name:'death_kids',rounds:5};
    assert.equal(U.getCriticalStrike(a,'storm',resolved,battle),base.crit,'death_kids 不加暴击');
    assert.equal(U.getResilience(a,'storm',resolved,battle),base.resil+20);
    assert.equal(U.getHitChance(a,resolved,battle),base.hit+10);
    assert.equal(U.getInputHealBoost(a,resolved,battle),base.heal+30);
    assert.equal(U.getSpellPenetration(a,'storm',resolved,battle),base.pen,'death_kids 不加穿透');
    b.stance={name:'storm_kids',rounds:5};
    assert.equal(U.getCriticalStrike(a,'storm',resolved,battle),base.crit+20);
    assert.equal(U.getCriticalStrikeDamageRatioBonus(a,resolved,battle),base.ratio+0.2);
    assert.equal(U.getCriticalStrikeDamageRatioBonus(a,resolved),base.ratio,'无 arena 时不生效');
    assert.equal(U.getResilience(a,'storm',resolved,battle),base.resil,'storm_kids 不加韧性');
    b.stance={name:'life_kids',rounds:5};
    assert.equal(U.getSpellPenetration(a,'storm',resolved,battle),base.pen+15);
    b.stance={name:'storm_kids',rounds:0};
    assert.equal(U.getCriticalStrike(a,'storm',resolved,battle),base.crit,'回合耗尽后失效');
    const teen={...resolved,version:'teen'};
    b.stance={name:'storm_kids',rounds:5};
    assert.equal(U.getCriticalStrike(a,'storm',teen,battle),base.crit,'teen 不适用 kids 姿态加成');
    assert.equal(U.getInputHealBoost(a,teen,battle),base.heal);
});

test('SingleAttackWithPercent 伤害上限按目标类型选择（mob/player）',()=>{
    const battle=createArena({resolved,near:[{id:'hero',school:'death',level:10,deck:[]}],far:[{id:'foe',school:'life',level:10,deck:[]}],seed:9});
    battle.mode='pve';
    const hero=battle.unitsById.hero,foe=battle.unitsById.foe;
    foe.hp=foe.maxHp=1000000;
    const card={...cards.Death_Rune_SingleAttackWithPercent,accuracy:100,pipcost:2};
    foe.isMob=false;
    hero.pips={normal:7,power:0};
    useCard(battle,hero,card,foe);
    const playerCap=battle.events.filter(e=>e.type==='damage'&&e.target==='foe').at(-1).amount;
    assert.equal(playerCap,5000,'玩家目标上限 damage_max_player=5000');
    foe.hp=1000000;foe.isMob=true;
    hero.pips={normal:7,power:0};
    useCard(battle,hero,card,foe);
    const mobCap=battle.events.filter(e=>e.type==='damage'&&e.target==='foe').at(-1).amount;
    assert.equal(mobCap,10000,'怪物目标上限 damage_max_mob=10000');
});
