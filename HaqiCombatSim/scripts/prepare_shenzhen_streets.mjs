// Reproducible authoring of the two selected pilot scenes. OSM snapshots are inputs,
// city JSON is the runtime author source. Existing event IDs and content are retained.
import fs from 'node:fs';
import {importPlaceGeometry} from '../js/adventure_place_import_core.js';
import {streetObject,placeStreetPoint,rectangle} from '../js/adventure_city_street_layout_core.js';
import {streetWalkable,routeLength,routePose,segmentDistance,polygonContains,polygonBounds} from '../js/adventure_city_street_core.js';
import {createRng} from '../js/rng_core.js';
import {validateEarthCity} from '../js/adventure_earth_city_config_core.js';
const cityPath='data/adventure/earth/cities/shenzhen.json',city=JSON.parse(fs.readFileSync(cityPath,'utf8'));
const residents=city.npcs.filter(n=>n.id!==990002).slice(0,6);
function imported(name,origin,style){
    const file=`scripts/sources/places/${name}.osm.json`,input=JSON.parse(fs.readFileSync(file,'utf8'));
    const {streetscape:s}=importPlaceGeometry(input,{...origin,meters:300,unitsPerMeter:16},{style});
    s.provenance.sourceFile=file;s.provenance.retrievedAt=input.authoringSource?.retrievedAt;s.provenance.sourceUrl=input.authoringSource?.url;
    return s;
}
const nantouId='city:shenzhen:nantou';
const nantou={id:'nantou',cityId:'shenzhen',name:'南头古城',lon:113.9156824,lat:22.5448526,source:{kind:'authored',id:'nantou'},dungeon:{id:nantouId,theme:'street',map:{w:4800,h:4800,spawn:{x:2350,y:3550},exit:{x:2400,y:3840},obstacles:[]},hotspots:[],npcs:[],items:{menu:{name:'手写小食菜单'}},actions:[],encounters:[{id:nantouId+':corner',monsterId:'water-bubble',x:4200,y:4200}],completion:[nantouId+':deliver'],art:{mode:'street-webp',npcAtlas:city.art.npcs.id}}};
const ns=nantou.dungeon.streetscape=imported('nantou',{lon:113.9157,lat:22.5454},'old');
ns.ground='#d3c7b0';
// OSM does not cover every facade on this street. Fill only uncovered residential
// frontage; these are explicitly artistic placements, never surveyed footprints.
const main=ns.roads.find(r=>r.name==='中山南街');
for(let i=0;i<14;i++)for(const side of [-1,1]){
    const p=routePose(main,180+i*205),x=p.x+side*(150+(i%3)*10),y=p.y;
    const box={x:x-100,y:y-90,w:200,h:120};
    if(y<180||ns.objects.some(o=>o.footprint&&(()=>{const b=polygonBounds(o.footprint);return b.x<box.x+box.w&&b.x+b.w>box.x&&b.y<box.y+box.h&&b.y+b.h>box.y;})()))continue;
    if(!ns.surfaces.some(s=>s.kind==='paving'&&polygonContains({x,y},s.points)))continue;
    if(ns.roads.some(r=>r.points.slice(1).some((p,j)=>segmentDistance({x,y},r.points[j],p)<r.width/2+65)))continue;
    streetObject(ns,`art-frontage:${side}:${i}`,['shophouse','lingnan-house','corner-shop','cafe'][i%4],x,y,200,185,{solid:true,type:'building',label:['街边小食','手作铺','茶饮','老街杂货'][i%4]});
    streetObject(ns,`front-flowers:${side}:${i}`,'flowers',x-side*85,y+20,44,48);
}
nantou.dungeon.map.spawn={x:2290,y:2810};
const gate=ns.objects.find(o=>o.art==='nantou-gate');
if(gate){const b=polygonBounds(gate.footprint),gap=90,wall=(b.w-gap)/2;ns.colliders.push({id:'gate:left-wall',points:rectangle(b.x,b.y,wall,b.h),provenance:'authored-passage'},{id:'gate:right-wall',points:rectangle(b.x+b.w-wall,b.y,wall,b.h),provenance:'authored-passage'});}
const bay=structuredClone(city.nodes.find(n=>n.id==='bay'));
bay.dungeon.hotspots=bay.dungeon.hotspots.filter(h=>!h.id.startsWith('promenade-'));
bay.dungeon.npcs=bay.dungeon.npcs.filter(n=>bay.dungeon.hotspots.some(h=>h.npcId===n.id));
bay.dungeon.actions=bay.dungeon.actions.filter(a=>!a.hotspot.startsWith('promenade-'));
// The original route identity survives the geographic correction to Haiyun Park.
bay.lon=113.97665;bay.lat=22.5217;bay.name='深圳湾公园·海韵园';
const bs=bay.dungeon.streetscape=imported('bay',{lon:bay.lon,lat:bay.lat},'modern');bs.ground='#b8c49c';
bay.dungeon.map={w:4800,h:4800,spawn:{x:2420,y:3940},exit:{x:2420,y:3750},obstacles:[]};bay.dungeon.buildings=[];
// OSM coast is directed with land on its left. This pilot has a west-to-east coast;
// join the two source ways and close along the south scene boundary (sea side).
const coast=bs.coverage.coastlines.sort((a,b)=>a.points[0].x-b.points[0].x);
const shore=coast.flatMap((c,i)=>i?c.points.slice(1):c.points);
if(shore.length<3||Math.abs(shore[0].x)>1||Math.abs(shore.at(-1).x-4800)>1)throw Error('深圳湾海岸线不完整，需要核对数据');
const water=[...shore,{x:4800,y:4800},{x:0,y:4800}];
bs.surfaces.push({id:'bay-sea',kind:'water',color:'#78aeb3',points:water,sourceIds:coast.map(c=>c.id),provenance:'geographic'});bs.colliders.push({id:'bay-sea:collision',points:water});
// The paired walk/cycle paths retain their real curves. The railing follows the coast.
for(let i=0;i<shore.length-1;i++){const a=shore[i],b=shore[i+1],len=Math.hypot(b.x-a.x,b.y-a.y);for(let d=0;d<len;d+=45){const t=d/len;bs.objects.push({id:`rail-${i}-${Math.round(d)}`,type:'prop',art:'railing',x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t-12,w:45,h:35,angle:Math.atan2(b.y-a.y,b.x-a.x),provenance:'artistic-along-geographic-coast'});}}
function decorate(scene,style){
    const s=scene.streetscape,rng=createRng(style==='old'?31415:27182),roads=s.roads;
    for(let i=0;i<(style==='old'?60:160);i++){
        const x=rng.int(80,4720),y=rng.int(style==='old'?140:1100,style==='old'?4580:4050);
        if(!streetWalkable(scene,x,y,25)||roads.some(r=>r.points.slice(1).some((p,j)=>segmentDistance({x,y},r.points[j],p)<r.width/2+55)))continue;
        streetObject(s,'tree:'+i,i%5?'banyan':'palm',x,y,style==='old'?100:155,style==='old'?135:210,{type:'tree'});
    }
    const walk=roads.filter(r=>r.kind==='walk'&&routeLength(r.points)>600).sort((a,b)=>routeLength(b.points)-routeLength(a.points));
    for(const [i,r]of walk.slice(0,2).entries()){
        const points=r.points.map(p=>({x:Math.max(50,Math.min(4750,p.x)),y:Math.max(50,Math.min(4750,p.y))}));
        s.routes.push({id:'pedestrians:'+i,kind:'pedestrian',points:[...points,...points.slice(0,-1).reverse()],speed:22,count:3});
    }
    const traffic=roads.filter(r=>{
        if(r.kind!=='road'||routeLength(r.points)<=1500)return false;
        // Do not animate traffic through overlapping source footprints or the
        // manually corrected gate. Retain geometry, select a clear real road.
        for(let d=80;d<routeLength(r.points)-80;d+=16){const p=routePose(r,d);if(!streetWalkable(scene,p.x,p.y,25))return false;}
        return true;
    }).sort((a,b)=>routeLength(b.points)-routeLength(a.points));
    for(const [i,r]of traffic.slice(0,style==='old'?1:2).entries())s.routes.push({id:'vehicles:'+i,kind:'vehicle',points:r.points,speed:style==='old'?55:110,count:3,art:i?'minibus':'car',stops:[]});
}
decorate(nantou.dungeon,'old');decorate(bay.dungeon,'bay');
function put(scene,p){return placeStreetPoint(scene,p);}
const positions=[[2390,3490],[2370,3060],[2290,2590],[2250,2050],[2220,1500],[2180,920]];
const jobs=['街区向导','小食摊主','果摊店主','修理师傅','街区居民','旅行者'];
const chats=['前面就是南城门。沿中山南街慢慢走，两边的小巷也值得看看。','这里有热腾腾的小食。帮我把这张菜单送到前面的果摊，好吗？','谢谢你跑这一趟。把菜单放在篮子旁边就好。','这辆自行车还差最后一步。我把刹车检查好再交还。','老房子的窗、屋檐和街边的新店，各有各的模样。','我想记住这条街。走慢一点，才能看清细节。'];
for(let i=0;i<6;i++){
    const scene=nantou.dungeon,npc=residents[i],at=put(scene,{x:positions[i][0],y:positions[i][1]});
    scene.npcs.push({id:npc.id,...at,name:npc.name+'·'+jobs[i]});scene.hotspots.push({id:'resident-'+i,kind:'npc',npcId:npc.id,name:jobs[i],...at,text:chats[i]});
    scene.actions.push({id:nantouId+(i===2?':deliver':':talk:'+i),hotspot:'resident-'+i,label:i===1?'接过菜单':i===2?'送来菜单':'聊一聊',reply:i===1?'你收好了菜单。':i===2?'店主收下菜单，向你道谢。':'你听到了这位居民的介绍。',...(i===1?{give:{menu:1}}:i===2?{requires:[nantouId+':talk:1'],consume:{menu:1}}:{})});
    if(i===1||i===2){const atProp=put(scene,{x:at.x+90,y:at.y-10});streetObject(ns,'stall:'+i,i===1?'food-stall':'fruit-stall',atProp.x,atProp.y,95,100);}
}
// Bay's original life tasks and optional magic encounter retain all event/item IDs.
const bayPoints={ranger:[2400,3970],visitor:[2690,4080],notice:[2350,3820],scope:[2700,4210],cards:[2210,3980],station:[4250,3720]};
for(const h of bay.dungeon.hotspots)Object.assign(h,put(bay.dungeon,{x:bayPoints[h.id][0],y:bayPoints[h.id][1]}));
for(const n of bay.dungeon.npcs){const h=bay.dungeon.hotspots.find(h=>h.npcId===n.id);Object.assign(n,{x:h.x,y:h.y});}
const extra=city.npcs.filter(n=>n.id!==990002&&!bay.dungeon.npcs.some(r=>r.id===n.id)).slice(0,4);
for(const [i,n]of extra.entries()){
    const at=put(bay.dungeon,{x:600+i*850,y:3950-i*60}),id='promenade-'+i;
    bay.dungeon.npcs.push({id:n.id,...at});bay.dungeon.hotspots.push({id,kind:'npc',npcId:n.id,name:n.name,...at,text:['海风吹过来很舒服。累了可以坐一会儿。','步道和骑行道各有自己的位置。留出空间，大家都走得舒心。','我们沿绿道看看风景吧。不要走进水边的草丛。','我带了水和帽子，准备慢慢散步。'][i]});bay.dungeon.actions.push({id:bay.dungeon.id+':'+id,hotspot:id,label:'聊聊海边生活',reply:'你和对方聊起了海边的生活。'});
}
for(const scene of [nantou.dungeon,bay.dungeon]){
    scene.map.spawn=put(scene,scene.map.spawn);scene.map.exit=put(scene,scene.map.exit);scene.encounters.forEach(e=>Object.assign(e,put(scene,scene===bay.dungeon?{x:4350,y:3400}:e)));
    for(const [i,h]of scene.hotspots.entries())if(h.kind!=='npc'&&h.kind!=='binoculars'){streetObject(scene.streetscape,'hotspot-art:'+h.id,h.kind==='counter'?'bench':'shelter',h.x+70,h.y-45,100,85);h.streetArt=true;}
    scene.streetscape.note='道路、建筑占地与岸线来自 OpenStreetMap；道路宽度缺失时按类别估算。立面、店名、人物与街具为原创艺术加工。';
}
for(let i=0;i<16;i++){
    const p=put(bay.dungeon,{x:170+i*280,y:3920+Math.sin(i*.3)*220});streetObject(bs,'rest:'+i,i%3===0?'bicycles':'bench',p.x,p.y-30,95,65);
}
// New geographical position belongs to the same authored bay route, not a new dungeon.
Object.assign(city.buildings.find(b=>b.id==='bay'),{lon:bay.lon,lat:bay.lat});
if(!city.buildings.some(b=>b.id==='nantou'))city.buildings.push({id:'nantou',name:'南头古城',lon:nantou.lon,lat:nantou.lat,frame:5,w:230,h:230});
city.nodes=city.nodes.filter(n=>n.id!=='nantou').map(n=>n.id==='bay'?bay:n);city.nodes.push(nantou);
city.sources=city.sources.filter(s=>!['streets-osm','nantou-tourism','bay-greenway'].includes(s.id));city.sources.push({id:'streets-osm',url:'https://www.openstreetmap.org/copyright',title:'OpenStreetMap 道路、建筑轮廓与海岸线',accessed:'2026-10-03'},{id:'nantou-tourism',url:'https://wtl.sz.gov.cn/lyfw/lyxw/content/post_10984289.html',title:'南头古城官方介绍',accessed:'2026-10-03'},{id:'bay-greenway',url:'https://cgj.sz.gov.cn/xsmh/szlh/jpld/content/post_2053209.html',title:'深圳湾绿道官方介绍',accessed:'2026-10-03'});
validateEarthCity(city);
if(process.argv.includes('--write')){
    fs.writeFileSync(cityPath,JSON.stringify(city,null,2)+'\n');const file='data/adventure/earth/index.json',index=JSON.parse(fs.readFileSync(file,'utf8'));index.regions.find(r=>r.id===city.id).dungeonIds=[city.entrance.dungeonId,...city.nodes.map(n=>n.dungeon.id)];const next=JSON.stringify(index,null,2)+'\n';if(fs.readFileSync(file,'utf8')!==next)fs.writeFileSync(file,next);
}
console.log(JSON.stringify({mode:process.argv.includes('--write')?'written':'preview',nodes:[nantou,bay].map(n=>({id:n.id,roads:n.dungeon.streetscape.roads.length,buildings:n.dungeon.streetscape.coverage.buildings,objects:n.dungeon.streetscape.objects.length,npcs:n.dungeon.npcs.length}))}));
