import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('a child places the same ball behind a chair and beside it, with real geometry and saved story progress',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:90000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});
 const url=`http://127.0.0.1:${server.address().port}`;
 try{for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'/tests/fixtures/home-learning-world.html?place');await page.waitForFunction(()=>window.worldLearning?.ready);
  const state=()=>page.evaluate(()=>worldLearning.learning());
  const open=async()=>{await page.getByRole('button',{name:'家园设置',exact:true}).click();await page.getByRole('button',{name:'情境练习',exact:true}).click();await page.getByRole('button',{name:'椅子后面的球',exact:true}).click();};
  const intro=async()=>{await page.locator('.rpg-dialogue').waitFor();for(let i=0;i<8&&await page.locator('.rpg-dialogue').count();i++)await page.getByRole('button',{name:'我来帮你',exact:true}).click();};
  const answer=async text=>{await page.getByRole('textbox',{name:'输入回答'}).fill(text);await page.getByRole('button',{name:'回答',exact:true}).click();};
  const canvas=await page.locator('.home-canvas').boundingBox(),point=(x,y)=>({x:canvas.x+canvas.width/2+x*40+20,y:canvas.y+canvas.height/2+y*40+10});
  const drag=async(a,b)=>{await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:12});await page.mouse.up();};
  await open();await intro();await answer('A ball.');await page.mouse.click(point(2,1).x,point(2,1).y);await page.getByRole('button',{name:'继续故事',exact:true}).click();await intro();
  await answer('Behind the chair.');await page.getByRole('button',{name:'开始摆放',exact:true}).click();await drag(point(2,1),point(0,3));await page.getByRole('status').filter({hasText:'位置还不符合'}).waitFor();assert.equal((await state()).words.behind?.practiceCount||0,0);
  await drag(point(0,3),point(0,-2));await page.screenshot({path:path.join(root,`tmp/home-behind-attempt-${width}.png`)});await page.getByRole('button',{name:'继续故事',exact:true}).waitFor();assert.equal((await state()).words.behind.practiceCount,1);const hidden=await page.evaluate(()=>worldLearning.placedBall());assert.equal(hidden.y,-2);assert.equal(hidden.x,0);await page.screenshot({path:path.join(root,`tmp/home-behind-placed-${width}.png`)});
  await page.reload();await page.waitForFunction(()=>window.worldLearning?.ready);assert.deepEqual(await page.evaluate(()=>worldLearning.placedBall()),hidden);await open();await intro();await answer('Next to the chair.');await page.getByRole('button',{name:'开始摆放',exact:true}).click();await drag(point(0,-2),point(-1.5,1));await page.getByRole('button',{name:'继续故事',exact:true}).click();await page.getByRole('status').filter({hasText:'你选好的球先到了椅子后方'}).waitFor();assert.equal((await state()).words.behind.practiceCount,1);assert.equal((await state()).words['next to'].practiceCount,1);assert.equal(Object.values((await state()).homeStories)[0].next,3);await page.screenshot({path:path.join(root,`tmp/home-behind-finish-${width}.png`)});assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
