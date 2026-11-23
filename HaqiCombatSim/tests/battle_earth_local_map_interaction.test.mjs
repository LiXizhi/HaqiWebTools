import test from 'node:test';
import assert from 'node:assert/strict';
import {renderEarthLocalMap} from '../js/views/adventure/view_adventure_earth_local_map.js';

async function withMap(cities,run,callbacks={}){
    const previous=globalThis.document,travels=[];
    class Element{
        constructor(tag){this.tag=tag;this.children=[];this.style={};this.dataset={};this.className='';this.classList={add(){},remove(){}};}
        append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}
        setAttribute(){}setPointerCapture(){}focus(){}
        getBoundingClientRect(){return {left:0,top:0,width:this.tag==='canvas'?560:90,height:this.tag==='canvas'?560:30};}
        querySelector(selector){return this.children.find(node=>node.className?.split(' ').includes(selector.slice(1)))||this.children.map(node=>node.querySelector?.(selector)).find(Boolean);}
    }
    globalThis.document={createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag)};
    let view;
    try{
        const root=new Element('div');
        view=renderEarthLocalMap(root,{layout:{name:'附近的城市'},earthRules:{chunkSize:100,activeRadius:1},mapCities:cities},{position:{x:0,y:0}},{close(){},draw(){},travel:city=>travels.push(city),...callbacks});
        await Promise.resolve();
        await run({root,view,travels,layer:root.querySelector('.earth-local-cities'),map:root.querySelector('.earth-local-map')});
    }finally{view?.dispose();globalThis.document=previous;}
}
const cities=Array.from({length:6},(_,i)=>({id:`local-${i}`,name:`附近地点${i+1}`,lon:114+i*.01,lat:22+i*.01,x:-100+i%3*100,y:-70+Math.floor(i/3)*140}));

test('each nearby city dot and label sends its own complete travel destination',async()=>{
    await withMap(cities,({layer,travels})=>{
        assert.equal(layer.children.length,12);
        for(let i=0;i<cities.length;i++){
            const [dot,label]=layer.children.slice(i*2,i*2+2);assert.equal(dot.hidden,false);
            dot.onclick({detail:1});label.onclick({detail:0});
            assert.equal(travels.at(-2),cities[i]);assert.equal(travels.at(-1),cities[i]);
        }
        assert.equal(new Set(travels.map(city=>city.id)).size,6);
    });
});

test('new viewport cities remain independently clickable after asynchronous loading',async()=>{
    await withMap([],({layer,travels})=>{
        assert.equal(layer.children.length,12);
        layer.children[8].onclick({detail:1});assert.equal(travels[0].id,'local-4');
    },{viewport:async()=>({cities})});
});

test('dragging the neighbourhood suppresses pointer travel while keyboard activation still works',async()=>{
    await withMap(cities,({map,layer,travels})=>{
        const dot=layer.children[0];map.onpointerdown({button:0,pointerId:1,clientX:100,clientY:100,target:dot});
        map.onpointermove({pointerId:1,clientX:130,clientY:120});map.onpointerup({pointerId:1});
        dot.onclick({detail:1});assert.equal(travels.length,0);
        dot.onclick({detail:0});assert.equal(travels[0].id,cities[0].id);
    });
});

test('preparing a destination disables all nearby destinations and failure restores them',async()=>{
    await withMap(cities,({view,layer,travels})=>{
        view.busy('正在准备目的地');assert.ok(layer.children.every(node=>node.disabled));
        layer.children[0].onclick({detail:1});assert.equal(travels.length,0);
        view.error('地图加载失败，请重试');assert.ok(layer.children.every(node=>!node.disabled));
        layer.children[0].onclick({detail:1});assert.equal(travels.length,1);
        view.dispose();layer.children[2].onclick({detail:0});assert.equal(travels.length,1);
    });
});
