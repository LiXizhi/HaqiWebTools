import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('shared ball story binds finding, saved writing and real pet play to one ball',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:150000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});
 const url=`http://127.0.0.1:${server.address().port}`;
 try{for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'/tests/fixtures/home-learning-world.html?shared-ball&unlearned');await page.waitForFunction(()=>window.worldLearning?.ready);
  const intro=async()=>{await page.locator('.rpg-dialogue').waitFor();for(let i=0;i<8&&await page.locator('.rpg-dialogue').count();i++)await page.getByRole('button',{name:'我来帮你',exact:true}).click();};
  const openStory=async()=>{await page.getByRole('button',{name:'家园设置',exact:true}).click();await page.getByRole('button',{name:'情境练习',exact:true}).click();await page.getByRole('button',{name:'一只球的邀请',exact:true}).click();};
  const answer=async(text)=>{await page.getByRole('textbox',{name:'输入回答'}).fill(text);await page.getByRole('button',{name:'回答',exact:true}).click();};
  const next=async()=>{await page.getByRole('button',{name:'继续故事',exact:true}).click({timeout:8000});await intro();};
  const canvas=await page.locator('.home-canvas').boundingBox(),point=(x,y)=>({x:canvas.x+canvas.width/2+x*40+20,y:canvas.y+canvas.height/2+y*40+10});
  const tap=async(x,y)=>{const p=point(x,y);await page.mouse.click(p.x,p.y);};
  const drag=async(x,y,u,v)=>{const a=point(x,y),b=point(u,v);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:12});await page.mouse.up();};
  const state=()=>page.evaluate(()=>worldLearning.learning());
  await openStory();await intro();
  const before=(await state()).words.ball?.practiceCount||0;
  await answer('Let us find the ball.');assert.equal((await state()).words.ball?.practiceCount||0,before);
  await tap(2,1);await next();assert.equal((await state()).words.ball.practiceCount,before+1);
  await page.getByRole('button',{name:'给物品写标签',exact:true}).click();await page.getByRole('textbox',{name:'作品标签'}).fill('Our ball.');await page.getByRole('button',{name:'保存标签',exact:true}).click();await next();assert.equal((await state()).words.ball.practiceCount,before+2);
  const plays=(await state()).words.play?.practiceCount||0;
  await answer('Let us play.');await page.getByRole('button',{name:'检查并保存练习',exact:true}).click();assert.equal((await state()).words.play?.practiceCount||0,plays);
  const pet=await page.evaluate(()=>worldLearning.petPosition());await page.mouse.move(canvas.x+canvas.width/2+pet.x*40,canvas.y+canvas.height/2+pet.y*40-25);await page.mouse.down();await page.mouse.move(canvas.x+canvas.width/2+100,canvas.y+canvas.height/2+60-25,{steps:12});await page.mouse.up();
  await page.getByRole('button',{name:'继续故事',exact:true}).click();await page.getByRole('status').filter({hasText:'想换一个玩法'}).waitFor();assert.equal((await state()).words.play.practiceCount,plays+1);
  let props=await page.evaluate(()=>worldLearning.picnicObjects());assert.equal(props.ball.label,'Our ball.');
  await page.screenshot({path:path.join(root,`tmp/home-shared-ball-finish-${width}.png`)});await page.reload();await page.waitForFunction(()=>window.worldLearning?.ready);assert.deepEqual(await page.evaluate(()=>worldLearning.picnicObjects()),props);assert.equal((await state()).words.play.practiceCount,plays+1);
  const completed=await state();await openStory();
  await page.getByRole('button',{name:'再玩一次这个故事',exact:true}).waitFor();
  assert.deepEqual(await state(),completed,'opening a completed story is read-only');
  // Advance only the recommendation clock; no practice or story state is seeded.
  await page.evaluate(()=>{window.realReviewNow=Date.now;Date.now=()=>window.realReviewNow()+10*60*1000;});
  await page.getByRole('button',{name:'选择其他游戏',exact:true}).click();
  await page.getByText(/^可以再玩，复习：find、ball、play。故事已完成/).waitFor();
  assert.deepEqual(await state(),completed,'due recommendations do not grant practice or reset completion');
  await page.screenshot({path:path.join(root,`tmp/home-replay-due-${width}.png`)});
  await page.getByRole('button',{name:'一只球的邀请',exact:true}).click();
  await page.evaluate(()=>{Date.now=window.realReviewNow;delete window.realReviewNow;});
  await page.reload();await page.waitForFunction(()=>window.worldLearning?.ready);await openStory();

  await page.getByRole('button',{name:'再玩一次这个故事',exact:true}).click();await intro();
  assert.deepEqual((await state()).words,completed.words,'replay does not award practice');
  assert.deepEqual(await page.evaluate(()=>worldLearning.picnicObjects()),props,'replay preserves created labels and objects');
  await answer('Let us find the ball.');
  assert.equal((await state()).words.ball.practiceCount,before+2);
  // The companion is still sitting on the ball from the completed game.
  // Move it away through the real canvas before pointing to the ball again.
  const resting=await page.evaluate(()=>worldLearning.petPosition());
  await page.mouse.move(canvas.x+canvas.width/2+resting.x*40,canvas.y+canvas.height/2+resting.y*40-25);await page.mouse.down();await page.mouse.move(canvas.x+canvas.width/2-40,canvas.y+canvas.height/2+80-25,{steps:12});await page.mouse.up();
  await page.screenshot({path:path.join(root,`tmp/replay-before-find-${width}.png`)});
  await tap(2,1);await page.screenshot({path:path.join(root,`tmp/replay-after-find-${width}.png`)});await next();assert.equal((await state()).words.ball.practiceCount,before+3);
  const replay=Object.values((await state()).homeStories).find(s=>s.replayCount===1);assert.equal(replay.next,1);assert.ok(replay.lastCompletedAt);
  await page.reload();await page.waitForFunction(()=>window.worldLearning?.ready);await openStory();await intro();
  await page.getByRole('button',{name:'给物品写标签',exact:true}).waitFor();
  assert.equal(Object.values((await state()).homeStories).find(s=>s.replayCount===1).next,1);
  assert.equal((await state()).words.ball.practiceCount,before+3,'refresh resumes replay without duplicate practice');
  assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});

