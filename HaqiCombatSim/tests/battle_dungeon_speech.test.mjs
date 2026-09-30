import test from 'node:test';
import assert from 'node:assert/strict';
import {compareDungeonSpeech} from '../js/dungeon_speech_core.js';
import {createLineAttempt,startLineAttempt,finishLineAttempt} from '../js/adventure_dungeon_language_core.js';

test('speech coverage ignores extra words and reports only missing targets',()=>{
    const result=compareDungeonSpeech('I will help friends today','I will help my friends','en');
    assert.deepEqual(result.differences,[{expected:'my',heard:''}]);
    assert.equal(result.accuracy,0.8);
    assert.equal(compareDungeonSpeech('我会帮助朋友','我会帮助好友','zh-CN').differences.length,1);
    assert.equal(compareDungeonSpeech("I'm fifty.",'I am 50','en').accuracy,1);
});
test('three readings above 30 percent pass; failures neither advance nor erase progress',()=>{
    const a=createLineAttempt({id:'test'},0,{}),expected='I will help my friends';
    for(const [text,count,passed] of [['I help',1,false],['noise',1,false],['I help',2,false],['',2,false],['I help',3,true]]){
        assert.equal(startLineAttempt(a,0),true);
        assert.equal(finishLineAttempt(a,text,expected,'en'),passed);
        assert.equal(a.qualified,count);
    }
    assert.equal(finishLineAttempt(a,expected,expected,'en'),false);
});
test('a complete reading passes immediately and repeated unrelated speech never passes',()=>{
    const a=createLineAttempt({id:'test'},0,{});
    for(let i=0;i<10;i++){startLineAttempt(a,0);assert.equal(finishLineAttempt(a,'noise','I will help my friends','en'),false);}
    assert.equal(a.qualified,0);startLineAttempt(a,0);
    assert.equal(finishLineAttempt(a,'I will help my friends','I will help my friends','en'),true);
});

test('full target coverage ignores repeated sentences, order and minor spelling errors',()=>{
    for(const heard of ['Someone needs our help. Someone needs our.','help our someone need','Someone need our halp']){
        const result=compareDungeonSpeech(heard,'Someone needs our help.','en');
        assert.equal(result.accuracy,1,heard);assert.deepEqual(result.differences,[]);
        assert.ok(result.parts.every(part=>!part.missing));
    }
    assert.equal(compareDungeonSpeech('friends','friends friends','en').accuracy,1);
    assert.equal(compareDungeonSpeech('xxx','Someone needs our help.','en').accuracy,0);
});
test('feedback preserves the original sentence and marks only missing words',()=>{
    const result=compareDungeonSpeech('someone help extra','Someone needs our help.','en');
    assert.equal(result.parts.map(part=>part.text).join(''),'Someone needs our help.');
    assert.deepEqual(result.parts.filter(part=>part.missing).map(part=>part.text),['needs','our']);
    assert.ok(compareDungeonSpeech('I am fifty',"I'm 50.",'en').parts.every(part=>!part.missing));
});
test('30 percent qualifies but lower and empty readings do not',()=>{
    const expected='one two three four five six seven eight nine ten';
    const a=createLineAttempt({id:'threshold'},0,{});
    for(const [text,count] of [['one two',0],['one two three',1],['',1],['one two three',2],['one two three',3]]){
        startLineAttempt(a,0);assert.equal(finishLineAttempt(a,text,expected,'en'),count===3);assert.equal(a.qualified,count);
    }
});
