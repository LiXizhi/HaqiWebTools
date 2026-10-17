import {emptyDictionary} from './dictionary_core.js';
// One read-modify-write transaction per account/role. Cross-tab serialization is
// provided by IndexedDB, including the reward receipt and its buff snapshot.
export function createDictionaryStore({indexedDB=globalThis.indexedDB,name='haqi-dictionary-v1'}={}){
    let opening;const memory=new Map();
    async function open(){
        if(!indexedDB)throw Error('本地数据库不可用');
        return opening||=(new Promise((resolve,reject)=>{
            const r=indexedDB.open(name,1);
            r.onupgradeneeded=()=>r.result.createObjectStore('learners');
            r.onsuccess=()=>{r.result.onversionchange=()=>{r.result.close();opening=null;};resolve(r.result);};
            r.onerror=r.onblocked=()=>reject(r.error||Error('本地数据库被占用'));
        }).catch(e=>{opening=null;throw e;}));
    }
    return {async read(key){
        const db=await open();
        const state=await new Promise((resolve,reject)=>{const tx=db.transaction('learners','readonly'),r=tx.objectStore('learners').get(key);r.onsuccess=()=>resolve(r.result||emptyDictionary());r.onerror=()=>reject(r.error);});
        memory.set(key,structuredClone(state));return state;
    },async update(key,reduce){
        let result,state;
        try{
            const db=await open();
            await new Promise((resolve,reject)=>{
                const tx=db.transaction('learners','readwrite'),store=tx.objectStore('learners'),request=store.get(key);
                request.onsuccess=()=>{try{state=request.result||emptyDictionary();result=reduce(state);store.put(state,key);}catch(e){tx.abort();reject(e);}};
                tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error||Error('字典进度保存失败'));
            });
            memory.set(key,structuredClone(state));return {state,result,persisted:true};
        }catch(error){
            state=structuredClone(memory.get(key)||emptyDictionary());result=reduce(state);memory.set(key,state);
            return {state,result,persisted:false,error};
        }
    }};
}
