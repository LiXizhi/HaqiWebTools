import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});fs.mkdirSync('tmp/home-immersive',{recursive:true});
try{
 for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8788/tests/fixtures/home.html');
  await page.waitForFunction(()=>window.homeQA?.ready);
  page.once('dialog',dialog=>dialog.accept('森林小镇'));
  await page.getByRole('button',{name:'新建家园',exact:true}).click();
  await page.locator('.home-world').waitFor();
  const box=await page.locator('.home-canvas').boundingBox();
  assert.equal(box.width,width);
  assert.equal(box.height,900);
  // 1. Default screen has no sidebar and no summon / 按住说话 button visible
  assert.equal(await page.locator('.home-sidebar').isVisible(),false);
  assert.equal(await page.locator('.home-summon').isVisible(),false);
  assert.equal(await page.getByRole('button',{name:'按住说话',exact:true}).isVisible(),false);

  // 2. Clicking or dragging on world moves hero
  await page.locator('.home-canvas').click({position:{x:width/2+70,y:450}});
  await page.waitForTimeout(700);

  // 3. Direct placement from 建造 (Build catalog, outdoor items first)
  await page.getByRole('button',{name:'建造',exact:true}).click();
  assert(await page.locator('.home-sidebar').isVisible());
  await page.getByRole('button',{name:'喷泉',exact:true}).click();
  await page.locator('.home-canvas').click({position:{x:width*.32,y:340}});
  await page.waitForFunction(()=>document.querySelector('.home-status')?.textContent==='已保存到本机');

  // Also place a bed directly from 建造 to verify smaller indoor item scale
  await page.getByRole('button',{name:'床',exact:true}).click();
  await page.locator('.home-canvas').click({position:{x:width*.22,y:420}});
  await page.waitForFunction(()=>document.querySelector('.home-status')?.textContent==='已保存到本机');
  await page.screenshot({path:`tmp/home-immersive/${width}-build.png`});

  // 4. Close drawer -> clean world view with placed outdoor & indoor items
  await page.locator('.home-sidebar .close-button').click();
  assert.equal(await page.locator('.home-sidebar').isVisible(),false);
  assert.equal(await page.locator('.home-summon').isVisible(),false);
  await page.screenshot({path:`tmp/home-immersive/${width}-walk.png`});

  // 5. Clicking 语音召唤 reveals 按住说话 and summon bar
  await page.getByRole('button',{name:'语音召唤',exact:true}).click();
  assert.equal(await page.locator('.home-summon').isVisible(),true);
  assert.equal(await page.getByRole('button',{name:'按住说话',exact:true}).isVisible(),true);
  await page.getByRole('button',{name:'语音召唤',exact:true}).click();
  assert.equal(await page.locator('.home-summon').isVisible(),false);

  await page.getByRole('button',{name:'家园列表',exact:true}).click();
  await page.getByRole('button',{name:'森林小镇',exact:true}).click();
  await page.locator('.home-world').waitFor();
  assert.deepEqual(errors,[]);
  console.log({width,passed:true});
  await context.close();
 }
}finally{await browser.close();}
