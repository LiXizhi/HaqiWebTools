import {createRequire} from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
fs.mkdirSync('tmp/home-edit-mode',{recursive:true});
try{for(const width of [1280,390]){
 const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const ready=()=>page.waitForFunction(()=>window.homeQA?.ready);
 await page.goto('http://127.0.0.1:8788/tests/fixtures/home.html');await ready();
 page.once('dialog',d=>d.accept('家具验收'));await page.getByRole('button',{name:'新建家园',exact:true}).click();
 await page.getByRole('button',{name:'建造',exact:true}).click();
 await page.getByRole('button',{name:'衣柜',exact:true}).click();
 // Place on the left, outside both desktop and mobile drawers.
 const canvas=page.locator('.home-canvas');
 const card=page.getByRole('button',{name:'衣柜',exact:true});await card.scrollIntoViewIfNeeded();
 const cardBox=await card.boundingBox();await page.mouse.move(cardBox.x+cardBox.width/2,cardBox.y+cardBox.height/2);await page.mouse.down();await page.mouse.move(cardBox.x+cardBox.width/2,cardBox.y-20,{steps:4});await page.mouse.move(width/2-120,450,{steps:6});await page.mouse.up();
 await page.waitForFunction(()=>document.querySelector('.home-status')?.textContent==='已保存到本机');
 const objects=()=>page.evaluate(async()=>{const h=(await homeQA.store.list())[0],s=await homeQA.store.snapshot(h.id);return Object.entries(s.parts).filter(([k])=>k.startsWith('chunk:')).flatMap(([,v])=>Object.values(v));});
 const before=await objects();assert.equal(before.length,1);
 await page.locator('.home-sidebar .close-button').click();
 assert.equal(await page.locator('.is-building').count(),0);
 await canvas.click({position:{x:width/2-80,y:450}});
 assert.equal(await page.locator('.home-edit-actions').isVisible(),false);
 assert.equal(await page.locator('.is-building').count(),0);
 // Reload resets the camera; the saved furniture remains in place.
 const reopen=async()=>{await page.reload();await ready();await page.locator('.home-entry').filter({hasText:'家具验收'}).click();await page.locator('.home-canvas').waitFor();await page.waitForTimeout(600);};
 await reopen();
 await page.mouse.move(width/2-80,450);await page.mouse.down();await page.mouse.move(width/2-50,410,{steps:5});await page.mouse.up();
 assert.equal(await page.locator('.home-edit-actions').isVisible(),false);
 assert.deepEqual(await objects(),before);
 await reopen();await page.getByRole('button',{name:'建造',exact:true}).click();
 await canvas.click({position:{x:width/2-80,y:450}});
 await page.screenshot({path:`tmp/home-edit-mode/before-selection-${width}.png`});
 await page.locator('.home-edit-actions').waitFor({state:'visible'});
 await page.screenshot({path:`tmp/home-edit-mode/build-${width}.png`});
 await page.locator('.home-sidebar .close-button').click();
 assert.equal(await page.locator('.home-edit-actions').isVisible(),false);
 // Exiting with a new unplaced item must also clear placement mode.
 await page.getByRole('button',{name:'建造',exact:true}).click();await page.getByRole('button',{name:'衣柜',exact:true}).click();
 await page.locator('.home-sidebar .close-button').click();await canvas.click({position:{x:width/2-60,y:350}});
 assert.equal(await page.locator('.is-building').count(),0);assert.deepEqual(await objects(),before);
 assert.deepEqual(errors,[]);console.log(`${width}: non-build click/drag blocked, build selection works, exit clears placement`);
 await page.close();
}}finally{await browser.close();}

