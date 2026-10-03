import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {regionAt} from '../js/adventure_island_layout_core.js';
import {createAdventure} from '../js/adventure_core.js';
import {installCityDungeons,enterCityDungeon} from '../js/adventure_city_dungeons_core.js';
import {generateCityDungeon,generatedCityRoute} from '../js/adventure_city_generated_core.js';
import {createWorld} from '../js/adventure_world_core.js';
const read=file=>JSON.parse(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'));
// Execute the actual frame HUD branch: the isolated city fixture does not run
// adventure_app's frame, and therefore missed this integration regression.
const source=fs.readFileSync(new URL('../js/adventure_app.js',import.meta.url),'utf8');
const update=source.split('\n').find(line=>line.includes("querySelector('.location-label small')"));
function run(world,position,label){
    const calls=[];
    vm.runInNewContext(update,{world,save:{position},regionAt,nodes:{hud:{querySelector:()=>label}},setText:(node,name)=>{calls.push(name);node.dataset.zh=name;}});
    return calls;
}
test('real authored and generated city worlds update the frame HUD without an island region',()=>{
    const content=read('data/adventure/chapter.json');content.worldMaps={camp:read(content.worldMapIndex.islands.camp.file)};content.dungeons=[];
    const city=read('data/adventure/earth/cities/shenzhen.json');installCityDungeons(content,city);
    const save=createAdventure(content,{seed:42});
    const generated=generateCityDungeon(content,generatedCityRoute({id:'test-hud',name:'测试城',lon:114,lat:22},save));installCityDungeons(content,generated.city);
    for(const id of ['city:shenzhen:overview',...city.nodes.map(n=>n.dungeon.id),generated.city.nodes[0].dungeon.id]){
        save.zone='earth';save.dungeonReturn=null;save.cityReturnStack=[];enterCityDungeon(save,content,id);
        const world=createWorld(id,content,save),label={dataset:{zh:'旧岛屿分区'}};
        assert.equal(regionAt(world,save.position),null);
        assert.deepEqual(run(world,save.position,label),['新的故事，在这里继续']);
        assert.deepEqual(run(world,save.position,label),[]);
    }
});
test('island names remain accurate; missing region collections and absent HUD nodes are safe',()=>{
    const position={x:5,y:5},world={layout:{regions:[{name:'海滨',x:0,y:0,rx:10,ry:10},{name:'森林',x:50,y:50,rx:10,ry:10}]}},label={dataset:{}};
    assert.deepEqual(run(world,position,label),['海滨']);
    assert.deepEqual(run(world,{x:50,y:50},label),['森林']);
    assert.equal(regionAt({layout:{}},position),null);
    assert.deepEqual(run({layout:{}},position,label),['新的故事，在这里继续']);
    assert.deepEqual(run(world,position,null),[]);
    assert.deepEqual(run({},position,label),[]);
});
