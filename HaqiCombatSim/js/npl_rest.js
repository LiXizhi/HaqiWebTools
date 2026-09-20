import { encodeNplActivation, NplFrameDecoder, decodeNplBody } from './npl_protocol.js';

export const HAQI_WSS = 'wss://haqiwss1001.keepwork.com:9000/nplwebsocket';

export function encodeLuaData(value, depth = 0) {
    if (depth > 16) throw Error('Request nesting too deep');
    if (typeof value === 'string') return '"' + value.replace(/["\\\x00-\x1f\x7f]/g, character => '\\' + character.charCodeAt(0).toString().padStart(3, '0')) + '"';
    if (typeof value === 'boolean') return String(value);
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (value && Object.getPrototypeOf(value) === Object.prototype) {
        return '{' + Object.entries(value).map(([key, item]) => `[${encodeLuaData(key, depth + 1)}]=${encodeLuaData(item, depth + 1)},`).join('') + '}';
    }
    throw Error('Unsupported request value');
}

export async function connectHaqiRest({ WebSocketClass = globalThis.WebSocket, timeoutMs = 15000 } = {}) {
    const socket = new WebSocketClass(HAQI_WSS);
    socket.binaryType = 'arraybuffer';
    const parser = new NplFrameDecoder();
    let pending, sequence = 0, closed = false, receive = Promise.resolve();
    let rejectOpening;
    const stop = (error = new Error('Haqi connection closed')) => {
        if (closed) return;
        closed = true;
        if (pending) { clearTimeout(pending.timer);pending.reject(error);pending = null; }
        rejectOpening?.(error);rejectOpening = null;
        socket.close();
    };
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => stop(new Error('Haqi connection timed out')), timeoutMs);
        rejectOpening = error => { clearTimeout(timer);reject(error); };
        socket.onopen = () => { clearTimeout(timer);rejectOpening = null;resolve(); };
        socket.onerror = () => stop(new Error('Haqi connection failed'));
        socket.onclose = () => { if (!closed) stop(); };
        socket.onmessage = event => {
            receive = receive.then(async () => {
                if (closed) return;
                for (const frame of parser.push(new Uint8Array(event.data))) {
                    if (frame.method !== 'A' || frame.target !== '8') throw Error('Unexpected Haqi response target');
                    const reply = parseRestReply(await decodeNplBody(frame));
                    if (!pending || reply.seq !== pending.seq) continue;
                    const current = pending;pending = null;clearTimeout(current.timer);current.resolve(reply.data);
                }
            }).catch(() => stop(new Error('Invalid Haqi server response')));
        };
    });
    return {
        close: () => stop(),
        request(url, params = {}) {
            if (closed) return Promise.reject(new Error('Haqi connection closed'));
            if (pending) return Promise.reject(new Error('Haqi request already in progress'));
            let frame;
            const seq = ++sequence;
            try { frame = encodeNplActivation('(rest)5', `url=${encodeLuaData(url)},req=${encodeLuaData(params)},seq=${seq},`); }
            catch (error) { return Promise.reject(error); }
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => stop(new Error('Haqi request timed out')), timeoutMs);
                pending = { seq, resolve, reject, timer };
                try { socket.send(frame); } catch { stop(new Error('Haqi send failed')); }
            });
        },
    };
}

export function parseRestReply(body) {
    if (typeof body !== 'string' || body.length > 4 * 1024 * 1024) throw Error('Invalid REST reply');
    let offset = 0;
    const fields = Object.create(null);
    const whitespace = () => { while (/\s/.test(body[offset] || '') && offset < body.length) offset++; };
    const string = () => {
        const quote = body[offset++];let value = '';
        while (offset < body.length) {
            const character = body[offset++];
            if (character === quote) return value;
            if (character !== '\\') { value += character;continue; }
            const escape = body[offset++];
            const escapes = { n: '\n', r: '\r', t: '\t', a: '\x07', b: '\b', f: '\f', v: '\v', '\\': '\\', '"': '"', "'": "'" };
            if (Object.hasOwn(escapes, escape)) value += escapes[escape];
            else if (/[0-9]/.test(escape || '')) {
                let digits = escape;
                while (digits.length < 3 && /[0-9]/.test(body[offset] || '')) digits += body[offset++];
                if (Number(digits) > 127) throw Error('Unsupported REST byte escape');
                value += String.fromCharCode(Number(digits));
            } else throw Error('Unsupported REST string escape');
        }
        throw Error('Unterminated REST string');
    };
    while (offset < body.length) {
        whitespace();if (offset === body.length) break;
        const match = /^(data|seq)\s*=\s*/.exec(body.slice(offset));
        if (!match || Object.hasOwn(fields, match[1])) throw Error('Invalid REST field');
        offset += match[0].length;
        if (match[1] === 'data') {
            if (!['"', "'"].includes(body[offset])) throw Error('Invalid REST data');
            fields.data = string();
        } else {
            const number = /^\d+/.exec(body.slice(offset));
            if (!number) throw Error('Invalid REST sequence');
            fields.seq = Number(number[0]);offset += number[0].length;
            if (!Number.isSafeInteger(fields.seq) || fields.seq < 1) throw Error('Invalid REST sequence');
        }
        whitespace();
        if (offset < body.length && body[offset++] !== ',') throw Error('Invalid REST separator');
    }
    if (!Object.hasOwn(fields, 'data') || !Object.hasOwn(fields, 'seq')) throw Error('Incomplete REST reply');
    const data = JSON.parse(fields.data);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('Invalid REST JSON response');
    return { seq: fields.seq, data };
}