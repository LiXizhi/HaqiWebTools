import test from 'node:test';
import assert from 'node:assert/strict';
import {createMembershipClient} from '../js/adventure_membership.js';

function harness(profile) {
    let change;
    const sdk={token:'test-token',onAuthStateChange:fn=>{change=fn;},getUserProfile:async options=>{
        assert.deepEqual(options,{forceRefresh:true,useCache:false});return profile;
    }};
    const client=createMembershipClient({loadSDK:async()=>sdk,now:()=>Date.parse('2026-09-21T00:00:00Z')});
    return {client,sdk,change:()=>change()};
}
test('Keepwork normal VIP and SVIP share access; expired, invalid and ordinary accounts do not',async()=>{
    for(const [profile,expected] of [
        [{commonVip:1},true],[{vip:true},true],[{commonVip:0,vip:0},false],
        [{commonVip:1,commonVipDeadline:'2026-09-20T00:00:00Z'},false],
        [{vip:1,vipDeadline:'invalid'},false],
        [{commonVip:1,commonVipDeadline:'2026-09-20',vip:1,vipDeadline:'2027-01-01'},true],
        [{commonVip:'false',vip:'0'},false],
    ])assert.equal((await harness({username:'test',...profile}).client.refresh()).isVip,expected);
});
test('guest never queries profile; logout invalidates an already granted membership',async()=>{
    const {client,sdk,change}=harness({username:'test',vip:1});
    assert.equal((await client.refresh()).isVip,true);
    sdk.token=null;change();assert.equal(client.state.isVip,false);
    sdk.getUserProfile=()=>assert.fail('guest queried profile');
    assert.equal((await client.refresh()).status,'guest');
});
test('account switch, network failure and stale responses cannot grant VIP',async()=>{
    const {client,sdk,change}=harness({username:'test',vip:1});
    await client.refresh();
    let finish;sdk.getUserProfile=()=>new Promise(resolve=>{finish=resolve;});
    const pending=client.refresh();await Promise.resolve();
    sdk.token='other-account';change();finish({username:'test',vip:1});
    await assert.rejects(pending,/无法确认/);assert.equal(client.state.isVip,false);
    sdk.getUserProfile=async()=>{throw Error('offline');};
    await assert.rejects(client.refresh(),/无法确认/);assert.equal(client.state.status,'error');
});
test('an unresponsive membership request times out without granting access',async()=>{
    const client=createMembershipClient({loadSDK:()=>new Promise(()=>{}),timeoutMs:5});
    await assert.rejects(client.refresh(),/无法确认/);assert.equal(client.state.isVip,false);
});
