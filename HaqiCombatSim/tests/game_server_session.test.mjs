import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameServerSession} from '../js/adventure_game_server.js';

const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture(fetchResponse) {
    const sockets = [], requests = [], statuses = [];
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
        onStatus: value => statuses.push(value), now: () => at,
        setTimer: () => 1, clearTimer: () => {}, WebSocketImpl: Socket,
        fetchImpl: async (url, options) => { requests.push({url, options}); return fetchResponse ? fetchResponse() : Response.json(assignment); },
    });
    return {client, sockets, requests, statuses, assignment, setState: value => state = {...state, ...value},
        setCredentials: value => credentials = value, advance: () => at += 31000};
}
function welcome(f) {
    const socket = f.sockets.at(-1); socket.open();
    socket.message({type: 'welcome', self: {id: f.assignment.playerId}, roomId: 'haqi:camp'});
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
