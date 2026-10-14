// node scripts/check_hanzi_xiangxing.mjs --playwright <installed package path>
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
const args=process.argv.slice(2), option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const {chromium}=createRequire(import.meta.url)(option('--playwright','playwright'));
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'.cache/hanzi-xiangxing');fs.mkdirSync(out,{recursive:true});
const allowed=new Set(['/hanzi/hanzi_xiangxing.html','/hanzi/xiangxing.js','/hanzi/xiangxing.css','/js/rng_core.js']);
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(!allowed.has(url.pathname)){res.writeHead(404);res.end();return;}const file=path.join(root,url.pathname);res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css':'text/javascript'});res.end(fs.readFileSync(file));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'msedge',headless:true});const report=[];
try{
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1050},isMobile:mobile,hasTouch:mobile,reducedMotion:mobile?'reduce':'no-preference'});
  const page=await context.newPage(),errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:'))external.push(r.url());});
  await page.clock.install();await page.goto(`http://127.0.0.1:${server.address().port}/hanzi/hanzi_xiangxing.html`);await page.clock.runFor(100);
  const prefix=mobile?'mobile':'desktop';await page.screenshot({path:path.join(out,`${prefix}-intro.png`),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.getByRole('button',{name:/展开长卷/}).click();await page.clock.runFor(3000);assert.ok(Number(await page.locator('#seek').inputValue())>2);
  await page.getByRole('button',{name:'暂停',exact:true}).click();const paused=await page.locator('#seek').inputValue();await page.clock.runFor(2000);assert.equal(await page.locator('#seek').inputValue(),paused);
  const seek=async value=>{await page.locator('#seek').fill(String(value));await page.locator('#seek').dispatchEvent('input');await page.clock.runFor(34);};
  const shots=await page.evaluate(async()=>{const {shots}=await import('/hanzi/xiangxing.js');return shots;});assert.equal(shots.length,23);
  for(let i=0;i<shots.length;i++){
   const s=shots[i];if(i)assert.equal(s.start,shots[i-1].end);await seek((s.start+s.end)/2);assert.equal(await page.locator('#sceneLabel').textContent(),s.title);
   if(!mobile||[0,5,17,21].includes(i))await page.screenshot({path:path.join(out,`${prefix}-${String(i).padStart(2,'0')}-${s.kind}.png`),fullPage:true});
  }
  await seek(125);await page.getByRole('button',{name:'下一景',exact:true}).click();assert.equal(await page.locator('#sceneLabel').textContent(),'春耕有时');await page.getByRole('button',{name:'上一景',exact:true}).click();assert.equal(await page.locator('#sceneLabel').textContent(),'一叶行舟');
  await page.locator('#chaptersToggle').click();await page.getByRole('button',{name:'礼乐相和，乐礼',exact:true}).click();assert.equal(await page.locator('#sceneLabel').textContent(),'礼乐相和');assert.equal(await page.locator('#chapters').isVisible(),false);
  await page.locator('#sound').click();assert.equal(await page.locator('#sound').getAttribute('aria-pressed'),'true');await page.locator('#sound').click();assert.equal(await page.locator('#sound').getAttribute('aria-pressed'),'false');
  await seek(20);await page.locator('#speed').selectOption('2');await page.locator('#play').click();await page.clock.runFor(3000);assert.ok(Number(await page.locator('#seek').inputValue())>25);await page.locator('#play').click();
  await seek(330);await page.locator('#play').click();await page.clock.runFor(2000);assert.equal(await page.locator('#end').isVisible(),true);await page.getByRole('button',{name:'再看一遍',exact:true}).click();await page.clock.runFor(500);assert.equal(await page.locator('#end').isVisible(),false);assert.ok(Number(await page.locator('#seek').inputValue())<2);
  await page.locator('#play').click();await seek(130);const before=await page.locator('#film').evaluate(c=>c.toDataURL());await seek(40);await seek(130);assert.equal(await page.locator('#film').evaluate(c=>c.toDataURL()),before,'seek must be deterministic');
  await page.locator('body').click({position:{x:1,y:1}});await page.keyboard.press('ArrowRight');assert.equal(Number(await page.locator('#seek').inputValue()),135);await page.keyboard.press('Space');await page.clock.runFor(1000);assert.ok(Number(await page.locator('#seek').inputValue())>136);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);report.push({viewport:prefix,shots:shots.length,errors,externalRequests:external.length,controls:'play, pause, seek, previous, next, chapters, speed, sound, end, replay, keyboard',deterministicSeek:true});await context.close();
 }
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
