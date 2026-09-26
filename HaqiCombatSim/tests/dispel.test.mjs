import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createArena} from '../js/combat_arena_core.js';
import {defaultParams,resolveParams} from '../js/combat_params_core.js';
import {useCard} from '../js/combat_cards_core.js';
import {describeCard} from '../js/card_description_core.js';
import {captureBattlePresentation,battleStatusChanges} from '../js/view_battle_presentation.js';
import {drawStatusFeedback,drawSpellMiss} from '../js/view_adventure_overhead_status.js';
const dataset=JSON.parse(fs.readFileSync(new URL('../data/adventure/combat.json',import.meta.url)));
const cards=JSON.parse(fs.readFileSync(new URL('../data/kids/cards.json',import.meta.url)));
function setup(){
    const spec=id=>({id,school:'life',level:10,deck:[]});
    const battle=createArena({resolved:resolveParams(dataset,defaultParams('kids')),near:[spec('hero')],far:[spec('foe')],seed:12});
    battle.mode='pve';battle.dispelRulesVersion=1;
    const hero=battle.unitsById.hero;hero.charms=[22,22];hero.pips={normal:7,power:0};
    return {battle,hero,card:{...cards.Life_SingleHealWithHOT_Level1,accuracy:100,pipcost:2}};
}
test('school-specific dispel forces MISS, pays mana and consumes only one layer',()=>{
    const {battle,hero,card}=setup();
    const hp=hero.hp;
    const playback=captureBattlePresentation(battle,()=>assert.equal(useCard(battle,hero,card,hero).fizzled,true));
    assert.equal(hero.hp,hp);assert.equal(hero.pips.normal,5);assert.deepEqual(hero.charms,[0,22]);
    assert.equal(battle.events.at(-1).reason,'dispel');
    assert.equal(battle.events.at(-1).dispel,22);
    const last=playback.events.at(-1),changes=battleStatusChanges(playback.initial,last.status,last);
    assert.equal(changes.length,1);assert.equal(changes[0].kind,'dispel-break');
    const texts=[],c=new Proxy({fillText:t=>texts.push(t)}, {get:(o,k)=>k in o?o[k]:()=>{}});
    drawStatusFeedback(c,changes.map(e=>({...e,start:0})),{x:100,y:200},250,false,390);
    drawSpellMiss(c,{x:100,y:200},.3);
    assert.ok(texts.includes('生命之敌破掉'));assert.ok(texts.includes('MISS'));
    assert.equal(last.status.hero.filter(e=>e.dispelSchool==='life').length,1);
});
test('unmatched schools keep dispel and matching natural misses still consume without pip cost',()=>{
    const {battle,hero,card}=setup();
    useCard(battle,hero,{...card,spellSchool:'fire'},hero);
    assert.deepEqual(hero.charms,[22,22]);
    const pips=hero.pips.normal;
    useCard(battle,hero,{...card,accuracy:-1},hero);
    assert.deepEqual(hero.charms,[0,22]);assert.equal(hero.pips.normal,pips);
});
test('immune monsters cast, and legacy PvE preserves old replay rules',()=>{
    for(const legacy of [false,true]){
        const {battle,hero,card}=setup();
        if(legacy){battle.mode='pve';battle.dispelRulesVersion=0;}
        else {hero.isMob=true;hero.template={attributes:{is_immune_to_dispel:'true'}};}
        assert.equal(useCard(battle,hero,card,hero).ok,true);
        assert.deepEqual(hero.charms,legacy?[22,22]:[0,22]);
    }
});
test('all five actual dispel cards explain guaranteed school failure without incomplete warning',()=>{
    for(const school of ['Fire','Ice','Storm','Life','Death']){
        const card=cards[`${school}_${school}DispellWeakness`];assert.ok(card);
        const desc=describeCard(card,{dataset});
        assert.match(desc.summary,/施法失败/);
        assert.match(desc.lines.join(''),/攻击或施法失败（MISS）.*一层/);
        assert.doesNotMatch(desc.lines.join(''),/尚未完整收录/);
    }
});
