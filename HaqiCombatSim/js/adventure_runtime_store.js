// Local-only, account/role-isolated IndexedDB. Memory remains usable if IDB is unavailable.
export function createRuntimeStore({indexedDB=globalThis.indexedDB,databaseName='haqi-role-runtime-v1',onError=()=>{}}={}) {
    const memory = new Map(), pending = new Map();let opening, timer, flushing;
    function open() {
        if (!indexedDB) return Promise.resolve(null);
        return opening ||= new Promise((resolve,reject) => {
            const request = indexedDB.open(databaseName,1);
            request.onupgradeneeded = () => request.result.createObjectStore('roles');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(Error('本地状态数据库暂时被占用'));
        }).catch(error => {opening=null;onError(error);return null;});
    }
    async function flush() {
        clearTimeout(timer);timer=null;
        if (flushing) {await flushing;return pending.size ? flush() : undefined;}
        if (!pending.size) return;
        const batch = new Map(pending);pending.clear();
        flushing = (async () => {
            const db = await open();if (!db) return;
            await new Promise((resolve,reject) => {
                const tx = db.transaction('roles','readwrite');
                for (const [key,value] of batch) tx.objectStore('roles').put(value,key);
                tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error);
            });
        })().catch(onError).finally(()=>{flushing=null;});
        await flushing;
    }
    return {
        async prepare(keys) {
            const db = await open();if (!db) return;
            await Promise.all(keys.filter(key=>!memory.has(key)).map(key => new Promise(resolve => {
                const request = db.transaction('roles','readonly').objectStore('roles').get(key);
                request.onsuccess=()=>{if(!memory.has(key)&&request.result)memory.set(key,request.result);resolve();};
                request.onerror=()=>{onError(request.error);resolve();};
            })));
        },
        get:key=>memory.get(key),
        set(key,value) {
            if(JSON.stringify(memory.get(key))===JSON.stringify(value))return;
            const snapshot=structuredClone(value);memory.set(key,snapshot);
            if(!indexedDB)return;
            pending.set(key,snapshot);
            if (!timer) timer=setTimeout(()=>void flush(),250);
        },
        flush,
    };
}
