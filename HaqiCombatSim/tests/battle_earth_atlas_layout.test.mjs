import test from 'node:test';
import assert from 'node:assert/strict';
import {earthRules} from '../js/adventure_earth_core.js';
import {layoutEarthAtlasMarkers,layoutEarthAtlasNames,pickEarthAtlasMarker} from '../js/earth_atlas_layout_core.js';
const rules=earthRules(),view={width:900,height:470,center:{lon:0,lat:12.5},span:360,latSpan:180};

test('spatial thinning favors common cities in clusters while retaining isolated low-population destinations, without a total cap',()=>{
    const cities=Array.from({length:30},(_,i)=>({id:`remote-${i}`,name:`偏远${i}`,lon:-160+(i%10)*32,lat:-50+Math.floor(i/10)*45,level:2,population:100}));
    cities.push({id:'major',name:'常用城市',lon:0,lat:12.5,level:1,population:1000000},{id:'crowded',name:'相邻小城',lon:1,lat:12.5,level:2,population:100});
    const markers=layoutEarthAtlasMarkers(cities,view,rules);
    assert.ok(markers.length>24);assert.ok(markers.some(p=>p.city.id==='major'));assert.ok(!markers.some(p=>p.city.id==='crowded'));assert.ok(markers.some(p=>p.city.id==='remote-0'));
    for(let i=0;i<markers.length;i++)for(const other of markers.slice(i+1))assert.ok(Math.hypot(markers[i].x-other.x,markers[i].y-other.y)>=rules.atlasMarkerSpacing);
});

test('zoom unfolds nearby cities, story destinations stay visible, and duplicate geographic points are removed',()=>{
    const cities=[{id:'large',name:'大城',lon:0,lat:12.5,level:1,population:1000000},{id:'small',name:'小城',lon:1,lat:12.5,level:2},{id:'story',name:'剧情城',lon:2,lat:12.5},{id:'duplicate',name:'剧情城',lon:2,lat:12.5,population:10000000}];
    const regions=[{id:'story',manifest:'cities/story.json',bounds:{west:1.9,east:2.1,south:12,north:13}}];
    const wide=layoutEarthAtlasMarkers(cities,view,rules,regions),close=layoutEarthAtlasMarkers(cities,{...view,span:10,latSpan:5},rules,regions);
    assert.ok(wide.some(p=>p.story));assert.ok(!wide.some(p=>p.city.id==='small'));assert.ok(close.some(p=>p.city.id==='small'));assert.equal(close.filter(p=>p.city.lon===2).length,1);assert.ok(close.some(p=>p.city.id==='story'));
    assert.equal(close.find(p=>p.city.id==='small').radius,rules.atlasMarkerRadius);
});

test('names never overlap each other or other markers and are direct click targets even beyond the point radius',()=>{
    const points=[{city:{id:'a',name:'很长的城市名称'},x:100,y:100,radius:6},{city:{id:'b',name:'另一个城市'},x:180,y:120,radius:6}];
    const markers=layoutEarthAtlasNames(points,400,220,name=>name.length*13);
    for(const p of markers){assert.ok(p.label);const b=p.label;assert.ok(b.x>=0&&b.y>=0&&b.x+b.w<=400&&b.y+b.h<=220);assert.equal(pickEarthAtlasMarker(markers,b.x+b.w-2,b.y+b.h/2,1),p.city);}
    const [a,b]=markers.map(p=>p.label);assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y);
    assert.equal(pickEarthAtlasMarker(markers,points[0].x-40,100,48),points[0].city);
    assert.equal(pickEarthAtlasMarker(markers,0,0,48),null);
});

test('mobile layouts use actual screen pixels and correctly wrap destinations across the date line',()=>{
    const cities=[{id:'across',name:'日期线城市',lon:-179,lat:12.5},{id:'remote',name:'远方城市',lon:100,lat:12.5}];
    const markers=layoutEarthAtlasMarkers(cities,{...view,width:330,height:220,center:{lon:179,lat:12.5}},rules);
    const p=markers.find(p=>p.city.id==='across');assert.ok(p.x>165&&p.x<170);assert.equal(p.radius,6);assert.equal(pickEarthAtlasMarker(markers,p.x+30,p.y,48),p.city);
});
