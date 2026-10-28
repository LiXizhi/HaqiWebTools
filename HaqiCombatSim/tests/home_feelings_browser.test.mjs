import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('feelings stories need actual partner replies and requested care',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:180000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});


 try{for(const width of [1280,390])for(const [word,title,question,steps,ending] of [
 ['hot','玩累了，先歇歇','Are you hot?',[['water','Water, please.',3.5,3.5],['sit','Please sit.',2.5,1.5]],'什么时候继续玩'],
 ['cold','不玩球也可以','Are you cold?',[['bed','A bed for you.',-2,2]],'陪它回床边休息'],
 ['hurt','我陪你停一会儿','Does it hurt?',[['help','I can help.',2.5,1.5],['read',"Let's read.",.5,2.5]],'不用急着继续玩']
 ]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/home-learning-world.html?feelings-story&unlearned`);await page.waitForFunction(()=>window.worldLearning?.ready);
  const state=()=>page.evaluate(()=>worldLearning.learning()),intro=async()=>{await page.locator('.rpg-dialogue').waitFor();for(let n=0;n<10&&await page.locator('.rpg-dialogue').count();n++)await page.locator('.rpg-dialogue .dialogue-default').click();};
  const answer=async text=>{await page.getByRole('textbox',{name:'输入回答'}).fill(text);await page.getByRole('button',{name:'回答',exact:true}).click();};
  await page.getByRole('button',{name:'家园设置',exact:true}).click();await page.getByRole('button',{name:'情境练习',exact:true}).click();await page.getByRole('button',{name:title,exact:true}).click();await intro();await answer(question);
  assert.equal((await state()).words[word]?.practiceCount||0,0);await page.getByRole('button',{name:'听伙伴的回应',exact:true}).click();await page.locator('.rpg-dialogue').waitFor();assert.equal((await state()).words[word]?.practiceCount||0,0);
  await page.screenshot({path:path.join(root,`tmp/home-feeling-${word}-${width}.png`)});await intro();await page.getByRole('button',{name:'继续故事',exact:true}).click();assert.equal((await state()).words[word].practiceCount,1);
  const canvas=await page.locator('.home-canvas').boundingBox(),point=(x,y)=>({x:canvas.x+canvas.width/2+x*40,y:canvas.y+canvas.height/2+y*40});
  const drag=async(x,y)=>{const pet=await page.evaluate(()=>worldLearning.petPosition()),a=point(pet.x,pet.y),b=point(x,y);await page.mouse.move(a.x,a.y-25);await page.mouse.down();await page.mouse.move(b.x,b.y-25,{steps:12});await page.mouse.up();};
  for(const [target,text,x,y] of steps){await intro();await answer(text);await page.getByRole('button',{name:'检查并保存练习',exact:true}).click();assert.equal((await state()).words[target].practiceCount,1,'answer alone cannot stand for actual care');await drag(x,y);await page.getByRole('button',{name:'继续故事',exact:true}).click();assert.equal((await state()).words[target].practiceCount,2);}
  await page.getByRole('status').filter({hasText:ending}).waitFor();assert.equal((await state()).words.book.practiceCount,1);assert.equal((await state()).words[word].comprehension,undefined);
  await page.reload();await page.waitForFunction(()=>window.worldLearning?.ready);assert.equal((await state()).words[word].practiceCount,1);for(const [target] of steps)assert.equal((await state()).words[target].practiceCount,2);assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
