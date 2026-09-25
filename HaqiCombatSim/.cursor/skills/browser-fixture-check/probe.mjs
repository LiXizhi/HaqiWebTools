// Evaluates an expression in the page over CDP and prints the JSON result.
// Usage: node probe.mjs <url> <expression> [width] [height]
import WebSocket from 'ws';

const [url, expression, w = '1280', h = '820'] = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const target = await (await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.on('message', raw => {
    const m = JSON.parse(raw);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') console.log('[exception]', m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
});
await new Promise(r => ws.on('open', r));
const send = (method, params = {}) => new Promise(resolve => { const i = ++id; pending.set(i, resolve); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: Number(w), height: Number(h), deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
for (let i = 0; i < 240; i++) {
    const r = await send('Runtime.evaluate', { expression: `document.documentElement.dataset.fixtureReady||document.documentElement.dataset.fixtureError||''`, returnByValue: true });
    if (r.result?.result?.value) { console.log('state:', r.result.result.value); break; }
    await sleep(500);
}
const out = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
console.log(JSON.stringify(out.result?.result?.value ?? out.result?.result?.description ?? out.result, null, 1));
await fetch(`http://127.0.0.1:9222/json/close/${target.id}`);
ws.close();
process.exit(0);
