import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('grownup and baby pictures are drawn, labelled and introduced without treating the label as independent recognition',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:300000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});
 try{for(const width of [1280,390])for(const [word,title,ending] of [['man','雨伞下的来客','你的雨天来客有了画'],['woman','远航者的第一封信','你的远航者有了画'],['baby','宝宝也在故事里','宝宝没有被你的故事漏掉']]){
  const context=await browser.newContext({viewport:{width,height:900},hasTouch:width===390}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/home-learning-world.html?drawing-story&unlearned`);await page.waitForFunction(()=>window.worldLearning?.ready);
  const state=()=>page.evaluate(()=>worldLearning.learning()),paper=()=>page.evaluate(async()=>(await worldLearning.schoolObjects()).paper);
  const intro=async()=>{await page.locator('.rpg-dialogue').waitFor();for(let i=0;i<8&&await page.locator('.rpg-dialogue').count();i++)await page.getByRole('button',{name:'我来帮你',exact:true}).click();};
  const answer=async text=>{await page.getByRole('textbox',{name:'输入回答'}).fill(text);await page.getByRole('button',{name:'回答',exact:true}).click();};
  await page.getByRole('button',{name:'家园设置',exact:true}).click();await page.getByRole('button',{name:'情境练习',exact:true}).click();await page.getByRole('button',{name:title,exact:true}).click();await intro();await answer('Some paper.');
  const scene=await page.locator('.home-canvas').boundingBox();await page.mouse.click(scene.x+scene.width/2+100,scene.y+scene.height/2+50);await page.getByRole('button',{name:'继续故事',exact:true}).click();await intro();await answer('I can draw.');
  await page.getByRole('button',{name:'开始画画',exact:true}).click();const b=await page.getByLabel('画纸',{exact:true}).boundingBox();
  await page.mouse.move(b.x+b.width*.2,b.y+b.height*.7);await page.mouse.down();await page.mouse.move(b.x+b.width*.5,b.y+b.height*.2,{steps:10});await page.mouse.move(b.x+b.width*.8,b.y+b.height*.7,{steps:10});await page.mouse.up();await page.getByRole('button',{name:'保存小画',exact:true}).click();
  const drawing=(await paper()).drawing;assert.ok(drawing.strokes.length);await page.getByRole('button',{name:'继续故事',exact:true}).click();await intro();
  await page.getByRole('button',{name:'给物品写标签',exact:true}).click();assert.equal(await page.getByText('没有标准答案，写下你想给朋友看的话。',{exact:true}).count(),0);await page.getByRole('textbox',{name:'作品标签'}).fill('A face.');await page.getByRole('button',{name:'保存标签',exact:true}).click();assert.equal((await state()).words[word]?.practiceCount||0,0);assert.equal((await state()).words.face?.practiceCount||0,0);
  await page.getByRole('button',{name:'给物品写标签',exact:true}).click();await page.getByRole('textbox',{name:'作品标签'}).fill(`A ${word}.`);await page.screenshot({path:path.join(root,`tmp/home-picture-show-${word}-writing-${width}.png`)});await page.getByRole('button',{name:'保存标签',exact:true}).click();await page.getByRole('button',{name:'继续故事',exact:true}).click();
  await intro();assert.equal((await state()).words[word].practiceCount,1,'entering recap does not count');
  if(word==='baby'){
   await page.evaluate(text=>worldLearning.voiceText=text,`A ${word}.`);
   const mic=page.getByRole('button',{name:'按住对话，松开发送；点击录制，再点结束；滑出取消',exact:true});await mic.click();await page.locator('.camp-chat-mic.is-recording').waitFor();await mic.click();
   await page.getByRole('button',{name:'检查并保存练习',exact:true}).waitFor();
  }else await answer(`This is a ${word}.`);
  assert.equal((await state()).words[word].practiceCount,1,'answer without pointing does not count');
  await page.mouse.click(scene.x+scene.width/2,scene.y+scene.height/2);assert.equal((await state()).words[word].practiceCount,1);
  await page.mouse.click(scene.x+scene.width/2+100,scene.y+scene.height/2+50);
  await page.getByRole('button',{name:'继续故事',exact:true}).waitFor();
  assert.equal((await state()).words[word].homeReview.support,'assisted');
  assert.equal((await state()).words[word].homeReview.lastEvidence.input,word==='baby'?'speech':'text');
  await page.getByRole('button',{name:'继续故事',exact:true}).click();
  await page.getByRole('status').filter({hasText:ending}).waitFor();assert.equal((await state()).words[word].practiceCount,2);assert.equal((await paper()).label,`A ${word}.`);assert.deepEqual((await paper()).drawing,drawing);
  await page.screenshot({path:path.join(root,`tmp/home-picture-show-${word}-finish-${width}.png`)});await page.reload();await page.waitForFunction(()=>window.worldLearning?.ready);assert.equal((await paper()).label,`A ${word}.`);assert.deepEqual((await paper()).drawing,drawing);assert.equal((await state()).words[word].practiceCount,2);assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
