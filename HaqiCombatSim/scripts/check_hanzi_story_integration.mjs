import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(root)){res.writeHead(403).end();return;}res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json'})[path.extname(file)]||'text/plain');res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,channel:'msedge'}),report=[];
const advance=async(page,frame)=>{await frame.locator('#start').click();await frame.locator('#action').click();for(let i=0;i<3;i++)await frame.locator('#action').click();await page.clock.runFor(5600);await frame.locator('#action').click();};
const finish=async(page,frame)=>{while(await frame.locator('#demo').isVisible()){await frame.locator('#demo').click();await page.clock.runFor(1400);}};
try{
 for(const locale of ['en','ja','ko','zh-CN']){
  const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install();
  await page.goto(`${base}/tests/fixtures/hanzi-story-protocol.html?locale=${locale}&subtitle=${locale==='zh-CN'?'en':locale}`);
  const frame=page.frameLocator('#story');await frame.locator('.haqi-sub-trans').waitFor();
  assert.ok((await frame.locator('#capText').textContent()).startsWith('小船还在岸边'));assert.notEqual(await frame.locator('.haqi-sub-trans').textContent(),'小船还在岸边，太阳还没醒。');
  assert.equal(await frame.locator('#start .haqi-sub-trans').count(),0);if(locale==='zh-CN')assert.equal(await frame.locator('#start').textContent(),'开始');else assert.notEqual(await frame.locator('#start').textContent(),'开始');
  assert.equal((await page.evaluate(()=>storyEvents)).some(e=>e.type==='written'||e.type==='completed'),false);
  await advance(page,frame);
  await frame.locator('#pause').click();await frame.locator('#demo').click();await page.clock.runFor(1800);assert.equal(await page.frames()[1].evaluate(()=>hanziStoryState().stroke),0);await frame.locator('#pause').click();
  await finish(page,frame);await page.clock.runFor(100);
  const events=await page.evaluate(()=>storyEvents);assert.deepEqual(events.filter(e=>typeof e==='string'),['written','completed']);assert.ok(events.some(e=>e.type==='translate'&&e.sessionId==='isolated-session'));
  await page.screenshot({path:path.join(root,`tmp/hanzi-stories/embedded-${locale}.png`)});assert.deepEqual(errors,[]);report.push({case:'embedded-'+locale,passed:true});await page.close();
 }
 // Manual tracing includes a turn, a short stroke, invalid release and keyboard access.
 {
  const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});await page.clock.install();await page.goto(`${base}/hanzi/hanzi_ri.html`);await advance(page,page);
  const canvas=page.locator('canvas'),box=await canvas.boundingBox(),scale=Math.min(box.width/(box.width<600&&box.height>box.width?560:760),box.height/540);
  const data=JSON.parse(await fs.readFile(path.join(root,'data/adventure/dictionary/zh.json'),'utf8')).entries.find(e=>e.id==='ri');
  const screen=p=>({x:box.x+box.width/2+(p[0]-512)*.46*scale,y:box.y+box.height/2+(450-p[1])*.46*scale});
  await page.mouse.click(box.x+5,box.y+5);assert.equal(await page.evaluate(()=>hanziStoryState().stroke),0);
  for(let i=0;i<data.strokes.medians.length;i++){
   const points=data.strokes.medians[i],start=screen(points[0]);await page.mouse.move(start.x,start.y);await page.mouse.down();
   if(i===0){await page.mouse.up();assert.equal(await page.evaluate(()=>hanziStoryState().stroke),0);await page.mouse.down();}
   for(let j=1;j<points.length;j++){const p=screen(points[j]);await page.mouse.move(p.x,p.y,{steps:18});}await page.mouse.up();assert.equal(await page.evaluate(()=>hanziStoryState().stroke),i+1);
  }
  assert.equal(await page.evaluate(()=>hanziStoryState().phase),5);await page.locator('#replay').click();await advance(page,page);await canvas.focus();await page.keyboard.press('Space');await page.clock.runFor(1400);assert.equal(await page.evaluate(()=>hanziStoryState().stroke),1);report.push({case:'pointer-tracing-and-keyboard',passed:true});await page.close();
 }
 // A late parent handshake must recover real completion, without blocking standalone use.
 {
  const page=await browser.newPage({viewport:{width:1000,height:800},reducedMotion:'reduce'});await page.clock.install();await page.goto(`${base}/tests/fixtures/hanzi-story-protocol.html?late=1`);const frame=page.frameLocator('#story');await advance(page,frame);await finish(page,frame);
  assert.equal((await page.evaluate(()=>storyEvents)).some(e=>e.type==='written'),false);
  await page.evaluate(()=>document.querySelector('iframe').contentWindow.postMessage({channel:'haqi-hanzi',version:1,type:'init',entryId:'late',sessionId:'late-session',locale:'zh-CN'},location.origin));await page.clock.runFor(100);
  const events=await page.evaluate(()=>storyEvents);assert.deepEqual(events.filter(e=>['written','completed'].includes(e.type)).map(e=>e.type),['written','completed']);report.push({case:'late-init',passed:true});await page.close();
 }
 // Real dictionary controller + view + iframe, with isolated fixture storage.
 {
  const page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install();await page.goto(`${base}/tests/fixtures/dictionary.html?language=zh&entry=wu`);
  await page.getByRole('button',{name:'有动画 · 看看这个字的故事',exact:true}).click();const frame=page.frameLocator('iframe');await frame.locator('#start').waitFor();assert.equal(await frame.locator('h1').textContent(),'舞');await advance(page,frame);await finish(page,frame);assert.deepEqual(errors,[]);report.push({case:'real-dictionary-dance',passed:true});await page.close();
 }
 console.log(JSON.stringify(report));
}finally{await fs.writeFile(path.join(root,'tmp/hanzi-stories/integration-report.json'),JSON.stringify(report,null,2));await browser.close();await new Promise(r=>server.close(r));}
