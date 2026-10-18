import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const args=process.argv.slice(2),option=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const {chromium}=createRequire(import.meta.url)(option('--playwright','playwright'));
const output=option('--out','tmp/battle-camera');await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,...(option('--executable',null)?{executablePath:option('--executable')}: {})});
const report=[],errors=[];
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 for(const [name,width,height] of [['desktop',1100,760],['phone',390,844],['landscape',844,390]]){
  await page.setViewportSize({width,height});
  await page.goto(option('--url','http://127.0.0.1:8774')+'/tests/fixtures/battle-camera.html');
  await page.waitForFunction(()=>window.cameraReady,null,{timeout:120000});
  await page.evaluate(()=>window.cameraPreview.sample('strike',.2));
  await page.waitForTimeout(1800);
  for(const enemy of [false,true])for(const kind of ['strike','area','summon','support','one','two','pass','fizzle'])for(const progress of [.2,.5,.76,1]){
   const result=await page.evaluate(({kind,progress,enemy})=>window.cameraPreview.sample(kind,progress,enemy),{kind,progress,enemy});
   assert.equal(result.eventsUnchanged,true);
   assert.equal(result.camera.active,progress<1);
   assert.equal(result.handHidden,progress<1);
   for(const p of Object.values(result.positions))assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
   if(progress===.2){
    const focus=result.positions[result.camera.focusId];
    assert.ok(focus.x>=0&&focus.x<=width);assert.ok(focus.y>0&&focus.y<height);
    await page.screenshot({path:`${output}/${name}-${kind}-${enemy?'enemy':'hero'}.png`});
   }
   if(!enemy&&kind==='summon'&&progress===.5)await page.screenshot({path:`${output}/${name}-summon-reveal.png`});
   if(!enemy&&kind==='strike'&&progress===.76)await page.screenshot({path:`${output}/${name}-impact.png`});
   report.push({name,kind,enemy,progress,ms:result.ms});
  }
  for(const enemy of [false,true])for(const progress of [.025,.94]){
   const result=await page.evaluate(({enemy,progress})=>window.cameraPreview.sample('strike',progress,enemy),{enemy,progress});
   for(const p of Object.values(result.positions))assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
   await page.screenshot({path:`${output}/${name}-transition-${enemy}-${progress}.png`});
   report.push({name,kind:'transition',enemy,progress,ms:result.ms});
  }
  for(const enemy of [false,true])for(const kind of ['damage','dot','reflection','lethal','blocked']){
   const result=await page.evaluate(({kind,enemy})=>window.cameraPreview.damage(kind,.2,enemy),{kind,enemy});
   assert.equal(result.feedback.hits.length,kind==='blocked'?0:1);
   if(kind!=='blocked')assert.notEqual(result.feedback.shakeX,0);
   assert.equal(result.eventsUnchanged,true);
   if(!enemy)await page.screenshot({path:`${output}/${name}-${kind}.png`});
   report.push({name,kind,enemy,progress:.2,ms:result.ms});
  }
  const pointer=await page.evaluate(()=>window.cameraPreview.sample('pointer',.5));assert.equal(pointer.camera.active,false);assert.equal(pointer.handHidden,false);
  const idle=await page.evaluate(()=>window.cameraPreview.sample('idle'));assert.equal(idle.camera.active,false);assert.equal(idle.handHidden,false);
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal((await page.evaluate(()=>window.cameraPreview.sample('strike',.2))).camera.active,false);
  await page.emulateMedia({reducedMotion:'no-preference'});
 }
 assert.deepEqual(errors,[]);
 const times=report.map(r=>r.ms).sort((a,b)=>a-b);
 const result={samples:report.length,errors,p50:times[Math.floor(times.length*.5)],p95:times[Math.floor(times.length*.95)],max:times.at(-1),report};
 await writeFile(`${output}/report.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({...result,report:undefined}));
}finally{await browser.close();}
