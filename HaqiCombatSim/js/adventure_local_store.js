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
        async read(key){const db=await open();return new Promise((resolve,reject)=>{const req=db.transaction('records').objectStore('records').get(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});},
        async write(key,value){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite');tx.objectStore('records').put(structuredClone(value),key);tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||Error('本机保存失败'));});},
    };
}
