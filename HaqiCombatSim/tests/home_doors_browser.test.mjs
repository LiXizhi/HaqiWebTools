import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('children operate the same real door, learn open and close, and resume the signal story',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:150000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});
 try{for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900},hasTouch:width===390}),page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/home-learning-world.html?door-story&unlearned`);await page.waitForFunction(()=>window.worldLearning?.ready);
  const state=()=>page.evaluate(()=>worldLearning.learning()),door=()=>page.evaluate(async()=>(await worldLearning.schoolObjects()).door);
  const open=async()=>{await page.getByRole('button',{name:'家园设置',exact:true}).click();await page.getByRole('button',{name:'情境练习',exact:true}).click();await page.getByRole('button',{name:'我们约好的开门信号',exact:true}).click();};
  const intro=async()=>{await page.locator('.rpg-dialogue').waitFor();for(let i=0;i<8&&await page.locator('.rpg-dialogue').count();i++)await page.getByRole('button',{name:'我来帮你',exact:true}).click();};
  const answer=async text=>{await page.getByRole('textbox',{name:'输入回答'}).fill(text);await page.getByRole('button',{name:'回答',exact:true}).click();};
  const operate=async title=>{await page.getByRole('button',{name:'选中这扇门',exact:true}).click();await page.getByRole('button',{name:title,exact:true}).click();await page.getByRole('button',{name:'继续故事',exact:true}).waitFor();};
  await open();await intro();await answer('The book.');assert.equal((await state()).words.door?.practiceCount||0,0);await answer('The door.');await operate('开门');assert.equal((await door()).doorOpen,true);assert.equal((await state()).words.door.practiceCount,1);
  await page.getByRole('button',{name:'继续故事',exact:true}).click();await intro();await answer('I can close the door.');await operate('关门');assert.equal((await door()).doorOpen,false);assert.equal((await state()).words.close.practiceCount,1);
  await page.reload();await page.waitForFunction(()=>window.worldLearning?.ready);assert.equal((await door()).doorOpen,false);await open();await intro();await answer('I can open the door.');await operate('开门');assert.equal((await door()).doorOpen,true);assert.equal((await state()).words.open.practiceCount,1);
  await page.getByRole('button',{name:'继续故事',exact:true}).click();await page.getByRole('status').filter({hasText:'你把同一扇门关好'}).waitFor();await page.screenshot({path:path.join(root,`tmp/home-doors-${width}.png`)});assert.equal(Object.values((await state()).homeStories)[0].next,3);assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
