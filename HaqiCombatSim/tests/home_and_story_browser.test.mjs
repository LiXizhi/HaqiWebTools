import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('home invitation requires the original companion to sit and read before thanks',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:150000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});
 const url=`http://127.0.0.1:${server.address().port}`;
 try{for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'/tests/fixtures/home-learning-world.html?home-story&unlearned');await page.waitForFunction(()=>window.worldLearning?.ready);
  const intro=async()=>{await page.locator('.rpg-dialogue').waitFor();for(let i=0;i<8&&await page.locator('.rpg-dialogue').count();i++)await page.locator('.rpg-dialogue .dialogue-default').click();};
  const openStory=async()=>{await page.getByRole('button',{name:'家园设置',exact:true}).click();await page.getByRole('button',{name:'情境练习',exact:true}).click();await page.getByRole('button',{name:'回家后的小约定',exact:true}).click();};
  const answer=async(text)=>{await page.getByRole('textbox',{name:'输入回答'}).fill(text);await page.getByRole('button',{name:'回答',exact:true}).click();};
  const next=async()=>{await page.getByRole('button',{name:'继续故事',exact:true}).click({timeout:8000});await intro();};
  const canvas=await page.locator('.home-canvas').boundingBox(),point=(x,y)=>({x:canvas.x+canvas.width/2+x*40+20,y:canvas.y+canvas.height/2+y*40+10});
  const tap=async(x,y)=>{const p=point(x,y);await page.mouse.click(p.x,p.y);};
  const drag=async(x,y,u,v)=>{const a=point(x,y),b=point(u,v);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:12});await page.mouse.up();};
  const state=()=>page.evaluate(()=>worldLearning.learning());
  const talkReply=async()=>{await page.getByRole('button',{name:'听伙伴的回应',exact:true}).click();await intro();};
  const movePet=async(x,y)=>{const pet=await page.evaluate(()=>worldLearning.petPosition());await page.mouse.move(canvas.x+canvas.width/2+pet.x*40,canvas.y+canvas.height/2+pet.y*40-25);await page.mouse.down();await page.mouse.move(canvas.x+canvas.width/2+x*40,canvas.y+canvas.height/2+y*40-25,{steps:12});await page.mouse.up();};
  await openStory();await intro();await answer('This is our home.');assert.equal((await state()).words.home?.practiceCount||0,0);await talkReply();await next();assert.equal((await state()).words.home.practiceCount,1);
  await answer('Sit here.');await page.getByRole('button',{name:'检查并保存练习',exact:true}).click();assert.equal((await state()).words.here?.practiceCount||0,0);await movePet(.5,1.5);await next();assert.equal((await state()).words.here.practiceCount,1);
  await answer('Please read.');await page.getByRole('button',{name:'检查并保存练习',exact:true}).click();assert.equal((await state()).words.please?.practiceCount||0,0);await movePet(2.5,1.5);await next();assert.equal((await state()).words.please.practiceCount,1);
  await answer('Thank you.');assert.equal((await state()).words['thank you']?.practiceCount||0,1);await talkReply();await page.getByRole('button',{name:'继续故事',exact:true}).click();await page.getByRole('status').filter({hasText:'你介绍了自己的家'}).waitFor();
  const saved=await state(),progress=Object.values(saved.homeStories)[0];assert.equal(progress.next,4);assert.equal(progress.objects[0],progress.objects[1]);assert.equal(progress.objects[0],progress.objects[3]);assert.equal(new Set(Object.values(progress.pets)).size,1);assert.equal(saved.words['thank you'].practiceCount,2);assert.equal(saved.words.read.practiceCount,1);assert.equal(saved.words.sit.practiceCount,1);
  await page.screenshot({path:path.join(root,`tmp/home-and-story-${width}.png`)});await page.reload();await page.waitForFunction(()=>window.worldLearning?.ready);const restored=await state();assert.deepEqual(restored.homeStories,saved.homeStories);assert.equal(restored.words.home.practiceCount,1);assert.equal(restored.words.here.practiceCount,1);assert.equal(restored.words.please.practiceCount,1);assert.equal(restored.words['thank you'].practiceCount,2);
  assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
