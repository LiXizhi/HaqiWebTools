import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('real home label editor saves the object and records the active writing task once',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:120000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});


 try{for(const [width,word] of [[1280,'book'],[390,'book'],[1280,'grey'],[390,'grey']]){
  const label=word==='grey'?'Grey.':'Our book.';
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/home-learning-world.html${word==='grey'?'?color=grey':''}`);
  await page.waitForFunction(()=>window.worldLearning?.ready);await page.locator('.home-canvas').waitFor();
  const finishIntro=async()=>{await page.locator('.rpg-dialogue').waitFor();assert.equal(await page.locator('.rpg-dialogue .eyebrow').textContent(),'家园 · 我的故事角');for(let i=0;i<5&&await page.locator('.rpg-dialogue').count();i++)await page.getByRole('button',{name:'我来帮你',exact:true}).click();};
  const openTask=async()=>{
   await page.getByRole('button',{name:'家园设置',exact:true}).click();await page.getByRole('button',{name:'情境练习',exact:true}).click();
   await page.getByRole('button',{name:'写作品标签',exact:true}).click();await finishIntro();
   await page.getByRole('button',{name:'给物品写标签',exact:true}).click();await page.getByRole('textbox',{name:'作品标签'}).waitFor();
  };
  await openTask();
  await page.getByRole('textbox',{name:'作品标签'}).press('Escape');
  await page.getByRole('dialog',{name:'给作品写标签'}).waitFor({state:'hidden'});
  await page.getByRole('button',{name:'给物品写标签',exact:true}).click();
  await page.getByRole('textbox',{name:'作品标签'}).fill('My cup.');await page.getByRole('button',{name:'保存标签',exact:true}).click();
  await page.getByRole('status').filter({hasText:'你的标签已保留'}).waitFor();
  assert.equal(await page.evaluate(()=>worldLearning.label()),'My cup.');assert.equal((await page.evaluate(()=>worldLearning.learning())).words[word].practiceCount,1);
  await page.getByRole('button',{name:'给物品写标签',exact:true}).click();await page.getByRole('textbox',{name:'作品标签'}).fill(label);
  await page.getByRole('button',{name:'保存标签',exact:true}).click();await page.getByRole('button',{name:'再玩一轮',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>worldLearning.label()),label);assert.equal((await page.evaluate(()=>worldLearning.learning())).words[word].practiceCount,2);
  await page.screenshot({path:path.join(root,`tmp/home-writing-world-${word}-${width}.png`)});
  const wheel=await page.locator('.home-edit-actions').boundingBox();assert.ok(wheel.x>=0&&wheel.y>=0&&wheel.x+wheel.width<=width+1);
  await page.getByRole('button',{name:'再玩一轮',exact:true}).click();await finishIntro();await page.getByRole('button',{name:'给物品写标签',exact:true}).click();
  await page.getByRole('button',{name:'保存标签',exact:true}).click();
  await page.getByRole('dialog',{name:'给作品写标签'}).waitFor({state:'detached'});
  assert.equal((await page.evaluate(()=>worldLearning.learning())).words[word].practiceCount,2);
  await page.reload();await page.waitForFunction(()=>window.worldLearning?.ready);
  assert.equal(await page.evaluate(()=>worldLearning.label()),label);assert.equal((await page.evaluate(()=>worldLearning.learning())).words[word].practiceCount,2);
  const review=(await page.evaluate(()=>worldLearning.learning())).words[word].homeReview;
  assert.equal(review.visits,1);assert.equal(review.modes.write,1);assert.equal(review.inputs.text,1);assert.equal(review.support,'unknown');
  assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});

