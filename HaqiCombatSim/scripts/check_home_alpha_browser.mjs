import {createRequire} from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'playwright');
const base=process.env.HOME_QA_URL||'http://127.0.0.1:8788';
fs.mkdirSync('tmp/home-alpha',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 for(const mode of ['local','cdn']){
  const page=await browser.newPage({viewport:{width:1100,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}/tests/fixtures/home-art.html${mode==='local'?'?local':''}`);
  await page.waitForFunction(()=>window.artQA?.ready,{},{timeout:120000});
  assert.equal(await page.evaluate(()=>artQA.count),160);
  assert.deepEqual(errors,[]);
  for(const id of ['01','06','10'])await page.locator(`#home-atlas-${id}`).screenshot({path:`tmp/home-alpha/${mode}-${id}.png`});
  console.log(`${mode}: 160 sprites, 480 light/dark/grass previews, readable CORS canvas`);
  await page.close();
 }
 for(const width of [1280,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}/tests/fixtures/home.html`);
  await page.waitForFunction(()=>window.homeQA?.ready);
  page.once('dialog',d=>d.accept('透明图集验收'));
  await page.getByRole('button',{name:'新建家园',exact:true}).click();
  await page.locator('.home-canvas').waitFor();
  await page.getByRole('button',{name:'建造',exact:true}).click();
  await page.getByRole('button',{name:'灌木',exact:true}).click();
  await page.locator('.home-canvas').click({position:{x:width*.25,y:350}});
  await page.waitForFunction(()=>document.querySelector('.home-status')?.textContent==='已保存到本机');
  await page.screenshot({path:`tmp/home-alpha/home-${width}.png`});
  assert.deepEqual(errors,[]);console.log(`${width}px: home catalog and placement passed`);
  await page.close();
 }
}finally{await browser.close();}
