import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installExpansion} from '../js/adventure_expansion_core.js';
import * as A from '../js/adventure_core.js';
import {createCampDeckCoach} from '../js/camp_deck_coach_core.js';
const read=name=>JSON.parse(fs.readFileSync(new URL(`../data/${name}.json`,import.meta.url)));
const {content,dataset}=installExpansion(...['adventure/chapter','adventure/combat','adventure/pets','adventure/shop-candidates','kids/cards','kids/charms','kids/card_names'].map(read));
function preparation(school='fire',target='en'){
    const save=A.createAdventure(content,{school});save.xp=content.progression.xpThresholds[8];A.syncProgression(save,content);
    save.quests[63012]={accepted:true,claimed:false,progress:{}};save.languageLearning.target=target;return save;
}
test('preparation uses each selected target without English fallback or save mutation',()=>{
    for(const [target,pattern] of [['en',/Add a trap/],['ja',/罠と盾/],['ko',/함정과 방패/],['zh-CN',/陷阱和护盾/]]){
        const save=preparation('fire',target),before=JSON.stringify(save),coach=createCampDeckCoach(save,content,dataset);
        assert.equal(coach.language,target);assert.match(coach.prompt,pattern);coach.evaluate(save.deck);assert.equal(JSON.stringify(save),before);
    }
});
test('all five schools have eligible trap and shield choices before the final test',()=>{
    for(const school of Object.keys(content.schools)){
        const save=preparation(school),coach=createCampDeckCoach(save,content,dataset);
        const deck=A.availableCardLessons(save,content).filter(row=>row.level<=save.level).map(row=>({key:row.key,count:1}));
        assert.equal(coach.evaluate(deck).ready,true,school);
    }
});
test('feedback follows the actual draft, not equipment, card names or previous readiness',()=>{
    const save=preparation(),coach=createCampDeckCoach(save,content,dataset);
    const trap='Fire_FireDamageTrap',shield='Fire_FireGreatShield';
    assert.deepEqual([coach.evaluate([]).trap,coach.evaluate([]).shield],[false,false]);
    assert.equal(coach.evaluate([{key:trap,count:1}]).ready,false);
    assert.equal(coach.evaluate([{key:trap,count:1},{key:shield,count:1}]).ready,true);
    assert.equal(coach.evaluate([{key:trap,count:1},{key:shield,count:0}]).shield,false);
    assert.equal(coach.evaluate([{key:'Ice_IceDamageTrap',count:1},{key:shield,count:1}]).trap,false);
    assert.equal(coach.evaluate([{key:'unknown-trap-shield',count:1}]).ready,false);
});
test('coach is absent outside preparation and the pending final test',()=>{
    const save=preparation();save.quests[63012].claimed=true;
    assert.equal(createCampDeckCoach(save,content,{}),null);
    save.quests[63013]={accepted:true,claimed:false};assert.ok(createCampDeckCoach(save,content,dataset));
    save.quests[63013].claimed=true;assert.equal(createCampDeckCoach(save,content,{}),null);
});
