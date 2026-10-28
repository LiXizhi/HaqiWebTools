import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('action listening requires hearing, choosing and real movement, with a separate reading fallback',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:240000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});
 try{for(const width of [1280,390])for(const [i,mode] of ['walk','run','stand','jump'].entries()){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/home-learning-world.html?walking-story&unlearned&action-listening`);await page.waitForFunction(()=>window.worldLearning?.ready);
  const state=()=>page.evaluate(()=>worldLearning.learning()),choice={walk:'走过去',run:'跑过去',stand:'站好',jump:'跳一下'};
  await page.getByRole('button',{name:'家园设置',exact:true}).click();await page.getByRole('button',{name:'情境练习',exact:true}).click();await page.getByRole('button',{name:`小演员口令卡${i+1}`,exact:true}).click();
  await page.locator('.rpg-dialogue').waitFor();for(let n=0;n<8&&await page.locator('.rpg-dialogue').count();n++)await page.getByRole('button',{name:'我来帮你',exact:true}).click();
  assert.equal(await page.getByRole('textbox',{name:'输入回答'}).count(),0);
  await page.getByRole('button',{name:choice[mode],exact:true}).click();assert.equal((await state()).words[mode].comprehension,undefined);
  if(mode==='run')await page.evaluate(()=>worldLearning.failSpeech=true);
  await page.getByRole('button',{name:'听动作口令',exact:true}).click();
  if(mode==='run'){await page.getByRole('status').filter({hasText:'测试语音不可用'}).waitFor();await page.getByRole('button',{name:'改读文字口令',exact:true}).click();}
  else await page.getByRole('status').filter({hasText:'听完了'}).waitFor();
  if(mode==='walk'){await page.getByRole('button',{name:choice.jump,exact:true}).click();assert.equal((await state()).words.walk.comprehension,undefined);}
  await page.screenshot({path:path.join(root,`tmp/action-listening-${mode}-${width}.png`)});
  await page.getByRole('button',{name:choice[mode],exact:true}).click();assert.equal((await state()).words[mode].comprehension,undefined,'choosing is not performing');
  const canvas=await page.locator('.home-canvas').boundingBox(),point=(x,y)=>({x:canvas.x+canvas.width/2+x*40,y:canvas.y+canvas.height/2+y*40});
  if(mode!=='jump')await page.getByRole('button',{name:{walk:'开始散步',run:'开始跑步',stand:'开始站位'}[mode],exact:true}).click();
  await page.getByRole('button',{name:'检查并保存练习',exact:true}).click();assert.equal((await state()).words[mode].comprehension,undefined);
  const dest=point(2.25,.75);await page.mouse.click(dest.x,dest.y);
  if(mode==='jump'){await page.waitForTimeout(1000);await page.getByRole('button',{name:'跳一下',exact:true}).click();}
  await page.getByRole('button',{name:'继续故事',exact:true}).waitFor();
  const saved=(await state()).words[mode],input=mode==='run'?'read':'listen';assert.equal(saved.practiceCount,1);assert.equal(saved.comprehension[input].count,1);assert.equal(saved.comprehension[input].last.attempts,mode==='walk'?2:1);assert.equal(saved.comprehension[input].last.assisted,mode==='run');if(mode==='run')assert.equal(saved.comprehension.listen,undefined);
  await page.getByRole('button',{name:'继续故事',exact:true}).click();await page.getByRole('status').filter({hasText:'这一张口令卡完成了'}).waitFor();await page.reload();await page.waitForFunction(()=>window.worldLearning?.ready);assert.equal((await state()).words[mode].comprehension[input].count,1);assert.equal((await state()).words[mode].practiceCount,1);assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
