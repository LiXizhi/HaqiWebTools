import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const args=process.argv.slice(2),opt=(k,f)=>args.includes(k)?args[args.indexOf(k)+1]:f;
const {chromium}=createRequire(import.meta.url)(opt('--playwright','playwright'));
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900},hasTouch:width===390}),page=await context.newPage();
  await page.goto(`${opt('--url','http://127.0.0.1:8786')}/tests/fixtures/home.html`,{waitUntil:'domcontentloaded',timeout:120000});
  await page.waitForFunction(()=>window.homeQA?.ready);
  page.once('dialog',d=>d.accept('拖动居民验收'));
  await page.getByRole('button',{name:'新建家园',exact:true}).click();
  await page.locator('.home-canvas').waitFor();
  await page.getByRole('button',{name:'居民',exact:true}).click();
  const card=page.locator('.home-pet-card').first();
  assert.equal(await page.getByRole('button',{name:'召到身边'}).count(),0);
  assert.equal(await card.locator('.home-pet-act-tag').count(),0);
  assert.deepEqual(await card.locator('button').evaluate(b=>{const s=getComputedStyle(b);return [s.borderTopWidth,s.boxShadow,s.backgroundColor];}),['0px','none','rgba(0, 0, 0, 0)']);
  const residents=()=>page.evaluate(async()=>homeQA.store.read((await homeQA.store.list())[0].id,'residents'));
  const before=await residents(),r=await card.boundingBox();
  const scene=await page.locator('.home-canvas').boundingBox();
  const start={x:r.x+r.width/2,y:r.y+30},end={x:width/2+80,y:400};
  await page.mouse.move(start.x,start.y);await page.mouse.down();
  await page.mouse.move(start.x,start.y-40,{steps:4});
  await page.mouse.move(end.x,end.y,{steps:8});
  assert.equal(await page.locator('.home-pet-drag-preview').count(),1);
  await page.mouse.up();
  await page.waitForFunction(()=>document.querySelector('.home-status').textContent.includes('宠物已安置'));
  const after=await residents();assert.notDeepEqual(after['qa-0'],before['qa-0']);
  assert.ok(Math.abs(after['qa-0'].x-(end.x-scene.x-scene.width/2)/40)<.01);
  assert.ok(Math.abs(after['qa-0'].y-(end.y-scene.y-scene.height/2)/40)<.01);
  await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x,start.y-40,{steps:4});
  await page.keyboard.press('Escape');await page.mouse.up();
  assert.deepEqual(await residents(),after);
  assert.equal(await page.locator('.home-pet-drag-preview').count(),0);
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.homeQA?.ready);
  assert.deepEqual(await residents(),after);
  console.log(`${width}px: appearance, drop coordinates, cancellation and persistence passed`);
  await context.close();
 }
}finally{await browser.close();}
