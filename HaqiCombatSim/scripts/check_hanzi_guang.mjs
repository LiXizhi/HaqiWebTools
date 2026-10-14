// Standalone browser acceptance: node scripts/check_hanzi_guang.mjs --playwright <package path> [--channel chrome|msedge]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
const args=process.argv.slice(2);
const option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const {chromium}=createRequire(import.meta.url)(option('--playwright','playwright'));
const output=path.resolve('.cache/hanzi-guang');fs.mkdirSync(output,{recursive:true});
const html=fs.readFileSync(new URL('../hanzi/hanzi_guang.html',import.meta.url));
const external=[];
const server=http.createServer((req,res)=>{if(req.url==='/hanzi/hanzi_guang.html'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);}else{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const channel=option('--channel','');
const browser=await chromium.launch({...(channel?{channel}:{}),headless:true});
const report=[];
try{
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},hasTouch:mobile,isMobile:mobile,deviceScaleFactor:mobile?2:1});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('request',r=>{if(!r.url().startsWith(`http://127.0.0.1:${server.address().port}/hanzi/`)&&!r.url().startsWith('data:'))external.push(r.url());});
  await page.clock.install();
  await page.goto(`http://127.0.0.1:${server.address().port}/hanzi/hanzi_guang.html`);
  const tag=mobile?'mobile':'desktop';
  const shot=async name=>{await page.clock.runFor(200);await page.waitForTimeout(450);await page.screenshot({path:path.join(output,`${tag}-${name}.png`)});};
  const g=expr=>page.evaluate(expr);
  const until=async(expr,limit=120000,label=expr)=>{for(let t=0;t<limit;t+=250){if(await page.evaluate(expr))return;await page.clock.runFor(250);}throw new Error(`timeout: ${label}`);};
  const scr=(fn,...a)=>page.evaluate(([fn,a])=>window.__guang[fn](...a),[fn,a]);
  await page.clock.runFor(6000);await shot('01-intro');
  await page.getByRole('button',{name:'开始',exact:true}).click();
  await page.clock.runFor(9000);await shot('02-night');
  await until(`window.__guang.scene==='sKindle'&&document.body.classList.contains('hold')`);
  await shot('03-ember');
  // Kindle: press and hold on the stage.
  await page.mouse.move(mobile?195:720,mobile?380:420);await page.mouse.down();
  for(let i=0;i<10;i++){await page.clock.runFor(250);}
  await shot('04-blowing');
  await until(`window.__guang.state.fire>0`,8000,'fire ignites');await page.mouse.up();
  assert.equal((await g('window.__guang.interactions'))[0],'user');
  await page.clock.runFor(1500);await shot('05-flame');
  await until(`document.body.classList.contains('drag')`);
  // Lift: drag the bowl along the arc above her head; a short drag falls back.
  let b=await scr('liftPoint',0),s=await scr('toScreen',b.x,b.y);
  await page.mouse.move(s.x,s.y);await page.mouse.down();await page.mouse.move(s.x,s.y-30,{steps:4});await page.mouse.up();
  await page.clock.runFor(1500);assert.ok(await g('window.__guang.state.child.lift<0.2'),'short drag falls back');
  await page.mouse.move(s.x,s.y);await page.mouse.down();
  for(let i=1;i<=24;i++){const q=await scr('liftPoint',i/24);const p=await scr('toScreen',q.x,q.y);await page.mouse.move(p.x,p.y);await page.clock.runFor(30);}
  await shot('06-lifting');await page.mouse.up();await page.clock.runFor(100);
  assert.equal((await g('window.__guang.interactions'))[1],'user');
  await page.clock.runFor(3200);await shot('07-raised');
  await until(`window.__guang.scene==='sPass'`);await page.clock.runFor(6500);await shot('08-wide');
  for(let i=0;i<3;i++){
   await until(`window.__guang.state.lanterns[${i}].ready&&document.body.classList.contains('sky')`);
   if(i===1)await shot('09-lantern-ready');
   const L=await scr('lanternLamp',i),p=await scr('toScreen',L.x,L.y);
   await page.mouse.click(p.x,p.y);await page.clock.runFor(300);
  }
  assert.deepEqual((await g('window.__guang.interactions')).slice(2,5),['user','user','user']);
  await until(`window.__guang.scene==='sHome'`);await page.clock.runFor(5000);await shot('10-walking');
  await until(`window.__guang.state.father.reach>0.99`);await page.clock.runFor(1200);await shot('11-reunion');
  await until(`window.__guang.state.glyph.prog[5]>0.99&&window.__guang.state.glyph.morph===0`);await shot('12-oracle');
  await until(`window.__guang.state.glyph.labels>0.99`);await shot('13-labels');
  await until(`document.body.classList.contains('trace')&&window.__guang.state.glyph.ghost>0.99`);
  await shot('14-trace-start');
  // A stroke that starts away from the dot, or stops halfway, does not count.
  let pts=await page.evaluate(()=>window.__guang.strokes[0].map(([x,y])=>window.__guang.localToScreen(x,y)));
  const last=pts[pts.length-1];await page.mouse.move(last.x,last.y);await page.mouse.down();await page.mouse.move(pts[0].x,pts[0].y,{steps:6});await page.mouse.up();
  await page.mouse.move(pts[0].x,pts[0].y);await page.mouse.down();for(const q of pts.slice(0,30))await page.mouse.move(q.x,q.y);await page.mouse.up();
  await page.clock.runFor(400);assert.equal(await g('window.__guang.state.trace.stroke'),0);
  for(let i=0;i<6;i++){
   pts=await page.evaluate(i=>window.__guang.strokes[i].map(([x,y])=>window.__guang.localToScreen(x,y)),i);
   await page.mouse.move(pts[0].x,pts[0].y);await page.mouse.down();for(const q of pts.slice(1))await page.mouse.move(q.x,q.y);
   if(i===3)await shot('15-tracing');
   await page.mouse.up();await page.clock.runFor(120);
   assert.equal(await g('window.__guang.state.trace.stroke'),i+1,`stroke ${i+1}`);
  }
  assert.ok((await g('window.__guang.interactions')).includes('user'));
  await page.clock.runFor(2500);await shot('16-written');
  await until(`window.__guang.state.wordOn===1`);await page.clock.runFor(1500);await shot('17-words');
  await until(`window.__guang.finished`);
  await page.mouse.click(mobile?120:400,mobile?180:160);await page.clock.runFor(4000);await shot('18-finale');
  const overflow=await g('document.documentElement.scrollWidth>innerWidth');
  assert.equal(overflow,false);
  const interactions=await g('window.__guang.interactions.slice()');
  // Replay restarts from the night scene.
  await page.getByRole('button',{name:'重播',exact:true}).click();await page.clock.runFor(1500);
  assert.equal(await g('window.__guang.scene'),'sNight');
  assert.deepEqual(errors,[]);
  report.push({viewport:tag,interactions,errors:errors.length});
  await context.close();
 }
 assert.deepEqual(external,[]);
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,1));
 console.log(JSON.stringify(report),`screenshots: ${output}`);
}finally{await browser.close();server.close();}
