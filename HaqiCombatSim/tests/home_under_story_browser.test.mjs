import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('under-table story uses a distinct ground placement and persists the original book and label',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:150000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});
 try{for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  try{
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/home-learning-world.html?table&unlearned`);await page.waitForFunction(()=>window.worldLearning?.ready);
  const state=()=>page.evaluate(()=>worldLearning.learning());
  const open=async()=>{await page.getByRole('button',{name:'家园设置',exact:true}).click();await page.getByRole('button',{name:'情境练习',exact:true}).click();await page.getByRole('button',{name:'桌子下面的书',exact:true}).click();};
  const intro=async()=>{await page.locator('.rpg-dialogue').waitFor();for(let i=0;i<8&&await page.locator('.rpg-dialogue').count();i++)await page.getByRole('button',{name:'我来帮你',exact:true}).click();};
  const answer=async text=>{await page.getByRole('textbox',{name:'输入回答'}).fill(text);await page.getByRole('button',{name:'回答',exact:true}).click();};
  const canvas=await page.locator('.home-canvas').boundingBox(),point=(x,y)=>({x:canvas.x+canvas.width/2+x*40,y:canvas.y+canvas.height/2+y*40}),pick=async(x,y)=>{const p=point(x,y);await page.mouse.click(p.x,p.y);};
  const drag=async(a,b)=>{await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:12});await page.mouse.up();};
  await open();await intro();await answer('A table.');await pick(1.5,1);await page.getByRole('button',{name:'继续故事',exact:true}).click();await intro();await answer('A book.');await pick(3.5,.25);await page.getByRole('button',{name:'继续故事',exact:true}).click();await intro();await answer('On the table.');assert.equal((await state()).words.under?.practiceCount||0,0);await answer('Under the table.');await page.getByRole('button',{name:'开始摆放',exact:true}).click();
  await drag(point(3.5,.25),point(3.5,1.25));assert.equal((await state()).words.under?.practiceCount||0,0);await drag(point(3.5,.25),point(1.5,1.75));await page.getByRole('button',{name:'继续故事',exact:true}).waitFor();
  const book=await page.evaluate(()=>worldLearning.placedBook());assert.equal(book.parentId,'table');assert.equal(book.underTable,true);await page.screenshot({path:path.join(root,`tmp/home-under-placed-${width}.png`)});
  await page.reload();await page.waitForFunction(()=>window.worldLearning?.ready);assert.deepEqual(await page.evaluate(()=>worldLearning.placedBook()),book);await open();await intro();await page.getByRole('button',{name:'给物品写标签',exact:true}).click();await page.getByRole('textbox',{name:'作品标签'}).fill('My book.');await page.getByRole('button',{name:'保存标签',exact:true}).click();await page.getByRole('button',{name:'继续故事',exact:true}).click();await page.getByRole('status').filter({hasText:'你把同一本书放到桌下'}).waitFor();assert.equal((await state()).words.under.practiceCount,1);assert.equal(await page.evaluate(()=>worldLearning.label()),'My book.');await page.screenshot({path:path.join(root,`tmp/home-under-finish-${width}.png`)});await page.keyboard.press('Escape');await pick(1.5,2.1);await page.getByRole('button',{name:'退出桌下放置',exact:true}).click();await drag(point(1.5,2.1),point(3.5,3.6));await page.waitForFunction(async()=>{const o=await worldLearning.placedBook();return o.underTable===false&&!o.parentId;});assert.equal((await page.evaluate(()=>worldLearning.placedBook())).underTable,false);assert.equal((await state()).words.under.practiceCount,1);assert.deepEqual(errors,[]);
  }catch(e){await page.screenshot({path:path.join(root,`tmp/home-under-failure-${width}.png`)});throw e;}finally{await context.close();}
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
