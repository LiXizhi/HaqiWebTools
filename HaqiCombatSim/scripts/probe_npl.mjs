import { encodeNplActivation, NplFrameDecoder, decodeNplBody } from '../js/npl_protocol.js';
import WebSocket from 'ws';

const diagnostic = process.argv.includes('--certificate-diagnostic');
const hosts = diagnostic ? ['118.89.35.141', '193.112.2.67'] : ['haqiwss1001.keepwork.com'];

for (const host of hosts) {
    await new Promise(resolve => {
        const socket = diagnostic
            ? new WebSocket('wss://keepwork.com:9000/nplwebsocket', {
                lookup: (hostname, options, callback) => options.all ? callback(null, [{ address: host, family: 4 }]) : callback(null, host, 4),
                rejectUnauthorized: true,
            })
            : new WebSocket(`wss://${host}:9000/nplwebsocket`);
        const parser = new NplFrameDecoder();
        socket.binaryType = 'arraybuffer';
        let done = false;
        const finish = result => {
            if (done) return;
            done = true;clearTimeout(timer);
            if (result.error) process.exitCode = 1;
            console.log(JSON.stringify({ host, diagnostic, ...result }));
            socket.close();resolve();
        };
        const timer = setTimeout(() => finish({ error: 'Connection or ping timed out' }), 10000);
        socket.onopen = () => socket.send(encodeNplActivation('(rest)5', 'url="Ping",req={},seq=1,'));
        socket.onmessage = async event => {
            try {
                for (const frame of parser.push(new Uint8Array(event.data))) {
                    finish({ target: frame.target, body: await decodeNplBody(frame) });
                }
            } catch (error) { finish({ error: error.message }); }
        };
        socket.onerror = event => finish({ error: event.error?.message || event.message || 'WebSocket handshake failed' });
        socket.onclose = event => finish({ error: `Connection closed (${event.code})` });
    });
}