// Durable instance files and one atomic manifest per account/role. Unlike runtime
// caches, failed durable writes are errors: never report an in-memory grant as saved.
export function createPetIndexedDB({scope,indexedDB=globalThis.indexedDB,databaseName='haqi-pet-instances-v1'}={}){
    if(typeof scope!=='string'||!scope)throw Error('宠物存储作用域无效');
    let opening,closed=false;
    async function open(){
        if(closed)throw Error('宠物数据库已关闭');
        if(!indexedDB)throw Error('浏览器暂不支持宠物存储');
        return opening ||= new Promise((resolve,reject)=>{
            const request=indexedDB.open(databaseName,1);
            request.onupgradeneeded=()=>{request.result.createObjectStore('files');request.result.createObjectStore('heads');};
            request.onerror=()=>{opening=null;reject(request.error);};
            request.onblocked=()=>{opening=null;reject(Error('宠物数据库被其他页面占用'));};
            request.onsuccess=()=>{const db=request.result;if(closed){db.close();reject(Error('宠物数据库已关闭'));return;}db.onversionchange=()=>db.close();resolve(db);};
        });
    }
    const key=path=>JSON.stringify([scope,path]);
    async function read(store,id){const db=await open();return new Promise((resolve,reject)=>{
        const tx=db.transaction(store,'readonly'),r=tx.objectStore(store).get(id);let value;
        r.onsuccess=()=>{value=r.result??null;};tx.oncomplete=()=>resolve(value);tx.onerror=tx.onabort=()=>reject(tx.error||Error('宠物读取失败'));
    });}
    return {
        head:()=>read('heads',scope),read:path=>read('files',key(path)),
        async write(path,value){
            const db=await open();return new Promise((resolve,reject)=>{
                const tx=db.transaction('files','readwrite'),store=tx.objectStore('files'),id=key(path),r=store.get(id);let collision=false;
                r.onsuccess=()=>{if(r.result!==undefined){if(JSON.stringify(r.result)!==JSON.stringify(value)){collision=true;tx.abort();}}else store.add(value,id);};
                tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(collision?Error('宠物文件版本冲突'):tx.error||Error('宠物保存失败'));
            });
        },
        async publish(expectedRevision,manifest){
            const db=await open();return new Promise((resolve,reject)=>{
                const tx=db.transaction('heads','readwrite'),store=tx.objectStore('heads'),r=store.get(scope);let matched=false;
                r.onsuccess=()=>{matched=(r.result?.revision??null)===expectedRevision;if(matched)store.put(manifest,scope);};
                tx.oncomplete=()=>resolve(matched);tx.onerror=tx.onabort=()=>reject(tx.error||Error('宠物目录保存失败'));
            });
        },
        async close(){closed=true;if(opening)(await opening).close();},
    };
}
