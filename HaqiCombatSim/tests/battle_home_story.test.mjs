import test from 'node:test';
import assert from 'node:assert/strict';
import {homeStoryProgress,resetHomeStory,replayHomeStory,recordHomeStory,validateHomeStoryArcs} from '../js/home_story_core.js';
import {recordEffectivePractice,recordComprehensionPractice} from '../js/language_practice_core.js';
import {buildWordIndex,parseWordLexicon} from '../js/word_lexicon_core.js';
const index=buildWordIndex(parseWordLexicon('书||book','en'));
const event=(step,id)=>({id,input:'text',at:step+10,valid:true,words:['book'],source:'home-story:step-'+step,review:{mode:'find',story:{id:'reading',homeId:'home1',step,storyId:'step-'+step,objectId:'book1',petId:'pet1'}}});

test('explicit replay keeps learning receipts and completion evidence but clears old object bindings',()=>{
 const state={words:{book:{}}};
 assert.equal(replayHomeStory(state,'home1','reading',2),false);
 assert.ok(recordEffectivePractice(state,event(0,'first'),index));
 assert.equal(replayHomeStory(state,'home1','reading',2),false);
 assert.ok(recordEffectivePractice(state,event(1,'last'),index));
 const words=structuredClone(state.words),receipts=structuredClone(state.practiceReceipts);
 assert.equal(replayHomeStory(state,'home2','reading',2),false);
 for(const total of [0,1,3,33,NaN])assert.equal(replayHomeStory(state,'home1','reading',total),false);
 assert.ok(replayHomeStory(state,'home1','reading',2));
 assert.deepEqual(homeStoryProgress(state,'home1','reading'),{next:0,objects:{},pets:{},replayCount:1,lastCompletedAt:11});
 assert.deepEqual(state.words,words);assert.deepEqual(state.practiceReceipts,receipts);
 assert.equal(replayHomeStory(state,'home1','reading',2),false);
 assert.equal(recordEffectivePractice(state,event(0,'first'),index),false);
 const fresh={...event(0,'fresh'),at:100};fresh.review.story.objectId='another-book';
 assert.ok(recordEffectivePractice(state,fresh,index));
 assert.equal(homeStoryProgress(state,'home1','reading').objects[0],'another-book');
 assert.equal(homeStoryProgress(state,'home1','reading').lastCompletedAt,11);
 assert.equal(state.words.book.practiceCount,3);
 assert.ok(recordEffectivePractice(state,{...event(1,'fresh-last'),at:101},index));
 assert.ok(replayHomeStory(state,'home1','reading',2));
 assert.equal(homeStoryProgress(state,'home1','reading').replayCount,2);
 assert.equal(homeStoryProgress(state,'home1','reading').lastCompletedAt,101);
});
test('home story progress advances atomically with effective practice and survives sessions without duplicate steps',()=>{
 const state={words:{book:{}}};assert.ok(recordEffectivePractice(state,event(0,'a'),index));
 assert.equal(homeStoryProgress(state,'home1','reading').next,1);assert.equal(state.words.book.practiceCount,1);
 assert.equal(recordEffectivePractice(state,event(0,'a'),index),false);assert.equal(homeStoryProgress(state,'home1','reading').next,1);
 assert.equal(recordHomeStory(state,event(2,'skip')),false);assert.equal(homeStoryProgress(state,'home2','reading').next,0);
 const copy=JSON.parse(JSON.stringify(state));assert.ok(recordEffectivePractice(copy,event(1,'b'),index));assert.equal(homeStoryProgress(copy,'home1','reading').next,2);assert.equal(homeStoryProgress(copy,'home1','reading').objects[0],'book1');assert.equal(homeStoryProgress(copy,'home1','reading').pets[0],'pet1');
 assert.equal(recordHomeStory(copy,{...event(2,'c'),source:'wrong'}),false);resetHomeStory(copy,'home1','reading');assert.equal(homeStoryProgress(copy,'home1','reading').next,0);assert.equal(copy.words.book.practiceCount,2);
});
test('home story authoring rejects missing steps and forward object dependencies',()=>{
 const data={games:[{id:'one',arcOnly:'arc',mode:'find'}],arcs:[{id:'arc',title:'Title',ending:'Done',steps:[{storyId:'one',useObjects:[]}]}]};assert.equal(validateHomeStoryArcs(data),data);
 assert.throws(()=>validateHomeStoryArcs({...data,arcs:[{...data.arcs[0],steps:[{storyId:'missing',useObjects:[]}]}]}));
 assert.throws(()=>validateHomeStoryArcs({...data,arcs:[{...data.arcs[0],steps:[{storyId:'one',useObjects:[0]}]}]}));
 assert.throws(()=>validateHomeStoryArcs({...data,arcs:[{...data.arcs[0],steps:[{storyId:'one',useObjects:[]},{storyId:'one',useObjects:[],usePet:0}]}]}),/伙伴/);
});

test('count steps join a story without pretending that a counted set is one saved object',()=>{
 const data={games:[{id:'table',arcOnly:'arc',mode:'find'},{id:'count',arcOnly:'arc',mode:'count'},{id:'note',arcOnly:'arc',mode:'write'}],arcs:[{id:'arc',title:'Count',ending:'Done',steps:[{storyId:'table',useObjects:[]},{storyId:'count',useObjects:[]},{storyId:'note',useObjects:[0]}]}]};
 assert.equal(validateHomeStoryArcs(data),data);
 const wrong=structuredClone(data);wrong.arcs[0].steps[2].useObjects=[1];
 assert.throws(()=>validateHomeStoryArcs(wrong),/整组物品/);
 const narrowed=structuredClone(data);narrowed.arcs[0].steps[1].useObjects=[0];
 assert.throws(()=>validateHomeStoryArcs(narrowed),/整组物品/);
});

test('listening and reading advance story steps with separate evidence, including an honest reading fallback',()=>{
 const state={words:{book:{practiceCount:1,lastPractice:{at:1},mark:'unknown'}}};
 const listen={...event(0,'listen'),input:'listen',heard:false,assisted:false,attempts:1,review:{mode:'listen',story:{...event(0,'listen').review.story,objectId:'chosen-book2'}}};
 assert.equal(recordComprehensionPractice(state,listen,index),false);assert.equal(homeStoryProgress(state,'home1','reading').next,0);
 assert.ok(recordComprehensionPractice(state,{...listen,heard:true},index));assert.equal(homeStoryProgress(state,'home1','reading').objects[0],'chosen-book2');
 assert.equal(recordComprehensionPractice(state,{...listen,heard:true},index),false);assert.equal(homeStoryProgress(state,'home1','reading').next,1);
 const fallback={...event(1,'fallback'),input:'read',heard:false,assisted:true,attempts:1,review:{mode:'listen',story:event(1,'fallback').review.story}};
 assert.ok(recordComprehensionPractice(state,fallback,index));assert.equal(homeStoryProgress(state,'home1','reading').next,2);
 assert.equal(state.words.book.comprehension.listen.count,1);assert.equal(state.words.book.comprehension.read.count,1);assert.equal(state.words.book.comprehension.read.last.assisted,true);
 assert.equal(state.words.book.practiceCount,1);assert.equal(state.words.book.lastPractice.at,1);assert.equal(state.words.book.mark,'unknown');assert.equal(state.words.book.homeReview,undefined);
});
