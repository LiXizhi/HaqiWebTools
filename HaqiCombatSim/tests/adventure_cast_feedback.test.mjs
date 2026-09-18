import test from 'node:test';
import assert from 'node:assert/strict';
import { castBlockedMessage } from '../js/adventure_cast_feedback_core.js';

test('cast feedback follows school-specific power pip costs and never mutates the caster',()=>{
    const hero={hp:100,school:'ice',pips:{normal:0,power:1},cooldowns:{}};
    const card={type:'SingleAttack',spellName:'spell',spellSchool:'ice',pipcost:2};
    const before=JSON.stringify(hero);
    assert.equal(castBlockedMessage(hero,card,{version:'kids'}),'');
    assert.match(castBlockedMessage(hero,{...card,spellSchool:'fire'},{version:'kids'}),/魔力点不足：需要 2 点，当前可用 1 点/);
    assert.match(castBlockedMessage(hero,{...card,spellSchool:'fire'},{version:'teen'}),/需要 4 点，当前可用 1 点/);
    assert.equal(castBlockedMessage(hero,{...card,pipcost:-1},{version:'kids'}),'');
    assert.equal(JSON.stringify(hero),before);
    hero.cooldowns.spell=2;
    assert.match(castBlockedMessage(hero,card,{version:'kids'}),/冷却中：还需 2 回合/);
});
