import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('in-room story requires a saved move inside a real room',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:90000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});

 try{for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/home-learning-world.html?in-room&unlearned`);await page.waitForFunction(()=>window.worldLearning?.ready);
  const state=()=>page.evaluate(()=>worldLearning.learning());
  await page.getByRole('button',{name:'家园设置',exact:true}).click();await page.getByRole('button',{name:'情境练习',exact:true}).click();await page.getByRole('button',{name:'把小故事搬进屋',exact:true}).click();
  for(let step=0;step<2;step++){
   await page.locator('.rpg-dialogue').waitFor();for(let n=0;n<8&&await page.locator('.rpg-dialogue').count();n++)await page.getByRole('button',{name:'我来帮你',exact:true}).click();
   await page.getByRole('textbox',{name:'输入回答'}).fill(step?'In the room.':'Put it in.');await page.getByRole('button',{name:'回答',exact:true}).click();
   await page.getByRole('button',{name:'开始摆放',exact:true}).click();assert.equal((await state()).words.in?.practiceCount||0,step);
   const canvas=await page.locator('.home-canvas').boundingBox(),point=(x,y)=>({x:canvas.x+canvas.width/2+x*40+20,y:canvas.y+canvas.height/2+y*40+10});
   const from=point(step?0:2,1),to=point(step?0:-1,step?-2:-3);
   await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:12});
   assert.equal(await page.locator('.home-edit-actions').isVisible(),false,'editing tools must not block a drag destination');
   await page.screenshot({path:path.join(root,`tmp/home-in-room-drag-${step}-${width}.png`)});await page.mouse.up();
   await page.getByRole('button',{name:'继续故事',exact:true}).waitFor();assert.equal((await state()).words.in.practiceCount,step+1);
   await page.screenshot({path:path.join(root,`tmp/home-in-room-${step}-${width}.png`)});
   await page.getByRole('button',{name:'继续故事',exact:true}).click();
  }
  const saved=await state();assert.equal(saved.words.book.practiceCount,1);assert.equal(saved.words.ball.practiceCount,1);await page.reload();await page.waitForFunction(()=>window.worldLearning?.ready);assert.equal((await state()).words.in.practiceCount,2);assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
