import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'playwright');const browser=await chromium.launch({channel:'chrome',headless:true});
try{for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.stack));
 await page.goto('http://127.0.0.1:8792/HomeBuildingDemo.html?view=all');await page.waitForFunction(()=>window.buildingDemo?.ready);
 const snapshot=()=>page.evaluate(async()=>buildingDemo.store.snapshot('connected-building-demo'));
 const objects=s=>Object.entries(s.parts).filter(([k])=>k.startsWith('chunk:')).flatMap(([,v])=>Object.values(v));
 await page.getByRole('button',{name:'建造',exact:true}).click();assert.doesNotMatch(await page.locator('.home-items').innerText(),/×\d/);
 const before=objects(await snapshot()).length;await page.getByRole('button',{name:'完整木屋模板',exact:true}).click();
 assert.equal(objects(await snapshot()).length,before);await page.getByRole('textbox',{name:'召唤句子'}).fill('wrong');await page.getByRole('button',{name:'召唤',exact:true}).click();await page.waitForTimeout(150);assert.equal(objects(await snapshot()).length,before);
 await page.screenshot({path:`tmp/home-building/reading-${width}.png`});
 await page.getByRole('button',{name:'关闭阅读',exact:true}).click();assert.equal(await page.locator('.home-play').getAttribute('data-drawer'),'build');assert.equal(objects(await snapshot()).length,before);
 await page.getByRole('button',{name:'完整木屋模板',exact:true}).click();await page.getByRole('textbox',{name:'召唤句子'}).fill('I want a wooden house.');await page.getByRole('button',{name:'召唤',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.home-play')?.dataset.drawer==='build');assert.ok(objects(await snapshot()).length>before);
 const old=await snapshot();await page.getByRole('button',{name:'木屋地板',exact:true}).click();assert.equal(await page.locator('.home-play').getAttribute('data-drawer'),'build');
 await page.locator('.home-canvas').click({position:{x:width/2+80,y:180}});await page.waitForTimeout(150);assert.equal(objects(await snapshot()).length,objects(old).length+1);assert.deepEqual((await snapshot()).parts.inventory,old.parts.inventory);
 await page.screenshot({path:`tmp/home-building/reading-done-${width}.png`});assert.deepEqual(errors,[]);console.log({width,passed:true});await page.close();
}}finally{await browser.close();}
