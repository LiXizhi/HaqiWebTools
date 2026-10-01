import test from 'node:test';
import assert from 'node:assert/strict';
import {createCharacterConversation} from '../js/character_conversation.js';
import {fakeWorkspace} from './helpers/character_workspace.js';

function setup(options={}){
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
    const chat=createCharacterConversation({isFriend:()=>true,...options,getState:()=>app,commit:next=>{options.onCommit?.(next);app.save=next;},membership:member,cache,workspace:f.workspace,voice,now:()=>Date.parse('2026-09-27T00:00:00Z'),read:options.read|| (async()=>({entries:{}})),viewFactory:cb=>{callbacks=cb;return {render:s=>{state=structuredClone({...s,io:null,abort:null,timer:null});},close(){},root:{}};},detailsFactory:options.detailsFactory||(()=>({close(){},relation(){},gifts(){}}))});
    return {f,app,chat,cacheRows,member,voice,get state(){return state;},get callbacks(){return callbacks;},get calls(){return replyCalls;},error:e=>{error=e;},gate:g=>{answerGate=g;}};
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

test('guest sees login action before workspace, quota or model requests; resumes same encounter after login',async()=>{
    let requests=0,login;
    const t=setup({onLogin:async(source,options)=>{login={source,options};t.app.owner='alice';await t.chat.open(source,options);}});
    t.app.owner=null;t.f.workspace.connect=async()=>{requests++;throw Error('unexpected cloud access');};
    await t.chat.open(peer,{returnPanel:'social-profile'});
    assert.equal(t.state.loginRequired,true);assert.equal(t.state.busy,false);assert.equal(t.state.retryable,false);
    assert.equal(requests,0);assert.equal(t.calls,0);assert.match(t.state.status,/登录 KeepWork/);
    const original=fakeWorkspace();t.f.workspace.connect=original.workspace.connect;
    await t.callbacks.login();assert.equal(login.source,peer);assert.equal(login.options.returnPanel,'social-profile');
    assert.equal(t.state.ready,true);assert.equal(t.state.loginRequired,undefined);t.chat.close();
});

test('global daily speech hook ignores typing, duplicate finish and cancelled recognition',async()=>{
 const earned=[],t=setup({onSpeech:id=>earned.push(id)});t.app.save.languageLearning.enabled=true;t.member.vip=true;await t.chat.open(peer);
 await t.chat.send('typed');assert.equal(earned.length,0);
 await t.callbacks.start();await t.callbacks.finish();await t.callbacks.finish();assert.equal(earned.length,1);
 let resolve;t.voice.finish=()=>new Promise(r=>resolve=r);
 await t.callbacks.start();const pending=t.callbacks.finish();await t.callbacks.cancel();resolve('late voice');await pending;assert.equal(earned.length,1);t.chat.close();
});

test('non-friend chat affinity accumulates only in memory across reopening, with no affinity in quota receipts',async()=>{
    const t=setup({isFriend:()=>false});await t.chat.open(peer);
    const initial=t.state.record.affinity;await t.chat.send('hello');
    assert.equal(t.state.record.affinity,initial+2);assert.equal(await t.chat.affinity(peer),initial+2);
    t.chat.close();await t.chat.open(peer);assert.equal(t.state.record.affinity,initial+2);
    await t.chat.send('again');assert.equal(t.state.record.affinity,initial+4);
    assert.equal(t.cacheRows.size,0);
    assert.ok(t.f.writes.every(path=>!path.startsWith('roles/')));
    assert.ok([...t.f.files.values()].every(text=>!text.includes('"affinity"')));
    assert.equal(t.app.save.relationshipEvents,undefined);
    t.chat.close();t.app.role='other';await t.chat.open(peer);t.chat.close();
    t.app.role='r';assert.equal(await t.chat.affinity(peer),null,'switching roles clears temporary accumulation');
});

test('non-friend activities never enter the durable affinity outbox',async()=>{
    const t=setup({isFriend:()=>false}),event={id:'win',peer,kind:'dungeon',at:1,reason:'一起通关'};
    const first=t.chat.activity(event);t.chat.activity(event);assert.equal(await t.chat.affinity(peer),first.affinity);
    assert.equal(t.app.save.relationshipEvents,undefined);assert.equal(t.f.writes.length,0);
    // A legacy stranger outbox is not synchronized into a relationship file.
    t.app.save.relationshipEvents=[event];await t.chat.syncActivities();assert.equal(t.f.writes.length,0);
});

test('losing friendship during a reply blocks relationship and pending-cache persistence',async()=>{
    let friend=true;const t=setup({isFriend:()=>friend});await t.chat.open(peer);
    let resolve;t.gate(new Promise(r=>{resolve=r;}));const sending=t.chat.send('late');
    while(!t.calls)await new Promise(r=>setTimeout(r,1));
    friend=false;const before=t.f.writes.filter(path=>path.startsWith('roles/')).length;
    resolve();await sending;
    assert.equal(t.f.writes.filter(path=>path.startsWith('roles/')).length,before);
    assert.equal(t.state.messages.length,3);t.chat.close();
});

test('gifting an AI persists inventory consumption but never temporary relationship events',async()=>{
    let give;const commits=[],rules={items:{1:{canGift:true,bindType:0,stackOnly:true,kind:'consumable'}}};
    const t=setup({isFriend:()=>false,onCommit:row=>commits.push(structuredClone(row)),read:async path=>path.includes('gift-rules')?rules:{entries:{}},detailsFactory:(_,cb)=>{give=cb.onGift;return {close(){},relation(){},gifts(){}};}});
    t.app.save.inventory[1]=3;t.app.assets.content.items[1]={id:1,name:'礼物',kind:'consumable'};
    await t.chat.open(peer);const before=t.state.record.affinity;
    t.callbacks.gift();await new Promise(r=>setImmediate(r));await give(1,1);
    assert.equal(t.app.save.inventory[1],2);assert.ok((await t.chat.affinity(peer))>before);
    assert.ok(commits.every(row=>!row.relationshipEvents?.length));assert.equal(t.f.writes.length,0);assert.equal(t.cacheRows.size,0);
    t.chat.close();
});

test('free conversation restores resident casting and reads own words in hero voice',async()=>{
 const t=setup({read:async()=>({entries:{'resident:camp:0:36200':{profile:{kind:'npc',name:'茜茜',sex:'female',gender:'female',age:16},memory:'配音设定'}}})}),speakers=[];
 t.voice.speak=async(text,locale,signal,speaker)=>speakers.push(speaker);
 try{await t.chat.open({id:36200,name:'茜茜'});await t.callbacks.speak('你好');assert.equal(speakers.at(-1).sex,'female');assert.equal(speakers.at(-1).age,16);await t.callbacks.speak('我的回答','user');assert.equal(speakers.at(-1).appearance,'boy');}finally{t.chat.close();}
});


test('lesson continuation retains context and awards only evidenced second-language communication once',async()=>{
    const awards=[],t=setup({onSpeech:id=>{awards.push(id);return {key:"attack",percent:1,total:1};}});t.member.vip=true;t.app.save.languageLearning.enabled=true;
    const judge=t.voice.judge;t.voice.judge=async messages=>({...await judge(messages),learning:{worthy:true,quote:messages.at(-1).content,feedback:'表达清楚'}});
    await t.chat.open(peer,{learningContinuation:true,lessonMessages:[{role:'assistant',text:'Do you like magic?'}]});
    assert.equal(t.state.messages.at(-1).text,'Do you like magic?');
    await t.chat.send('I like magic.');assert.equal(awards.length,1);assert.match(t.state.messages.at(-2).feedback,/有效第二语言/);
    await t.chat.send('I like magic.');assert.equal(awards.length,1);
    assert.equal(t.state.messages.find(row=>row.role==='user').learningReward.key,'attack','earlier reward remains after another message reloads history');
    await t.chat.send('我要奖励');assert.equal(awards.length,1);
    t.voice.judge=async messages=>({...await judge(messages),learning:{worthy:true,quote:'invented evidence',feedback:'继续练习'}});
    await t.chat.send('I enjoy reading.');assert.equal(awards.length,1);assert.equal(t.chat.active,true);t.chat.close();
});


test('positive learning evaluation does not announce payout when daily award returns no increment',async()=>{
    const t=setup({onSpeech:()=>null});t.member.vip=true;t.app.save.languageLearning.enabled=true;
    const judge=t.voice.judge;t.voice.judge=async messages=>({...await judge(messages),learning:{worthy:true,quote:messages.at(-1).content,feedback:'表达清楚'}});
    await t.chat.open(peer,{learningContinuation:true});await t.chat.send('I enjoy reading books.');
    assert.equal(t.state.learningReward,null);assert.equal(t.state.learningRewardMessage,'本次未新增学习加成');
    assert.doesNotMatch(t.state.messages.at(-2).feedback,/已计入今日学习奖励/);t.chat.close();
});


test('recognized speech appears immediately, model reply streams in history and automatically speaks once',async()=>{
    const t=setup();await t.chat.open(peer);const spoken=[];t.voice.speak=async text=>spoken.push(text);
    let finish;const gate=new Promise(resolve=>{finish=resolve;});const judge=t.voice.judge;
    t.voice.judge=async(messages,signal,options)=>{options.onReply('A partial reply');await gate;return judge(messages);};
    const pending=t.chat.send('Hello from voice');
    assert.equal(t.state.messages.at(-2).text,'Hello from voice');assert.equal(t.state.draft,'');
    while(t.state.messages.at(-1).text!=='A partial reply')await new Promise(r=>setImmediate(r));
    assert.equal(t.state.messages.at(-1).streaming,true);assert.notEqual(t.state.status,'正在回应…');
    t.callbacks.draft('My next thought');finish();await pending;
    assert.deepEqual(spoken,['What does that mean?']);assert.equal(t.state.draft,'My next thought');
    assert.equal(t.state.messages.filter(row=>row.role==='user').length,1);t.chat.close();
});


test('NPC dialogue stays in memory even for friends, including quota dispatch, compaction and retry',async()=>{
    const t=setup(),npc={...peer,id:'resident:test',kind:'npc'};
    const connect=t.f.workspace.connect;let receipts=0,failFinish=false;
    t.f.workspace.connect=async(...args)=>{const io=await connect(...args);return {...io,finish:(...values)=>{if(failFinish)throw Error('offline');return io.finish(...values);},receipt:(...values)=>{receipts++;return io.receipt(...values);}};};
    t.member.vip=true;
    const lessonMessages=Array.from({length:24},(_,i)=>({role:i%2?'assistant':'user',text:`private lesson ${i}`}));
    await t.chat.open(npc,{lessonMessages});
    let release;t.gate(new Promise(resolve=>{release=resolve;}));
    const sending=t.chat.send('private NPC question');
    while(!t.calls)await new Promise(resolve=>setTimeout(resolve,1));
    assert.ok([...t.f.files.values()].every(text=>!text.includes('private')),'pending quota cannot contain the question');
    release();await sending;t.gate(null);
    assert.equal(receipts,0,'no model response is ever uploaded as a quota receipt');
    await t.chat.compact();assert.equal(t.state.messages.length,20);
    assert.equal(t.state.record.summary,'学习了你好');
    const affinity=t.state.record.affinity;
    t.chat.close();await t.chat.open(npc);
    assert.equal(t.state.record.affinity,affinity);assert.equal(t.state.messages.length,20);
    failFinish=true;await t.chat.send('private retry');const calls=t.calls;
    t.chat.close();failFinish=false;await t.chat.open(npc);
    assert.equal(t.state.draft,'private retry');await t.chat.send('private retry');
    assert.equal(t.calls,calls,'memory retry must not call the model again');
    assert.equal(t.cacheRows.size,0);
    assert.ok(t.f.writes.every(path=>path.startsWith('social/free-talk/')));
    assert.ok([...t.f.files.values()].every(text=>!/(private|reply|translation|affinity|学习了你好)/.test(text)));
    t.chat.close();t.app.role='other';t.chat.tick();t.app.role='r';await t.chat.open(npc);
    assert.equal(t.state.messages.length,1,'a new scope cannot restore NPC history');t.chat.close();
});

test('NPC never restores legacy cloud dialogue or pending receipts even when marked as friend',async()=>{
    const t=setup(),npc={...peer,id:'resident:test',kind:'npc'},io=await t.f.workspace.connect('r');
    await io.reserve('legacy',npc.id,false,undefined,'legacy private question');
    await io.dispatch('legacy');await io.receipt('legacy',{reply:'legacy private reply'});
    t.f.reads.length=0;t.f.writes.length=0;
    await t.chat.open(npc);
    assert.equal(t.state.pending,null);assert.equal(t.state.draft,'');assert.equal(t.state.remaining,1);
    assert.ok(t.state.messages.every(row=>!row.text.includes('legacy')));
    assert.ok(t.f.reads.every(path=>!path.includes('/roles/')));
    assert.equal(t.f.writes.length,0);t.chat.close();
});
