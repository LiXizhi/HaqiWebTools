// Lazy, role-scoped immutable files. IO is injected; no SDK or player data is touched at import.
import {validatePetInstance,petInteractionParams} from './adventure_pet_interactions_core.js';

const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const compare=(a,b)=>a<b?-1:a>b?1:0;
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const safeRevision=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(id);
const fileKey=id=>Array.from(id,c=>c.codePointAt(0).toString(16)).join('-');
const summary=(pet,path)=>({id:pet.id,speciesId:pet.speciesId,ownerId:pet.ownerId,level:pet.level,
    zone:pet.ownerId===null?pet.birth.zone:null,path});

export function createPetRepository({io,scope,content,revision=()=>globalThis.crypto.randomUUID()}){
    assert(typeof scope==='string'&&scope.length>0,'宠物存储作用域无效');
    const cache=new Map();let closed=false,generation=0;
    const active=token=>{assert(!closed&&token===generation,'宠物存储已切换，请重新操作');};
    function validateHead(head){
        if(head===null)return {version:1,scope,revision:null,pages:[],scenes:[]};
        assert(head?.version===1&&head.scope===scope&&safeRevision(head.revision)&&Array.isArray(head.pages),'宠物目录身份无效');
        assert(Array.isArray(head.scenes),'宠物场景索引无效');
        const zones=new Set();
        for(const scene of head.scenes){
            assert(typeof scene.zone==='string'&&!zones.has(scene.zone)&&Array.isArray(scene.pages),'宠物场景索引无效');zones.add(scene.zone);
            for(const path of scene.pages){const name=typeof path==='string'?path.split('/').at(-1).replace(/\.json$/,''):null;assert(safeRevision(name)&&path===`scenes/${fileKey(scene.zone)}/${name}.json`,'宠物场景路径无效');}
        }
        let previous=null;
        for(const page of head.pages){
            assert(typeof page.first==='string'&&typeof page.last==='string'&&page.first<=page.last&&
                Number.isInteger(page.count)&&page.count>0&&page.count<=petInteractionParams(content).indexPageSize&&
                typeof page.path==='string'&&/^pages\/[a-zA-Z0-9_-]+\.json$/.test(page.path)&&
                (previous===null||previous<page.first),'宠物索引分页无效');
            previous=page.last;
        }return clone(head);
    }
    async function head(){const token=generation;const result=validateHead(await io.head());active(token);return result;}
    async function file(path,kind){
        const token=generation;active(token);
        if(!cache.has(path))cache.set(path,Promise.resolve().then(()=>io.read(path)).then(value=>{
            active(token);assert(value?.version===1&&value.scope===scope&&value.kind===kind,'宠物文件缺失或身份无效');return value;
        }).catch(error=>{cache.delete(path);throw error;}));
        const result=await cache.get(path);active(token);return clone(result.data);
    }
    function checkSummary(row){
        const name=typeof row?.path==='string'?row.path.split('/').at(-1).replace(/\.json$/,''):null;
        assert(row&&typeof row.id==='string'&&typeof row.path==='string'&&
            safeRevision(name)&&row.path===`pets/${fileKey(row.id)}/${name}.json`&&
            Object.hasOwn(content.pets,row.speciesId)&&Number.isInteger(row.level)&&row.level>=1&&
            (row.ownerId===null?typeof row.zone==='string':typeof row.ownerId==='string'&&row.zone===null),'宠物摘要无效');
    }
    async function page(descriptor){
        const rows=await file(descriptor.path,'page');
        assert(Array.isArray(rows)&&rows.length===descriptor.count&&rows[0]?.id===descriptor.first&&rows.at(-1)?.id===descriptor.last,'宠物索引内容不一致');
        rows.forEach((row,i)=>{checkSummary(row);assert(!i||rows[i-1].id<row.id,'宠物索引身份重复');});return rows;
    }
    async function locate(id,manifest){
        const descriptor=manifest.pages.find(p=>p.first<=id&&p.last>=id);
        return descriptor?(await page(descriptor)).find(row=>row.id===id)||null:null;
    }
    async function load(id,manifest){
        const row=await locate(id,manifest);if(!row)return null;
        const pet=await file(row.path,'pet');validatePetInstance(pet,content);
        assert(equal(summary(pet,row.path),row),'宠物文件与摘要不一致');return {pet,path:row.path};
    }
    async function write(path,kind,data,token){
        active(token);const envelope={version:1,scope,kind,data:clone(data)};
        await io.write(path,envelope);active(token);
        // No cache substitution: verify durable bytes before publishing any references.
        assert(equal(await io.read(path),envelope),'宠物文件保存核验失败');active(token);
        cache.set(path,Promise.resolve(envelope));
    }
    return {
        head,
        async get(id){const manifest=await head();return load(id,manifest);},
        async getMany(ids){const manifest=await head();return Promise.all([...new Set(ids)].map(id=>load(id,manifest)));},
        // Page summaries are sufficient for bag lists; never load pet bodies here.
        async listPage(index=0){const manifest=await head();assert(Number.isInteger(index)&&index>=0,'宠物页码无效');return {revision:manifest.revision,page:index,pages:manifest.pages.length,rows:manifest.pages[index]?await page(manifest.pages[index]):[]};},
        // Current scene actor IDs come from the scene index/controller, not a scan of all pets.
        async scene(ids){return this.getMany(ids);},
        async babies(zone,index=0){
            assert(Number.isInteger(index)&&index>=0,'宝宝页码无效');
            const manifest=await head(),paths=manifest.scenes.find(s=>s.zone===zone)?.pages||[];
            const ids=paths[index]?await file(paths[index],'scene'):[];
            assert(Array.isArray(ids)&&ids.length<=petInteractionParams(content).indexPageSize&&new Set(ids).size===ids.length&&ids.every(id=>typeof id==='string'),'宝宝场景索引无效');
            const rows=await Promise.all(ids.map(id=>load(id,manifest)));
            assert(rows.every(row=>row?.pet.ownerId===null&&row.pet.birth?.zone===zone),'宝宝与场景索引不一致');
            return {pages:paths.length,rows};
        },
        async commit(changes,{expectedRevision}={}){
            const token=generation,manifest=await head();active(token);
            if(expectedRevision!==undefined)assert(manifest.revision===expectedRevision,'宠物目录已变化，请重新读取');
            assert(Array.isArray(changes)&&changes.length&&new Set(changes.map(row=>row.pet?.id)).size===changes.length,'宠物保存批次无效');
            const updates=[];
            // Validate the entire batch and all source revisions before any write.
            for(const change of changes){
                validatePetInstance(change.pet,content);
                const old=await load(change.pet.id,manifest);
                assert(Object.hasOwn(change,'expectedPath')&&change.expectedPath===(old?.path??null),'宠物实例已变化，请重新读取');
                if(old){
                    assert(change.pet.speciesId===old.pet.speciesId&&change.pet.gender===old.pet.gender,'宠物固定身份不可改变');
                    assert(change.pet.birthSerial>=old.pet.birthSerial&&change.pet.memorySerial>=old.pet.memorySerial&&change.pet.memoryClock>=old.pet.memoryClock,'宠物记录不能回退');
                    assert(change.pet.cooldownUntil>=old.pet.cooldownUntil,'宠物冷却记录不能回退');
                    assert(old.pet.ownerId===null||change.pet.ownerId===old.pet.ownerId,'宠物归属不可改变');
                    if(old.pet.birth){
                        const {adoptedAt:oldAdopted,...oldBirth}=old.pet.birth;
                        const {adoptedAt:newAdopted,...newBirth}=change.pet.birth||{};
                        assert(equal(oldBirth,newBirth)&&(oldAdopted===null||oldAdopted===newAdopted),'宝宝出生或领养记录不可改变');
                    }else assert(!change.pet.birth,'既有宠物不能改为新生宝宝');
                }
                if(!old||!equal(old.pet,change.pet))updates.push({...change,old:old?.pet??null});
            }
            if(!updates.length)return {revision:manifest.revision,changed:false};
            const nextRevision=revision();assert(safeRevision(nextRevision)&&nextRevision!==manifest.revision,'宠物存储版本无效');
            const next=clone(manifest);next.revision=nextRevision;
            const pages=manifest.pages.map(descriptor=>({descriptor,rows:null}));
            if(!pages.length)pages.push({descriptor:null,rows:[]});
            for(const change of updates){
                const id=change.pet.id,path=`pets/${fileKey(id)}/${nextRevision}.json`;
                await write(path,'pet',change.pet,token);
                // Only the page covering this ID is read/rewritten, even in a large collection.
                let index=pages.findIndex(p=>p.descriptor&&id<=p.descriptor.last);if(index<0)index=pages.length-1;
                const target=pages[index];target.rows??=await page(target.descriptor);
                target.rows=target.rows.filter(row=>row.id!==id);target.rows.push(summary(change.pet,path));target.rows.sort((a,b)=>compare(a.id,b.id));
            }
            next.pages=[];let serial=0;
            const size=petInteractionParams(content).indexPageSize;
            for(const target of pages){
                if(!target.rows){next.pages.push(target.descriptor);continue;}
                for(let offset=0;offset<target.rows.length;offset+=size){
                    const rows=target.rows.slice(offset,offset+size),path=`pages/${nextRevision}_${serial++}.json`;
                    await write(path,'page',rows,token);
                    next.pages.push({first:rows[0].id,last:rows.at(-1).id,count:rows.length,path});
                }
            }
            // Birth and adoption update only the affected map's lightweight baby references.
            const affected=new Set();
            for(const change of updates){
                if(change.old?.ownerId===null)affected.add(change.old.birth.zone);
                if(change.pet.ownerId===null)affected.add(change.pet.birth.zone);
            }
            for(const zone of affected){
                const paths=manifest.scenes.find(s=>s.zone===zone)?.pages||[],ids=new Set();
                for(const path of paths){
                    const rows=await file(path,'scene');assert(Array.isArray(rows)&&rows.every(id=>typeof id==='string'),'宝宝场景索引无效');
                    rows.forEach(id=>ids.add(id));
                }
                for(const change of updates){ids.delete(change.pet.id);if(change.pet.ownerId===null&&change.pet.birth.zone===zone)ids.add(change.pet.id);}
                const sorted=[...ids].sort(compare),scene={zone,pages:[]};
                for(let i=0;i<sorted.length;i+=size){
                    const path=`scenes/${fileKey(zone)}/${nextRevision}_${i/size}.json`;
                    await write(path,'scene',sorted.slice(i,i+size),token);scene.pages.push(path);
                }
                next.scenes=next.scenes.filter(s=>s.zone!==zone);if(scene.pages.length)next.scenes.push(scene);
            }
            next.scenes.sort((a,b)=>compare(a.zone,b.zone));
            validateHead(next);active(token);
            // Adapter must compare and publish atomically. No optimistic overwrite on conflict.
            assert(await io.publish(manifest.revision,next),'宠物目录已在其他页面变化，请重新读取');active(token);
            return {revision:nextRevision,changed:true};
        },
        async exportAll(){const manifest=await head(),pets=[];for(const descriptor of manifest.pages)for(const row of await page(descriptor))pets.push((await load(row.id,manifest)).pet);return pets;},
        evict(){cache.clear();},
        close(){closed=true;generation++;cache.clear();},
    };
}
