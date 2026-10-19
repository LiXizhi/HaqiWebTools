import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyLanguageTree,setTreeMark,treeReadiness} from '../js/language_tree_core.js';
import {seedDictionaryTree} from '../js/language_tree_dictionary_core.js';
import {createLanguageTreeSession} from '../js/language_tree_session.js';
import {createMasterySync} from '../js/language_tree_mastery_sync.js';
import {claimTreeMasteryRewards} from '../js/language_tree_rewards_core.js';
import {splitRoleSave} from '../js/adventure_storage_core.js';

test('one newly marked dictionary word immediately produces validated fruits without exposure thresholds',async()=>{
 const s=seedDictionaryTree(emptyLanguageTree(),{language:'en',entries:[{id:'book',text:'book'}]});
 setTreeMark(s,'book','know');assert.equal(treeReadiness(s).ready,true);
 const store={read:async()=>({state:structuredClone(s),persisted:true}),update:async(_,reduce)=>({result:reduce(s),state:structuredClone(s),persisted:true})};
 const session=createLanguageTreeSession({key:'a',store,online:()=>true,request:async()=>({questions:['A book.','My book.','The book.'].map(sentence=>({target:'book',sentence,translation:'一本书',options:[{text:'一本书',explanation:'book表示书本'},{text:'水杯',explanation:'不是水杯'},{text:'房屋',explanation:'不是房屋'}],answer:0,glosses:{a:'一',my:'我的',the:'这'}}))})});
 await session.open();await session.prepare();assert.equal(s.questions.length,3);assert.ok(s.questions.every(q=>q.availableAt<=Date.now()));assert.equal(s.words.book.count,0);session.close();
});

test('server acknowledgement gates rewards; retries and downgrades do not repeat rewards',async()=>{
 const state=emptyLanguageTree();state.masteryEarned=['book'];let fail=true,writes=0;
 const save={inventory:{100:7}},store={read:async()=>({state,persisted:true}),update:async(_,reduce)=>({result:reduce(state),state,persisted:true})};
 const sync=createMasterySync({key:'a',store,language:'en',remote:{read:async()=>({en:[],zh:[]}),write:async()=>{writes++;if(fail)throw Error('offline');}},onConfirmed:(lang,words)=>claimTreeMasteryRewards(save,lang,words)});
 await assert.rejects(sync.sync());assert.equal(save.inventory[100],7);fail=false;await sync.sync();assert.equal(save.inventory[100],57);await sync.sync();assert.equal(save.inventory[100],57);assert.equal(writes,2);
 const restored=structuredClone(save);assert.equal(claimTreeMasteryRewards(restored,'en',['book']),0);assert.equal(claimTreeMasteryRewards(restored,'en',['book','door']),50);assert.deepEqual(restored.languageTreeClaims.en,['book','door']);assert.equal(claimTreeMasteryRewards(restored,'zh',['书']),50);
});

test('reward receipts live in the records shard, not the small role entry',()=>{const parts=splitRoleSave({inventory:{100:50},languageTreeClaims:{en:['book'],zh:[]}});assert.deepEqual(parts.records.languageTreeClaims,{en:['book'],zh:[]});assert.equal(parts.state.languageTreeClaims,undefined);});

test('server-existing mastery never rewards again even if local reward receipts are absent',async()=>{
 const state=emptyLanguageTree();state.masteryEarned=['book'];let grants=0,writes=0;
 const store={read:async()=>({state,persisted:true}),update:async(_,reduce)=>({result:reduce(state),state,persisted:true})};
 const sync=createMasterySync({key:'a',store,language:'en',remote:{read:async()=>({en:['book'],zh:[]}),write:async()=>{writes++;}},onConfirmed:()=>{grants++;}});
 await sync.sync();await sync.sync();assert.equal(grants,0);assert.equal(writes,0);
});

test('failed local redemption retries from a durable pending receipt without another mastery write',async()=>{
 const state=emptyLanguageTree();state.masteryEarned=['book'];let remoteWords=[],writes=0;
 const store={read:async()=>({state,persisted:true}),update:async(_,reduce)=>({result:reduce(state),state,persisted:true})};
 const remote={read:async()=>({en:remoteWords,zh:[]}),write:async value=>{remoteWords=value.en;writes++;}};
 await assert.rejects(createMasterySync({key:'a',store,language:'en',remote,onConfirmed:()=>{throw Error('disk');}}).sync());
 assert.deepEqual(state.masteryRewardPending,['book']);const save={inventory:{}};
 await createMasterySync({key:'a',store,language:'en',remote,onConfirmed:(lang,words)=>claimTreeMasteryRewards(save,lang,words)}).sync();
 assert.equal(save.inventory[100],50);assert.equal(writes,1);assert.deepEqual(state.masteryRewardPending,[]);
});
