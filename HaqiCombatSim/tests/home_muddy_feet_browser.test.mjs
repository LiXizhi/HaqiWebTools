import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('muddy feet story requires actual bathing, resting and playing with the same companion',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:120000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});
 try{for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/home-learning-world.html?muddy-story&unlearned`);await page.waitForFunction(()=>window.worldLearning?.ready);
  const state=()=>page.evaluate(()=>worldLearning.learning());
  const intro=async()=>{await page.locator('.rpg-dialogue').waitFor();for(let i=0;i<8&&await page.locator('.rpg-dialogue').count();i++)await page.getByRole('button',{name:'我来帮你',exact:true}).click();};
  const answer=async text=>{await page.getByRole('textbox',{name:'输入回答'}).fill(text);await page.getByRole('button',{name:'回答',exact:true}).click();};
  await page.getByRole('button',{name:'家园设置',exact:true}).click();await page.getByRole('button',{name:'情境练习',exact:true}).click();await page.getByRole('button',{name:'泥脚印和泡泡',exact:true}).click();await intro();await answer('You are dirty.');
  const canvas=await page.locator('.home-canvas').boundingBox(),point=(x,y)=>({x:canvas.x+canvas.width/2+x*40,y:canvas.y+canvas.height/2+y*40});
  const drag=async(x,y)=>{const pet=await page.evaluate(()=>worldLearning.petPosition()),a=point(pet.x,pet.y),b=point(x,y);await page.mouse.move(a.x,a.y-25);await page.mouse.down();await page.mouse.move(b.x,b.y-25,{steps:12});await page.mouse.up();};
  await page.getByRole('button',{name:'检查并保存练习',exact:true}).click();assert.equal((await state()).words.dirty?.practiceCount||0,0);
  await drag(3.5,3.5);assert.equal((await state()).words.dirty?.practiceCount||0,0);
  await drag(2.5,1.5);await page.getByRole('button',{name:'继续故事',exact:true}).click();await intro();await answer('You can sleep.');
  await page.getByRole('button',{name:'检查并保存练习',exact:true}).click();assert.equal((await state()).words.sleep.practiceCount,1);
  await drag(.5,.5);await page.getByRole('button',{name:'继续故事',exact:true}).click();await intro();await answer("Let's play.");
  await drag(3.5,3.5);await page.getByRole('button',{name:'继续故事',exact:true}).click();await page.getByRole('status').filter({hasText:'洗澡、休息，再一起玩球'}).waitFor();
  const saved=await state();assert.equal(saved.words.dirty.practiceCount,1);assert.equal(saved.words.sleep.practiceCount,2);assert.equal(saved.words.play.practiceCount,2);
  await page.screenshot({path:path.join(root,`tmp/home-muddy-feet-${width}.png`)});await page.reload();await page.waitForFunction(()=>window.worldLearning?.ready);assert.equal((await state()).words.dirty.practiceCount,1);assert.equal((await state()).words.play.practiceCount,2);assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
