import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('a child writes a chosen nickname and the resumed story uses that saved book label',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:150000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});
 const url=`http://127.0.0.1:${server.address().port}`;
 try{for(const [width,nickname] of [[1280,'Luna'],[390,'Jo-Jo']]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'/tests/fixtures/home-learning-world.html?name-story');await page.waitForFunction(()=>window.worldLearning?.ready);
  const intro=async()=>{await page.locator('.rpg-dialogue').waitFor();for(let i=0;i<8&&await page.locator('.rpg-dialogue').count();i++)await page.getByRole('button',{name:'我来帮你',exact:true}).click();};
  const openStory=async()=>{await page.getByRole('button',{name:'家园设置',exact:true}).click();await page.getByRole('button',{name:'情境练习',exact:true}).click();await page.getByRole('button',{name:'留在书上的小名字',exact:true}).click();};
  const answer=async text=>{await page.getByRole('textbox',{name:'输入回答'}).fill(text);await page.getByRole('button',{name:'回答',exact:true}).click();};
  const label=async text=>{await page.getByRole('button',{name:'给物品写标签',exact:true}).click();await page.getByRole('textbox',{name:'作品标签'}).fill(text);await page.getByRole('button',{name:'保存标签',exact:true}).click();};
  const state=()=>page.evaluate(()=>worldLearning.learning());
  await openStory();await intro();await answer('A book.');
  let box=await page.locator('.home-canvas').boundingBox();const point=(x,y)=>({x:box.x+box.width/2+x*40,y:box.y+box.height/2+y*40});
  const book=point(2.5,1.25);await page.mouse.click(book.x,book.y);await page.getByRole('button',{name:'继续故事',exact:true}).click();await intro();
  assert.equal((await state()).words.name?.practiceCount||0,0);
  await label('My book.');assert.equal(await page.evaluate(()=>worldLearning.label()),'My book.');assert.equal((await state()).words.name?.practiceCount||0,0);
  await label('My name is '+nickname+'.');await page.getByRole('button',{name:'继续故事',exact:true}).waitFor();assert.equal((await state()).words.name.practiceCount,1);
  await page.reload();await page.waitForFunction(()=>window.worldLearning?.ready);assert.equal(await page.evaluate(()=>worldLearning.label()),'My name is '+nickname+'.');
  box=await page.locator('.home-canvas').boundingBox();await openStory();await intro();
  await answer('My name is Pip.');assert.equal((await state()).words.name.practiceCount,1);await page.getByRole('textbox',{name:'输入回答'}).waitFor();
  await answer('My name is '+nickname+'.');await page.getByRole('button',{name:'检查并保存练习',exact:true}).click();assert.equal((await state()).words.name.practiceCount,1);
  const pet=await page.evaluate(()=>worldLearning.petPosition()),a=point(pet.x,pet.y),b=point(2.5,1.5);await page.mouse.move(a.x,a.y-25);await page.mouse.down();await page.mouse.move(b.x,b.y-25,{steps:12});await page.mouse.up();
  await page.getByRole('button',{name:'继续故事',exact:true}).waitFor();assert.equal((await state()).words.name.practiceCount,2);assert.equal((await state()).words.name.homeReview.supportCounts.assisted,2);assert.equal((await state()).words.name.homeReview.lastEvidence.attempts,2);await page.getByRole('button',{name:'继续故事',exact:true}).click();await page.getByRole('status').filter({hasText:'这个故事角有了属于你的印记'}).waitFor();
  await page.screenshot({path:path.join(root,`tmp/home-name-${width}.png`)});assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
