import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {homeRooms} from '../js/home_room_core.js';
import {homePositionBinding,homePositionCurrent} from '../js/home_position_core.js';
import {roomFixture} from './home_room_fixture.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../data/adventure/home/catalog.json',import.meta.url),'utf8')).items;
test('in requires a real bounded room and the full furniture footprint inside',()=>{
 const structure=roomFixture(),book={id:'book',itemId:'book',x:3,y:1},objects=[book,...structure];
 assert.equal(homeRooms(objects,catalog).length,1);
 const binding=homePositionBinding({kind:'in',anchorItemIds:['build-wood-floor']},'book',objects,catalog);assert.ok(binding);
 assert.equal(homePositionCurrent(binding,objects,catalog),false);
 const moved=[{...book,x:-1,y:-3},...structure];assert.equal(homePositionCurrent(binding,moved,catalog),true);
 for(const change of [{x:-2,y:-3},{x:1.5,y:-3},{x:-1,y:-3,parentId:'table'},{x:-1,y:-3,properties:{surface:'roof'}}])assert.equal(homePositionCurrent(binding,[{...book,...change},...structure],catalog),false);
 assert.equal(homePositionCurrent(binding,moved.filter(o=>o.id!=='room-wall-0-0'),catalog),false);
 assert.equal(homePositionCurrent(binding,moved.map(o=>o.id==='room-wall-0-0'?{...o,id:'replacement'}:o),catalog),false);
});
test('open floors, missing tiles, fences and internal dividers do not masquerade as a room',()=>{
 const rows=roomFixture();
 for(const bad of [rows.filter(o=>o.itemId.includes('floor')),rows.filter(o=>o.id!=='room-floor-1-1'),rows.map(o=>o.itemId==='build-wood-wall'?{...o,itemId:'build-wood-fence'}:o),[...rows,{id:'divider',itemId:'build-wood-wall',x:-1,y:-3}]])assert.equal(homeRooms(bad,catalog).length,0);
});
