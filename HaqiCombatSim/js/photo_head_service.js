import {createPhotoHeadWorkspace} from './photo_head_workspace.js';
import {createRuntimeStore} from './adventure_runtime_store.js';
import {PHOTO_HEAD_LIMIT,publicPhotoHead,photoHeadPrompt,photoHeadQuota,scaleHeadFrames,formatTransferBytes} from './photo_head_core.js';
import {blobDataURL,fetchImage,sha256,imageBitmap,packHead,verifyHeadAsset,headPreview,checkHeadProcessingSupport} from './photo_head_images.js';
const assert=(ok,text)=>{if(!ok)throw Error(text);};
const PHOTO_VIP_ONLY='照片生成形象为会员专属功能，请开通会员后使用。';
export function createPhotoHeadService({assets,getOwner,membership,workspace=createPhotoHeadWorkspace({getOwner}),cache=createRuntimeStore({databaseName:'haqi-photo-heads-v1'}),readConfig=()=>fetch(new URL('../data/adventure/photo-head.json',import.meta.url)).then(r=>{if(!r.ok)throw Error('生成配置不可用');return r.json();}),images={blobDataURL,fetchImage,sha256,imageBitmap,packHead,verifyHeadAsset,headPreview,checkHeadProcessingSupport},uuid=()=>crypto.randomUUID()}={}){
    const previews=new Map();
    let busy=false,session=null,config=null,job=null,head=null,status='',error='',stage='',progress=null;
    let receivedBytes=0,transferStartedAt=null,lastProgressAt=null;
    const listeners=new Set();
    const key=owner=>`photo-head-pending:${owner}`;
    const notify=()=>{for(const fn of listeners)try{fn();}catch{/* A view listener must not break service locks. */}};
    const clearTransfer=()=>{receivedBytes=0;transferStartedAt=null;lastProgressAt=null;};
    const phase=(text,next='')=>{status=text;stage=next;progress=null;if(next!=='generating'&&next!=='uploading')clearTransfer();error='';notify();};
    const enabled=()=>config?.enabled===true;
    async function remember(){session.check();cache.set(key(session.owner),job);await cache.flush();session.check();}
    async function run(fn){assert(!busy,'已有一个形象任务正在运行');busy=true;error='';notify();try{return await fn();}catch(e){error=e.message;throw e;}finally{busy=false;notify();}}
    async function open(){
        assert(!busy,'已有一个形象任务正在运行');
        previews.clear();session=await workspace.connect();config??=await readConfig();session.check();
        await cache.prepare([key(session.owner)]);session.check();job=cache.get(key(session.owner))||null;
        if(job?.owner!==session.owner)job=null;
        const root=await session.index();
        if(root.pending&&root.pending.id!==job?.id)job=null;
        if(root.pending && !job)status='上次生成中断，尚未收到图片；可放弃后重新生成。';
        else if(job?.source||job?.sourceURL)status=job.saved?'形象已保存，可以预览和使用。':'已有生成结果，可继续处理和保存。';
        else {status='';error='';}
        // Reopening must not keep a prior generation stage; library picks are not "done".
        stage='';progress=null;clearTransfer();head=null;notify();return root;
    }
    async function reference(appearance){
        const templateId=appearance==='girl'?'elf-girl':'elf-boy',template=assets.hero?.manifest.heads[templateId];
        assert(template?.cdn&&template.sha256,'布局参考未准备好，暂不能生成');
        const blob=await images.fetchImage(template.cdn);session.check();
        assert(await images.sha256(blob)===template.sha256,'布局参考哈希不符');
        const bitmap=await images.imageBitmap(blob);
        try{assert(bitmap.width===template.width&&bitmap.height===template.height,'布局参考尺寸不符');}finally{bitmap.close();}
        scaleHeadFrames(template,template.width);
        return {template:structuredClone(template),url:await images.blobDataURL(blob)};
    }
    async function finish(){
        session.check();assert(job?.source||job?.sourceURL,'尚未收到生成图片，请重新选择照片');
        if(!job.source){phase('正在读取生成结果…');const blob=await images.fetchImage(job.sourceURL);session.check();job.source=await images.blobDataURL(blob);delete job.sourceURL;await remember();}
        if(!job.packed){phase('正在去背景并压缩图集…','processing');const result=await images.packHead(await images.fetchImage(job.source),job.template,{strength:job.strength??1});session.check();
            job.packed={...result,blob:undefined,data:await images.blobDataURL(result.blob)};await remember();}
        if(!job.uploaded){phase('正在上传卡通形象…','uploading');
            const uploadStarted=Date.now();transferStartedAt=uploadStarted;lastProgressAt=uploadStarted;receivedBytes=0;
            const blob=await images.fetchImage(job.packed.data),file=new File([blob],job.id+'.webp',{type:'image/webp'});
            assert(blob.type==='image/webp'&&blob.size>0&&blob.size<=200000&&blob.size===job.packed.bytes,'上传图片必须是200KB以内的WebP');
            assert(await images.sha256(blob)===job.packed.sha256,'上传图片哈希不符');session.check();
            assert(typeof session.sdk.cloudDrive?.uploadUserCDNFile==='function','当前SDK不支持形象上传，请刷新后重试');
            // The content hash makes an interrupted retry target the same immutable asset.
            const result=await session.sdk.cloudDrive.uploadUserCDNFile(file,{filename:file.name,key:`haqi/heads/${job.id}-${job.packed.sha256}.webp`,onProgress:value=>{
                try{session.check();}catch{return;}
                progress=Number.isFinite(value?.percent)?Math.max(0,Math.min(100,Math.round(value.percent))):null;
                lastProgressAt=Date.now();notify();
            }});session.check();
            assert(/^https:\/\/cdn\.keepwork\.com\/users\/[^\s?#]+\.webp$/.test(result?.url||''),'上传未返回永久Keepwork CDN地址');
            job.uploaded=result.url;await remember();}
        phase('正在核验并保存形象…','saving');
        const next=publicPhotoHead({version:1,id:job.id,owner:session.owner,gender:job.appearance==='girl'?'female':'male',directionCount:16,cdn:job.uploaded,...job.packed,frames:job.frames||job.packed.frames});
        await images.verifyHeadAsset(next);session.check();
        job.preview??=await images.headPreview(await images.fetchImage(job.packed.data),next.frames[0]);session.check();
        head=await session.save(job,next,{edit:job.saved===true,preview:job.preview});session.check();job.saved=true;job.head=head;await remember();
        assets.hero.registerHead(head);phase('形象已保存，可以预览和使用。','done');return head;
    }
    return {
        subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
        get state(){return {busy,head,status,error,stage,progress,receivedBytes,transferStartedAt,lastProgressAt,job:job?{id:job.id,saved:job.saved,hasSource:!!(job.source||job.sourceURL)}:null,enabled:enabled(),disabledReason:config?.disabledReason||'照片形象生成暂未开放。已有形象仍可使用。'};},
        open,
        async entitlement(){session.check();const member=await membership.refresh({force:true});session.check();assert(member.status==='ready'&&member.username===session.owner,'无法确认当前账号会员状态');const root=await session.index();return {...photoHeadQuota(root,member.isVip),allowed:photoHeadQuota(root,member.isVip).allowed&&root.heads.length<PHOTO_HEAD_LIMIT,total:root.heads.length,limit:PHOTO_HEAD_LIMIT,vip:member.isVip===true};},
        async list(cursor=0){session.check();return session.page(cursor);},
        async preview(row){
            const active=session;active.check();const key=`${active.owner}:${row.path}`;
            if(!previews.has(key)){
                const request=(async()=>{const selected=await active.readHead(row.path);active.check();assert(selected.id===row.id,'形象目录无效');
                    const result=await images.headPreview(await images.fetchImage(selected.cdn),selected.frames[0]);active.check();return result;})();
                previews.set(key,request);request.catch(()=>{if(previews.get(key)===request)previews.delete(key);});
            }
            const result=await previews.get(key);active.check();return result;
        },
        select:row=>run(async()=>{session.check();const selected=await session.readHead(row.path);session.check();assert(selected.id===row.id,'形象目录无效');if(!row.preview){const preview=await images.headPreview(await images.fetchImage(selected.cdn),selected.frames[0]);session.check();await session.save({id:selected.id},selected,{edit:true,preview});}head=selected;assets.hero.registerHead(head);return head;}),
        // Outfit summary writes are serialized by the workspace; do not take the generation busy lock
        // or a slow index save after "Use this avatar" blocks reopen/select/apply.
        rememberOutfit:async(id,outfit)=>{session.check();return session.rememberOutfit(id,outfit);},
        remove:row=>run(async()=>{session.check();await session.remove(row.id);session.check();if(job?.id===row.id){job=null;await remember();}if(head?.id===row.id)head=null;phase('形象已从历史记录中删除。');}),
        generate:photo=>run(async()=>{
            assert(enabled(),'照片形象生成暂未开放');session.check();
            assert(photo?.blob?.type==='image/jpeg'&&photo.blob.size<=300000,'请先裁剪压缩照片');
            await images.checkHeadProcessingSupport?.();session.check();
            const member=await membership.refresh({force:true});session.check();assert(member.status==='ready'&&member.username===session.owner,'无法确认当前账号会员状态');
            const root=await session.index();assert(root.heads.length<PHOTO_HEAD_LIMIT,'最多保留10个形象，请先删除不需要的形象');
            assert(photoHeadQuota(root,member.isVip).allowed,PHOTO_VIP_ONLY);
            phase('正在核验布局参考…');const ref=await reference(photo.appearance);session.check();
            if(!session.sdk.aiGenerators)await session.sdk.loadAIChat();session.check();assert(typeof session.sdk.aiGenerators?.genImage==='function','图片生成接口不可用');
            assert(typeof session.sdk.cloudDrive?.uploadUserCDNFile==='function','当前SDK不支持形象上传，请刷新后重试');
            job={id:`photo-${uuid()}-${photo.appearance==='girl'?'girl':'boy'}`,owner:session.owner,appearance:photo.appearance,vip:member.isVip===true,template:ref.template,strength:1,createdAt:new Date().toISOString()};head=null;
            await session.reserve(job);await remember();
            const started=Date.now();receivedBytes=0;transferStartedAt=started;lastProgressAt=started;progress=null;
            status='正在生成16方向形象…';stage='generating';error='';notify();
            const abortController=new AbortController(),timer=setTimeout(()=>abortController.abort(),240000);
            try{
                const source=await session.sdk.aiGenerators.genImage(photoHeadPrompt(ref.template),{
                    model:config.model||'keepwork-image-pro',provider:'keepwork',preferDirect:false,width:1024,height:1024,
                    images:[{url:await images.blobDataURL(photo.blob),role:'reference_image'},{url:ref.url,role:'reference_image'}],
                    uploadResultToKeepwork:false,stream:true,partialImages:2,abortController,
                    onProgress:bytes=>{
                        try{session.check();}catch{return;}
                        receivedBytes=Math.max(0,Number(bytes)||0);lastProgressAt=Date.now();
                        status=receivedBytes>0?`正在生成16方向形象… 已接收 ${formatTransferBytes(receivedBytes)}`:'正在生成16方向形象…';
                        notify();
                    },
                });session.check();
                assert(source,'生成服务未返回图片');
                // Only AI output is persisted; neither input image nor provider request is cached.
                job.sourceURL=source;await remember();
            }catch{
                session.check();if(!job.source&&!job.sourceURL){await session.release(job.id);job=null;await remember();}
                throw Error('生成未完成，未扣次数。请检查网络后手动重试。');
            }finally{clearTimeout(timer);}
            return finish();
        }),
        retry:()=>run(finish),
        abandon:()=>run(async()=>{session.check();const root=await session.index();if(root.pending)await session.release(root.pending.id);job=null;await remember();phase('可以重新选择照片。');}),
        reprocess:strength=>run(async()=>{session.check();assert(job?.source&&job.id===head?.id,'此设备没有生成原图，不能重新去背景');job.strength=strength;delete job.packed;delete job.uploaded;delete job.frames;delete job.preview;await remember();return finish();}),
        adjust:(frames,source)=>run(async()=>{previews.clear();session.check();
            if(source)head=publicPhotoHead(source,{owner:session.owner,id:source.id});
            assert(head,'请先选择形象');const next=publicPhotoHead({...head,frames});const preview=await images.headPreview(await images.fetchImage(next.cdn),next.frames[0]);session.check();head=await session.save({id:head.id},next,{edit:true,preview});assets.hero.registerHead(head);if(job?.id===head.id){job.frames=frames;job.head=head;job.preview=preview;await remember();}phase('连接位置已保存。');return head;}),
        templateFrames(){const template=assets.hero.manifest.heads[head?.gender==='female'?'elf-girl':'elf-boy'];return scaleHeadFrames(template,head.width);},
    };
}
