// Awaitable local records; a failed write is never reported as a saved transaction.
export function createLocalStore({indexedDB=globalThis.indexedDB,name='haqi-local-play-v1'}={}){
    let opening;
    const open=()=>opening||=(new Promise((resolve,reject)=>{
        if(!indexedDB){reject(Error('本机存储不可用'));return;}
        const req=indexedDB.open(name,1);
        req.onupgradeneeded=()=>req.result.createObjectStore('records');
        req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);req.onblocked=()=>reject(Error('请关闭其他旧版游戏窗口后重试'));
    }).catch(error=>{opening=null;throw error;}));
    return {
        async update(key,reduce){const db=await open();return new Promise((resolve,reject)=>{
            const tx=db.transaction('records','readwrite'),store=tx.objectStore('records'),req=store.get(key);let result,error;
            req.onsuccess=()=>{try{result=reduce(req.result);store.put(structuredClone(result),key);}catch(e){error=e;tx.abort();}};
            tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(error||tx.error||Error('本机保存失败'));
        });},
        async read(key){const db=await open();return new Promise((resolve,reject)=>{const req=db.transaction('records').objectStore('records').get(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});},
        async write(key,value){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite');tx.objectStore('records').put(structuredClone(value),key);tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||Error('本机保存失败'));});},
    };
}
