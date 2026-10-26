import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('reading corner story resumes and completes through real finding placement and label saving',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:150000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});
 const url=`http://127.0.0.1:${server.address().port}`;
 try{for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const urlPath=url+'/tests/fixtures/home-learning-world.html?table';
  await page.goto(urlPath);await page.waitForFunction(()=>window.worldLearning?.ready);
  const intro=async()=>{await page.locator('.rpg-dialogue').waitFor();for(let i=0;i<8&&await page.locator('.rpg-dialogue').count();i++)await page.getByRole('button',{name:'我来帮你',exact:true}).click();};
  const openStory=async()=>{await page.getByRole('button',{name:'家园设置',exact:true}).click();await page.getByRole('button',{name:'情境练习',exact:true}).click();await page.getByRole('button',{name:'我们的小小阅读角',exact:true}).click();};
  const answer=async(text)=>{await page.getByRole('textbox',{name:'输入回答'}).fill(text);await page.getByRole('button',{name:'回答',exact:true}).click();};
  const progress=async()=>Object.values((await page.evaluate(()=>worldLearning.learning())).homeStories||{})[0]?.next||0;
  await openStory();await intro();await answer('A book.');
  let canvas=await page.locator('.home-canvas').boundingBox();const point=(x,y)=>({x:canvas.x+canvas.width/2+x*40+20,y:canvas.y+canvas.height/2+y*40+10});
  const tap=async(x,y)=>{const p=point(x,y);await page.mouse.click(p.x,p.y);};
  await tap(3,0);await page.getByRole('button',{name:'继续故事',exact:true}).waitFor();assert.equal(await progress(),1);
  await page.reload();await page.waitForFunction(()=>window.worldLearning?.ready);canvas=await page.locator('.home-canvas').boundingBox();await openStory();await intro();await answer('A table.');await tap(1,1.5);
  await page.getByRole('button',{name:'继续故事',exact:true}).waitFor();assert.equal(await progress(),2);await page.getByRole('button',{name:'继续故事',exact:true}).click();await intro();await answer('On the table.');await page.getByRole('button',{name:'开始摆放',exact:true}).click();
  const a=point(3,0),b=point(1,1.5);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:12});await page.mouse.up();
  await page.getByRole('button',{name:'继续故事',exact:true}).waitFor();assert.equal(await progress(),3);assert.equal((await page.evaluate(()=>worldLearning.placedBook())).parentId,'table');
  await page.getByRole('button',{name:'继续故事',exact:true}).click();await intro();await page.getByRole('button',{name:'给物品写标签',exact:true}).click();await page.getByRole('textbox',{name:'作品标签'}).fill('Our book.');await page.getByRole('button',{name:'保存标签',exact:true}).click();
  await page.getByRole('button',{name:'继续故事',exact:true}).waitFor();assert.equal(await progress(),4);assert.equal(await page.evaluate(()=>worldLearning.label()),'Our book.');
  await page.getByRole('button',{name:'继续故事',exact:true}).click();await page.getByRole('status').filter({hasText:'这个角落是你和伙伴一起准备的'}).waitFor();
  await page.screenshot({path:path.join(root,`tmp/home-reading-corner-${width}.png`)});
  await page.reload();await page.waitForFunction(()=>window.worldLearning?.ready);await openStory();await page.getByRole('status').filter({hasText:'这个角落是你和伙伴一起准备的'}).waitFor();assert.equal(await progress(),4);
  assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
