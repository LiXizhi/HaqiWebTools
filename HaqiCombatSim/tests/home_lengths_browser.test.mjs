import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('length comparison uses rendered pencil and pen lengths and preserves practice without awarding other words',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:240000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});
 const url=`http://127.0.0.1:${server.address().port}`;
 try{for(const width of [1280,390])for(const word of ['long','short'])for(const item of ['pencil','pen']){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const entry=word;
  const intro=async()=>{await page.locator('.rpg-dialogue').waitFor();for(let i=0;i<8&&await page.locator('.rpg-dialogue').count();i++)await page.getByRole('button',{name:'我来帮你',exact:true}).click();};
  await page.goto(url+'/tests/fixtures/home-learning-world.html?compare='+word+'&length-item='+item);await page.waitForFunction(()=>window.worldLearning?.ready);
  await page.getByRole('button',{name:'家园设置',exact:true}).click();await page.getByRole('button',{name:'情境练习',exact:true}).click();await page.getByRole('button',{name:'找物游戏',exact:true}).click();await intro();
  const input=page.getByRole('textbox',{name:'输入回答'});await input.fill('The '+word+' '+item+'.');await page.getByRole('button',{name:'回答',exact:true}).click();
  const canvas=await page.locator('.home-canvas').boundingBox();
  const points=await page.evaluate(async()=>{
   const {homeObjectVisualBounds}=await import('/js/view_home_art.js'),{footprint}=await import('/js/home_core.js');
   const {items}=await (await fetch('/data/adventure/home/catalog.json')).json(),objects=await worldLearning.schoolObjects();
   return Object.fromEntries(Object.values(objects).filter(o=>o.itemId).map(o=>{const b=footprint(o,items),v=homeObjectVisualBounds(items.find(i=>i.id===o.itemId),o,o.x*40,o.y*40,b.w*40,b.h*40);return [o.id,{x:v.x+v.w/2,y:v.y+v.h/2}];}));
  });
  const tap=async(x,y)=>{const p=points[x===0?'book':x===2?'book2':'book3'];await page.mouse.click(canvas.x+canvas.width/2+p.x,canvas.y+canvas.height/2+p.y);};
  await tap(0,1);await page.getByRole('status').filter({hasText:'再比较一下'}).waitFor();
  await tap(...(word==='long'?[3,0]:[2,1]));assert.equal((await page.evaluate(()=>worldLearning.learning())).words[entry].practiceCount,1);
  await page.screenshot({path:path.join(root,`tmp/home-length-${word}-${item}-${width}.png`)});
  await tap(...(word==='long'?[2,1]:[3,0]));await page.getByRole('button',{name:'再玩一轮',exact:true}).waitFor();
  const state=await page.evaluate(()=>worldLearning.learning());assert.equal(state.words[entry].practiceCount,2);assert.equal(state.words[item].practiceCount,1);
  await page.reload();await page.waitForFunction(()=>window.worldLearning?.ready);assert.equal((await page.evaluate(()=>worldLearning.learning())).words[entry].practiceCount,2);
  assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
