import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('body part artwork has neutral accessible choices, bounded mobile layout and stale-click cancellation',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:120000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});
 try{for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/home-body-parts.html${width===390?'?cdn':''}`);
  const first=page.getByRole('button',{name:'图中位置 1',exact:true});await first.waitFor();await page.waitForFunction(()=>document.querySelector('[aria-label="图中位置 1"]')?.disabled===false);
  for(let i=1;i<=5;i++){const b=page.getByRole('button',{name:'图中位置 '+i,exact:true});const box=await b.boundingBox();assert.ok(box.width>=44&&box.height>=44);assert.ok(box.x>=0&&box.x+box.width<=width);await b.click();}
  assert.deepEqual(await page.evaluate(()=>bodyPartsReview.chosen),['hair','eye','ear','nose','mouth']);
  await page.screenshot({path:path.join(root,`tmp/home-body-face-${width}.png`)});
  await page.getByRole('button',{name:'看全身',exact:true}).click();for(let i=1;i<=4;i++)await page.getByRole('button',{name:'图中位置 '+i,exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>bodyPartsReview.chosen.slice(5)),['arm','hand','leg','foot']);
  await page.screenshot({path:path.join(root,`tmp/home-body-full-${width}.png`)});
  await page.evaluate(()=>bodyPartsReview.valid=false);await first.click();assert.equal((await page.evaluate(()=>bodyPartsReview.chosen)).length,9);
  await page.getByRole('button',{name:'关闭看看纸上朋友',exact:true}).click();assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
