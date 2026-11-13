import test from 'node:test';
import assert from 'node:assert/strict';
import {tacticsNextGoal} from '../js/tactics_progress_core.js';

test('training objectives select the next missing lesson and preserve the save',()=>{
 const save={tacticsTraining:{version:1,completed:{guard:{runs:1}}}},before=JSON.stringify(save);
 assert.deepEqual([tacticsNextGoal(save).id,tacticsNextGoal(save).done],['focus',1]);
 assert.equal(JSON.stringify(save),before);
 save.tacticsTraining.completed.focus={runs:1};
 assert.equal(tacticsNextGoal(save).id,'break-shield');
 assert.equal(tacticsNextGoal({}).id,'focus');
});
test('field objectives require formal receipts after the four lessons',()=>{
 const save={tacticsTraining:{completed:Object.fromEntries(['focus','break-shield','guard','squad'].map(id=>[id,{runs:1}]))}};
 assert.equal(tacticsNextGoal(save).kind,'field');
 assert.equal(tacticsNextGoal(save).id,'combo');
 save.tacticsRecord={combo:1,teamCombo:1};
 assert.equal(tacticsNextGoal(save).id,'guardCombo');
 save.tacticsRecord.guardCombo=1;
 assert.equal(tacticsNextGoal(save).complete,true);
});
