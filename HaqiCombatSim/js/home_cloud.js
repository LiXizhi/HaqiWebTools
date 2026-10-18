import {createHome,validateHomePart} from './home_core.js';
const safe=s=>/^[a-zA-Z0-9_-]+$/.test(s);
// Files are immutable revision snapshots. The small directory is published last.
export function createHomeCloud({store,io,roleId,catalog,uuid=()=>crypto.randomUUID(),valid=()=>true}){
 if(!safe(roleId))throw Error('角色编号无效');
 const prefix=`homes/${roleId}/`,indexPath=`${prefix}index.json`;let directory=null,queue=Promise.resolve();const loading=new Map();
 const check=()=>{if(!valid())throw Error('角色或账号已变化，已停止同步');};
 async function list(refresh=false){check();if(!directory||refresh){const value=await io.read(indexPath,{refresh});check();if(value&&(value.version!==1||!value.entries||typeof value.entries!=='object'))throw Error('云端家园目录无效');directory=value||{version:1,entries:{}};}return directory;}
 function partPath(row,key){const path=row.parts[key];if(!/^(inventory|residents|chunk:-?\d+,-?\d+)$/.test(key)||typeof path!=='string'||!path.startsWith(`${prefix}${row.id}/`)||!/^homes\/[\w-]+\/[\w-]+\/[\w-]+\.json$/.test(path))throw Error('云端家园路径无效');return path;}
 async function readPart(row,key){const path=partPath(row,key),file=await io.read(path);check();if(file?.version!==1||file.kind!==key)throw Error('家园分文件无效');return validateHomePart(key.split(':')[0],file.data,catalog);}
 async function loadPart(home,key){
  const existing=await store.peek(home.id,key);if(existing!==undefined)return existing;
  if(!home.source?.parts?.[key])return {};
  const cacheKey=`${home.id}:${key}`;if(!loading.has(cacheKey))loading.set(cacheKey,(async()=>{const value=await readPart(home.source,key);check();return store.cachePart(home.id,key,value);})().finally(()=>loading.delete(cacheKey)));
  return loading.get(cacheKey);
 }
 async function download(row,{copy=false}={}){
  check();if(!row||!safe(row.id)||!safe(row.revision)||!row.parts||typeof row.parts!=='object')throw Error('云端家园无效');
  const parts={};for(const key of Object.keys(row.parts)){
   partPath(row,key);if(copy||!key.startsWith('chunk:'))parts[key]=await readPart(row,key);
  }
  const id=copy?uuid():row.id,versions=Object.fromEntries(Object.keys(row.parts).map(k=>[k,0])),home={...createHome(id,`${row.name}${copy?'（云端副本）':''}`,row.seed),parts:versions,source:copy?null:row,baseRevision:copy?null:row.revision,remote:copy?null:{...row,localParts:versions},dirty:copy,updatedAt:Date.now()};
  return store.install(home,parts);
 }
 async function syncNow(id){
  check();const index=await list(),snapshot=await store.snapshot(id);check();const home=snapshot.home,remote=index.entries[id];
  if(remote&&remote.revision!==home.baseRevision){
   // Preserve both versions, never combine inventories or overwrite local work.
   const copy=await download(remote,{copy:true});await store.acknowledge(id,-1,{...remote,localParts:{}});return {conflict:true,copy};
  }
  const revision=uuid(),parts={...(home.remote?.parts||{})};
  for(const [key,saved]of Object.entries(snapshot.parts)){
   if(home.remote?.localParts?.[key]===home.parts[key]&&parts[key])continue;
   check();if(saved===undefined&&!home.source?.parts?.[key])throw Error('本机分文件缺失，未发布云端目录');
   // Missing-at-snapshot chunks must use their immutable source, not a newer
   // local edit made while this upload was waiting on the network.
   const data=saved===undefined?await readPart(home.source,key):saved,path=`${prefix}${id}/${uuid()}.json`;await io.write(path,{version:1,kind:key,data});check();parts[key]=path;
  }
  const row={id,name:home.name,seed:home.seed,revision,parts,localParts:home.parts,updatedAt:Date.now()},next={version:1,entries:{...index.entries,[id]:row}};
  check();await io.write(indexPath,next);check();directory=next;await store.acknowledge(id,home.revision,row);return {row};
 }
 return {list,download,loadPart,sync(id){const next=queue.catch(()=>{}).then(()=>syncNow(id));queue=next;return next;},async remove(id){const index=await list();check();const entries={...index.entries};delete entries[id];const next={version:1,entries};await io.write(indexPath,next);check();directory=next;}};
}
