// Actual in-memory fixture renders; no user storage or authored-city writes.
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const args=process.argv.slice(2),option=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const {chromium}=createRequire(import.meta.url)(option('--playwright',process.env.HAQI_PLAYWRIGHT_PACKAGE||'playwright'));
const url=option('--url','http://127.0.0.1:8797'),output=path.resolve(option('--output','.cache/city-living-qa')),seconds=Number(option('--seconds','15'));
fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'msedge'}),report={rows:[],errors:[],screenshots:[]};
try{
    for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
        const context=await browser.newContext({viewport,deviceScaleFactor:1}),page=await context.newPage();
        page.on('pageerror',e=>report.errors.push(e.message));
        await page.goto(url+'/tests/fixtures/city-dungeons.html?assets='+option('--assets','local')+'&sample=1&seed=42');
        await page.waitForFunction(()=>window.cityLivingQA?.world.dungeon?.scene.streetscape?.theme==='south-china',null,{timeout:90000});
        for(const version of [2,3]){
            await page.evaluate(version=>cityLivingQA.sample(42,version),version);
            await page.waitForFunction(version=>cityLivingQA.stats().resources>0&&cityLivingQA.stats().theme===(version===3?'south-china':null),version);
            await page.evaluate(async()=>{const q=cityLivingQA,art=q.assets.content.cityStreetArt;const {streetArtResources}=await import('../../js/adventure_city_art_core.js');await Promise.all(streetArtResources(art,q.world.dungeon.scene.streetscape).map(r=>q.assets.ensureImage(r.id)));});
            await page.waitForTimeout(1200);
            if(version===3)for(const key of ['entrance','commercial','residential','rest']){
                await page.evaluate(key=>cityLivingQA.viewpoint(key),key);await page.waitForTimeout(500);
                await page.evaluate(()=>document.querySelector('#tools').style.display='none');const file=`${viewport.width}-${key}.png`;await page.screenshot({path:path.join(output,file)});report.screenshots.push(file);await page.evaluate(()=>document.querySelector('#tools').style.display='flex');
            }
            const result=await page.evaluate(async({seconds,version})=>{
                const q=cityLivingQA,renderer=q.renderer,original=renderer.render,render=[],frames=[];let last=null;
                renderer.render=function(...args){const start=performance.now();const result=original.apply(this,args);render.push(performance.now()-start);return result;};
                const street=q.world.dungeon.scene.streetscape,route=street.routes.find(r=>r.kind==='pedestrian'),start={...route.points[0]},end=route.points[1],length=Math.hypot(end.x-start.x,end.y-start.y),goal={x:start.x+(end.x-start.x)*400/length,y:start.y+(end.y-start.y)*400/length};
                q.save.position={...start};q.walkTo(goal);let finish=performance.now()+seconds*1000;
                let target=goal,total=0,previous={...start};try{await new Promise(resolve=>{function tick(t){if(last!==null)frames.push(t-last);last=t;total+=Math.hypot(q.save.position.x-previous.x,q.save.position.y-previous.y);previous={...q.save.position};if(Math.hypot(q.save.position.x-target.x,q.save.position.y-target.y)<24){target=target===goal?start:goal;q.walkTo(target);}if(performance.now()>=finish)resolve();else requestAnimationFrame(tick);}requestAnimationFrame(tick);});}
                finally{renderer.render=original;}
                const metric=rows=>{rows.sort((a,b)=>a-b);return{count:rows.length,p95:rows[Math.floor(rows.length*.95)],p99:rows[Math.floor(rows.length*.99)],max:rows.at(-1)};};
                return{version,render:metric(render),frame:metric(frames),cache:q.stats(),travelled:total,storage:{local:localStorage.length}};
            },{seconds,version});
            report.rows.push({viewport,...result});console.log(JSON.stringify(report.rows.at(-1)));
        }
        await page.evaluate(()=>cityLivingQA.interact(0));await page.waitForSelector('.city-interaction');
        await page.screenshot({path:path.join(output,`${viewport.width}-interaction.png`)});await page.evaluate(()=>cityLivingQA.close());
        await page.evaluate(()=>cityLivingQA.leave());await page.waitForTimeout(100);
        const released=await page.evaluate(()=>cityLivingQA.stats());if(released.tiles!==0||released.resources!==0)throw Error('Street resources were not released on leaving');
        await context.close();
    }
    // Exercise actual browser IO failure and existing delivery interactions.
    const failureContext=await browser.newContext({viewport:{width:390,height:844}}),failurePage=await failureContext.newPage();
    failurePage.on('pageerror',e=>report.errors.push(e.message));
    await failurePage.route('**/living-shops-*.webp*',route=>route.abort());
    await failurePage.goto(url+'/tests/fixtures/city-dungeons.html?assets=local&sample=1&seed=42');
    await failurePage.waitForFunction(()=>window.cityLivingQA?.world.dungeon?.scene.streetscape?.theme==='south-china',null,{timeout:90000});
    await failurePage.evaluate(()=>cityLivingQA.viewpoint('commercial'));await failurePage.waitForTimeout(500);
    await failurePage.screenshot({path:path.join(output,'missing-shops.png')});
    const pathLength=await failurePage.evaluate(()=>cityLivingQA.walkTo(cityLivingQA.world.npcs[0]));if(!pathLength)throw Error('Art failure blocked navigation');
    await failurePage.evaluate(()=>cityLivingQA.interact(0));await failurePage.getByRole('button',{name:'接过菜单',exact:true}).click();
    await failurePage.evaluate(()=>{cityLivingQA.close();cityLivingQA.interact(1);});await failurePage.getByRole('button',{name:'送来菜单',exact:true}).click();
    report.failure=await failurePage.evaluate(()=>{const save=cityLivingQA.save,progress=save.earthCityProgress.cities['generated-living-sample'].dungeons[save.zone];return{done:progress.done,items:progress.items,localStorageEntries:localStorage.length};});
    if(report.failure.items.menu!==0||report.failure.done.length!==2)throw Error('Delivery progress did not survive missing art');
    await failureContext.close();
    if(report.errors.length)throw Error(report.errors.join('\n'));
}finally{
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();
}
