import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('toy and fire listening and reading require real selection without prior translation cues',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:180000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});
 try{for(const width of [1280,390])for(const word of ['toy','fire'])for(const mode of ['listen','read']){
 const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/home-learning-world.html?cue-word=${word}&unlearned`);await page.waitForFunction(()=>window.worldLearning?.ready);
 await page.getByRole('button',{name:'家园设置',exact:true}).click();await page.getByRole('button',{name:'情境练习',exact:true}).click();await page.getByRole('button',{name:mode==='listen'?'听伙伴找物':'读线索找物',exact:true}).click();
 await page.locator('.rpg-dialogue').waitFor();for(let i=0;i<8&&await page.locator('.rpg-dialogue').count();i++)await page.locator('.rpg-dialogue .dialogue-default').click();
 const scaffolding=await page.locator('.language-practice-modal details').textContent();assert.ok(!scaffolding.includes(word==='toy'?'玩具':'火'));
 assert.equal(await page.getByRole('textbox',{name:'输入回答'}).count(),0);
 if(mode==='listen'){assert.ok(!(await page.locator('.language-practice-modal').textContent()).includes(`Find the ${word}.`));await page.getByRole('button',{name:'听伙伴的请求',exact:true}).click();await page.getByRole('status').filter({hasText:'听完了'}).waitFor();}
 else await page.getByRole('status').filter({hasText:`Find the ${word}.`}).waitFor();
 const b=await page.locator('.home-canvas').boundingBox();await page.mouse.click(b.x+b.width/2+32,b.y+b.height/2+48);
 await page.getByRole('button',{name:'再玩一轮',exact:true}).waitFor();const saved=(await page.evaluate(()=>worldLearning.learning())).words[word];
 assert.equal(saved.practiceCount,1);assert.equal(saved.comprehension[mode].count,1);assert.equal(saved.comprehension[mode].last.assisted,false);assert.equal(saved.comprehension[mode].unassistedFirstChoice,1);
 await page.screenshot({path:path.join(root,`tmp/home-${word}-${mode}-${width}.png`)});await page.reload();await page.waitForFunction(()=>window.worldLearning?.ready);assert.deepEqual((await page.evaluate(()=>worldLearning.learning())).words[word],saved);assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
