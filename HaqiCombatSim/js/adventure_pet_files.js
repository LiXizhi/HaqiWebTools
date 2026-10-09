import {petContentKey,petSummary,petFilePath,validPetFileRef,initialPetIds} from './adventure_pet_files_core.js';
import {validatePetInstance,petInteractionParams} from './adventure_pet_interactions_core.js';
const clone=x=>JSON.parse(JSON.stringify(x));
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const check=(ok,text)=>{if(!ok)throw Error(text);};
export function petFileEnvelope(scope,kind,data){return {version:1,scope,kind,data};}
export function unpackPetPages(save,scope,read){
    if(!save.petPages)return save;
    const refs={};
    for(const path of save.petPages){check(/^pet-pages\/[a-zA-Z0-9_-]+\.json$/.test(path),'宠物分页路径无效');const file=read(path);check(file?.version===1&&file.scope===scope&&file.kind==='page'&&Array.isArray(file.data),'宠物目录缺失或账号不符');for(const [id,row]of file.data){check(!Object.hasOwn(refs,id)&&validPetFileRef(id,row),'宠物目录无效');refs[id]=row;}}
    return {...save,petFileRefs:Object.fromEntries(Object.entries(refs).filter(([id])=>!save.petMergedIds?.includes(id)))};
}
export function hydratePetFile(save,id,scope,read,content){
    const ref=save.petFileRefs?.[id];if(!ref)return;
    check(validPetFileRef(id,ref),'宠物文件路径无效');
    const file=read(ref.path);check(file?.version===1&&file.scope===scope&&file.kind==='pet','宠物文件缺失或账号不符');
    const pet=clone(file.data);validatePetInstance(pet,content);check(equal(petSummary(pet),ref.summary),'宠物文件与目录不一致');
    if(!save[ref.group][id])save[ref.group][id]=pet;
}
// Generator permits the same ordered write-before-publish workflow with synchronous
// local files and asynchronous Keepwork files. Yielded files are immutable.
export function* packPetFiles(source,scope,content,uuid){
    if(source.petInstanceVersion!==1)return clone(source);
    const save=clone(source),refs=clone(save.petFileRefs||{});
    for(const id of Object.keys(refs))if(String(id).startsWith('npc-pet:')||save.petMergedIds?.includes(id))delete refs[id];
    for(const group of ['pets','petWorld'])for(const [id,pet]of Object.entries(save[group]||{})){
        if(String(id).startsWith('npc-pet:')){delete save[group][id];continue;}
        delete pet.hp;delete pet.hunger;
        validatePetInstance(pet,content);
        const old=refs[id],file=old?yield {read:old.path}:null;
        const data=petFileEnvelope(scope,'pet',pet);
        const path=file&&equal(file,data)?old.path:petFilePath(id,uuid());
        if(path!==old?.path)yield {write:path,value:data};
        refs[id]={path,group,summary:petSummary(pet),contentKey:petContentKey(pet)};
    }
    const rows=Object.entries(refs).sort(([a],[b])=>a.localeCompare(b)),size=petInteractionParams(content).indexPageSize,pages=[];
    for(let i=0;i<rows.length;i+=size){
        const data=petFileEnvelope(scope,'page',rows.slice(i,i+size)),old=save.petPages?.[i/size],file=old?yield {read:old}:null;
        const path=file&&equal(file,data)?old:`pet-pages/${uuid()}.json`;
        if(path!==old)yield {write:path,value:data};pages.push(path);
    }
    save.pets={};save.petWorld={};save.petPages=pages;delete save.petFileRefs;
    return save;
}
export function packPetFilesSync(save,scope,content,uuid,io){const task=packPetFiles(save,scope,content,uuid);let step=task.next();while(!step.done){const r=step.value;step=task.next(r.read?io.read(r.read):(io.write(r.write,r.value),null));}return step.value;}
export async function packPetFilesAsync(save,scope,content,uuid,io){const task=packPetFiles(save,scope,content,uuid);let step=task.next();while(!step.done){const r=step.value;step=task.next(r.read?await io.read(r.read):(await io.write(r.write,r.value),null));}return step.value;}
export async function openPetFiles(source,scope,content,io){
    if(!source.petPages)return clone(source);
    const files=new Map();for(const path of source.petPages)files.set(path,await io.read(path));
    const save=unpackPetPages(clone(source),scope,p=>files.get(p));
    for(const id of initialPetIds(save)){const ref=save.petFileRefs[id];if(ref&&!files.has(ref.path))files.set(ref.path,await io.read(ref.path));hydratePetFile(save,id,scope,p=>files.get(p),content);}
    return save;
}
