import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('body recall requires viewing the cue and distinguishes retry, hint and independent text or speech',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:120000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});
 try{for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/home-learning-world.html?body-parts&unlearned`);await page.waitForFunction(()=>window.worldLearning?.ready);
  const state=()=>page.evaluate(()=>worldLearning.learning());
  const intro=async()=>{await page.locator('.rpg-dialogue').waitFor();for(let i=0;i<8&&await page.locator('.rpg-dialogue').count();i++)await page.getByRole('button',{name:'我来帮你',exact:true}).click();};
  const answer=async text=>{await page.getByRole('textbox',{name:'输入回答'}).fill(text);await page.getByRole('button',{name:'回答',exact:true}).click();};
  await page.getByRole('button',{name:'家园设置',exact:true}).click();await page.getByRole('button',{name:'情境练习',exact:true}).click();await page.getByRole('button',{name:'这次由你告诉我',exact:true}).click();
  for(const [i,word] of ['eye','ear','hand','foot'].entries()){
   await intro();await answer(word);assert.equal((await state()).words[word].practiceCount,1,'no picture cue, no expression credit');
   await page.getByRole('button',{name:'看看伙伴指哪里',exact:true}).click();
   const seen=page.getByRole('button',{name:'看清楚了，返回回答',exact:true});await seen.waitFor();await page.waitForFunction(()=>document.querySelector('[aria-label="看清楚了，返回回答"]')?.disabled===false);
   assert.equal(await page.locator('.home-body-pin').count(),1);
   assert.ok(!(await page.getByRole('dialog',{name:'看看纸上朋友',exact:true}).textContent()).toLowerCase().includes(word));
   await page.screenshot({path:path.join(root,`tmp/home-body-recall-${word}-${width}.png`)});await seen.click();assert.equal((await state()).words[word].practiceCount,1,'viewing alone grants no credit');
   if(i===0){await answer('nose');assert.equal((await state()).words.eye.practiceCount,1);}
   if(i===1)await page.getByRole('button',{name:'提示',exact:true}).click();
   if(i===3){await page.evaluate(()=>worldLearning.voiceText='A foot.');const mic=page.getByRole('button',{name:'按住对话，松开发送；点击录制，再点结束；滑出取消',exact:true});await mic.click();await page.locator('.camp-chat-mic.is-recording').waitFor();await mic.click();}
   else await answer(word);
   await page.getByRole('button',{name:'继续故事',exact:true}).waitFor();const saved=(await state()).words[word];assert.equal(saved.practiceCount,2);assert.equal(saved.homeReview.support,i===0?'retried':i===1?'assisted':'unassisted');assert.equal(saved.homeReview.lastEvidence.input,i===3?'speech':'text');assert.equal(saved.comprehension,undefined);
   await page.getByRole('button',{name:'继续故事',exact:true}).click();
  }
  await page.getByRole('status').filter({hasText:'这次是你向伙伴解释了四个位置'}).waitFor();await page.reload();await page.waitForFunction(()=>window.worldLearning?.ready);assert.equal((await state()).words.foot.practiceCount,2);assert.equal((await state()).words.eye.homeReview.support,'retried');assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
