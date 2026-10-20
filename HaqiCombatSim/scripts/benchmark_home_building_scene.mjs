import {createRequire} from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
try{for(const count of [1000,5000])for(const enabled of [false,true]){
 const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const url='http://127.0.0.1:8792/tests/fixtures/home.html'+(enabled?'':'?noBuildingCache=1');await page.goto(url);await page.waitForFunction(()=>homeQA?.ready);
 await page.evaluate(async count=>{
  const {createHome,chunkKey}=await import('/js/home_core.js');const home=createHome('perf','性能验收',42),parts={inventory:{},residents:{$selection:{version:1}}};
  for(let i=0;i<count;i++){const x=i%100-16,y=Math.floor(i/100)-10,key='chunk:'+chunkKey(x,y);parts[key]??={};parts[key]['b'+i]={id:'b'+i,itemId:'build-'+(i%2?'wood':'stone')+'-'+(i%7===0?'wall':'floor'),x,y,rotation:0};}
  home.parts=Object.fromEntries(Object.keys(parts).map(k=>[k,1]));await homeQA.store.install(home,parts);
 },count);
 await page.reload();await page.waitForFunction(()=>homeQA?.ready);await page.locator('.home-entry').filter({hasText:'性能验收'}).click();await page.locator('.home-canvas').waitFor();await page.waitForTimeout(5000);
 const measure=async()=>page.evaluate(async()=>{const times=[];let previous=performance.now();for(let n=0;n<90;n++){await new Promise(requestAnimationFrame);const now=performance.now();times.push(now-previous);previous=now;}times.sort((a,b)=>a-b);return {p50:times[45],p95:times[85],stats:homeQA.app.renderStats()};});
 const idle=await measure();await page.mouse.move(1000,450);await page.mouse.down();const pan=await measure();await page.mouse.up();
 results.push({count,enabled,idle,pan,errors});assert.deepEqual(errors,[]);for(const s of [idle,pan])assert.ok(s.stats.terrain.bytes+s.stats.buildings.bytes<=64*1024*1024);
 await context.close();
}
fs.writeFileSync('tmp/home-building/scene-benchmark.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();}
