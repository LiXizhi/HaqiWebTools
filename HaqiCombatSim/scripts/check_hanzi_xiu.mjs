// Standalone browser acceptance: node scripts/check_hanzi_xiu.mjs --playwright <package path>
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const args=process.argv.slice(2);
const option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const {chromium}=createRequire(import.meta.url)(option('--playwright','playwright'));
const output=path.resolve('.cache/hanzi-xiu');fs.mkdirSync(output,{recursive:true});
const html=fs.readFileSync(new URL('../hanzi/hanzi_xiu.html',import.meta.url));
const server=http.createServer((req,res)=>{if(req.url==='/hanzi/hanzi_xiu.html'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);}else{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:option('--channel','msedge'),headless:true});
const report=[];
try{
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},hasTouch:mobile,isMobile:mobile,reducedMotion:mobile?'reduce':'no-preference'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install();
  await page.goto(`http://127.0.0.1:${server.address().port}/hanzi/hanzi_xiu.html`);
  const screenshot=async name=>{await page.clock.runFor(900);await page.screenshot({path:path.join(output,`${mobile?'mobile':'desktop'}-${name}.png`)});};
  const advance=async ms=>{await page.clock.runFor(ms);};
  const state=()=>page.locator('body').getAttribute('data-scene');
  const expectState=async expected=>assert.equal(await state(),expected);
  const screenPoint=async(x,y)=>page.locator('#stage').evaluate((svg,{x,y})=>{const p=new DOMPoint(x,y).matrixTransform(svg.getScreenCTM());return{x:p.x,y:p.y};},{x,y});
  await screenshot('intro');
  assert.equal(await page.locator('#targets').isVisible(),false);
  await page.getByRole('button',{name:'走进故事',exact:true}).click();await advance(7800);await expectState('tree');
  await page.getByRole('button',{name:'点一点小树',exact:true}).click();await advance(2800);await expectState('move');
  // A failed drop restores the person; an interrupted drag cannot advance the story.
  let p=await screenPoint(238,320);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(-30,-30,{steps:8});await page.mouse.up();await expectState('move');
  assert.equal(await page.locator('#person').getAttribute('transform'),'translate(-200 0)');
  p=await screenPoint(238,320);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.locator('#stage').dispatchEvent('pointercancel',{pointerId:1});await page.mouse.up();await expectState('move');
  if(mobile){
   // Actual touch tap alternative, followed by a touch path below.
   p=await screenPoint(238,320);await page.touchscreen.tap(p.x,p.y);p=await screenPoint(485,395);await page.touchscreen.tap(p.x,p.y);
  }else{
   p=await screenPoint(238,320);await page.mouse.move(p.x,p.y);await page.mouse.down();p=await screenPoint(480,350);await page.mouse.move(p.x,p.y,{steps:20});await page.mouse.up();
  }
  await expectState('rest');await advance(mobile?650:3650);await screenshot('rest');
  await advance(mobile?6400:8000);await screenshot('morph');
  await advance(12000);await expectState('write');await screenshot('writing');
  // A tap and a reversed attempt must not count as a completed stroke.
  p=await screenPoint(436,116);await page.mouse.click(p.x,p.y);assert.match(await page.locator('#caption').textContent(),/第 1 笔/);
  p=await screenPoint(351,232);await page.mouse.click(p.x,p.y);assert.match(await page.locator('#caption').textContent(),/第 1 笔/);
  p=await screenPoint(436,116);await page.mouse.move(p.x,p.y);await page.mouse.down();
  await page.setViewportSize(mobile?{width:398,height:844}:{width:1448,height:1000});await advance(100);await page.mouse.up();
  await page.setViewportSize(mobile?{width:390,height:844}:{width:1440,height:1000});await advance(100);
  assert.match(await page.locator('#caption').textContent(),/第 1 笔/);
  const session=mobile?await context.newCDPSession(page):null;
  for(let i=0;i<6;i++){
   const points=await page.locator('#ghosts path').nth(i).evaluate(el=>{const len=el.getTotalLength(),matrix=el.getScreenCTM();return Array.from({length:Math.ceil(len/4)+1},(_,i)=>{const p=el.getPointAtLength(Math.min(len,i*4));const q=new DOMPoint(p.x,p.y).matrixTransform(matrix);return{x:q.x,y:q.y};});});
   if(mobile){
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[points[0]]});
    for(const q of points.slice(1))await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[q]});
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   }else{
    await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();for(const q of points.slice(1))await page.mouse.move(q.x,q.y);await page.mouse.up();
   }
   if(i<5)assert.match(await page.locator('#caption').textContent(),new RegExp(`第 ${i+2} 笔`));
  }
  await expectState('written');await screenshot('completed');await advance(12500);await expectState('done');await screenshot('finale');
  // Replay from completion resets the start dot and all previously written paths.
  await page.getByRole('button',{name:'再看一次',exact:true}).click();await advance(7800);
  await page.getByRole('button',{name:'点一点小树',exact:true}).click();await advance(2800);
  await page.getByRole('button',{name:'选中小人',exact:true}).click();await page.getByRole('button',{name:'走到树荫里',exact:true}).click();await advance(24000);await expectState('write');
  assert.equal(await page.locator('#startDot').isVisible(),true);
  await page.getByRole('button',{name:'看示范',exact:true}).click();await advance(1000);
  await page.getByRole('button',{name:'重新开始',exact:true}).click();await advance(18000);await expectState('tree');
  // Old demonstration callbacks must not resume after a restart.
  assert.equal(await page.locator('#writing').isVisible(),false);
  await page.getByRole('button',{name:'点一点小树',exact:true}).click();await advance(2800);
  await page.getByRole('button',{name:'选中小人',exact:true}).click();await page.getByRole('button',{name:'走到树荫里',exact:true}).click();await advance(24000);
  await page.getByRole('button',{name:'看示范',exact:true}).click();await advance(27000);await expectState('done');
  assert.deepEqual(errors,[]);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);
  report.push({sha256:createHash('sha256').update(html).digest('hex'),viewport:mobile?'390×844':'1440×1000',input:mobile?'touch':'mouse',reducedMotion:mobile,manualSixStrokes:true,demonstration:true,restartDuringDemo:true,cancelAndResize:true,errors});
  await context.close();
 }
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
