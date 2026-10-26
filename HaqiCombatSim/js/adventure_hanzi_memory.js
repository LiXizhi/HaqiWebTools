import {learningQuestMatches} from './learning_quest_core.js';
import {memoryParams,memoryQuest,createMemoryNodes,advanceMemoryChant,releaseMemoryNodes} from './hanzi_memory_core.js';
import {walkable,distance} from './adventure_world_core.js';
import {inMonsterTerritory} from './adventure_monster_motion_core.js';
import {loadDictionary} from './adventure_dictionary.js';
import {createDictionaryStore} from './dictionary_store.js';
import {loadMemoryArt} from './hanzi_memory_art.js';
export function createHanziMemory({root,getState,persist,show,close,toast,practice,load=loadDictionary,storage=createDictionaryStore()}){
    let data=null,loadedIdentity=null,loading=null,review={},sceneWorld=null,sceneParams=null,sceneBalance=null,candidates=[],chant=null;
    const identity=()=>{const s=getState();return JSON.stringify([s.owner||'guest',s.role]);};
    const config=()=>getState().content?.islandPacks?.find(p=>p.island.id===getState().save.zone)?.memory;
    async function prepare(){
        const key=identity();if(loadedIdentity===key&&data)return true;if(loading?.key===key)return loading.promise;
        review={};data=null;loadedIdentity=null;
        const promise=(async()=>{const loaded=await load('zh'),state=await storage.read(key);if(identity()!==key)return false;data=loaded;review=state.languages.zh?.entries||{};loadedIdentity=key;return true;})();
        loading={key,promise};try{return await promise;}catch(error){if(identity()===key)loadedIdentity=key;throw error;}finally{if(loading?.promise===promise)loading=null;}
    }
    function persistRuntime(){try{persist(false);}catch(error){toast(error.message);}}
    function scene(){
        const {save,world,content}=getState(),cfg=config();if(!cfg||!world)return null;if(!learningQuestMatches(save,cfg)){world.memoryNodes=[];world.memorySigns=[];return null;}
        if(sceneWorld!==world||sceneBalance!==content.balanceParams){sceneParams=memoryParams(content);sceneBalance=content.balanceParams;}
        const params=sceneParams;
        if(sceneWorld!==world){
            sceneWorld=world;candidates=[];chant=null;
            if(globalThis.Image)void loadMemoryArt().then(art=>{world.memoryArt=art;}).catch(()=>{});
            for(const path of world.paths||[]){const length=distance(path.a,path.b);for(let d=0;d<=length;d+=params.candidateStep){const t=d/(length||1),p={x:path.a.x+(path.b.x-path.a.x)*t,y:path.a.y+(path.b.y-path.a.y)*t};if(walkable(world,p.x,p.y))candidates.push(p);}}
            // Include reachable points in the existing guardian territory, not new encounters.
            for(const e of world.encounters.filter(e=>cfg.guardianEncounterIds.includes(e.id)))for(const dx of [-40,0,40]){const p={x:e.x+dx,y:e.y+40};if(walkable(world,p.x,p.y))candidates.push(p);}
            if(!candidates.length)candidates.push({...world.layout.spawn});
        }
        let runtime=save.hanziMemoryRuntime;
        if(!runtime||runtime.version!==2||runtime.island!==cfg.island||!Array.isArray(runtime.nodes)){runtime=save.hanziMemoryRuntime={version:2,island:cfg.island,cycles:{},nodes:createMemoryNodes({...save,hanziMemoryRuntime:null},cfg,candidates,params)};
            // A first memory on the arrival path makes the mechanic discoverable.
            const near=candidates.find(p=>distance(p,world.layout.spawn)>70&&distance(p,world.layout.spawn)<220);
            if(near&&runtime.nodes[0])Object.assign(runtime.nodes[0],near);
            const guardian=world.encounters.find(e=>cfg.guardianEncounterIds.includes(e.id));
            if(guardian)for(let i=1;i<=2&&i<runtime.nodes.length;i++){const p=candidates.find(p=>distance(p,guardian)<70&&(!runtime.nodes[i-1]||distance(p,runtime.nodes[i-1])>20));if(p)Object.assign(runtime.nodes[i],p);}
        }
        return {cfg,params,runtime,save,world};
    }
    function choose(s){
        const quest=memoryQuest(s.save,s.cfg);
        const words=quest?.words||s.cfg.words;
        return words.find(id=>!review[id]?.learned)||[...words].sort((a,b)=>(review[a]?.nextReviewAt||0)-(review[b]?.nextReviewAt||0)||a.localeCompare(b))[0];
    }
    function begin(node,automatic=false){
        const s=scene();if(!s||!node)return;
        s.runtime.pending??={...node,word:choose(s)};s.runtime.autoOpen=automatic;chant=null;persistRuntime();if(!automatic)show();
    }
    function dismiss(){const world=getState().world;if(world)world.memoryGathering=null;chant=null;}
    async function open(){
        const key=identity(),island=getState().save.zone;
        try{
            loadedIdentity=null;
            if(!await prepare()||identity()!==key||getState().save.zone!==island||getState().panel!=='hanzi-memory')return;
            const s=scene();if(!s)return;
            const pending=s.runtime.pending;
            if(!pending){close();return;}
            practice(pending.word,()=>{
                if(identity()!==key)return;
                const current=scene();if(!current||current.runtime.pending!==pending)return;
                // Rotations are local exploration state, never collection fragments.
                current.runtime.cycles||={};current.runtime.cycles[pending.key]=(current.runtime.cycles[pending.key]||0)+1;
                delete current.runtime.pending;delete current.runtime.autoOpen;
                current.runtime.nodes=createMemoryNodes(current.save,current.cfg,candidates,current.params);
                loadedIdentity=null;persistRuntime();close();
            });
        }catch(error){toast(error.message);close();}
    }
    return {open,close:dismiss,
        tick(dt,enabled){const world=getState().world;if(world)world.memoryGathering=null;const s=scene();if(!s){chant=null;return;}if(loadedIdentity!==identity()&&!loading)void prepare().catch(()=>{});
            if(!enabled){chant=null;return;}
            if(s.runtime.autoOpen&&s.runtime.pending){delete s.runtime.autoOpen;show();return;}
            const node=s.runtime.nodes.filter(n=>distance(n,s.save.position)<=s.params.collectRadius).sort((a,b)=>distance(a,s.save.position)-distance(b,s.save.position))[0];
            // Standard monster warning/chase/contact owns combat. A guarded memory cannot finish first.
            const guardian=node&&s.world.encounters.some(e=>inMonsterTerritory(s.world,e,node)||inMonsterTerritory(s.world,e,s.save.position));
            chant=advanceMemoryChant(chant,node,s.save.position,dt,enabled,s.params);if(chant?.ready&&!guardian){if(s.runtime.pending)show();else begin(node);}
            if(chant?.progress>0)s.world.memoryGathering={x:node.x,y:node.y,progress:Math.min(guardian ? .99 : 1,chant.progress)};
            s.world.memoryNodes=s.runtime.nodes.map((n,slot)=>({...n,slot}));
            s.world.memorySigns=[];
        },
        target(){const s=scene();return s?.runtime.nodes.reduce((best,n)=>!best||distance(n,s.save.position)<distance(best,s.save.position)?n:best,null);},
        won(encounterId){const s=scene();if(!s||!s.cfg.guardianEncounterIds.includes(encounterId))return;const guardian=s.world.encounters.find(e=>e.id===encounterId);if(!guardian)return;
            const radius=s.world.monsterSceneParams.territoryRadius,inside=s.runtime.nodes.filter(n=>distance(n,guardian)<=radius);
            s.runtime.nodes=releaseMemoryNodes(s.runtime.nodes,guardian,s.world.encounters,candidates,radius);
            if(inside.length&&memoryQuest(s.save,s.cfg)&&!s.runtime.pending)begin(s.runtime.nodes.find(n=>n.id===inside[0].id),true);persistRuntime();
        },
    };
}
