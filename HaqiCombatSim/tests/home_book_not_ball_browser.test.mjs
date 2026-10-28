import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('a child can disagree, agree and actually read with the same partner',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:90000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});


 try{for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/home-learning-world.html?talk-story&name-story&taking-turns&unlearned`);await page.waitForFunction(()=>window.worldLearning?.ready);
  const state=()=>page.evaluate(()=>worldLearning.learning()),intro=async()=>{await page.locator('.rpg-dialogue').waitFor();for(let n=0;n<10&&await page.locator('.rpg-dialogue').count();n++)await page.locator('.rpg-dialogue .dialogue-default').click();};
  const answer=async text=>{await page.getByRole('textbox',{name:'输入回答'}).fill(text);await page.getByRole('button',{name:'回答',exact:true}).click();};
  const open=async()=>{if(!await page.getByRole('button',{name:'情境练习',exact:true}).isVisible())await page.getByRole('button',{name:'家园设置',exact:true}).click();await page.getByRole('button',{name:'情境练习',exact:true}).click();await page.getByRole('button',{name:'书能当球吗？',exact:true}).click();await intro();};
  await open();await answer('A bad idea.');assert.equal((await state()).words.bad?.practiceCount||0,0);await page.getByRole('button',{name:'听伙伴的回应',exact:true}).click();await page.locator('.rpg-dialogue').waitFor();assert.equal((await state()).words.bad?.practiceCount||0,0);
  await page.getByRole('button',{name:'关闭',exact:true}).click();assert.equal((await state()).words.bad?.practiceCount||0,0);
  await open();await answer('A bad idea.');await page.getByRole('button',{name:'听伙伴的回应',exact:true}).click();await page.locator('.rpg-dialogue').waitFor();
  await page.evaluate(()=>{worldLearning.context.save.languageLearning.target='ja';for(let i=0;i<6;i++){const button=document.querySelector('.rpg-dialogue .dialogue-default');if(!button)break;button.click();}});
  assert.equal((await state()).words.bad?.practiceCount||0,0,'a reply from the old target language cannot count');await page.evaluate(()=>worldLearning.context.save.languageLearning.target='en');
  await open();
  for(const [i,word] of ['bad','good'].entries()){
   if(i)await intro();await answer(i?'A good idea.':'That is a bad idea.');
   const c=await page.locator('.home-canvas').boundingBox();await page.mouse.click(c.x+c.width/2-80,c.y+c.height/2+15);
   await page.locator('.rpg-dialogue').waitFor();assert.equal((await state()).words[word]?.practiceCount||0,0);
   await page.waitForFunction(()=>!document.querySelector('.rpg-dialogue.is-speaking'));await page.screenshot({path:path.join(root,`tmp/home-book-not-ball-${word}-${width}.png`)});await intro();
   await page.getByRole('button',{name:'继续故事',exact:true}).waitFor();assert.equal((await state()).words[word].practiceCount,1);assert.equal((await state()).words[word].comprehension,undefined);await page.getByRole('button',{name:'继续故事',exact:true}).click();
  }
  await intro();await answer("Let's read.");
  await page.getByRole('button',{name:'检查并保存练习',exact:true}).click();assert.equal((await state()).words.read.practiceCount,1,'answer alone cannot substitute for reading activity');
  const c=await page.locator('.home-canvas').boundingBox(),pet=await page.evaluate(()=>worldLearning.petPosition());
  await page.mouse.move(c.x+c.width/2+pet.x*40,c.y+c.height/2+pet.y*40-25);await page.mouse.down();await page.mouse.move(c.x+c.width/2+20,c.y+c.height/2+100-25,{steps:12});await page.mouse.up();
  await page.getByRole('button',{name:'继续故事',exact:true}).click();await page.getByRole('status').filter({hasText:'书里的冒险才刚刚开始'}).waitFor();
  assert.equal((await state()).words.read.practiceCount,2);assert.equal((await state()).words.book.practiceCount,1);assert.equal((await state()).words.idea?.practiceCount||0,0);
  await page.screenshot({path:path.join(root,`tmp/home-book-not-ball-finish-${width}.png`)});
  await page.reload();await page.waitForFunction(()=>window.worldLearning?.ready);assert.equal((await state()).words.bad.practiceCount,1);assert.equal((await state()).words.good.practiceCount,1);assert.equal((await state()).words.read.practiceCount,2);assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
