import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { encodeNplActivation, NplFrameDecoder, decodeNplBody } from '../js/npl_protocol.js';
import { parseRestReply, encodeLuaData, connectHaqiRest } from '../js/npl_rest.js';
test('REST encoding keeps strings as data and rejects unsupported values', () => {
    assert.equal(encodeLuaData('"\\\n'), '"\\034\\092\\010"');
    assert.throws(() => encodeLuaData({ value: undefined }));
    assert.throws(() => encodeLuaData(Infinity));
});

test('REST client correlates responses and rejects concurrent requests', async () => {
    let socket;
    class FakeSocket {
        constructor() { socket = this;queueMicrotask(() => this.onopen()); }
        send(frame) { this.sent = frame; }
        close() { this.closed = true;this.onerror(); }
        reply(seq) { this.onmessage({ data: encodeNplActivation('8', `data="{\\"ver\\":26}",seq=${seq},`).buffer }); }
    }
    const client = await connectHaqiRest({ WebSocketClass: FakeSocket });
    const result = client.request('Ping');
    await assert.rejects(client.request('Ping'), /in progress/);
    socket.reply(999);socket.reply(1);
    assert.deepEqual(await result, { ver: 26 });
    const interrupted = client.request('Ping');client.close();
    await assert.rejects(interrupted, /closed/);
    await assert.rejects(client.request('Ping'), /closed/);
    assert.equal(socket.closed, true);
});

test('REST timeout closes connection and rejects pending request', async () => {
    class FakeSocket {
        constructor() { queueMicrotask(() => this.onopen()); }
        send() {}
        close() {}
    }
    const client = await connectHaqiRest({ WebSocketClass: FakeSocket, timeoutMs: 10 });
    await assert.rejects(client.request('Ping'), /timed out/);
    await assert.rejects(client.request('Ping'), /closed/);
});

test('NPL activation matches C++ wire format', () => {
    const result = encodeNplActivation('(gl)script/apps/GameServer/rest.lua', 'url="ping",');
    assert.equal(new TextDecoder().decode(result), 'A (gl)script/apps/GameServer/rest.lua\n\n11:url="ping",');
});

test('NPL handles byte fragments, UTF-8, and concatenated frames', async () => {
    const body = 'name="\u54c8\u5947",';
    const bytes = encodeNplActivation('1', body);
    const parser = new NplFrameDecoder();const frames = [];
    for (const byte of bytes) frames.push(...parser.push(Uint8Array.of(byte)));
    assert.equal(frames.length, 1);
    assert.equal(await decodeNplBody(frames[0]), body);
    const combined = new Uint8Array(bytes.length * 2);combined.set(bytes);combined.set(bytes, bytes.length);
    assert.equal(parser.push(combined).length, 2);parser.finish();
});

test('NPL reads zlib payloads and debug version headers', async () => {
    const body = 'seq=1,reply={ok=true,},';
    const compressed = deflateSync(body);
    const bytes = Buffer.concat([Buffer.from(`A 1 NPL/1.0\r\n\r\n${compressed.length}>`), compressed]);
    const [frame] = new NplFrameDecoder().push(bytes);
    assert.equal(await decodeNplBody(frame), body);
});

test('REST reply parser rejects executable and ambiguous input', () => {
    for (const body of ['data=os.execute("bad"),seq=1,', 'data="{}",seq=1,seq=2,', 'data="{}",seq=0,', 'data="{}",seq=1,unknown=true,', 'data="{}",', 'data="[]",seq=1,']) {
        assert.throws(() => parseRestReply(body));
    }
    assert.deepEqual(parseRestReply('seq=2,data="{\\034ok\\034:true}",'), { seq: 2, data: { ok: true } });
});

test('NPL rejects malformed, oversized and incomplete input', async () => {
    assert.throws(() => encodeNplActivation('1\nInjected:value', ''), /target/);
    for (const text of ['A 1\n\nx:', 'A 1\n\n999999999:', 'GET /\n\n0:']) {
        assert.throws(() => new NplFrameDecoder().push(Buffer.from(text)));
    }
    const parser = new NplFrameDecoder();parser.push(Buffer.from('A 1\n\n10:abc'));
    assert.throws(() => parser.finish(), /Truncated/);
    await assert.rejects(decodeNplBody({ compressed: true, body: deflateSync(Buffer.alloc(4 * 1024 * 1024 + 1)) }), /too large/);
});

test('NPL decodes the live REST Ping response envelope', async () => {
    const body = 'data="{\\"ver\\":26,\\"srvtime\\":\\"23:34:15\\"}",seq=1,';
    const [frame] = new NplFrameDecoder().push(encodeNplActivation('8', body));
    assert.equal(frame.target, '8');
    assert.equal(await decodeNplBody(frame), body);
    assert.deepEqual(parseRestReply(body), { seq: 1, data: { ver: 26, srvtime: '23:34:15' } });
});