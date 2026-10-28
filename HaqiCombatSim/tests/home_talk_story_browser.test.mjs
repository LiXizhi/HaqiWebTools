import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('partner replies are required for talk evidence and cancellation does not count',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:90000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});


 try{for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/home-learning-world.html?talk-story&unlearned`);await page.waitForFunction(()=>window.worldLearning?.ready);
  const state=()=>page.evaluate(()=>worldLearning.learning()),intro=async()=>{await page.locator('.rpg-dialogue').waitFor();for(let n=0;n<10&&await page.locator('.rpg-dialogue').count();n++)await page.locator('.rpg-dialogue .dialogue-default').click();};
  const answer=async text=>{await page.getByRole('textbox',{name:'输入回答'}).fill(text);await page.getByRole('button',{name:'回答',exact:true}).click();};
  const open=async()=>{if(!await page.getByRole('button',{name:'情境练习',exact:true}).isVisible())await page.getByRole('button',{name:'家园设置',exact:true}).click();await page.getByRole('button',{name:'情境练习',exact:true}).click();await page.getByRole('button',{name:'我的第一个故事开场',exact:true}).click();await intro();};
  await open();await answer('Can I speak?');assert.equal((await state()).words.speak?.practiceCount||0,0);await page.getByRole('button',{name:'听伙伴的回应',exact:true}).click();await page.locator('.rpg-dialogue').waitFor();assert.equal((await state()).words.speak?.practiceCount||0,0);
  await page.getByRole('button',{name:'关闭',exact:true}).click();assert.equal((await state()).words.speak?.practiceCount||0,0);
  await open();await answer('Can I speak?');await page.getByRole('button',{name:'听伙伴的回应',exact:true}).click();await page.locator('.rpg-dialogue').waitFor();
  await page.evaluate(()=>{worldLearning.context.save.languageLearning.target='ja';for(let i=0;i<6;i++){const button=document.querySelector('.rpg-dialogue .dialogue-default');if(!button)break;button.click();}});
  assert.equal((await state()).words.speak?.practiceCount||0,0,'a reply from the old target language cannot count');await page.evaluate(()=>worldLearning.context.save.languageLearning.target='en');
  await open();
  for(const [i,word] of ['speak','say'].entries()){
   if(i)await intro();await answer(i?'I can say hello.':'May I speak?');
   const c=await page.locator('.home-canvas').boundingBox();await page.mouse.click(c.x+c.width/2-80,c.y+c.height/2+15);
   await page.locator('.rpg-dialogue').waitFor();assert.equal((await state()).words[word]?.practiceCount||0,0);
   await page.screenshot({path:path.join(root,`tmp/home-talk-${word}-${width}.png`)});await intro();
   await page.getByRole('button',{name:'继续故事',exact:true}).waitFor();assert.equal((await state()).words[word].practiceCount,1);assert.equal((await state()).words[word].comprehension,undefined);await page.getByRole('button',{name:'继续故事',exact:true}).click();
  }
  await intro();await page.getByRole('button',{name:'给物品写标签',exact:true}).click();await page.getByRole('textbox',{name:'作品标签'}).fill('Hello, my friend.');await page.getByRole('button',{name:'保存标签',exact:true}).click();await page.getByRole('button',{name:'继续故事',exact:true}).click();
  await page.getByRole('status').filter({hasText:'书上留下了你写的开场'}).waitFor();assert.equal((await state()).words.hello.practiceCount,2);assert.equal((await state()).words.book.practiceCount,1);await page.reload();await page.waitForFunction(()=>window.worldLearning?.ready);assert.equal((await state()).words.speak.practiceCount,1);assert.equal((await state()).words.say.practiceCount,1);assert.equal(await page.evaluate(()=>worldLearning.label()),'Hello, my friend.');assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
