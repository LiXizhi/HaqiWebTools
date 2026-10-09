import {createCloseButton} from './view_adventure_controls.js';
import {tr, fill} from './locale_runtime.js';
import {imageBitmap,compressPhoto} from './photo_head_images.js';
import {BODY_TO_HEAD,clampHead,headFrameIndex} from './hero_pose_core.js';
import {heroPortrait} from './hero_renderer.js';
import {randomHeroHeadId} from './hero_body_core.js';
import {offsetPhotoHeadPose,validatePhotoHeadPreview,publicPhotoHead,photoHeadOutfitPreference} from './photo_head_core.js';
const node=(tag,text='',className='')=>{const n=document.createElement(tag);if(text)n.textContent=tr(text);n.className=className;return n;};
const button=(text,fn,cls='secondary')=>{const n=node('button',text,cls);n.type='button';n.onclick=fn;return n;};
const labeled=(text,input)=>{const label=node('label',text);label.append(input);return label;};
export function openPhotoHeadView({service,assets,draft,onApply,onLogin,getOwner,shell}) {
    const styleURL=new URL('../css/photo_head.css?v=20261007-look-controls',import.meta.url).href;
    let styleLink=document.querySelector('link[data-photo-head-style]');if(!styleLink){styleLink=node('link');styleLink.rel='stylesheet';styleLink.dataset.photoHeadStyle='1';document.head.append(styleLink);}if(styleLink.href!==styleURL)styleLink.href=styleURL;
    draft={...draft,headChoices:{...draft.headChoices},bodyChoices:{...draft.bodyChoices}};
    if(draft.headId)draft.headChoices[draft.appearance]=draft.headId;
    const headChoiceSeed=Date.now();
    const trigger=shell?.trigger||document.activeElement,dialog=shell?.dialog||node('dialog'),header=node('header','','modal-header'),body=node('div','','modal-body');
    dialog.className='photo-head-dialog';dialog.setAttribute('aria-label',tr('照片生成形象'));header.append(node('h2','照片生成形象'),createCloseButton(close,'关闭照片生成形象'));dialog.replaceChildren(header,body);
    if(shell)shell.close=close;
    let stream=null,bitmap=null,rotation=0,zoom=1,dx=0,dy=0,disposed=false,raf=0,preview=null,current=null,frames=null,page=0,viewEpoch=0,photoEpoch=0;
    let entitlement=null,ready=false,localError='',viewStep=0,starting=false;
    const status=node('p','','photo-head-status');status.setAttribute('role','status');
    const policy=node('p','照片交给 AI 变身，仅卡通形象公开。','photo-head-policy muted');
    const quota=node('span','','photo-head-quota'),gate=node('p','','muted'),controls=node('div','','photo-head-actions');
    header.firstChild.append(quota);
    const steps=node('ol','','photo-head-steps'),stepButtons=[];
    for(const [i,text] of ['选照片','变身','校准'].entries()){
        const item=node('li'),jump=button(text,()=>navigate(i),'photo-head-step');stepButtons.push(jump);item.append(jump);steps.append(item);
    }
    function navigate(step){if(starting||service.state.busy)return;stopCamera();viewStep=step;if(step===1&&!bitmap&&current){viewStep=2;}paint();body.scrollTop=0;}
    const editor=node('section','','photo-head-editor'),empty=node('div','','photo-head-empty');
    const outfitPortrait=node('div');outfitPortrait.append(heroPortrait(assets,draft,112,130));
    empty.append(outfitPortrait);
    const meter=node('progress');meter.max=100;meter.hidden=true;meter.setAttribute('aria-label',tr('形象保存进度'));
    const file=node('input');file.type='file';file.accept='image/jpeg,image/png,image/webp';file.hidden=true;
    const video=node('video');video.autoplay=true;video.playsInline=true;video.muted=true;video.hidden=true;
    const crop=node('canvas','','photo-head-crop');crop.width=crop.height=512;crop.hidden=true;crop.setAttribute('aria-label',tr('拖动调整照片位置'));
    const scale=node('input');scale.type='range';scale.min='1';scale.max='3';scale.step='.01';scale.value='1';scale.oninput=()=>zoomAt(Number(scale.value));
    const edit=node('div','','photo-head-actions');edit.hidden=true;
    async function startGeneration(){
        if(starting||service.state.busy||!ready||!bitmap||!service.state.enabled||entitlement?.allowed!==true)return;
        starting=true;localError='';viewStep=1;stopCamera();paint();body.scrollTop=0;
        try{const blob=await compressPhoto(drawCrop(512));if(disposed)return;await service.generate({blob,appearance:draft.appearance});}
        catch(e){showError(e);}finally{starting=false;paint();}
    }
    const upload=button('上传照片',()=>file.click()),camera=button('拍摄照片',async()=>{
        stopCamera();const ticket=++photoEpoch;
        try{
            const next=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:false});
            if(disposed||ticket!==photoEpoch){next.getTracks().forEach(t=>t.stop());return;}
            stream=next;video.srcObject=stream;video.hidden=false;snap.hidden=false;await video.play();
        }catch{showError(Error('无法打开摄像头，请允许相机权限或上传照片。'));}
    });
    const snap=button('拍下照片',async()=>{try{const canvas=node('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;canvas.getContext('2d').drawImage(video,0,0);stopCamera();await useBitmap(await createImageBitmap(canvas));}catch(e){showError(e);}});snap.hidden=true;
    controls.append(camera,upload,snap,file);
    edit.append(labeled('缩放',scale),button('旋转90°',()=>{rotation=(rotation+1)%4;dx=dy=0;drawCrop();}),button('重置',()=>{rotation=0;zoom=1;dx=dy=0;scale.value='1';drawCrop();}));
    const recovery=node('div','','photo-head-actions');
    const resume=button('继续处理和保存',async()=>{try{viewStep=1;await service.retry();showHead(service.state.head);await refreshQuota();await loadPage(0);}catch(e){showError(e);}});
    const abandon=button('放弃上次任务',async()=>{try{await service.abandon();await refreshQuota();}catch(e){showError(e);}});recovery.append(resume,abandon);
    const library=node('details'),list=node('div','','photo-head-library'),pager=node('div','','photo-head-actions'),libraryCount=node('p','','muted');library.hidden=true;library.open=true;library.append(node('summary','我的形象'),libraryCount,list,pager);
    const result=node('section','','photo-head-result');result.hidden=true;
    function fittedHead(head){const gender=draft.appearance==='girl'?'female':'male';return publicPhotoHead({...head,gender,id:head.id.replace(/-(boy|girl)$/,'-'+draft.appearance)});}
    function syncOutfit(head,outfit){
        const preferred=photoHeadOutfitPreference(head,outfit);
        if(draft.appearance!==preferred.appearance){draft.bodyChoices[draft.appearance]=draft.bodyId;draft.appearance=preferred.appearance;}
        if(preferred.bodyId)draft.bodyChoices[preferred.appearance]=preferred.bodyId;
        draft.bodyId=draft.bodyChoices[preferred.appearance];
        refreshOutfit();
    }
    function applyOutfit(head){
        const fitted=fittedHead(head),outfit={appearance:draft.appearance,bodyId:draft.bodyId};
        // Remember last body gender for this library entry; failure must not block applying.
        void service.rememberOutfit?.(head.id,outfit).catch(()=>{});
        onApply(fitted,outfit);
    }
    const outfitButtons=[],genderButtons=[];let bodies=[];
    function refreshOutfit(){
        const gender=draft.appearance==='girl'?'female':'male';
        bodies=[[gender,{name:'经典蓝金'}],...Object.entries(assets.hero.manifest.bodyVariants||{}).filter(([,b])=>b.gender===gender&&!b.recommendedHeadId)];
        if(!bodies.some(([id])=>id===draft.bodyId))draft.bodyId=gender;
        for(const {value,b} of genderButtons)b.setAttribute('aria-pressed',String(value===draft.appearance));
        for(const {delta,b} of outfitButtons)b.title=tr(delta<0?'上一套服装':'下一套服装')+' · '+tr(bodies.find(([id])=>id===draft.bodyId)?.[1].name||'');
    }
    function dressingRoom(portrait){
        const room=node('div','','photo-head-dressing'),genders=node('div','','photo-head-genders');
        for(const [value,label,symbol] of [['boy','男主角','♂'],['girl','女主角','♀']]){
            const b=button(symbol,()=>{if(service.state.busy||draft.appearance===value)return;draft.bodyChoices[draft.appearance]=draft.bodyId;draft.appearance=value;draft.bodyId=draft.bodyChoices[value];
                if(!current){draft.headId=draft.headChoices[value]||randomHeroHeadId(assets.hero.manifest,value,headChoiceSeed);draft.headChoices[value]=draft.headId;draft.customHead=draft.customHeadChoices?.[value]?.id===draft.headId?draft.customHeadChoices[value]:undefined;}
                refreshOutfit();redrawOutfit();},'photo-head-gender');
            b.setAttribute('aria-label',tr(label));b.title=tr(label);genderButtons.push({value,b});genders.append(b);
        }
        room.append(genders,portrait);
        for(const delta of [-1,1]){
            const b=button(delta<0?'‹':'›',()=>{if(service.state.busy)return;const i=bodies.findIndex(([id])=>id===draft.bodyId);draft.bodyId=bodies[(i+delta+bodies.length)%bodies.length][0];refreshOutfit();redrawOutfit();},'photo-head-costume-arrow '+(delta<0?'is-prev':'is-next'));
            b.setAttribute('aria-label',tr(delta<0?'上一套服装':'下一套服装'));outfitButtons.push({delta,b});room.append(b);
        }
        return room;
    }
    function redrawOutfit(){
        if(current)updatePreview();
        const head=current?fittedHead({...current,frames}):draft.customHead||null;
        outfitPortrait.replaceChildren(heroPortrait(assets,{...draft,...(head?{headId:head.id,customHead:head}:{})},112,130));
        if(current){confirmed.clear();calibrationStep=0;setFacing(0);}paint();
    }
    empty.replaceChildren(dressingRoom(outfitPortrait));
    refreshOutfit();
    const stage=node('canvas','','photo-head-preview');stage.width=300;stage.height=300;
    let previewFacing=0,previewHead=0,lastDraw=null,headDrag=null,lastPreviewTime=0,calibrationStep=0;
    const confirmed=new Set();
    let calibrationOrder=[0,1,3,2],directionNames=['朝前','朝左','朝后','朝右'];
    const previewFrame=()=>headFrameIndex(current?.directionCount??16,previewFacing,previewHead);
    const motion=button('',()=>{motion.value=motion.value==='walk'?'idle':'walk';paintMotion();},'photo-head-motion');
    motion.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="14" cy="4" r="2"/><path d="m7 21 3-6-1-4m7 10-2-7-3-3 1-4m-6 6 3-5 3-1 3 5 4 1"/></svg>';
    function paintMotion(){const walking=motion.value==='walk';motion.setAttribute('aria-pressed',String(walking));motion.setAttribute('aria-label',tr('走路'));motion.title=tr(walking?'站立':'走路');}
    motion.value='walk';paintMotion();
    const facingControls=node('div','','photo-head-actions'),facingButtons=[],lookButtons=[];
    function paintLook(){for(const {delta,b} of lookButtons){b.hidden=current?.directionCount===4;b.disabled=b.hidden||service.state.busy||clampHead(previewHead+delta,previewFacing)===previewHead;}}
    function setHead(index){previewHead=(index+16)%16;paintLook();}
    function setFacing(facing){previewFacing=facing;setHead(BODY_TO_HEAD[facing]);facingButtons.forEach(({value,b})=>b.setAttribute('aria-pressed',String(value===facing)));}
    for(const [value,label] of [[0,'朝前'],[1,'朝左'],[3,'朝后'],[2,'朝右']]){const b=button(label,()=>{if(service.state.busy)return;const target=calibrationOrder.indexOf(value);if(target!==calibrationStep&&(!confirmed.has(calibrationStep)||target>confirmed.size))return;calibrationStep=target;setFacing(value);paintCalibration();});b.setAttribute('aria-pressed',String(value===0));facingButtons.push({value,b});facingControls.append(b);}
    const sheet=node('img');sheet.alt=tr('完整16方向图集');sheet.className='photo-head-sheet';
    const detail=node('details');detail.append(node('summary','查看完整图集'),sheet);
    const calibration=node('div','','photo-head-calibration');
    function moveHead(x,y){
        if(!current||service.state.busy)return;
        // Display translation and attachment-coordinate offsets have opposite signs.
        frames=offsetPhotoHeadPose(frames,previewFrame(),BODY_TO_HEAD[previewFacing],-x,-y,current.width/(current.directionCount===4?2:4));
        confirmed.delete(calibrationStep);
        updatePreview();paintCalibration();
    }
    async function saveCalibration(){if(current&&JSON.stringify(frames)!==JSON.stringify(current.frames)){current=await service.adjust(frames,current);showHead(current,{activate:false});}return current;}
    const calibrationStatus=node('p','','photo-head-calibration-status');calibrationStatus.setAttribute('aria-live','polite');
    const confirmDirection=button('校准，下一个',async()=>{
        if(service.state.busy)return;
        try{localError='';await saveCalibration();confirmed.add(calibrationStep);
            if(confirmed.size<4){calibrationStep=[1,2,3,4].map(n=>(calibrationStep+n)%4).find(n=>!confirmed.has(n));setFacing(calibrationOrder[calibrationStep]);}
            paintCalibration();paint();
        }catch(e){showError(e);}
    },'primary');
    function paintCalibration(){
        const complete=confirmed.size===4;
        calibrationStatus.textContent=complete?`${tr('已校准')} · 4/4`: `${calibrationStep+1}/4 · ${tr(directionNames[calibrationStep])}`;
        confirmDirection.hidden=complete;
        confirmDirection.textContent=tr(confirmed.size===3?'完成四向校准':'校准，下一个');
        facingButtons.forEach(({value,b})=>{const i=calibrationOrder.indexOf(value),done=confirmed.has(i);
            b.replaceChildren(node('span',directionNames[i]));
            if(done){const tick=node('span','✓','photo-head-complete-mark');tick.setAttribute('aria-label',tr('已校准'));b.append(tick);}
            b.classList.toggle('is-confirmed',done);
            b.disabled=service.state.busy||(i!==calibrationStep&&(!confirmed.has(calibrationStep)||i>confirmed.size));
        });
        apply.disabled=service.state.busy||!complete;
    }
    calibration.append(confirmDirection);

    stage.setAttribute('aria-label',tr('拖动头部，调整与身体的位置'));stage.tabIndex=0;
    const stagePoint=e=>{const r=stage.getBoundingClientRect();return {x:(e.clientX-r.left)*300/r.width,y:(e.clientY-r.top)*300/r.height};};
    stage.onpointerdown=e=>{
        if(e.button!==0||headDrag||service.state.busy||!lastDraw?.ready||!lastDraw.headRect)return;
        const p=stagePoint(e),r=lastDraw.headRect;
        if(p.x<150+r.x||p.x>150+r.x+r.w||p.y<275+r.y||p.y>275+r.y+r.h)return;
        e.preventDefault();headDrag={...p,id:e.pointerId,time:lastPreviewTime,scale:r.w/frames[previewFrame()].crop[2]};stage.setPointerCapture(e.pointerId);
    };
    stage.onpointermove=e=>{if(headDrag?.id!==e.pointerId)return;e.preventDefault();const p=stagePoint(e);moveHead((p.x-headDrag.x)/headDrag.scale,(p.y-headDrag.y)/headDrag.scale);headDrag.x=p.x;headDrag.y=p.y;};
    const endDrag=e=>{if(headDrag?.id===e.pointerId)headDrag=null;};stage.onpointerup=stage.onpointercancel=stage.onlostpointercapture=endDrag;

    const strength=node('input');strength.type='range';strength.min='0';strength.max='2';strength.step='.1';strength.value='1';
    const clean=button('重新去背景',async()=>{try{await service.reprocess(Number(strength.value));showHead(service.state.head);}catch(e){showError(e);}});
    const apply=button('使用这个形象',async()=>{
        if(!current){showError(Error('请先选择形象'));return;}
        if(service.state.busy){showError(Error('请等待当前形象任务完成'));return;}
        if(confirmed.size<4){showError(Error('请先完成四向校准'));return;}
        try{if(current.owner!==getOwner())throw Error('账号已切换，请重新打开形象窗口');const saved=await saveCalibration();if(disposed)return;applyOutfit(saved);close();}catch(e){showError(e);}
    },'primary');
    const background=node('details');background.append(node('summary','调整背景'),labeled('去底强度（0为保留透明原图）',strength),clean);
    const resultActions=node('div','','photo-head-actions');resultActions.append(apply,button('再选照片',()=>navigate(0)),button('暂不使用',close));
    const workbench=node('div','','photo-head-workbench'),previewColumn=node('div','','photo-head-preview-column'),turnColumn=node('div','','photo-head-turn-column');
    const previewStage=node('div','','photo-head-preview-stage');previewStage.append(stage,motion);
    for(const [delta,label,side] of [[1,'向左看','left'],[-1,'向右看','right']]){
        const b=button('',()=>{if(service.state.busy||headDrag)return;setHead(clampHead(previewHead+delta,previewFacing));},'photo-head-look is-'+side);
        b.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${delta>0?'m14 6-6 6 6 6M8 12h12':'m10 6 6 6-6 6M4 12h12'}"/></svg>`;
        b.setAttribute('aria-label',tr(label));b.title=tr(label);lookButtons.push({delta,b});previewStage.append(b);
    }
    previewColumn.append(dressingRoom(previewStage),calibration);refreshOutfit();
    turnColumn.append(calibrationStatus,facingControls);
    workbench.append(previewColumn,turnColumn);
    result.append(node('p','拖动头部，调整与身体的位置','photo-head-saved'),workbench,resultActions,detail,background);
    const cropFrame=node('div','','photo-head-crop-frame');cropFrame.append(crop);
    // Decorative guide is separate from the canvas: never included in the AI input.
    const guide=document.createElementNS('http://www.w3.org/2000/svg','svg'),outline=document.createElementNS('http://www.w3.org/2000/svg','path');
    guide.setAttribute('viewBox','0 0 512 512');guide.setAttribute('aria-hidden','true');guide.classList.add('photo-head-guide');
    outline.setAttribute('d','M256 48 C184 48 138 100 136 190 L136 222 C113 205 108 230 117 266 C121 285 135 290 142 282 C153 349 184 403 226 425 Q256 442 286 425 C328 403 359 349 370 282 C377 290 391 285 395 266 C404 230 399 205 376 222 L376 190 C374 100 328 48 256 48 Z');guide.append(outline);cropFrame.append(guide);
    const hint=node('p','拖动、缩放，保留头发和下巴','photo-head-hint muted');hint.hidden=true;
    const help=node('details','','photo-head-help');help.append(node('summary','使用说明'),node('p','照片生成形象为会员专属；会员不限次数，最多保留10个形象。照片仅用于 AI 生成，原照不会上传公开 CDN。'));
    const next=button('下一步：变身',startGeneration,'primary'),back=button('返回选照片',()=>navigate(0));
    const processing=node('section','','photo-head-processing'),orb=node('div','','photo-head-processing-orb');orb.setAttribute('aria-hidden','true');
    const processingTitle=node('strong','小英雄正在变身…'),processingDetail=node('p','','photo-head-transfer muted');
    processingDetail.setAttribute('aria-live','polite');processing.append(orb,processingTitle,processingDetail);processing.hidden=true;
    editor.append(empty,controls,video,cropFrame,hint,edit,next,policy);
    body.append(steps,gate,editor,processing,status,meter,back,recovery,result,library,help);
    const login=button('登录 Keepwork 云端账号',async()=>{close();await onLogin();});
    if(!getOwner()){controls.hidden=true;next.hidden=true;empty.append(login);quota.textContent=tr('会员专属');}
    let transferClock=0;
    function transferDetail(s){
        if(s.stage==='generating')return tr('生成通常需要90–120秒，进度为预计进度。');
        if(s.stage==='uploading'){
            return s.progress!=null
                ? fill('上传进度 {progress}%',{progress:String(s.progress)}).text
                : tr('正在上传…');
        }
        return '';
    }
    function syncTransferClock(active){
        if(active&&!transferClock)transferClock=setInterval(()=>{if(!disposed)paint();},1000);
        if(!active&&transferClock){clearInterval(transferClock);transferClock=0;}
    }
    file.onchange=async()=>{const selected=file.files?.[0];file.value='';if(!selected)return;stopCamera();const ticket=++photoEpoch;
        try{if(!['image/jpeg','image/png','image/webp'].includes(selected.type)||selected.size>10000000)throw Error('请选择不超过10MB的JPEG、PNG或WebP照片');
            const image=await imageBitmap(selected);if(disposed||ticket!==photoEpoch){image.close();return;}await useBitmap(image);
        }catch(e){showError(e);}};
    const pointers=new Map();
    function point(e){const r=crop.getBoundingClientRect();return {x:(e.clientX-r.left)*512/r.width,y:(e.clientY-r.top)*512/r.height};}
    function gesture(){const [a,b]=pointers.values();return b?{x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.hypot(a.x-b.x,a.y-b.y)}:{...a,distance:0};}
    function zoomAt(value,from={x:256,y:256},to=from){
        if(!bitmap)return;
        const next=Math.max(Number(scale.min),Math.min(Number(scale.max),value)),ratio=next/zoom;
        dx=to.x-256-(from.x-256-dx)*ratio;dy=to.y-256-(from.y-256-dy)*ratio;
        zoom=next;scale.value=String(zoom);drawCrop();
    }
    crop.onpointerdown=e=>{if(!bitmap||e.button!==0||pointers.size>=2)return;e.preventDefault();pointers.set(e.pointerId,point(e));crop.setPointerCapture(e.pointerId);};
    crop.onpointermove=e=>{if(!pointers.has(e.pointerId))return;e.preventDefault();const before=gesture();pointers.set(e.pointerId,point(e));const after=gesture();zoomAt(before.distance>0?zoom*after.distance/before.distance:zoom,before,after);};
    const release=e=>pointers.delete(e.pointerId);
    crop.onpointerup=crop.onpointercancel=crop.onlostpointercapture=release;
    crop.addEventListener('wheel',e=>{
        if(!bitmap)return;e.preventDefault();e.stopPropagation();
        const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?crop.clientHeight:1);
        zoomAt(zoom*Math.exp(-Math.max(-250,Math.min(250,delta))*.002),point(e));
    },{passive:false});
    function showError(e){if(!disposed){localError=e.message||'操作未完成，请重试';status.hidden=false;status.textContent=tr(localError);}}
    function stopCamera(){photoEpoch++;stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;video.hidden=true;snap.hidden=true;}
    async function useBitmap(next){if(disposed){next.close();return;}localError='';viewStep=0;bitmap?.close();bitmap=next;rotation=0;zoom=1;dx=dy=0;scale.value='1';crop.hidden=edit.hidden=false;drawCrop();paint();}
    function drawCrop(size=512){
        if(!bitmap)return;
        const canvas=size===512?crop:node('canvas');canvas.width=canvas.height=size;
        const w=rotation%2?bitmap.height:bitmap.width,h=rotation%2?bitmap.width:bitmap.height,s=Math.max(512/w,512/h)*zoom;
        dx=Math.max(-(w*s-512)/2,Math.min((w*s-512)/2,dx));dy=Math.max(-(h*s-512)/2,Math.min((h*s-512)/2,dy));
        const ctx=canvas.getContext('2d');ctx.scale(size/512,size/512);ctx.translate(256+dx,256+dy);ctx.rotate(rotation*Math.PI/2);ctx.scale(s,s);ctx.drawImage(bitmap,-bitmap.width/2,-bitmap.height/2);return canvas;
    }
    async function refreshQuota(){entitlement=await service.entitlement();if(disposed)return;quota.textContent=tr(entitlement.vip?'会员无限次':'需要开通会员');if(entitlement.total>=10)quota.textContent+=` · ${tr('形象已满，请先删除')}`;paint();}
    async function loadPage(cursor){
        const ticket=++viewEpoch,rows=await service.list(cursor);if(disposed||ticket!==viewEpoch)return;page=cursor;list.replaceChildren();pager.replaceChildren();
        libraryCount.textContent=`${rows.total??rows.rows.length}/10`;
        for(const row of rows.rows){
            const card=node('div','','photo-head-library-card');
            const choose=button('',async()=>{if(service.state.busy)return;try{const saved=await service.select(row);if(disposed)return;if(saved.owner!==getOwner())throw Error('账号已切换，请重新打开形象窗口');stopCamera();showHead(saved,{outfit:photoHeadOutfitPreference(saved,row)});body.scrollTop=0;}catch(e){showError(e);}},'photo-head-library-avatar');
            choose.setAttribute('aria-label',tr('校准这个形象'));choose.title=tr('校准这个形象');
            choose.disabled=service.state.busy;
            const renderPreview=value=>{const img=node('img');img.src=validatePhotoHeadPreview(value);img.alt=tr('正面头像');img.width=img.height=96;choose.replaceChildren(img);};
            let hasPreview=false;if(row.preview){try{renderPreview(row.preview);hasPreview=true;}catch{}}
            if(!hasPreview){
                choose.append(node('span','正在加载头像…'));
                void service.preview(row).then(value=>{if(!disposed&&ticket===viewEpoch)renderPreview(value);}).catch(()=>{if(!disposed&&ticket===viewEpoch)choose.replaceChildren(node('span','预览不可用'));});
            }
            const remove=button('',async()=>{if(service.state.busy)return;try{await service.remove(row);if(disposed)return;if(current?.id===row.id){current=preview=frames=null;sheet.removeAttribute('src');}await refreshQuota();await loadPage(0);paint();}catch(e){showError(e);}},'photo-head-library-delete');remove.setAttribute('aria-label',tr('删除这个形象'));remove.title=tr('删除这个形象');const mark=node('span','×');mark.setAttribute('aria-hidden','true');remove.append(mark);remove.disabled=service.state.busy;
            card.append(choose,remove);list.append(card);
        }
        library.hidden=false;
        if(page>0)pager.append(button('上一页',()=>loadPage(page-1).catch(showError)));if(rows.next!==null)pager.append(button('下一页',()=>loadPage(rows.next).catch(showError)));
    }
    function updatePreview(){
        if(!current){preview=null;return;}
        preview=fittedHead({...current,frames:structuredClone(frames)});
        // Keep the fitted alias registered so async ensure/prepare cannot miss it between frames.
        assets.hero?.registerHead?.(preview);
    }
    function showHead(value,{activate=true,calibrated=false,outfit}={}){
        if(disposed||!value)return;const changed=current?.id!==value.id;if(activate)viewStep=2;
        current=value;
        calibrationOrder=value.directionCount===4?[0,3,1,2]:[0,1,3,2];
        directionNames=value.directionCount===4?['朝前','朝后','朝左','朝右']:['朝前','朝左','朝后','朝右'];
        for(const facing of calibrationOrder)facingControls.append(facingButtons.find(entry=>entry.value===facing).b);
        sheet.alt=tr(value.directionCount===4?'完整4方向图集':'完整16方向图集');
        frames=structuredClone(value.frames);syncOutfit(value,outfit);updatePreview();sheet.src=value.cdn;
        if(preview)void assets.hero?.ensure?.({gender:preview.gender,headId:preview.id,bodyId:draft.bodyId});
        if(changed){confirmed.clear();calibrationStep=0;setFacing(0);motion.value='walk';paintMotion();}
        if(calibrated){for(let i=0;i<4;i++)confirmed.add(i);}paint();
    }
    function paint(){if(disposed)return;const s=service.state;for(const b of list.querySelectorAll('button'))b.disabled=s.busy||(b.dataset.gender&&b.dataset.gender!==(draft.appearance==='girl'?'female':'male'));gate.hidden=!ready||s.enabled;gate.textContent=s.enabled?'':tr(s.disabledReason);next.disabled=!ready||!bitmap||starting||s.busy||!s.enabled||entitlement?.allowed!==true;
        empty.hidden=!!bitmap;hint.hidden=!bitmap;cropFrame.hidden=!bitmap;
        editor.hidden=viewStep!==0;result.hidden=!current||viewStep!==2;processing.hidden=viewStep!==1||(!starting&&!s.busy);library.hidden=viewStep===1;help.hidden=viewStep===1;
        next.hidden=viewStep!==0||!getOwner();back.hidden=viewStep!==1||starting||s.busy;back.disabled=starting||s.busy;
        const step=viewStep;[...steps.children].forEach((n,i)=>{n.classList.toggle('active',i===step);const b=stepButtons[i];b.disabled=starting||s.busy||i===1&&viewStep!==1||i===2&&!current;i===step?b.setAttribute('aria-current','step'):b.removeAttribute('aria-current');});
        const working=starting||s.busy;syncTransferClock(working&&(s.stage==='generating'||s.stage==='uploading'||!s.stage&&starting));
        meter.hidden=!working;
        meter.setAttribute('aria-label',tr(s.stage==='generating'?'形象生成预计进度':'形象保存进度'));
        if(s.stage==='generating'){
            // Time estimate only: no stream data is normal during image generation.
            // Never claim completion before the server returns a result.
            meter.value=Math.min(99,Math.max(0,(Date.now()-(s.transferStartedAt??Date.now()))/120000*100));
        }else if(s.progress==null)meter.removeAttribute('value');else meter.value=s.progress;
        const detail=transferDetail(s);processingDetail.hidden=!detail;processingDetail.textContent=detail;
        dialog.classList.toggle('is-working',working);status.hidden=!localError&&!s.error&&!s.busy&&!starting;
        for(const {b} of [...genderButtons,...outfitButtons])b.disabled=s.busy;upload.disabled=camera.disabled=s.busy;resume.disabled=s.busy||!s.job?.hasSource;recovery.hidden=starting||s.busy||!ready||s.job?.saved===true||!s.job&&!s.status.includes('中断');abandon.disabled=s.busy;
        clean.disabled=s.busy||!s.job?.hasSource||s.job.id!==current?.id;apply.disabled=s.busy;confirmDirection.disabled=s.busy;paintCalibration();paintLook();
        status.textContent=tr(localError||s.error||s.status||'')+(s.stage==='uploading'&&s.progress!==null?` ${s.progress}%`:'');
    }
    function animate(t){if(disposed)return;raf=requestAnimationFrame(animate);if(!preview||document.hidden)return;
        const hero=assets.hero,appearance={gender:preview.gender,headId:preview.id,bodyId:draft.bodyId};
        lastPreviewTime=headDrag?.time??t;const head=previewHead,facing=previewFacing;stage.dataset.head=String(head);stage.dataset.facing=String(facing);
        const ctx=stage.getContext('2d');ctx.clearRect(0,0,300,300);
        hero.ensure(appearance);lastDraw=hero.draw(ctx,appearance,{x:150,y:275,size:180,facing,head,time:lastPreviewTime/1000,moving:motion.value==='walk',breath:{x:0,y:0,angle:0}});
    }
    const unsubscribe=service.subscribe(()=>{
        const state=service.state;
        // Only clear local errors when a new head arrives; never wipe a just-shown apply failure.
        if(!disposed&&ready&&!state.busy&&state.head&&current!==state.head){localError='';showHead(state.head,{activate:state.stage==='done'});void Promise.all([refreshQuota(),loadPage(0)]).catch(showError);}
        paint();
    });
    function close(){if(disposed)return;disposed=true;syncTransferClock(false);stopCamera();bitmap?.close();bitmap=null;unsubscribe();cancelAnimationFrame(raf);dialog.close();dialog.remove();trigger?.isConnected&&trigger.focus();}
    dialog.addEventListener('cancel',e=>{e.preventDefault();e.stopPropagation();close();});dialog.addEventListener('keydown',e=>e.stopPropagation());
    dialog.addEventListener('close',close,{once:true});
    if(!dialog.open){document.body.append(dialog);dialog.showModal();}raf=requestAnimationFrame(animate);paint();
    if(getOwner())void service.open().then(async()=>{if(disposed)return;ready=true;await refreshQuota();await loadPage(0);if(service.state.head)showHead(service.state.head,{activate:false});paint();}).catch(showError);
    return {close};
}
