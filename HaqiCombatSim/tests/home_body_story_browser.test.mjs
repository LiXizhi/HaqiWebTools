import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('body story records only real part choices, separates hearing and reading and survives reload',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:120000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});
 try{for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/home-learning-world.html?body-parts&unlearned`);await page.waitForFunction(()=>window.worldLearning?.ready);
  const state=()=>page.evaluate(()=>worldLearning.learning());
  const intro=async()=>{await page.locator('.rpg-dialogue').waitFor();for(let i=0;i<8&&await page.locator('.rpg-dialogue').count();i++)await page.getByRole('button',{name:'我来帮你',exact:true}).click();};
  const answer=async text=>{await page.getByRole('textbox',{name:'输入回答'}).fill(text);await page.getByRole('button',{name:'回答',exact:true}).click();};
  await page.getByRole('button',{name:'家园设置',exact:true}).click();await page.getByRole('button',{name:'情境练习',exact:true}).click();await page.getByRole('button',{name:'纸上朋友的表演准备',exact:true}).click();
  const open=async()=>{await page.getByRole('button',{name:'打开角色画',exact:true}).click();await page.getByRole('dialog',{name:'看看纸上朋友',exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('[aria-label="图中位置 1"]')?.disabled===false);};
  for(const [i,word,mode,number] of [[0,'eye','read',2],[1,'ear','listen',3],[2,'hand','read',2],[3,'foot','listen',4]]){
   await intro();
   if(mode==='listen'){
    await page.getByRole('button',{name:'打开角色画',exact:true}).click();assert.equal(await page.getByRole('dialog',{name:'看看纸上朋友',exact:true}).count(),0);
    await page.getByRole('button',{name:'听伙伴的请求',exact:true}).click();await page.getByRole('status').filter({hasText:'听完了'}).waitFor();
   }
   await open();
   if(i===0){await page.locator('[data-body-part=ear]').click();assert.equal((await state()).words.eye.comprehension,undefined);await open();}
   await page.screenshot({path:path.join(root,`tmp/home-body-story-${i}-${width}.png`)});
   await page.locator('[data-body-part='+word+']').click();await page.getByRole('button',{name:'继续故事',exact:true}).waitFor();
   const evidence=(await state()).words[word];assert.equal(evidence.practiceCount,1);assert.equal(evidence.comprehension[mode].count,1);assert.equal(evidence.comprehension[mode].last.attempts,i===0?2:1);
   await page.getByRole('button',{name:'继续故事',exact:true}).click();
  }
  await page.getByRole('status').filter({hasText:'四个位置都找到啦'}).waitFor();await page.screenshot({path:path.join(root,`tmp/home-body-world-${width}.png`)});await page.reload();await page.waitForFunction(()=>window.worldLearning?.ready);assert.equal((await state()).words.foot.comprehension.listen.count,1);assert.equal((await state()).words.eye.comprehension.read.count,1);assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
