import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('toy parade combines real toys, heard/read choices, placement and a saved role label',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:120000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});
 try{for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  try{
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/home-learning-world.html?toy-parade&unlearned`);await page.waitForFunction(()=>window.worldLearning?.ready);
  const state=()=>page.evaluate(()=>worldLearning.learning()),next=async()=>{await page.getByRole('button',{name:'继续故事',exact:true}).click();await intro();};
  const intro=async()=>{await page.locator('.rpg-dialogue').waitFor();for(let i=0;i<8&&await page.locator('.rpg-dialogue').count();i++)await page.getByRole('button',{name:'我来帮你',exact:true}).click();};
  const answer=async text=>{await page.getByRole('textbox',{name:'输入回答'}).fill(text);await page.getByRole('button',{name:'回答',exact:true}).click();};
  const canvas=await page.locator('.home-canvas').boundingBox(),point=(x,y)=>({x:canvas.x+canvas.width/2+x*40,y:canvas.y+canvas.height/2+y*40}),pick=async(x,y)=>{const p=point(x,y);await page.mouse.click(p.x,p.y);};
  const drag=async(a,b)=>{await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:12});await page.mouse.up();};
  await page.getByRole('button',{name:'家园设置',exact:true}).click();await page.getByRole('button',{name:'情境练习',exact:true}).click();await page.getByRole('button',{name:'玩具游行，谁来排队',exact:true}).click();await intro();await answer('A duck.');await pick(.5,1.1);await next();
  await answer('A horse.');await pick(3,0);await next();
  assert.ok(!(await page.locator('.language-practice-modal').textContent()).includes('Find the duck'));
  await pick(.5,1.1);assert.equal((await state()).words.duck.comprehension,undefined);await page.getByRole('button',{name:'听伙伴的请求',exact:true}).click();await page.getByRole('status').filter({hasText:'听完了'}).waitFor();await pick(3,0);await page.getByRole('status').filter({hasText:'还不是这件'}).waitFor();await pick(.5,1.1);await next();
  assert.match(await page.getByRole('status').textContent(),/Find the horse/);await pick(.5,1.1);await page.getByRole('status').filter({hasText:'还不是这件'}).waitFor();await pick(3,0);await next();
  await answer('Near the duck.');await page.getByRole('button',{name:'开始摆放',exact:true}).click();await drag(point(3,0),point(-3,-3));await page.getByRole('status').filter({hasText:'位置还不符合'}).waitFor();assert.equal((await state()).words.near?.practiceCount||0,0);
  await drag(point(-3,-3),point(2.5,2.5));await next();await page.getByRole('button',{name:'给物品写标签',exact:true}).click();await page.getByRole('textbox',{name:'作品标签'}).fill('A horse.');await page.getByRole('button',{name:'保存标签',exact:true}).click();await page.getByRole('button',{name:'继续故事',exact:true}).click();await page.getByRole('status').filter({hasText:'小黄鸭和木马已经靠近'}).waitFor();
  const words=(await state()).words;assert.equal(words.duck.practiceCount,1);assert.equal(words.horse.practiceCount,2);assert.equal(words.near.practiceCount,1);assert.equal(words.duck.comprehension.listen.last.attempts,2);assert.equal(words.horse.comprehension.read.last.attempts,2);
  const placed=await page.evaluate(()=>worldLearning.schoolObjects());assert.equal(placed.horse.label,'A horse.');await page.screenshot({path:path.join(root,`tmp/home-toy-parade-${width}.png`)});
  await page.reload();await page.waitForFunction(()=>window.worldLearning?.ready);assert.deepEqual((await page.evaluate(()=>worldLearning.schoolObjects())).horse,placed.horse);assert.equal((await state()).words.horse.practiceCount,2);assert.deepEqual(errors,[]);
  }catch(e){await page.screenshot({path:path.join(root,`tmp/home-toy-parade-failure-${width}.png`)});throw e;}finally{await context.close();}
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
