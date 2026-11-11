import test from 'node:test';
import assert from 'node:assert/strict';
import {partitionGuidedMessages} from '../js/dialogue_turns_core.js';
test('a new NPC question moves the completed previous reply into recoverable history',()=>{
 const rows=[{role:'npc',text:'Hello'},{role:'user',text:'Hi'},{role:'npc',text:'Need help?'},{role:'user',text:'Yes'},{role:'npc',text:'Come with me'}];
 const before=JSON.stringify(rows),view=partitionGuidedMessages(rows);
 assert.deepEqual(view.current,[rows[4]]);assert.deepEqual(view.history,rows.slice(0,4));
 assert.equal(view.current[0],rows[4]);assert.equal(JSON.stringify(rows),before);
});
test('repeated attempts keep the question and most recent attempt in sight',()=>{
 const rows=[{role:'npc',text:'What do you need?'},{role:'user',text:'lampx'},{role:'user',text:'A lamp'}];
 const view=partitionGuidedMessages(rows);assert.deepEqual(view.current,[rows[0],rows[2]]);assert.deepEqual(view.history,[rows[1]]);
});
test('empty and user-only logs preserve all messages without inventing an NPC',()=>{
 assert.deepEqual(partitionGuidedMessages([]),{history:[],current:[]});
 const rows=[{role:'user',text:'Hello'},{role:'user',text:'Anyone here?'}];
 assert.deepEqual(partitionGuidedMessages(rows),{history:[rows[0]],current:[rows[1]]});
});
