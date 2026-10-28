import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('Chinese answer scaffolding changes comprehension evidence without changing valid practice or story progress',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:150000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});
 try{for(const width of [1280,390])for(const hint of [false,true]){
 const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 if(hint)await page.route('**/data/adventure/curriculum/english-home-practice.json',async route=>{const response=await route.fetch(),data=await response.json();data.games.find(g=>g.id==='en-l1-listen-and-make-picture-paper').intro='先找一张纸。听请求，再点选物品。';await route.fulfill({response,json:data});});
 await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/home-learning-world.html?listen-make&unlearned`);await page.waitForFunction(()=>window.worldLearning?.ready);
 await page.getByRole('button',{name:'家园设置',exact:true}).click();await page.getByRole('button',{name:'情境练习',exact:true}).click();await page.getByRole('button',{name:'听来的小画约定',exact:true}).click();
 await page.locator('.rpg-dialogue').waitFor();for(let i=0;i<8&&await page.locator('.rpg-dialogue').count();i++)await page.locator('.rpg-dialogue .dialogue-default').click();
 await page.getByRole('button',{name:'听伙伴的请求',exact:true}).click();await page.getByRole('status').filter({hasText:'听完了'}).waitFor();
 const b=await page.locator('.home-canvas').boundingBox();await page.mouse.click(b.x+b.width/2+100,b.y+b.height/2+50);
 await page.getByRole('button',{name:'继续故事',exact:true}).waitFor();const state=await page.evaluate(()=>worldLearning.learning()),word=state.words.paper;
 assert.equal(word.comprehension.listen.last.assisted,hint);assert.equal(word.comprehension.listen.unassistedFirstChoice,hint?0:1);assert.equal(word.comprehension.listen.count,1);assert.equal(word.practiceCount,1);assert.equal(Object.values(state.homeStories)[0].next,1);
 assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
