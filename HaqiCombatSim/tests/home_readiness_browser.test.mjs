import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('a new learner can prepare a word then return to the original story without fake progress',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:150000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});
 try{for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/home-learning-world.html?unlearned`);await page.waitForFunction(()=>window.worldLearning?.ready);
  const state=()=>page.evaluate(()=>worldLearning.learning());
  const open=async()=>{await page.getByRole('button',{name:'家园设置',exact:true}).click();await page.getByRole('button',{name:'情境练习',exact:true}).click();};
  const intro=async()=>{await page.locator('.rpg-dialogue').waitFor();for(let i=0;i<8&&await page.locator('.rpg-dialogue').count();i++)await page.getByRole('button',{name:'我来帮你',exact:true}).click();};
  const answer=async text=>{await page.getByRole('textbox',{name:'输入回答'}).fill(text);await page.getByRole('button',{name:'回答',exact:true}).click();};
  await open();const title=page.getByRole('button',{name:'留在书上的小名字',exact:true});await title.waitFor();assert.match(await title.locator('..').textContent(),/先认识：book/);
  await title.click();assert.equal((await state()).words.book?.practiceCount||0,0);assert.equal(Object.keys((await state()).homeStories||{}).length,0);
  await page.getByRole('button',{name:'先认识 book',exact:true}).click();await intro();await answer('A book.');
  const b=await page.locator('.home-canvas').boundingBox();await page.mouse.click(b.x+b.width/2+100,b.y+b.height/2+50);await page.getByRole('button',{name:'回到故事',exact:true}).waitFor();
  assert.equal((await state()).words.book.practiceCount,1);assert.equal(Object.keys((await state()).homeStories||{}).length,0);
  await page.getByRole('button',{name:'回到故事',exact:true}).click();await intro();await answer('A book.');await page.mouse.click(b.x+b.width/2+100,b.y+b.height/2+50);await page.getByRole('button',{name:'继续故事',exact:true}).waitFor();
  assert.equal(Object.values((await state()).homeStories)[0].next,1);
  await page.reload();await page.waitForFunction(()=>window.worldLearning?.ready);await open();await page.getByRole('button',{name:'留在书上的小名字',exact:true}).waitFor();assert.match(await page.getByRole('button',{name:'留在书上的小名字',exact:true}).locator('..').textContent(),/第 2\/3 步/);
  await page.screenshot({path:path.join(root,`tmp/home-readiness-${width}.png`)});
  await page.getByRole('button',{name:'留给明天的小画桌',exact:true}).click();await page.getByRole('status').filter({hasText:'后续还需'}).waitFor();await page.getByRole('button',{name:'去布置家园',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-drawer="build"]'));
  assert.equal(Object.values((await state()).homeStories)[0].next,1);assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
