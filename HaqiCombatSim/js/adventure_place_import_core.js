import {geoToStreet,polygonBounds,routeLength} from './adventure_city_street_core.js';
import {emptyStreet} from './adventure_city_street_layout_core.js';
// Clip locally in game units; never clamp individual geographic vertices onto map edges.
export function clipPolygon(points,size){
    let out=points;
    for(const [axis,edge,sign]of [['x',0,1],['x',size,-1],['y',0,1],['y',size,-1]]){
        const input=out;out=[];if(!input.length)break;
        for(let i=0;i<input.length;i++){const a=input[i],b=input[(i+1)%input.length],ia=(a[axis]-edge)*sign>=0,ib=(b[axis]-edge)*sign>=0;
            if(ia)out.push(a);if(ia!==ib){const t=(edge-a[axis])/(b[axis]-a[axis]);out.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});}
        }
    }
    return out.map(p=>({x:Math.round(p.x*100)/100,y:Math.round(p.y*100)/100}));
}
export function clipLine(points,size){
    const parts=[];let current=[];
    for(let i=1;i<points.length;i++){
        const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y;let lo=0,hi=1,valid=true;
        for(const [p,q]of [[-dx,a.x],[dx,size-a.x],[-dy,a.y],[dy,size-a.y]]){if(p===0){if(q<0)valid=false;continue;}const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);}
        if(!valid||lo>hi){if(current.length>1)parts.push(current);current=[];continue;}
        const start={x:a.x+dx*lo,y:a.y+dy*lo},end={x:a.x+dx*hi,y:a.y+dy*hi};
        if(current.length&&Math.hypot(current.at(-1).x-start.x,current.at(-1).y-start.y)>1){parts.push(current);current=[];}
        if(!current.length)current.push(start);current.push(end);
    }
    if(current.length>1)parts.push(current);return parts;
}
export function placeFeatures(input){
    if(input.type==='FeatureCollection')return input.features;
    if(!Array.isArray(input.elements))throw Error('需要 OSM JSON 或 GeoJSON FeatureCollection');
    const nodes=new Map(input.elements.filter(e=>e.type==='node').map(e=>[e.id,[e.lon,e.lat]]));
    return input.elements.flatMap(e=>{
        if(e.type==='node')return [{type:'Feature',id:`osm:node:${e.id}`,properties:e.tags||{},geometry:{type:'Point',coordinates:[e.lon,e.lat]}}];
        if(e.type!=='way')return [];
        const coords=e.geometry?.map(p=>[p.lon,p.lat])||e.nodes?.map(id=>nodes.get(id));
        if(!coords?.length||coords.some(p=>!p))throw Error('OSM 缺少完整节点坐标：'+e.id);
        const closed=coords.length>3&&coords[0][0]===coords.at(-1)[0]&&coords[0][1]===coords.at(-1)[1],tags=e.tags||{};
        return [{type:'Feature',id:`osm:way:${e.id}`,properties:tags,geometry:{type:closed&&(tags.building||tags.landuse||tags.leisure||tags.natural||tags.area==='yes')?'Polygon':'LineString',coordinates:closed&&(tags.building||tags.landuse||tags.leisure||tags.natural||tags.area==='yes')?[coords]:coords}}];
    });
}
export function importPlaceGeometry(input,origin,{style='modern'}={}){
    if(!Number.isFinite(origin.lon)||Math.abs(origin.lon)>180||!Number.isFinite(origin.lat)||Math.abs(origin.lat)>85||!(origin.meters>=50&&origin.meters<=512)||origin.unitsPerMeter!==16)throw Error('地点范围或 WGS84 坐标无效');
    const size=origin.meters*origin.unitsPerMeter,s=emptyStreet(),report={roads:0,buildings:0,surfaces:0,skipped:[],inferredWidths:[],coastlines:[]};
    const osm=Array.isArray(input.elements);s.geo={crs:'WGS84',...origin};s.provenance={kind:osm?'osm-derived':'geojson-derived',attribution:osm?'© OpenStreetMap contributors':input.authoringSource?.attribution||'用户提供的地理数据',license:osm?'https://www.openstreetmap.org/copyright':input.authoringSource?.license||null,geometryDate:input.osm3s?.timestamp_osm_base||null,art:'原创艺术加工，非实测立面'};
    const convert=coords=>coords.map(p=>{if(!Array.isArray(p)||!Number.isFinite(p[0])||!Number.isFinite(p[1])||Math.abs(p[0])>180||Math.abs(p[1])>90)throw Error('地理坐标无效');return geoToStreet(p[0],p[1],origin);});
    for(const [i,feature]of placeFeatures(input).entries()){
        const id=String(feature.id??'feature:'+i),tags=feature.properties||{},g=feature.geometry;
        if(tags.tunnel==='yes'||tags.location==='underground'||Number(tags.layer)<0){report.skipped.push({id,reason:'underground'});continue;}
        if(g?.type==='LineString'){
            const parts=clipLine(convert(g.coordinates),size);
            if(tags.natural==='coastline'){report.coastlines.push(...parts.map(points=>({id,points})));continue;}
            if(!tags.highway)continue;
            const walk=['footway','pedestrian','path','cycleway','steps'].includes(tags.highway),width=Number.parseFloat(tags.width)||((walk?tags.highway==='pedestrian'?5:3:Math.max(1,Number(tags.lanes)||2)*3.2));
            if(!tags.width)report.inferredWidths.push(id);
            for(const [j,points]of parts.entries()){s.roads.push({id:id+':road:'+j,sourceId:id,provenance:'geographic',name:tags.name||'',kind:walk?'walk':'road',points,width:width*16,widthSource:tags.width?'osm':'inferred',bridge:tags.bridge==='yes'});report.roads++;}
        }else if(g?.type==='Polygon'||g?.type==='MultiPolygon'){
            for(const [part,rings]of (g.type==='Polygon'?[g.coordinates]:g.coordinates).entries()){
                const points=clipPolygon(convert(rings[0]),size);if(points.length<3)continue;
                if(rings.length>1){report.skipped.push({id,reason:'polygon holes require authored review'});continue;}
                const b=polygonBounds(points),key=id+':'+part;
                if(b.w<1||b.h<1)continue;
                if(tags.building){
                    if(b.w>1100||b.h>1000){report.skipped.push({id,reason:'large footprint needs split authoring'});continue;}
                    const gate=tags.historic==='city_gate',art=gate?'nantou-gate':style==='old'?(['shophouse','lingnan-house','corner-shop'][i%3]):'apartment';
                    s.objects.push({id:key,type:'building',art,x:b.x+b.w/2,y:b.y+b.h,w:b.w+12,h:Math.max(100,b.h+100),footprint:points,sourceId:id,provenance:'geographic-footprint',label:tags.name||'',heightSource:tags.height||tags['building:levels']||null});
                    // A city gate passage is reviewed separately, rather than filled as a solid house.
                    if(!gate)s.colliders.push({id:key+':collision',points,sourceId:id});report.buildings++;
                }else if(tags.natural||tags.landuse||tags.leisure||tags.area==='yes'){
                    const water=tags.natural==='water'||tags.water,urban=['residential','commercial','retail','industrial'].includes(tags.landuse),grass=tags.leisure==='park'||tags.landuse==='grass',color=water?'#79aeb3':urban?'#cbbfa9':tags.leisure==='pitch'?'#b6a38f':grass?'#a6b78d':'#91a87c';
                    s.surfaces.push({id:key,sourceId:id,points,kind:water?'water':urban?'paving':'grass',color});if(water)s.colliders.push({id:key+':water',points});report.surfaces++;
                }
            }
        }else if(g?.type==='Point'&&tags.highway==='traffic_signals'){
            const [p]=convert([g.coordinates]);if(p.x>=0&&p.y>=0&&p.x<=size&&p.y<=size)s.signals.push({id,sourceId:id,...p,period:14,green:8,offset:0,provenance:'geographic-location-artistic-cycle'});
        }else if(g&&g.type!=='Point')report.skipped.push({id,reason:'unsupported geometry '+g.type});
    }
    s.coverage=report;return {streetscape:s,report,size};
}
