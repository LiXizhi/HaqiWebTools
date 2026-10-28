import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('shadow story requires actual finding, same companion care and a saved bed label',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:150000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});
 const url=`http://127.0.0.1:${server.address().port}`;
 try{for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'/tests/fixtures/home-learning-world.html?shadow-story&unlearned');await page.waitForFunction(()=>window.worldLearning?.ready);
  const intro=async()=>{await page.locator('.rpg-dialogue').waitFor();for(let i=0;i<8&&await page.locator('.rpg-dialogue').count();i++)await page.getByRole('button',{name:'我来帮你',exact:true}).click();};
  const openStory=async()=>{await page.getByRole('button',{name:'家园设置',exact:true}).click();await page.getByRole('button',{name:'情境练习',exact:true}).click();await page.getByRole('button',{name:'先陪我坐一会儿',exact:true}).click();};
  const answer=async(text)=>{await page.getByRole('textbox',{name:'输入回答'}).fill(text);await page.getByRole('button',{name:'回答',exact:true}).click();};
  const next=async()=>{await page.getByRole('button',{name:'继续故事',exact:true}).click({timeout:8000});await intro();};
  const canvas=await page.locator('.home-canvas').boundingBox(),point=(x,y)=>({x:canvas.x+canvas.width/2+x*40+20,y:canvas.y+canvas.height/2+y*40+10});
  const tap=async(x,y)=>{const p=point(x,y);await page.mouse.click(p.x,p.y);};
  const drag=async(x,y,u,v)=>{const a=point(x,y),b=point(u,v);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:12});await page.mouse.up();};
  const state=()=>page.evaluate(()=>worldLearning.learning());
  await openStory();await intro();await answer('A lamp.');assert.equal((await state()).words.lamp?.practiceCount||0,0);
  await tap(0,.7);assert.equal((await state()).words.lamp?.practiceCount||0,0);await page.screenshot({path:path.join(root,`tmp/home-shadow-lamp-${width}.png`)});await tap(1.7,-.3);await page.screenshot({path:path.join(root,`tmp/home-shadow-click-${width}.png`)});await next();assert.equal((await state()).words.lamp.practiceCount,1);
  const move=async(x,y)=>{const pet=await page.evaluate(()=>worldLearning.petPosition());await page.mouse.move(canvas.x+canvas.width/2+pet.x*40,canvas.y+canvas.height/2+pet.y*40-25);await page.mouse.down();await page.mouse.move(canvas.x+canvas.width/2+x*40,canvas.y+canvas.height/2+y*40-25,{steps:12});await page.mouse.up();};
  for(const [word,text,x,y] of [['afraid','Are you afraid?',.5,1.5],['tired','Are you tired?',3,3]]){
   await answer(text);await page.getByRole('button',{name:'检查并保存练习',exact:true}).click();assert.equal((await state()).words[word]?.practiceCount||0,0);
   await move(x,y);await next();assert.equal((await state()).words[word].practiceCount,1);
  }
  await page.getByRole('button',{name:'给物品写标签',exact:true}).click();await page.getByRole('textbox',{name:'作品标签'}).fill('My lamp.');await page.getByRole('button',{name:'保存标签',exact:true}).click();assert.equal((await state()).words.bed.practiceCount,1);
  await page.getByRole('button',{name:'给物品写标签',exact:true}).click();await page.getByRole('textbox',{name:'作品标签'}).fill('Our bed.');await page.getByRole('button',{name:'保存标签',exact:true}).click();await page.getByRole('button',{name:'继续故事',exact:true}).click();
  await page.getByRole('status').filter({hasText:'故事下次再讲'}).waitFor();assert.equal((await state()).words.bed.practiceCount,2);
  const saved=await state(),history=Object.values(saved.homeStories)[0];assert.equal(history.next,4);assert.equal(history.pets[1],history.pets[2]);assert.equal(history.objects[2],history.objects[3]);
  const props=await page.evaluate(()=>worldLearning.picnicObjects());assert.equal(props.bed.label,'Our bed.');await page.screenshot({path:path.join(root,`tmp/home-shadow-finish-${width}.png`)});
  await page.reload();await page.waitForFunction(()=>window.worldLearning?.ready);assert.deepEqual(await page.evaluate(()=>worldLearning.picnicObjects()),props);assert.deepEqual((await state()).words,saved.words);
  assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
