import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const {chromium}=createRequire(import.meta.url)(process.argv[2]||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
const out='tmp/home-build-edit';fs.mkdirSync(out,{recursive:true});
try{for(const width of [1280,390]){
 const context=await browser.newContext({viewport:{width,height:900},hasTouch:width===390}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
 await page.goto('http://127.0.0.1:8786/tests/fixtures/home.html');await page.waitForFunction(()=>window.homeQA?.ready);
 await page.evaluate(async()=>{const {createHome}=await import('./js/home_core.js');await homeQA.store.create(createHome('edit-qa','积木验收',7319));await homeQA.store.mutate('edit-qa',['chunk:0,0'],(_,p)=>{p['chunk:0,0']={base:{id:'base',itemId:'build-wood-floor',x:2,y:1}};});});
 await page.reload();await page.waitForFunction(()=>window.homeQA?.ready);await page.getByRole('button',{name:'积木验收',exact:true}).click();
 await page.locator('.home-canvas').waitFor();await page.waitForFunction(()=>!document.querySelector('.island-scene-loading[open]'),{},{timeout:120000});
 await page.getByRole('button',{name:'建造',exact:true}).click();
 const canvas=page.locator('.home-canvas'),r=await canvas.boundingBox(),point=(x,y)=>({x:r.x+r.width/2+x*40,y:r.y+r.height/2+y*40});
 const count=()=>page.evaluate(async()=>{const s=await homeQA.store.snapshot('edit-qa');return Object.entries(s.parts).filter(([k])=>k.startsWith('chunk:')).flatMap(([,p])=>Object.values(p)).length;});
 const waitCount=async n=>{await page.waitForFunction(async n=>{const s=await homeQA.store.snapshot('edit-qa');return Object.entries(s.parts).filter(([k])=>k.startsWith('chunk:')).flatMap(([,p])=>Object.values(p)).length===n;},n);assert.equal(await count(),n);await page.waitForTimeout(60);};
 assert.equal(await page.locator('.home-level-tools').count(),0);
 assert.deepEqual(await page.locator('.home-build-tools button').allTextContents(),['撤销','重做']);
 // Right-click removes; undo/redo use real IndexedDB commits.
 let q=point(2.5,1.5);await page.mouse.click(q.x,q.y,{button:'right'});await waitCount(0);
 await page.keyboard.press('Control+z');await waitCount(1);await page.keyboard.press('Control+y');await waitCount(0);
 await page.locator('[data-history=undo]').click();await waitCount(1);
 // Long press on a placed block removes once; release does not place or select again.
 if(width===390){const touch=await context.newCDPSession(page);await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:q.x,y:q.y}]});await page.waitForTimeout(650);await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await touch.detach();}else{await page.mouse.move(q.x,q.y);await page.mouse.down();await page.waitForTimeout(650);await page.mouse.up();}await waitCount(0);
 await page.locator('[data-history=undo]').click();await waitCount(1);
 // Middle mouse picks the material, then a drag paints a whole stroke.
 await page.mouse.click(q.x,q.y,{button:'middle'});await page.waitForTimeout(80);
 let a=point(1.5,2.5),b=point(3.5,2.5);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:6});await page.mouse.up();await waitCount(4);
 await page.keyboard.press('Control+z');await waitCount(1);await page.keyboard.press('Control+Shift+z');await waitCount(4);
 // Drag erase interpolation, one undo for the entire sweep.
 await page.mouse.move(a.x,a.y);await page.mouse.down({button:'right'});await page.mouse.move(b.x,b.y,{steps:2});await page.mouse.up({button:'right'});await waitCount(1);
 await page.keyboard.press('Control+z');await waitCount(4);
 // Failed undo keeps history and persisted objects intact, and can be retried.
 await page.evaluate(()=>homeQA.fail(true));await page.locator('[data-history=undo]').click();await page.waitForTimeout(120);assert.equal(await count(),4);await page.evaluate(()=>homeQA.fail(false));await page.locator('[data-history=undo]').click();await waitCount(1);
 // Preview text and grid remain in the viewport, including mobile near the right edge.
 await page.mouse.click(q.x,q.y,{button:'middle'});await page.keyboard.press('g');await page.mouse.move(b.x,b.y);await page.locator('.home-build-tip:not([hidden])').waitFor();
 const tip=await page.locator('.home-build-tip').boundingBox();assert.ok(tip.x>=0&&tip.x+tip.width<=width);assert.match(await page.locator('.home-build-tip').textContent(),/可放置/);
 await page.screenshot({path:`${out}/${width}.png`});
 await page.locator('.home-item').filter({hasText:'木屋墙段'}).click();await page.mouse.move(q.x,q.y);await page.waitForTimeout(80);await page.screenshot({path:`${out}/${width}-wall.png`});
 const toolbar=await page.locator('[data-history=undo]').boundingBox();await page.mouse.move(toolbar.x+8,toolbar.y+8);await page.waitForTimeout(100);assert.equal(await page.locator('.home-build-tip').isVisible(),false);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({width,checks:'right erase, hold erase, pick, stroke undo, redo, erase stroke, failed undo retry, preview bounds, grid, no overflow',status:'passed'}));await context.close();
}}finally{await browser.close();}
