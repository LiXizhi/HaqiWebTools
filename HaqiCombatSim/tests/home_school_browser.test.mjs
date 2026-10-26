import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('school props render and support real finding and persistent writing without crediting decoys',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:240000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});
 const url=`http://127.0.0.1:${server.address().port}`;
 try{for(const width of [1280,390])for(const word of ['pencil','pen','paper','bag','phone','computer']){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const intro=async()=>{await page.locator('.rpg-dialogue').waitFor();for(let i=0;i<8&&await page.locator('.rpg-dialogue').count();i++)await page.getByRole('button',{name:'我来帮你',exact:true}).click();};
  const item=({bag:'school-bag',phone:'telephone'})[word]||word;
  await page.goto(url+'/tests/fixtures/home-learning-world.html?food='+item);await page.waitForFunction(()=>window.worldLearning?.ready);
  const menu=async(mode)=>{await page.getByRole('button',{name:'家园设置',exact:true}).click();await page.getByRole('button',{name:'情境练习',exact:true}).click();await page.getByRole('button',{name:mode,exact:true}).click();await intro();};
  await menu('找物游戏');await page.getByRole('textbox',{name:'输入回答'}).fill(word==='paper'?'Some paper.':'A '+word+'.');await page.getByRole('button',{name:'回答',exact:true}).click();
  const canvas=await page.locator('.home-canvas').boundingBox();await page.mouse.click(canvas.x+canvas.width/2+26,canvas.y+canvas.height/2+34);assert.equal((await page.evaluate(()=>worldLearning.learning())).words[word].practiceCount,1);
  await page.screenshot({path:path.join(root,`tmp/school-hit-${word}-${width}.png`)});await page.mouse.click(canvas.x+canvas.width/2+100,canvas.y+canvas.height/2+50);await page.getByRole('button',{name:'再玩一轮',exact:true}).waitFor();assert.equal((await page.evaluate(()=>worldLearning.learning())).words[word].practiceCount,2);
  await page.reload();await page.waitForFunction(()=>window.worldLearning?.ready);await menu('写作品标签');await page.getByRole('button',{name:'给物品写标签',exact:true}).click();await page.getByRole('textbox',{name:'作品标签'}).fill('Our '+word+'.');await page.getByRole('button',{name:'保存标签',exact:true}).click();await page.getByRole('button',{name:'再玩一轮',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>worldLearning.foodLabel()),'Our '+word+'.');assert.equal((await page.evaluate(()=>worldLearning.learning())).words[word].practiceCount,3);
  await page.screenshot({path:path.join(root,`tmp/home-school-${word}-${width}.png`)});
  await page.reload();await page.waitForFunction(()=>window.worldLearning?.ready);assert.equal((await page.evaluate(()=>worldLearning.learning())).words[word].practiceCount,3);assert.equal(await page.evaluate(()=>worldLearning.foodLabel()),'Our '+word+'.');
  assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
