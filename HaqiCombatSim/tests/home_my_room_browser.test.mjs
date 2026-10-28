import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('my room story saves an actual room arrangement, original drawing and title',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:90000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});


 try{for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/home-learning-world.html?in-room&my-room&unlearned`);await page.waitForFunction(()=>window.worldLearning?.ready);
  const state=()=>page.evaluate(()=>worldLearning.learning()),paper=()=>page.evaluate(async()=>(await worldLearning.schoolObjects()).paper);
  const intro=async()=>{await page.locator('.rpg-dialogue').waitFor();for(let n=0;n<8&&await page.locator('.rpg-dialogue').count();n++)await page.getByRole('button',{name:'我来帮你',exact:true}).click();};
  const answer=async text=>{await page.getByRole('textbox',{name:'输入回答'}).fill(text);await page.getByRole('button',{name:'回答',exact:true}).click();};
  await page.getByRole('button',{name:'家园设置',exact:true}).click();await page.getByRole('button',{name:'情境练习',exact:true}).click();await page.getByRole('button',{name:'这是我的房间',exact:true}).click();await intro();await answer('In my room.');
  await page.getByRole('button',{name:'开始摆放',exact:true}).click();assert.equal((await state()).words.room?.practiceCount||0,0);
  const canvas=await page.locator('.home-canvas').boundingBox(),point=(x,y)=>({x:canvas.x+canvas.width/2+x*40+20,y:canvas.y+canvas.height/2+y*40+10}),from=point(2,1),to=point(-1,-3);
  await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:12});await page.mouse.up();await page.getByRole('button',{name:'继续故事',exact:true}).click();assert.equal((await state()).words.room.practiceCount,1);
  await intro();await answer('I can draw.');await page.getByRole('button',{name:'开始画画',exact:true}).click();const b=await page.getByLabel('画纸',{exact:true}).boundingBox();
  await page.mouse.move(b.x+b.width*.2,b.y+b.height*.7);await page.mouse.down();await page.mouse.move(b.x+b.width*.2,b.y+b.height*.2,{steps:10});await page.mouse.move(b.x+b.width*.8,b.y+b.height*.2,{steps:10});await page.mouse.move(b.x+b.width*.8,b.y+b.height*.7,{steps:10});await page.mouse.up();await page.getByRole('button',{name:'保存小画',exact:true}).click();
  const drawing=(await paper()).drawing;assert.ok(drawing.strokes.length);await page.getByRole('button',{name:'继续故事',exact:true}).click();await intro();
  await page.getByRole('button',{name:'给物品写标签',exact:true}).click();await page.getByRole('textbox',{name:'作品标签'}).fill('A book.');await page.getByRole('button',{name:'保存标签',exact:true}).click();assert.equal((await state()).words.room.practiceCount,1);
  await page.getByRole('button',{name:'给物品写标签',exact:true}).click();await page.getByRole('textbox',{name:'作品标签'}).fill('This is my room.');await page.screenshot({path:path.join(root,`tmp/home-my-room-writing-${width}.png`)});await page.getByRole('button',{name:'保存标签',exact:true}).click();await page.getByRole('button',{name:'继续故事',exact:true}).click();
  await page.getByRole('status').filter({hasText:'布置和作品都留在家园'}).waitFor();assert.equal((await state()).words.room.practiceCount,2);assert.equal((await state()).words.in.practiceCount,1);assert.equal((await state()).words.draw.practiceCount,2);assert.equal((await state()).words.book.practiceCount,1);assert.deepEqual((await paper()).drawing,drawing);
  await page.screenshot({path:path.join(root,`tmp/home-my-room-finish-${width}.png`)});await page.reload();await page.waitForFunction(()=>window.worldLearning?.ready);assert.equal((await state()).words.room.practiceCount,2);assert.equal((await paper()).label,'This is my room.');assert.deepEqual((await paper()).drawing,drawing);assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
