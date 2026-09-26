import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {describeCard} from '../js/card_description_core.js';
import {parseLocaleFile,lookup} from '../js/locale_core.js';
import {processDamageAgainstWards,absorbUnitDamage} from '../js/combat_unit_core.js';
const cards=JSON.parse(fs.readFileSync(new URL('../data/kids/cards.json',import.meta.url)));
const charms=JSON.parse(fs.readFileSync(new URL('../data/kids/charms.json',import.meta.url)));
test('real cards distinguish direct, periodic, healing and absorption effects',()=>{
    const fire=describeCard(cards.Fire_SingleAttackWithDOT_Level2);
    assert.equal(fire.summary,'伤害 44；持续 44×3回合');
    assert.match(fire.lines.join(''),/基础总伤害：176/);
    const heal=describeCard(cards.Life_SingleHealWithHOT_Level1);
    assert.equal(heal.summary,'治疗 80；持续治疗 80×2回合');
    assert.match(heal.lines.join(''),/基础总治疗：240/);
    const shield=describeCard(cards.Life_Absorb_Level3);
    assert.equal(shield.summary,'吸收 600');
    assert.match(shield.lines.join(''),/不会恢复已经损失的生命/);
    assert.equal(describeCard(cards.Fire_SingleAttackWithDOT_Level1).summary,'伤害 84～92；持续 22×1回合');
});
test('variable pip cards do not pretend their sentinel cost is actual damage',()=>{
    const desc=describeCard(cards.Storm_AreaAttack_LevelX);
    assert.match(desc.summary,/100×魔力/);
    assert.doesNotMatch(desc.summary,/1400/);
    assert.match(desc.meta,/消耗 X/);
    assert.equal(desc.target,'全体敌人');
});
test('descriptions use resolved parameters and both source/resolved effect dictionaries',()=>{
    const card={...cards.Life_Absorb_Level3,params:{absorb_pts:321}};
    assert.equal(describeCard(card).summary,'吸收 321');
    for(const dataset of [{charms},{charms:charms.charm,wards:charms.ward}])assert.equal(describeCard(cards.Fire_FireDamageBlade,{dataset}).summary,'下次烈火攻击 +45%');
});
test('prism copy matches the actual incoming school conversion and consumption',()=>{
    for(const [key,from,to] of [['Ice_IcePrism','ice','fire'],['Fire_FirePrism','fire','ice'],['Life_LifePrism','life','death'],['Death_DeathPrism','death','life']]){
        const card=cards[key],desc=describeCard(card,{dataset:{charms}});
        assert.equal(desc.target,'一名敌人');
        assert.match(desc.lines.join(''),/不是目标发出的攻击/);
        const id=Number(card.params.wards),unit={wards:[{id}]};
        assert.equal(processDamageAgainstWards(unit,{wards:charms.ward},[],'storm'),'storm');
        assert.equal(unit.wards[0].id,id);
        assert.equal(processDamageAgainstWards(unit,{wards:charms.ward},[],from),to);
        assert.equal(unit.wards[0].id,0);
    }
});
test('absorption examples match capacity consumed across hits and overflow',()=>{
    const unit={wards:[{id:33,absorb:true,pts:600}]};
    assert.equal(absorbUnitDamage(unit,200),0);
    assert.equal(unit.wards[0].pts,400);
    assert.equal(absorbUnitDamage(unit,500),100);
    assert.equal(unit.wards[0].pts,0);
    assert.match(describeCard(cards.Life_Absorb_Level3).lines.join(''),/护盾还剩 400/);
});
test('English dictionary translates all generated kids effect descriptions and variable values',()=>{
    const en=parseLocaleFile(fs.readFileSync(new URL('../data/adventure/locale/en.txt',import.meta.url),'utf8'));
    const translate=s=>lookup(s,'en',{en});
    for(const card of Object.values(cards)){
        const desc=describeCard(card,{dataset:{charms},translate});
        assert.doesNotMatch([desc.summary,desc.meta,desc.note,...desc.lines].join('\n'),/[\u4e00-\u9fff]|\{\w+\}/,card.key);
    }
    const prism=describeCard(cards.Ice_IcePrism,{dataset:{charms},translate});
    assert.equal(prism.summary,'Ice damage → Fire damage');
    assert.match(prism.lines[0],/receives Ice damage.*to Fire/);
    assert.equal(describeCard({...cards.Life_Absorb_Level3,params:{absorb_pts:1234}},{translate}).summary,'Absorb 1234');
});
test('missing effect descriptions are explicit instead of inventing behavior',()=>{
    assert.match(describeCard({type:'FutureSpell',params:{}}).lines.join(''),/尚未完整收录/);
    for(const card of Object.values(cards))assert.ok(describeCard(card,{dataset:{charms}}).summary);
});

test('mirror descriptions expose real capacity and reflection limitations',()=>{
    const desc=describeCard(cards.Ice_ReflectionShield);
    assert.match(desc.summary,/350/);
    assert.match(desc.lines.join(''),/魔镜破碎/);
    assert.match(desc.lines.join(''),/持续伤害只消耗/);
    assert.doesNotMatch(desc.lines.join(''),/尚未完整/);
});
