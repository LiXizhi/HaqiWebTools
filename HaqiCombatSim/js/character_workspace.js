import {loadKeepwork} from './adventure_cloud.js';
import {hashSeed} from './rng_core.js';
import {relationshipParams,validateRelationship,quotaState,beijingDay,reserveQuota,finishQuota,quotaRemaining} from './character_relationship_core.js';

const copy=value=>structuredClone(value);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const segment=value=>encodeURIComponent(value).replaceAll('.', '%2E');
const check=(ok,message)=>{if(!ok)throw Error(message);};
const deadline=async promise=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('关系档案连接超时，请重试')),25000);})]);}finally{clearTimeout(timer);}};

// No CAS exists in the inspected PersonalPageStore API. Read/check/write/readback
// detects witnessed conflicts, but does not promise atomic cross-device quota.
export function createCharacterWorkspace({getOwner,loadSDK=loadKeepwork,cache,locks=globalThis.navigator?.locks,uuid=()=>crypto.randomUUID(),now=Date.now}={}){
    const chains=new Map();
    function serial(key,fn){const previous=chains.get(key)||Promise.resolve();const task=previous.catch(()=>{}).then(()=>locks?locks.request(`haqi-character:${key}`,fn):fn());chains.set(key,task);return task.finally(()=>{if(chains.get(key)===task)chains.delete(key);});}
    async function connect(role){
        const owner=getOwner();check(owner,'请先登录并选择账号角色');
        const sdk=await loadSDK(),token=sdk.token;check(token,'请先登录');
        const profile=await deadline(sdk.getUserProfile({useCache:true}));
        check(profile?.username===owner&&getOwner()===owner,'登录账号已变化');
        const store=sdk.personalPageStore.withWorkspace('HaqiAdventure');
        const valid=()=>check(getOwner()===owner&&sdk.token===token,'登录账号已变化，操作已取消');
        const prefix=`roles/${segment(role)}/relationships/`,scope=`${owner}:${role}`;
        async function read(path,optional=false){
            valid();const full=store.getRemotePagePath(path);check(full.startsWith(owner+'/'),'关系文件账号不一致');
            let raw;
            if(optional){
                // getFileByFullPath also returns null on network/auth errors. Only
                // loadPage's explicit server-cache 404 may initialize a new file.
                const parts=full.split('/');
                const result=await deadline(sdk.loadPage({sitePath:parts.slice(0,2).join('/'),pagePath:parts.slice(2).join('/'),useCache:true,useServerCache:true}));valid();
                if(result?.success===false&&result.fromServerCache===true&&result.content===''&&!result.error)return null;
                check(result?.success===true&&result.fromServerCache===true&&typeof result?.content==='string','无法核验关系目录');raw=result.content;
            }else raw=await deadline(sdk.getFileByFullPath(full,undefined,true));valid();
            check(typeof raw==='string'&&raw.length>0,'无法核验关系档案，请重试');
            cache?.set(`${owner}:${path}`,raw);return raw;
        }
        async function write(path,raw){
            valid();await deadline(store.savePageData(path,'content',raw,false,true));valid();
            check(await deadline(store.syncToGit(path,true)),'关系档案尚未同步');valid();
            check(await read(path)===raw,'关系档案写入核验失败，请重新加载');
        }
        async function json(path,optional=false){const raw=await read(path,optional);return raw===null?null:JSON.parse(raw);}
        async function index(){const row=await json(prefix+'index.json',true);check(!row||row.version===1&&row.scope===scope&&row.buckets,'关系目录账号或格式无效');return row||{version:1,scope,revision:null,buckets:{}};}
        const bucket=id=>(hashSeed(id)%64).toString(16);
        async function file(path){check(typeof path==='string'&&path.startsWith(prefix)&&!path.includes('..'),'关系文件路径无效');const row=await json(path);check(row.scope===scope,'关系文件账号不符');return row;}
        async function locate(root,id){const paths=root.buckets[bucket(id)]||[];for(let i=0;i<paths.length;i++){const page=await file(paths[i]);const entry=page.rows.find(r=>r.id===id);if(entry)return {entry,page,pageIndex:i};}return {entry:null};}
        async function load(id){const root=await index(),{entry}=await locate(root,id);if(!entry)return null;const record=(await file(entry.path)).record;validateRelationship(record,id);return record;}
        async function save(record){return serial(scope,async()=>{
            valid();validateRelationship(record,record.peer.id);const root=await index(),found=await locate(root,record.peer.id);
            check((found.entry?.revision||null)===record.revision,'关系档案已在其他窗口更新，请重新加载');
            const revision=uuid(),next=copy(record);next.revision=revision;
            const base=prefix+`peers/${segment(record.peer.id)}/${revision}/`;
            // Archive event pages without losing lifetime deduplication.
            if(next.events.length>100){const path=base+'events.json';await write(path,JSON.stringify({scope,rows:next.events.slice(0,-50),previous:next.eventHistory}));next.eventHistory=path;next.events=next.events.slice(-50);}
            next.memory=base+'memory.md';await write(next.memory,next.summary||'# 相处记忆\n\n尚无摘要。\n');
            const path=base+'record.json';await write(path,JSON.stringify({scope,record:next}));
            const entry={id:next.peer.id,name:next.peer.name,affinity:next.affinity,updatedAt:next.updatedAt,path,revision};
            const key=bucket(next.peer.id),paths=[...(root.buckets[key]||[])];let rows,pageIndex;
            if(found.entry){rows=found.page.rows.map(r=>r.id===entry.id?entry:r);pageIndex=found.pageIndex;}
            else{pageIndex=paths.length?paths.length-1:0;rows=paths.length?(await file(paths[pageIndex])).rows:[];if(rows.length>=relationshipParams().indexPageSize){pageIndex=paths.length;rows=[];}rows=[...rows,entry];}
            const pagePath=prefix+`pages/${uuid()}.json`;await write(pagePath,JSON.stringify({scope,rows}));paths[pageIndex]=pagePath;
            check(equal(await index(),root),'关系目录已变化，请重试');
            await write(prefix+'index.json',JSON.stringify({...root,revision:uuid(),buckets:{...root.buckets,[key]:paths}}));
            return next;
        });}
        async function hasEvent(record,id){if(record.events.some(e=>e.eventId===id))return true;let path=record.eventHistory;const seen=new Set();while(path){check(!seen.has(path),'关系事件分页循环');seen.add(path);const page=await file(path);if(page.rows.some(e=>e.eventId===id))return true;path=page.previous;}return false;}
        async function archive(record,messages){const path=prefix+`history/${uuid()}.json`;await write(path,JSON.stringify({scope,messages,previous:record.history}));return path;}
        async function list(cursor=0){const root=await index(),paths=Object.keys(root.buckets).sort().flatMap(k=>root.buckets[k]);if(cursor>=paths.length)return {rows:[],next:null};const page=await file(paths[cursor]);return {rows:page.rows,next:cursor+1<paths.length?cursor+1:null};}
        async function playerMemory(hero){const path=`roles/${segment(role)}/memory.md`;const old=await read(path,true);if(old!==null)return old;const text=`# ${hero.name||'冒险者'}\n\n母语：${hero.languageLearning?.native||'zh-CN'}\n学习语言：${hero.languageLearning?.target||'en'}\n\n${hero.learnerMemory||''}`;await write(path,text);return text;}
        async function quota(day=beijingDay(now())){const row=await json(`social/free-talk/${day}.json`,true);check(!row||row.owner===owner,'额度账号不符');return quotaState(row,day);}
        async function updateQuota(day,change){return serial(`${owner}:quota`,async()=>{valid();const before=await quota(day),after=change(copy(before));if(equal(before,after))return after;check(equal(await quota(day),before),'额度已变化，请重试');const next={...after,owner,revision:uuid()};await write(`social/free-talk/${day}.json`,JSON.stringify(next));return next;});}
        return {owner,role,scope,valid,load,save,hasEvent,archive,list,playerMemory,history:file,quota,
            remaining:async()=>quotaRemaining(await quota()),
            reserve:(id,peer,vip,day=beijingDay(now()),text='')=>updateQuota(day,row=>reserveQuota(row,id,{role,peer,text},vip,now())),
            dispatch:(id,day)=>updateQuota(day,row=>{
                const request=row.requests[id];check(request?.status==='pending'&&!request.dispatched,'这条请求已发送，正在等待核验');
                return {...row,requests:{...row.requests,[id]:{...request,dispatched:true}}};
            }),
            receipt:(id,response,day)=>updateQuota(day,row=>{
                const request=row.requests[id];check(request?.status==='pending','发送记录已变化');
                return {...row,requests:{...row.requests,[id]:{...request,response}}};
            }),
            finish:(id,status,day)=>updateQuota(day,row=>finishQuota(row,id,status)),
        };
    }
    return {connect};
}
