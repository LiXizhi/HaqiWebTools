// Isolated browser check; no game account or player storage is opened.
import {createRequire} from 'node:module';
import fs from 'node:fs';
const args=process.argv.slice(2),option=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const {chromium}=createRequire(import.meta.url)(option('--playwright','playwright'));
const browser=await chromium.launch({headless:true,channel:option('--channel','msedge')});
try{
    const page=await browser.newPage();
    const url=option('--url','http://127.0.0.1:8806');
    await page.route('**/portrait-performance',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><div id="list" style="height:200px;width:100px;overflow:auto"></div>'}));
    await page.goto(url+'/portrait-performance');
    await page.evaluate(async()=>{
        const {createPortraitScheduler}=await import('/js/portrait_scheduler.js');
        const list=document.getElementById('list'),counts=Array(100).fill(0);
        let callbacks=0;
        const scheduler=createPortraitScheduler({requestFrame:fn=>requestAnimationFrame(t=>{callbacks++;fn(t);})});
        for(let i=0;i<100;i++){
            const node=document.createElement('canvas');node.width=node.height=100;node.style.display='block';list.append(node);
            scheduler.add({node,paint:()=>{counts[i]++;}});
        }
        window.portraitCheck={counts,scheduler,get callbacks(){return callbacks;}};
    });
    await page.waitForTimeout(600);
    const top=await page.evaluate(()=>portraitCheck.counts.slice());
    await page.evaluate(()=>document.getElementById('list').scrollTop=10000);
    await page.waitForTimeout(600);
    const bottom=await page.evaluate(()=>portraitCheck.counts.slice());
    await page.evaluate(()=>document.getElementById('list').style.display='none');
    await page.waitForTimeout(200);
    const before=await page.evaluate(()=>portraitCheck.callbacks);
    await page.waitForTimeout(400);
    const after=await page.evaluate(()=>portraitCheck.callbacks);
    const report={portraits:100,topPainted:top.filter(n=>n>0).length,
        bottomPainted:bottom.filter((n,i)=>n>top[i]).length,hiddenCallbacks:after-before};
    // Edge-touching entries may intersect with zero area, so allow the boundary row.
    if(report.topPainted<2||report.topPainted>3||report.bottomPainted<2||report.bottomPainted>3||report.hiddenCallbacks!==0)throw Error(JSON.stringify(report));
    await page.evaluate(()=>portraitCheck.scheduler.dispose());
    const output=option('--output','tmp/portrait-performance.json');fs.writeFileSync(output,JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));
}finally{await browser.close();}
