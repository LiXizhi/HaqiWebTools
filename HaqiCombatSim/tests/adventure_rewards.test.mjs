import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installExpansion } from '../js/adventure_expansion_core.js';
import * as A from '../js/adventure_core.js';
import * as P from '../js/adventure_pets_core.js';
import { resolvePetReward } from '../js/adventure_rewards_core.js';
const read = path => JSON.parse(fs.readFileSync(new URL('../data/'+path,import.meta.url)));
const {content:c} = installExpansion(read('adventure/chapter.json'),read('adventure/combat.json'),read('adventure/pets.json'),read('adventure/shop-candidates.json'),read('kids/cards.json'),read('kids/charms.json'));
const target=c.quests.find(q=>q.id===63003);
function ready() {
    const s=A.createAdventure(c);
    for(const q of c.quests.filter(q=>q.id<=target.id))s.quests[q.id]={accepted:true,claimed:q.id<target.id,progress:Object.fromEntries(q.goals.map(g=>[`${g.kind}:${g.id}`,g.count]))};
    return s;
}
test('all schools get permanent tiger companion and correct robe, claim is idempotent',()=>{
    for(const school of Object.keys(c.schools)) {
        const s=ready();s.school=school;s.cards={};A.syncProgression(s,c);s.deck=A.recommendedDeck(s,c);
        const rewards=A.rewardsFor(s,c,target),pet=rewards.find(r=>r.kind==='pet');
        assert.equal(pet.petId,'zodiac_tiger_tangtang');
        assert.match(A.rewardLabel(c,pet),/糖糖虎爪/);
        assert.equal(rewards.filter(r=>c.items[r.id].kind===1).length,1);
        A.applyAction(s,c,{type:'claim',questId:target.id,npcId:target.endNpc});
        assert.ok(s.pets[pet.petId]);assert.equal(s.inventory[16103],undefined);
        const snapshot=JSON.stringify(s);A.applyAction(s,c,{type:'claim',questId:target.id,npcId:target.endNpc});assert.equal(JSON.stringify(s),snapshot);
    }
});
test('legacy retained quest pills exchange once; other inventory and formation survive',()=>{
    const s=ready();s.quests[target.id].claimed=true;s.inventory[16103]=3;
    const converted=A.parseSave(s,c);assert.ok(converted.pets.zodiac_tiger_tangtang);assert.equal(converted.inventory[16103],2);
    assert.deepEqual(converted.formation,s.formation);
    assert.deepEqual(A.parseSave(converted,c),converted);
    const unclaimed=ready();unclaimed.inventory[16103]=1;assert.equal(A.parseSave(unclaimed,c).inventory[16103],1);
});
test('duplicate quest companion uses configured XP compensation',()=>{
    const s=ready();P.addPet(s,c,'zodiac_tiger_tangtang');
    A.applyAction(s,c,{type:'claim',questId:target.id,npcId:target.endNpc});
    assert.equal(s.pets.zodiac_tiger_tangtang.xp,P.petParams(c).duplicateXp);
});
test('mount classification is exact and fallback mapping deterministic',()=>{
    const local={...c,items:{...c.items,900:{kind:10,subtype:1},901:{kind:11,subtype:1}}};
    const reward=resolvePetReward(local,{id:900,count:1});assert.ok(c.pets[reward.petId]);
    assert.deepEqual(resolvePetReward(local,{id:900,count:1}),reward);
    assert.deepEqual(resolvePetReward(local,{id:901,count:1}),{id:901,count:1});
    assert.deepEqual(resolvePetReward({...local,pets:null},{id:16103,count:1}),{id:16103,count:1});
});
