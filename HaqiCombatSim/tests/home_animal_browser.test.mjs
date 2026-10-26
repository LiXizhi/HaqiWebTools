import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('eight animal stories preserve the verified companion across real activities and reload',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:300000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});
 const url=`http://127.0.0.1:${server.address().port}`;
 try{for(const width of [1280,390])for(const animal of (process.env.HAQI_ANIMAL?process.env.HAQI_ANIMAL.split(','):['cat','dog','bird','frog','cow','sheep','rabbit','mouse'])){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message)); console.log('animal case',animal,width);
  await page.goto(url+'/tests/fixtures/home-learning-world.html?animal='+animal);await page.waitForFunction(()=>window.worldLearning?.ready);
  const intro=async()=>{await page.locator('.rpg-dialogue').waitFor();for(let i=0;i<8&&await page.locator('.rpg-dialogue').count();i++)await page.getByRole('button',{name:'我来帮你',exact:true}).click();};
  const openStory=async()=>{await page.getByRole('button',{name:'家园设置',exact:true}).click();await page.getByRole('button',{name:'情境练习',exact:true}).click();await page.getByRole('button',{name:({cat:'和猫伙伴的一天',dog:'和狗伙伴的一天',bird:'小鸟的安静书角',frog:'青蛙的慢慢玩约定',cow:'奶牛的小小休息站',sheep:'小羊的安静约定',rabbit:'兔子的再玩一会儿',mouse:'小鼠也有大故事'})[animal],exact:true}).click();};
  const answer=async(text)=>{await page.getByRole('textbox',{name:'输入回答'}).fill(text);await page.getByRole('button',{name:'回答',exact:true}).click();};
  const progress=async()=>Object.values((await page.evaluate(()=>worldLearning.learning())).homeStories||{})[0];
  await openStory();await intro();await answer((['bird','cow','sheep','mouse'].includes(animal)?'Sit, ':'Hello, ')+animal+'.');
  let canvas=await page.locator('.home-canvas').boundingBox();const point=(x,y)=>({x:canvas.x+canvas.width/2+x*40,y:canvas.y+canvas.height/2+y*40});
  const dragPet=async(x,y)=>{const p=await page.evaluate(()=>worldLearning.petPosition()),a=point(p.x,p.y),b=point(x,y);await page.mouse.move(a.x,a.y-25);await page.mouse.down();await page.mouse.move(b.x,b.y-25,{steps:12});await page.mouse.up();};
  await page.getByRole('button',{name:'检查并保存练习',exact:true}).click();assert.equal((await progress())?.next||0,0);
  await dragPet(2.5,1.5);await page.getByRole('button',{name:'继续故事',exact:true}).waitFor();assert.equal((await progress()).next,1);assert.equal((await progress()).pets[0],'companion');
  await page.reload();await page.waitForFunction(()=>window.worldLearning?.ready);canvas=await page.locator('.home-canvas').boundingBox();await openStory();await intro();await answer(['bird','sheep','mouse'].includes(animal)?'Read, '+animal+'.':'Water for the '+animal+'.');
  await dragPet(3.5,3.5);await page.getByRole('button',{name:'继续故事',exact:true}).waitFor();assert.equal((await progress()).next,2);
  await page.getByRole('button',{name:'继续故事',exact:true}).click();await intro();await answer((['frog','rabbit'].includes(animal)?'Sit, ':'Sleep, ')+animal+'.');await dragPet(['frog','rabbit'].includes(animal)?.5:1,.5);
  await page.getByRole('button',{name:'继续故事',exact:true}).waitFor();assert.equal((await progress()).next,3);assert.equal((await progress()).pets[2],'companion');
  const state=await page.evaluate(()=>worldLearning.learning());assert.equal(state.words[animal].practiceCount,3);assert.equal(state.words.water.practiceCount,1);assert.equal(state.words.sleep.practiceCount,1);
  await page.getByRole('button',{name:'继续故事',exact:true}).click();await page.getByRole('status').filter({hasText:({bird:'书角留在家园',frog:'想玩、想喝水',cow:'奶牛开始休息了',sheep:'小羊开始休息了',rabbit:'兔子开始坐下休息了',mouse:'小鼠开始休息了'})[animal]||'这次小旅程结束了'}).waitFor();
  await page.screenshot({path:path.join(root,`tmp/home-animal-${animal}-${width}.png`)});
  assert.deepEqual(errors,[]);await context.close();
 }
  const context=await browser.newContext({viewport:{width:390,height:900},reducedMotion:'reduce'}),page=await context.newPage();
  await page.goto(url+'/tests/fixtures/home-learning-world.html?animal=missing');await page.waitForFunction(()=>window.worldLearning?.ready);
  await page.getByRole('button',{name:'家园设置',exact:true}).click();await page.getByRole('button',{name:'情境练习',exact:true}).click();await page.getByRole('button',{name:'和猫伙伴的一天',exact:true}).click();
  await page.getByRole('status').filter({hasText:'布丁橘喵'}).waitFor();assert.equal((await page.evaluate(()=>worldLearning.learning())).words.cat?.practiceCount||0,0);
  await page.getByRole('button',{name:'去宠物背包',exact:true}).click();await page.getByText('家园宠物背包',{exact:true}).waitFor();await context.close();
  for(const [animal,title] of [['rabbit','兔子的再玩一会儿'],['mouse','小鼠也有大故事']]){
   const c=await browser.newContext({viewport:{width:390,height:900}}),p=await c.newPage();p.setDefaultTimeout(15000);await p.goto(url+'/tests/fixtures/home-learning-world.html?animal='+animal+'&baby');await p.waitForFunction(()=>window.worldLearning?.ready);await p.getByRole('button',{name:'家园设置',exact:true}).click();await p.getByRole('button',{name:'情境练习',exact:true}).click();await p.getByRole('button',{name:title,exact:true}).click();await p.getByRole('status').filter({hasText:'目前的外观还不适合'}).waitFor();assert.equal((await p.evaluate(()=>worldLearning.learning())).words[animal]?.practiceCount||0,0);await c.close();
  }
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
