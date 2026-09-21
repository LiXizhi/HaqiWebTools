import test from 'node:test';
import assert from 'node:assert/strict';
import { readOriginalCharacter } from '../js/haqi_original.js';

function fixture() {
    const sdk = { token: 'synthetic-token' }, calls = [];
    let closed = false;
    const responses = {
        'Users.GetNIDByOtherAccountID': { nid: '123' },
        Ping: { ver: 26 }, AuthUser: { issuccess: true, nid: 123, sessionkey: 'not-for-storage' },
        'Power_Users.GetUserAndDragonInfo': { user: { nid: 123, nickname: 'Test' }, dragon: { combatschool: 'fire', combatlel: 10, combatexp: 4654 } },
        'Items.GetMyBags': { issuccess: true, bagids: '0,1' },
        'Items.GetItemsInBag': { items: [{ guid: 1, gsid: 100, copies: 1, position: 0, serverdata: '{"addlel":2}' }] },
    };
    const options = {
        sdk,
        fetchImpl: async (url, init) => {
            assert.equal(init.redirect, 'error');
            return { ok: true, json: async () => url.endsWith('getProfile')
                ? { data: { username: 'TestUser', idcardAuth: { status: 0, idNum: '000000199001010000' } } }
                : url.endsWith('currentTime') ? { timestamp: Date.UTC(2026, 8, 20) } : { data: { code: 'synthetic-code' } } };
        },
        connect: async () => ({ close: () => { closed = true; }, request: async (name, params) => { calls.push({ name, params });return responses[name]; } }),
    };
    return { options, responses, calls, isClosed: () => closed };
}

test('original reader uses authenticated identity and returns no session credentials', async () => {
    const source = fixture();const result = await readOriginalCharacter(source.options);
    assert.equal(result.owner, 'TestUser');assert.equal(result.inventory.length, 2);
    assert.equal(source.calls[1].name, 'Users.GetNIDByOtherAccountID');
    assert.equal(source.calls[2].params.ver, 26);
    assert.equal(source.calls[2].params.plat, 7);
    assert.equal(source.calls[2].params.nid2, 123);
    assert.ok(source.calls.filter(row => row.name === 'Items.GetItemsInBag').every(row => row.params.nid === 123));
    assert.ok(!JSON.stringify(result).includes('synthetic'));assert.ok(!JSON.stringify(result).includes('not-for-storage'));
    assert.ok(source.isClosed());
});

test('product selection requests only listed equipment and card bags', async () => {
    const source=fixture();source.responses['Items.GetMyBags'].bagids='0,1,2,24,25,99';
    const result=await readOriginalCharacter({...source.options,requestedBags:[0,1,24,25]});
    assert.deepEqual(result.inventory.map(row=>row.bag),[0,1,24,25]);
    assert.deepEqual(source.calls.filter(row=>row.name==='Items.GetItemsInBag').map(row=>row.params.bag),[0,1,24,25]);
});

test('original reader selects only linked roles before authentication', async () => {
    const source = fixture();
    source.responses['Users.GetNIDByOtherAccountID'] = { nid: '456,123' };
    source.options.selectRole = async ids => { assert.deepEqual(ids, [456,123]);return 123; };
    await readOriginalCharacter(source.options);
    assert.equal(source.calls[2].params.nid2, 123);
    for (const value of ['', '-1', '123,bad', '123,123']) {
        const invalid = fixture();invalid.responses['Users.GetNIDByOtherAccountID'] = { nid: value };
        await assert.rejects(readOriginalCharacter(invalid.options));
        assert.ok(invalid.isClosed());
        assert.ok(!invalid.calls.some(row => row.name === 'AuthUser'));
    }
    const outside = fixture();outside.responses['Users.GetNIDByOtherAccountID'] = { nid: '123,456' };
    outside.options.selectRole = () => 999;
    await assert.rejects(readOriginalCharacter(outside.options), /请选择/);
    assert.ok(!outside.calls.some(row => row.name === 'AuthUser'));
    const mismatch = fixture();mismatch.responses.AuthUser.nid = 456;
    await assert.rejects(readOriginalCharacter(mismatch.options));
    assert.equal(mismatch.calls.length, 3);
});

test('original reader fails closed for incomplete bags and identity mismatch', async () => {
    for (const mode of ['bags', 'identity', 'auth']) {
        const source = fixture();
        if (mode === 'bags') source.responses['Items.GetItemsInBag'] = {};
        if (mode === 'identity') source.responses['Power_Users.GetUserAndDragonInfo'].user.nid = 999;
        if (mode === 'auth') source.responses.AuthUser = { issuccess: false, errorcode: 419 };
        await assert.rejects(readOriginalCharacter(source.options));assert.ok(source.isClosed());
    }
});

test('original reader reports authentication step and known error without leaking server content', async () => {
    const source = fixture();
    source.responses.AuthUser = { issuccess: false, errorcode: 438, message: 'private-server-content' };
    await assert.rejects(readOriginalCharacter(source.options), error => {
        assert.match(error.message, /AuthUser.*438.*未传递必要的用户凭证/);
        assert.ok(!error.message.includes('private-server-content'));
        return true;
    });
    assert.ok(source.isClosed());
    assert.equal(source.calls.length, 3);
});

test('original reader cancels before authorization and rejects account changes', async () => {
    const source = fixture(), controller = new AbortController();controller.abort();
    await assert.rejects(readOriginalCharacter({ ...source.options, signal: controller.signal }));
    assert.equal(source.calls.length, 0);
    const changed = fixture();
    const fetch = changed.options.fetchImpl;
    changed.options.fetchImpl = async (...args) => { const response = await fetch(...args);changed.options.sdk.token = 'changed';return response; };
    await assert.rejects(readOriginalCharacter(changed.options), /账号/);assert.equal(changed.calls.length, 0);
});

test('original reader refuses unverified and minor profiles before game authorization', async () => {
    for (const auth of [{ status: 1 }, { status: 0, idNum: '000000201501010000' }]) {
        const source = fixture();const fetch = source.options.fetchImpl;
        source.options.fetchImpl = async (url, init) => url.endsWith('getProfile')
            ? { ok: true, json: async () => ({ data: { username: 'TestUser', idcardAuth: auth } }) }
            : fetch(url, init);
        await assert.rejects(readOriginalCharacter(source.options));
        assert.equal(source.calls.length, 0);
    }
});

test('original reader cancellation during bag reads closes without returning a partial snapshot', async () => {
    const source = fixture(), controller = new AbortController();
    source.options.onProgress = label => { if (label.includes('1/2')) controller.abort(); };
    await assert.rejects(readOriginalCharacter({ ...source.options, signal: controller.signal }), /取消/);
    assert.ok(source.isClosed());
    assert.equal(source.calls.filter(row => row.name === 'Items.GetItemsInBag').length, 0);
});