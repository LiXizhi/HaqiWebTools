import test from 'node:test';
import assert from 'node:assert/strict';
import {rechargeAmount,membershipCheckoutUrl} from '../js/adventure_recharge_core.js';
import {createMembershipClient} from '../js/adventure_membership.js';
import {magicBeanExchangeQuote} from '../js/adventure_magic_bean_exchange_core.js';

test('custom amount preserves cents and rejects malformed or unsafe amounts',()=>{
    for(const [input,expected] of [['4',4],['20.10',20.1],['0.01',0.01],[' 50 ',50]])assert.equal(rechargeAmount(input),expected);
    for(const input of ['',0,-1,'NaN','Infinity','1e3','4.001','1,000','9007199254740992'])assert.throws(()=>rechargeAmount(input));
});
test('CDN checkout uses the main site and passes custom amount in cents',()=>{
    const url=new URL(membershipCheckoutUrl(123,'20.15','/games/Haqi.html?lang=zh-CN'));
    assert.equal(url.origin,'https://keepwork.com');assert.equal(url.pathname,'/p/vb/vipPayOrder');
    assert.equal(url.searchParams.get('amount'),'2015');assert.equal(url.searchParams.get('userId'),'123');
    assert.equal(url.searchParams.get('productCode'),'vip_common_1_day');
    assert.equal(url.searchParams.get('referralUrl'),'/games/Haqi.html?lang=zh-CN');
    assert.throws(()=>membershipCheckoutUrl(null,4));
});
function harness(){
    const events=new EventTarget(),visibility=new EventTarget();visibility.hidden=false;
    let auth;
    const profile={username:'alice',commonVip:1,commonVipDeadline:'2026-10-01T00:00:00Z'};
    const calls=[];
    const sdk={token:'test',onAuthStateChange:fn=>{auth=fn;},getUserProfile:async()=>({...profile}),ads:{openVipMembership:async options=>{calls.push(options);return true;}}};
    const client=createMembershipClient({loadSDK:async()=>sdk,now:()=>Date.parse('2026-09-27T00:00:00Z'),eventTarget:events,visibility});
    return {client,sdk,profile,calls,events,auth:()=>auth()};
}
test('recharge calls the real membership API; an existing VIP true result gives no extra beans',async()=>{
    const {client,calls}=harness();
    const member=await client.openRecharge('20.15','alice');
    assert.deepEqual(calls,[{productCode:'vip_common_1_day',amountYuan:20.15,from:'haqi_adventure'}]);
    assert.equal(member.expiresAt,'2026-10-01T00:00:00.000Z');
    assert.equal(magicBeanExchangeQuote(member,{exchangedUntil:'2026-10-01'},Date.parse('2026-09-27')).beans,0);
    assert.equal(client.state.rechargePending,false);
});
test('payment return reads real expiry and quotes only new dates',async()=>{
    const {client,sdk,profile}=harness();
    sdk.ads.openVipMembership=async()=>{profile.commonVipDeadline='2026-10-06T00:00:00Z';return true;};
    const member=await client.openRecharge(20,'alice');
    assert.equal(magicBeanExchangeQuote(member,{exchangedUntil:'2026-10-01'},Date.parse('2026-09-27')).beans,50);
});
test('guest, wrong owner and missing real SDK capability cannot start payment',async()=>{
    for(const kind of ['guest','owner','capability']){
        const {client,sdk,calls}=harness();
        if(kind==='guest')sdk.token=null;
        if(kind==='capability')sdk.ads={};
        await assert.rejects(client.openRecharge(4,kind==='owner'?'bob':'alice'));
        assert.equal(calls.length,0);assert.equal(client.state.rechargePending,false);
    }
});
test('duplicate clicks are blocked; cancellation and network errors release the lock',async()=>{
    const {client,sdk}=harness();let finish;
    sdk.ads.openVipMembership=()=>new Promise(resolve=>{finish=resolve;});
    const pending=client.openRecharge(4,'alice');
    await assert.rejects(client.openRecharge(4,'alice'),/正在处理中/);
    while(!finish)await new Promise(resolve=>setImmediate(resolve));
    finish(false);await pending;assert.equal(client.state.rechargePending,false);
    sdk.ads.openVipMembership=async()=>{throw Error('offline');};
    await assert.rejects(client.openRecharge(4,'alice'),/offline/);assert.equal(client.state.rechargePending,false);
});
test('return focus refreshes a renewal even after SDK reports already VIP',async()=>{
    const {client,profile,events}=harness();await client.openRecharge(4,'alice');
    profile.commonVipDeadline='2026-11-01T00:00:00Z';events.dispatchEvent(new Event('focus'));
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(client.state.expiresAt,'2026-11-01T00:00:00.000Z');
});
test('account changes during payment reject the result',async()=>{
    const {client,sdk,auth}=harness();sdk.ads.openVipMembership=async()=>{sdk.token='other';auth();return true;};
    await assert.rejects(client.openRecharge(4,'alice'),/账号已变化/);
    assert.equal(client.state.isVip,false);
});
test('CDN deployment bypasses SDK host bug; blocked windows do not report success',async()=>{
    const {client,profile,calls,events}=harness();profile.id=123;
    events.location={hostname:'cdn.keepwork.com',pathname:'/games/Haqi.html',search:''};
    let opened;events.open=url=>{opened=url;return {};};
    await client.openRecharge('4.25','alice');
    assert.equal(new URL(opened).origin,'https://keepwork.com');assert.equal(new URL(opened).searchParams.get('amount'),'425');
    assert.equal(calls.length,0);
    events.open=()=>null;
    await assert.rejects(client.openRecharge(4,'alice'),/拦截/);assert.equal(client.state.rechargePending,false);
});
