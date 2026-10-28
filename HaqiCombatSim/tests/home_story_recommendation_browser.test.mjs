import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('island vocabulary recommends executable homeland stories without granting practice',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:240000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});


 try{for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/home-learning-world.html?island-review&unlearned`);await page.waitForFunction(()=>window.worldLearning?.ready);
  const before=await page.evaluate(()=>worldLearning.learning());
  await page.getByRole('button',{name:'家园设置',exact:true}).click();await page.getByRole('button',{name:'情境练习',exact:true}).click();
  const recommendation=page.getByText(/^用岛上学过的词：book/).first();await recommendation.waitFor();
  const first=page.locator('.home-story-choices > div').first();assert.match(await first.textContent(),/用岛上学过的词：book/);assert.match(await first.textContent(),/这一步可玩/);
  const originalTitle=await first.getByRole('button').textContent(),search=page.getByRole('searchbox',{name:'搜索家园故事'});
  await search.fill('不存在的故事');await page.getByText('没有找到这个故事。试试别的名字，或清空搜索。',{exact:true}).waitFor();
  assert.equal(await page.locator('.home-story-choices').getByRole('button').count(),0);
  await search.fill(originalTitle);assert.equal(await page.locator('.home-story-choices').getByRole('button').count(),1);
  await search.fill('');assert.ok(await page.locator('.home-story-choices').getByRole('button').count()>6);
  const dimensions=await page.locator('.home-story-choices').evaluate(node=>({height:node.clientHeight,total:node.scrollHeight}));assert.ok(dimensions.height<=240);assert.ok(dimensions.total>dimensions.height);
  await page.screenshot({path:path.join(root,`tmp/home-island-recommendation-${width}.png`)});
  assert.deepEqual(await page.evaluate(()=>worldLearning.learning()),before);
  await first.getByRole('button').click();await page.locator('.rpg-dialogue').waitFor();assert.deepEqual(await page.evaluate(()=>worldLearning.learning()),before);
  assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
