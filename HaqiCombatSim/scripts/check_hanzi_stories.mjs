import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {stories} from '../hanzi/source/stories.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
const out=path.join(root,'tmp/hanzi-stories');await fs.mkdir(out,{recursive:true});
const server=http.createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://local').pathname;const target=path.resolve(root,'.'+pathname);if(!target.startsWith(root)){res.writeHead(403).end();return;}res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json'})[path.extname(target)]||'text/plain');res.end(await fs.readFile(target));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,channel:'msedge'}),report=[];
const selected=process.argv.includes('--smoke')?stories.slice(0,1):stories;
try{
 for(const viewport of [{width:1440,height:900},{width:390,height:844},{width:844,height:390},{width:768,height:1024}]){
  if(process.argv.includes('--smoke')&&viewport.width!==1440)continue;
  for(const story of selected){
   const page=await browser.newPage({viewport,reducedMotion:process.argv.includes('--motion')?'no-preference':'reduce'}),errors=[],requests=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
   await page.clock.install();await page.goto(`${base}/hanzi/hanzi_${story.id.replaceAll('-','_')}.html`);
   await page.clock.runFor(100);const state=()=>page.evaluate(()=>window.hanziStoryState());
   assert.equal((await state()).phase,-1);
   await page.locator('#start').click();await page.locator('#action').click();
   await page.locator('#action').click({clickCount:1});await page.locator('#action').click();await page.locator('#action').click();
   assert.equal((await state()).phase,2);
   if(!process.argv.includes('--functional'))await page.screenshot({path:path.join(out,`${story.id}-${viewport.width}-scene.png`)});
   if(process.argv.includes('--motion')){await page.clock.runFor(2700);await page.screenshot({path:path.join(out,`${story.id}-${viewport.width}-morph.png`)});await page.clock.runFor(2900);}else await page.clock.runFor(5600);assert.equal((await state()).phase,3);
   await page.locator('#action').click();assert.equal((await state()).phase,4);
   if(!process.argv.includes('--functional'))await page.screenshot({path:path.join(out,`${story.id}-${viewport.width}-writing.png`)});
   if(process.argv.includes('--visual')){assert.deepEqual(errors,[]);report.push({id:story.id,viewport,kind:'visual',passed:true});await page.close();console.log(`${story.glyph} ${viewport.width} visual`);continue;}
   for(let i=0;i<30&&(await state()).phase===4;i++){await page.locator('#demo').click();await page.clock.runFor(1400);}
   assert.equal((await state()).phase,5);
   assert.deepEqual(errors,[]);assert.ok(requests.every(u=>u.startsWith(base)),'standalone must not fetch dependencies');
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);
   for(const selector of ['#capText','#hint','#replay','#pause','#mute']){const box=await page.locator(selector).boundingBox();assert.ok(box&&box.x>=0&&box.y>=0&&box.x+box.width<=viewport.width+1&&box.y+box.height<=viewport.height+1,`${story.id} ${selector} out of viewport`);}
   await page.locator('#replay').click();assert.equal((await state()).phase,-1);assert.equal((await state()).stroke,0);
   report.push({id:story.id,viewport,passed:true});await page.close();console.log(`${story.glyph} ${viewport.width} complete`);
  }
 }
}finally{const name=process.argv.includes('--visual')?'visual-report.json':process.argv.includes('--motion')?'motion-report.json':process.argv.includes('--smoke')?'smoke-report.json':'report.json';await fs.writeFile(path.join(out,name),JSON.stringify(report,null,2));await browser.close();await new Promise(r=>server.close(r));}
