import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {subjectPose,spellChoreography} from '../js/spell_choreography_core.js';
import {validateSpellEffects} from '../js/spell_effects_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url)));
const config=read('data/adventure/spell-effects.json'),cards=read('data/kids/cards.json');
test('all source cards resolve audited choreography and preserve variant sharing',()=>{
    for(const [id,base]of Object.entries(config.bases)){
        const card=Object.values(cards).find(c=>config.cards[c.key].base===id);
        assert.deepEqual(base.choreography,spellChoreography(base,card));
        for(const p of [0,.2,.5,.8,1])for(const direction of [-1,1]){
            const pose=subjectPose(base.choreography,{p,flight:p,hit:Math.max(0,(p-.7)/.3),radius:70,a:{x:300,y:250},b:{x:300+200*direction,y:230},center:{x:400,y:260}});
            assert.ok(Object.values(pose).every(Number.isFinite));assert.ok(pose.alpha>=0&&pose.alpha<=1);
        }
    }
    const broken=structuredClone(config);broken.bases.Pass.choreography.placement='unknown';
    assert.throws(()=>validateSpellEffects(broken,cards),/编舞/);
});
test('named motifs distinguish ground spikes, falling ice, center creatures and attached auras',()=>{
    const chore=id=>config.bases[id].choreography;
    assert.equal(chore('Ice_SingleAttack_Level4').motion,'rise');
    assert.equal(chore('Ice_SingleAttackWithDOT_Level5').attack,'meteor');
    assert.equal(chore('Storm_SingleAttack_Level6').placement,'target');
    assert.equal(chore('Fire_SingleAttack_Level3').placement,'center');
    assert.equal(chore('Fire_Rune_FireResist_MiniAura').placement,'target');
    assert.equal(chore('Fire_FireGlobalAura').placement,'field');
    assert.equal(chore('Fire_DOTAttackWithHOT_Level2').returnToCaster,true);
    assert.equal(config.bases.Fire_DOTAttackWithHOT_Level2.friendly,false);
    assert.equal(chore('Balance_Rune_SingleAttackWithSelfStun_Lv5').secondaryTarget,'caster');
});
