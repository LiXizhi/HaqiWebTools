import {renderLocalMap} from './view_adventure_local_map.js';
import {setText,tr} from './locale_runtime.js';
import {createWorldMapSwitch} from './view_adventure_controls.js';
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
    const heading=document.createElement('div');heading.className='map-heading';
    if(view==='world'||!cb.switchWorld)heading.append(toggle);
    if(cb.switchWorld)heading.append(createWorldMapSwitch('haqi',cb.switchWorld,view==='local'?'返回哈奇世界地图':'哈奇世界'));
    header.replaceChildren(heading,header.querySelector('.close-button'));
}
