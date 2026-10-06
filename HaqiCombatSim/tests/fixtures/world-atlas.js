import {loadResources} from '../../js/adventure_assets.js';
import {createAdventure} from '../../js/adventure_core.js';
import {createWorld} from '../../js/adventure_world_core.js';
import {createRenderer} from '../../js/adventure_renderer.js';
import {renderMaps} from '../../js/view_adventure_maps.js';
import {renderEarthAtlas} from '../../js/view_adventure_earth.js';
import {createEarthService} from '../../js/adventure_earth.js';

const root=document.getElementById('overlay'),status=document.getElementById('status');
try{
    const assets=await loadResources(),save=createAdventure(assets.content,{name:'地图验收'}),worlds=new Map(),renderer=createRenderer(document.getElementById('scene'),assets);
    save.zone=new URLSearchParams(location.search).get('island')||'town';save.position={...assets.content.worldMaps[save.zone].spawn};
    const world=createWorld(save.zone,assets.content);worlds.set(save.zone,world);
    const travels=[],switches=[],positions=[],stats={previewBuilds:0,previewTime:0,byIsland:{}};let view=null,revision=0,earth=null;
    const qa={assets,save,travels,switches,positions,stats,get view(){return view;},open};window.atlasQA=qa;
    function close(){revision++;view?.dispose();view=null;root.replaceChildren();root.className='overlay';}
    function portal(p,target){switches.push({id:p.id,target});void open(target==='earth'?'earth':'world',p);}
    async function open(kind='world',focus=null){
        const ticket=++revision;view?.dispose();view=null;
        if(kind==='earth'){
            earth||=createEarthService({content:assets.content,getPlayerLevel:()=>save.level,registerImage:assets.registerImage,releaseImage:assets.releaseImage});
            const data=await earth.atlas();if(ticket!==revision)return;
            const current=focus?.earth||{lon:114,lat:22};
            view=renderEarthAtlas(root,{...data,assetMode:assets.mode,current,focus:focus?{...current,portalFocus:true}:null},{close,localMap:()=>open('local'),localMapLabel:'返回当前岛屿地图',switchWorld:id=>open(id==='earth'?'earth':'world'),portal,viewport:b=>earth.viewport(b),travel:p=>travels.push(p)});
        }else view=renderMaps(root,world,{assets,save,focusPortal:focus?.id},{close,switchWorld:id=>open(id==='earth'?'earth':'world'),switchMap:()=>open('local'),portal,travel:id=>travels.push(id),teleportToPosition:(x,y)=>positions.push({x,y}),drawIsland:(target,id,options)=>{const start=performance.now();stats.previewBuilds++;stats.byIsland[id]=(stats.byIsland[id]||0)+1;let w=worlds.get(id);if(!w){w=createWorld(id,assets.content);worlds.set(id,w);}renderer.minimap(target,w,save,options);stats.previewTime+=performance.now()-start;}},kind==='local'?'local':'world');
    }
    await open(new URLSearchParams(location.search).get('view')||'world');status.hidden=true;
}catch(error){status.textContent=error.stack;throw error;}
