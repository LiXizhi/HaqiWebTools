import test from 'node:test';
import assert from 'node:assert/strict';
import {dialogueMappingPrompt,parseDialogueMapping,mappingColor} from '../js/dialogue_mapping_core.js';
import {createDialogueMapper,createMappingStore} from '../js/dialogue_mapping.js';
const lines=[{text:'Hello, world!',locale:'en'},{text:'你好，世界！',locale:'zh-CN'}];
const output=JSON.stringify({text:'Hello,(#B24)world!(#267)',translation:'你好，(#B24)世界！(#267)'});
test('JSON color format preserves spacing and punctuation and rejects changed text/unsafe colors',()=>{
 const parsed=parseDialogueMapping(output,lines);
 assert.equal(parsed[0].map(p=>p.text).join(''),'Hello, world!');
 assert.equal(mappingColor(parsed[0][0]),mappingColor(parsed[1][0]));
 assert.throws(()=>parseDialogueMapping(output.replace('Hello','Hi'),lines));
 assert.throws(()=>parseDialogueMapping(output.replaceAll('#B24','url(evil)'),lines));
});
test('prompt defines role priority, fixed palette, two examples and translated text/translation fields',()=>{
 const messages=dialogueMappingPrompt(lines);
 assert.deepEqual(JSON.parse(messages[1].content),{text:lines[0].text,translation:lines[1].text});
 for(const color of ['#246','#A23','#275','#638','#A50','#067','#666'])assert.ok(messages[0].content.includes(color));
 assert.ok(messages[0].content.includes('句法角色优先于词性'));
 const input={text:'Tom gives Mary a red apple.',translation:'汤姆给玛丽一个红苹果。'};
 const result={text:'Tom(#246) gives(#A23) Mary(#275) a(#666) red(#067) apple(#396).',translation:'汤姆(#246)给(#A23)玛丽(#275)一个(#666)红(#067)苹果(#396)。'};
 const parsed=parseDialogueMapping(JSON.stringify(result),[{text:input.text},{text:input.translation}]);
 assert.equal(parsed[0].map(p=>p.text).join(''),input.text);
 assert.equal(parsed[1].map(p=>p.text).join(''),input.translation);
 assert.throws(()=>parseDialogueMapping(JSON.stringify({text:result.text}),lines));
});
test('same requests share work; caller cancellation does not cancel others; saved result avoids generation',async()=>{
 const records=new Map();let calls=0,finish;
 const store={get:async key=>records.get(key),put:async(key,value)=>records.set(key,value)};
 const mapper=createDialogueMapper({store,generate:()=>{calls++;return new Promise(resolve=>finish=resolve);}});
 assert.equal(await mapper.peek(lines),null);assert.equal(calls,0);
 const first=new AbortController(),second=new AbortController();
 const a=mapper(lines,first.signal),b=mapper(lines,second.signal);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);
 first.abort();await assert.rejects(a,{name:'AbortError'});finish(output);await b;
 await mapper(lines,new AbortController().signal);assert.equal(calls,1);
 const reopened=createDialogueMapper({store,generate:()=>{throw Error('should use persistent result');}});await reopened(lines);
 assert.deepEqual(await reopened.peek(lines),parseDialogueMapping(output,lines));
});
test('failed generation is retryable and invalid output is never cached',async()=>{
 const records=new Map();let calls=0;
 const mapper=createDialogueMapper({store:{get:async k=>records.get(k),put:async(k,v)=>records.set(k,v)},generate:async()=>++calls===1?'bad':output});
 await assert.rejects(mapper(lines));assert.equal(records.size,0);await mapper(lines);assert.equal(calls,2);
});
test('memory fallback keeps only the latest 500 mappings',async()=>{
 const store=createMappingStore();for(let i=0;i<500;i++)await store.put(String(i),'value');
 const hit=await store.get('0');await store.put('0',hit);await store.put('500','new');
 assert.equal(await store.get('1'),null);assert.equal(await store.get('0'),'value');assert.equal(await store.get('500'),'new');
});
