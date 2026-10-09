import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDialogueJson,dialogueReplyPreview} from '../js/dialogue_json_core.js';
import {createLearningVoice} from '../js/language_adventure_voice.js';

test('model JSON tolerates fences and trailing explanations while respecting strings and nested objects',()=>{
    const result={reply:'Hello "friend"! {keep chatting} \\ path',translation:'你好',learning:{worthy:true,quote:'Hello'},rows:[{text:'}'}]};
    const json=JSON.stringify(result);
    for(const output of [json,json+'\nHere is the explanation.','```JSON\n'+json+'\n```\nDone.','Response:\n'+json])assert.deepEqual(parseDialogueJson(output),result);
    assert.deepEqual(parseDialogueJson('{"reply":"Hi"}\n{"learning":{"worthy":true}}'),{reply:'Hi'},'extra reward objects must not be merged');
    for(const output of ['{"reply":"unfinished','{"reply":"Hi",}','plain text'])assert.throws(()=>parseDialogueJson(output),/对话回复格式不完整/);
});

test('voice model adapter returns useful reply despite trailing text; malformed replies are retryable',async()=>{
    let output='{"reply":"Hello!","translation":"你好！"}\nExplanation after JSON';
    const voice=createLearningVoice({load:async()=>({token:'test',aiChat:{chat:async()=>output}})}),signal=new AbortController().signal;
    assert.equal((await voice.judge([],signal)).reply,'Hello!');
    assert.equal(await voice.judge([],signal,{rawText:true}),output);
    output='{"reply":"unfinished';
    await assert.rejects(voice.judge([],signal),error=>error.requestUncertain===false&&error.message==='对话回复格式不完整，请重试。');
});


test('streaming JSON previews only reply text and keeps evaluation gated until completion',async()=>{
    assert.equal(dialogueReplyPreview('{"reply":"Hello'), 'Hello');
    assert.equal(dialogueReplyPreview('{"reply":"A \\"quote\\" and \\u4f60"}'.replaceAll('\\\\','\\')), 'A "quote" and 你');
    assert.equal(dialogueReplyPreview('{"reply":"Hi","learning":{"worthy":true}}'),'Hi');
    assert.equal(dialogueReplyPreview('{"learning":'), '');
    const chunks=[];
    const voice=createLearningVoice({load:async()=>({token:'test',aiChat:{chat:async options=>{
        assert.equal(options.stream,true);options.onMessage('{"reply":"Hi');options.onMessage('{"reply":"Hi there!"}');return '{"reply":"Hi there!"}';
    }}})});
    assert.equal((await voice.judge([],new AbortController().signal,{onReply:text=>chunks.push(text)})).reply,'Hi there!');
    assert.deepEqual(chunks,['Hi','Hi there!']);
});
