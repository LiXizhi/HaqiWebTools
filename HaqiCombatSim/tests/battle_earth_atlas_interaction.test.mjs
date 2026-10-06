import test from 'node:test';
import assert from 'node:assert/strict';
import {renderEarthAtlas} from '../js/view_adventure_earth.js';
import {earthRules} from '../js/adventure_earth_core.js';
import {setTranslator} from '../js/locale_runtime.js';

async function withAtlas(model,run){
    const previous=globalThis.document,requests=[],travels=[],painted=[],measured=[];
    class Element{
        constructor(tag){this.tag=tag;this.children=[];this.style={};this.dataset={};this.className='';this.classList={add(){},remove(){}};}
        append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}
        setAttribute(){}setPointerCapture(){}
        getBoundingClientRect(){return {left:0,top:0,width:900,height:470};}
        getContext(){return new Proxy({strokeText:text=>painted.push(text),fillText:text=>painted.push(text),measureText:text=>{measured.push(text);return {width:text.length*13};}},{get:(target,key)=>target[key]||(()=>{})});}
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
        await run({view,canvas,popup,status,zoom,requests,travels,click,painted,measured});
    }finally{view?.dispose();globalThis.document=previous;}
}

test('translated atlas names use translated widths and clicks retain original city identity',async()=>{
    const city={id:'beijing',name:'北京',lon:0,lat:12.5};
    setTranslator(text=>text==='北京'?'Beijing':text);
    try{await withAtlas({current:{lon:0,lat:12.5},index:{hotspots:[city]}},async({click,popup,travels,painted,measured})=>{
        assert.ok(painted.includes('Beijing'));assert.ok(!painted.includes('北京'));assert.ok(measured.includes('Beijing'));
        click(550,235);assert.equal(popup.children[0].textContent,'Beijing');
        popup.children[1].onclick();assert.equal(travels[0],city);assert.equal(city.name,'北京');
    });}finally{setTranslator(null);}
});

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
test('a Pacific portal opens the complete world without selecting a travel destination',async()=>{
    const focus={lon:-160,lat:20,portalFocus:true,span:80};
    await withAtlas({current:focus,focus},async({popup,requests,travels})=>{
        assert.equal(requests[0].span,360);assert.equal(requests[0].center.lon,0);assert.equal(requests[0].center.lat,12.5);
        assert.equal(popup.hidden,true);assert.equal(popup.children[1].disabled,true);popup.children[1].onclick();assert.equal(travels.length,0);
    });
});

test('导演缩放与城市选择复用图册城市身份，禁止选择不可见地点',async()=>{
 const city={id:'shenzhen',name:'深圳',lon:114.0579,lat:22.5431};
 await withAtlas({index:{hotspots:[city]}},async({view,requests,popup,travels})=>{
   await view.focus(city,1);assert.equal(requests.at(-1).span,1);
   assert.equal(view.selectCity('missing'),false);
   assert.equal(view.selectCity('shenzhen'),true);assert.equal(popup.hidden,false);
   popup.children[1].onclick();assert.equal(travels[0],city);
   const state=view.getState();state.center.lon=0;assert.equal(view.getState().center.lon,city.lon);
 });
});
