import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'playwright');const browser=await chromium.launch({channel:'chrome',headless:true});
try{const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8792/HomeBuildingDemo.html');await page.waitForFunction(()=>window.buildingDemo?.ready);
 const props=()=>page.evaluate(async()=>{const s=await buildingDemo.store.snapshot('connected-building-demo');return Object.entries(s.parts).filter(([k])=>k.startsWith('chunk:')).flatMap(([,v])=>Object.values(v)).filter(o=>o.itemId==='brick-chimney');});
 await page.getByRole('button',{name:'建造',exact:true}).click();await page.getByRole('button',{name:'显示屋顶',exact:true}).click();
 const before=await props();await page.getByRole('button',{name:'砖砌烟囱',exact:true}).click();await page.locator('.home-canvas').click({position:{x:480,y:370}});await page.waitForTimeout(300);
 let added=(await props()).find(o=>!before.some(b=>b.id===o.id));assert.equal(added.properties.surface,'roof');assert.ok(added.parentId);
 await page.getByRole('button',{name:'隐藏屋顶',exact:true}).click();await page.getByRole('button',{name:'砖砌烟囱',exact:true}).click();await page.locator('.home-canvas').click({position:{x:480,y:488}});await page.waitForTimeout(300);
 assert.equal((await props()).length,before.length+2);assert.ok((await props()).some(o=>o.id!==added.id&&!before.some(b=>b.id===o.id)&&o.properties?.surface!=='roof'));
 await page.locator('.home-canvas').press('Escape');await page.locator('.home-canvas').click({position:{x:500,y:476}});await page.getByRole('button',{name:'物品属性',exact:true}).click();assert.equal(await page.getByLabel('摆放位置',{exact:true}).inputValue(),'ground');
 await page.getByLabel('摆放位置',{exact:true}).selectOption('roof');await page.getByRole('button',{name:'保存属性',exact:true}).click();await page.waitForTimeout(300);
 assert.equal((await props()).filter(o=>o.properties?.surface==='roof').length,before.length+2);
 await page.reload();await page.waitForFunction(()=>window.buildingDemo?.ready);assert.equal((await props()).filter(o=>o.properties?.surface==='roof').length,before.length+2);assert.deepEqual(errors,[]);console.log('roof/indoor placement, property override and reload passed');
}finally{await browser.close();}
