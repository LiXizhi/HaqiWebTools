// All mutations (including speech receipts) commit in one IndexedDB transaction.
const request=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
export function createHomeStore(scope,{indexedDB=globalThis.indexedDB,name='haqi-homes-v1'}={}){
 let opening;
 async function db(){if(!indexedDB)throw Error('本机存储不可用，家园尚未保存');if(!opening)opening=new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>{r.result.createObjectStore('homes');r.result.createObjectStore('parts');};r.onsuccess=()=>{r.result.onversionchange=()=>{r.result.close();opening=null;};resolve(r.result);};r.onerror=()=>{opening=null;reject(r.error);};r.onblocked=()=>{opening=null;reject(Error('请关闭其他旧版家园页面后重试'));};});return opening;}
 async function transact(mode,run){const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction(['homes','parts'],mode);let value;tx.oncomplete=()=>resolve(value);tx.onabort=tx.onerror=()=>reject(tx.error||Error('本机保存失败'));try{Promise.resolve(run(tx.objectStore('homes'),tx.objectStore('parts'))).then(v=>{value=v;},e=>{reject(e);tx.abort();});}catch(e){reject(e);tx.abort();}});}
 const api={scope,
  async listGuests(){return transact('readonly',async(h)=>{const all=await request(h.getAll()),keys=await request(h.getAllKeys());return all.map((row,i)=>({...row,sourceScope:keys[i][0]})).filter(row=>!row.deleted&&JSON.parse(row.sourceScope)[0]==='guest');});},
  async list(){return transact('readonly',async(h,p)=>{const all=await request(h.getAll(IDBKeyRange.bound([scope,''],[scope,'\uffff'])));const rows=all.filter(row=>!row.deleted);return Promise.all(rows.sort((a,b)=>b.updatedAt-a.updatedAt).map(async row=>({...row,localVisit:await request(p.get([scope,row.id,'local:visit']))})));});},
  saveVisit:(id,{elapsedMs=0,preview=null,lastPlayedAt=Date.now()}={})=>transact('readwrite',async(h,p)=>{
   const home=await request(h.get([scope,id]));if(!home||home.deleted)return;
   const previous=await request(p.get([scope,id,'local:visit']))||{};
   const visit={...previous,playedMs:(previous.playedMs||0)+Math.max(0,elapsedMs),lastPlayedAt};
   if(preview){visit.preview=preview;visit.previewAt=lastPlayedAt;}
   // Local-only: never enter home.parts, revision, dirty or cloud snapshots.
   p.put(visit,[scope,id,'local:visit']);return visit;
  }),
  get:id=>transact('readonly',h=>request(h.get([scope,id]))),
  read:(id,part)=>transact('readonly',(_,p)=>request(p.get([scope,id,part]))).then(v=>v||{}),
  peek:(id,part)=>transact('readonly',(_,p)=>request(p.get([scope,id,part]))),
  cachePart:(id,key,data)=>transact('readwrite',async(h,p)=>{const home=await request(h.get([scope,id]));if(!home||home.deleted)throw Error('家园已移除');const existing=await request(p.get([scope,id,key]));if(existing!==undefined)return existing;p.put(data,[scope,id,key]);return data;}),
  create:home=>transact('readwrite',async(h)=>{if(await request(h.get([scope,home.id])))throw Error('家园编号已存在');h.put(home,[scope,home.id]);return home;}),
  mutate:(id,keys,fn)=>transact('readwrite',async(h,p)=>{
   const pending=[request(h.get([scope,id])),...keys.map(k=>request(p.get([scope,id,k])))],values=await Promise.all(pending),home=values[0];
   if(!home||home.deleted)throw Error('家园已移除');const data=Object.fromEntries(keys.map((k,i)=>[k,values[i+1]||{}]));
   const before=Object.fromEntries(keys.map(k=>[k,JSON.stringify(data[k])])),outcome=fn(home,data);
   if(outcome===false)return {home,data,changed:false};home.revision++;home.dirty=true;home.updatedAt=Date.now();
   for(const key of keys)if(before[key]!==JSON.stringify(data[key])){p.put(data[key],[scope,id,key]);if(!key.startsWith('receipt:'))home.parts[key]=home.revision;}
   h.put(home,[scope,id]);return {home,data,changed:true,outcome};
  }),
  async snapshot(id){return transact('readonly',async(h,p)=>{const home=await request(h.get([scope,id]));if(!home)throw Error('家园不存在');const keys=Object.keys(home.parts);const parts=await Promise.all(keys.map(k=>request(p.get([scope,id,k]))));return {home,parts:Object.fromEntries(keys.map((k,i)=>[k,parts[i]]))};});},
  install:(home,parts)=>transact('readwrite',async(h,p)=>{if(await request(h.get([scope,home.id])))throw Error('本地已存在该家园，请保留副本');for(const [k,v]of Object.entries(parts))p.put(v,[scope,home.id,k]);h.put(home,[scope,home.id]);return home;}),
  acknowledge:(id,revision,remote)=>transact('readwrite',async(h)=>{const home=await request(h.get([scope,id]));if(!home)return;home.baseRevision=remote.revision;home.remote=remote;home.dirty=home.revision!==revision;h.put(home,[scope,id]);return home;}),
  remove:id=>api.mutate(id,[],home=>{home.deleted=true;}),
  async close(){const database=await opening;database?.close();opening=null;}
 };return api;
}
