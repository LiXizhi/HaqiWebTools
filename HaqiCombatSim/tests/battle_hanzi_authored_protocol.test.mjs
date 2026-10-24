import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function fixture(name,standalone=false){
 const html=readFileSync(new URL(`../hanzi/hanzi_${name}.html`,import.meta.url),'utf8');
 const script=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)][0][1];
 const messages=[],handlers={};
 const parent={postMessage:(message,origin)=>messages.push({message,origin})};
 const context={document:{readyState:'loading',body:null,referrer:'https://game.example/Haqi.html',querySelectorAll:()=>[]},
  URL,Map,Set,setTimeout:()=>1,clearTimeout(){},parent,addEventListener:(type,fn)=>handlers[type]=fn};
 context.window=context;if(standalone)context.parent=context;
 vm.runInNewContext(script,context);
 const send=(data,source=parent,origin='https://game.example')=>handlers.message({source,origin,data});
 const init={channel:'haqi-hanzi',version:1,type:'init',sessionId:'session',entryId:name,locale:'en'};
 return {context,messages,send,init};
}
for(const name of ['shui','huo','mu','shi','tu','ren']){
 test(`${name} uses the host protocol, rejects foreign init and replays real completion on late init`,()=>{
  const f=fixture(name);
  assert.equal(f.messages.length,1);assert.equal(f.messages[0].message.type,'ready');
  f.context.haqiHanziWritten();f.context.haqiHanziComplete();assert.equal(f.messages.length,1);
  f.send(f.init,{});f.send(f.init,undefined,'https://foreign.example');assert.equal(f.messages.length,1);
  f.send(f.init);
  assert.deepEqual(f.messages.slice(1).map(e=>e.message.type),['written','completed']);
  for(const e of f.messages.slice(1)){
   assert.equal(e.message.channel,'haqi-hanzi');assert.equal(e.message.version,1);
   assert.equal(e.message.entryId,name);assert.equal(e.message.sessionId,'session');assert.equal(e.origin,'https://game.example');
  }
 });
 test(`${name} standalone lifecycle never waits for a parent`,()=>{
  const f=fixture(name,true);f.context.haqiHanziWritten();f.context.haqiHanziComplete();assert.equal(f.messages.length,0);
 });
}

test('wood story initializes against its real HTML controls and reaches writing/finale',()=>{
 const html=readFileSync(new URL('../hanzi/hanzi_mu.html',import.meta.url),'utf8');
 const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
 const drawing=new Proxy({}, {get:()=>()=>({addColorStop(){}})});
 const node=()=>({textContent:'',dataset:{},style:{},classList:{toggle(){},add(){},remove(){}},children:[],
  addEventListener(){},appendChild(){},querySelectorAll:()=>[],getContext:()=>drawing,getBoundingClientRect:()=>({left:0,top:0,width:1200,height:800})});
 const nodes=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],node()]));
 const events=[];
 const context={console,Math,performance:{now:()=>0},innerWidth:1200,innerHeight:800,devicePixelRatio:1,
  document:{getElementById:id=>nodes.get(id)||null,querySelectorAll:()=>[],createElement:node},
  addEventListener(){},requestAnimationFrame(){},setTimeout:()=>1,clearTimeout(){},
  haqiHanziUi:text=>text,haqiHanziCaption(){},haqiHanziWritten:()=>events.push('written'),haqiHanziComplete:()=>events.push('completed')};
 context.window=context;vm.runInNewContext(scripts.at(-1)[1],context);
 assert.deepEqual(events,[],'opening must not complete practice');
 context.__mu.goScene(6);
 for(let i=0;i<4;i++)context.__mu.completeCurrentStroke();
 assert.deepEqual(events,['written']);
 context.__mu.goScene(8);assert.deepEqual(events,['written','completed']);
});
