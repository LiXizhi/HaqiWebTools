import test from 'node:test';
import assert from 'node:assert/strict';
import {BattleAIClient} from '../js/battle_ai/client.js';

test('stalled advisory worker times out, rejects its queue and can restart',async t=>{
 const workers=[];
 class WorkerStub{constructor(){workers.push(this);}postMessage(value){this.last=value;}terminate(){this.stopped=true;}}
 const previous=globalThis.Worker;globalThis.Worker=WorkerStub;
 t.after(()=>{if(previous===undefined)delete globalThis.Worker;else globalThis.Worker=previous;});
 const client=new BattleAIClient({timeoutMs:10});t.after(()=>client.dispose());
 const a=client.analyze({}),b=client.analyze({});
 await Promise.all([assert.rejects(a,/超时/),assert.rejects(b,/超时/)]);
 assert.equal(workers[0].stopped,true);assert.equal(client.pending.size,0);
 const retry=client.analyze({});
 workers[1].onmessage({data:{id:workers[1].last.id,result:{stateId:'ok'}}});
 assert.deepEqual(await retry,{stateId:'ok'});
 assert.equal(client.pending.size,0);
});
