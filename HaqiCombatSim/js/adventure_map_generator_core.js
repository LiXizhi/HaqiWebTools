// Offline, deterministic map compilation. The browser reads the generated JSON.
import { createRng } from './rng_core.js';
import { onLargeIsland, riverBlocks, regionAt, segmentDistance } from './adventure_island_layout_core.js';

const point=([x,y])=>({x,y});
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function mergeMapRules(base,override={}){
    const out=structuredClone(base);
    for(const [key,value] of Object.entries(override))out[key]=value&&typeof value==='object'&&!Array.isArray(value)?mergeMapRules(out[key]||{},value):structuredClone(value);
    return out;
}
const assert=(ok,message)=>{if(!ok)throw Error(`地图配置无效：${message}`);};
export function validateMapSource(spec,rules){
    assert(rules.schemaVersion===1&&Number.isInteger(rules.layoutVersion)&&rules.layoutVersion>=1,'生成规则版本');
    assert(spec.id&&Number.isInteger(spec.seed),'标识或种子');
    assert(Number.isFinite(spec.w)&&Number.isFinite(spec.h)&&spec.w>=1000&&spec.h>=1000&&spec.w<=16000&&spec.h<=16000,'地图尺寸');
    const xy=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=0&&p[0]<=spec.w&&p[1]>=0&&p[1]<=spec.h;
    assert(spec.coast?.length>=3&&spec.coast.every(xy),'海岸坐标');
    assert(xy([spec.spawn?.x,spec.spawn?.y])&&xy([spec.portal?.x,spec.portal?.y]),'出生点或旅行入口');
    assert(spec.routes?.length&&spec.routes.every(r=>r.length>=2&&r.every(xy)),'道路坐标');
    assert(spec.regions?.length&&new Set(spec.regions.map(r=>r.id)).size===spec.regions.length,'区域编号');
    for(const r of spec.regions)assert(rules.biomes[r.biome]&&xy([r.x,r.y])&&r.rx>0&&r.ry>0,`区域 ${r.id}`);
    assert(rules.biomes[spec.baseBiome],'默认地域');
    const f=rules.forest;
    assert(Number.isInteger(f.maxTrees)&&f.maxTrees>=0&&f.maxTrees<=3000&&f.spacing>=40&&f.attemptsPerMillion>0&&f.attemptsPerMillion<=1000,'森林预算');
    assert(f.size?.length===2&&f.size.every(Number.isFinite)&&f.size[0]>=50&&f.size[1]>=f.size[0]&&f.size[1]<=230,'树木尺寸');
    const texture=rules.terrain.texture;
    assert(Number.isFinite(texture.cell)&&texture.cell>=32&&texture.cell<=256&&Number.isInteger(texture.count)&&texture.count>=0&&texture.count<=32,'地面纹理预算');
    assert(Number.isInteger(rules.mountain.layers)&&rules.mountain.layers>=1&&rules.mountain.layers<=12,'山体层数');
    assert(rules.roads.width>=20&&rules.roads.width<=200&&rules.roads.spurWidth>=20,'道路宽度');
    for(const [id,b] of Object.entries(rules.biomes)){
        assert(/^#[a-f\d]{6}$/i.test(b.color)&&b.forest.density>=0&&b.forest.density<=1,`地域 ${id}`);
        assert(b.forest.tiles.length&&b.forest.tiles.every(n=>Number.isInteger(n)&&n>=0&&n<=3),`树种 ${id}`);
        assert(['motes','snow','sand','mist','embers','ash','none'].includes(b.weather.kind)&&Number.isInteger(b.weather.count)&&b.weather.count>=0&&b.weather.count<=64,`天气 ${id}`);
        assert([b.weather.speed,b.weather.wind].every(Number.isFinite),`天气速度 ${id}`);
    }
    for(const r of spec.rivers||[])assert(r.points?.length>=2&&r.points.every(xy)&&r.width>0&&rules.water[r.material||'water'], '河流');
    for(const l of spec.lakes||[])assert(xy([l.x,l.y])&&l.rx>0&&l.ry>0&&rules.water[l.material||'water'],'湖泊');
    for(const p of Object.values({...spec.npcPositions,...spec.encounterPositions}))assert(xy(p),'交互位置');
    for(const p of spec.visitingNpcs||[])assert(xy(p.position),'访问居民位置');
    for(const m of spec.mountains||[])assert(xy([m.x,m.y])&&rules.biomes[m.biome]&&(!m.scale||(m.scale>0&&m.scale<=5)),'山体位置或地域');
    for(const r of spec.regions){
        const biome=rules.biomes[r.biome],weather={...biome.weather,...r.weather},forest={...biome.forest,...r.forest};
        assert(['motes','snow','sand','mist','embers','ash','none'].includes(weather.kind)&&Number.isInteger(weather.count)&&weather.count>=0&&weather.count<=64&&[weather.speed,weather.wind].every(Number.isFinite),`区域天气 ${r.id}`);
        assert(forest.density>=0&&forest.density<=1&&forest.tiles?.length&&forest.tiles.every(n=>Number.isInteger(n)&&n>=0&&n<=3),`区域森林 ${r.id}`);
    }
    return true;
}

function crossing(a,b,c,d){
    const ax=b.x-a.x,ay=b.y-a.y,bx=d.x-c.x,by=d.y-c.y,cross=ax*by-ay*bx;
    if(Math.abs(cross)<1e-8)return null;
    const t=((c.x-a.x)*by-(c.y-a.y)*bx)/cross,u=((c.x-a.x)*ay-(c.y-a.y)*ax)/cross;
    if(t<0||t>1||u<0||u>1)return null;
    return {x:a.x+t*ax,y:a.y+t*ay,sine:Math.abs(cross)/(Math.hypot(ax,ay)*Math.hypot(bx,by))};
}

export function generateIsland(spec,shared,content){
    assert(!spec.theme||shared.themes?.[spec.theme],`未知主题 ${spec.theme}`);
    const rules=mergeMapRules(mergeMapRules(shared,shared.themes?.[spec.theme]||{}),spec.overrides);
    validateMapSource(spec,rules);
    delete rules.themes;
    const layout={...structuredClone(spec),version:1,layoutVersion:shared.layoutVersion,rules,
        regions:spec.regions.map(r=>({...structuredClone(r),...{color:r.color||rules.biomes[r.biome].color,weather:{...rules.biomes[r.biome].weather,...r.weather}}})),
        bridges:structuredClone(spec.bridges||[]),trees:[],paths:[]};
    delete layout.overrides;
    const world={layout};
    const roads=spec.routes.flatMap(route=>route.slice(1).map((p,i)=>({a:point(route[i]),b:point(p),width:rules.roads.width})));
    if(spec.autoBridges!==false&&rules.bridge.auto)for(const road of roads)for(const river of spec.rivers||[])for(let i=1;i<river.points.length;i++){
        const cross=crossing(road.a,road.b,point(river.points[i-1]),point(river.points[i]));
        if(!cross||layout.bridges.some(b=>dist(b,cross)<50))continue;
        assert(cross.sine>.2,`${spec.id} 道路沿河过近，请调整交角`);
        const length=Math.ceil((river.width+24)/cross.sine+rules.bridge.margin*2);
        layout.bridges.push({x:Math.round(cross.x),y:Math.round(cross.y),w:length,h:road.width+rules.bridge.margin,
            angle:Math.atan2(road.b.y-road.a.y,road.b.x-road.a.x),generated:true});
    }
    layout.landmarks=spec.landmarks??layout.regions.map(r=>({id:r.id,name:r.name,...point(r.sign||[r.x+100,r.y+60]),description:r.description}));
    const npcs=Object.values(content.npcs).filter(n=>n.zone===spec.id).map(n=>point(spec.npcPositions[n.id]||[n.x,n.y]));
    const encounters=content.encounters.filter(n=>n.zone===spec.id).map(n=>point(spec.encounterPositions[n.id]||[n.x,n.y]));
    const visiting=(spec.visitingNpcs||[]).map(n=>{assert(content.npcs[n.sourceId],`居民来源 ${n.sourceId}`);return point(n.position);});
    const clearings=[...npcs,...visiting,...encounters,...layout.landmarks,spec.portal,spec.spawn,spec.initialSpawn||spec.spawn,spec.center||spec.spawn];
    layout.paths=[...roads];
    for(const p of [...npcs,...visiting,...encounters,...layout.landmarks,spec.portal]){
        let nearest=null,best=Infinity;
        for(const road of roads){
            const dx=road.b.x-road.a.x,dy=road.b.y-road.a.y,t=Math.max(0,Math.min(1,((p.x-road.a.x)*dx+(p.y-road.a.y)*dy)/(dx*dx+dy*dy||1)));
            const q={x:road.a.x+t*dx,y:road.a.y+t*dy},d=dist(q,p);
            if(d<best){best=d;nearest=q;}
        }
        if(best>.1)layout.paths.push({a:nearest,b:{x:p.x,y:p.y},width:rules.roads.spurWidth});
    }
    const rng=createRng(spec.seed),f=rules.forest,attempts=Math.ceil(spec.w*spec.h/1e6*f.attemptsPerMillion);
    for(let i=0;i<attempts&&layout.trees.length<f.maxTrees;i++){
        const p={x:rng.int(0,spec.w),y:rng.int(0,spec.h)};
        if(!onLargeIsland(world,p.x,p.y,f.coastPadding)||riverBlocks(world,p.x,p.y))continue;
        const region=regionAt(world,p),biome=rules.biomes[region.biome],forest={...biome.forest,...region.forest};
        if(rng.float()>forest.density)continue;
        if(clearings.some(n=>dist(p,n)<f.clearingRadius)||(spec.buildings||[]).some(b=>Math.abs(p.x-b.x)<b.w&&Math.abs(p.y-b.y)<b.h))continue;
        if(layout.paths.some(r=>segmentDistance(p,r.a,r.b)<r.width/2+rules.roads.treeClearance)||layout.trees.some(t=>dist(t,p)<f.spacing))continue;
        layout.trees.push({...p,tile:rng.pick(forest.tiles),size:rng.int(...f.size),snow:!!biome.snow});
    }
    // Ground detail positions are baked once; the runtime does no procedural spawning.
    layout.details=Array.from({length:Math.min(850,Math.round(spec.w*spec.h/45000))},()=>{
        const p={x:rng.int(0,spec.w),y:rng.int(0,spec.h)},region=regionAt(world,p);
        return {...p,biome:region.biome,size:rng.int(4,12)};
    }).filter(p=>onLargeIsland(world,p.x,p.y,80)&&!riverBlocks(world,p.x,p.y)&&!layout.paths.some(r=>segmentDistance(p,r.a,r.b)<r.width/2+12));
    return layout;
}
