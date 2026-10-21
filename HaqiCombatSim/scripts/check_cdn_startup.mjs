// Anonymous cold-browser measurements: never open the user's profile or publish.
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const args=process.argv.slice(2),option=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const {chromium}=createRequire(import.meta.url)(option('--playwright','playwright'));
const manifest=JSON.parse(fs.readFileSync('release/manifest.json','utf8'));
const url=option('--url',manifest.base+'Haqi.html');
const output=option('--output','tmp/cdn-startup');fs.mkdirSync(output,{recursive:true});
const report={url,cache:'Fresh browser per run; HTTP cache disabled; OS DNS and CDN edge caches not purged',runs:[]};
for(let run=0;run<Number(option('--runs','3'));run++){
    const browser=await chromium.launch({headless:true,channel:option('--channel','msedge')});
    const row={run:run+1,browser:await browser.version(),requests:[],errors:[]};report.runs.push(row);
    try{
        const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});
        const page=await context.newPage(),cdp=await context.newCDPSession(page),requests=new Map();
        await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
        cdp.on('Network.requestWillBeSent',e=>requests.set(e.requestId,{url:e.request.url,start:e.timestamp}));
        cdp.on('Network.responseReceived',e=>Object.assign(requests.get(e.requestId)||{},{status:e.response.status,mime:e.response.mimeType,ttfbMs:(e.timestamp-(requests.get(e.requestId)?.start||e.timestamp))*1000}));
        cdp.on('Network.loadingFinished',e=>{const r=requests.get(e.requestId);if(r){r.durationMs=(e.timestamp-r.start)*1000;r.bytes=e.encodedDataLength;delete r.start;row.requests.push(r);}});
        page.on('pageerror',e=>row.errors.push(e.message));
        page.on('requestfailed',r=>row.errors.push(r.url()+': '+r.failure()?.errorText));
        await page.addInitScript(()=>{
            window.startupTiming={};
            const observer=new MutationObserver(()=>{
                if(!startupTiming.titleReadyMs&&document.querySelector('#entry.entry-wizard button')){
                    startupTiming.titleReadyMs=performance.now();
                }
                if(!startupTiming.prologueReadyMs&&document.querySelector('.prologue-layer .pl-art.shown'))startupTiming.prologueReadyMs=performance.now();
                if(startupTiming.titleReadyMs&&startupTiming.prologueReadyMs)observer.disconnect();
            });observer.observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
        });
        const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:120000});row.status=response.status();
        await page.waitForFunction(()=>window.startupTiming?.titleReadyMs,null,{timeout:120000});
        row.entryTransfer={requests:row.requests.length,bytes:row.requests.reduce((n,r)=>n+(r.bytes||0),0)};
        await page.waitForFunction(()=>window.startupTiming?.prologueReadyMs,null,{timeout:120000});
        Object.assign(row,await page.evaluate(()=>({timing:startupTiming,navigation:performance.getEntriesByType('navigation')[0]?.toJSON(),paint:performance.getEntriesByType('paint').map(e=>e.toJSON())})));
        await page.screenshot({path:path.join(output,`run-${run+1}.png`)});
        row.totalBytes=row.requests.reduce((n,r)=>n+(r.bytes||0),0);
        row.httpErrors=row.requests.filter(r=>r.status>=400).map(({url,status})=>({url,status}));
        row.slowest=[...row.requests].sort((a,b)=>b.durationMs-a.durationMs).slice(0,12);
        console.log(JSON.stringify({run:row.run,status:row.status,timing:row.timing,requests:row.requests.length,bytes:row.totalBytes,errors:row.errors}));
    }catch(error){row.errors.push(error.message);console.error(error.message);}
    finally{await browser.close();fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));}
}
if(report.runs.some(r=>!r.timing?.titleReadyMs||r.errors.length))process.exitCode=1;
