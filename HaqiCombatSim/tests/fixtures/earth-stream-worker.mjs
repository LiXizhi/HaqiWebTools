// Exercise the actual browser worker protocol using Node's module worker.
import {parentPort} from 'node:worker_threads';
globalThis.self={postMessage:(data,transfer)=>parentPort.postMessage(data,transfer)};
await import('../../js/adventure_earth_stream_worker.js');
parentPort.on('message',data=>self.onmessage({data}));
