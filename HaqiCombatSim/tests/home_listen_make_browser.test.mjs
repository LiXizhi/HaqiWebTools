import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('listening and reading requests lead to a real drawing and personal name without inventing skill evidence',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:150000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});
 try{for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900},hasTouch:width===390}),page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/home-learning-world.html?listen-make&unlearned`);await page.waitForFunction(()=>window.worldLearning?.ready);
  const state=()=>page.evaluate(()=>worldLearning.learning());
  const paper=()=>page.evaluate(async()=>(await worldLearning.schoolObjects()).paper);
  const intro=async()=>{await page.locator('.rpg-dialogue').waitFor();for(let i=0;i<8&&await page.locator('.rpg-dialogue').count();i++)await page.locator('.rpg-dialogue .dialogue-default').click();};
  const next=async()=>{await page.getByRole('button',{name:'继续故事',exact:true}).click();await intro();};
  const tap=async(x,y)=>{const b=await page.locator('.home-canvas').boundingBox();await page.mouse.click(b.x+b.width/2+x*40+20,b.y+b.height/2+y*40+10);};
  await page.getByRole('button',{name:'家园设置',exact:true}).click();await page.getByRole('button',{name:'情境练习',exact:true}).click();await page.getByRole('button',{name:'听来的小画约定',exact:true}).click();await intro();
  assert.ok(!(await page.locator('.language-practice-modal').textContent()).includes('Find the paper.'));
  await tap(2,1);assert.equal((await state()).words.paper.comprehension,undefined,'selection before hearing cannot complete listening');
  if(width===390){
   await page.evaluate(()=>worldLearning.failSpeech=true);await page.getByRole('button',{name:'听伙伴的请求',exact:true}).click();await page.getByRole('status').filter({hasText:'测试语音不可用'}).waitFor();
   await page.getByRole('button',{name:'改为读线索',exact:true}).click();
  }else{
   await page.getByRole('button',{name:'听伙伴的请求',exact:true}).click();await page.getByRole('status').filter({hasText:'听完了'}).waitFor();
  }
  await tap(2,-1);assert.equal((await state()).words.paper.comprehension,undefined);await tap(2,1);await next();
  const comprehension=(await state()).words.paper.comprehension;
  assert.equal(comprehension[width===390?'read':'listen'].count,1);assert.equal(comprehension[width===390?'listen':'read'],undefined);assert.equal((await state()).words.paper.practiceCount,1);
  await page.getByRole('status').filter({hasText:'Find the pencil.'}).waitFor();await tap(2,1);assert.equal((await state()).words.pencil.comprehension,undefined);await tap(2,-1);await next();
  assert.equal((await state()).words.pencil.comprehension.read.count,1);assert.equal((await state()).words.pencil.practiceCount,1);
  await page.getByRole('textbox',{name:'输入回答'}).fill('I can draw.');await page.getByRole('button',{name:'回答',exact:true}).click();await page.getByRole('button',{name:'开始画画',exact:true}).click();
  const b=await page.getByLabel('画纸',{exact:true}).boundingBox();
  if(width===390){const cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width*.2,y:b.y+b.height*.5}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:b.x+b.width*.7,y:b.y+b.height*.3}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
  else{await page.mouse.move(b.x+b.width*.2,b.y+b.height*.5);await page.mouse.down();await page.mouse.move(b.x+b.width*.7,b.y+b.height*.3,{steps:10});await page.mouse.up();}
  await page.getByRole('button',{name:'保存小画',exact:true}).click();await next();assert.equal((await state()).words.draw.practiceCount,2);const drawing=(await paper()).drawing;assert.ok(drawing.strokes.length);
  await page.getByRole('button',{name:'给物品写标签',exact:true}).click();await page.getByRole('textbox',{name:'作品标签'}).fill('My name is Luna.');await page.getByRole('button',{name:'保存标签',exact:true}).click();await page.getByRole('button',{name:'继续故事',exact:true}).click();await page.getByRole('status').filter({hasText:'按请求找齐了东西'}).waitFor();
  const saved=await state(),art=await paper(),progress=Object.values(saved.homeStories)[0];assert.equal(progress.next,4);assert.equal(progress.objects[0],progress.objects[2]);assert.equal(progress.objects[0],progress.objects[3]);assert.equal(saved.words.name.practiceCount,2);assert.equal(art.label,'My name is Luna.');assert.deepEqual(art.drawing,drawing);
  await page.screenshot({path:path.join(root,`tmp/home-listen-make-${width}.png`)});await page.reload();await page.waitForFunction(()=>window.worldLearning?.ready);assert.deepEqual(await paper(),art);assert.deepEqual((await state()).homeStories,saved.homeStories);assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
