import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'playwright');const browser=await chromium.launch({channel:'chrome',headless:true});
try{const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:8792/HomeBuildingDemo.html');await page.waitForFunction(()=>window.buildingDemo?.ready);
 const result=await page.evaluate(async()=>{
  const {createHomeStore}=await import('/js/home_store.js'),{createHome}=await import('/js/home_core.js');const store=createHomeStore('capacity-test',{name:'haqi-capacity-test'});
  const far=Object.fromEntries(Array.from({length:19999},(_,i)=>['o'+i,{id:'o'+i,itemId:'build-wood-floor',x:3200+i,y:3200}]));
  const h=createHome('test','容量测试',1);h.parts={'chunk:100,100':1,'chunk:0,0':1};await store.install(h,{'chunk:100,100':far,'chunk:0,0':{}});
  await store.mutate(h.id,['chunk:0,0'],(_,d)=>{d['chunk:0,0'].a={id:'a',itemId:'build-wood-floor',x:0,y:0};});
  let rejected=false;try{await store.mutate(h.id,['chunk:0,0','receipt:r','local:practice'],(_,d)=>{d['chunk:0,0'].b={id:'b'};d['chunk:0,0'].c={id:'c'};d['receipt:r'].completed=true;d['local:practice'].r={id:'r'};});}catch(e){rejected=/容量不足/.test(e.message);}
  const count=await store.measureCapacity(h.id),data=await store.read(h.id,'chunk:0,0'),receipt=await store.peek(h.id,'receipt:r'),practice=await store.peek(h.id,'local:practice');
  await store.mutate(h.id,['chunk:0,0'],(_,d)=>{d['chunk:0,0'].a.x=1;});await store.mutate(h.id,['chunk:0,0'],(_,d)=>{delete d['chunk:0,0'].a;});const reduced=await store.measureCapacity(h.id);await store.close();
  return {rejected,counts:count.objectCounts,reduced:reduced.objectCounts,keys:Object.keys(data),receipt,practice};
 });assert.equal(result.rejected,true);assert.equal(result.counts['chunk:100,100'],19999);assert.equal(result.counts['chunk:0,0'],1);assert.equal(result.reduced['chunk:0,0'],0);assert.deepEqual(result.keys,['a']);assert.equal(result.receipt,undefined);assert.equal(result.practice,undefined);assert.match(await page.locator('.home-capacity').innerText(),/20,000/);assert.deepEqual(errors,[]);await page.screenshot({path:'tmp/home-building/capacity.png'});await page.setViewportSize({width:390,height:960});await page.waitForTimeout(100);const bounds=await page.locator('.home-capacity').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=390);await page.screenshot({path:'tmp/home-building/capacity-mobile.png'});console.log('20,000 cap across unloaded chunks; overflow rolls back objects, receipt and practice; edits/removal pass');
}finally{await browser.close();}
