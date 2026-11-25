import test from 'node:test';
import assert from 'node:assert/strict';
import {renderEarthAtlas} from '../js/views/adventure/view_adventure_earth.js';
import {earthRules} from '../js/adventure_earth_core.js';
import {setTranslator} from '../js/locale_runtime.js';

async function withAtlas(model,run,callbacks={}){
    const previous=globalThis.document,requests=[],travels=[],painted=[],measured=[];
    class Element{
        constructor(tag){this.tag=tag;this.ownerDocument=globalThis.document;this.children=[];this.style={};this.dataset={};this.className='';this.classList={add(){},remove(){}};}
        focus(){this.ownerDocument.activeElement=this;}
        append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}
        setAttribute(key,value){(this.attributes??={})[key]=String(value);}getAttribute(key){return this.attributes?.[key]??null;}removeAttribute(){}setPointerCapture(){}
        getBoundingClientRect(){return {left:0,top:0,width:900,height:470};}
        getContext(){return new Proxy({strokeText:text=>painted.push(text),fillText:text=>painted.push(text),measureText:text=>{measured.push(text);return {width:text.length*13};}},{get:(target,key)=>target[key]||(()=>{})});}
        querySelector(selector){return this.children.find(n=>n.className?.split(' ').includes(selector.slice(1)))||this.children.map(n=>n.querySelector?.(selector)).find(Boolean);}
    }
    globalThis.document={createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag)};
    let view;
    try{
        const root=new Element('div');
        view=renderEarthAtlas(root,{geography:{overview:{bounds:{south:-60,north:85}}},...model},{close(){},travel:p=>travels.push(p),viewport:async bounds=>{requests.push(structuredClone(bounds));return {cities:[],tiles:[]};},...callbacks});
        await Promise.resolve();
        const canvas=root.querySelector('.earth-atlas'),popup=root.querySelector('.earth-map-place'),status=root.querySelector('.earth-map-status'),zoom=root.querySelector('.earth-map-zoom');
        const click=(x,y)=>{canvas.onpointerdown({clientX:x,clientY:y,pointerId:1});canvas.onpointerup({clientX:x,clientY:y});};
        await run({root,view,canvas,popup,status,zoom,requests,travels,click,painted,measured});
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

test('recent city star travels directly even without city viewport data',async()=>{
    const recent={id:'recent',name:'最近城市',lon:0,lat:12.5};
    await withAtlas({places:{recent,favorites:[]}},async({root,travels,view})=>{
        const star=root.querySelector('.earth-saved-marker');assert.equal(star.hidden,false);star.onclick();assert.equal(travels[0],recent);
        await view.focus({lon:90,lat:12.5},1);assert.equal(star.hidden,true);
    });
});
test('favorite mode distinguishes drags from placement, persists coordinates, and removes saved points',async()=>{
    const added=[],removed=[];
    await withAtlas({current:{lon:0,lat:12.5}},async({root,canvas,click,travels})=>{
        const add=root.querySelector('.earth-map-tools').children[0];add.onclick();
        canvas.onpointerdown({clientX:450,clientY:235,pointerId:1});canvas.onpointermove({clientX:500,clientY:235});canvas.onpointerup({});assert.equal(added.length,0);
        click(450,235);await Promise.resolve();await Promise.resolve();
        assert.equal(added.length,1);assert.equal(added[0].lon,-20);assert.equal(added[0].lat,12.5);assert.equal(travels.length,0);
        root.querySelector('.earth-saved-marker').onclick();assert.equal(travels[0].favorite,true);
        root.querySelector('.earth-saved-row').children[1].onclick();await Promise.resolve();await Promise.resolve();
        assert.deepEqual(removed,['saved']);assert.equal(root.querySelector('.earth-saved-places').children.length,0);
    },{addFavorite:async geo=>{added.push(geo);return {favorites:[{...geo,id:'saved',favorite:true}]};},removeFavorite:async id=>{removed.push(id);return {favorites:[]};}});
});
test('favoriting a city label saves the city coordinates instead of the offset click',async()=>{
    const city={id:'edmonton',name:'埃德蒙顿',lon:0,lat:12.5},added=[];
    await withAtlas({current:city,index:{hotspots:[city]}},async({root,click,travels})=>{
        root.querySelector('.earth-map-tools').children[0].onclick();
        click(470,220);await Promise.resolve();await Promise.resolve();
        assert.deepEqual(added,[{name:city.name,lon:city.lon,lat:city.lat}]);
        root.querySelector('.earth-saved-marker').onclick();
        assert.equal(travels[0].lon,city.lon);assert.equal(travels[0].lat,city.lat);
    },{addFavorite:async geo=>{added.push(geo);return {favorites:[{...geo,id:'saved',favorite:true}]};}});
});

test('failed favorite save stays in placement mode with visible retry feedback',async()=>{
    await withAtlas({},async({root,click})=>{
        const tools=root.querySelector('.earth-map-tools');tools.children[0].onclick();click(450,235);await Promise.resolve();await Promise.resolve();
        assert.match(tools.children[1].textContent,/保存失败/);assert.equal(tools.children[0].disabled,false);assert.equal(root.querySelector('.earth-saved-places').children.length,0);
    },{addFavorite:async()=>{throw Error('quota');}});
});

test('thirty viewport destinations each select and travel with their own coordinates after map redesign',async()=>{
    const cities=Array.from({length:30},(_,i)=>({id:`destination-${i}`,name:`旅行地点${i+1}`,lon:-150+i%6*60,lat:-45+Math.floor(i/6)*25,population:1000}));
    await withAtlas({current:{lon:0,lat:12.5}},async({view,click,popup,travels})=>{
        const markers=view.getState().markers;assert.equal(markers.length,cities.length);
        for(const marker of markers){
            const before=travels.length;click(marker.x,marker.y);
            assert.equal(popup.hidden,false);assert.equal(popup.children[0].textContent,marker.city.name);
            assert.equal(travels.length,before,'choosing a marker waits for explicit travel');
            popup.children[1].onclick();
            assert.equal(travels.at(-1).id,marker.city.id);assert.equal(travels.at(-1).lon,marker.city.lon);assert.equal(travels.at(-1).lat,marker.city.lat);
        }
        assert.equal(new Set(travels.map(city=>city.id)).size,30);
    },{viewport:async()=>({cities,tiles:[]})});
});

test('atlas travel lock covers city selection, saved stars and rows, then restores on error',async()=>{
    const first={id:'first',name:'第一站',lon:0,lat:12.5},next={id:'next',name:'下一站',lon:90,lat:12.5};
    await withAtlas({index:{hotspots:[first,next]},places:{recent:next,favorites:[]}},async({root,view,popup,click,travels})=>{
        assert.equal(view.selectCity('first'),true);
        const star=root.querySelector('.earth-saved-marker'),row=root.querySelector('.earth-saved-row').children[0];
        view.busy('正在准备目的地');
        for(const node of [popup.children[1],star,row]){assert.equal(node.disabled,true);node.onclick();}
        const marker=view.getState().markers.find(p=>p.city.id==='next');click(marker.x,marker.y);
        assert.equal(view.selectCity('next'),false);assert.equal(popup.children[0].textContent,first.name);assert.equal(travels.length,0);
        view.error('连接失败，请重试');
        for(const node of [popup.children[1],star,row])assert.equal(node.disabled,false);
        popup.children[1].onclick();star.onclick();row.onclick();assert.deepEqual(travels.map(p=>p.id),['first','next','next']);
        view.dispose();view.error('过期错误');
        for(const node of [popup.children[1],star,row]){assert.equal(node.disabled,true);node.onclick();}
        assert.equal(view.selectCity('first'),false);assert.equal(travels.length,3);
    });
});

test('atlas directory searches translated names and keeps complete city identity until explicit travel',async()=>{
    const first={id:'one',name:'北京',lon:0,lat:12.5,chapter:'first'},other={id:'two',name:'其他城市',lon:90,lat:12.5};
    setTranslator(text=>text==='北京'?'Beijing':text);
    try{await withAtlas({},async({root,popup,travels})=>{
        const directory=root.querySelector('.earth-place-directory'),search=root.querySelector('.earth-place-search'),results=root.querySelector('.earth-place-results');
        assert.ok(!directory.open);assert.equal(search.type,'search');assert.equal(search.getAttribute('aria-label'),'查找当前视野的地点');
        assert.equal(results.children.length,2);search.value='  BEIJING ';search.oninput();assert.equal(results.children.length,1);assert.equal(results.children[0].textContent,'Beijing');
        results.children[0].onclick();assert.equal(results.children[0].getAttribute('aria-pressed'),'true');assert.equal(popup.children[0].textContent,'Beijing');assert.equal(travels.length,0);
        popup.children[1].onclick();assert.equal(travels[0],first);
        search.value='不存在';search.oninput();assert.equal(results.children.length,0);assert.match(directory.children[3].textContent,/没有找到/);assert.equal(travels.length,1);
    },{viewport:async()=>({cities:[first,other],tiles:[]})});}finally{setTranslator(null);}
});

test('atlas directory pages all locations, deduplicates shared sources and keeps same-name coordinates distinct',async()=>{
    const cities=Array.from({length:53},(_,i)=>({id:`city-${i}`,name:i<2?'同名城':`城市${i}`,lon:-150+i*5,lat:12.5}));
    await withAtlas({index:{hotspots:[cities[0],{id:'bad',name:'坏坐标',lon:NaN,lat:0}]}},async({root,popup,travels})=>{
        const results=root.querySelector('.earth-place-results'),pages=root.querySelector('.earth-place-pages'),search=root.querySelector('.earth-place-search');
        assert.equal(results.children.length,24);assert.equal(pages.children[0].disabled,true);assert.equal(pages.children[1].disabled,false);
        const visited=[];for(let page=0;page<3;page++){for(const node of results.children){node.onclick();assert.equal(travels.length,visited.length);popup.children[1].onclick();visited.push(travels.at(-1));}if(page<2)pages.children[1].onclick();}
        assert.deepEqual(visited,cities);assert.equal(pages.children[1].disabled,true);assert.equal(results.children.length,5);
        pages.children[0].onclick();assert.equal(results.children.length,24);
        search.value='同名城';search.oninput();assert.equal(results.children.length,2);assert.equal(pages.hidden,true);assert.equal(pages.children[0].disabled,true);
    },{viewport:async()=>({cities,tiles:[]})});
});

test('directory paging focuses its new results and viewport refresh preserves a focused place',async()=>{
    const cities=Array.from({length:26},(_,i)=>({id:`city-${i}`,name:`地点${i}`,lon:-120+i*8,lat:12.5}));
    await withAtlas({current:{lon:0,lat:12.5},index:{hotspots:cities}},async({root,view,travels})=>{
        const results=root.querySelector('.earth-place-results'),pages=root.querySelector('.earth-place-pages'),search=root.querySelector('.earth-place-search'),doc=root.ownerDocument;
        pages.children[1].focus();pages.children[1].onclick();assert.equal(results.children.length,2);
        assert.equal(doc.activeElement,results.children[0]);assert.equal(travels.length,0);
        results.children[1].focus();await view.focus({lon:0,lat:12.5},360);
        assert.equal(doc.activeElement,results.children[1]);assert.equal(doc.activeElement.textContent,'地点25');
        await view.focus({lon:-120,lat:12.5},1);
        assert.equal(doc.activeElement,search);assert.equal(travels.length,0);
        search.focus();await view.focus({lon:0,lat:12.5},360);assert.equal(doc.activeElement,search);
        pages.children[0].onclick();assert.equal(doc.activeElement,results.children[0]);
    });
});

test('atlas directory filters locations outside the current viewport across the date line',async()=>{
    const cities=[{id:'east',name:'东岸',lon:179.8,lat:12.5},{id:'west',name:'西岸',lon:-179.8,lat:12.5},{id:'outside',name:'远方',lon:90,lat:12.5}];
    await withAtlas({focus:{lon:180,lat:12.5}},async({root,view})=>{
        const results=root.querySelector('.earth-place-results');assert.deepEqual(results.children.map(n=>n.textContent),['东岸','西岸']);
        await view.focus({lon:90,lat:12.5},1);assert.deepEqual(results.children.map(n=>n.textContent),['远方']);
    },{viewport:async()=>({cities,tiles:[]})});
});

test('late viewport responses preserve travel status and every directory/navigation control stays locked',async()=>{
    let resolve;const pending=new Promise(done=>{resolve=done;});
    await withAtlas({index:{hotspots:[{id:'first',name:'第一站',lon:0,lat:12.5}]}},async({root,view,canvas,status,zoom,requests,travels})=>{
        const results=root.querySelector('.earth-place-results'),search=root.querySelector('.earth-place-search');results.children[0].onclick();view.busy('正在准备目的地');
        const before=view.getState();canvas.onkeydown({key:'ArrowRight',preventDefault(){}});zoom.children[0].onclick();await view.focus({lon:90,lat:0},1);status.onclick();
        assert.deepEqual(view.getState().center,before.center);assert.equal(view.getState().span,before.span);assert.equal(search.disabled,true);
        resolve({cities:[{id:'late',name:'晚到城市',lon:20,lat:12.5}],tiles:[]});await pending;await Promise.resolve();
        assert.equal(status.textContent,'正在准备目的地');for(const node of results.children){assert.equal(node.disabled,true);node.onclick();}assert.equal(travels.length,0);
        assert.equal(requests.length,0);view.error('连接失败，请重试');assert.equal(search.disabled,false);for(const node of results.children)assert.equal(node.disabled,false);
        view.dispose();for(const node of results.children){assert.equal(node.disabled,true);node.onclick();}assert.equal(travels.length,0);
    },{viewport:()=>pending});
});

test('favorite placement locks directory and canceling restores it without selecting a city',async()=>{
    const city={id:'first',name:'第一站',lon:0,lat:12.5};
    await withAtlas({index:{hotspots:[city]}},async({root,popup,travels})=>{
        const tools=root.querySelector('.earth-map-tools'),results=root.querySelector('.earth-place-results'),search=root.querySelector('.earth-place-search');
        tools.children[0].onclick();assert.equal(search.disabled,true);assert.equal(results.children[0].disabled,true);results.children[0].onclick();assert.equal(popup.hidden,true);assert.equal(travels.length,0);
        tools.children[0].onclick();assert.equal(search.disabled,false);results.children[0].onclick();assert.equal(popup.children[0].textContent,city.name);assert.equal(travels.length,0);
    },{addFavorite:async()=>({favorites:[]})});
});
