import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {generatedCityRoute,generateCityDungeon} from '../js/adventure_city_generated_core.js';
import {generateStreetLayout} from '../js/adventure_city_street_layout_core.js';
import {streetWalkable,streetSegmentWalkable,routeLength,routePose,validateStreetscape} from '../js/adventure_city_street_core.js';
import {createAdventure,parseSave} from '../js/adventure_core.js';
import {installCityDungeons,enterCityDungeon,leaveCityDungeon,cityDungeonState,recordCityBattleWin} from '../js/adventure_city_dungeons_core.js';
import {createCityDungeonLoader} from '../js/adventure_city_dungeons.js';
import {durableSave,runtimeValues,restoreRuntime} from '../js/adventure_storage_core.js';
import {createWorld,findPath,movePosition} from '../js/adventure_world_core.js';
import {livingArtDimensions} from '../js/adventure_city_living_art_core.js';
import {streetArtResources,validateStreetArtFrames} from '../js/adventure_city_art_core.js';
import {createStreetPainter,streetObjectBounds,paintStreetGround,layoutStreetSignText,streetShadowBounds} from '../js/view_city_street.js';
const read=f=>JSON.parse(fs.readFileSync(new URL('../'+f,import.meta.url),'utf8'));
const art=read('data/adventure/earth/street-art.json');
const setup=()=>{const c=read('data/adventure/chapter.json');c.worldMaps={camp:read(c.worldMapIndex.islands.camp.file)};c.dungeons=[];c.cityStreetArt=art;const save=createAdventure(c,{seed:42});save.zone='earth';return{c,save};};

test('30 living street seeds are deterministic, diverse, proportionate and fully reachable',()=>{
    const variants=new Set(),usedDetails=new Set(),usedHomeDetails=new Set();
    for(let seed=0;seed<30;seed++){
        const {c,save}=setup(),route={...generatedCityRoute({id:'sample',name:'生活街区',lon:114,lat:22},save),layoutSeed:seed};
        const a=generateCityDungeon(c,route),scene=a.city.nodes[0].dungeon,s=scene.streetscape;
        assert.deepEqual(a,generateCityDungeon(c,route));validateStreetscape(scene);variants.add(s.layoutKind);
        const avenue=s.roads.find(r=>r.id==='avenue');
        const centerY=x=>{for(let i=1;i<avenue.points.length;i++){const a=avenue.points[i-1],b=avenue.points[i];if(x<=b.x)return a.y+(b.y-a.y)*(x-a.x)/(b.x-a.x);}return avenue.points.at(-1).y;};
        for(const o of s.objects.filter(o=>o.id.startsWith('manhole-')))assert.equal(o.y,centerY(o.x),`seed ${seed}: manhole on centerline`);
        for(const o of s.objects.filter(o=>o.id.startsWith('lamp-'))){assert.equal(o.y,centerY(o.x)-150);assert.equal(o.footprint.at(-1).y,o.y);}
        for(const o of s.objects.filter(o=>o.id.startsWith('drain-')))assert.equal(o.y,centerY(o.x)-92);
        assert.equal(new Set(s.objects.filter(o=>o.id.startsWith('lamp-')).map(o=>o.art)).size,1);
        assert.equal(new Set(s.objects.filter(o=>o.id.startsWith('pit-')).map(o=>o.art)).size,1);
        assert.equal(s.signals[0].y,centerY(s.signals[0].x)-100);
        const traffic=s.routes.find(r=>r.kind==='vehicle'),stopPose=routePose(traffic,traffic.stops[0].distance+150);
        assert.ok(Math.abs(stopPose.x-s.crossings[0].x)<1e-8,`seed ${seed}: stopping point measured along avenue`);
        const shops=s.objects.filter(o=>o.shopKind);assert.equal(new Set(shops.map(o=>o.shopName)).size,shops.length);
        const addresses=s.objects.filter(o=>o.type==='building'&&!o.shopKind).map(o=>o.components.find(p=>p.art==='living:wall-sign').text);assert.equal(new Set(addresses).size,addresses.length);
        const doorPlants=s.objects.filter(o=>/^(homes|south)-pot-/.test(o.id));
        for(let i=1;i<doorPlants.length;i++)assert.notEqual(doorPlants[i].art,doorPlants[i-1].art);
        const menus=s.objects.filter(o=>/^menu-/.test(o.id));assert.equal(menus.length,shops.length);assert.equal(new Set(menus.map(o=>o.text)).size,menus.length);assert.ok(menus.every(o=>o.w===60));
        const hardware=shops.find(o=>o.shopKind==='hardware');if(hardware)assert.ok(!s.objects.some(o=>o.id.startsWith('shop-paint-')));
        for(const shop of shops)assert.ok(!shop.components.some(p=>['living:water-meters','living:meter-wall'].includes(p.art)));
        for(const home of s.objects.filter(o=>o.type==='building'&&!o.shopKind))for(const p of home.components.filter(p=>['living:water-meters','living:meter-wall'].includes(p.art)))assert.equal(p.y,-8);
        for(const menu of menus)assert.ok(menu.footprint&&s.colliders.some(c=>c.id===menu.id+':collision'));
        for(let i=1;i<shops.length;i++)assert.notEqual(shops[i].art+shops[i].shopKind,shops[i-1].art+shops[i-1].shopKind);
        for(const o of s.objects)for(const part of [o,...(o.components||[])]){const d=livingArtDimensions[part.art];assert.ok(d,part.art);assert.ok(Math.abs(part.w/part.h-d.width/d.height)<1e-8);assert.ok(art.entries[part.art]);if(d.group==='details')usedDetails.add(part.art);if(d.group==='home-details')usedHomeDetails.add(part.art);}
        installCityDungeons(c,a.city);enterCityDungeon(save,c,scene.id);const world=createWorld(scene.id,c,save);
        assert.equal(s.walkRadius,18);assert.equal(s.movementStep,2);assert.equal(s.frontageRevision,2);assert.ok(!s.objects.some(o=>o.art==='living:steps'));
        const busWalk=s.roads.find(r=>r.id==='bus-approach');for(let d=0;d<routeLength(busWalk.points);d+=12){const p=routePose(busWalk,d);assert.ok(streetWalkable(scene,p.x,p.y,18),`seed ${seed}: bus approach ${d}`);}
        for(const id of ['hydrant','cones','directions'])assert.ok(s.objects.find(o=>o.id===id).footprint,`${id} has physical occupancy`);
        assert.equal(s.markings.filter(m=>m.id.startsWith('cycle-slot-')).length,3);assert.equal(s.markings.filter(m=>m.id.startsWith('cycle-wear-')).length,3);
        assert.ok(s.markings.every(m=>m.width<=2));assert.equal(s.wear.filter(p=>p.id.endsWith('-footfall')).length,shops.length);
        assert.ok(s.objects.find(o=>o.id==='street-map').text.startsWith(s.districtName));
        for(const walk of s.roads.filter(r=>['garden-entry','garden-loop','south-door-walk','utility-approach','garden-service-walk'].includes(r.id)||r.id.startsWith('garden-seat-walk-')))for(let d=0;d<routeLength(walk.points);d+=16){const p=routePose(walk,d);assert.ok(streetWalkable(scene,p.x,p.y,18),`seed ${seed}: ${walk.id} ${d}`);}
        for(const door of s.doorNodes){assert.ok(streetWalkable(scene,door.x,door.y,18),`seed ${seed}: ${door.id}`);assert.ok(findPath(world,scene.map.spawn,door).length,`seed ${seed}: door path ${door.id}`);}
        for(const point of s.facilityNodes){assert.ok(streetWalkable(scene,point.x,point.y,18),`seed ${seed}: ${point.id}`);assert.ok(findPath(world,scene.map.spawn,point).length);}
        assert.equal(s.transitions.aprons.length,2);assert.equal(s.transitions.tactile.length,2);assert.equal(s.signals[1].y,centerY(s.signals[1].x)+118);
        for(const seat of s.restNodes)assert.ok(findPath(world,scene.map.spawn,seat).length,`seed ${seed}: rest ${seat.id}`);
        for(const lane of s.alleyConnections){assert.ok(findPath(world,scene.map.spawn,lane.entry).length,`seed ${seed}: alley ${lane.id}`);const walk=s.roads.find(r=>r.id===lane.id);for(let d=0;d<routeLength(walk.points);d+=16){const p=routePose(walk,d);assert.ok(streetWalkable(scene,p.x,p.y,18),`seed ${seed}: alley ${lane.id} at ${d}`);}}
        for(let y=80;y<=2320;y+=20)assert.ok(streetWalkable(scene,1200,y,18),`seed ${seed}: main corridor at ${y}`);
        for(const point of [...scene.npcs,...scene.hotspots,...scene.encounters,scene.map.exit])assert.ok(findPath(world,scene.map.spawn,point).length,`seed ${seed}: ${JSON.stringify(point)}`);
        for(const route of s.routes)for(let distance=80;distance<routeLength(route.points)-80;distance+=16){const p=routePose(route,distance);assert.ok(streetWalkable(scene,p.x,p.y,route.kind==='vehicle'?25:8),`seed ${seed}: ${route.id} at ${distance}`);}
        const noArt={...c,cityStreetArt:null};assert.deepEqual(generateCityDungeon(noArt,route).city.nodes[0].dungeon.streetscape,s);
    }
    assert.equal(variants.size,3);
    assert.equal(usedDetails.size,16,'All new details have a contextual placement across the tested seeds');
    assert.equal(usedHomeDetails.size,8,'All home details have a contextual placement across the tested seeds');
});

test('v1 and v2 checkpoint layouts and opponents survive the v3 default upgrade',()=>{
    const {c,save}=setup(),route=generatedCityRoute({id:'sample',name:'生活街区',lon:114,lat:22},save);
    assert.equal(route.generationVersion,3);
    const old=generateCityDungeon(c,{...route,generationVersion:undefined}),v2=generateCityDungeon(c,{...route,generationVersion:2}),v3=generateCityDungeon(c,route);
    assert.equal(old.city.nodes[0].dungeon.streetscape,undefined);
    assert.deepEqual(v2.city.nodes[0].dungeon.streetscape,generateStreetLayout(route.layoutSeed,{size:2400}));
    assert.deepEqual(old.monsters,v2.monsters);assert.deepEqual(v2.monsters,v3.monsters);
    assert.deepEqual(v2.city.nodes[0].dungeon.actions,v3.city.nodes[0].dungeon.actions);
});

test('parking markings are validated and road gutters stay narrow in baked ground',()=>{
    const {c,save}=setup(),scene=generateCityDungeon(c,generatedCityRoute({id:'marking',name:'街区',lon:114,lat:22},save)).city.nodes[0].dungeon;
    const malformed=structuredClone(scene);malformed.streetscape.markings[0].points[0].x=-1;assert.throws(()=>validateStreetscape(malformed),/街景标线无效/);
    const strokes=[],ctx=new Proxy({stroke(){strokes.push({color:this.strokeStyle,width:this.lineWidth});}},{get:(o,k)=>o[k]||(()=>{}),set:(o,k,v)=>{o[k]=v;return true;}});
    paintStreetGround(ctx,{ground:'#bbb',surfaces:[],roads:[{kind:'road',points:[{x:0,y:100},{x:400,y:100}],width:150}],transitions:{curbs:true,gutters:true},markings:scene.streetscape.markings},{x:0,y:0,w:2400,h:2400});
    assert.equal(strokes.filter(s=>s.color==='#343b393b'&&s.width===3).length,2);
    assert.equal(strokes.filter(s=>s.color==='#ded8b6a0'&&s.width===2).length,3);
    assert.equal(strokes.filter(s=>s.color==='#474b4936'&&s.width===1.5).length,3);
});

test('ground wear rejects invalid geometry, clips by tile and restores paint opacity',()=>{
    const {c,save}=setup(),scene=generateCityDungeon(c,generatedCityRoute({id:'wear',name:'街区',lon:114,lat:22},save)).city.nodes[0].dungeon;
    const malformed=structuredClone(scene);malformed.streetscape.wear[0].points[0].y=-1;assert.throws(()=>validateStreetscape(malformed),/街景磨损无效/);
    const fills=[],stack=[],ctx=new Proxy({globalAlpha:1,fillStyle:'#000',save(){stack.push({globalAlpha:this.globalAlpha,fillStyle:this.fillStyle});},restore(){Object.assign(this,stack.pop());},fill(){fills.push({alpha:this.globalAlpha,color:this.fillStyle});}},{get:(o,k)=>o[k]||(()=>{}),set:(o,k,v)=>{o[k]=v;return true;}});
    const patch=(id,x)=>({id,kind:'footfall',points:[{x,y:40},{x:x+40,y:40},{x:x+20,y:60}],color:'#81766428'});
    paintStreetGround(ctx,{ground:'#bbb',surfaces:[],roads:[],wear:[patch('visible',10),patch('outside',600)]},{x:0,y:0,w:100,h:100});
    assert.equal(fills.length,2);assert.deepEqual(fills.map(f=>f.alpha),[.38,.63]);assert.equal(ctx.globalAlpha,1);
});

test('cold v1/v2 runtime checkpoints retain geometry and progress, then upgrade on re-entry',async()=>{
    for(const version of [1,2]){
        const {c,save}=setup(),base=generatedCityRoute({id:'sample',name:'生活街区',lon:114,lat:22},save),route={...base,generationVersion:version};
        const generated=generateCityDungeon(c,route),scene=generated.city.nodes[0].dungeon;installCityDungeons(c,generated.city);enterCityDungeon(save,c,scene.id);save.cityFallback=route;
        recordCityBattleWin(save,c.dungeons.find(d=>d.id===scene.id),scene.encounters[0].id);save.dungeonRuns[scene.id].cleared.push(scene.encounters[0].id);
        const cloud=durableSave(save),runtime=runtimeValues(save),cold=setup().c,loader=createCityDungeonLoader({content:cold,readJson:async()=>art});
        await loader.prepareSaves([{...cloud,zone:runtime.earthDungeonZone,cityFallback:runtime.values.cityFallback}]);
        const restored=parseSave(JSON.stringify(restoreRuntime(cloud,cold,runtime)),cold);
        assert.equal(restored.cityFallback.generationVersion,version);assert.deepEqual(cold.dungeons.find(d=>d.id===scene.id).scene.map,scene.map);
        leaveCityDungeon(restored,cold);await loader.load(scene.id,{cityFallback:base});enterCityDungeon(restored,cold,scene.id);
        assert.equal(cold.dungeons.find(d=>d.id===scene.id).scene.streetscape.theme,'south-china');assert.ok(cityDungeonState(restored,generated.city.id,scene.id).cleared.includes(scene.encounters[0].id));
    }
});

test('atlas registration deduplicates resources and group bounds include attached signs',()=>{
    const {c,save}=setup(),s=generateCityDungeon(c,generatedCityRoute({id:'x',name:'街区',lon:114,lat:22},save)).city.nodes[0].dungeon.streetscape;
    const resources=streetArtResources(art,s);assert.equal(resources.length,new Set(resources.map(r=>r.id)).size);assert.ok(resources.length<Object.keys(art.atlases).length);
    const b=streetObjectBounds({x:100,y:100,w:40,h:50,components:[{x:50,y:20,w:100,h:100}]});assert.ok(b.x+b.w>=200&&b.y<=20&&b.y+b.h>=120);
    validateStreetArtFrames(art);const malformed=structuredClone(art);malformed.entries['living:breakfast'].crop[2]=10000;assert.throws(()=>validateStreetArtFrames(malformed),/裁剪无效/);
});

test('late atlas decode rebakes ground; sign changes replace cached text; leaving releases once',()=>{
    let canvases=0;const released=[],images=new Map();
    const ctx=new Proxy({measureText:s=>({width:s.length*14}),createPattern:()=>({})},{get:(o,k)=>o[k]||(()=>{}),set:(o,k,v)=>{o[k]=v;return true;}});
    const painter=createStreetPainter({content:{cityStreetArt:art},images,registerImage:()=>{},releaseImage:id=>released.push(id),draw:()=>true},{makeCanvas:()=>{canvases++;return{getContext:()=>ctx};}});
    const street={version:1,objects:[{id:'manhole',art:'living:manhole',x:100,y:100,w:40,h:40,ground:true}],surfaces:[],roads:[],routes:[],signals:[],groundArt:'living:concrete'};
    const world={w:600,h:600,dungeon:{scene:{streetscape:street}}},rect={x:0,y:0,w:400,h:400};
    painter.ground(ctx,world,rect);const before=canvases;painter.ground(ctx,world,rect);assert.equal(canvases,before);
    const resource=art.atlases[art.entries['living:concrete'].atlas];images.set(resource.id,{});painter.ground(ctx,world,rect);assert.ok(canvases>before);assert.equal(painter.stats().textures,1);
    const object={art:'living:breakfast',type:'building',x:100,y:100,w:200,h:180,text:'名字很长的街坊早餐小店'};
    painter.draw(ctx,object,null);assert.equal(painter.stats().signs,1);painter.draw(ctx,{...object,text:'新店名'},null);assert.equal(painter.stats().signs,2);
    painter.reset();assert.equal(painter.stats().signs,0);assert.equal(released.length,2);painter.reset();assert.equal(released.length,2);
});


test('static silhouette shadows span tiles, rebake after late image and stop drawing on cached frames',()=>{
    let projections=0;const canvases=[],images=new Map();
    const ctx=new Proxy({transform:()=>projections++,measureText:()=>({width:10}),createPattern:()=>({})},{get:(o,k)=>o[k]||(()=>{}),set:(o,k,v)=>{o[k]=v;return true;}});
    const painter=createStreetPainter({content:{cityStreetArt:art},images,registerImage(){},releaseImage(){},draw:()=>true},{makeCanvas:()=>{const c={width:0,height:0,getContext:()=>ctx};canvases.push(c);return c;}});
    const street={theme:'south-china',ground:'#bbb',surfaces:[],roads:[],signals:[],crossings:[],routes:[],objects:[{id:'lamp',art:'living:gray-lamp',x:500,y:200,w:50,h:200}]};
    const world={w:1024,h:512,dungeon:{id:'city:shadow:test',scene:{streetscape:street}}},rect={x:0,y:0,w:1023,h:511};
    painter.ground(ctx,world,rect);assert.equal(projections,0);
    images.set(streetArtResources(art,street)[0].id,{width:768,height:384});
    painter.ground(ctx,world,rect);assert.equal(projections,2,'lamp silhouette must be baked in both adjacent tiles');
    painter.ground(ctx,world,rect);assert.equal(projections,2,'cached frames must not recompute shadows');
    assert.ok(painter.stats().bytes<=24*1024*1024);painter.reset();assert.ok(canvases.every(c=>c.width===0&&c.height===0));
});


test('crossing approaches and facility destinations reject out-of-map geometry',()=>{
    const {c,save}=setup(),scene=generateCityDungeon(c,generatedCityRoute({id:'curb',name:'街区',lon:114,lat:22},save)).city.nodes[0].dungeon;
    for(const [edit,message] of [
        [s=>s.transitions.aprons[0].points[0].x=-1,/过街缓坡/],
        [s=>s.transitions.tactile[0].w=Infinity,/提示铺装/],
        [s=>s.facilityNodes[0].y=2401,/落脚点/],
    ]){const invalid=structuredClone(scene);edit(invalid.streetscape);assert.throws(()=>validateStreetscape(invalid),message);}
});


test('tile baking skips distant ground geometry but keeps boundary and angled crossings',()=>{
    const seen=[],ctx=new Proxy({stroke(){seen.push(this.strokeStyle);},fill(){seen.push(this.fillStyle);}},{get:(o,k)=>o[k]||(()=>{}),set:(o,k,v)=>{o[k]=v;return true;}});
    const street={theme:'south-china',surfaces:[{points:[{x:600,y:600},{x:700,y:600},{x:700,y:700}],color:'#distant'},{points:[{x:99,y:10},{x:110,y:10},{x:110,y:40}],color:'#edge'}],roads:[{points:[{x:0,y:108},{x:200,y:108}],width:20,color:'#wide'},{points:[{x:600,y:600},{x:700,y:600}],width:20,color:'#away'}],markings:[{points:[{x:600,y:600},{x:700,y:600}],width:2,color:'#far'}]};
    paintStreetGround(ctx,street,{x:0,y:0,w:100,h:100});assert.ok(seen.includes('#edge'));assert.ok(seen.includes('#wide'));assert.ok(!seen.includes('#distant'));assert.ok(!seen.includes('#away'));assert.ok(!seen.includes('#far'));
});

test('sign layout wraps long names and marks excess paragraphs without splitting unicode',()=>{
    const measure=(text,font)=>Array.from(text).length*font;
    const wrapped=layoutStreetSignText('街坊早餐和每日热汤小铺',100,36,measure);assert.ok(wrapped.lines.length>1);for(const line of wrapped.lines)assert.ok(measure(line,wrapped.font)<=94.001);
    const overflow=layoutStreetSignText('甲\n乙\n丙\n丁',100,36,measure);assert.equal(overflow.lines.length,3);assert.ok(overflow.lines.at(-1).endsWith('…'));
    const menu=layoutStreetSignText('热包子 · 豆浆\n清早开门',25,30,measure);assert.deepEqual(menu.lines,['热包子 · 豆浆','清早开门']);
    const short=layoutStreetSignText('南风坊',100,20,measure);assert.deepEqual(short.lines,['南风坊']);assert.ok(short.font>12);
    const b=streetShadowBounds({x:500,y:200,w:50,h:200,components:[{x:100,y:-300,w:40,h:60}]});assert.ok(b.x+b.w>=732);assert.ok(b.y+b.h>=264.8);
});


test('repeated tile materials share patterns and frequently used signs survive cache pressure',()=>{
    let patternCalls=0,canvases=0;const images=new Map(),ctx=new Proxy({createPattern:()=>{patternCalls++;return{};},measureText:text=>({width:Array.from(text).length*10})},{get:(o,k)=>o[k]||(()=>{}),set:(o,k,v)=>{o[k]=v;return true;}});
    images.set(art.atlases[art.entries['living:concrete'].atlas].id,{});
    const painter=createStreetPainter({content:{cityStreetArt:art},images,registerImage(){},releaseImage(){},draw:()=>true},{makeCanvas:()=>{canvases++;return{width:0,height:0,getContext:()=>ctx};}});
    const world={w:1024,h:512,dungeon:{scene:{streetscape:{groundArt:'living:concrete',surfaces:[],roads:[],routes:[],signals:[],objects:[]}}}};
    painter.ground(ctx,world,{x:0,y:0,w:1023,h:500});assert.equal(patternCalls,1);
    const o={art:'living:breakfast',type:'building',x:100,y:100,w:200,h:180,text:'常用早餐店'};painter.draw(ctx,o,null);
    for(let i=0;i<140;i++){painter.draw(ctx,{...o,text:'变化店名'+i},null);painter.draw(ctx,o,null);}
    const count=canvases;painter.draw(ctx,o,null);assert.equal(canvases,count);assert.equal(painter.stats().signs,128);painter.reset();assert.equal(painter.stats().textures,0);assert.equal(painter.stats().signs,0);
});


test('v3 feet keep actual clearance and continuous movement cannot skip a grazing pole',()=>{
    const street={walkRadius:18,movementStep:2,edgeMargin:24,colliders:[{id:'pole',points:[{x:59,y:60},{x:59.2,y:60},{x:59.2,y:140},{x:59,y:140}]}]},scene={map:{w:200,h:200,obstacles:[]},streetscape:street},world={isCityDungeon:true,dungeon:{scene}},start={x:40,y:42.01},end={x:100,y:42.01};
    assert.ok(streetWalkable(scene,start.x,start.y));assert.ok(streetWalkable(scene,end.x,end.y));assert.equal(streetSegmentWalkable(scene,start,end),false);
    assert.equal(movePosition(world,start,60,0).x,58);
    const oldScene=structuredClone(scene);delete oldScene.streetscape.movementStep;assert.equal(movePosition({isCityDungeon:true,dungeon:{scene:oldScene}},start,60,0).x,100);
    assert.equal(streetWalkable(scene,24,160),true);assert.equal(streetWalkable(scene,23,160),false);
});

test('large props fade their whole group while physical occupancy remains blocked',()=>{
    const alphas=[],stack=[],ctx=new Proxy({globalAlpha:1,save(){stack.push(this.globalAlpha);},restore(){this.globalAlpha=stack.pop();},measureText:()=>({width:10})},{get:(o,k)=>o[k]||(()=>{}),set:(o,k,v)=>{o[k]=v;return true;}});
    const painter=createStreetPainter({content:{cityStreetArt:art},draw(c){alphas.push(c.globalAlpha);return true;}},{makeCanvas:()=>({getContext:()=>ctx})});
    const o={id:'bus',type:'prop',art:'living:bus-shelter',x:100,y:100,w:100,h:100,occludes:true,components:[{art:'living:wall-sign',x:20,y:-20,w:20,h:10}]};
    painter.draw(ctx,o,{x:100,y:60});assert.deepEqual(alphas,[.3,.3]);assert.equal(ctx.globalAlpha,1);
    const plain={...o,occludes:false};alphas.length=0;painter.draw(ctx,plain,{x:100,y:60});assert.deepEqual(alphas,[1,1]);
    const {c,save}=setup(),scene=generateCityDungeon(c,generatedCityRoute({id:'flags',name:'街区',lon:114,lat:22},save)).city.nodes[0].dungeon;
    const bus=scene.streetscape.objects.find(o=>o.id==='bus-stop');assert.ok(bus.occludes);assert.equal(streetWalkable(scene,bus.x,bus.y-10),false);
    const invalid=structuredClone(scene);invalid.streetscape.objects[0].occludes='yes';assert.throws(()=>validateStreetscape(invalid),/遮挡标记/);
});
