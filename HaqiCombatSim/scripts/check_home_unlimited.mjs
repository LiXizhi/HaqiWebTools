import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'playwright');const browser=await chromium.launch({channel:'chrome',headless:true});
try{const page=await browser.newPage({viewport:{width:1280,height:900}});await page.goto('http://127.0.0.1:8792/HomeBuildingDemo.html');await page.waitForFunction(()=>window.buildingDemo?.ready);
 const result=await page.evaluate(async()=>{
  const name='haqi-test-inventory-migration',scope='test',id='h';
  const db=await new Promise((ok,no)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>{r.result.createObjectStore('homes');r.result.createObjectStore('parts');};r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
  await new Promise((ok,no)=>{const tx=db.transaction(['homes','parts'],'readwrite');tx.objectStore('homes').put({id,parts:{inventory:1,'chunk:0,0':1},revision:1,remote:{parts:{inventory:'old.json'}},source:{parts:{inventory:'old.json'}}},[scope,id]);tx.objectStore('parts').put({'chair:':100},[scope,id,'inventory']);tx.objectStore('parts').put({c:{id:'c',itemId:'chair',x:1,y:1}},[scope,id,'chunk:0,0']);tx.objectStore('parts').put({completed:true},[scope,id,'receipt:r']);tx.oncomplete=ok;tx.onerror=()=>no(tx.error);});db.close();
  const {createHomeStore}=await import('/js/home_store.js');const store=createHomeStore(scope,{name});const snapshot=await store.snapshot(id),receipt=await store.read(id,'receipt:r');
  await store.mutate(id,['inventory','chunk:0,0'],(_,data)=>{if(Object.hasOwn(data,'inventory'))throw Error('legacy inventory exposed');});await store.close();
  const upgraded=await new Promise((ok,no)=>{const r=indexedDB.open(name);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});const stored=await new Promise(ok=>{const r=upgraded.transaction('parts').objectStore('parts').get([scope,id,'inventory']);r.onsuccess=()=>ok(r.result);});upgraded.close();
  return {snapshot,receipt,removed:stored===undefined,demo:await buildingDemo.store.snapshot('connected-building-demo')};
 });
 assert.equal(result.removed,true);assert.equal(result.snapshot.home.parts.inventory,undefined);assert.equal(result.snapshot.home.remote.parts.inventory,undefined);assert.equal(result.snapshot.home.source.parts.inventory,undefined);assert.ok(result.snapshot.parts['chunk:0,0'].c);assert.equal(result.receipt.completed,true);assert.equal(result.demo.parts.inventory,undefined);console.log('v1 → v2 inventory deletion preserves buildings and reading receipts; fresh demo has no inventory');
}finally{await browser.close();}
