import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameServerSession} from '../js/adventure_game_server.js';

const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture(fetchResponse, options = {}) {
    const sockets = [], requests = [], statuses = [], replacements = [];
    let state = {owner: 'alice', roleId: 'role-1', roomId: 'haqi:camp', x: 10, y: 20};
    let credentials = {username: 'alice', token: 'private-test-token'}, at = 0;
    class Socket {
        constructor(url) { this.url = url; this.readyState = 0; this.sent = []; sockets.push(this); }
        send(text) { this.sent.push(JSON.parse(text)); }
        close() { this.readyState = 3; this.onclose?.(); }
        open() { this.readyState = 1; this.onopen(); }
        message(data) { this.onmessage({data: JSON.stringify(data)}); }
    }
    const assignment = {url: 'wss://us1.gameserver.keepwork.com/world/8798', username: 'alice',
        playerId: 'haqi_verified', instanceId: 1, ticket: 'one-time-ticket'};
    const client = createGameServerSession({getState: () => state, getCredentials: () => credentials,
        onReplaced: () => replacements.push(true), onStatus: value => statuses.push(value), now: () => at,
        setTimer: () => 1, clearTimer: () => {}, WebSocketImpl: Socket,
        fetchImpl: async (url, options) => { requests.push({url, options}); return fetchResponse ? fetchResponse() : Response.json(assignment); },
        ...options,
    });
    return {client, sockets, requests, statuses, replacements, assignment, setState: value => state = {...state, ...value},
        setCredentials: value => credentials = value, advance: () => at += 31000};
}
function welcome(f) {
    const socket = f.sockets.at(-1); socket.open();
    socket.message({type: 'welcome', self: {id: f.assignment.playerId}, instanceId: f.assignment.instanceId, roomId: 'haqi:camp'});
    return socket;
}

test('guest never sends credentials; welcome is required before online and movement', async () => {
    const f = fixture();
    try {
        f.setState({owner: null}); f.client.start(); await settle(); assert.equal(f.requests.length, 0);
        f.setState({owner: 'alice'}); f.client.tick(); await settle();
        assert.equal(f.requests[0].options.headers.Authorization, 'Bearer private-test-token');
        assert.equal(f.requests[0].options.body.includes('private-test-token'), false);
        assert.equal(f.client.connected, false);
        const socket = welcome(f); assert.equal(f.client.connected, true);
        assert.equal(socket.sent[0].ticket, 'one-time-ticket');
        assert.equal(socket.url.includes('ticket'), false);
        f.client.tick(); assert.equal(socket.sent.at(-1).type, 'move');
        f.setState({roomId: 'haqi:ice'}); f.client.tick(); assert.equal(socket.sent.at(-1).type, 'enterRoom');
        f.setState({owner: null}); f.client.tick(); assert.equal(socket.readyState, 3); assert.equal(f.client.connected, false);
    } finally { f.client.stop(); }
});

test('disconnect retries with fresh ticket and role switch closes old socket', async () => {
    const f = fixture();
    try {
        f.client.start(); await settle(); const first = welcome(f);
        first.close(); assert.equal(f.client.connected, false);
        f.client.tick(); assert.equal(f.requests.length, 1);
        f.advance(); f.client.tick(); await settle(); welcome(f); assert.equal(f.requests.length, 2);
        f.setState({roleId: 'role-2'}); f.client.tick(); await settle();
        assert.equal(f.sockets[1].readyState, 3); assert.equal(f.requests.length, 3);
    } finally { f.client.stop(); }
});

test('invalid token never opens socket and reports safe error', async () => {
    const f = fixture(() => new Response('', {status: 401}));
    try {
        f.client.start(); await settle(); assert.equal(f.sockets.length, 0);
        assert.match(f.statuses.at(-1), /身份验证失败/);
        assert.equal(JSON.stringify(f.statuses).includes('private-test-token'), false);
    } finally { f.client.stop(); }
});

test('late login response cannot connect a previous account or role', async () => {
    let resolve;
    const f = fixture(() => new Promise(done => { resolve = done; }));
    try {
        f.client.start(); f.setState({owner: 'bob'});
        resolve(Response.json(f.assignment)); await settle();
        assert.equal(f.sockets.length, 0); assert.equal(f.client.connected, false);
    } finally { f.client.stop(); }
});

test('reject insecure gateway and a foreign socket destination', async () => {
    assert.throws(() => createGameServerSession({gatewayUrl: 'http://example.com'}), /安全连接/);
    const f = fixture(() => Response.json({...f.assignment, url: 'wss://other.example/world'}));
    try { f.client.start(); await settle(); assert.equal(f.sockets.length, 0); }
    finally { f.client.stop(); }
});


test('replaced session does not fight another tab; manual reconnect obtains a fresh ticket', async () => {
    const f = fixture();
    try {
        f.client.start(); await settle(); const first = welcome(f);
        first.message({type: 'reject', reason: 'replaced'});
        assert.equal(f.replacements.length, 1);
        f.advance(); f.client.tick(); f.client.resume(); await settle();
        assert.equal(f.requests.length, 1); assert.match(f.client.state.message, /其他页面/);
        f.client.reconnect(); await settle(); welcome(f);
        assert.equal(f.requests.length, 2); assert.equal(f.client.connected, true);
    } finally { f.client.stop(); }
});

test('silent socket and throwing sends recover without crashing the game loop', async () => {
    const f = fixture();
    try {
        f.client.start(); await settle(); const first = welcome(f);
        f.advance(); f.client.resume();
        assert.equal(first.readyState, 3); assert.match(f.client.state.message, /响应超时/);
        f.client.resume(); await settle(); const second = welcome(f);
        second.send = () => { throw Error('closed'); };
        assert.doesNotThrow(() => f.client.tick());
        assert.equal(f.client.connected, false); assert.match(f.client.state.message, /发送失败/);
    } finally { f.client.stop(); }
});

test('server switch cancels old requests and ignores stale events; invalid destination keeps connection', async () => {
    const f = fixture();
    try {
        f.client.start(); await settle(); const first = welcome(f);
        assert.throws(() => f.client.switchServer('https://example.com'));
        assert.equal(f.client.connected, true);
        f.assignment.url = 'wss://test.gameserver.keepwork.com/world/8798';
        f.client.switchServer('https://test.gameserver.keepwork.com'); await settle();
        assert.equal(first.readyState, 3);
        assert.equal(f.requests[1].url.origin, 'https://test.gameserver.keepwork.com');
        first.message({type: 'reject', reason: 'replaced'});
        assert.equal(f.replacements.length, 0); welcome(f);
        assert.equal(f.client.connected, true);
        assert.equal(f.client.state.gatewayUrl, 'https://test.gameserver.keepwork.com');
        assert.equal(f.requests[1].options.redirect, 'error');
        assert.equal(JSON.stringify(f.client.state).includes('private-test-token'), false);
    } finally { f.client.stop(); }
});

test('switch during pending join aborts and cannot resurrect old gateway', async () => {
    const resolves=[];
    const f = fixture(() => new Promise(resolve => resolves.push(resolve)));
    try {
        f.client.start();
        f.client.switchServer('https://test.gameserver.keepwork.com');
        assert.equal(f.requests[0].options.signal.aborted, true);
        resolves[0](Response.json(f.assignment)); await settle(); assert.equal(f.sockets.length, 0);
        resolves[1](Response.json({...f.assignment, url: 'wss://test.gameserver.keepwork.com/world/8798'}));
        await settle(); welcome(f); assert.equal(f.client.connected, true);
    } finally { f.client.stop(); }
});

test('gateway service error is distinct from rejected credentials and resumes immediately', async () => {
    const f = fixture(() => new Response('', {status: 503}));
    try {
        f.client.start(); await settle(); assert.match(f.client.state.message, /503/);
        assert.doesNotMatch(f.client.state.message, /身份验证失败/);
        f.client.resume(); await settle(); assert.equal(f.requests.length, 2);
        f.client.stop(); f.client.resume(); await settle(); assert.equal(f.requests.length, 2);
    } finally { f.client.stop(); }
});


test('account connection limit is reported without a false token error and retries after backoff', async () => {
    const f = fixture();
    try {
        f.client.start(); await settle(); const socket = f.sockets[0]; socket.open();
        socket.message({type: 'reject', reason: 'account-connection-limit'});
        assert.equal(f.client.connected, false);
        assert.match(f.client.state.message, /最多同时连接10个客户端/);
        assert.doesNotMatch(f.client.state.message, /身份验证失败/);
        f.client.tick(); assert.equal(f.requests.length, 1);
        f.advance(); f.client.tick(); await settle(); welcome(f);
        assert.equal(f.requests.length, 2); assert.equal(f.client.connected, true);
    } finally { f.client.stop(); }
});


test('instance selection waits for welcome, ignores old events and follows server migration', async () => {
    const f = fixture(() => Response.json(f.assignment));
    try {
        f.client.start(); await settle(); const first = welcome(f);
        assert.equal(f.client.state.instanceId, 1);
        f.assignment.instanceId = 2345; f.client.switchInstance(2345);
        assert.equal(f.client.state.instanceId, null); await settle();
        assert.equal(JSON.parse(f.requests.at(-1).options.body).instanceId, 2345);
        first.message({type: 'migrate', instanceId: 88}); assert.equal(f.client.state.instanceId, null);
        const next = welcome(f); assert.equal(f.client.state.instanceId, 2345);
        next.message({type: 'migrate', instanceId: 2346}); assert.equal(f.client.state.instanceId, 2346);
        f.client.stop(); assert.equal(f.client.state.instanceId, null);
    } finally { f.client.stop(); }
});

test('selected unavailable instance does not silently join another or retry forever', async () => {
    const f = fixture(() => Response.json({error: 'instance-unavailable'}, {status: 400}));
    try {
        f.client.start(); await settle(); f.client.switchInstance(9999); await settle();
        assert.match(f.client.state.message, /所选服务器/);
        const count = f.requests.length; f.advance(); f.client.tick(); assert.equal(f.requests.length, count);
        assert.equal(f.client.state.instanceId, null);
    } finally { f.client.stop(); }
});

test('upstream authentication outage retries the selected instance and recovers on welcome', async () => {
    let unavailable = true;
    const f = fixture(() => unavailable ? Response.json({error: 'auth-unavailable'}, {status: 503}) : Response.json(f.assignment));
    try {
        f.client.start(); await settle(); f.client.switchInstance(1); await settle();
        assert.match(f.client.state.message, /Keepwork 身份验证服务/);
        assert.equal(f.sockets.length, 0);
        unavailable = false; f.advance(); f.client.tick(); await settle();
        assert.equal(JSON.parse(f.requests.at(-1).options.body).instanceId, 1);
        welcome(f); assert.equal(f.client.connected, true);
    } finally { f.client.stop(); }
});

test('instance listing uses a paged public read without credentials', async () => {
    const f = fixture(() => Response.json({page: 2, pages: 3, instances: [{id: 21}]}));
    const result = await f.client.listInstances(2);
    assert.equal(result.instances[0].id, 21);
    assert.equal(f.requests[0].url.pathname, '/api/instances');
    assert.equal(f.requests[0].url.searchParams.get('page'), '2');
    assert.equal(f.requests[0].options.headers, undefined);
});

test('instance listing reports network and undeployed gateway failures in Chinese and can retry', async () => {
    let attempt = 0;
    const f = fixture(() => {
        if (++attempt === 1) throw new TypeError('Failed to fetch');
        if (attempt === 2) return new Response('', {status: 403});
        if (attempt === 3) return new Response('', {status: 404});
        return Response.json({page: 1, pages: 1, instances: []});
    });
    await assert.rejects(f.client.listInstances(), /无法连接服务器列表服务/);
    await assert.rejects(f.client.listInstances(), /服务器列表服务暂未开放/);
    await assert.rejects(f.client.listInstances(), /服务器列表服务暂未开放/);
    assert.deepEqual((await f.client.listInstances()).instances, []);
});

test('instance listing distinguishes timeout, cancellation and invalid responses', async () => {
    const timed = fixture(() => { throw new DOMException('timeout', 'TimeoutError'); });
    await assert.rejects(timed.client.listInstances(), /读取服务器列表超时/);
    const controller = new AbortController(); controller.abort();
    const canceled = fixture(() => { throw controller.signal.reason; });
    await assert.rejects(canceled.client.listInstances(1, {signal: controller.signal}), {name: 'AbortError'});
    const html = fixture(() => new Response('<html>Gateway error</html>'));
    await assert.rejects(html.client.listInstances(), /服务器列表响应异常/);
    const empty = fixture(() => Response.json(null));
    await assert.rejects(empty.client.listInstances(), /服务器列表格式错误/);
});


test('role entry waits for server welcome and rejects a takeover instead of entering offline', async () => {
    const f = fixture();
    try {
        f.client.start(); await settle(); welcome(f);
        f.setState({roleId: 'role-2'});
        let entered = false;
        const entering = f.client.waitUntilConnected().then(() => { entered = true; });
        await settle(); assert.equal(entered, false);
        welcome(f); await entering; assert.equal(entered, true);
        f.setState({roleId: 'role-3'});
        const rejected = assert.rejects(f.client.waitUntilConnected(), /踢下线/);
        await settle(); f.sockets.at(-1).message({type: 'reject', reason: 'replaced'});
        await rejected;
    } finally { f.client.stop(); }
});

test('session receives room avatars, advertises appearance, and clears them on travel and disconnect', async()=>{
    const f=fixture();
    try{
        f.setState({appearance:{name:'Alice',bodyId:'blue',token:'never-send'},facing:2});
        f.client.start();await settle();const socket=welcome(f);
        assert.deepEqual(socket.sent[0].appearance,{name:'Alice',bodyId:'blue',level:1});
        socket.message({type:'roster',roomId:'haqi:camp',players:[{id:'peer',name:'Bob',x:25,y:30,appearance:{bodyId:'red'}}]});
        assert.equal(f.client.remoteActors('haqi:camp')[0].profile.bodyId,'red');
        f.setState({roomId:'haqi:ice'});f.client.tick();
        assert.deepEqual(f.client.remoteActors('haqi:camp'),[]);
        socket.message({type:'relay',players:[{id:'peer',x:50,y:60}]});
        assert.deepEqual(f.client.remoteActors('haqi:ice'),[]);
        socket.message({type:'entered',roomId:'haqi:ice'});
        socket.message({type:'joined',roomId:'haqi:ice',id:'new',name:'Ice',x:3,y:4});
        assert.equal(f.client.remoteActors('haqi:ice').length,1);
        socket.close();assert.deepEqual(f.client.remoteActors('haqi:ice'),[]);
    }finally{f.client.stop();}
});

test('project defaults to haqi and consumers may select their own project prefix', async () => {
    const haqi = fixture();
    try {
        haqi.client.start(); await settle();
        assert.equal(JSON.parse(haqi.requests[0].options.body).project, 'haqi');
    } finally { haqi.client.stop(); }
    const awc = fixture(undefined, {project: 'awc'});
    try {
        awc.setState({roomId: 'awc:city'}); awc.client.start(); await settle();
        const body = JSON.parse(awc.requests[0].options.body);
        assert.equal(body.project, 'awc'); assert.equal(body.roomId, 'awc:city');
    } finally { awc.client.stop(); }
});

test('rooms outside the selected project are never joined and invalid projects are rejected', async () => {
    const f = fixture(undefined, {project: 'awc'});
    try {
        f.client.start(); await settle();
        assert.equal(f.requests.length, 0);
        assert.equal(f.statuses.at(-1), '游戏服房间不属于当前项目');
    } finally { f.client.stop(); }
    for (const project of ['', 'AWC', 'a:b', 'x'.repeat(17), 7]) {
        assert.throws(() => createGameServerSession({getState: () => null, getCredentials: () => null, project}));
    }
});
