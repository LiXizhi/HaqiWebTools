import { ISLANDS, islandName, travelStatus } from './adventure_world_map_core.js';
import { fetchJson } from './runtime_data.js';
import { assetUrl } from './adventure_media_core.js';

let mapArt;
function loadMapArt(){
    if(!mapArt)mapArt=fetchJson('data/adventure/world-map-art.json').catch(error=>{mapArt=null;throw error;});
    return mapArt;
}

export function renderWorldMap(body,{save,assets},cb,{el,button}) {
    body.closest('.modal').classList.add('world-map-modal');
    const chart=el('div','world-chart'),detail=el('div','world-map-detail');
    chart.setAttribute('aria-label','世界地图，选择岛屿查看传送条件');
    const loading=el('p','world-map-loading','地图载入中，可先选择目的地。');
    loading.setAttribute('role','status');chart.append(loading);
    const buttons=new Map();
    function select(island){
        for(const [id,node] of buttons){node.classList.toggle('selected',id===island.id);node.setAttribute('aria-pressed',String(id===island.id));}
        const state=travelStatus(save,assets.content,island.id);
        const go=button(state.current?'你在这里':state.allowed?'传送到这里':`${state.minLevel} 级解锁`,()=>cb.travel(island.id),'primary');
        go.disabled=state.current||!state.allowed;
        detail.replaceChildren(el('div','world-map-description',el('h3','',island.name),el('p','',island.description),el('small','',state.current?'当前所在岛屿':state.reason||`${state.minLevel} 级起可自由传送`)),go);
    }
    for(const island of ISLANDS){
        const state=travelStatus(save,assets.content,island.id);
        const node=button([el('strong','island-name',island.name),el('small','island-state',state.current?'当前位置':state.allowed?`${state.minLevel} 级 · 可传送`:`${state.minLevel} 级解锁`)],()=>select(island),'world-island');
        node.classList.toggle('locked',!state.allowed);node.classList.toggle('current',state.current);
        node.setAttribute('aria-label',`${island.name}，${state.current?'当前位置':`${state.minLevel}级解锁`}`);
        buttons.set(island.id,node);chart.append(node);
    }
    detail.setAttribute('aria-live','polite');
    const viewport=el('div','world-chart-viewport',chart);
    viewport.setAttribute('tabindex','0');viewport.setAttribute('aria-label','世界地图，小屏可左右滚动查看全部岛屿');
    body.append(el('div','world-map-summary',el('span','',`当前位置：${islandName(save.zone)}`),el('span','',`角色等级 ${save.level}`)),viewport,detail,
        el('div','world-map-footer',el('small','muted','点击岛屿查看详情，达到等级即可免费传送。远方四岛已开放探索，专属任务待开放。'),button('返回并追踪当前任务',cb.track,'secondary')));
    select(ISLANDS.find(i=>i.id===save.zone)||ISLANDS[0]);
    // Cosmetic loading is lazy and never blocks travel. A failed CDN image
    // leaves a plain destination list; explicit local mode uses the archive.
    const fallback=()=>{loading.textContent='地图图片暂不可用，请从列表选择目的地。';};
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
