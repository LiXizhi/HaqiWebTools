import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('book colour story keeps listening, reading and original-book writing distinct',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:120000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});
 try{for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/home-learning-world.html?color-comprehension&book-colors&unlearned`);await page.waitForFunction(()=>window.worldLearning?.ready);
  const state=()=>page.evaluate(()=>worldLearning.learning());
  const intro=async()=>{await page.locator('.rpg-dialogue').waitFor();for(let i=0;i<8&&await page.locator('.rpg-dialogue').count();i++)await page.getByRole('button',{name:'我来帮你',exact:true}).click();};
  const open=async mode=>{await page.getByRole('button',{name:'家园设置',exact:true}).click();await page.getByRole('button',{name:'情境练习',exact:true}).click();await page.getByRole('button',{name:mode,exact:true}).click();await intro();};
  const canvas=await page.locator('.home-canvas').boundingBox(),pick=async(x,y)=>page.mouse.click(canvas.x+canvas.width/2+x*40+20,canvas.y+canvas.height/2+y*40+10);
  await open('两本书的颜色记号');const original=await state();
  assert.ok(!(await page.locator('.language-practice-modal').textContent()).includes('Find something red'));
  await pick(2,1);assert.equal((await state()).words.red.comprehension,undefined);
  await page.getByRole('button',{name:'听伙伴的请求',exact:true}).click();await page.getByRole('status').filter({hasText:'听完了'}).waitFor();
  await pick(0,1);await page.getByRole('status').filter({hasText:'还不是这件'}).waitFor();assert.equal((await state()).words.red.comprehension,undefined);
  await pick(2,1);await page.getByRole('button',{name:'继续故事',exact:true}).click();await intro();
  assert.equal((await state()).words.red.comprehension.listen.last.attempts,2);assert.equal((await state()).words.red.practiceCount,original.words.red.practiceCount);
  assert.match(await page.getByRole('status').textContent(),/Find something blue/);await pick(0,1);await page.getByRole('button',{name:'继续故事',exact:true}).click();await intro();
  assert.equal((await state()).words.blue.comprehension.read.unassistedFirstChoice,1);assert.equal((await state()).words.blue.practiceCount,original.words.blue.practiceCount);
  await page.getByRole('button',{name:'给物品写标签',exact:true}).click();await page.getByRole('textbox',{name:'作品标签'}).fill('Blue.');await page.getByRole('button',{name:'保存标签',exact:true}).click();assert.equal((await state()).words.red.practiceCount,original.words.red.practiceCount);
  await page.getByRole('button',{name:'给物品写标签',exact:true}).click();await page.getByRole('textbox',{name:'作品标签'}).fill('It is red.');await page.getByRole('button',{name:'保存标签',exact:true}).click();await page.getByRole('button',{name:'继续故事',exact:true}).click();
  await page.getByRole('status').filter({hasText:'给原书写了颜色标签'}).waitFor();const saved=await state();assert.equal(saved.words.red.practiceCount,original.words.red.practiceCount+1);
  const props=await page.evaluate(()=>worldLearning.picnicObjects());assert.equal(props.book.label,'It is red.');assert.ok(!props.book2.label&&!props.book3.label);
  const history=Object.values(saved.homeStories)[0];assert.equal(history.next,3);assert.equal(history.objects[0],history.objects[2]);assert.notEqual(history.objects[0],history.objects[1]);
  await page.screenshot({path:path.join(root,`tmp/home-book-colors-${width}.png`)});await page.reload();await page.waitForFunction(()=>window.worldLearning?.ready);assert.deepEqual((await state()).words,saved.words);assert.deepEqual(await page.evaluate(()=>worldLearning.picnicObjects()),props);assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
