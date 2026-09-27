import test from 'node:test';
import assert from 'node:assert/strict';
import {createSocialClient} from '../js/adventure_social.js';
function harness(){
    let owner='alice',resolveSend;const values=new Map(),calls=[];
    const sdk={token:'fixture',getUserProfile:async()=>({username:owner,id:owner==='alice'?1:3}),onAuthStateChange:()=>()=>{},socialFriends:{
        list:async()=>[{friend:{id:2,username:'bob',nickname:'小波'}}],listBlacklist:async()=>[],listApplies:async()=>[{id:5,status:1}],
        listMails:async()=>[{id:10,title:'你好',content:'私密正文',fromUserId:2,createdAt:'2026-09-26T11:00:00Z',read:0},{id:11,title:'通知',createdAt:'2026-09-26T11:00:00Z',read:0}],
        readMail:async id=>({id,title:'你好',content:'私密正文',read:0}),setMailRead:async body=>calls.push(['read',body]),
        sendMail:async body=>calls.push(['send',body]),acceptApply:async id=>calls.push(['accept',id]),rejectApply:async()=>{},
    },get:async()=>({age_group:{test:[{username:'placeholder'}]}}),post:async()=>({success:true})};
    const client=createSocialClient({mailVerified:true,getOwner:()=>owner,loadSDK:async()=>sdk,storage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)},now:()=>Date.parse('2026-09-26T12:00:00Z')});
    return {client,sdk,calls,values,switchOwner:()=>{owner='carol';client.reset();},deferSend:()=>{sdk.socialFriends.sendMail=()=>new Promise(resolve=>resolveSend=resolve);},finishSend:()=>resolveSend({success:true})};
}
test('mail read clears only the selected item; applications retain their red dot; communication stores no text',async()=>{
    const h=harness();await h.client.refresh();assert.equal(h.client.state.mailUnread,3);assert.ok(h.client.state.interactions['2']);
    assert.ok([...h.values.values()].every(v=>!v.includes('私密正文')));
    await h.client.readMail(10);assert.equal(h.client.state.mailUnread,2);assert.equal(h.client.state.mails.find(m=>m.id===11).read,false);
    await h.client.processApply(5,true);assert.equal(h.client.state.mailUnread,1);
});
test('failed/uncertain sends retain no interaction; stale account completion is ignored',async()=>{
    const h=harness();await h.client.session();h.sdk.socialFriends.sendMail=async()=>{throw Error('网络中断');};
    await assert.rejects(h.client.sendMail({userId:'2',username:'bob'},'问候','你好'));assert.deepEqual(h.client.state.interactions,{});
    h.deferSend();const send=h.client.sendMail({userId:'2',username:'bob'},'问候','你好');await new Promise(resolve=>setTimeout(resolve,0));h.switchOwner();h.finishSend();await assert.rejects(send,/账号已变化/);assert.deepEqual(h.client.state.interactions,{});
});
test('only current friends can receive mail; unverified chat and unregistered rank fail closed',async()=>{
    const h=harness();await assert.rejects(h.client.sendMail({userId:'9'},'问候','你好'),/好友/);assert.equal(h.calls.length,0);
    await assert.rejects(h.client.history('2'),/尚未完成验证/);assert.equal(h.client.state.chatUnread,0);
    await assert.rejects(h.client.rank({gameId:null},{}),/编号/);
});
test('public profiles are read at the other account path and mismatched owners are rejected',async()=>{
    const h=harness();h.sdk.personalPageStore={withWorkspace:()=>({getRemotePagePath:()=> 'alice/_apps/HaqiAdventure/social/public.json'})};
    h.sdk.getFileByFullPath=async path=>{h.calls.push(path);return JSON.stringify({version:1,userId:2,username:'mallory',name:'冒名',school:'fire',level:1,appearance:'boy',native:'en',target:'zh',visible:true});};
    assert.equal(await h.client.publicRead('bob'),null);assert.deepEqual(h.calls,['bob/_apps/HaqiAdventure/social/public.json']);
    assert.equal(await h.client.publicRead('../alice'),null);assert.equal(h.calls.length,1);
});

test('unverified mail never calls service; negative acknowledgements never clear unread or record interaction',async()=>{
    const h=harness();await h.client.session();h.client.configure({mailVerified:false});
    await assert.rejects(h.client.sendMail({userId:'2'},'问候','你好'),/双账号验证/);assert.equal(h.calls.length,0);
    h.client.configure({mailVerified:true});h.sdk.socialFriends.sendMail=async()=>({success:false});
    await assert.rejects(h.client.sendMail({userId:'2'},'问候','你好'),/未发送成功/);assert.deepEqual(h.client.state.interactions,{});
    await h.client.refresh();h.sdk.socialFriends.setMailRead=async()=>({success:false});
    await assert.rejects(h.client.readMail(10),/未确认/);assert.equal(h.client.state.mailUnread,3);
});
