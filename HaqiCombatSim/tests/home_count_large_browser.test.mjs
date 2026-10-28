import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('six eight ten require each visible object before a correct quantity and persist once',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:150000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});
 const url=`http://127.0.0.1:${server.address().port}`;
 try{for(const width of [1280,390])for(const [amount,word] of [[6,'six'],[8,'eight'],[10,'ten']]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const intro=async()=>{await page.locator('.rpg-dialogue').waitFor();for(let i=0;i<8&&await page.locator('.rpg-dialogue').count();i++)await page.getByRole('button',{name:'我来帮你',exact:true}).click();};
  await page.goto(url+'/tests/fixtures/home-learning-world.html?count-many='+amount);await page.waitForFunction(()=>window.worldLearning?.ready);
  await page.getByRole('button',{name:'家园设置',exact:true}).click();await page.getByRole('button',{name:'情境练习',exact:true}).click();await page.getByRole('button',{name:'和伙伴数一数',exact:true}).click();await intro();
  assert.match(await page.locator('.language-practice-modal').textContent(),/How many books/);const canvas=await page.locator('.home-canvas').boundingBox();
  const tap=async n=>page.mouse.click(canvas.x+canvas.width/2+(-3+(n%4)*2)*40+20,canvas.y+canvas.height/2+(-7+Math.floor(n/4)*2)*40+10);
  await tap(0);await tap(0);await page.getByRole('status').filter({hasText:'已经数过了'}).waitFor();
  for(let n=1;n<amount-1;n++)await tap(n);
  assert.equal(await page.getByRole('textbox',{name:'输入回答'}).count(),0);assert.equal((await page.evaluate(w=>worldLearning.learning().then(s=>s.words[w]),word)).practiceCount||0,0);
  await tap(amount-1);const input=page.getByRole('textbox',{name:'输入回答'});await input.waitFor();await input.fill('Two books.');await page.getByRole('button',{name:'回答',exact:true}).click();assert.equal((await page.evaluate(w=>worldLearning.learning().then(s=>s.words[w]),word)).practiceCount||0,0);
  await input.fill(word+' books.');await page.getByRole('button',{name:'回答',exact:true}).click();await page.getByRole('button',{name:'再玩一轮',exact:true}).waitFor();assert.equal((await page.evaluate(w=>worldLearning.learning().then(s=>s.words[w]),word)).practiceCount,1);
  await page.screenshot({path:path.join(root,`tmp/home-count-${amount}-${width}.png`)});await page.reload();await page.waitForFunction(()=>window.worldLearning?.ready);assert.equal((await page.evaluate(w=>worldLearning.learning().then(s=>s.words[w]),word)).practiceCount,1);
  assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
