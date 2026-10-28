import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('reading wishes receive matching replies, preserve the choice on replay, and never invent reading actions',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:150000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});
 try{for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/home-learning-world.html?reading-choice&unlearned`);await page.waitForFunction(()=>window.worldLearning?.ready);
  const state=()=>page.evaluate(()=>worldLearning.learning()),pet=()=>page.evaluate(()=>worldLearning.petPosition());
  const intro=async()=>{await page.locator('.rpg-dialogue').waitFor();for(let i=0;i<8&&await page.locator('.rpg-dialogue').count();i++)await page.locator('.rpg-dialogue .dialogue-default').click();};
  const answer=async text=>{await page.getByRole('textbox',{name:'输入回答'}).fill(text);await page.getByRole('button',{name:'回答',exact:true}).click();};
  await page.getByRole('button',{name:'家园设置',exact:true}).click();await page.getByRole('button',{name:'情境练习',exact:true}).click();await page.getByRole('button',{name:'今天想读书吗',exact:true}).click();
  const originalPet=await pet();
  for(const [i,negative] of (width===390?[true,false]:[false,true]).entries()){
   await intro();await answer('I want to sleep.');assert.equal((await state()).words.read.practiceCount,i+1);
   await answer(negative?"I don't want to read.":'I want to read.');assert.equal((await state()).words.read.practiceCount,i+1);
   await page.getByRole('button',{name:'听伙伴的回应',exact:true}).click();await page.locator('.rpg-dialogue').waitFor();await page.waitForTimeout(3500);
   const text=await page.locator('.rpg-dialogue').textContent();assert.ok(text.includes(negative?'We can do something else.':'We can choose a book.'));assert.ok(!text.includes(negative?'We can choose a book.':'We can do something else.'));
   await page.screenshot({path:path.join(root,`tmp/home-reading-choice-${negative?'no':'yes'}-${width}.png`)});await intro();await page.getByRole('button',{name:'继续故事',exact:true}).click();await page.getByRole('status').filter({hasText:'你表达了自己今天的意愿'}).waitFor();
   const saved=await state();assert.equal(saved.words.read.practiceCount,i+2);assert.equal(saved.words.want.practiceCount,i+2);assert.equal(saved.words.book.practiceCount,1);assert.deepEqual(await pet(),originalPet);
   if(i===0)await page.getByRole('button',{name:'再玩一次这个故事',exact:true}).click();
  }
  const saved=await state();await page.reload();await page.waitForFunction(()=>window.worldLearning?.ready);assert.deepEqual((await state()).homeStories,saved.homeStories);assert.equal((await state()).words.read.practiceCount,3);assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
