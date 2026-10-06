// Real DOM/canvas profile, isolated in-memory fixture, no role or cloud writes.
import {createRequire} from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const args=process.argv.slice(2),option=(key,value)=>args.includes(key)?args[args.indexOf(key)+1]:value;
const {chromium}=createRequire(import.meta.url)(option('--playwright','playwright'));
const browser=await chromium.launch({headless:true,channel:'msedge'}),rows=[];
try{
    for(const width of [1100,390]){
        const page=await browser.newPage({viewport:{width,height:850},deviceScaleFactor:2}),errors=[];
        page.on('pageerror',e=>errors.push(e.message));
        await page.goto('http://127.0.0.1:8799/tests/fixtures/world-atlas.html?assets=local&view=local');
        await page.waitForFunction(()=>window.atlasQA?.view?.getState()?.loadedResources?.length===4,null,{timeout:60000});
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        const result=await page.evaluate(async()=>{
            const view=atlasQA.view,stage=document.querySelector('.haqi-atlas-stage'),canvas=stage.querySelector('canvas'),r=canvas.getBoundingClientRect();
            const run=async()=>{const times=[],before={...atlasQA.stats},save=JSON.stringify(atlasQA.save);
                const pointer=(type,x,y)=>canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:123,pointerType:'mouse',button:0,clientX:r.left+x,clientY:r.top+y}));
                // Synthetic pointer capture has no native active pointer.
                const capture=canvas.setPointerCapture;canvas.setPointerCapture=()=>{};
                pointer('pointerdown',r.width/2,r.height/2);let previous=performance.now();
                for(let i=0;i<90;i++){pointer('pointermove',r.width/2+Math.sin(i*.12)*180,r.height/2+Math.cos(i*.12)*120);
                    await new Promise(resolve=>requestAnimationFrame(resolve));const now=performance.now();times.push(now-previous);previous=now;}
                pointer('pointerup',r.width/2,r.height/2);canvas.setPointerCapture=capture;
                await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
                times.sort((a,b)=>a-b);return {median:times[Math.floor(times.length/2)],p95:times[Math.floor(times.length*.95)],max:times.at(-1),previewBuilds:atlasQA.stats.previewBuilds-before.previewBuilds,previewTime:atlasQA.stats.previewTime-before.previewTime,saveUnchanged:save===JSON.stringify(atlasQA.save)};
            };
            const cold=await run();view.locate();const warm=await run();return {cold,warm,byIsland:atlasQA.stats.byIsland};
        });
        assert.deepEqual(errors,[]);assert.ok(result.cold.saveUnchanged&&result.warm.saveUnchanged);
        if(args.includes('--assert-cache'))assert.equal(result.warm.previewBuilds,0,'warm detailed dragging must reuse terrain previews');
        rows.push({width,...result,errors});await page.close();
    }
    const path=option('--report','.cache/world-atlas/performance.json');fs.writeFileSync(path,JSON.stringify(rows,null,2));console.log(JSON.stringify(rows));
}finally{await browser.close();}
