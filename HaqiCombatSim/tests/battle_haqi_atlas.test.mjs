import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {atlasStripLimits,constrainAtlasStrip,atlasBounds,fitAtlas,atlasPoint,atlasInverse,zoomAtlas,constrainAtlas,atlasOceanTiles,atlasSeaDecorations,islandAtlasPoint,islandLocalPoint,islandDetailOpacity,atlasOverviewCamera,pickAtlasPortal,pickAtlasIsland,atlasCoastContains,atlasPortalSize} from '../js/haqi_atlas_core.js';
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
    const old=atlasBounds(art.islands),next=atlasBounds([...art.islands,{id:'seventh',x:old.x+old.w+300,y:0,w:300,h:240,resource:'seventh'}]);assert.ok(next.w>old.w);assert.equal(next.x,old.x);
});
test('runtime atlas resources match their archive hashes, budget and crop bounds',()=>{
    for(const row of Object.values(art.resources)){const bytes=fs.readFileSync(new URL('../'+row.local,import.meta.url));assert.equal(bytes.length,row.size);assert.ok(bytes.length<=200000);assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);assert.match(row.cdn,/^https:\/\/cdn\.keepwork\.com\//);}
    for(const island of art.islands){const row=art.resources[island.resource],[x,y,w,h]=island.rect;assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=row.width&&y+h<=row.height,island.id);}
});

test('every island retains its own registered illustration and full-canvas coordinate frame',()=>{
    const resources=new Set();
    for(const island of art.islands){
        const row=art.resources[island.resource];
        assert.equal(island.detailStyle,'illustration',island.id);
        assert.deepEqual(island.rect,[0,0,row.width,row.height],island.id);
        assert.equal(row.source.layout,`data/adventure/maps/${island.id}.json`);
        assert.ok(!resources.has(island.resource),'each island needs independent layout art');resources.add(island.resource);
        assert.deepEqual(row.frames[island.id].rect,island.rect);
    }
});
test('vortex picking uses screen pixels at any zoom',()=>{
    for(const scale of [.1,1,5]){const c={...art.portals[0].haqi,scale},p={x:450,y:300};assert.equal(pickAtlasPortal(art.portals,p,c,900,600)?.id,art.portals[0].id);assert.equal(pickAtlasPortal([art.portals[0]],{x:480,y:300},c,900,600),null);}
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

async function withMap(run,{initial='world',zone='town',earthReturn=null,pendingEncounter=null,loadFail=false,deferred=false,focusPortal=null,illustration=false,imageFailure=false,deferredImage=false,atlasIslands=art.islands}={}){
    const previous={document:globalThis.document,Image:globalThis.Image,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};
    const paintings=[],pendingImages=[];
    class Element{
        constructor(tag){this.tag=tag;this.offsetWidth=100;this.offsetHeight=44;this.children=[];this.className='';this.dataset={};this.style={setProperty(){}};this.attributes={};this.hidden=false;this.events={};this.classList={toggle:(name,on)=>{if(on)this.className+=' '+name;},add(){}};}
        append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}setAttribute(key,value){this.attributes[key]=value;}
        contains(node){return node===this||this.children.some(child=>child.contains?.(node));}setPointerCapture(){}
        addEventListener(name,fn){this.events[name]=fn;}getBoundingClientRect(){return {left:0,top:0,width:900,height:600};}
        getContext(){return new Proxy({},{get:(_,key)=>key==='drawImage'?(...args)=>paintings.push(args):()=>{}});}querySelector(selector){return this.children.find(c=>c.className.split(' ').includes(selector.slice(1)))||this.children.map(c=>c.querySelector?.(selector)).find(Boolean);}
    }
    const frames=new Map();let frameId=0,frameTime=performance.now();const stepFrame=(ms=16)=>{frameTime=Math.max(frameTime,performance.now())+ms;const jobs=[...frames.values()];frames.clear();jobs.forEach(fn=>fn(frameTime));};const flushFrames=()=>{for(let i=0;frames.size&&i<50;i++)stepFrame();};
    globalThis.document={createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag)};globalThis.requestAnimationFrame=fn=>{frames.set(++frameId,fn);return frameId;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
    const root=new Element('div'),save={zone,earthReturn,level:1,position:{x:3500,y:3000},pendingEncounter},snapshot=structuredClone(save),travels=[],portals=[],positions=[],drawn=[];
    let resolveMap;const data={...art,islands:atlasIslands.map(i=>({...i,detailStyle:illustration?'illustration':undefined})),resources:illustration?{[town.resource]:art.resources[town.resource]}:{}};
    globalThis.Image=class {constructor(){this.naturalWidth=art.resources[town.resource].width;this.naturalHeight=art.resources[town.resource].height;}set src(value){this.url=value;if(deferredImage)pendingImages.push(this);else if(imageFailure)this.onerror();else this.onload();}};
    const view=renderHaqiAtlas(root,{zone,isEarth:zone==='earth'}, {save,focusPortal,assets:{mode:'local',content:{worldMaps:{town:layout}}},mapArt:deferred?new Promise(resolve=>resolveMap=()=>resolve(data)):loadFail?Promise.reject(Error('offline')):data},{close(){},switchWorld(){},travel:id=>travels.push(id),portal:(p,target)=>portals.push([p.id,target]),teleportToPosition:(x,y)=>positions.push({x,y}),drawIsland:(_,id,options)=>drawn.push({id,options})},initial);
    try{await new Promise(resolve=>setImmediate(resolve));const stage=root.querySelector('.haqi-atlas-stage'),canvas=root.querySelector('.haqi-atlas-canvas'),card=root.querySelector('.haqi-atlas-selection'),labels=root.querySelector('.haqi-atlas-labels');
        const pointer=(id,x,y,target=canvas)=>({pointerId:id,clientX:x,clientY:y,button:0,target});
        await run({stepFrame,flushFrames,root,stage,canvas,card,labels,view,save,travels,portals,positions,drawn,paintings,pointer,resolveMap,loadImages:()=>pendingImages.forEach(image=>image.onload())});assert.deepEqual(save,snapshot,'map browsing must never mutate a save');
    }finally{view.dispose();Object.assign(globalThis,previous);}
}
test('island selection does not travel until the button is pressed, and preserves island IDs',async()=>{
    await withMap(({labels,card,travels,view})=>{view.overview();labels.children.find(n=>n.textContent==='火鸟岛').onclick();assert.equal(travels.length,0);assert.equal(card.hidden,false);card.children[0].onclick();assert.deepEqual(travels,['fire']);});
});
test('local view draws a preview without a second player marker; position selection uses local coordinates',async()=>{
    await withMap(({view,drawn,stage,canvas,pointer,card,positions})=>{assert.equal(drawn[0].options.showPlayer,false);const c=view.getState().camera,p=atlasPoint(c,islandAtlasPoint(town,layout,{x:2800,y:2200}),900,600);stage.onpointerdown(pointer(1,p.x,p.y));stage.onpointerup(pointer(1,p.x,p.y));assert.equal(card.children[0].disabled,false);card.children[0].onclick();assert.ok(Math.abs(positions[0].x-2800)<1e-8&&Math.abs(positions[0].y-2200)<1e-8);},{initial:'local'});
});

test('registered illustration stays visible at detail zoom and landmarks retain game destinations',async()=>{
    await withMap(({view,paintings,labels,card,positions})=>{
        for(const factor of [.8,1.25,2]){
            paintings.length=0;view.zoom(factor);
            assert.ok(paintings.some(args=>args[0] instanceof Image),'detail must paint the illustration');
            assert.ok(!paintings.some(args=>args[0]?.tag==='canvas'&&args[0].width===768),'detail must not paint the generated terrain');
        }
        const mark=labels.children.find(n=>n.textContent==='集市');assert.equal(mark.hidden,false);mark.onclick();card.children[0].onclick();assert.deepEqual(positions,[{x:3500,y:3000}]);
    },{illustration:true,initial:'local'});
});

test('missing registered illustration keeps destinations available without generating terrain',async()=>{
    await withMap(({view,drawn,labels,card,positions})=>{
        assert.equal(drawn.length,0);assert.equal(view.getState().renderStats.previewBuilds,0);
        labels.children.find(n=>n.textContent==='集市').onclick();card.children[0].onclick();assert.deepEqual(positions,[{x:3500,y:3000}]);
    },{illustration:true,imageFailure:true,initial:'local'});
});

test('opening and zooming before artwork loads never builds a terrain preview',async()=>{
    await withMap(({view,drawn,paintings,loadImages})=>{
        view.zoom(1.2);view.overview();view.locate();
        assert.equal(drawn.length,0);assert.equal(view.getState().renderStats.previewBuilds,0);
        loadImages();assert.ok(paintings.some(args=>args[0] instanceof Image));
        assert.equal(drawn.length,0);assert.deepEqual(view.getState().previewIds,[]);
    },{illustration:true,deferredImage:true});
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
test('wheel events on island labels zoom without selecting or traveling',async()=>{
    await withMap(({stage,labels,view,travels})=>{const before=view.getState().camera;stage.onwheel({clientX:450,clientY:300,deltaY:-20,target:labels.children[0],preventDefault(){}});assert.ok(view.getState().camera.scale>before.scale);assert.equal(view.getState().camera.x,before.x);assert.equal(view.getState().camera.y,0);assert.equal(view.getState().selected,null);assert.equal(travels.length,0);});
});
test('a fresh control click works after a drag or pinch instead of inheriting click suppression',async()=>{
    await withMap(({root,stage,pointer,view})=>{stage.onpointerdown(pointer(1,450,300));stage.onpointermove(pointer(1,500,350));stage.onpointerup(pointer(1,500,350));const control=root.querySelector('.earth-map-zoom').children[0],scale=view.getState().camera.scale;stage.onpointerdown(pointer(2,850,50,control));let prevented=false;stage.events.click({detail:1,preventDefault(){prevented=true;},stopImmediatePropagation(){}});assert.equal(prevented,false);control.onclick();assert.ok(view.getState().camera.scale>scale);});
});
test('vortex delegates to the controller without invoking island travel',async()=>{
    await withMap(({labels,portals,travels})=>{labels.children.find(n=>n.className==='map-vortex').onclick();assert.deepEqual(portals,[[art.portals[0].id,'earth']]);assert.equal(travels.length,0);});
});
test('returning through a vortex focuses the current island',async()=>{
    await withMap(({view,travels})=>{assert.equal(view.getState().camera.x,town.x);assert.equal(view.getState().camera.y,town.y);assert.ok(view.getState().camera.scale>fitAtlas(atlasBounds(art.islands),900,600).scale);assert.equal(view.getState().selected,null);assert.equal(travels.length,0);},{focusPortal:art.portals[0].id,initial:'local'});
});
test('battle disables travel but leaves browsing and vortex map navigation available',async()=>{
    await withMap(({labels,card,travels,portals})=>{labels.children.find(n=>n.textContent==='火鸟岛').onclick();assert.equal(card.children[0].disabled,true);card.children[0].onclick();assert.equal(travels.length,0);labels.children.find(n=>n.className==='map-vortex').onclick();assert.equal(portals.length,1);},{pendingEncounter:'fight'});
});
test('disposed view ignores a late manifest and does not draw or navigate',async()=>{
    await withMap(async({view,stage,pointer,resolveMap,labels})=>{view.dispose();resolveMap();await new Promise(resolve=>setImmediate(resolve));stage.onpointerdown(pointer(1,100,100));stage.onpointerup(pointer(1,100,100));assert.equal(view.getState().selected,null);assert.equal(labels.children.length,0);},{deferred:true});
});
test('failed manifest exposes a destination list with selection before travel',async()=>{
    await withMap(({root,card,travels})=>{const list=root.querySelector('.haqi-atlas-fallback');assert.equal(list.children.length,ISLANDS.length);list.children.find(n=>n.textContent==='火鸟岛').onclick();assert.equal(travels.length,0);card.children[0].onclick();assert.deepEqual(travels,['fire']);},{loadFail:true});
});

for(const previous of ['fire',null,'missing'])test(`earth to Haqi focuses and highlights the previous island (${previous})`,async()=>{
    const expected=art.islands.find(i=>i.id===(previous==='fire'?'fire':'camp'));
    await withMap(({view,labels,travels})=>{
        const camera=view.getState().camera;
        assert.equal(camera.x,constrainAtlasStrip({...camera,x:expected.x},view.getState().bounds,900,600).x);assert.equal(camera.y,0);
        assert.ok(camera.scale>fitAtlas(atlasBounds(art.islands),900,600).scale);
        const highlighted=labels.children.filter(n=>n.className.split(' ').includes('current'));
        assert.deepEqual(highlighted.map(n=>n.textContent),[expected.name]);
        assert.equal(highlighted[0].attributes['aria-current'],undefined,'previous island is not the player location');
        assert.equal(travels.length,0);
    },{zone:'earth',earthReturn:previous?{zone:previous,position:{x:1,y:1}}:null});
});

 test('the journey is ordered horizontally and both vortices occupy the next sea gap',()=>{
    assert.deepEqual(art.islands.filter(i=>i.id!=='camp').map(i=>i.id),['hanzi','town','fire','ice','desert','dark','tide','float','sail']);
    for(let n=0;n<art.islands.length;n++){const i=art.islands[n];assert.equal(i.y,0);if(n)assert.ok(i.x-i.w/2>art.islands[n-1].x+art.islands[n-1].w/2);}
    assert.equal(art.portals.length,2);
    for(const [n,id]of ['fire','ice'].entries()){const i=art.islands.find(i=>i.id===id),next=art.islands[art.islands.indexOf(i)+1],p=art.portals[n];assert.ok(p.haqi.x>i.x+i.w/2&&p.haqi.x<next.x-next.w/2);assert.equal(p.travel,true);assert.ok(p.earth.name);}
 });
 test('strip camera keeps complete islands readable and vertical position fixed',()=>{
    for(const width of [320,390,900])for(const height of [240,600]){const {min,max}=atlasStripLimits(art.islands,width,height);assert.ok(min>0&&max>=min);for(const i of art.islands)assert.ok(i.h*max<=height-(width<600?96:120)+.001);const c=constrainAtlasStrip({x:1e9,y:1e9,scale:max},atlasBounds(art.islands),width,height);assert.equal(c.y,0);}
 });
 test('diagonal dragging cannot move the map vertically and navigation buttons browse',async()=>{
    await withMap(({stage,canvas,pointer,view,root,flushFrames})=>{const before=view.getState().camera;stage.onpointerdown(pointer(1,450,300));stage.onpointermove(pointer(1,510,400));stage.onpointerup(pointer(1,510,400));assert.equal(view.getState().camera.y,0);assert.ok(view.getState().camera.x<before.x);root.querySelector('.haqi-atlas-navigation').children[2].onclick();flushFrames();assert.ok(view.getState().camera.x>before.x);});
 });

test('configured Haqi vortices dispatch Earth travel while return portals only browse',()=>{
    const source=fs.readFileSync(new URL('../js/adventure_app.js',import.meta.url),'utf8');
    const body=source.slice(source.indexOf('function browseWorldPortal('),source.indexOf('const earthPlaces='));
    const events=[];
    const route=new Function('travelEarth','close','openEarthMap','openPanel',`let atlasPortalFocus=null,panel=null;${body};return browseWorldPortal;`)(geo=>events.push(['travel',geo]),()=>events.push(['close']),geo=>events.push(['map',geo]),panel=>events.push(['panel',panel]));
    route(art.portals[0],'earth');assert.deepEqual(events,[['travel',art.portals[0].earth]]);
    events.length=0;route(art.portals[1],'haqi');assert.deepEqual(events,[['panel','worldmap']]);
    events.length=0;route({...art.portals[0],travel:false},'earth');assert.deepEqual(events,[['close'],['map',{...art.portals[0].earth,portalFocus:true}]]);
});

test('arrow images animate movement and a new map gesture cancels the animation',async()=>{
    await withMap(({root,view,stepFrame,flushFrames,stage,pointer})=>{
        const right=root.querySelector('.haqi-atlas-navigation').children[2],start=view.getState().camera.x;
        assert.equal(right.children[0].tag,'svg');right.onclick();assert.equal(view.getState().camera.x,start);
        stepFrame(80);const middle=view.getState().camera.x;assert.ok(middle>start);flushFrames();assert.ok(view.getState().camera.x>middle);
        right.onclick();stepFrame(30);stage.onpointerdown(pointer(1,450,300));const stopped=view.getState().camera.x;flushFrames();assert.equal(view.getState().camera.x,stopped);stage.onpointercancel(pointer(1,450,300));
    });
});
test('progress lists every island, scrubs the map, and follows the viewed location without travel',async()=>{
    await withMap(({root,view,travels,flushFrames})=>{
        const progress=root.querySelector('.haqi-atlas-progress'),stops=root.querySelector('.haqi-atlas-stops');
        assert.equal(root.querySelector('.haqi-atlas-jump'),undefined);assert.deepEqual(stops.children.map(n=>n.textContent),art.islands.map(i=>i.name));
        progress.value='4';progress.oninput();assert.equal(view.getState().camera.x,art.islands[4].x);assert.equal(stops.children[4].attributes['aria-current'],'location');
        stops.children[6].onclick();flushFrames();assert.equal(view.getState().camera.x,art.islands[6].x);assert.equal(stops.children[6].attributes['aria-current'],'location');assert.equal(stops.children[4].attributes['aria-current'],'false');assert.equal(Number(progress.value),6);assert.deepEqual(travels,[]);
    });
});
test('keyboard arrows animate and disposal cancels outstanding movement',async()=>{
    await withMap(({stage,view,stepFrame,flushFrames})=>{const x=view.getState().camera.x;stage.onkeydown({key:'ArrowRight',preventDefault(){}});assert.equal(view.getState().camera.x,x);stepFrame(50);assert.ok(view.getState().camera.x>x);view.dispose();const stopped=view.getState().camera.x;flushFrames();assert.equal(view.getState().camera.x,stopped);});
});

test('mobile island framing uses more of the viewport without clipping the island label',()=>{
    for(const [width,height]of [[320,280],[390,360],[450,360]]){
        const {max}=atlasStripLimits(art.islands,width,height),w=Math.max(...art.islands.map(i=>i.w)),h=Math.max(...art.islands.map(i=>i.h));
        const previous=Math.min((width-48)/w,(height-120)/h,768/w)*.9;
        assert.ok(max*.98>previous*1.1);
        assert.ok(w*max<=width-24+.001);assert.ok(h*max/2+24+22<=height/2);
    }
});

test('one hundred islands remain reachable by progress, names and keyboard with active-name scrolling',async()=>{
    const many=Array.from({length:100},(_,n)=>({...town,id:n===0?'town':`future-${n}`,name:`岛屿${n+1}`,x:n*500}));
    await withMap(({root,view,flushFrames,travels})=>{
        const progress=root.querySelector('.haqi-atlas-progress'),stops=root.querySelector('.haqi-atlas-stops'),position=root.querySelector('.haqi-atlas-position');
        assert.equal(stops.children.length,100);assert.equal(progress.max,'99');assert.equal(position.hidden,false);
        stops.clientWidth=300;stops.scrollWidth=6400;stops.scrollLeft=0;stops.children.forEach((node,i)=>{node.offsetLeft=i*64;node.offsetWidth=64;});
        progress.value='75';progress.oninput();assert.equal(view.getState().camera.x,many[75].x);assert.equal(stops.children[75].attributes['aria-current'],'location');assert.ok(stops.scrollLeft>4000);assert.match(position.textContent,/76 \/ 100/);
        progress.onkeydown({key:'ArrowRight',preventDefault(){}});assert.equal(view.getState().camera.x,many[76].x);
        stops.children[40].onclick();flushFrames();assert.equal(view.getState().camera.x,many[40].x);assert.equal(stops.children[40].attributes['aria-current'],'location');
        progress.onkeydown({key:'End',preventDefault(){}});assert.equal(stops.children[99].attributes['aria-current'],'location');
        progress.onkeydown({key:'Home',preventDefault(){}});assert.equal(stops.children[0].attributes['aria-current'],'location');assert.deepEqual(travels,[]);
    },{atlasIslands:many});
});
