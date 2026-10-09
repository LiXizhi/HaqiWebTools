import {renderHaqiAtlas} from './view_haqi_atlas.js';

// Compatibility for the generic panel entry. Main map navigation uses renderMaps.
export function renderWorldMap(body,model,cb){
    const root=body.closest('.overlay');
    const world=model.world||{zone:model.save.zone,isEarth:model.save.zone==='earth'};
    root.disposeMap?.();
    const view=renderHaqiAtlas(root,world,model,{...cb,switchMap:cb.switchMap||(()=>cb.panel?.('localmap'))},'world');
    root.disposeMap=()=>{view.dispose();root.disposeMap=null;};
    return view;
}
