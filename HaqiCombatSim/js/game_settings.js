import {normalizeGameSettings} from './game_settings_core.js';
// Separate from account/role storage. A failed database keeps a usable memory copy.
export function createGameSettings({indexedDB=globalThis.indexedDB,legacyStorage=()=>globalThis.localStorage}={}){
    let value=normalizeGameSettings(),db=null,chain=Promise.resolve(),opening;
    function write(){const snapshot={...value};chain=chain.then(()=>new Promise(resolve=>{
        if(!db)return resolve();
        try{const tx=db.transaction('preferences','readwrite');tx.objectStore('preferences').put(snapshot,'game');tx.oncomplete=tx.onerror=tx.onabort=()=>resolve();}catch{resolve();}
    }));return chain;}
    return {
        get value(){return {...value};},
        open({music=false}={}){return opening||=(async()=>{
            const stored=await new Promise(resolve=>{
                if(!indexedDB)return resolve(null);
                let finished=false;const finish=v=>{if(finished)return;finished=true;clearTimeout(timer);resolve(v);};
                const timer=setTimeout(()=>finish(null),1500);
                try{const req=indexedDB.open('haqi-game-settings-v1',1);
                    req.onupgradeneeded=()=>req.result.createObjectStore('preferences');
                    req.onerror=req.onblocked=()=>finish(null);
                    req.onsuccess=()=>{if(finished){req.result.close();return;}db=req.result;db.onversionchange=()=>{db.close();db=null;};const read=db.transaction('preferences','readonly').objectStore('preferences').get('game');read.onsuccess=()=>finish(read.result);read.onerror=()=>finish(null);};
                }catch{finish(null);}
            });
            if(stored?.version===1)value=normalizeGameSettings(stored);
            else{const migrated={music};try{const storage=legacyStorage(),sound=storage?.getItem('haqi.spell-sound.v1'),volume=storage?.getItem('haqi.game-sound.volume.v1');if(sound!==null&&sound!==undefined)migrated.sound=sound==='on';if(volume!==null&&volume!==undefined)migrated.volume=Number(volume);}catch{}value=normalizeGameSettings(migrated);await write();}
            return {...value};
        })();},
        set(patch){value=normalizeGameSettings({...value,...patch});void write();return {...value};},
        flush:()=>chain
    };
}

// Read only existing local bytes before login; never seed from a cloud response.
export function legacyLocalMusic(storage){
    try{const account=storage.getItem('haqi.roles.last-account.v1');const raw=storage.getItem('haqi.roles.v1.'+(account?'account.'+encodeURIComponent(account):'guest'));
        if(raw){const {catalog}=JSON.parse(raw);return catalog?.roles?.find(row=>row.id===catalog.activeId)?.save?.music===true;}
        if(!account)return JSON.parse(storage.getItem('haqi.adventure.kids.v1')||'null')?.music===true;
    }catch{}
    return false;
}
