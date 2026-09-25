import {createLearningVoice} from './language_adventure_voice.js';
import {DIALOGUE_MAPPING_PROMPT_VERSION,dialogueMappingPrompt,parseDialogueMapping} from './dialogue_mapping_core.js';

export function createMappingStore({databaseName='haqi-dialogue-mapping-v2'}={}){
    const memory=new Map();let database;
    const remember=(key,value)=>{memory.delete(key);memory.set(key,value);while(memory.size>500)memory.delete(memory.keys().next().value);};
    const open=()=>database??=new Promise(resolve=>{
        if(!globalThis.indexedDB){resolve(null);return;}
        let settled=false;const finish=db=>{if(settled){db?.close();return;}settled=true;clearTimeout(timer);resolve(db);};
        const timer=setTimeout(()=>finish(null),1000);
        try{const req=indexedDB.open(databaseName,1);
            req.onupgradeneeded=()=>req.result.createObjectStore('mappings',{keyPath:'key'});
            req.onsuccess=()=>{req.result.onversionchange=()=>{req.result.close();database=null;};finish(req.result);};
            req.onerror=req.onblocked=()=>finish(null);
        }catch{finish(null);}
    });
    return {
        async get(key){
            let value=memory.get(key);
            if(value===undefined){const db=await open();if(db)value=await new Promise(resolve=>{
                const timer=setTimeout(()=>resolve(undefined),1000);
                try{const req=db.transaction('mappings').objectStore('mappings').get(key);req.onsuccess=()=>{clearTimeout(timer);resolve(req.result?.value);};req.onerror=()=>{clearTimeout(timer);resolve(undefined);};}catch{clearTimeout(timer);resolve(undefined);}
            });}
            if(typeof value==='string'){remember(key,value);return value;}return null;
        },
        async put(key,value){
            remember(key,value);const db=await open();if(!db)return;
            await new Promise(resolve=>{const timer=setTimeout(resolve,1000);const done=()=>{clearTimeout(timer);resolve();};try{
                const tx=db.transaction('mappings','readwrite'),store=tx.objectStore('mappings');
                tx.oncomplete=tx.onerror=tx.onabort=done;
                store.put({key,value,used:Date.now()});const req=store.getAll();
                req.onsuccess=()=>req.result.sort((a,b)=>b.used-a.used).slice(500).forEach(row=>store.delete(row.key));
            }catch{done();}});
        },
    };
}

export function createDialogueMapper({store=createMappingStore(),generate}={}){
    const voice=createLearningVoice({getSettings:()=>({model:'keepwork-lite'})});
    const call=generate||((lines,signal)=>voice.judge(dialogueMappingPrompt(lines),signal,{maxTokens:1200,rawText:true}));
    const pending=new Map();
    // Include the exact rules too: editing a prompt without bumping its version
    // must never reuse stale results. All cache/lock paths share this identity.
    const cacheKey=lines=>JSON.stringify(['dialogue-mapping',DIALOGUE_MAPPING_PROMPT_VERSION,'keepwork-lite',false,dialogueMappingPrompt(lines)[0].content,lines]);
    async function peek(lines){
        try{
            const key=cacheKey(lines),saved=await store.get(key);
            if(!saved)return null;
            const parsed=parseDialogueMapping(saved,lines);void store.put(key,saved);return parsed;
        }catch{return null;}
    }
    function mapDialogue(lines,signal){
        if(signal?.aborted)return Promise.reject(new DOMException('映射已取消','AbortError'));
        const key=cacheKey(lines);
        let task=pending.get(key);
        if(!task){
            const work=async()=>{
                const saved=await store.get(key);
                if(saved){try{const parsed=parseDialogueMapping(saved,lines);void store.put(key,saved);return parsed;}catch{/* Invalid old cache: regenerate. */}}
                const output=await call(lines,new AbortController().signal);
                const parsed=parseDialogueMapping(output,lines);await store.put(key,output);return parsed;
            };
            // Web Locks also coalesce requests across tabs on the same origin.
            task=(async()=>{
                if(globalThis.navigator?.locks&&globalThis.crypto?.subtle){
                    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key));
                    const lock=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
                    return navigator.locks.request('haqi-map-'+lock,work);
                }
                return work();
            })();
            pending.set(key,task);task.then(()=>pending.delete(key),()=>pending.delete(key));
        }
        // Closing one view stops its update, not the shared request another view needs.
        return new Promise((resolve,reject)=>{
            const abort=()=>{cleanup();reject(new DOMException('映射已取消','AbortError'));};
            const cleanup=()=>signal?.removeEventListener('abort',abort);
            signal?.addEventListener('abort',abort,{once:true});
            task.then(value=>{cleanup();resolve(value);},error=>{cleanup();reject(error);});
        });
    };
    mapDialogue.peek=peek;
    return mapDialogue;
}
export const mapDialogue=createDialogueMapper();
