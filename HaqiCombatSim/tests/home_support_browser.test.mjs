import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('home recall records actual hints and retries without crediting empty or wrong answers',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:150000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});
 const data=JSON.parse(await readFile(path.join(root,'data/adventure/curriculum/english-home-practice.json'),'utf8'));
 try{for(const [condition,expected] of [['recall','unassisted'],['hint','assisted'],['retry','retried'],['exposed','assisted']]){
  const context=await browser.newContext({viewport:{width:390,height:900}}),page=await context.newPage();page.setDefaultTimeout(15000);
  // Isolate one real author scene so test order does not depend on the curriculum scheduler.
  const storyId='en-l1-search-where-book-'+(condition==='exposed'?'meet':'review');
  const game=data.games.find(g=>g.id===storyId);assert.ok(game,storyId);
  await page.route('**/english-home-practice.json',route=>route.fulfill({json:{...data,games:[game],arcs:[]}}));
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/home-learning-world.html?support-practice`);await page.waitForFunction(()=>window.worldLearning?.ready);
  await page.getByRole('button',{name:'家园设置',exact:true}).click();await page.getByRole('button',{name:'情境练习',exact:true}).click();await page.getByRole('button',{name:'找物游戏',exact:true}).click();
  await page.locator('.rpg-dialogue').waitFor();for(let i=0;i<8&&await page.locator('.rpg-dialogue').count();i++)await page.getByRole('button',{name:'我来帮你',exact:true}).click();
  assert.equal(await page.getByText('本轮词语：where',{exact:true}).count(),0);
  const answer=async text=>{await page.getByRole('textbox',{name:'输入回答'}).fill(text);await page.getByRole('button',{name:'回答',exact:true}).click();};
  await answer('');assert.equal((await page.evaluate(()=>worldLearning.learning())).words.where.practiceCount,1);
  if(condition==='hint')await page.getByRole('button',{name:'提示',exact:true}).click();
  if(condition==='retry'){await answer('A chair.');assert.equal((await page.evaluate(()=>worldLearning.learning())).words.where.practiceCount,1);}
  await answer('Where is the book?');
  const b=await page.locator('.home-canvas').boundingBox();await page.mouse.click(b.x+b.width/2+100,b.y+b.height/2+50);
  await page.getByRole('button',{name:'再玩一轮',exact:true}).waitFor();
  const word=(await page.evaluate(()=>worldLearning.learning())).words.where;assert.equal(word.practiceCount,2);assert.equal(word.homeReview.support,expected);assert.equal(word.homeReview.lastEvidence.attempts,condition==='retry'?2:1);
  await page.reload();await page.waitForFunction(()=>window.worldLearning?.ready);assert.deepEqual((await page.evaluate(()=>worldLearning.learning())).words.where.homeReview,word.homeReview);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
