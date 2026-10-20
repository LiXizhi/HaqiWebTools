import {createRequire} from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
fs.mkdirSync('tmp/home-building',{recursive:true});
try{for(const width of [1280,390]){
 const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:width===390?2:1}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8792/tests/fixtures/home.html?buildings=1');await page.waitForFunction(()=>window.homeQA?.ready);
 await page.getByRole('button',{name:'新建家园',exact:true}).click();await page.getByRole('textbox',{name:'新家园的名字'}).fill('积木验收');
 await page.getByRole('dialog').last().getByRole('button',{name:'新建家园',exact:true}).click();
 await page.locator('.home-canvas').waitFor();await page.waitForTimeout(3500);
 await page.screenshot({path:`tmp/home-building/roof-${width}.png`});
 await page.getByRole('button',{name:'建造',exact:true}).click();await page.getByRole('button',{name:'建筑积木',exact:true}).click();
 await page.getByRole('button',{name:'木屋地板',exact:true}).click();
 const before=await page.evaluate(async()=>{const h=(await homeQA.store.list())[0];return (await homeQA.store.read(h.id,'inventory'))['build-wood-floor:'];});
 const canvas=page.locator('.home-canvas');await canvas.click({position:{x:width/2+80,y:350}});await page.waitForTimeout(250);
 const after=await page.evaluate(async()=>{const h=(await homeQA.store.list())[0];return (await homeQA.store.read(h.id,'inventory'))['build-wood-floor:'];});assert.equal(after,before);
 await page.screenshot({path:`tmp/home-building/build-${width}.png`});
 await canvas.press('Escape');await canvas.click({position:{x:width/2+90,y:390}});
 await page.getByRole('button',{name:'物品属性',exact:true}).click();
 await page.getByRole('checkbox',{name:'吸附网格',exact:true}).uncheck();
 await page.getByRole('spinbutton',{name:'阻挡宽度',exact:true}).fill('0.5');
 await page.getByRole('button',{name:'保存属性',exact:true}).click();
 const saved=await page.evaluate(async()=>{const h=(await homeQA.store.list())[0],s=await homeQA.store.snapshot(h.id);return Object.entries(s.parts).filter(([k])=>k.startsWith('chunk:')).flatMap(([,v])=>Object.values(v)).find(o=>o.properties?.width===.5);});assert.equal(saved.properties.snap,false);
 await page.screenshot({path:`tmp/home-building/properties-${width}.png`});
 await page.reload();await page.waitForFunction(()=>window.homeQA?.ready);await page.locator('.home-entry').filter({hasText:'积木验收'}).click();await page.locator('.home-canvas').waitFor();
 const restored=await page.evaluate(async()=>{const h=(await homeQA.store.list())[0],s=await homeQA.store.snapshot(h.id);return Object.entries(s.parts).filter(([k])=>k.startsWith('chunk:')).flatMap(([,v])=>Object.values(v)).find(o=>o.properties?.width===.5);});assert.deepEqual(restored,saved);

 const stats=await page.evaluate(()=>homeQA.app.renderStats());assert.ok(stats.terrain.bytes+stats.buildings.bytes<=64*1024*1024);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({width,stats,errors}));await page.close();
}}finally{await browser.close();}
