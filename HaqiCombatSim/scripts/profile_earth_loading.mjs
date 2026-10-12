// Isolated browser, in-memory character; profiles Earth entry, not game boot.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
const args=process.argv.slice(2),option=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const {chromium}=createRequire(import.meta.url)(option('--playwright',process.env.HAQI_PLAYWRIGHT_PACKAGE||'playwright'));
const root=path.resolve('.'),output=path.resolve(option('--output','.cache/earth-loading/current')),baseline=option('--baseline','');
fs.mkdirSync(output,{recursive:true});
if(args.includes('--snapshot')){fs.mkdirSync(path.join(output,'js'),{recursive:true});fs.cpSync('js',path.join(output,'js'),{recursive:true});}
const types={'.html':'text/html','.js':'application/javascript','.json':'application/json','.css':'text/css','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.txt':'text/plain'};
const server=http.createServer((req,res)=>{
 const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1),file=path.resolve(root,name);
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 try{const archived=baseline&&name.startsWith('js/')?path.resolve(baseline,name):null,source=archived&&fs.existsSync(archived)?archived:file;let body=fs.readFileSync(source);
 if(name==='tests/fixtures/earth.html')body=body.toString().replace('const p=await service.prepare(geo);','const p=await service.prepare(geo,{onProgress:row=>window.earthLoadPhases.push({...row,at:performance.now()})});');
 res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(body);
 }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,channel:option('--channel','msedge')}),rows=[];
const config={width:390,height:844,dpr:2,hardwareConcurrency:4,scope:'Earth entry after local game boot; fresh browser context; real CDN Earth art',cpu:Number(option('--cpu','4')),latency:Number(option('--latency','150')),mbps:Number(option('--mbps','10')),art:option('--art','cdn'),city:option('--city','montreal')};
const destinations={montreal:{lon:-73.5673,lat:45.5019},shenzhen:{lon:114.0579,lat:22.5431},newyork:{lon:-73.985,lat:40.758}};
try{for(let round=0;round<Number(option('--repeats','1'));round++){
 const context=await browser.newContext({viewport:{width:config.width,height:config.height},deviceScaleFactor:config.dpr,isMobile:true,hasTouch:true}),page=await context.newPage(),cdp=await context.newCDPSession(page),errors=[],requests=new Map();
 page.on('pageerror',error=>{errors.push(error.message);console.error('pageerror:',error.message);});
 await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/earth.html?profile=1&assets=local`);
 try{await page.waitForFunction(()=>!!window.earthWalkingQA&&document.querySelector('#result').textContent.startsWith('启动完成'),null,{timeout:45000});}catch(error){await page.screenshot({path:path.join(output,'boot-error.png')});console.error(await page.locator('#result').textContent(),errors);throw error;}
 // Let the old island finish its lazy image requests before isolating Earth entry.
 await page.waitForTimeout(1000);await page.waitForLoadState('networkidle',{timeout:30000});
 await cdp.send('Network.enable');
 await cdp.send('Emulation.setHardwareConcurrencyOverride',{hardwareConcurrency:4});
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:config.cpu});
 await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:config.latency,downloadThroughput:config.mbps*1e6/8,uploadThroughput:1e6/8});
 cdp.on('Network.requestWillBeSent',r=>requests.set(r.requestId,{url:r.request.url,start:r.timestamp,type:r.type}));
 cdp.on('Network.loadingFinished',r=>{const row=requests.get(r.requestId);if(row)Object.assign(row,{ms:(r.timestamp-row.start)*1000,bytes:r.encodedDataLength});});
 cdp.on('Network.loadingFailed',r=>{const row=requests.get(r.requestId);if(row)row.error=r.errorText;});
 await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
 console.log(JSON.stringify({phase:'start',round,config,baseline}));
 const result=await page.evaluate(async({geo,art})=>{
  history.replaceState({},'',`?profile=1${art==='local'?'&assets=local':''}`);haqiPerformance.reset();window.earthLoadPhases=[];
  const start=performance.now(),milestones={};let lastStats=null;
  const done=new Promise(resolve=>{function tick(){const world=earthWalkingQA.world,s=world.surfaceStats;lastStats=s;
   if(world.isEarth&&milestones.scene==null)milestones.scene=performance.now()-start;
   if(s?.artReady&&milestones.images==null)milestones.images=performance.now()-start;
   if(s?.visibleReady&&milestones.firstTile==null)milestones.firstTile=performance.now()-start;
   if(s?.artReady&&s.visibleTotal>0&&s.visibleReady===s.visibleTotal){milestones.visible=performance.now()-start;resolve();return;}
   if(performance.now()-start>90000){milestones.timeout=true;resolve();return;}requestAnimationFrame(tick);
  }requestAnimationFrame(tick);});
  const travel=earthWalkingQA.travel(geo).then(()=>{milestones.travel=performance.now()-start;});
  await done; // Do not wait for non-critical social/background art to finish.
  return {milestones,phases:earthLoadPhases,stats:lastStats,diagnostics:haqiPerformance.summary(),timeline:haqiPerformance.timeline(),scene:{name:earthWalkingQA.world.layout.name,buildings:earthWalkingQA.world.buildings.length,roads:earthWalkingQA.world.paths.length},message:document.querySelector('#result').textContent};
 },{geo:destinations[config.city],art:config.art});
 const {profile}=await cdp.send('Profiler.stop');fs.writeFileSync(path.join(output,`${round}.cpuprofile`),JSON.stringify(profile));
 const weights=new Map();for(let i=0;i<(profile.samples||[]).length;i++)weights.set(profile.samples[i],(weights.get(profile.samples[i])||0)+profile.timeDeltas[i]/1000);
 result.cpu=profile.nodes.map(n=>({name:n.callFrame.functionName,url:n.callFrame.url,line:n.callFrame.lineNumber+1,ms:weights.get(n.id)||0})).sort((a,b)=>b.ms-a.ms).slice(0,35);
 rows.push({...result,round,errors,requests:[...requests.values()]});
 if(errors.length||result.milestones.timeout)process.exitCode=1;
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({config,browser:await browser.version(),baseline,rows},null,2));
 await page.screenshot({path:path.join(output,`${round}.png`)});console.log(JSON.stringify({phase:'result',round,...result.milestones,world:result.scene,cpu:result.cpu.slice(0,8),errors}));
 await context.close();
 }}finally{await browser.close();server.close();}
