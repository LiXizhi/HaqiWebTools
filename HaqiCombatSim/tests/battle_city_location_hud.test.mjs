import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {regionAt} from '../js/adventure_island_layout_core.js';
import {createAdventure} from '../js/adventure_core.js';
import {installCityDungeons,enterCityDungeon} from '../js/adventure_city_dungeons_core.js';
import {generateCityDungeon,generatedCityRoute} from '../js/adventure_city_generated_core.js';
import {createWorld} from '../js/adventure_world_core.js';
import { updateLocationLabel,createWorldInteractionController } from '../js/adventure/world_interaction_controller.js';
import {setTranslator} from '../js/locale_runtime.js';
import {lookup,parseLocaleFile} from '../js/locale_core.js';
const read=file=>JSON.parse(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'));
function run(world,position,label,destination=null){
    const before=label?.dataset?.zh;
    updateLocationLabel(world,{position},{querySelector:()=>label},destination);
    if(label&&label.dataset.zh!==before)return [label.textContent];
    return [];
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

test('automatic navigation keeps its target visible while passing regions and restores the current region on cancellation',()=>{
    const world={layout:{regions:[{name:'海滨',x:0,y:0,rx:10,ry:10},{name:'森林',x:50,y:50,rx:10,ry:10}]}},label={dataset:{}};
    const destination={kind:'npc',name:'青龙'};
    assert.deepEqual(run(world,{x:5,y:5},label,destination),['正在前往青龙']);
    assert.deepEqual(run(world,{x:50,y:50},label,destination),[]);
    assert.equal(label.textContent,'正在前往青龙');
    assert.deepEqual(run(world,{x:50,y:50},label),['森林']);
    assert.deepEqual(run(world,{x:50,y:50},label,{kind:'point',id:'internal-route-id'}),['正在前往目的地']);
    assert.deepEqual(run(world,{x:5,y:5},label),['海滨']);
});

test('navigation status uses the real locale dictionaries and preserves target names in all four interface languages',()=>{
    const dictionaries=Object.fromEntries(['en','ja','ko'].map(id=>[id,parseLocaleFile(fs.readFileSync(new URL(`../data/adventure/locale/${id}.txt`,import.meta.url),'utf8'))]));
    const expected={
        'zh-CN':['正在前往Alice','正在前往目的地'],
        en:['On the way to Alice','On the way to your destination'],
        ja:['Aliceに向かっています','目的地に向かっています'],
        ko:['Alice(으)로 이동 중','목적지로 이동 중'],
    };
    try{
        for(const [native,[named,generic]] of Object.entries(expected)){
            setTranslator(value=>lookup(value,native,dictionaries),native);
            const label={dataset:{}};
            assert.deepEqual(run({layout:{}},{x:0,y:0},label,{name:'Alice'}),[named]);
            assert.deepEqual(run({layout:{}},{x:0,y:0},label,{name:' '}),[generic]);
        }
    }finally{setTranslator(null);}
});

test('unreachable walkTo clears the HUD target, and an obsolete result cannot cancel a newer route',()=>{
    const world={zone:'camp',layout:{regions:[{name:'海滨',x:0,y:0,rx:10,ry:10}]}},save={position:{x:0,y:0}};
    const ctx={world,save,destination:null,path:[]},requests=[],messages=[];
    ctx.setDestination=next=>{ctx.destination=next;};
    ctx.setPath=next=>{ctx.path=next;};
    const ctrl=createWorldInteractionController({
        nodes:{},getContext:()=>ctx,close(){},toast:message=>messages.push(message),
        heroNavigation:{cancel(){},request(_world,_from,_to,options){requests.push(options.onResult);}},
    });
    const first={kind:'npc',name:'青龙',x:300,y:0},second={kind:'npc',name:'茜茜',x:400,y:0},label={dataset:{}};
    ctrl.walkTo(first,true);
    assert.deepEqual(run(world,save.position,label,ctx.destination),['正在前往青龙']);
    requests[0]([]);
    assert.equal(ctx.destination,null);
    assert.deepEqual(run(world,save.position,label,ctx.destination),['海滨']);
    assert.equal(messages.length,1);

    ctrl.walkTo(first,true);
    ctrl.walkTo(second,true);
    requests[2]([{x:400,y:0}]);
    requests[1]([]);
    assert.equal(ctx.destination,second);
    assert.deepEqual(ctx.path,[{x:400,y:0}]);
    assert.deepEqual(run(world,save.position,label,ctx.destination),['正在前往茜茜']);
    assert.equal(messages.length,1);
});
