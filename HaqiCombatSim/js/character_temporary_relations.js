import {newRelationship,applyAffinity,activityChange} from './character_relationship_core.js';

// A single active account/role session. Never handed to the save or cache layers.
export function createTemporaryRelations(){
    let scope=null,serial=0;
    const records=new Map(),histories=new Map(),pending=new Map();
    function enter(next){if(scope!==next){scope=next;serial=0;records.clear();histories.clear();pending.clear();}}
    const copy=value=>value==null?value:structuredClone(value);
    function load(id){return copy(records.get(id)||null);}
    function save(row){const next={...row,temporary:true};records.set(row.peer.id,copy(next));return copy(next);}
    function activity(hero,event,now){
        const row=load(event.peer.id)||newRelationship(scope,hero,event.peer,now);
        if(row.events.some(e=>e.eventId===event.id))return row;
        return save(applyAffinity(row,activityChange(row,event),{eventId:event.id,now:event.at,activity:true}));
    }
    function wrap(base,canPersist){
        const expectedScope=scope;
        const allowed=()=>{if(scope!==expectedScope)throw Error('角色已切换');return canPersist();};
        return {...base,
            load:id=>allowed()?base.load(id):load(id),
            save:row=>allowed()?base.save(row):save(row),
            hasEvent:(row,id)=>allowed()?base.hasEvent(row,id):row.events.some(e=>e.eventId===id),
            archive:(row,messages)=>{if(allowed())return base.archive(row,messages);const path=`memory:${++serial}`;histories.set(path,{messages:copy(messages),previous:row.history});return path;},
            history:path=>{const persistent=allowed();return String(path).startsWith('memory:')?copy(histories.get(path)):persistent?base.history(path):null;},
            list:cursor=>allowed()?base.list(cursor):{rows:[...records.values()].map(r=>({id:r.peer.id,name:r.peer.name,affinity:r.affinity})),next:null},
            playerMemory:hero=>allowed()?base.playerMemory(hero):String(hero.learnerMemory||''),
            // Quota remains durable, but its retry receipt must not smuggle affinity to disk.
            receipt:(id,response,day)=>{if(allowed())return base.receipt(id,response,day);const {affinity,...text}=response;return base.receipt(id,text,day);},
        };
    }
    return {enter,load,save,activity,wrap,pending};
}
