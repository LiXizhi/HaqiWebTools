import {renderPanel} from './view_adventure.js';
import {renderLocalMap} from './view_adventure_local_map.js';

// One map window; controller determines the initial view for each entry point.
export function renderMaps(root,world,model,cb,view='local'){
    if(view==='world')renderPanel(root,'map',model,cb);
    else renderLocalMap(root,world,model.save,{close:cb.close,draw:cb.draw,teleport:cb.teleport});
    const modal=root.querySelector('.modal'),header=modal.querySelector('.modal-header');
    modal.classList.add('compact-map-modal');
    header.querySelector('.eyebrow')?.remove();
    const title=header.querySelector('h2');title.textContent=view==='world'?'世界地图':world.layout.name;
    const toggle=document.createElement('button');toggle.className='secondary map-view-toggle';
    toggle.textContent=view==='world'?'返回当前岛屿地图':'打开世界地图';
    toggle.setAttribute('aria-label',toggle.textContent);
    toggle.onclick=()=>cb.switchMap(view==='world'?'local':'world');
    const heading=document.createElement('div');heading.className='map-heading';heading.append(title,toggle);
    header.replaceChildren(heading,header.querySelector('.close-button'));
}
