import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('listen requests require expression, a request and the correct real object',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:240000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});

 try{for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/home-learning-world.html?listen-request&unlearned`);await page.waitForFunction(()=>window.worldLearning?.ready);
  const state=()=>page.evaluate(()=>worldLearning.learning());
  await page.getByRole('button',{name:'家园设置',exact:true}).click();await page.getByRole('button',{name:'情境练习',exact:true}).click();await page.getByRole('button',{name:'先听清，再找道具',exact:true}).click();
  for(const [i,word] of ['book','ball','cup'].entries()){
   await page.locator('.rpg-dialogue').waitFor();for(let n=0;n<8&&await page.locator('.rpg-dialogue').count();n++)await page.getByRole('button',{name:'我来帮你',exact:true}).click();
   const canvas=await page.locator('.home-canvas').boundingBox();
   const click=async w=>{const [x,y]={book:[2.5,1.25],ball:[.5,1.25],cup:[3.5,.25]}[w];await page.mouse.click(canvas.x+canvas.width/2+x*40,canvas.y+canvas.height/2+y*40);};
   const count=async()=>((await state()).words.listen?.practiceCount||0);
   await click(word);assert.equal(await count(),i,'finding before responding is not practice');
   await page.getByRole('textbox',{name:'输入回答'}).fill(i===1?'Let me listen.':'I can listen.');await page.getByRole('button',{name:'回答',exact:true}).click();
   await page.getByRole('button',{name:'听伙伴的请求',exact:true}).waitFor();await click(word);assert.equal(await count(),i,'answer without hearing or reading does not complete');
   if(i===1)await page.evaluate(()=>worldLearning.failSpeech=true);
   await page.getByRole('button',{name:'听伙伴的请求',exact:true}).click();
   if(i===1){await page.getByRole('status').filter({hasText:'测试语音不可用'}).waitFor();await click(word);assert.equal(await count(),i);await page.getByRole('button',{name:'改读文字请求',exact:true}).click();await page.evaluate(()=>worldLearning.failSpeech=false);}
   else await page.getByRole('status').filter({hasText:'现在找一找'}).waitFor();
   await click(word==='book'?'ball':'book');assert.equal(await count(),i,'wrong object grants nothing');
   await click(word);await page.getByRole('button',{name:'继续故事',exact:true}).waitFor();assert.equal(await count(),i+1);
   assert.equal(await count(),i+1);
   assert.equal((await state()).words.listen.comprehension,undefined,'this is expression practice, not independent listening evidence');
   for(const noun of ['book','ball','cup'])assert.equal((await state()).words[noun].practiceCount,1);
   await page.screenshot({path:path.join(root,`tmp/listen-request-${word}-${width}.png`)});
   await page.getByRole('button',{name:'继续故事',exact:true}).click();
  }
  await page.reload();await page.waitForFunction(()=>window.worldLearning?.ready);assert.equal((await state()).words.listen.practiceCount,3);assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});


