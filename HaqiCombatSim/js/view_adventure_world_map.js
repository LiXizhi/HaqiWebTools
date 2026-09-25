import { ISLANDS, travelStatus } from './adventure_world_map_core.js';
import { fetchJson } from './runtime_data.js';
import { assetUrl } from './adventure_media_core.js';
import { fill, setText, tr } from './locale_runtime.js';

let mapArt;
function loadMapArt(){
    if(!mapArt)mapArt=fetchJson('data/adventure/world-map-art.json').catch(error=>{mapArt=null;throw error;});
    return mapArt;
}

export function renderWorldMap(body,{save,assets},cb,{el,button}) {
    body.closest('.modal').classList.add('world-map-modal');
    const chart=el('div','world-chart');
    chart.setAttribute('aria-label',tr('世界地图，点击岛名传送'));
    const loading=el('p','world-map-loading','地图载入中…');
    loading.setAttribute('role','status');chart.append(loading);
    const buttons=new Map();
    for(const island of ISLANDS){
        const state=travelStatus(save,assets.content,island.id);
        const name=el('strong','island-name');setText(name,island.name);
        const level=el('span','island-state');setText(level,'建议 {level} 级',{level:state.minLevel});
        const node=button([name,level],()=>{if(!state.current)cb.travel(island.id);},'world-island');
        node.classList.toggle('locked',!state.allowed);node.classList.toggle('current',state.current);
        node.setAttribute('aria-label',fill(state.current?'{name}，当前位置，建议 {level} 级前往':'{name}，建议 {level} 级前往',{name:island.name,level:state.minLevel}).text);
        if(state.current)node.setAttribute('aria-current','location');
        node.disabled=!state.current&&!state.allowed;node.title=state.current?tr('已在此岛'):state.reason?tr(state.reason):fill('传送到{name}',{name:island.name}).text;
        buttons.set(island.id,node);chart.append(node);
    }
    const viewport=el('div','world-chart-viewport',chart);
    viewport.setAttribute('tabindex','0');viewport.setAttribute('aria-label',tr('世界地图，小屏可左右滚动查看全部岛屿'));
    body.append(viewport);
    // Cosmetic loading is lazy and never blocks travel. A failed CDN image
    // leaves a plain destination list; explicit local mode uses the archive.
    const fallback=()=>{setText(loading,'地图图片暂不可用，请从列表选择目的地。');};
    loadMapArt().then(art=>{
        const image=new Image();image.alt='';image.className='world-map-painting';image.crossOrigin='anonymous';
        image.onload=()=>{
            if(!chart.isConnected)return;
            if(image.naturalWidth!==art.width||image.naturalHeight!==art.height){fallback();return;}
            loading.remove();chart.prepend(image);chart.classList.add('has-art');
            for(const [id,node] of buttons){const [x,y]=art.anchors[id];node.style.setProperty('--x',`${x}%`);node.style.setProperty('--y',`${y}%`);}
            const current=buttons.get(save.zone);
            if(current)viewport.scrollLeft=Math.max(0,current.offsetLeft-viewport.clientWidth/2);
        };
        image.onerror=fallback;
        image.src=assetUrl(art,assets.mode);
    }).catch(error=>{fallback();console.warn('世界地图使用目的地列表：',error.message);});
}
