import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('play again story needs a fresh real pet interaction and keeps the same companion',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:150000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});
 const url=`http://127.0.0.1:${server.address().port}`;
 try{for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'/tests/fixtures/home-learning-world.html?play-story');await page.waitForFunction(()=>window.worldLearning?.ready);
  const intro=async()=>{await page.locator('.rpg-dialogue').waitFor();for(let i=0;i<8&&await page.locator('.rpg-dialogue').count();i++)await page.locator('.rpg-dialogue .dialogue-default').click();};
  const openStory=async()=>{await page.getByRole('button',{name:'家园设置',exact:true}).click();await page.getByRole('button',{name:'情境练习',exact:true}).click();await page.getByRole('button',{name:'再玩一次，然后休息',exact:true}).click();};
  const answer=async(text)=>{await page.getByRole('textbox',{name:'输入回答'}).fill(text);await page.getByRole('button',{name:'回答',exact:true}).click();};
  const progress=async()=>Object.values((await page.evaluate(()=>worldLearning.learning())).homeStories||{})[0];
  await openStory();await intro();await answer('A ball.');
  let canvas=await page.locator('.home-canvas').boundingBox();const point=(x,y)=>({x:canvas.x+canvas.width/2+x*40,y:canvas.y+canvas.height/2+y*40});
  const ball=point(2.5,1.5);await page.mouse.click(ball.x,ball.y);await page.getByRole('button',{name:'继续故事',exact:true}).click();await intro();await answer('Go to the ball.');
  const dragPet=async(x,y)=>{const p=await page.evaluate(()=>worldLearning.petPosition()),a=point(p.x,p.y),b=point(x,y);await page.mouse.move(a.x,a.y-25);await page.mouse.down();await page.mouse.move(b.x,b.y-25,{steps:12});await page.mouse.up();};
  await dragPet(2.5,1.5);await page.getByRole('button',{name:'继续故事',exact:true}).waitFor();assert.equal((await progress()).next,2);assert.equal((await progress()).pets[1],'companion');
  await page.reload();await page.waitForFunction(()=>window.worldLearning?.ready);canvas=await page.locator('.home-canvas').boundingBox();await openStory();await intro();await answer('Again, please.');
  await page.getByRole('button',{name:'检查并保存练习',exact:true}).click();assert.equal((await progress()).next,2);
  await dragPet(3.5,0);assert.equal((await progress()).next,2);
  await dragPet(2.5,1.5);await page.getByRole('button',{name:'继续故事',exact:true}).waitFor();assert.equal((await progress()).next,3);
  await page.getByRole('button',{name:'继续故事',exact:true}).click();await intro();await answer('Are you tired?');await dragPet(1,.5);
  await page.getByRole('button',{name:'继续故事',exact:true}).waitFor();assert.equal((await progress()).next,4);assert.equal((await progress()).pets[3],'companion');
  const state=await page.evaluate(()=>worldLearning.learning());assert.equal(state.words.go.practiceCount,1);assert.equal(state.words.again.practiceCount,1);assert.equal(state.words.tired.practiceCount,1);
  await page.getByRole('button',{name:'继续故事',exact:true}).click();await page.getByRole('status').filter({hasText:'伙伴也有了休息的地方'}).waitFor();
  await page.screenshot({path:path.join(root,`tmp/home-play-again-${width}.png`)});
  assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
