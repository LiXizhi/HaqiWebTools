import test from 'node:test';
import assert from 'node:assert/strict';
import {createActorSpeech,speechPlacement} from '../js/view_actor_speech.js';
test('all actor types speak concurrently with independent queues and clearing',()=>{
    const speech=createActorSpeech();
    for(const id of ['hero','pet','ally','mob0'])assert.equal(speech.say(id,id,{duration:100}),true);
    speech.say('hero','next',{duration:100});
    assert.equal(speech.messages(0).length,4);
    assert.deepEqual(speech.messages(101).map(row=>row.text),['next']);
    speech.clear('hero');assert.deepEqual(speech.messages(102),[]);
    assert.equal(speech.say('hero','',{duration:100}),false);
});
test('speech avoids Buff rectangles and other speech at desktop and mobile sizes',()=>{
    for(const width of [390,1280]){
        const obstacles=[{x:width-150,y:80,width:128,height:64}];
        const rect=speechPlacement({x:width-80,y:150},{width:230,height:55},{width,height:400},obstacles);
        assert.ok(rect);assert.ok(rect.x>=8&&rect.x+rect.width<=width-8);
        for(const other of obstacles)assert.ok(rect.x+rect.width<=other.x||rect.x>=other.x+other.width||rect.y+rect.height<=other.y||rect.y>=other.y+other.height);
    }
    assert.equal(speechPlacement({x:100,y:100},{width:180,height:70},{width:200,height:100},[{x:0,y:0,width:200,height:100}]),null);
});