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
for(const name of ['shui','huo','mu','shi','tu','ren','kou','shou','mu_eye','jing','xi','er','xin','tian_field','yun','li','zhi','zhi_peak','sun','chuan']){
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

for(const spec of [
 {name:'yun',key:'__yun',words:['白云','云彩','云海'],scenes:['sValley','sMist','sShade','sGlyph','sWrite','sWords','sFinale']},
 {name:'li',key:'__li',words:['李子','桃李','行李'],scenes:['sSpring','sBloom','sFruit','sGlyph','sWrite','sWords','sFinale']},
 {name:'zhi',key:'__zhi',words:['知道','知识','知音'],scenes:['sRiddle','sObserve','sArrow','sGlyph','sWrite','sWords','sFinale']},
 {name:'zhi_peak',key:'__zhiPeak',words:['耸峙','对峙','山岛竦峙'],scenes:['sSea','sRise','sStand','sGlyph','sWrite','sWords','sFinale']},
 {name:'jing',key:'__jing',words:['小径','径直','曲径通幽'],scenes:['sGate','sPath','sReveal','sGlyph','sWrite','sWords','sFinale'],poses:['intro','action','reveal','form','ghost','stroke1','done','finale']},
]){
 test(`${spec.name} story runs all seven scenes with balanced finite canvas drawing and fires written then completed`,async()=>{
  const html=readFileSync(new URL(`../hanzi/hanzi_${spec.name}.html`,import.meta.url),'utf8');
  const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  let saves=0,rafCb=null,now=0;
  const validCssColor=v=>typeof v==='object'&&v!==null||typeof v==='string'&&!/NaN|undefined/.test(v)&&(/^(#[0-9a-fA-F]{3,8}|rgba?\(\s*\d+(\.\d+)?\s*,\s*\d+(\.\d+)?\s*,\s*\d+(\.\d+)?(\s*,\s*\d+(\.\d+)?)?\s*\)|transparent)$/.test(v));
  const grad=()=>({__grad:true,addColorStop(o,c){assert.ok(Number.isFinite(o)&&o>=0&&o<=1,c);assert.ok(validCssColor(c),`invalid gradient color: ${c}`);}});
  const makeCtx=()=>{
   let _fill='#000',_stroke='#000',_shadow='transparent';
   return {
    get fillStyle(){return _fill;},set fillStyle(v){assert.ok(validCssColor(v),`invalid fillStyle: ${v}`);_fill=v;},
    get strokeStyle(){return _stroke;},set strokeStyle(v){assert.ok(validCssColor(v),`invalid strokeStyle: ${v}`);_stroke=v;},
    get shadowColor(){return _shadow;},set shadowColor(v){assert.ok(validCssColor(v),`invalid shadowColor: ${v}`);_shadow=v;},
    lineWidth:1,lineCap:'butt',lineJoin:'miter',globalAlpha:1,globalCompositeOperation:'source-over',lineDashOffset:0,
    font:'12px serif',textAlign:'start',textBaseline:'alphabetic',shadowBlur:0,
    save(){saves++;},restore(){saves--;assert.ok(saves>=0,'unbalanced restore');},
    setTransform(...a){assert.ok(a.every(Number.isFinite));},translate(x,y){assert.ok(Number.isFinite(x)&&Number.isFinite(y));},
    scale(x,y){assert.ok(Number.isFinite(x)&&Number.isFinite(y));},rotate(a){assert.ok(Number.isFinite(a));},
    beginPath(){},closePath(){},moveTo(x,y){assert.ok(Number.isFinite(x)&&Number.isFinite(y));},
    lineTo(x,y){assert.ok(Number.isFinite(x)&&Number.isFinite(y));},arcTo(...a){assert.ok(a.every(Number.isFinite));},
    quadraticCurveTo(...a){assert.ok(a.every(Number.isFinite));},bezierCurveTo(...a){assert.ok(a.every(Number.isFinite));},
    arc(...a){assert.ok(a.slice(0,5).every(Number.isFinite)&&a[2]>=0);},ellipse(...a){assert.ok(a.slice(0,7).every(Number.isFinite)&&a[2]>=0&&a[3]>=0);},
    rect(...a){assert.ok(a.every(Number.isFinite));},fillRect(...a){assert.ok(a.every(Number.isFinite));},strokeRect(...a){assert.ok(a.every(Number.isFinite));},clearRect(...a){assert.ok(a.every(Number.isFinite));},
    fill(){},stroke(){},clip(){},setLineDash(){},drawImage(){},fillText(t,x,y){assert.ok(Number.isFinite(x)&&Number.isFinite(y));},
    measureText:t=>({width:String(t).length*20}),createPattern:()=>({__pat:true}),
    createLinearGradient:(...a)=>{assert.ok(a.every(Number.isFinite));return grad();},
    createRadialGradient:(...a)=>{assert.ok(a.every(Number.isFinite));return grad();},
   };
  };
  const listeners=new Map();
  const node=id=>({id,textContent:'',hidden:false,disabled:false,offsetWidth:100,dataset:{},style:{setProperty(){}},
   classList:{toggle(){},add(){},remove(){},contains:()=>true},setAttribute(){},children:[],
   addEventListener(t,fn){listeners.set(id+':'+t,fn);},click(){listeners.get(id+':click')?.({currentTarget:this});},
   appendChild(){},replaceChildren(){},querySelectorAll:()=>[],getContext:()=>makeCtx(),getBoundingClientRect:()=>({left:0,top:0,width:1440,height:900})});
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  const nodes=new Map(ids.map(id=>[id,node(id)]));
  const progItems=Array.from({length:7},(_,i)=>node('p'+i));
  const events=[];
  const context={console,Math,URLSearchParams,Path2D:class{constructor(d){this.d=d;}},
   location:{search:'?auto=1'},matchMedia:()=>({matches:false}),performance:{now:()=>now},
   innerWidth:1440,innerHeight:900,devicePixelRatio:2,
   document:{hidden:false,activeElement:null,documentElement:{dataset:{}},body:node('body'),addEventListener(){},
    querySelector:s=>s.startsWith('#')?nodes.get(s.slice(1))||null:node(s),
    querySelectorAll:s=>s==='#progress li'?progItems:[],createElement:()=>node('dyn')},
   addEventListener(t,fn){listeners.set('win:'+t,fn);},requestAnimationFrame(fn){rafCb=fn;},
   setTimeout:()=>1,clearTimeout(){},
   haqiHanziUi:t=>t,haqiHanziCaption(){},haqiHanziPrefetch(){},
   haqiHanziWritten:()=>events.push('written'),haqiHanziComplete:()=>events.push('completed')};
  context.window=context;
  vm.runInNewContext(scripts.at(-1)[1],context);
  const api=context[spec.key];
  assert.ok(api,`missing window.${spec.key}`);
  assert.deepEqual(events,[]);
  const seen=new Set(),wordTitles=[];
  for(let step=0;step<4200&&!api.finished;step++){
   now+=45;const cb=rafCb;cb(now);
   await new Promise(r=>setImmediate(r));
   seen.add(api.scene);
   if(api.scene==='sWords'){
    const t=nodes.get('capTitle').textContent;
    if(spec.words.includes(t)&&wordTitles.at(-1)!==t)wordTitles.push(t);
   }
   assert.equal(saves,0,`unbalanced save/restore in ${api.scene}`);
   if(step===400){context.innerWidth=390;context.innerHeight=844;listeners.get('win:resize')?.();}
   if(step===1600){context.innerWidth=1440;context.innerHeight=900;listeners.get('win:resize')?.();}
  }
  assert.equal(api.finished,true,`did not finish ${spec.name}, stuck at ${api.scene}`);
  assert.deepEqual(events,['written','completed']);
  assert.deepEqual(wordTitles,spec.words);
  for(const sc of spec.scenes)assert.ok(seen.has(sc),`${spec.name} missing scene ${sc}`);
  if(spec.poses){
   for(const p of spec.poses){api.pose(p);assert.equal(saves,0,`unbalanced save/restore in pose ${p}`);}
  }
 });
}
