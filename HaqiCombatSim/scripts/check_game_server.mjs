// Live protocol probe, not a Haqi UI acceptance test. --auth-stdin accepts a
// {username, token} JSON object through stdin only; never logs credentials.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {lookup} from 'node:dns/promises';

const args = process.argv.slice(2).filter(arg => arg !== '--auth-stdin');
const gateway = new URL(args[0] || 'https://us1.gameserver.keepwork.com');
const origin = args[1] || 'https://cdn.keepwork.com';
let credentials;
if (process.argv.includes('--auth-stdin')) {
    if (gateway.protocol !== 'https:') throw Error('认证测试必须使用 HTTPS');
    let input = '';
    for await (const chunk of process.stdin) input += chunk;
    credentials = JSON.parse(input);
    if (!credentials.username || !credentials.token) throw Error('缺少测试会话');
}
const runId = randomUUID().replaceAll('-', '').slice(0, 16);
const roomId = `haqi:qa-${runId}`;
const sockets = [];
const report = {at: new Date().toISOString(), gateway: gateway.origin, origin, roomId, checks: []};
const record = (name, details) => report.checks.push({name, ...details});
async function request(path, options = {}) {
    return fetch(new URL(path, gateway), {...options, signal: AbortSignal.timeout(10000)});
}
async function connect(suffix) {
    let playerId = `haqi_qa_${runId}_${suffix}`;
    const identity = {playerId, roomId, x: 100, y: 100,
        ...(credentials ? {username: credentials.username, project: 'haqi', roleId: `qa_${runId}_${suffix}`} : {})};
    const response = await request('/api/join', {
        method: 'POST', headers: {'content-type': 'application/json', Origin: origin,
            ...(credentials ? {Authorization: `Bearer ${credentials.token}`} : {})},
        body: JSON.stringify(identity),
    });
    assert.equal(response.status, 200);
    const assignment = await response.json();
    assert.notEqual(assignment.ok, false);
    if (credentials) {
        assert.ok(assignment.username === credentials.username, 'verified username mismatch');
        assert.ok(assignment.ticket);
        playerId = assignment.playerId;
    }
    record(`join-${suffix}`, {status: response.status, url: assignment.url, instanceId: assignment.instanceId,
        allowOrigin: response.headers.get('access-control-allow-origin')});
    const socket = new WebSocket(assignment.url);
    sockets.push(socket);
    const messages = [];
    socket.addEventListener('message', event => {
        try { messages.push(JSON.parse(event.data)); } catch { messages.push({type: 'invalid-json'}); }
    });
    // Keep a handler after opening so later network errors do not escape cleanup.
    socket.addEventListener('error', () => {});
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('WebSocket open timeout')), 10000);
        socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, {once: true});
        socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('WebSocket open failed')); }, {once: true});
    });
    const send = message => socket.send(JSON.stringify(message));
    async function waitFor(predicate) {
        const deadline = Date.now() + 10000;
        while (Date.now() < deadline) {
            const message = messages.find(predicate);
            if (message) return message;
            const rejected = messages.find(item => item.type === 'reject');
            if (rejected) throw new Error(`server reject: ${rejected.reason}`);
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        throw new Error(`message timeout (${suffix})`);
    }
    send({type: 'hello', ...identity, playerId, ticket: assignment.ticket, instanceId: assignment.instanceId, name: '连接验收临时角色', appearance: {}});
    const welcome = await waitFor(message => message.type === 'welcome');
    assert.equal(welcome.self.id, playerId);
    assert.equal(welcome.roomId, roomId);
    record(`welcome-${suffix}`, {ok: true, authenticated: !!credentials});
    return {socket, send, waitFor, playerId};
}

try {
    record('dns', {addresses: await lookup(gateway.hostname, {all: true})});
    const health = await request('/api/health');
    assert.equal(health.status, 200);
    assert.equal((await health.json()).ok, true);
    record('health', {status: health.status});
    const preflight = await request('/api/join', {method: 'OPTIONS', headers: {
        Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,authorization',
    }});
    record('cors-preflight', {status: preflight.status,
        allowOrigin: preflight.headers.get('access-control-allow-origin'),
        allowMethods: preflight.headers.get('access-control-allow-methods'),
        allowHeaders: preflight.headers.get('access-control-allow-headers')});
    for (const endpoint of new Set([`https://${gateway.hostname}/api/health`, `https://${gateway.host}/api/health`])) {
        try {
            const result = await fetch(endpoint, {signal: AbortSignal.timeout(10000)});
            record('tls', {endpoint, status: result.status});
        } catch (error) { record('tls', {endpoint, error: error.cause?.code || error.name}); }
    }
    for (const [name, token, username] of [
        ['missing-token', '', credentials?.username || 'qa'],
        ['invalid-token', 'invalid-haqi-auth-probe', credentials?.username || 'qa'],
        ...(credentials ? [['username-mismatch', credentials.token, `${credentials.username}__mismatch`]] : []),
    ]) {
        const denied = await request('/api/join', {method: 'POST', headers: {'content-type': 'application/json',
            ...(token ? {Authorization: `Bearer ${token}`} : {})},
            body: JSON.stringify({username, project: 'haqi', roleId: `qa_${runId}`, roomId, x: 100, y: 100})});
        assert.equal(denied.status, 401); record(name, {status: denied.status, rejected: true});
    }
    if (!credentials) throw Error('拒绝测试完成；成功登录验收需要 --auth-stdin 测试会话');
    const first = await connect('a');
    const second = await connect('b');
    await first.waitFor(message => message.type === 'joined' && message.id === second.playerId);
    await second.waitFor(message => message.type === 'roster' && message.players?.some(player => player.id === first.playerId));
    record('two-player-roster', {ok: true});
    first.send({type: 'move', x: 120, y: 110, seq: 1});
    await first.waitFor(message => message.type === 'moved' && message.seq === 1 && message.x === 120 && message.y === 110);
    await second.waitFor(message => message.type === 'relay' && message.players?.some(player =>
        player.id === first.playerId && player.x === 120 && player.y === 110));
    record('move-relay', {ok: true});
    first.send({type: 'leaveRoom'});
    await first.waitFor(message => message.type === 'leftRoom');
    await second.waitFor(message => message.type === 'left' && message.id === first.playerId);
    record('leave-room', {ok: true});
    first.socket.close();
    const reconnected = await connect('a');
    assert.equal(reconnected.playerId, first.playerId);
    record('reconnect', {ok: true});
    report.protocolPassed = true;
} catch (error) {
    report.protocolPassed = false;
    report.error = error.message;
    process.exitCode = 1;
} finally {
    for (const socket of sockets) socket.close();
    report.accountLoginVerified = !!credentials && report.protocolPassed === true;
    report.haqiUiVerified = false;
    console.log(JSON.stringify(report, null, 2));
}
