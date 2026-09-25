// Headless screenshot helper: drives an already-running Chrome over CDP.
// Usage: node shot.mjs <url> <out.png> [width] [height] [waitFlag]
import WebSocket from 'ws';
import fs from 'node:fs';

const [url, out, w = '1280', h = '820', waitFlag = 'fixtureReady'] = process.argv.slice(2);
const width = Number(w), height = Number(h);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const target = await (await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.on('message', raw => {
    const m = JSON.parse(raw);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.consoleAPICalled') console.log('[console]', m.params.args.map(a => a.value ?? a.description).join(' '));
    if (m.method === 'Runtime.exceptionThrown') console.log('[exception]', m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
});
await new Promise(r => ws.on('open', r));
const send = (method, params = {}) => new Promise(resolve => { const i = ++id; pending.set(i, resolve); ws.send(JSON.stringify({ id: i, method, params })); });

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });

let state = '';
for (let i = 0; i < 240; i++) {
    const r = await send('Runtime.evaluate', { expression: `document.documentElement.dataset.${waitFlag}||''`, returnByValue: true });
    state = r.result?.result?.value || '';
    if (state) break;
    await sleep(500);
}
const err = await send('Runtime.evaluate', { expression: `document.documentElement.dataset.fixtureError||''`, returnByValue: true });
console.log('wait:', waitFlag, '=', state || '(timeout)', err.result?.result?.value ? `error=${err.result.result.value}` : '');
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
await fetch(`http://127.0.0.1:9222/json/close/${target.id}`);
ws.close();
process.exit(0);
