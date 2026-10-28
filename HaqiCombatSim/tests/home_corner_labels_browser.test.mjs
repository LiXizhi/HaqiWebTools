import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('corner introductions bind three chosen objects to saved labels and resume without extra practice',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:150000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});
 try{for(const width of [1280,390]){
 const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/home-learning-world.html?corner-labels&unlearned`);await page.waitForFunction(()=>window.worldLearning?.ready);
 const state=()=>page.evaluate(()=>worldLearning.learning()),props=()=>page.evaluate(()=>worldLearning.cornerObjects());
 const intro=async()=>{await page.locator('.rpg-dialogue').waitFor();for(let i=0;i<8&&await page.locator('.rpg-dialogue').count();i++)await page.locator('.rpg-dialogue .dialogue-default').click();};
 const open=async()=>{await page.getByRole('button',{name:'家园设置',exact:true}).click();await page.getByRole('button',{name:'情境练习',exact:true}).click();await page.getByRole('button',{name:'我的角落小介绍',exact:true}).click();await intro();};
 const next=async()=>{await page.getByRole('button',{name:'继续故事',exact:true}).click();await intro();};
 const tap=async(x,y)=>{const b=await page.locator('.home-canvas').boundingBox();await page.mouse.click(b.x+b.width/2+x*40+20,b.y+b.height/2+y*40+10);};
 const label=async text=>{await page.getByRole('button',{name:'给物品写标签',exact:true}).click();await page.getByRole('textbox',{name:'作品标签'}).fill(text);await page.getByRole('button',{name:'保存标签',exact:true}).click();};
 await open();
 for(const [i,[word,x,y]] of [['clock',2,1],['lamp',2,-.5],['chair',0,.5]].entries()){
  const mode=i===0?'listen':'read';
  if(i===0){await page.getByRole('button',{name:'听伙伴的请求',exact:true}).click();await page.getByRole('status').filter({hasText:'听完了'}).waitFor();}
  else await page.getByRole('status').filter({hasText:`Find the ${word}.`}).waitFor();
  await tap(x,y);await page.screenshot({path:path.join(root,`tmp/home-corner-labels-pick-${word}-${width}.png`)});await next();assert.equal((await state()).words[word].comprehension[mode].count,1);assert.equal((await state()).words[word].practiceCount,1);
  await label('My book.');assert.equal((await state()).words[word].practiceCount,1);
  const text=`${width===390?'Our':'My'} ${word}.`;await label(text);await page.getByRole('button',{name:'继续故事',exact:true}).waitFor();assert.equal((await props())[word].label,text);assert.equal((await state()).words[word].practiceCount,2);
  if(i===0){const saved=await state();await page.reload();await page.waitForFunction(()=>window.worldLearning?.ready);assert.deepEqual((await state()).homeStories,saved.homeStories);await open();}
  else if(i<2)await next();
 }
 await page.getByRole('button',{name:'继续故事',exact:true}).click();await page.getByRole('status').filter({hasText:'都有了你写的介绍'}).waitFor();
 const saved=await state(),objects=await props(),progress=Object.values(saved.homeStories)[0];assert.equal(progress.next,6);for(const i of [0,2,4])assert.equal(progress.objects[i],progress.objects[i+1]);
 await page.screenshot({path:path.join(root,`tmp/home-corner-labels-${width}.png`)});await page.reload();await page.waitForFunction(()=>window.worldLearning?.ready);assert.deepEqual(await props(),objects);assert.equal(await page.evaluate(()=>worldLearning.cornerObjectCopies('lamp')),1);assert.deepEqual((await state()).homeStories,saved.homeStories);for(const word of ['clock','lamp','chair'])assert.equal((await state()).words[word].practiceCount,2);assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
