import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('a child can ask a thirsty companion and completes only after its matching facility event',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:60000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});
 const url=`http://127.0.0.1:${server.address().port}`;
 try{for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const intro=async()=>{await page.locator('.rpg-dialogue').waitFor();for(let i=0;i<8&&await page.locator('.rpg-dialogue').count();i++)await page.getByRole('button',{name:'我来帮你',exact:true}).click();};
  await page.goto(url+'/tests/fixtures/language-courses.html');await page.waitForFunction(()=>window.languageTest);
  await page.evaluate(()=>languageTest.authoredHome());await page.getByRole('button',{name:'照顾宠物',exact:true}).click();await intro();
  await page.getByRole('textbox',{name:'输入回答'}).fill('Water, please.');await page.getByRole('button',{name:'回答',exact:true}).click();
  await page.getByRole('button',{name:'检查并保存练习',exact:true}).waitFor();await page.evaluate(()=>languageTest.event());await page.getByRole('button',{name:'再玩一轮',exact:true}).click();
  await page.locator('.rpg-dialogue').waitFor();assert.match(await page.locator('.dialogue-text').textContent(),/thirsty/);await intro();
  assert.match(await page.locator('.language-practice-modal').textContent(),/Water, please/);
  assert.equal((await page.evaluate(()=>languageTest.state('en'))).words.thirsty.practiceCount||0,0);
  await page.getByRole('textbox',{name:'输入回答'}).fill('Are you hungry?');await page.getByRole('button',{name:'回答',exact:true}).click();
  await page.getByRole('status').filter({hasText:'请完成本轮表达'}).waitFor();
  await page.getByRole('textbox',{name:'输入回答'}).fill('Are you thirsty?');await page.getByRole('button',{name:'回答',exact:true}).click();await page.getByRole('button',{name:'检查并保存练习',exact:true}).waitFor();
  assert.equal((await page.evaluate(()=>languageTest.state('en'))).words.thirsty.practiceCount||0,0);
  await page.evaluate(()=>languageTest.homeEvent({kind:'pet-use',objectId:'cup1',petId:'other-pet',activity:'drink'}));
  assert.equal((await page.evaluate(()=>languageTest.state('en'))).words.thirsty.practiceCount||0,0);
  await page.evaluate(()=>languageTest.event());await page.getByRole('button',{name:'再玩一轮',exact:true}).waitFor();
  const state=await page.evaluate(()=>languageTest.state('en'));assert.equal(state.words.thirsty.practiceCount,1);assert.equal(state.words.water.practiceCount,2);
  await page.evaluate(()=>languageTest.event());assert.equal((await page.evaluate(()=>languageTest.state('en'))).words.thirsty.practiceCount,1);
  await page.screenshot({path:path.join(root,`tmp/home-care-thirsty-${width}.png`)});
  assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
