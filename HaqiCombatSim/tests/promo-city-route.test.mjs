import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {generatedCityRoute,generateCityDungeon} from '../js/adventure_city_generated_core.js';
import {createAdventure} from '../js/adventure_core.js';
import {installCityDungeons,enterCityDungeon,leaveCityDungeon} from '../js/adventure_city_dungeons_core.js';
import {createWorld,findPath,clearTeleportSpot,WALK_SPEED} from '../js/adventure_world_core.js';
import {planPromoCityApproach,planPromoRoadLeg,samplePromoRoad} from '../js/promo_city_route_core.js';
const a={x:1000,y:1000},b={x:1000,y:1800},c={x:1800,y:1800};
const world={w:4000,h:4000,layout:{route:[a,b,c]},paths:[{a,b,width:80},{a:b,b:c,width:80}],encounters:[],trees:[],buildings:[]};
test('开始走路及拐点的浮点时间余量不会误报碰撞',()=>{
 const route={start:a,path:[b,c],seconds:1600/210};
 for(const time of [0,1e-12,.0005/210])assert.deepEqual(samplePromoRoad(world,route,time).position,a);
 const corner=samplePromoRoad(world,route,800/210+1e-12);
 assert.ok(Math.hypot(corner.position.x-b.x,corner.position.y-b.y)<.001);
 assert.ok(samplePromoRoad(world,route,.02).position.y>a.y);
});
test('真正被障碍挡住的路线仍报告碰撞',()=>{
 const blocked={...world,isCityDungeon:true,dungeon:{scene:{map:{obstacles:[{x:999,y:1000.001,w:2,h:100}]}}}};
 assert.throws(()=>samplePromoRoad(blocked,{start:a,path:[b],seconds:4},1),/碰撞/);
});
test('福田口岸进城起步、逐帧短走和退出均能完成',()=>{
 const read=file=>JSON.parse(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'));
 const content=read('data/adventure/chapter.json');content.worldMaps={camp:read(content.worldMapIndex.islands.camp.file)};content.dungeons=[];content.cityStreetArt=read('data/adventure/earth/street-art.json');
 const save=createAdventure(content,{seed:530});save.zone='earth';const outside={...save.position};
 const city=generateCityDungeon(content,generatedCityRoute({id:'5510519',name:'福田口岸',lon:114.07,lat:22.51},save)).city;
 installCityDungeons(content,city);enterCityDungeon(save,content,city.nodes[0].dungeon.id);
 const world=createWorld(save.zone,content,save),start=clearTeleportSpot(world,save.position.x,save.position.y,world.encounters,120)||save.position;
 const route={start,path:findPath(world,start,{x:start.x,y:start.y-160}),seconds:160/WALK_SPEED};
 for(const time of [1e-12,...Array.from({length:121},(_,i)=>i/120*route.seconds)])save.position=samplePromoRoad(world,route,time).position;
 assert.ok(Math.hypot(save.position.x-start.x,save.position.y-start.y)>100);
 leaveCityDungeon(save,content);assert.equal(save.zone,'earth');assert.deepEqual(save.position,outside);
});
test('城市路线沿道路转弯，5至10秒内准确抵达入口，可确定性跳转',()=>{
 const route=planPromoCityApproach(world,a);
 assert.ok(route.seconds>=5&&route.seconds<=10);
 assert.deepEqual(samplePromoRoad(world,route,0).position,route.start);
 const middle=samplePromoRoad(world,route,2);
 assert.ok(Math.abs(middle.position.y-1800)<.001);
 assert.deepEqual(samplePromoRoad(world,route,2),middle);
 const end=samplePromoRoad(world,route,route.seconds+.001);
 assert.ok(Math.hypot(end.position.x-a.x,end.position.y-a.y)<.001);
 assert.equal(end.moving,false);
});
test('无可用道路不能伪造城市移动路线',()=>{
 assert.throws(()=>planPromoCityApproach({...world,paths:[]},a),/道路路线/);
});
test('指定地点路线接通路段中间的交叉口，按顺序到达两个口岸',()=>{
 const w={...world,layout:{route:[a,b,c]},paths:[{a,b:{x:1000,y:2500},width:80},{a:b,b:c,width:80}]};
 const leg=planPromoRoadLeg(w,a,c),end=samplePromoRoad(w,leg,leg.seconds+.001);
 assert.ok(Math.hypot(end.position.x-c.x,end.position.y-c.y)<.001);
 assert.ok(leg.path.some(p=>Math.hypot(p.x-b.x,p.y-b.y)<.001));
});
