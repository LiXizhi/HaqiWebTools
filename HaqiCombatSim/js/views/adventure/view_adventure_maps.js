import {renderLocalMap} from './view_adventure_local_map.js';
import {setText,tr} from '../../locale_runtime.js';
import {createMapHeader} from '../../ui/controls.js';
import {renderHaqiAtlas} from './view_haqi_atlas.js';

// One map window; controller determines the initial view for each entry point.
export function renderMaps(root,world,model,cb,view='local'){
    if(!world.isDungeon||view==='world')return renderHaqiAtlas(root,world,model,cb,view);
    renderLocalMap(root,world,model.save,{close:cb.close,draw:cb.draw,teleport:cb.teleport,teleportToPosition:cb.teleportToPosition},model.socialActors);
    const modal=root.querySelector('.modal'),header=modal.querySelector('.modal-header');
    modal.classList.add('compact-map-modal','atlas-map-modal');
    header.querySelector('.eyebrow')?.remove();
    modal.setAttribute('aria-label',tr(view==='world'?'哈奇世界地图':world.layout.name));
    const toggle=document.createElement('button');toggle.className='secondary map-view-toggle';
    setText(toggle,view==='world'?(world.isEarth?'返回当前城市地图':'返回当前岛屿地图'):'打开世界地图');
    toggle.setAttribute('aria-label',toggle.textContent);
    toggle.onclick=()=>cb.switchMap(view==='world'?'local':'world');
    const nextHeader=createMapHeader(world.layout.name,'haqi',cb.switchWorld,cb.close);
    nextHeader.querySelector('.map-heading').append(toggle);
    header.replaceWith(nextHeader);
    nextHeader.querySelector('.close-button').focus();
}
