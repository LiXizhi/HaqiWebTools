// Isolated browser profiles only; no existing player accounts or saves are read.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const args=process.argv.slice(2),option=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const {chromium}=createRequire(import.meta.url)(option('--playwright',process.env.HAQI_PLAYWRIGHT_PACKAGE||'playwright'));
const output=path.resolve(option('--output','.cache/camp-expansion/after'));
fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const report={revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),browser:await browser.version(),dpr:2,rows:[],errors:[]};
const baseline=option('--baseline',null),overrides=new Map();
if(baseline){
 const prefix=execFileSync('git',['rev-parse','--show-prefix'],{encoding:'utf8'}).trim();
 const files=execFileSync('git',['diff','--name-only','--relative',baseline,'--','js','data/adventure/maps','data/adventure/chapter.json'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
 for(const file of files)overrides.set('/'+file,execFileSync('git',['show',baseline+':'+prefix+file],{maxBuffer:20*1024*1024}));
 report.baseline=baseline;
}
const injection=`
window.campQA={ready:()=>stage==='title'&&!!assets,
 async create(){const next=A.createAdventure(assets.content,{name:'营地验收',school:'fire',seed:731});next.languageLearning={...next.languageLearning,native:'zh-CN',target:'en',selectionConfirmed:true};await activateRole(roleStore.create(next));close();await assets.warmScenery(world);},
 async at(place){close();path=[];destination=null;keys.clear();joystick={x:0,y:0};const p=place==='plaza'?world.center:place==='woods'?world.layout.regions.find(r=>r.id==='woods'):world.portal;save.position=W.nearestWalkable(world,p.x,p.y);await assets.warmNearby(world,save);renderer.prepareScene(world,save);},
 cache:()=>renderer.terrainStats(),
 async sample(seconds,walk){globalThis.haqiPerformance?.reset();const frames=[],draws=[],longTasks=[];let last=null;const observer=new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(e=>e.duration)));observer.observe({type:'longtask'});const original=renderer.render;renderer.render=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{draws.push(performance.now()-start);}};const start={...save.position};let travelled=0,prior=start;const begin=performance.now(),until=begin+seconds*1000;try{await new Promise(resolve=>{function tick(t){if(last!==null)frames.push(t-last);last=t;travelled+=W.distance(prior,save.position);prior={...save.position};if(walk){const sign=Math.floor((t-begin)/1500)%2?1:-1;joystick={x:sign,y:0};}if(t>=until)resolve();else requestAnimationFrame(tick);}requestAnimationFrame(tick);});}finally{joystick={x:0,y:0};renderer.render=original;observer.disconnect();}const metric=rows=>{const s=[...rows].sort((a,b)=>a-b);return {count:s.length,mean:s.reduce((n,v)=>n+v,0)/Math.max(1,s.length),p95:s[Math.floor(s.length*.95)],p99:s[Math.floor(s.length*.99)],max:s.at(-1),over25:s.filter(v=>v>25).length};};return {diagnostics:globalThis.haqiPerformanceReport?.(),frame:metric(frames),draw:metric(draws),longTasks,travelled,cache:renderer.terrainStats(),size:[world.w,world.h],trees:world.trees.length};},
 async navigate(){close();path=[];save.position={...world.layout.spawn};await assets.warmNearby(world,save);renderer.prepareScene(world,save);await new Promise(resolve=>{const tick=()=>renderer.terrainStats().pending?requestAnimationFrame(tick):resolve();tick();});await new Promise(resolve=>setTimeout(resolve,1500));globalThis.haqiPerformance?.reset();const target=world.encounters.find(e=>e.id==='storm-scout'),longTasks=[];const observer=new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(e=>e.duration)));observer.observe({type:'longtask'});const start=performance.now();walkTo(target,false);const dispatchMs=performance.now()-start;await new Promise(resolve=>{const tick=()=>{if(typeof heroNavigation==='undefined'||!heroNavigation.stats().pending||performance.now()-start>20000)resolve();else requestAnimationFrame(tick);};tick();});const readyMs=performance.now()-start;await new Promise(resolve=>setTimeout(resolve,1000));observer.disconnect();return {diagnostics:globalThis.haqiPerformanceReport?.(),dispatchMs,readyMs,longTasks,pathPoints:path.length,position:{...save.position},navigation:typeof heroNavigation==='undefined'?null:heroNavigation.stats()};},
 async interactTest(){close();path=[];save.position={...world.layout.initialSpawn};const npc={...world.npcs.find(n=>n.id===36211),kind:'npc'};walkTo(npc,true);await new Promise(resolve=>{const until=performance.now()+10000;function tick(){if(dialog||performance.now()>until)resolve();else requestAnimationFrame(tick);}tick();});const result={dialog:!!dialog,npcId:dialog?.npcId,distance:W.distance(save.position,npc)};close();return result;}
};`;
try{
 for(const width of option('--widths','1280,390').split(',').map(Number)){
  const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:2});
  const page=await context.newPage();page.on('pageerror',e=>{report.errors.push(e.stack);console.error(e.stack);});
  if(baseline)await page.route('**/*',async route=>{const pathname=new URL(route.request().url()).pathname,body=overrides.get(pathname);if(body)await route.fulfill({body,contentType:pathname.endsWith('.json')?'application/json':'application/javascript'});else await route.continue();});
  await page.route('**/js/adventure_app.js*',async route=>{const response=await route.fetch(),body=overrides.get('/js/adventure_app.js');await route.fulfill({response,body:(body?body.toString():await response.text()).replace('const heroNavigation=createIslandHeroNavigation();',args.includes('--path-fallback')?'const heroNavigation=createIslandHeroNavigation({workerFactory:null});':'const heroNavigation=createIslandHeroNavigation();')+injection});});
  await page.goto(option('--url','http://127.0.0.1:8797')+'/Haqi.html?assets='+option('--assets','cdn')+'&profile=1');
  await page.waitForFunction(()=>window.campQA?.ready(),null,{timeout:120000});console.log(`ready ${width}`);await page.evaluate(()=>campQA.create());console.log(`created ${width}`);
  for(const place of option('--places','plaza,woods,harbor').split(',')){
   console.log(`prepare ${width} ${place}`);await page.evaluate(p=>campQA.at(p),place);
   await page.waitForFunction(()=>campQA.cache().pending===0,null,{timeout:60000});await page.waitForTimeout(1500);
   await page.screenshot({path:path.join(output,`${place}-${width}.png`)});
   for(const moving of [false,true]){const row={width,place,moving,...await page.evaluate(({seconds,moving})=>campQA.sample(seconds,moving),{seconds:Number(option('--seconds','5')),moving})};report.rows.push(row);if(!baseline&&(row.cache.mode!=='worker'||row.cache.bytes>64*1024*1024||row.cache.scenery.bytes>24*1024*1024))throw Error('地表 Worker 或缓存预算验收失败');console.log(JSON.stringify(row));}
  }
  const cdp=args.includes('--cpu-profile')?await context.newCDPSession(page):null;if(cdp){await cdp.send('Profiler.enable');await cdp.send('Profiler.start');}const navigation=await page.evaluate(()=>campQA.navigate());if(cdp){const result=await cdp.send('Profiler.stop');fs.writeFileSync(path.join(output,'navigation.cpuprofile'),JSON.stringify(result.profile));}report.rows.push({width,navigation});console.log(JSON.stringify({width,navigation}));
  const interaction=await page.evaluate(()=>campQA.interactTest());report.rows.push({width,interaction});if(!interaction.dialog)throw Error('青龙自动交互未到达');
  await context.close();
 }
}finally{fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();}
if(report.errors.length)throw Error(report.errors.join('\n'));
