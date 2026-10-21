import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('island loading prepares the existing fallback once before walking, with scene isolation',()=>{
    const source=fs.readFileSync(new URL('../js/adventure_renderer.js',import.meta.url),'utf8');
    const prepare=source.slice(source.indexOf('    function prepareScene('),source.indexOf('    let zoomUntil='));
    const ground=source.slice(source.indexOf('    function ground('),source.indexOf('    function shadow('));
    const events=[],contexts=[];
    const context=vm.createContext({
        canvas:{clientWidth:1280,clientHeight:900},cameraZoom:{value:1},perf:{enabled:false},
        resolution:()=>({terrain:1,display:1}),alignCameraOrigin:(x,y)=>({x,y}),
        terrainTiles:{prepare(){events.push('tiles');return {total:4,ready:4};}},
        paintLargeTerrain(ctx,world,rect,overview){assert.equal(overview,true);events.push('overview');},
        document:{createElement(){return {getContext(type,options){contexts.push(options);return {scale(){}};}};}},
        world:{w:4096,h:4096,layout:{}},save:{position:{x:2000,y:2000}},
    });
    vm.runInContext('let overviewWorld=null,overview=null;'+prepare+ground+';prepareScene(world,save);ground(world);prepareScene(world,save);',context);
    assert.deepEqual(events,['overview','tiles','tiles']);
    assert.equal(contexts[0],undefined); // Preserve the original raster backend/edges.
    vm.runInContext('world={...world,layout:{}};prepareScene(world,save);',context);
    assert.deepEqual(events.slice(-2),['overview','tiles']);
    context.world={isEarth:true,w:4096,h:4096,layout:{},prepareSurface(){events.push('earth');return {total:1,ready:1};}};
    vm.runInContext('prepareScene(world,save)',context);assert.equal(events.at(-1),'earth');assert.equal(contexts.length,2);
});
