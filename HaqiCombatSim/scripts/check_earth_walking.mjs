// Real browser perf acceptance. Uses an isolated browser and in-memory character.
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const args=process.argv.slice(2),option=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const packageRoot=option('--playwright',process.env.HAQI_PLAYWRIGHT_PACKAGE||'playwright');
const require=createRequire(import.meta.url),{chromium}=require(packageRoot);
const seconds=Number(option('--seconds','180')),repeats=Number(option('--repeats','3')),soak=Number(option('--soak','600')),url=option('--url','http://127.0.0.1:8796'),output=path.resolve(option('--output','.cache/earth-walking-report.json'));
const sourceDigest=createHash('sha256');for(const file of fs.readdirSync('js').filter(n=>n.endsWith('.js')).sort())sourceDigest.update(file).update(fs.readFileSync(path.join('js',file)));const sourceHash=sourceDigest.digest('hex');
const browser=await chromium.launch({headless:!args.includes('--headed'),channel:option('--channel','msedge')}),context=await browser.newContext({viewport:{width:1280,height:720}}),page=await context.newPage(),errors=[],rows=[];
// Test-only route injection exposes the real app's controller in this isolated profile.
// No automation hook or new save fields are shipped to players.
if(args.includes('--main'))await page.route('**/js/adventure_app.js',async route=>{
    const response=await route.fetch();let source=await response.text();
    source=source.replace('lastFrame=now;const wasMoving=moving;moving=false;','lastFrame=now;const wasMoving=moving;moving=false;const qaPrevious=qaProbe?{...save.position}:null;if(qaProbe)joystick=qaProbe.direction(save.position,dt);');
    source=source.replace('    const rewardEffect=rewardFeedback.tick(',`    if(qaProbe){qaProbe.moved(qaPrevious,save.position,now);if(qaProbe.done(now)){const result=qaProbe.result(save.position);result.stream=earthService.streamStats;qaProbe=null;joystick={x:0,y:0};qaResolve(result);}}\n    const rewardEffect=rewardFeedback.tick(`);
    source+=`\nimport {createEarthWalkProbe} from '../tests/fixtures/earth-walk-probe.js';
let qaProbe=null,qaResolve=null;
globalThis.earthWalkingQA={ready:()=>stage==='title'&&!!assets,async create(){const next=A.createAdventure(assets.content,{name:'步行性能验收',school:'fire',seed:731});next.languageLearning={...next.languageLearning,native:'zh-CN',target:'en',selectionConfirmed:true};await activateRole(roleStore.create(next));},travel:travelEarth,get world(){return world;},get save(){return save;},start(options){close();resetMovementInput();perf.reset();qaProbe=createEarthWalkProbe(world,save.position,options);return new Promise(resolve=>qaResolve=resolve);}};`;
    await route.fulfill({response,body:source});
});
page.on('pageerror',e=>errors.push(e.message));
const trace=[];let cdp=null;
if(args.includes('--cpu')){cdp=await context.newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:500});}
if(args.includes('--trace')){
    cdp??=await context.newCDPSession(page);cdp.on('Tracing.dataCollected',({value})=>{for(const event of value)if(event.ph==='X'&&event.dur>=33000)trace.push({name:event.name,category:event.cat,pid:event.pid,tid:event.tid,start:event.ts,duration:event.dur/1000,args:event.args});});
    await cdp.send('Tracing.start',{categories:'-*,devtools.timeline,v8,disabled-by-default-v8.gc',transferMode:'ReportEvents'});
}
const report=async()=>({browser:await browser.version(),sourceHash,entry:args.includes('--main')?'Haqi.html':'tests/fixtures/earth.html',headless:!args.includes('--headed'),viewport:{width:1280,height:720},seconds,repeats,soak,rows,errors,trace});
fs.mkdirSync(path.dirname(output),{recursive:true});
try{
    await page.goto(url+(args.includes('--main')?'/Haqi.html':'/tests/fixtures/earth.html')+'?profile=1');await page.waitForFunction(()=>window.earthWalkingQA&&(!earthWalkingQA.ready||earthWalkingQA.ready()),{timeout:90000});
    if(args.includes('--main'))await page.evaluate(()=>earthWalkingQA.create());
    for(const scene of [{id:'city',geo:{lon:113.9904,lat:22.532}},{id:'wilderness',geo:{lon:146,lat:-24.2}}])for(let round=0;round<repeats;round++){
        console.log(JSON.stringify({phase:'prepare',scene:scene.id,round}));
        await page.evaluate(geo=>earthWalkingQA.travel(geo),scene.geo);
        await page.waitForFunction(()=>earthWalkingQA.world.isEarth&&earthWalkingQA.world.surfaceStats?.artReady&&!earthWalkingQA.world.surfaceStats.active&&!earthWalkingQA.world.surfaceStats.queued,{timeout:60000});
        if(args.includes('--cpu'))await cdp.send('Profiler.start');
        const result=await page.evaluate(async seconds=>earthWalkingQA.start({seconds}),seconds);
        if(args.includes('--cpu')){const {profile}=await cdp.send('Profiler.stop');fs.writeFileSync(output.replace(/\.json$/,`-${scene.id}-${round}.cpu.json`),JSON.stringify(profile));}
        const row={...result,scene:scene.id,round};rows.push(row);fs.writeFileSync(output,JSON.stringify(await report(),null,2));
        console.log(JSON.stringify({phase:'result',scene:scene.id,round,travelled:row.travelled,crossings:row.crossings,terrainCrossings:row.terrainCrossings,frame:row.diagnostics.frame,longTasks:row.diagnostics['long-task'],commit:row.diagnostics['earth-commit'],valid:row.valid}));
    }
    if(soak>0){console.log(JSON.stringify({phase:'soak',seconds:soak}));await page.evaluate(geo=>earthWalkingQA.travel(geo),{lon:113.9904,lat:22.532});await page.waitForFunction(()=>earthWalkingQA.world.surfaceStats?.artReady&&!earthWalkingQA.world.surfaceStats.active&&!earthWalkingQA.world.surfaceStats.queued,{timeout:60000});const result=await page.evaluate(async options=>earthWalkingQA.start(options),{seconds:soak,span:50000});rows.push({...result,scene:'soak'});fs.writeFileSync(output,JSON.stringify(await report(),null,2));console.log(JSON.stringify({phase:'soak-result',travelled:result.travelled,crossings:result.crossings,frame:result.diagnostics.frame,samples:result.samples}));}
    await page.screenshot({path:path.join(path.dirname(output),'earth-walking-final.png')});
    const streaming=['earth-prepare-slice','earth-commit','earth-render-terrain','earth-render-objects','earth-render-actors','earth-atlas-readback'];
    for(const row of rows)row.streamingFrameHitches=row.timeline.hitches.filter(h=>h.name==='frame'&&h.events.some(e=>streaming.includes(e.name)&&e.detail?.duration>8&&e.time>=h.time-h.duration));
    if(errors.length||rows.some(r=>!r.valid||r.diagnostics.frame?.p99>20||r.diagnostics['long-task']?.count>0||r.streamingFrameHitches.length))process.exitCode=1;
}finally{if(cdp&&args.includes('--trace')){await new Promise(resolve=>{cdp.once('Tracing.tracingComplete',resolve);void cdp.send('Tracing.end');});}fs.writeFileSync(output,JSON.stringify(await report(),null,2));await browser.close();}
