// Isolated, in-memory browser acceptance. No user-role or cloud writes.
import {createRequire} from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const args=process.argv.slice(2),option=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const {chromium}=createRequire(import.meta.url)(option('--playwright',process.env.HAQI_PLAYWRIGHT_PACKAGE||'playwright'));
const base=option('--url','http://127.0.0.1:8799'),mode=option('--assets','local'),directory='.cache/world-atlas';fs.mkdirSync(directory,{recursive:true});
const resourceCount=Object.keys(JSON.parse(fs.readFileSync('data/adventure/world-map-art.json','utf8')).resources).length;
const islandCount=JSON.parse(fs.readFileSync('data/adventure/world-map-art.json','utf8')).islands.length;
const browser=await chromium.launch({headless:true,channel:'msedge'}),rows=[];
try{
    for(const [width,height,island]of [[1100,850,'town'],[390,844,'town'],[320,640,'camp'],[390,844,'fire']]){
        const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
        await page.goto(`${base}/tests/fixtures/world-atlas.html?assets=${mode}&island=${island}`);
        try{await page.waitForFunction(count=>window.atlasQA?.view?.getState()?.loadedResources?.length===count,resourceCount,{timeout:60000});}
        catch(error){console.error('Map startup failure',{width,height,island,errors},await page.evaluate(()=>({status:document.getElementById('status').textContent,state:window.atlasQA?.view?.getState?.()})));throw error;}
        const original=await page.evaluate(()=>JSON.stringify(atlasQA.save));
        await page.waitForFunction(()=>atlasQA.view.getState().previewIds.includes(atlasQA.save.zone));
        assert.ok(await page.locator('.haqi-atlas-landmark:visible').count()>0,'opening from Haqi starts with island detail');
        const localVortexSize=await page.locator('.map-vortex').first().evaluate(node=>parseFloat(getComputedStyle(node,'::before').width));
        assert.ok(localVortexSize>44&&localVortexSize<=96,'vortices grow in island detail');
        await page.screenshot({path:`${directory}/${mode}-${width}-${island}-initial.png`});
        await page.evaluate(()=>atlasQA.view.overview());
        const overviewVortexSize=await page.locator('.map-vortex').first().evaluate(node=>parseFloat(getComputedStyle(node,'::before').width));
        assert.ok(overviewVortexSize>=44&&overviewVortexSize<localVortexSize,'zooming out reduces the vortex');
        await page.screenshot({path:`${directory}/${mode}-${width}-${island}-world.png`});
        const overview=await page.evaluate(()=>{const state=atlasQA.view.getState(),nodes=[...document.querySelectorAll('.haqi-atlas-island')];return {state,visible:nodes.filter(n=>!n.hidden).map(n=>n.textContent),overflow:document.documentElement.scrollWidth>innerWidth,currentVisible:!nodes.find(n=>n.getAttribute('aria-current')==='location').hidden,close:document.querySelector('.close-button').getBoundingClientRect().toJSON()};});
        assert.equal(overview.overflow,false);assert.equal(overview.currentVisible,true);assert.ok(overview.close.right<=width&&overview.close.left>=0);assert.ok(overview.visible.length>=2);
        assert.equal(await page.locator('.haqi-atlas-stage').evaluate(node=>getComputedStyle(node).touchAction),'none');
        // Drag starts over an island label as well as the canvas; neither should select.
        const canvas=page.locator('.haqi-atlas-canvas'),rect=await canvas.boundingBox();
        await page.mouse.move(rect.x+rect.width*.5,rect.y+rect.height*.5);await page.mouse.down();await page.mouse.move(rect.x+rect.width*.5+50,rect.y+rect.height*.5+30,{steps:8});await page.mouse.up();
        assert.equal(await page.evaluate(()=>atlasQA.view.getState().selected),null);
        await page.getByRole('button',{name:'返回当前岛屿地图',exact:true}).click();
        await page.waitForFunction(()=>atlasQA.view.getState().previewIds.includes(atlasQA.save.zone));
        const local=await page.evaluate(()=>({state:atlasQA.view.getState(),landmarks:[...document.querySelectorAll('.haqi-atlas-landmark')].filter(n=>!n.hidden).map(n=>n.textContent)}));assert.ok(local.landmarks.length>0);
        await page.screenshot({path:`${directory}/${mode}-${width}-${island}-local.png`});
        // Extreme keyboard panning must not take the viewport past the island group.
        await page.evaluate(()=>{const stage=document.querySelector('.haqi-atlas-stage');for(let i=0;i<40;i++)stage.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));});
        const bounded=await page.evaluate(()=>atlasQA.view.getState());
        for(const [axis,extent,length]of [['x','w','width'],['y','h','height']]){const half=bounded[length]/bounded.camera.scale/2,b=bounded.bounds;if(half*2<b[extent])assert.ok(bounded.camera[axis]-half>=b[axis]-.001&&bounded.camera[axis]+half<=b[axis]+b[extent]+.001);else assert.ok(Math.abs(bounded.camera[axis]-(b[axis]+b[extent]/2))<.001);}
        await page.getByRole('button',{name:'返回当前岛屿地图',exact:true}).click();
        const landmark=page.locator('.haqi-atlas-landmark:visible').first();await landmark.click();assert.equal(await page.evaluate(()=>atlasQA.positions.length),0);await page.getByRole('button',{name:'传送过去',exact:true}).click();assert.equal(await page.evaluate(()=>atlasQA.positions.length),1);
        await page.evaluate(()=>atlasQA.view.overview());
        // Real touch events exercise pinch and lift-order suppression even in a desktop context.
        await page.evaluate(()=>{const stage=document.querySelector('.haqi-atlas-stage'),canvas=stage.querySelector('canvas'),r=canvas.getBoundingClientRect();const event=(type,id,x)=>canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:id,pointerType:'touch',clientX:r.x+x,clientY:r.y+r.height/2,button:0}));const capture=canvas.setPointerCapture;canvas.setPointerCapture=()=>{};event('pointerdown',11,r.width*.4);event('pointerdown',12,r.width*.6);event('pointermove',12,r.width*.8);event('pointerup',12,r.width*.8);event('pointerup',11,r.width*.4);canvas.setPointerCapture=capture;});
        assert.equal(await page.evaluate(()=>atlasQA.view.getState().selected),null);
        assert.equal(await page.evaluate(()=>JSON.stringify(atlasQA.save)),original);
        if(width===1100){
            const art=await page.evaluate(async()=>await (await fetch('data/adventure/world-map-art.json')).json());
            for(const island of art.islands){
                await page.evaluate(()=>atlasQA.view.overview());
                const state=await page.evaluate(()=>atlasQA.view.getState()),box=await canvas.boundingBox(),x=box.x+(island.x-state.camera.x)*state.camera.scale+state.width/2,y=box.y+(island.y-state.camera.y)*state.camera.scale+state.height/2;
                await page.mouse.move(x,y);
                for(let step=0;step<12;step++)await page.mouse.wheel(0,-30);
                try{await page.waitForFunction(id=>atlasQA.view.getState().previewIds.includes(id),island.id,{timeout:5000});}
                catch(error){console.error('Island preview failure',island.id,await page.evaluate(()=>atlasQA.view.getState()));await page.screenshot({path:`${directory}/failed-preview-${island.id}.png`});throw error;}
            }
            await page.evaluate(()=>atlasQA.view.overview());
            await page.getByRole('button',{name:'神秘漩涡，查看现实世界地图',exact:true}).first().click();
            await page.waitForSelector('.earth-atlas');await page.waitForSelector('.earth-atlas-vortices .map-vortex.has-vortex-art:not([hidden])',{timeout:120000});
            await page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
            await page.screenshot({path:`${directory}/${mode}-pacific.png`});
            await page.getByRole('button',{name:'神秘漩涡，查看哈奇世界地图',exact:true}).first().click();
            await page.waitForFunction(count=>atlasQA.view?.getState?.()?.loadedResources?.length===count,resourceCount);assert.equal(await page.evaluate(()=>JSON.stringify(atlasQA.save)),original);
            assert.deepEqual(await page.evaluate(()=>atlasQA.switches.map(s=>s.target)),['earth','haqi']);assert.equal(await page.evaluate(()=>atlasQA.travels.length),0);
        }
        assert.deepEqual(errors,[]);rows.push({width,height,island,visibleIslands:overview.visible.length,localLandmarks:local.landmarks.length,errors});await page.close();
    }
    const seventh=await browser.newPage({viewport:{width:1100,height:850}});
    await seventh.route('**/data/adventure/world-map-art.json*',async route=>{const response=await route.fetch(),art=await response.json();art.resources.seventh={...art.resources.vortex};art.islands.push({id:'seventh',name:'新增测试岛',resource:'seventh',x:2300,y:0,w:300,h:240});await route.fulfill({response,json:art});});
    await seventh.goto(`${base}/tests/fixtures/world-atlas.html?assets=${mode}`);
    await seventh.waitForFunction(count=>window.atlasQA?.view?.getState?.()?.loadedResources?.length===count,resourceCount+1);
    assert.equal(await seventh.locator('.haqi-atlas-island').count(),islandCount+1);
    await seventh.evaluate(()=>[...document.querySelectorAll('.haqi-atlas-island')].find(n=>n.textContent==='新增测试岛').click());
    assert.equal(await seventh.locator('.haqi-atlas-selection button').isDisabled(),true);assert.equal(await seventh.evaluate(()=>atlasQA.travels.length),0);
    await seventh.close();rows.push({seventhIsland:true,independentResource:true,unreleasedTravelDisabled:true});
    const failed=await browser.newPage({viewport:{width:390,height:844}});
    await failed.route('**/world-atlas-*.webp',route=>route.abort());
    await failed.goto(`${base}/tests/fixtures/world-atlas.html?assets=${mode}`);
    await failed.waitForFunction(count=>window.atlasQA?.view?.getState?.()?.failed?.length===count,resourceCount);
    await failed.evaluate(()=>atlasQA.view.overview());
    await failed.getByRole('button',{name:'火鸟岛',exact:true}).click();assert.equal(await failed.evaluate(()=>atlasQA.travels.length),0);await failed.getByRole('button',{name:'传送到此岛',exact:true}).click();assert.equal(await failed.evaluate(()=>atlasQA.travels[0]),'fire');await failed.close();rows.push({imageFailure:true,destinationsRemainUsable:true});
    fs.writeFileSync(`${directory}/${mode}-report.json`,JSON.stringify(rows,null,2));console.log(JSON.stringify(rows));
}finally{await browser.close();}
