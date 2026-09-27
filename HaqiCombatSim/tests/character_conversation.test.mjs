import test from 'node:test';
import assert from 'node:assert/strict';
import {createCharacterConversation} from '../js/character_conversation.js';
import {fakeWorkspace} from './helpers/character_workspace.js';

function setup(){
    const f=fakeWorkspace(),cacheRows=new Map(),cache={prepare:async()=>{},get:k=>cacheRows.get(k),set:(k,v)=>cacheRows.set(k,v),flush:async()=>{}};
    let state,callbacks,replyCalls=0,error=null,answerGate=null;
    const app={owner:'alice',role:'r',save:{name:'我',appearance:'boy',inventory:{},languageLearning:{native:'zh-CN',target:'en'}},assets:{content:{items:{}}}};
    const member={vip:false,refresh:async()=>({status:'ready',username:app.owner,isVip:member.vip})};
    const voice={cancel:async()=>{},start:async()=>{},finish:async()=>'Hello from voice',speak:async()=>{},judge:async messages=>{
        const system=messages[0].content;
        if(system.includes('Summarize only'))return {summary:'学习了你好'};
        if(system.includes('a short suggestion'))return {hint:'Try asking in English.'};
        if(system.includes('Greet naturally'))return {reply:'Hello!',translation:'你好！'};
        replyCalls++;if(error)throw error;if(answerGate)await answerGate;
        const json=JSON.parse(system.split('Character and player data: ')[1]);const eventId=JSON.parse(system.match(/"eventId":("[^"]+")/)[1]);
        return {reply:'What does that mean?',translation:'那是什么意思？',affinity:{eventId,before:json.affinity,delta:2,after:Math.min(100,json.affinity+2),reason:'共同学习'}};
    }};
    const chat=createCharacterConversation({getState:()=>app,commit:next=>{app.save=next;},membership:member,cache,workspace:f.workspace,voice,now:()=>Date.parse('2026-09-27T00:00:00Z'),read:async()=>({entries:{}}),viewFactory:cb=>{callbacks=cb;return {render:s=>{state=structuredClone({...s,io:null,abort:null});},close(){},root:{}};},detailsFactory:()=>({close(){},relation(){},gifts(){}})});
    return {f,app,chat,cacheRows,member,get state(){return state;},get callbacks(){return callbacks;},get calls(){return replyCalls;},error:e=>{error=e;},gate:g=>{answerGate=g;}};
}
const peer={id:'a',kind:'companion',name:'安娜',native:'en'};
test('two successful free messages, role switch cannot refill, hints and compact are free, VIP bypasses',async()=>{
    const t=setup();await t.chat.open(peer);assert.equal(t.state.remaining,2);assert.equal(t.calls,0);
    await t.chat.send('Hello. A second sentence in same message.');assert.equal(t.state.remaining,1);assert.equal(t.calls,1);assert.equal(t.state.draft,'');
    await t.chat.send('再聊一句');assert.equal(t.state.remaining,0);await t.chat.send('third');assert.equal(t.calls,2);assert.match(t.state.status,/用完/);
    await t.chat.compact();assert.equal(t.calls,2);t.app.role='other';await t.chat.open({...peer,id:'b'});assert.equal(t.state.remaining,0);
    t.member.vip=true;await t.chat.send('member');assert.equal(t.calls,3);assert.equal(t.state.vip,true);t.chat.close();
});
test('definite pre-dispatch failure refunds; uncertain request keeps reservation and retry does not resend',async()=>{
    const t=setup();await t.chat.open(peer);
    t.error(Object.assign(Error('not sent'),{requestUncertain:false}));await t.chat.send('draft');assert.equal(t.state.remaining,2);assert.equal(t.state.draft,'draft');
    t.error(Object.assign(Error('timeout'),{requestUncertain:true}));await t.chat.send('draft');assert.equal(t.state.remaining,1);const calls=t.calls;
    t.error(null);await t.chat.send('draft');assert.equal(t.calls,calls);assert.match(t.state.status,/结果尚不明确/);assert.equal(t.state.remaining,1);t.chat.close();
});
test('closing during model request cannot write dialogue into newly selected role',async()=>{
    const t=setup();await t.chat.open(peer);let resolve;t.gate(new Promise(r=>{resolve=r;}));
    const sending=t.chat.send('late');while(!t.calls)await new Promise(r=>setTimeout(r,1));
    t.chat.close();t.app.role='other';resolve();await sending;
    const io=await t.f.workspace.connect('r');assert.equal((await io.load('a')).messages.length,1);assert.equal(await(await t.f.workspace.connect('other')).load('a'),null);
});
test('write failure retains generated result; retry commits without a second model call',async()=>{
    const t=setup();await t.chat.open(peer);let resolve;t.gate(new Promise(r=>{resolve=r;}));
    const sending=t.chat.send('remember');while(!t.calls)await new Promise(r=>setTimeout(r,1));t.f.fail('write');resolve();await sending;assert.equal(t.state.draft,'remember');
    t.f.fail(null);t.gate(null);await t.chat.send('remember');assert.equal(t.calls,1);assert.equal(t.state.remaining,1);assert.equal(t.state.messages.length,3);t.chat.close();
});
test('remote receipt recovers on another browser without the local pending cache',async()=>{
    const t=setup();await t.chat.open(peer);t.f.fail('roles/r/relationships/index.json');
    await t.chat.send('remote receipt');assert.equal(t.calls,1);t.chat.close();t.cacheRows.clear();t.f.fail(null);
    await t.chat.open(peer);assert.equal(t.state.draft,'remote receipt');await t.chat.send('remote receipt');
    assert.equal(t.calls,1);assert.equal(t.state.remaining,1);assert.equal(t.state.messages.length,3);t.chat.close();
});
test('compact archives older messages, preserves recent twenty and does not use free quota',async()=>{
    const t=setup();await t.chat.open(peer);t.chat.close();const io=await t.f.workspace.connect('r');
    const before=await io.load('a');const messages=Array.from({length:42},(_,i)=>({role:i%2?'assistant':'user',text:`line ${i}`}));
    await io.save({...before,messages});await t.chat.open(peer);await t.chat.compact();
    const after=await io.load('a');assert.equal(after.messages.length,20);assert.equal(after.summary,'学习了你好');assert.equal((await io.history(after.history)).messages.length,22);assert.equal(t.state.remaining,2);t.chat.close();
});
test('activity outbox retries a failure, marks synchronized events and does not reload old peers',async()=>{
    const t=setup();t.app.save.relationshipEvents=[{id:'win',peer,kind:'dungeon',at:1,reason:'共同通关副本'}];
    t.f.fail('write');await t.chat.syncActivities();assert.equal(t.app.save.relationshipEvents[0].synced,undefined);
    t.f.fail(null);await t.chat.syncActivities();assert.equal(t.app.save.relationshipEvents[0].synced,true);
    const io=await t.f.workspace.connect('r'),row=await io.load('a');assert.equal(row.events[0].delta,3);
    t.f.reads.length=0;await t.chat.syncActivities();assert.equal(t.f.reads.length,0);
});

test('retry button resends a released draft instead of generating another greeting',async()=>{
    const t=setup();await t.chat.open(peer);
    t.error(Object.assign(Error('not sent'),{requestUncertain:false}));await t.chat.send('preserved draft');
    t.error(null);await t.callbacks.retry();
    assert.equal(t.calls,2);assert.equal(t.state.remaining,1);assert.equal(t.state.draft,'');
    assert.equal(t.state.messages.filter(m=>m.role==='user').length,1);t.chat.close();
});

test('failed initial entitlement stays unready and reconnect verifies it before enabling chat',async()=>{
    const t=setup(),refresh=t.member.refresh;
    t.member.refresh=async()=>{throw Error('会员连接失败');};
    await t.chat.open(peer);
    assert.equal(t.state.ready,false);assert.equal(t.state.retryable,true);
    t.member.refresh=refresh;await t.callbacks.retry();
    assert.equal(t.state.ready,true);assert.equal(t.state.remaining,2);
    assert.equal(t.state.messages.length,1);t.chat.close();
});
