import {createRequire} from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});fs.mkdirSync('tmp/home-building',{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});await page.goto('http://127.0.0.1:8792/tests/fixtures/home.html');
 const report=await page.evaluate(async()=>{
  const {createHomeBuildingCache}=await import('/js/home_building_cache.js');
  const catalog=(await fetch('/data/adventure/home/catalog.json').then(r=>r.json())).items;
  const images=new Map();for(const i of catalog.filter(i=>i.building)){const image=new Image();image.src='/'+i.art.local;await image.decode();images.set(i.art.local,image);}
  const imageFor=a=>images.get(a.local),canvas=document.createElement('canvas');canvas.width=1280;canvas.height=900;const c=canvas.getContext('2d',{willReadFrequently:true});let drawCalls=0;const drawImage=c.drawImage.bind(c);c.drawImage=(...args)=>{drawCalls++;drawImage(...args);};
  const pause=()=>new Promise(r=>setTimeout(r,0)),percentile=(v,p)=>[...v].sort((a,b)=>a-b)[Math.floor((v.length-1)*p)];
  const rows=[];
  for(const count of [1000,5000])for(const enabled of [false,true]){
   let objects=Array.from({length:count},(_,i)=>({id:'b'+i,itemId:'build-'+(i%2?'wood':'stone')+'-'+(i%7===0?'wall':'floor'),x:i%100,y:Math.floor(i/100),rotation:0}));
   const cache=createHomeBuildingCache({imageFor,enabled}),rect={x:0,y:0,w:1280,h:900};
   const draw=r=>{c.clearRect(0,0,1280,900);c.save();c.translate(-r.x,-r.y);const groups=cache.prepare(objects,catalog,r,1);for(const g of groups.sort((a,b)=>Number(!a.ground)-Number(!b.ground)||a.depth-b.depth))cache.draw(c,g);c.restore();};
   let stable=0,lastBakes=-1;for(let n=0;n<2000&&stable<12;n++){draw(rect);await pause();const stats=cache.stats();stable=!stats.pending&&stats.bakes===lastBakes?stable+1:0;lastBakes=stats.bakes;}
   const warm=cache.stats();
   for(const scenario of ['idle','pan','edit']){const times=[];drawCalls=0;for(let n=0;n<120;n++){
    if(scenario==='edit'&&n%8===0)objects=objects.map((o,i)=>i===n?{...o,x:o.x+.25}:o);
    const r={...rect,x:scenario==='pan'?n*4:0};const start=performance.now();draw(r);times.push(performance.now()-start);await pause();
   }const stats=cache.stats();rows.push({count,enabled,scenario,drawCallsPerFrame:drawCalls/120,p50:percentile(times,.5),p95:percentile(times,.95),...stats,idleRebakes:scenario==='idle'?stats.bakes-warm.bakes:null});}
   cache.dispose();rows.push({count,enabled,disposedBytes:cache.stats().bytes});
  }
  // Pixel equivalence plus replacement invalidation on the exact same rendering path.
  const objects=Array.from({length:40},(_,i)=>({id:'v'+i,itemId:'build-wood-'+(i%4===0?'wall':'floor'),x:i%8,y:2+Math.floor(i/8),rotation:i%2}));
  const cache=createHomeBuildingCache({imageFor}),rect={x:0,y:0,w:512,h:512};let groups;
  for(let i=0;i<100;i++){groups=cache.prepare(objects,catalog,rect,1);for(const g of groups)cache.draw(c,g);await pause();}
  c.clearRect(0,0,1280,900);for(const g of groups)cache.draw(c,g);const baked=c.getImageData(0,0,512,512).data;
  c.clearRect(0,0,1280,900);for(const g of groups)cache.draw(c,g,{forceLive:true});const live=c.getImageData(0,0,512,512).data;let delta=0;for(let i=0;i<live.length;i++)delta+=Math.abs(baked[i]-live[i]);
  const before=cache.stats();cache.prepare(objects.slice(1),catalog,rect,1);const after=cache.stats();cache.dispose();
  return {rows,meanPixelDifference:delta/live.length,invalidation:{before,after}};
 });
 fs.writeFileSync('tmp/home-building/benchmark.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 assert.ok(report.meanPixelDifference<1);for(const row of report.rows){if('bytes'in row)assert.ok(row.bytes<=32*1024*1024);if(row.idleRebakes!==null&&row.idleRebakes!==undefined)assert.equal(row.idleRebakes,0);if('disposedBytes'in row)assert.equal(row.disposedBytes,0);}
}finally{await browser.close();}
