import test from 'node:test';
import assert from 'node:assert/strict';
import {dialogueMappingPrompt,parseDialogueMapping,mappingColor} from '../js/dialogue_mapping_core.js';
import {createDialogueMapper,createMappingStore} from '../js/dialogue_mapping.js';
const lines=[{text:'Hello, world!',locale:'en'},{text:'你好，世界！',locale:'zh-CN'}];
const output=JSON.stringify({pairs:[{text:'Hello',translation:'你好'},{text:'world',translation:'世界'}]});
test('keyword pairs preserve original text, punctuation and spacing',()=>{
 const parsed=parseDialogueMapping(output,lines);
 assert.equal(parsed[0].map(p=>p.text).join(''),'Hello, world!');
 assert.equal(mappingColor(parsed[0][0]),mappingColor(parsed[1][0]));
 assert.equal(parsed[0][1].color,null);
 assert.throws(()=>parseDialogueMapping(output.replace('Hello','Hi'),lines));
});
test('prompt requests sparse keywords and parser enforces five pairs, complete words and no overlaps',()=>{
 const messages=dialogueMappingPrompt(lines);
 assert.deepEqual(JSON.parse(messages[1].content),{text:lines[0].text,translation:lines[1].text});
 assert.ok(messages[0].content.includes('最多 5 组'));
 const parse=pairs=>parseDialogueMapping(JSON.stringify({pairs}),lines);
 assert.throws(()=>parse(Array(6).fill({text:'Hello',translation:'你好'})));
 assert.throws(()=>parse([{text:'world',translation:'世界'},{text:'world',translation:'世界'}]));
 assert.throws(()=>parse([{text:'ell',translation:'你好'}]));
 assert.throws(()=>parse([{text:'world'}]));
 assert.deepEqual(parse([]),lines.map(line=>[{text:line.text,color:null}]));
});
test('prompt examples map single words without names and preserve the screenshot sentence',()=>{
 const prompt=dialogueMappingPrompt(lines)[0].content;
 const examples=[...prompt.matchAll(/示例输入：([^\n]+)\n示例输出：([^\n]+)/g)];
 assert.equal(examples.length,2);
 for(const [,input,output] of examples){
  const source=JSON.parse(input),pairs=JSON.parse(output).pairs;
  const result=parseDialogueMapping(output,[{text:source.text},{text:source.translation}]);
  assert.ok(pairs.length<=5);
  assert.ok(pairs.every(pair=>/^[A-Za-z]+$/.test(pair.text)));
  assert.ok(pairs.every(pair=>!['Miss','Jessica','Tom'].includes(pair.text)));
  assert.equal(result[0].map(part=>part.text).join(''),source.text);
  assert.equal(result[1].map(part=>part.text).join(''),source.translation);
 }
 assert.deepEqual(JSON.parse(examples[0][2]).pairs.map(pair=>pair.text),['follow','Finish','quest']);
});

test('selected single words and repeated words can select an occurrence',()=>{
 const source=[{text:'I sell fine equipment. Collect a full set to unlock powerful stats!'},{text:'我卖的都是精良的装备，攒齐一套可以触发强大的属性哦！'}];
 const pairs=[{text:'sell',translation:'卖'},{text:'equipment',translation:'装备'},{text:'set',translation:'套'},{text:'unlock',translation:'触发'},{text:'powerful',translation:'强大'}];
 const result=parseDialogueMapping(JSON.stringify({pairs}),source);
 result.forEach((row,i)=>{assert.equal(row.map(p=>p.text).join(''),source[i].text);assert.equal(row.filter(p=>p.color).length,5);});
 const repeat=parseDialogueMapping(JSON.stringify({pairs:[{text:'go',translation:'走',textOccurrence:1,translationOccurrence:1}]}),[{text:'go go'},{text:'走走'}]);
 assert.equal(repeat[0][0].text,'go ');assert.equal(repeat[1][0].color,null);
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
