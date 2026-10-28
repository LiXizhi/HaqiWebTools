import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('rolling-ball-show conversation enters through journal, keeps active tracker and completes six NPC exchanges',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:120000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});
 try{for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/language-courses.html`);await page.waitForFunction(()=>window.languageTest);await page.evaluate(async()=>{await languageTest.course('en');languageTest.travel('hanzi');});
  const tracker=page.locator('.quest-tracker');await tracker.locator('.quest-track-title').first().click();
  await page.getByText('球没有长出脚',{exact:true}).click();
  await page.getByRole('button',{name:'前往交谈',exact:true}).click();
  for(let i=0;i<6;i++){
   if(i)await tracker.getByRole('button',{name:'前往',exact:true}).click();
   await page.locator('.rpg-dialogue').waitFor();
   assert.equal(await page.getByRole('textbox',{name:'文字回答',exact:true}).count(),0);
   if(i===0)await page.screenshot({path:path.join(root,`tmp/rolling-ball-intro-${width}.png`)});
   for(let n=0;n<10&&await page.locator('.rpg-dialogue').count();n++)await page.locator('.rpg-dialogue .dialogue-default').click();
   await page.getByRole('button',{name:'输入',exact:true}).click();
   if(i===3)await page.screenshot({path:path.join(root,`tmp/rolling-ball-speak-${width}.png`)});
   await page.getByRole('textbox',{name:'文字回答',exact:true}).fill(await page.evaluate(()=>languageTest.answer()));
   await page.getByRole('button',{name:'发送',exact:true}).click();
   await page.getByRole('button',{name:i===5?'返回岛屿':'前往下一处',exact:true}).click();
   const state=await page.evaluate(()=>languageTest.state('en'));
   assert.equal(state.courses['en-hanzi-09'].scene.next,i+1);
   assert.ok(!state.courses['en-hanzi-01']);assert.ok(!state.courses['en-hanzi-02']);
   if(i<5)assert.ok((await tracker.textContent()).includes('球没有长出脚'));
  }
  assert.deepEqual((await page.evaluate(()=>languageTest.visits)).map(v=>v.id),[863000,863001,863002,863003,863000,863002]);
  assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
