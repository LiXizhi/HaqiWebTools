// Isolated UI check: local reference pixels and in-memory saves, no generation/account writes.
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const args=process.argv.slice(2),option=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const {chromium}=createRequire(import.meta.url)(option('--playwright',process.env.HAQI_PLAYWRIGHT_PACKAGE||'playwright'));
const base=option('--url','http://127.0.0.1:8797'),output=option('--output','.cache/simple-head-qa');
mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'msedge'}),report=[];
try{
    for(const width of [1280,390])for(const legacy of [false,true])for(const girl of [false,true]){
        const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
        page.on('pageerror',error=>errors.push(error.message));
        const tag=`${width}-${legacy?'16':'4'}-${girl?'girl':'boy'}`;
        await page.goto(`${base}/tests/fixtures/photo-head-calibration.html?${legacy?'legacy&':''}${girl?'girl&':''}`);
        await page.getByRole('button',{name:'打开校准测试',exact:true}).click();
        await page.getByRole('button',{name:'校准',exact:true}).click();
        await page.waitForFunction(()=>photoCalibrationQA.draw?.ready===true);
        assert.equal(await page.locator('.photo-head-look:visible').count(),legacy?2:0);
        const order=legacy?[0,1,3,2]:[0,3,1,2],indices=legacy?[0,4,8,12]:[0,1,2,3];
        for(let step=0;step<4;step++){
            const stage=page.locator('.photo-head-preview');
            await stage.scrollIntoViewIfNeeded();
            await page.waitForFunction(facing=>document.querySelector('.photo-head-preview').dataset.facing===String(facing),order[step]);
            const before=await page.evaluate(()=>photoCalibrationQA.head.frames.map(f=>f.neck));
            const rect=await page.evaluate(()=>photoCalibrationQA.draw.headRect),box=await stage.boundingBox();
            const x=box.x+(150+rect.x+rect.w/2)*box.width/300,y=box.y+(275+rect.y+rect.h/2)*box.height/300;
            await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+5,y+3,{steps:3});await page.mouse.up();
            await page.getByRole('button',{name:step===3?'完成四向校准':'校准，下一个',exact:true}).click();
            const after=await page.evaluate(()=>photoCalibrationQA.head.frames.map(f=>f.neck));
            assert.notDeepEqual(after[indices[step]],before[indices[step]],`${tag} drag ${step}`);
            if(!legacy)for(let i=0;i<4;i++)if(i!==step)assert.deepEqual(after[i],before[i]);
        }
        assert.equal(await page.getByRole('button',{name:'使用这个形象',exact:true}).isEnabled(),true);
        const overflow=await page.locator('dialog').evaluate(n=>n.scrollWidth>n.clientWidth||n.getBoundingClientRect().width>innerWidth);
        assert.equal(overflow,false);
        await page.screenshot({path:`${output}/${tag}.png`});
        await page.getByRole('button',{name:'使用这个形象',exact:true}).click();
        await page.getByText('已应用',{exact:false}).waitFor();
        assert.deepEqual(errors,[]);
        report.push({width,legacy,girl,passed:true});console.log(`${tag}: four directions dragged, saved and applied`);
        await page.close();
    }
    // Exercise the real worker, packing and CDN verification with a synthetic AI response.
    const page=await browser.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`${base}/tests/fixtures/photo-head.html?vip`);
    await page.waitForFunction(()=>document.documentElement.dataset.fixtureReady==='1');
    const generated=await page.evaluate(async()=>{
        const service=photoQA.service;await service.open();
        const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
        const ctx=canvas.getContext('2d');ctx.fillStyle='#ca987a';ctx.fillRect(0,0,128,128);
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg'));
        const first=await service.generate({blob,appearance:'boy'});
        const again=await service.reprocess(1);
        return {directions:again.directionCount,frames:again.frames.length,bytes:again.bytes,
            originalFrames:first.frames,calls:photoQA.generationCalls,uploads:Object.keys(photoQA.uploads).length};
    });
    assert.equal(generated.directions,4);assert.equal(generated.frames,4);
    assert.equal(generated.calls,1);assert.ok(generated.bytes<=200000);
    assert.deepEqual(errors,[]);report.push({pipeline:true,passed:true});
    console.log('4-direction pipeline: real worker, WebP packing, verification and reprocessing passed');
    await page.close();
}finally{
    writeFileSync(`${output}/report.json`,JSON.stringify(report,null,2)+'\n');
    await browser.close();
}
