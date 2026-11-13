import test from 'node:test';
import assert from 'node:assert/strict';
import {adventureHonors,activeAdventureHonor,dungeonHonorTitle} from '../js/adventure_honors_core.js';
test('legacy saves and classroom completions do not invent earned honors',()=>{
 const save={tacticsTraining:{focus:99}};
 assert.equal(activeAdventureHonor(save),null);
 assert.ok(adventureHonors(save).every(row=>!row.earned));
 assert.equal(save.tacticsRecord,undefined);
});
test('formal victories and complete dungeon records unlock honors without mutation',()=>{
 const save={tacticsRecord:{combo:2,guardCombo:1,teamCombo:0},dungeonChallengeRecords:{'journey:lost-spark':{clears:1}}};
 const before=JSON.stringify(save),rows=adventureHonors(save);
 assert.deepEqual(rows.filter(row=>row.earned).map(row=>row.id),['combo','guardCombo','journey:lost-spark']);
 assert.equal(activeAdventureHonor(save).title,'星火寻回者');
 assert.equal(JSON.stringify(save),before);
 assert.equal(dungeonHonorTitle('journey:ember-night'),'余烬领队');
 assert.equal(dungeonHonorTitle('unknown'),null);
});
