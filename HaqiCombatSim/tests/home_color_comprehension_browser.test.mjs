import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('colour listening and reading distinguish identical books without adding expression counts',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:120000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});
 try{for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/home-learning-world.html?color-comprehension&unlearned`);await page.waitForFunction(()=>window.worldLearning?.ready);
  const state=()=>page.evaluate(()=>worldLearning.learning());
  const intro=async()=>{await page.locator('.rpg-dialogue').waitFor();for(let i=0;i<8&&await page.locator('.rpg-dialogue').count();i++)await page.getByRole('button',{name:'我来帮你',exact:true}).click();};
  const open=async mode=>{await page.getByRole('button',{name:'家园设置',exact:true}).click();await page.getByRole('button',{name:'情境练习',exact:true}).click();await page.getByRole('button',{name:mode,exact:true}).click();await intro();};
  const canvas=await page.locator('.home-canvas').boundingBox(),pick=async(x,y)=>page.mouse.click(canvas.x+canvas.width/2+x*40+20,canvas.y+canvas.height/2+y*40+10);
  await open('听伙伴找物');assert.ok(!(await page.locator('.language-practice-modal').textContent()).includes('Find something red'));
  await pick(2,1);assert.equal((await state()).words.red.comprehension,undefined);
  await page.getByRole('button',{name:'听伙伴的请求',exact:true}).click();await page.getByRole('status').filter({hasText:'听完了'}).waitFor();
  await pick(0,1);await page.getByRole('status').filter({hasText:'还不是这件'}).waitFor();assert.equal((await state()).words.red.comprehension,undefined);
  await pick(2,1);await page.getByRole('button',{name:'再玩一轮',exact:true}).waitFor();assert.equal((await state()).words.red.comprehension.listen.last.attempts,2);
  await page.getByRole('button',{name:'选择其他游戏',exact:true}).click();await page.getByRole('button',{name:'读线索找物',exact:true}).click();await intro();assert.match(await page.getByRole('status').textContent(),/Find something red/);
  await page.screenshot({path:path.join(root,`tmp/home-color-choice-${width}.png`)});await pick(3,0);await page.getByRole('button',{name:'再玩一轮',exact:true}).waitFor();
  const word=(await state()).words.red;assert.equal(word.practiceCount,1);assert.equal(word.comprehension.read.count,1);assert.equal(word.comprehension.read.unassistedFirstChoice,1);assert.equal(word.comprehension.listen.count,1);
  await pick(3,0);assert.equal((await state()).words.red.comprehension.read.count,1);
  await page.reload();await page.waitForFunction(()=>window.worldLearning?.ready);assert.equal((await state()).words.red.comprehension.read.count,1);assert.equal((await state()).words.red.practiceCount,1);assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
