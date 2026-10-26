import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('reading selects real home objects; listening requires completed playback and preserves assistance evidence',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:120000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});
 const url=`http://127.0.0.1:${server.address().port}`;
 try{for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const intro=async()=>{await page.locator('.rpg-dialogue').waitFor();for(let i=0;i<8&&await page.locator('.rpg-dialogue').count();i++)await page.getByRole('button',{name:'我来帮你',exact:true}).click();};
  await page.goto(url+'/tests/fixtures/home-learning-world.html?comprehension');await page.waitForFunction(()=>window.worldLearning?.ready);
  await page.getByRole('button',{name:'家园设置',exact:true}).click();await page.getByRole('button',{name:'情境练习',exact:true}).click();
  await page.getByRole('button',{name:'读线索找物',exact:true}).click();await intro();
  assert.match(await page.getByRole('status').textContent(),/Find the book/);
  assert.equal(await page.getByRole('textbox',{name:'输入回答'}).count(),0);
  const canvas=await page.locator('.home-canvas').boundingBox();
  // Renderer projects the fixture's fixed world coordinates at the initial
  // 40px scale. Real pointer events go through canvas hit testing and home_app.
  await page.mouse.click(canvas.x+canvas.width/2+28,canvas.y+canvas.height/2+34);
  await page.getByRole('status').filter({hasText:'还不是这件'}).waitFor();
  assert.equal((await page.evaluate(()=>worldLearning.learning())).words.book.comprehension,undefined);
  await page.mouse.click(canvas.x+canvas.width/2+100,canvas.y+canvas.height/2+50);
  await page.getByRole('button',{name:'再玩一轮',exact:true}).waitFor();
  const word=(await page.evaluate(()=>worldLearning.learning())).words.book;
  assert.equal(word.practiceCount,1);assert.equal(word.comprehension.read.last.attempts,2);assert.equal(word.comprehension.read.unassistedFirstChoice,0);
  await page.screenshot({path:path.join(root,`tmp/home-comprehension-${width}.png`)});
  await page.reload();await page.waitForFunction(()=>window.worldLearning?.ready);assert.equal((await page.evaluate(()=>worldLearning.learning())).words.book.comprehension.read.count,1);
  await page.goto(url+'/tests/fixtures/language-courses.html');await page.waitForFunction(()=>window.languageTest);
  await page.evaluate(()=>languageTest.authoredWritingHome());await page.getByRole('button',{name:'听伙伴找物',exact:true}).click();await intro();
  assert.ok(!(await page.locator('.language-practice-modal').textContent()).includes('Find the book'));
  await page.evaluate(()=>languageTest.homeEvent({kind:'find',objectId:'book1'}));
  assert.equal((await page.evaluate(()=>languageTest.state('en'))).words.book.comprehension,undefined);
  await page.evaluate(()=>languageTest.speechFail(true));await page.getByRole('button',{name:'听伙伴的请求',exact:true}).click();await page.getByRole('status').filter({hasText:'测试语音不可用'}).waitFor();
  await page.evaluate(()=>languageTest.homeEvent({kind:'find',objectId:'book1'}));assert.equal((await page.evaluate(()=>languageTest.state('en'))).words.book.comprehension,undefined);
  await page.evaluate(()=>languageTest.speechFail(false));await page.getByRole('button',{name:'听伙伴的请求',exact:true}).click();await page.getByRole('status').filter({hasText:'听完了'}).waitFor();
  await page.getByRole('button',{name:'给我一点帮助',exact:true}).click();
  await page.evaluate(()=>languageTest.homeEvent({kind:'find',objectId:'book1'}));await page.getByRole('button',{name:'再玩一轮',exact:true}).waitFor();
  await page.evaluate(()=>languageTest.homeEvent({kind:'find',objectId:'book1'}));
  const heard=(await page.evaluate(()=>languageTest.state('en'))).words.book;assert.equal(heard.practiceCount,1);assert.equal(heard.comprehension.listen.count,1);assert.equal(heard.comprehension.listen.last.assisted,true);
  await page.getByRole('button',{name:'再玩一轮',exact:true}).click();await intro();await page.evaluate(()=>languageTest.speechHold());
  await page.getByRole('button',{name:'听伙伴的请求',exact:true}).click();await page.evaluate(()=>languageTest.switch('ja'));await page.evaluate(()=>languageTest.speechRelease());
  await page.locator('.language-practice-modal').waitFor({state:'detached'});
  assert.equal((await page.evaluate(()=>languageTest.state('en'))).words.book.comprehension.listen.count,1);
  assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
