import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('listening, reading and writing stories keep the chosen object and distinguish audio fallback evidence',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:240000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});
 try{for(const word of ['book','cup','ball'])for(const width of [1280,390]){
  console.log({word,width});
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/home-learning-world.html?rehearsal=${word}`);await page.waitForFunction(()=>window.worldLearning?.ready);
  const state=()=>page.evaluate(()=>worldLearning.learning()),objects=()=>page.evaluate(()=>worldLearning.schoolObjects());
  const open=async()=>{await page.getByRole('button',{name:'家园设置',exact:true}).click();await page.getByRole('button',{name:'情境练习',exact:true}).click();await page.getByRole('button',{name:({book:'阅读角的书本标签',cup:'认得自己的杯子',ball:'留给下一场游戏的球'})[word],exact:true}).click();};
  const intro=async()=>{await page.locator('.rpg-dialogue').waitFor();for(let i=0;i<8&&await page.locator('.rpg-dialogue').count();i++)await page.getByRole('button',{name:'我来帮你',exact:true}).click();};
  const canvas=await page.locator('.home-canvas').boundingBox(),pick=async(x,y)=>page.mouse.click(canvas.x+canvas.width/2+x*40+20,canvas.y+canvas.height/2+y*40+10);
  await open();await intro();assert.ok(!(await page.locator('.language-practice-modal').textContent()).includes(`Find the ${word}.`));await pick(3,0);await page.getByRole('status').filter({hasText:'先听伙伴说完'}).waitFor();assert.equal((await state()).words[word].comprehension,undefined);
  if(width===390){await page.evaluate(()=>worldLearning.failSpeech=true);await page.getByRole('button',{name:'听伙伴的请求',exact:true}).click();await page.getByRole('status').filter({hasText:'测试语音不可用'}).waitFor();await page.evaluate(()=>{worldLearning.failSpeech=false;worldLearning.speechGate=new Promise(resolve=>worldLearning.releaseSpeech=resolve);});await page.getByRole('button',{name:'听伙伴的请求',exact:true}).click();await page.getByRole('button',{name:'改为读线索',exact:true}).click();await page.evaluate(()=>worldLearning.releaseSpeech());await page.getByRole('status').filter({hasText:'本轮记录阅读练习'}).waitFor();}
  else{await page.getByRole('button',{name:'听伙伴的请求',exact:true}).click();await page.getByRole('status').filter({hasText:'听完了'}).waitFor();}
  await pick(3,0);await page.getByRole('button',{name:'继续故事',exact:true}).waitFor();let record=(await state()).words[word];assert.equal(record.practiceCount,1);assert.equal(Object.values((await state()).homeStories)[0].objects[0],'book2');assert.equal(record.comprehension[width===390?'read':'listen'].count,1);if(width===390)assert.equal(record.comprehension.listen,undefined);
  await page.reload();await page.waitForFunction(()=>window.worldLearning?.ready);await open();await intro();await page.screenshot({path:path.join(root,`tmp/home-modal-read-${word}-${width}.png`)});await pick(.2,.6);await page.getByRole('status').filter({hasText:'还不是这件'}).waitFor();await pick(3,0);await page.getByRole('button',{name:'继续故事',exact:true}).click();await intro();await page.getByRole('button',{name:'给物品写标签',exact:true}).click();await page.getByRole('textbox',{name:'作品标签'}).fill(`My ${word}.`);await page.getByRole('button',{name:'保存标签',exact:true}).click();await page.getByRole('button',{name:'继续故事',exact:true}).click();await page.getByRole('status').filter({hasText:'留下了你写的标签'}).waitFor();
  record=(await state()).words[word];assert.equal(record.practiceCount,2);assert.equal(record.comprehension.read.count,width===390?2:1);assert.equal(record.comprehension.read.last.attempts,2);assert.equal((await objects()).book2.label,`My ${word}.`);assert.equal((await objects()).book.label,undefined);assert.equal(Object.values((await state()).homeStories)[0].next,3);await page.screenshot({path:path.join(root,`tmp/home-modal-${word}-${width}.png`)});assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
