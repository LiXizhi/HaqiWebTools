import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
try{for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8792/HomeBuildingDemo.html');await page.waitForFunction(()=>window.buildingDemo?.ready);await page.waitForTimeout(2500);
 await page.screenshot({path:`tmp/home-building/demo-roofs-${width}.png`});
 if(width===1440){
  const doors=()=>page.evaluate(async()=>{const s=await buildingDemo.store.snapshot('connected-building-demo');return Object.entries(s.parts).filter(([k])=>k.startsWith('chunk:')).flatMap(([,v])=>Object.values(v)).filter(o=>o.itemId.endsWith('-door'));});
  assert.ok((await doors()).every(o=>!o.doorOpen));
  await page.locator('.home-canvas').click({position:{x:500,y:535}});await page.waitForTimeout(200);
  assert.equal((await doors()).find(o=>o.itemId.includes('wood')).doorOpen,true);
  await page.locator('.home-canvas').click({position:{x:940,y:535}});await page.waitForTimeout(200);
  assert.equal((await doors()).find(o=>o.itemId.includes('stone')).doorOpen,true);
 }
 await page.getByRole('button',{name:'建造',exact:true}).click();assert.equal(await page.locator('.home-cat-pill.is-active').innerText(),'建筑积木');
 assert.equal(await page.locator('.home-items .home-item:not(.home-template)').count(),13);
 await page.screenshot({path:`tmp/home-building/demo-build-${width}.png`});
 if(width===1440){
  await page.locator('.home-canvas').click({position:{x:380,y:295}});
  await page.getByRole('button',{name:'物品属性',exact:true}).click();
  await page.getByRole('checkbox',{name:'阻挡通行',exact:true}).uncheck();
  await page.getByRole('spinbutton',{name:'阻挡宽度',exact:true}).fill('0.5');
  await page.screenshot({path:'tmp/home-building/demo-properties.png'});
  await page.getByRole('button',{name:'保存属性',exact:true}).click();
  await page.waitForFunction(async()=>{const s=await buildingDemo.store.snapshot('connected-building-demo');return Object.entries(s.parts).filter(([k])=>k.startsWith('chunk:')).flatMap(([,v])=>Object.values(v)).some(o=>o.properties?.width===.5);});
  await page.reload();await page.waitForFunction(()=>window.buildingDemo?.ready);
  assert.equal(await page.evaluate(async()=>{const s=await buildingDemo.store.snapshot('connected-building-demo');return Object.entries(s.parts).filter(([k])=>k.startsWith('chunk:')).flatMap(([,v])=>Object.values(v)).filter(o=>o.properties?.width===.5).length;}),1);
 }
 assert.deepEqual(errors,[]);console.log({width,errors});await page.close();
}}finally{await browser.close();}
