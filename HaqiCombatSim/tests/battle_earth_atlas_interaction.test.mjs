import test from 'node:test';
import assert from 'node:assert/strict';
import {renderEarthAtlas} from '../js/view_adventure_earth.js';
import {earthRules} from '../js/adventure_earth_core.js';

async function withAtlas(model,run){
    const previous=globalThis.document,requests=[],travels=[];
    class Element{
        constructor(tag){this.tag=tag;this.children=[];this.style={};this.dataset={};this.className='';this.classList={add(){},remove(){}};}
        append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}
        setAttribute(){}setPointerCapture(){}
        getBoundingClientRect(){return {left:0,top:0,width:900,height:470};}
        getContext(){return new Proxy({},{get:(target,key)=>target[key]||(()=>{})});}
        querySelector(selector){return this.children.find(n=>n.className?.split(' ').includes(selector.slice(1)))||this.children.map(n=>n.querySelector?.(selector)).find(Boolean);}
    }
    globalThis.document={createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag)};
    let view;
    try{
        const root=new Element('div');
        view=renderEarthAtlas(root,{geography:{overview:{bounds:{south:-60,north:85}}},...model},{close(){},travel:p=>travels.push(p),viewport:async bounds=>{requests.push(structuredClone(bounds));return {cities:[],tiles:[]};}});
        await Promise.resolve();
        const canvas=root.querySelector('.earth-atlas'),popup=root.querySelector('.earth-map-place'),status=root.querySelector('.earth-map-status'),zoom=root.querySelector('.earth-map-zoom');
        const click=(x,y)=>{canvas.onpointerdown({clientX:x,clientY:y,pointerId:1});canvas.onpointerup({clientX:x,clientY:y});};
        await run({canvas,popup,status,zoom,requests,travels,click});
    }finally{view?.dispose();globalThis.document=previous;}
}

test('atlas area click chooses the nearest city within the radius and clears selection on empty areas',async()=>{
    const farther={id:'far',name:'较远城市',lon:16,lat:12.5},nearer={id:'near',name:'较近城市',lon:8,lat:12.5};
    await withAtlas({current:{lon:0,lat:12.5},rules:{...earthRules(),atlasMarkerSpacing:0},index:{hotspots:[farther,nearer]}},async({click,popup,status,travels})=>{
        click(470,235);assert.equal(popup.children[0].textContent,'较近城市');popup.children[1].onclick();assert.equal(travels[0],nearer);
        click(200,80);assert.equal(popup.hidden,true);assert.equal(popup.children[1].disabled,true);popup.children[1].onclick();assert.equal(travels.length,1);assert.match(status.textContent,/附近没有/);
    });
});

test('small pointer jitter stays a city tap and does not move the map',async()=>{
    const city={id:'tap',name:'轻触城市',lon:0,lat:12.5};
    await withAtlas({current:{lon:0,lat:12.5},index:{hotspots:[city]}},async({canvas,popup,requests})=>{
        canvas.onpointerdown({clientX:450,clientY:235,pointerId:1});canvas.onpointermove({clientX:454,clientY:239});canvas.onpointerup({clientX:454,clientY:239});
        assert.equal(popup.hidden,false);assert.equal(popup.children[0].textContent,city.name);assert.equal(requests.length,1);assert.equal(requests[0].center.lon,0);
    });
});

test('atlas selection radius uses configured pixels and respects the date line',async()=>{
    const city={id:'across',name:'跨日期线城市',lon:-179,lat:12.5};
    await withAtlas({current:{lon:179,lat:12.5},rules:{...earthRules(),mapCityPickRadius:8},index:{hotspots:[city]}},async({click,popup})=>{
        click(440,235);assert.equal(popup.hidden,true); // City is at455: distance15 exceeds8.
        click(450,235);assert.equal(popup.hidden,false);assert.equal(popup.children[0].textContent,city.name);
    });
});

test('maximum zoom out locks latitude for dragging and arrow keys, while horizontal motion and zoomed panning remain available',async()=>{
    await withAtlas({current:{lon:0,lat:50}},async({canvas,zoom,requests})=>{
        assert.equal(requests.at(-1).center.lat,12.5);
        canvas.onpointerdown({clientX:450,clientY:235,pointerId:1});canvas.onpointermove({clientX:500,clientY:335});canvas.onpointerup({});
        assert.equal(requests.at(-1).center.lat,12.5);assert.equal(requests.at(-1).center.lon,-20);
        for(const key of ['ArrowUp','ArrowDown']){canvas.onkeydown({key,preventDefault(){}});assert.equal(requests.at(-1).center.lat,12.5);}
        zoom.children[0].onclick();canvas.onkeydown({key:'ArrowUp',preventDefault(){}});assert.ok(requests.at(-1).center.lat>12.5);
        zoom.children[1].onclick();assert.equal(requests.at(-1).span,360);assert.equal(requests.at(-1).center.lat,12.5);
    });
});
