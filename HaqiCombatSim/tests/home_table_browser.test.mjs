import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('tabletop requests require real surface placement and preserve the child layout',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:90000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});
 const url=`http://127.0.0.1:${server.address().port}`;
 try{for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'/tests/fixtures/home-learning-world.html?table');await page.waitForFunction(()=>window.worldLearning?.ready);
  await page.getByRole('button',{name:'家园设置',exact:true}).click();await page.getByRole('button',{name:'情境练习',exact:true}).click();await page.getByRole('button',{name:'按线索布置',exact:true}).click();
  await page.locator('.rpg-dialogue').waitFor();assert.match(await page.locator('.dialogue-text').textContent(),/on/);
  for(let i=0;i<8&&await page.locator('.rpg-dialogue').count();i++)await page.getByRole('button',{name:'我来帮你',exact:true}).click();
  const input=page.getByRole('textbox',{name:'输入回答'});await input.fill('Under the table.');await page.getByRole('button',{name:'回答',exact:true}).click();await page.getByRole('status').filter({hasText:'请完成本轮表达'}).waitFor();
  await input.fill('On the table.');await page.getByRole('button',{name:'回答',exact:true}).click();await page.getByRole('button',{name:'开始摆放',exact:true}).click();
  assert.equal((await page.evaluate(()=>worldLearning.learning())).words.on.practiceCount||0,1);
  const canvas=await page.locator('.home-canvas').boundingBox(),point=(x,y)=>({x:canvas.x+canvas.width/2+x*40+20,y:canvas.y+canvas.height/2+y*40+10});
  const drag=async(a,b)=>{await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:12});await page.mouse.up();};
  await page.screenshot({path:path.join(root,`tmp/home-table-before-${width}.png`)});
  await drag(point(3,0),point(3,1));await page.screenshot({path:path.join(root,`tmp/home-table-drag-${width}.png`)});await page.getByRole('status').filter({hasText:'位置还不符合'}).waitFor({timeout:5000});
  assert.equal((await page.evaluate(()=>worldLearning.learning())).words.on.practiceCount||0,1);
  await page.screenshot({path:path.join(root,`tmp/home-table-request-${width}.png`)});
  await drag(point(3,1),point(1,1.5));await page.getByRole('button',{name:'再玩一轮',exact:true}).waitFor();
  assert.match(await page.getByRole('status').textContent(),/Thank you. The book is on the table/);
  const state=await page.evaluate(()=>worldLearning.learning());assert.equal(state.words.on.practiceCount,2);assert.equal(state.words.on.homeReview.modes.place,1);assert.equal(state.words.book.practiceCount,1);assert.equal(state.words.table.practiceCount,1);
  const placed=await page.evaluate(()=>worldLearning.placedBook());assert.equal(placed.parentId,'table');
  await page.reload();await page.waitForFunction(()=>window.worldLearning?.ready);assert.equal((await page.evaluate(()=>worldLearning.learning())).words.on.practiceCount,2);assert.deepEqual(await page.evaluate(()=>worldLearning.placedBook()),placed);
  // Grab the rendered (elevated) book after reload, not its old ground position.
  await page.getByRole('button',{name:'建造',exact:true}).click();
  const visual=await page.evaluate(async()=>{
   const {homeObjectSurfaceLift,homeObjectVisualBounds}=await import('/js/view_home_art.js');
   const {footprint}=await import('/js/home_core.js');
   const {items}=await (await fetch('/data/adventure/home/catalog.json')).json();
   const book=await worldLearning.placedBook(),table={id:'table',itemId:'table',x:0,y:1};
   const lift=homeObjectSurfaceLift(book,new Map([['table',table]]),items),b=footprint(book,items);
   return homeObjectVisualBounds(items.find(i=>i.id==='book'),book,book.x*40,(book.y-lift)*40,b.w*40,b.h*40);
  });
  const activeCanvas=await page.locator(".home-canvas").boundingBox();
  const grab={x:activeCanvas.x+activeCanvas.width/2+visual.x+visual.w/2,y:activeCanvas.y+activeCanvas.height/2+visual.y+visual.h/2};
  await drag(grab,{x:grab.x+10,y:grab.y});
  await page.screenshot({path:path.join(root,`tmp/home-table-drag-debug-${width}.png`)});
  await page.waitForFunction(async x=>(await worldLearning.placedBook())?.x===x,placed.x+.25);
  assert.equal((await page.evaluate(()=>worldLearning.placedBook())).parentId,'table');
  await page.screenshot({path:path.join(root,`tmp/home-table-surface-${width}.png`)});

  assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
