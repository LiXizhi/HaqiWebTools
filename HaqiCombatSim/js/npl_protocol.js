const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const MAX_BODY = 4 * 1024 * 1024;
const MAX_HEADER = 8192;

export function encodeNplActivation(target, body) {
    if (typeof target !== 'string' || !/^(?:\([A-Za-z0-9_]+\))?[A-Za-z0-9_./-]+$/.test(target)) throw Error('Invalid NPL target');
    if (typeof body !== 'string') throw Error('NPL body must be text');
    const payload = encoder.encode(body);
    if (payload.length > MAX_BODY) throw Error('NPL body too large');
    const header = encoder.encode(`A ${target}\n\n${payload.length}:`);
    if (header.length > MAX_HEADER) throw Error('NPL header too large');
    const result = new Uint8Array(header.length + payload.length);
    result.set(header);result.set(payload, header.length);
    return result;
}

export class NplFrameDecoder {
    constructor() { this.buffer = new Uint8Array(); }
    push(chunk) {
        if (!(chunk instanceof Uint8Array)) throw Error('Expected binary NPL data');
        if (this.buffer.length + chunk.length > MAX_BODY * 2 + MAX_HEADER) throw Error('NPL receive buffer too large');
        const joined = new Uint8Array(this.buffer.length + chunk.length);
        joined.set(this.buffer);joined.set(chunk, this.buffer.length);this.buffer = joined;
        const frames = [];
        while (this.buffer.length) {
            let headerEnd = -1;
            for (let offset = 0; offset < Math.min(this.buffer.length - 1, MAX_HEADER); offset++) {
                if (this.buffer[offset] === 10 && this.buffer[offset + 1] === 10) { headerEnd = offset + 2;break; }
                if (this.buffer[offset] === 13 && this.buffer[offset + 1] === 10 && this.buffer[offset + 2] === 13 && this.buffer[offset + 3] === 10) { headerEnd = offset + 4;break; }
            }
            if (headerEnd < 0) {
                if (this.buffer.length > MAX_HEADER) throw Error('NPL header too large');
                break;
            }
            const header = decoder.decode(this.buffer.subarray(0, headerEnd));
            const firstLine = header.split(/\r?\n/)[0];
            const match = /^(A|npl) ([^\s]+)(?: NPL\/1\.0)?$/.exec(firstLine);
            if (!match) throw Error('Unsupported NPL frame');
            let offset = headerEnd;
            while (offset < this.buffer.length && this.buffer[offset] >= 48 && this.buffer[offset] <= 57) offset++;
            if (offset - headerEnd > 8) throw Error('NPL body too large');
            if (offset === this.buffer.length) break;
            if (offset === headerEnd || ![58, 62].includes(this.buffer[offset])) throw Error('Invalid NPL body length');
            const length = Number(decoder.decode(this.buffer.subarray(headerEnd, offset)));
            if (length > MAX_BODY) throw Error('NPL body too large');
            const end = offset + 1 + length;
            if (this.buffer.length < end) break;
            frames.push({ method: match[1], target: match[2], compressed: this.buffer[offset] === 62, body: this.buffer.slice(offset + 1, end) });
            this.buffer = this.buffer.slice(end);
        }
        return frames;
    }
    finish() { if (this.buffer.length) throw Error('Truncated NPL frame'); }
}

export async function decodeNplBody(frame) {
    if (!frame.compressed) return decoder.decode(frame.body);
    const reader = new Blob([frame.body]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
    const chunks = [];let length = 0;
    try {
        while (true) {
            const result = await reader.read();
            if (result.done) break;
            length += result.value.length;
            if (length > MAX_BODY) throw Error('NPL decompressed body too large');
            chunks.push(result.value);
        }
    } finally { await reader.cancel(); }
    const body = new Uint8Array(length);let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset);offset += chunk.length; }
    return decoder.decode(body);
}