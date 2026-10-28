import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('old story becomes a new saved drawing and title after actual partner exchanges',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:90000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});


 try{for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/home-learning-world.html?talk-story&name-story&taking-turns&my-room&unlearned`);await page.waitForFunction(()=>window.worldLearning?.ready);
  const state=()=>page.evaluate(()=>worldLearning.learning()),paper=()=>page.evaluate(async()=>(await worldLearning.schoolObjects()).paper);
  const intro=async()=>{await page.locator('.rpg-dialogue').waitFor();for(let n=0;n<8&&await page.locator('.rpg-dialogue').count();n++)await page.locator('.rpg-dialogue .dialogue-default').click();};
  const answer=async text=>{await page.getByRole('textbox',{name:'输入回答'}).fill(text);await page.getByRole('button',{name:'回答',exact:true}).click();};
  await page.getByRole('button',{name:'家园设置',exact:true}).click();await page.getByRole('button',{name:'情境练习',exact:true}).click();await page.getByRole('button',{name:'旧故事，新开头',exact:true}).click();
  await intro();await answer('An old story, please.');assert.equal((await state()).words.old?.practiceCount||0,0);
  await page.getByRole('button',{name:'听伙伴的回应',exact:true}).click();await intro();await page.getByRole('button',{name:'继续故事',exact:true}).click();assert.equal((await state()).words.old.practiceCount,1);
  await intro();await answer("Let's read.");await page.getByRole('button',{name:'检查并保存练习',exact:true}).click();assert.equal((await state()).words.read.practiceCount,1);
  const c=await page.locator('.home-canvas').boundingBox(),pet=await page.evaluate(()=>worldLearning.petPosition());
  await page.mouse.move(c.x+c.width/2+pet.x*40,c.y+c.height/2+pet.y*40-25);await page.mouse.down();await page.mouse.move(c.x+c.width/2+20,c.y+c.height/2+100-25,{steps:12});await page.mouse.up();
  await page.getByRole('button',{name:'继续故事',exact:true}).click();await intro();await answer('A new story, please.');assert.equal((await state()).words.new?.practiceCount||0,0);
  await page.getByRole('button',{name:'听伙伴的回应',exact:true}).click();await intro();await page.getByRole('button',{name:'继续故事',exact:true}).click();assert.equal((await state()).words.new.practiceCount,1);
  await intro();await answer('I can draw.');await page.getByRole('button',{name:'开始画画',exact:true}).click();const b=await page.getByLabel('画纸',{exact:true}).boundingBox();
  await page.mouse.move(b.x+b.width*.2,b.y+b.height*.7);await page.mouse.down();await page.mouse.move(b.x+b.width*.2,b.y+b.height*.2,{steps:10});await page.mouse.move(b.x+b.width*.8,b.y+b.height*.2,{steps:10});await page.mouse.move(b.x+b.width*.8,b.y+b.height*.7,{steps:10});await page.mouse.up();await page.getByRole('button',{name:'保存小画',exact:true}).click();
  const drawing=(await paper()).drawing;assert.ok(drawing.strokes.length);await page.getByRole('button',{name:'继续故事',exact:true}).click();await intro();
  await page.getByRole('button',{name:'给物品写标签',exact:true}).click();await page.getByRole('textbox',{name:'作品标签'}).fill('A book.');await page.getByRole('button',{name:'保存标签',exact:true}).click();assert.equal((await state()).words.new.practiceCount,1);
  await page.getByRole('button',{name:'给物品写标签',exact:true}).click();await page.getByRole('textbox',{name:'作品标签'}).fill('My new story.');await page.screenshot({path:path.join(root,`tmp/home-old-new-writing-${width}.png`)});await page.getByRole('button',{name:'保存标签',exact:true}).click();await page.getByRole('button',{name:'继续故事',exact:true}).click();
  await page.getByRole('status').filter({hasText:'画和标题留在家园'}).waitFor();assert.equal((await state()).words.new.practiceCount,2);assert.equal((await state()).words.old.practiceCount,1);assert.equal((await state()).words.read.practiceCount,2);assert.equal((await state()).words.draw.practiceCount,2);assert.equal((await state()).words.book.practiceCount,1);assert.deepEqual((await paper()).drawing,drawing);
  await page.screenshot({path:path.join(root,`tmp/home-old-new-finish-${width}.png`)});await page.reload();await page.waitForFunction(()=>window.worldLearning?.ready);assert.equal((await state()).words.new.practiceCount,2);assert.equal((await paper()).label,'My new story.');assert.deepEqual((await paper()).drawing,drawing);assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
