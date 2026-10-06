import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {atlasBounds,fitAtlas,atlasPoint,atlasInverse,zoomAtlas,constrainAtlas,atlasOceanTiles,atlasSeaDecorations,islandAtlasPoint,islandLocalPoint,islandDetailOpacity,atlasOverviewCamera,pickAtlasPortal,pickAtlasIsland,atlasCoastContains,atlasPortalSize} from '../js/haqi_atlas_core.js';
import {renderHaqiAtlas} from '../js/view_haqi_atlas.js';
import {ISLANDS} from '../js/adventure_world_map_core.js';

const art=JSON.parse(fs.readFileSync(new URL('../data/adventure/world-map-art.json',import.meta.url)));
const town=art.islands.find(i=>i.id==='town'),layout={w:5600,h:4400,landmarks:[{id:'market',name:'集市',x:3500,y:3000}]};
test('panning clamps the entire viewport to island bounds and centers oversized axes',()=>{
    const bounds={x:-500,y:-300,w:1000,h:600};
    for(const x of [-1e6,0,1e6])for(const y of [-1e6,0,1e6]){
        const c=constrainAtlas({x,y,scale:2},bounds,400,300);
        assert.ok(c.x-100>=bounds.x&&c.x+100<=bounds.x+bounds.w);
        assert.ok(c.y-75>=bounds.y&&c.y+75<=bounds.y+bounds.h);
        assert.deepEqual(constrainAtlas({x,y,scale:.1},bounds,400,300),{x:0,y:0,scale:.1});
    }
});
test('ocean tiles and islands use identical pan and zoom transforms',()=>{
    const before={x:0,y:0,scale:1},after={x:40,y:-25,scale:1};
    const a=atlasOceanTiles(before,900,600).find(p=>p.worldX===0&&p.worldY===0),b=atlasOceanTiles(after,900,600).find(p=>p.worldX===0&&p.worldY===0);
    assert.equal(b.x-a.x,-40);assert.equal(b.y-a.y,25);
    for(const camera of [before,after,{x:70,y:80,scale:2}])for(const tile of atlasOceanTiles(camera,900,600)){
        assert.deepEqual({x:tile.x,y:tile.y},atlasPoint(camera,{x:tile.worldX,y:tile.worldY},900,600));assert.equal(tile.w,512*camera.scale);
    }
});
test('random sea scenery is seeded, stable and stays clear of islands and portals',()=>{
    const config={seed:42,count:24,frames:[{id:'rock',minWidth:25,maxWidth:40},{id:'gull',minWidth:30,maxWidth:40}]};
    const rows=atlasSeaDecorations(art.islands,art.portals,config),bounds=atlasBounds(art.islands);
    assert.ok(rows.length>0);assert.deepEqual(rows,atlasSeaDecorations(art.islands,art.portals,config));assert.notDeepEqual(rows,atlasSeaDecorations(art.islands,art.portals,{...config,seed:43}));
    for(const p of rows){assert.ok(p.x-p.w/2>=bounds.x&&p.x+p.w/2<=bounds.x+bounds.w&&p.y-p.h/2>=bounds.y&&p.y+p.h/2<=bounds.y+bounds.h);
        assert.ok(!art.islands.some(i=>Math.abs(p.x-i.x)<(i.w+p.w)/2+12&&Math.abs(p.y-i.y)<(i.h+p.h)/2+12));assert.ok(art.portals.every(i=>Math.hypot(p.x-i.haqi.x,p.y-i.haqi.y)>=65));}
});
test('zoom preserves the world point under the pointer and clamps at either limit',()=>{
    const camera={x:15,y:35,scale:.5},anchor={x:90,y:140},before=atlasInverse(camera,anchor,390,650);
    for(const factor of [.0001,1.4,10000]){const next=zoomAtlas(camera,factor,anchor,390,650,.1,4);assert.deepEqual(atlasInverse(next,anchor,390,650),before);assert.ok(next.scale>=.1&&next.scale<=4);}
});
test('local/world coordinates and screen coordinates round trip',()=>{
    for(const p of [{x:0,y:0},{x:3500,y:3000},{x:layout.w,y:layout.h}]){const a=islandAtlasPoint(town,layout,p),b=islandLocalPoint(town,layout,a);assert.ok(Math.abs(p.x-b.x)<1e-8&&Math.abs(p.y-b.y)<1e-8);}
    const c={x:30,y:60,scale:1.25},p={x:-310,y:44};assert.deepEqual(atlasInverse(c,atlasPoint(c,p,390,650),390,650),p);
});
test('detail fades continuously in both directions and full local fit exposes terrain',()=>{
    const c=fitAtlas({x:town.x-town.w/2,y:town.y-town.h/2,w:town.w,h:town.h},390,600);
    assert.equal(islandDetailOpacity(town,c.scale*.55,390,600),0);assert.ok(Math.abs(islandDetailOpacity(town,c.scale*.675,390,600)-.5)<1e-8);assert.equal(islandDetailOpacity(town,c.scale,390,600),1);
});
test('narrow overview keeps the current island visible and readable',()=>{
    for(const width of [320,390,900])for(const current of art.islands){const c=atlasOverviewCamera(art.islands,art.portals,width,600,current.id),a=atlasPoint(c,{x:current.x-current.w/2,y:current.y-current.h/2},width,600),b=atlasPoint(c,{x:current.x+current.w/2,y:current.y+current.h/2},width,600);assert.ok(a.x>=0&&a.y>=0&&b.x<=width&&b.y<=600,current.id);assert.ok(current.w*c.scale>=72,current.id);}
});
test('a seventh standalone island extends the calculated world bounds',()=>{
    const old=atlasBounds(art.islands),next=atlasBounds([...art.islands,{id:'seventh',x:2200,y:0,w:300,h:240,resource:'seventh'}]);assert.ok(next.w>old.w);assert.equal(next.x,old.x);
});
test('runtime atlas resources match their archive hashes, budget and crop bounds',()=>{
    for(const row of Object.values(art.resources)){const bytes=fs.readFileSync(new URL('../'+row.local,import.meta.url));assert.equal(bytes.length,row.size);assert.ok(bytes.length<=200000);assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);assert.match(row.cdn,/^https:\/\/cdn\.keepwork\.com\//);}
    for(const island of art.islands){const row=art.resources[island.resource],[x,y,w,h]=island.rect;assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=row.width&&y+h<=row.height,island.id);}
});
test('vortex picking uses screen pixels at any zoom',()=>{
    for(const scale of [.1,1,5]){const c={...art.portals[0].haqi,scale},p={x:450,y:300};assert.equal(pickAtlasPortal(art.portals,p,c,900,600)?.id,art.portals[0].id);assert.equal(pickAtlasPortal(art.portals,{x:480,y:300},c,900,600),null);}
});
test('vortices grow with zoom, have a bounded size and a matching click radius',()=>{
    assert.equal(atlasPortalSize(1,1),44);assert.equal(atlasPortalSize(4,1),88);assert.equal(atlasPortalSize(100,1),96);
    const portal=art.portals[0],camera={...portal.haqi,scale:4};
    assert.equal(pickAtlasPortal([portal],{x:495,y:300},camera,900,600,1),portal);
    assert.equal(pickAtlasPortal([portal],{x:501,y:300},camera,900,600,1),null);
    assert.equal(pickAtlasPortal([portal],{x:480,y:300},{...camera,scale:1},900,600,1),null);
});
test('island picking respects a coastal silhouette and ignores empty sea inside its bounding box',()=>{
    const island={id:'test',x:50,y:50,w:100,h:100},coast=[[50,0],[100,50],[50,100],[0,50]];
    assert.equal(pickAtlasIsland([island],{x:5,y:5},(_,p)=>atlasCoastContains(coast,p)),null);
    assert.equal(pickAtlasIsland([island],{x:50,y:50},(_,p)=>atlasCoastContains(coast,p)),island);
});

async function withMap(run,{initial='world',pendingEncounter=null,loadFail=false,deferred=false,focusPortal=null}={}){
    const previous={document:globalThis.document,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};
    class Element{
        constructor(tag){this.tag=tag;this.children=[];this.className='';this.dataset={};this.style={setProperty(){}};this.attributes={};this.hidden=false;this.events={};this.classList={toggle(){},add(){}};}
        append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}setAttribute(key,value){this.attributes[key]=value;}
        contains(node){return node===this||this.children.some(child=>child.contains?.(node));}setPointerCapture(){}
        addEventListener(name,fn){this.events[name]=fn;}getBoundingClientRect(){return {left:0,top:0,width:900,height:600};}
        getContext(){return new Proxy({},{get:()=>()=>{}});}querySelector(selector){return this.children.find(c=>c.className.split(' ').includes(selector.slice(1)))||this.children.map(c=>c.querySelector?.(selector)).find(Boolean);}
    }
    globalThis.document={createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag)};globalThis.requestAnimationFrame=fn=>{fn();return 1;};globalThis.cancelAnimationFrame=()=>{};
    const root=new Element('div'),save={zone:'town',level:1,position:{x:3500,y:3000},pendingEncounter},snapshot=structuredClone(save),travels=[],portals=[],positions=[],drawn=[];
    let resolveMap;const data={...art,resources:{}};
    const view=renderHaqiAtlas(root,{zone:'town'}, {save,focusPortal,assets:{mode:'local',content:{worldMaps:{town:layout}}},mapArt:deferred?new Promise(resolve=>resolveMap=()=>resolve(data)):loadFail?Promise.reject(Error('offline')):data},{close(){},switchWorld(){},travel:id=>travels.push(id),portal:(p,target)=>portals.push([p.id,target]),teleportToPosition:(x,y)=>positions.push({x,y}),drawIsland:(_,id,options)=>drawn.push({id,options})},initial);
    try{await new Promise(resolve=>setImmediate(resolve));const stage=root.querySelector('.haqi-atlas-stage'),canvas=root.querySelector('.haqi-atlas-canvas'),card=root.querySelector('.haqi-atlas-selection'),labels=root.querySelector('.haqi-atlas-labels');
        const pointer=(id,x,y,target=canvas)=>({pointerId:id,clientX:x,clientY:y,button:0,target});
        await run({root,stage,canvas,card,labels,view,save,travels,portals,positions,drawn,pointer,resolveMap});assert.deepEqual(save,snapshot,'map browsing must never mutate a save');
    }finally{view.dispose();Object.assign(globalThis,previous);}
}
test('island selection does not travel until the button is pressed, and preserves island IDs',async()=>{
    await withMap(({labels,card,travels})=>{labels.children.find(n=>n.textContent==='火鸟岛').onclick();assert.equal(travels.length,0);assert.equal(card.hidden,false);card.children[2].onclick();assert.deepEqual(travels,['fire']);});
});
test('local view draws a preview without a second player marker; position selection uses local coordinates',async()=>{
    await withMap(({view,drawn,stage,canvas,pointer,card,positions})=>{assert.equal(drawn[0].options.showPlayer,false);const c=view.getState().camera,p=atlasPoint(c,islandAtlasPoint(town,layout,{x:2800,y:2200}),900,600);stage.onpointerdown(pointer(1,p.x,p.y));stage.onpointerup(pointer(1,p.x,p.y));assert.equal(card.children[2].disabled,false);card.children[2].onclick();assert.ok(Math.abs(positions[0].x-2800)<1e-8&&Math.abs(positions[0].y-2200)<1e-8);},{initial:'local'});
});
test('opening the world map from a Haqi island starts in local detail and limits overzoom',async()=>{
    await withMap(({view})=>{
        const state=view.getState();assert.ok(islandDetailOpacity(town,state.camera.scale,state.width,state.height)>.5);
        assert.ok(state.previewIds.includes('town'));view.zoom(10000);
        const zoomed=view.getState();assert.ok(town.w*zoomed.camera.scale<=768+.001);
        const scale=zoomed.camera.scale;view.zoom(10000);assert.equal(view.getState().camera.scale,scale);
    });
});
test('drag, pinch, and pointer cancellation never select or travel',async()=>{
    await withMap(({stage,canvas,pointer,view,travels})=>{
        stage.onpointerdown(pointer(1,450,300));stage.onpointermove(pointer(1,510,340));stage.onpointerup(pointer(1,510,340));assert.equal(view.getState().selected,null);
        stage.onpointerdown(pointer(1,350,300));stage.onpointerdown(pointer(2,550,300));stage.onpointermove(pointer(2,650,300));stage.onpointerup(pointer(2,650,300));stage.onpointerup(pointer(1,350,300));assert.equal(view.getState().selected,null);
        stage.onpointerdown(pointer(1,450,300));stage.onpointercancel(pointer(1,450,300));assert.equal(view.getState().selected,null);assert.equal(travels.length,0);
    });
});
test('detailed dragging reuses the buffered scene and cached terrain, while zoom rebuilds it',async()=>{
    await withMap(({view,stage,pointer})=>{
        const before=view.getState().renderStats;
        stage.onpointerdown(pointer(1,450,300));
        for(let i=1;i<=20;i++){stage.onpointermove(pointer(1,450+i*3,300+i));view.draw();}
        stage.onpointerup(pointer(1,510,320));
        const after=view.getState().renderStats;
        assert.equal(after.previewBuilds,before.previewBuilds);assert.equal(after.sceneBuilds,before.sceneBuilds);
        view.zoom(1.2);assert.ok(view.getState().renderStats.sceneBuilds>after.sceneBuilds);
    },{initial:'local'});
});
test('wheel events on island labels zoom at the pointer without selecting or traveling',async()=>{
    await withMap(({stage,labels,view,travels})=>{const before=view.getState().camera.scale;stage.onwheel({clientX:450,clientY:300,deltaY:-20,target:labels.children[0],preventDefault(){}});assert.ok(view.getState().camera.scale>before);assert.equal(view.getState().selected,null);assert.equal(travels.length,0);});
});
test('a fresh control click works after a drag or pinch instead of inheriting click suppression',async()=>{
    await withMap(({root,stage,pointer,view})=>{stage.onpointerdown(pointer(1,450,300));stage.onpointermove(pointer(1,500,350));stage.onpointerup(pointer(1,500,350));const control=root.querySelector('.earth-map-zoom').children[0],scale=view.getState().camera.scale;stage.onpointerdown(pointer(2,850,50,control));let prevented=false;stage.events.click({detail:1,preventDefault(){prevented=true;},stopImmediatePropagation(){}});assert.equal(prevented,false);control.onclick();assert.ok(view.getState().camera.scale>scale);});
});
test('vortex switches only the viewed world and does not invoke travel',async()=>{
    await withMap(({labels,portals,travels})=>{labels.children.find(n=>n.className==='map-vortex').onclick();assert.deepEqual(portals,[[art.portals[0].id,'earth']]);assert.equal(travels.length,0);});
});
test('returning through a vortex fits the complete archipelago instead of zooming to the portal',async()=>{
    await withMap(({view,travels})=>{assert.deepEqual(view.getState().camera,fitAtlas(atlasBounds(art.islands,art.portals),900,600));assert.equal(view.getState().selected,null);assert.equal(travels.length,0);},{focusPortal:art.portals[0].id,initial:'local'});
});
test('battle disables travel but leaves browsing and vortex map navigation available',async()=>{
    await withMap(({labels,card,travels,portals})=>{labels.children.find(n=>n.textContent==='火鸟岛').onclick();assert.equal(card.children[2].disabled,true);card.children[2].onclick();assert.equal(travels.length,0);labels.children.find(n=>n.className==='map-vortex').onclick();assert.equal(portals.length,1);},{pendingEncounter:'fight'});
});
test('disposed view ignores a late manifest and does not draw or navigate',async()=>{
    await withMap(async({view,stage,pointer,resolveMap,labels})=>{view.dispose();resolveMap();await new Promise(resolve=>setImmediate(resolve));stage.onpointerdown(pointer(1,100,100));stage.onpointerup(pointer(1,100,100));assert.equal(view.getState().selected,null);assert.equal(labels.children.length,0);},{deferred:true});
});
test('failed manifest exposes a destination list with selection before travel',async()=>{
    await withMap(({root,card,travels})=>{const list=root.querySelector('.haqi-atlas-fallback');assert.equal(list.children.length,ISLANDS.length);list.children.find(n=>n.textContent==='火鸟岛').onclick();assert.equal(travels.length,0);card.children[2].onclick();assert.deepEqual(travels,['fire']);},{loadFail:true});
});
