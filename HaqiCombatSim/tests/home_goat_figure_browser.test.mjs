import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('goat figurine supports real placement, labels and separate listening and reading evidence',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:150000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});
 const url=`http://127.0.0.1:${server.address().port}`;
 try{for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'/tests/fixtures/home-learning-world.html?goat-story&unlearned');await page.waitForFunction(()=>window.worldLearning?.ready);
  const intro=async()=>{await page.locator('.rpg-dialogue').waitFor();for(let i=0;i<8&&await page.locator('.rpg-dialogue').count();i++)await page.getByRole('button',{name:'我来帮你',exact:true}).click();};
  const openStory=async()=>{await page.getByRole('button',{name:'家园设置',exact:true}).click();await page.getByRole('button',{name:'情境练习',exact:true}).click();await page.getByRole('button',{name:'不会自己走的小山羊',exact:true}).click();};
  const answer=async(text)=>{await page.getByRole('textbox',{name:'输入回答'}).fill(text);await page.getByRole('button',{name:'回答',exact:true}).click();};
  const next=async()=>{await page.getByRole('button',{name:'继续故事',exact:true}).click({timeout:8000});await intro();};
  const canvas=await page.locator('.home-canvas').boundingBox(),point=(x,y)=>({x:canvas.x+canvas.width/2+x*40+20,y:canvas.y+canvas.height/2+y*40+10});
  const tap=async(x,y)=>{const p=point(x,y);await page.mouse.click(p.x,p.y);};
  const drag=async(x,y,u,v)=>{const a=point(x,y),b=point(u,v);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:12});await page.mouse.up();};
  const state=()=>page.evaluate(()=>worldLearning.learning()),goat=()=>page.evaluate(async()=>(await worldLearning.schoolObjects()).goat);
  await openStory();await intro();await answer('A goat.');await tap(0,2);assert.equal((await state()).words.goat?.practiceCount||0,0);
  await page.screenshot({path:path.join(root,`tmp/home-goat-before-${width}.png`)});await tap(2.1,1);await next();assert.equal((await state()).words.goat.practiceCount,1);
  await answer('My goat.');await page.getByRole('button',{name:'开始摆放',exact:true}).click();const before=await goat();assert.equal((await state()).words.goat.practiceCount,1);await drag(2.1,1,2.1,3);await next();assert.equal((await state()).words.goat.practiceCount,2);assert.notDeepEqual({x:(await goat()).x,y:(await goat()).y},{x:before.x,y:before.y});
  await page.getByRole('button',{name:'给物品写标签',exact:true}).click();await page.getByRole('textbox',{name:'作品标签'}).fill('My sheep.');await page.getByRole('button',{name:'保存标签',exact:true}).click();assert.equal((await state()).words.goat.practiceCount,2);
  await page.getByRole('button',{name:'给物品写标签',exact:true}).click();await page.getByRole('textbox',{name:'作品标签'}).fill('My goat.');await page.getByRole('button',{name:'保存标签',exact:true}).click();await page.getByRole('button',{name:'继续故事',exact:true}).click();await page.getByRole('status').filter({hasText:'小故事演员准备好了'}).waitFor();assert.equal((await state()).words.goat.practiceCount,3);
  const saved=await goat();assert.equal(saved.label,'My goat.');await page.screenshot({path:path.join(root,`tmp/home-goat-finish-${width}.png`)});
  await page.getByRole('button',{name:'选择其他游戏',exact:true}).click();await page.getByRole('button',{name:'读线索找物',exact:true}).click();await intro();await tap(0,2);assert.equal((await state()).words.goat.comprehension,undefined);await tap(saved.x+.1,saved.y);await page.getByRole('button',{name:'再玩一轮',exact:true}).waitFor();assert.equal((await state()).words.goat.comprehension.read.count,1);assert.equal((await state()).words.goat.practiceCount,3);
  await page.getByRole('button',{name:'选择其他游戏',exact:true}).click();await page.getByRole('button',{name:'听伙伴找物',exact:true}).click();await intro();await tap(saved.x+.1,saved.y);assert.equal((await state()).words.goat.comprehension.listen,undefined);await page.getByRole('button',{name:'听伙伴的请求',exact:true}).click();await page.getByRole('status').filter({hasText:'听完了'}).waitFor();await tap(saved.x+.1,saved.y);await page.getByRole('button',{name:'再玩一轮',exact:true}).waitFor();assert.equal((await state()).words.goat.comprehension.listen.count,1);assert.equal((await state()).words.goat.comprehension.listen.last.assisted,true);assert.equal((await state()).words.goat.practiceCount,3);
  await page.reload();await page.waitForFunction(()=>window.worldLearning?.ready);assert.deepEqual(await goat(),saved);assert.equal((await state()).words.goat.practiceCount,3);assert.equal((await state()).words.goat.comprehension.listen.count,1);
  const cdn='https://cdn.keepwork.com/keepwork/cdn/haqi/home/home-goat-figure-6284264883fd.webp';
  const decoded=await page.evaluate(src=>new Promise((resolve,reject)=>{const img=new Image();img.crossOrigin='anonymous';img.onload=()=>{try{const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);resolve({width:img.width,height:img.height,corner:ctx.getImageData(0,0,1,1).data[3]});}catch(e){reject(e);}};img.onerror=reject;img.src=src;}),cdn);assert.deepEqual(decoded,{width:640,height:585,corner:0});
  assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
