import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPhotoHeadWorkspace} from '../js/photo_head_workspace.js';
import {createPhotoHeadService} from '../js/photo_head_service.js';
import {scaleHeadFrames,photoHeadOutfitPreference} from '../js/photo_head_core.js';
const template=JSON.parse(readFileSync(new URL('../data/hero-preview.json',import.meta.url))).heads['elf-boy'];
const preview='data:image/webp;base64,V0VCUA==';
const head=id=>({version:1,id,owner:'tester',gender:'male',cdn:`https://cdn.keepwork.com/users/tester/${id}.webp`,sha256:'a'.repeat(64),bytes:123,width:576,height:576,directionCount:16,frames:scaleHeadFrames(template,576)});
function fixture(){
    const files=new Map(),writes=[];let owner='tester',serial=0,fail=false,readError=false;
    const store={supportsDirectCacheWrite:true,getRemotePagePath:p=>`tester/edunotes/store/HaqiAdventure/${p}`,async savePageData(path,key,text,a,b,opts){assert.deepEqual(opts,{directWrite:true});if(fail&&path.endsWith('index.json')&&JSON.parse(text).lastCompleted)throw Error('save failure');files.set(path,JSON.parse(text));writes.push(path);}};
    const sdk={token:'private-token',getUserProfile:async()=>({username:owner}),onAuthStateChange(){},personalPageStore:{withWorkspace:()=>store},loadPage:async({pagePath})=>{if(readError)return {success:false,error:'offline'};const path=pagePath.replace('store/HaqiAdventure/','');return files.has(path)?{success:true,fromServerCache:true,content:JSON.stringify(files.get(path))}:{success:false,fromServerCache:true,content:''};}};
    const workspace=createPhotoHeadWorkspace({getOwner:()=>owner,loadSDK:async()=>sdk,uuid:()=>`revision-${++serial}`});
    return {files,writes,sdk,workspace,setOwner:v=>owner=v,setFail:v=>fail=v,setReadError:v=>readError=v};
}
test('quota commits with catalog only after all writes, retries are idempotent and non-VIP is rejected',async()=>{
    const f=fixture(),io=await f.workspace.connect(),task={id:'photo-one-boy',vip:true,appearance:'boy'};
    await assert.rejects(io.reserve({id:'photo-free-boy',vip:false}),/会员专属/);
    await io.reserve(task);f.setFail(true);await assert.rejects(io.save(task,head(task.id),{preview}),/save failure/);
    assert.equal((await io.index()).freeUsed,false);assert.equal((await io.index()).pending.id,task.id);
    f.setFail(false);await io.save(task,head(task.id),{preview});assert.equal((await io.index()).freeUsed,false);
    const count=f.writes.length;await io.save(task,head(task.id),{preview});assert.equal(f.writes.length,count);
    await assert.rejects(io.reserve({id:'photo-two-boy',vip:false}),/会员专属/);
});
test('ten-head index loads only summaries; deleting frees a slot without refunding the free turn',async()=>{
    const f=fixture(),io=await f.workspace.connect();
    for(let i=0;i<10;i++){const task={id:`photo-${i}-boy`,vip:true,appearance:'boy'};await io.reserve(task);await io.save(task,head(task.id),{preview});}
    const first=await io.page(0);assert.equal(first.rows.length,10);assert.equal(first.next,null);assert.equal(first.total,10);
    assert.ok(first.rows.every(row=>row.preview===preview));
    assert.equal([...f.files.keys()].filter(path=>path.includes('/heads/')).length,10);
    await assert.rejects(io.reserve({id:'photo-extra-boy',vip:true}),/最多保留10/);
    const reads=[];const original=f.sdk.loadPage;f.sdk.loadPage=options=>{reads.push(options.pagePath);return original(options);};
    const fresh=await createPhotoHeadWorkspace({getOwner:()=> 'tester',loadSDK:async()=>f.sdk}).connect();await fresh.page();
    assert.deepEqual(reads,['store/HaqiAdventure/appearance/photo-heads/index.json']);
    const selected=await fresh.readHead(first.rows[0].path);assert.equal(selected.id,'photo-9-boy');assert.equal(reads.length,2);
    const edited={...selected,frames:structuredClone(selected.frames)};edited.frames[0].neck[0]+=1;await fresh.save({id:selected.id},edited,{edit:true,preview});
    assert.equal((await fresh.page()).rows[0].path,first.rows[0].path,'editing reuses the per-head document');
    await fresh.remove(selected.id);assert.equal((await fresh.page()).total,9);assert.equal((await fresh.index()).freeUsed,false);
    await assert.rejects(fresh.readHead(first.rows[0].path),/不在当前账号目录/);
    await fresh.reserve({id:'photo-extra-boy',vip:true});
    f.setOwner('other');await assert.rejects(io.reserve({id:'photo-no-boy',vip:true}),/账号/);
    const g=fixture();g.setReadError(true);await assert.rejects((await g.workspace.connect()).index(),/无法读取/);
});
test('legacy metadata migrates without reading any atlas documents and preserves quota',async()=>{
    const f=fixture(),prefix='appearance/photo-heads/';
    f.files.set(prefix+'index.json',{version:1,owner:'tester',freeUsed:true,pages:[prefix+'pages/old.json'],pending:null});
    f.files.set(prefix+'pages/old.json',[{id:'photo-old-boy',path:prefix+'heads/photo-old-boy/revision.json',gender:'male'}]);
    const io=await f.workspace.connect(),rows=await io.page();assert.equal(rows.rows[0].id,'photo-old-boy');
    assert.equal((await io.index()).freeUsed,true);await io.remove('photo-old-boy');
    assert.equal(f.files.get(prefix+'index.json').version,2);assert.equal((await io.index()).freeUsed,true);
    await assert.rejects(io.reserve({id:'photo-no-boy',vip:false}),/会员专属/);
});

function serviceFixture({enabled=true}={}){
    const f=fixture();let generated=0,uploads=0,uploadFails=true,vip=false;
    const cacheMap=new Map(),cache={async prepare(){},get:k=>cacheMap.get(k),set:(k,v)=>cacheMap.set(k,structuredClone(v)),async flush(){}};
    f.sdk.loadAIChat=async()=>{};
    f.sdk.aiGenerators={async genImage(prompt,options){generated++;assert.equal(options.images.length,2);assert.equal(options.images[0].url,'data:image/jpeg;base64,PRIVATEPHOTO');assert.equal(options.uploadResultToKeepwork,false);assert.equal(options.model,'keepwork-image-pro');assert.equal(options.stream,true);assert.match(prompt,/逐格保持下颌位置/);options.onProgress?.(1536);return 'https://cdn.keepwork.com/generated.png';}};
    f.sdk.cloudDrive={async uploadUserCDNFile(file,opts){uploads++;assert.equal(file.type,'image/webp');assert.equal(await file.text(),'webp');assert.equal(file.size,4);assert.equal(opts.key,`haqi/heads/photo-test-boy-${template.sha256}.webp`);opts.onProgress({percent:50});if(uploadFails)throw Error('upload failed');return {url:'https://cdn.keepwork.com/users/tester/photo-test-boy.webp'};}};
    const images={fetchImage:async url=>url.startsWith('data:image/webp')?new Blob(['webp'],{type:'image/webp'}):new Blob([url.includes('generated')?'GENERATED':'ART'],{type:'image/png'}),blobDataURL:async blob=>blob.type==='image/jpeg'?'data:image/jpeg;base64,PRIVATEPHOTO':blob.type==='image/webp'?'data:image/webp;base64,WEBP':'data:image/png;base64,GENERATED',sha256:async()=>template.sha256,imageBitmap:async()=>({width:576,height:576,close(){}}),packHead:async()=>({...head('photo-test-boy'),bytes:4,sha256:template.sha256,blob:new Blob(['webp'],{type:'image/webp'})}),verifyHeadAsset:async()=>{},headPreview:async()=>preview};
    const assets={hero:{manifest:{heads:{'elf-boy':template}},registerHead(){}}},membership={refresh:async()=>({status:'ready',username:'tester',isVip:vip})};
    const options={assets,getOwner:()=> 'tester',membership,workspace:f.workspace,cache,images,uuid:()=> 'test',readConfig:async()=>({enabled,verification:{directPhoto:true,dualReference:true,atlasQuality:true}})};
    return {...f,cacheMap,options,service:createPhotoHeadService(options),setUploadFails:v=>uploadFails=v,setVip:v=>vip=v,counts:()=>({generated,uploads})};
}
test('generation passes both references; upload retry and refresh reuse AI output without persisting input photo',async()=>{
    const denied=serviceFixture();await denied.service.open();
    await assert.rejects(denied.service.generate({blob:new Blob(['face'],{type:'image/jpeg'}),appearance:'boy'}),/会员专属/);
    assert.equal(denied.counts().generated,0);
    const f=serviceFixture();f.setVip(true);await f.service.open();
    let progressBytes=0;f.service.subscribe(()=>{if(f.service.state.receivedBytes)progressBytes=f.service.state.receivedBytes;});
    await assert.rejects(f.service.generate({blob:new Blob(['face'],{type:'image/jpeg'}),appearance:'boy'}),/upload failed/);
    assert.equal(f.counts().generated,1);assert.equal(progressBytes,1536);
    assert.equal((await (await f.workspace.connect()).index()).freeUsed,false);
    assert.equal(JSON.stringify([...f.cacheMap.values()]).includes('PRIVATEPHOTO'),false);
    const resumed=createPhotoHeadService(f.options);f.setVip(true);await resumed.open();f.setUploadFails(false);await resumed.retry();
    assert.equal(f.counts().generated,1);assert.equal(resumed.state.head.id,'photo-test-boy');assert.equal((await resumed.entitlement()).allowed,true);
    assert.equal(JSON.stringify([...f.files.values()]).includes('GENERATED'),false);
});
test('maintenance switch blocks provider invocation and simultaneous clicks cannot generate twice',async()=>{
    const off=serviceFixture({enabled:false});off.setVip(true);await off.service.open();await assert.rejects(off.service.generate({blob:new Blob(['face'],{type:'image/jpeg'}),appearance:'boy'}),/未开放/);assert.equal(off.counts().generated,0);
    const f=serviceFixture();f.setVip(true);await f.service.open();let release;f.sdk.aiGenerators.genImage=()=>new Promise(resolve=>release=resolve);
    const pending=f.service.generate({blob:new Blob(['face'],{type:'image/jpeg'}),appearance:'boy'});
    await assert.rejects(f.service.generate({blob:new Blob(['face'],{type:'image/jpeg'}),appearance:'boy'}),/已有一个/);
    while(!release)await new Promise(resolve=>setTimeout(resolve,1));release(null);await assert.rejects(pending,/生成未完成/);
    assert.equal((await (await f.workspace.connect()).index()).freeUsed,false);
});

test('only final WebP is uploaded; verified CDN result survives catalog retry without another upload',async()=>{
    const f=serviceFixture();f.setVip(true);f.setUploadFails(false);f.setFail(true);let verified=0;const progress=[];
    f.options.images.verifyHeadAsset=async h=>{verified++;assert.match(h.cdn,/^https:\/\/cdn.keepwork.com\/users\//);};
    f.service.subscribe(()=>{if(f.service.state.stage==='uploading')progress.push(f.service.state.progress);});
    await f.service.open();await assert.rejects(f.service.generate({blob:new Blob(['face'],{type:'image/jpeg'}),appearance:'boy'}),/save failure/);
    assert.deepEqual(f.counts(),{generated:1,uploads:1});assert.ok(progress.includes(50));
    assert.equal((await (await f.workspace.connect()).index()).freeUsed,false);
    f.setFail(false);await f.service.retry();assert.deepEqual(f.counts(),{generated:1,uploads:1});assert.equal(verified,2);
    assert.equal(f.service.state.stage,'done');assert.equal(f.service.state.head.bytes,4);
});

test('oversized or non-WebP output cannot be uploaded or counted',async()=>{
    for(const blob of [new Blob(['png'],{type:'image/png'}),new Blob([new Uint8Array(200001)],{type:'image/webp'})]){
        const f=serviceFixture();f.setVip(true);const original=f.options.images.fetchImage;
        f.options.images.fetchImage=url=>url.startsWith('data:image/webp')?blob:original(url);
        await f.service.open();await assert.rejects(f.service.generate({blob:new Blob(['face'],{type:'image/jpeg'}),appearance:'boy'}),/200KB/);
        assert.equal(f.counts().uploads,0);assert.equal((await (await f.workspace.connect()).index()).freeUsed,false);
    }
});

test('missing upload capability fails before spending a generation request',async()=>{
    const f=serviceFixture();f.setVip(true);delete f.sdk.cloudDrive;await f.service.open();
    await assert.rejects(f.service.generate({blob:new Blob(['face'],{type:'image/jpeg'}),appearance:'boy'}),/SDK不支持/);
    assert.equal(f.counts().generated,0);
});

test('full library blocks Image Pro before any provider call; saved positions remain editable and deletable',async()=>{
    const f=serviceFixture();f.setVip(true);
    const io=await f.workspace.connect();
    for(let i=0;i<10;i++){const task={id:`photo-library-${i}-boy`,vip:true};await io.reserve(task);await io.save(task,head(task.id),{preview});}
    await f.service.open();assert.equal(f.service.state.head,null,'opening DIY does not automatically select an atlas');
    assert.equal((await f.service.entitlement()).allowed,false);
    await assert.rejects(f.service.generate({blob:new Blob(['face'],{type:'image/jpeg'}),appearance:'boy'}),/最多保留10/);
    assert.equal(f.counts().generated,0);
    const row=(await f.service.list()).rows[0];const selected=await f.service.select(row),frames=structuredClone(selected.frames);frames[0].neck[0]+=3;frames[0].mirrorX=true;
    await f.service.adjust(frames);const saved=await f.service.select((await f.service.list()).rows[0]);
    assert.equal(saved.frames[0].neck[0],frames[0].neck[0]);assert.equal(saved.frames[0].mirrorX,true);
    await f.service.remove(row);assert.equal((await f.service.list()).total,9);assert.equal((await f.service.entitlement()).allowed,true);
    assert.equal(f.counts().generated,0);
});

test('library summaries remember last body gender and fall back to head gender',async()=>{
    assert.deepEqual(photoHeadOutfitPreference({gender:'male'}),{appearance:'boy'});
    assert.deepEqual(photoHeadOutfitPreference({gender:'female'},{appearance:'boy',bodyId:'male2'}),{appearance:'boy',bodyId:'male2'});
    const f=serviceFixture();f.setVip(true);const io=await f.workspace.connect(),task={id:'photo-outfit-boy',vip:true,appearance:'boy'};
    await io.reserve(task);await io.save(task,head(task.id),{preview});
    assert.equal((await io.page()).rows[0].appearance,'boy');
    const remembered=await io.rememberOutfit(task.id,{appearance:'girl',bodyId:'female2'});
    assert.equal(remembered.appearance,'girl');assert.equal(remembered.bodyId,'female2');
    assert.deepEqual(photoHeadOutfitPreference(head(task.id),(await io.page()).rows[0]),{appearance:'girl',bodyId:'female2'});
    const edited={...head(task.id),frames:structuredClone(head(task.id).frames)};edited.frames[0].neck[0]+=1;
    await io.save({id:task.id},edited,{edit:true,preview});
    const row=(await io.page()).rows[0];
    assert.equal(row.appearance,'girl');assert.equal(row.bodyId,'female2');
    await f.service.open();await f.service.rememberOutfit(task.id,{appearance:'boy',bodyId:'male'});
    assert.equal(f.service.state.busy,false,'remembering outfit must not hold the generation busy lock');
    assert.deepEqual(photoHeadOutfitPreference(head(task.id),(await f.service.list()).rows[0]),{appearance:'boy',bodyId:'male'});
});

test('reopen and library adjust stay usable after remembering outfit',async()=>{
    const f=serviceFixture();f.setVip(true);const io=await f.workspace.connect(),task={id:'photo-reapply-boy',vip:true,appearance:'boy'};
    await io.reserve(task);await io.save(task,head(task.id),{preview});
    await f.service.open();
    const row=(await f.service.list()).rows[0];
    const selected=await f.service.select(row);
    await f.service.rememberOutfit(selected.id,{appearance:'boy',bodyId:'male'});
    assert.equal(f.service.state.busy,false);
    await f.service.open();
    assert.equal(f.service.state.head,null);
    assert.equal(f.service.state.stage,'');
    const again=await f.service.select((await f.service.list()).rows[0]);
    const frames=structuredClone(again.frames);frames[0].neck[1]+=2;
    // View may pass the selected head explicitly when service head was cleared by reopen races.
    const saved=await f.service.adjust(frames,again);
    assert.equal(saved.frames[0].neck[1],frames[0].neck[1]);
    assert.equal(f.service.state.head.id,again.id);
});

test('DIY previews load legacy heads without selecting, writing or starting generation',async()=>{
    const f=serviceFixture();const io=await f.workspace.connect();
    const task={id:'photo-legacy-boy',vip:true};await io.reserve(task);await io.save(task,head(task.id),{preview});
    const root=f.files.get('appearance/photo-heads/index.json');delete root.heads[0].preview;
    const freshWorkspace=createPhotoHeadWorkspace({getOwner:()=> 'tester',loadSDK:async()=>f.sdk});
    const reads=[];const original=f.sdk.loadPage;f.sdk.loadPage=options=>{reads.push(options.pagePath);return original(options);};
    const service=createPhotoHeadService({...f.options,workspace:freshWorkspace});
    assert.equal(reads.length,0,'constructing world feature does not load its library');
    await service.open();const rows=await service.list();
    assert.ok(!reads.some(p=>p.includes('/heads/')),'opening summaries has no full-head fanout');
    const writes=f.writes.length;assert.equal(await service.preview(rows.rows[0]),preview);
    const readCount=reads.length;assert.equal(await service.preview(rows.rows[0]),preview);assert.equal(reads.length,readCount);
    assert.equal(service.state.head,null);assert.equal(f.writes.length,writes);assert.deepEqual(f.counts(),{generated:0,uploads:0});
});
