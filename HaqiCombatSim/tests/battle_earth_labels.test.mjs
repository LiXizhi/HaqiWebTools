import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {cityEntranceAppearance} from '../js/adventure_city_dungeons_core.js';

const source=fs.readFileSync(new URL('../js/adventure_renderer.js',import.meta.url),'utf8').replaceAll('\r\n','\n');
const landmarkDraw=source.slice(source.indexOf("            if(o.kind==='landmark')"),source.indexOf("            if(o.kind==='npc')"));
const labelsDraw=source.slice(source.indexOf('        if(world.isEarth&&!title){'),source.indexOf('        const meter=frameMeter.sample'));
function render(world){
    const labels=[],context={world,title:false,motionHidden:false,ctx:{save(){},restore(){},measureText:()=>({width:70})},cam:{x:0,y:0,scale:1},w:800,h:600,
        save:{position:{x:50,y:550}},socialActors:[],cityEntranceAppearance,PLATE:{place:{}},tr:s=>s,
        plate:(ctx,name,x,y,style)=>labels.push({name,x,y,style}),t:0,reducedMotion:{matches:true},assets:{},drawDungeonEntrance(){},drawSignpost(){}};
    for(const mark of world.landmarks)vm.runInNewContext(landmarkDraw,{...context,o:{...mark,kind:'landmark'}});
    vm.runInNewContext(labelsDraw,context);return labels;
}

test('Earth portal name draws once even after snapping away from its source city coordinate',()=>{
    const mark={id:'city:park',name:'落马洲花园',cityDungeon:true,cityLevel:2,dungeonId:'park',x:400,y:300};
    const labels=render({isEarth:true,npcs:[],landmarks:[mark],mapCities:[{id:'park',name:mark.name,x:400,y:270}]});
    assert.equal(labels.length,1);assert.equal(labels[0].name,mark.name);
    assert.equal(labels[0].y,272);assert.equal(labels[0].style.text,cityEntranceAppearance(2).color);
});

test('authored city name replaces CSV label while separate places and interior labels remain',()=>{
    const mark={id:'city:shenzhen:entrance',name:'深圳',cityDungeon:true,dungeonId:'overview',x:400,y:300};
    const labels=render({isEarth:true,city:{id:'shenzhen',name:'深圳'},npcs:[],landmarks:[mark],mapCities:[{id:'Q15174',name:'深圳',x:420,y:330},{id:'other',name:'邻城',x:650,y:400}]});
    assert.deepEqual(labels.map(p=>p.name),['深圳','邻城']);
    assert.equal(render({isEarth:false,landmarks:[mark]}).length,1);
});


test('surface loading overlay shows actual tile progress and disappears when ready',()=>{
    const draw=source.slice(source.indexOf('        if(world.isEarth&&!title&&!motionHidden){'),source.indexOf('        const meter=frameMeter.sample'));
    const render=status=>{const labels=[],bars=[];vm.runInNewContext(draw,{world:{isEarth:true,surfaceStats:status},title:false,motionHidden:false,w:390,h:844,tr:s=>s,ctx:{save(){},restore(){},fillRect(...args){bars.push(args);},fillText(text){labels.push(text);}}});return {labels,bars};};
    assert.deepEqual(render({artReady:false}).labels,['正在加载地面图片…']);
    assert.deepEqual(render({artReady:false,artError:true}).labels,['地图图片加载失败，正在重试…']);
    const pending=render({artReady:true,visibleReady:3,visibleTotal:12});assert.deepEqual(pending.labels,['正在绘制附近地面… 3/12']);assert.equal(pending.bars.at(-1)[2],65);
    assert.deepEqual(render({artReady:true,visibleReady:12,visibleTotal:12}).labels,[]);
});
