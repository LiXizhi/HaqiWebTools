// Screen-space atlas rules. Keep sparse destinations; reduce collisions, not city totals.
import {inGeoBounds,wrapLongitude} from './adventure_earth_core.js';

export function layoutEarthAtlasMarkers(cities,view,rules,regions=[],selected=null){
    const storyRegions=regions.filter(region=>region.manifest),{width,height,center,span,latSpan}=view;
    const rows=cities.filter(city=>Number.isFinite(city.lon)&&Number.isFinite(city.lat)).map(city=>{
        const story=storyRegions.some(region=>city.id===region.id||(region.bounds&&inGeoBounds(city,region.bounds)));
        return {city,story,authored:storyRegions.some(region=>city.id===region.id),selected:!!selected&&(city.id===selected.id&&city.id!==undefined||city.lon===selected.lon&&city.lat===selected.lat),
            x:(wrapLongitude(city.lon-center.lon)/span+.5)*width,y:(.5-(city.lat-center.lat)/latSpan)*height};
    }).filter(p=>p.x>=0&&p.y>=0&&p.x<=width&&p.y<=height)
        .sort((a,b)=>Number(b.selected)-Number(a.selected)||Number(b.story)-Number(a.story)||Number(b.authored)-Number(a.authored)||(a.city.level||1)-(b.city.level||1)||(b.city.population||0)-(a.city.population||0)||String(a.city.id||a.city.name).localeCompare(String(b.city.id||b.city.name)));
    const markers=[],seen=new Set();
    for(const row of rows){
        const key=`${wrapLongitude(row.city.lon).toFixed(4)}:${row.city.lat.toFixed(4)}`;
        if(seen.has(key))continue;seen.add(key);
        if(!row.story&&!row.selected&&markers.some(p=>Math.hypot(p.x-row.x,p.y-row.y)<rules.atlasMarkerSpacing))continue;
        markers.push({...row,radius:row.story?rules.atlasStoryMarkerRadius:rules.atlasMarkerRadius});
    }
    return markers;
}

export function layoutEarthAtlasNames(markers,width,height,measure,reserved=[]){
    const boxes=[...reserved],overlaps=(a,b)=>a.x<b.x+b.w+4&&a.x+a.w+4>b.x&&a.y<b.y+b.h+4&&a.y+a.h+4>b.y;
    return markers.map(p=>{
        const w=measure(p.city.name)+8,h=22,offset=p.radius+5;
        const candidates=[{x:p.x+offset,y:p.y-h/2,w,h},{x:p.x-offset-w,y:p.y-h/2,w,h},{x:p.x-w/2,y:p.y-offset-h,w,h},{x:p.x-w/2,y:p.y+offset,w,h}];
        const label=candidates.find(box=>box.x>=0&&box.y>=0&&box.x+w<=width&&box.y+h<=height&&!boxes.some(b=>overlaps(box,b))&&!markers.some(other=>other!==p&&overlaps(box,{x:other.x-other.radius,y:other.y-other.radius,w:other.radius*2,h:other.radius*2})));
        if(label)boxes.push(label);
        return {...p,label:label||null};
    });
}

export function pickEarthAtlasMarker(markers,x,y,radius){
    // Names are direct targets; otherwise choose the nearest visible marker, never a hidden city.
    const named=markers.find(p=>p.label&&x>=p.label.x&&x<=p.label.x+p.label.w&&y>=p.label.y&&y<=p.label.y+p.label.h);
    if(named)return named.city;
    let nearest=null,distance=radius;
    for(const p of markers){const d=Math.hypot(p.x-x,p.y-y);if(d<=distance){nearest=p.city;distance=d;}}
    return nearest;
}
