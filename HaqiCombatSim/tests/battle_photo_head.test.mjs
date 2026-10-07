import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publicPhotoHead,scaleHeadFrames,photoHeadPrompt,photoHeadQuota,offsetPhotoHeadRow,offsetPhotoHeadFrame,offsetPhotoHeadPose} from '../js/photo_head_core.js';
import {removeHeadBackground,checkHeadPixels} from '../js/photo_head_pixels_core.js';
import {createAdventure,applyAction,parseSave} from '../js/adventure_core.js';
import {heroCustomizeQuote} from '../js/adventure_hero_customize_core.js';
import {checkedProgress} from '../js/adventure_cloud_core.js';
import {splitRoleSave,joinRoleSave} from '../js/adventure_storage_core.js';
import {validatePublicProfile} from '../js/adventure_social_core.js';
import {HeroRenderer} from '../js/hero_renderer.js';
const json=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url)));
const template=json('data/hero-preview.json').heads['elf-boy'],content=json('data/adventure/chapter.json');
export const makeHead=(id='photo-one-boy')=>({version:1,id,owner:'tester',gender:'male',cdn:`https://cdn.keepwork.com/users/tester/${id}.webp`,sha256:'a'.repeat(64),bytes:12345,width:576,height:576,directionCount:16,frames:scaleHeadFrames(template,576)});
test('visual calibration moves the selected row while preserving its per-frame geometry and boundaries',()=>{
    const frames=scaleHeadFrames(template,576),original=structuredClone(frames);
    for(let row=0;row<4;row++){
        const next=offsetPhotoHeadRow(frames,row,-1,-1,144);
        for(let i=0;i<16;i++){
            assert.deepEqual(next[i].crop,frames[i].crop);assert.equal(next[i].height,frames[i].height);
            assert.deepEqual(next[i].neck,frames[i].neck.map(n=>n-(Math.floor(i/4)===row?1:0)));
        }
        const limit=offsetPhotoHeadRow(frames,row,10000,-10000,144);
        assert.ok(limit.every(f=>f.neck.every(n=>n>=0&&n<=144)));
        assert.equal(limit[row*4+1].neck[1]-limit[row*4].neck[1],frames[row*4+1].neck[1]-frames[row*4].neck[1]);
    }
    assert.deepEqual(frames,original);
});
test('default poses synchronize their group, while left/right turns only move the selected pose',()=>{
    for(const base of [0,4,8,12]){
        const original=scaleHeadFrames(template,576);
        let frames=offsetPhotoHeadPose(original,base,base,1,-1,144);
        frames.forEach((f,i)=>assert.deepEqual(f.neck,Math.floor(i/4)===base/4
            ?[original[i].neck[0]+1,original[i].neck[1]-1]:original[i].neck));
        // Include turns crossing atlas rows, especially front -> frames 15/14.
        for(const turn of [1,2,-1,-2]){
            const index=(base+turn+16)%16,before=structuredClone(frames);
            frames=offsetPhotoHeadPose(frames,index,base,-1,1,144);
            frames.forEach((f,i)=>assert.deepEqual(f,i===index
                ?{...before[i],neck:[before[i].neck[0]-1,before[i].neck[1]+1],offsetAdjusted:true}:before[i]));
        }
        const saved=publicPhotoHead({...makeHead(),frames});
        assert.deepEqual(saved.frames,frames,'saving keeps each independently adjusted pose');
        const recentered=offsetPhotoHeadPose(frames,base,base,1,0,144);
        recentered.forEach((f,i)=>assert.deepEqual(f.neck,Math.floor(i/4)===base/4&&(i===base||!frames[i].offsetAdjusted)
            ?[frames[i].neck[0]+1,frames[i].neck[1]]:frames[i].neck));
    }
});
test('front-side-front-side edits protect manual offsets across saving and loading',()=>{
    let head=makeHead();
    const original=structuredClone(head.frames);
    head.frames=offsetPhotoHeadPose(head.frames,0,0,2,-2,144);
    assert.equal(head.frames[1].offsetAdjusted,undefined,'inherited movement is not a manual edit');
    head.frames=offsetPhotoHeadPose(head.frames,1,0,3,1,144);
    const side=structuredClone(head.frames[1]);
    const save=createAdventure(content,{headId:head.id,customHead:head});
    head=parseSave(JSON.stringify(save),content).customHead;
    head.frames=offsetPhotoHeadPose(head.frames,0,0,-1,2,144);
    assert.deepEqual(head.frames[1],side,'front must preserve the saved side calibration');
    for(const i of [0,2,3])assert.deepEqual(head.frames[i].neck,[original[i].neck[0]+1,original[i].neck[1]]);
    const before=structuredClone(head.frames);
    head.frames=offsetPhotoHeadPose(head.frames,1,0,-1,-1,144);
    head.frames.forEach((f,i)=>assert.deepEqual(f,i===1?{...side,neck:[side.neck[0]-1,side.neck[1]-1]}:before[i]));
    assert.equal(scaleHeadFrames(head,1152)[1].offsetAdjusted,true);
    const invalid=structuredClone(head);invalid.frames[1].offsetAdjusted='yes';
    assert.throws(()=>publicPhotoHead(invalid),/校准标记/);
});
test('cross-row manual offsets do not constrain later group moves; no-op drags do not lock poses',()=>{
    let frames=scaleHeadFrames(template,576);
    frames=offsetPhotoHeadPose(frames,15,0,0,0,144);
    assert.equal(frames[15].offsetAdjusted,undefined);
    frames=offsetPhotoHeadPose(frames,15,0,10000,0,144);
    const side=structuredClone(frames[15]),before=structuredClone(frames);
    frames=offsetPhotoHeadPose(frames,12,12,1,0,144);
    assert.deepEqual(frames[15],side,'frame 15 was adjusted while looking right from the front');
    for(const i of [12,13,14])assert.equal(frames[i].neck[0],before[i].neck[0]+1,'protected boundary pose must not clamp untouched peers');
});
test('photo atlas retains every direction-specific neck through resizing; payload is allowlisted',()=>{
    const frames=scaleHeadFrames(template,1024);
    for(let i=0;i<16;i++)for(let axis=0;axis<2;axis++)assert.ok(Math.abs(frames[i].neck[axis]-template.frames[i].neck[axis]*1024/576)<1e-9);
    assert.notDeepEqual(frames[0].neck,frames[4].neck);
    assert.match(photoHeadPrompt(template),/第二张图/);assert.match(photoHeadPrompt(template),/不居中/);
    const clean=publicPhotoHead({...makeHead(),sourcePhoto:'secret',token:'secret',task:{}});
    assert.equal(JSON.stringify(clean).includes('secret'),false);
    for(const patch of [{cdn:'https://evil.invalid/a.webp'},{bytes:200001},{frames:[]},{gender:'female'},{width:577}])assert.throws(()=>publicPhotoHead({...makeHead(),...patch}));
});
test('edge flood fill keeps enclosed white hair, eye and tooth details and does not move the head',()=>{
    const w=64,cell=16,data=new Uint8ClampedArray(w*w*4).fill(255);
    for(let row=0;row<4;row++)for(let col=0;col<4;col++)for(let y=3;y<14;y++)for(let x=4;x<12;x++){
        const p=((row*cell+y)*w+col*cell+x)*4;data[p]=100;data[p+1]=65;data[p+2]=30;
        if(x===8&&y===7)data[p]=data[p+1]=data[p+2]=255;
    }
    const out=removeHeadBackground(data,w,w);checkHeadPixels(out,w,w);
    assert.equal(out[3],0);assert.equal(out[(7*w+8)*4+3],255);
    assert.deepEqual([...out.slice((13*w+6)*4,(13*w+6)*4+4)],[100,65,30,255]);
    assert.deepEqual(removeHeadBackground(out,w,w),out,'already transparent output must be unchanged');
    assert.equal(data[3],255,'source stays intact for retries');
    assert.throws(()=>checkHeadPixels(new Uint8ClampedArray(w*w*4),w,w));
});
test('custom heads apply for free; name/body/predefined changes retain charges and battle blocks changes',()=>{
    const save=createAdventure(content,{name:'测试',appearance:'boy',headId:'elf-boy',bodyId:'male'});
    const patch={type:'customize-hero',name:save.name,appearance:'boy',headId:'photo-one-boy',bodyId:'male',customHead:makeHead()};
    save.inventory[984]=100;
    assert.equal(heroCustomizeQuote(save,patch).total,0);applyAction(save,content,patch);assert.equal(save.inventory[984],100);
    assert.throws(()=>applyAction(save,content,patch),/没有变化/);
    const second={...patch,headId:'photo-two-boy',customHead:makeHead('photo-two-boy')};
    applyAction(save,content,second);assert.equal(save.inventory[984],100);
    applyAction(save,content,{...second,name:'新名字'});assert.equal(save.inventory[984],50);
    applyAction(save,content,{...second,name:'新名字',bodyId:'male2'});assert.equal(save.inventory[984],0);
    assert.equal(heroCustomizeQuote(save,{...second,name:'新名字',bodyId:'male2',headId:'elf-boy',customHead:undefined}).total,50);
    save.pendingEncounter={};assert.throws(()=>applyAction(save,content,second),/战斗/);
});
test('custom descriptor survives creation, strict save validation and cloud/storage projection',()=>{
    const save=createAdventure(content,{headId:'photo-one-boy',customHead:makeHead()});
    assert.deepEqual(parseSave(JSON.stringify(save),content).customHead,save.customHead);
    assert.deepEqual(checkedProgress(save,content).save.customHead,save.customHead);
    const {state,...parts}=splitRoleSave(save);assert.deepEqual(joinRoleSave(state,parts,content).customHead,save.customHead);
    const original=createAdventure(content);assert.equal(parseSave(JSON.stringify(original),content).customHead,undefined);
});
test('social art is optional, owner-scoped, and renderer does not add photos to random NPC manifests',()=>{
    const row={version:1,userId:'1',username:'tester',name:'测试',school:'fire',appearance:'boy',level:1,native:'zh',target:'en',visible:true,headId:'photo-one-boy',customHead:makeHead()};
    assert.equal(validatePublicProfile(row).customHead.id,row.headId);
    assert.equal(validatePublicProfile({...row,customHead:{...row.customHead,owner:'another'}}).customHead,undefined);
    const manifest=json('data/hero-preview.json'),hero=new HeroRenderer(manifest,{mounts:[]});
    hero.appearance(row);assert.equal(hero.headId('male',row.headId),row.headId);assert.equal(manifest.heads[row.headId],undefined);
    hero.failedHeads.add(row.headId);assert.equal(hero.headId('male',row.headId),'elf-boy');
    const first=hero.appearance(row),edited={...row.customHead,frames:structuredClone(row.customHead.frames)};edited.frames[0].neck[0]=65;
    const second=hero.appearance({...row,customHead:edited});assert.notEqual(first.headId,second.headId);
    assert.equal(hero.headArt(first.headId).frames[0].neck[0],72);assert.equal(hero.headArt(second.headId).frames[0].neck[0],65);
    assert.equal(photoHeadQuota({freeUsed:false},false).allowed,false);assert.equal(photoHeadQuota({freeUsed:true},false).allowed,false);
    assert.equal(photoHeadQuota({freeUsed:true},true).allowed,true);assert.equal(photoHeadQuota({freeUsed:false},true).allowed,true);
});

test('fine calibration changes only one frame after the four row adjustments',()=>{
    const original=scaleHeadFrames(template,576);
    let frames=original;
    for(let row=0;row<4;row++)frames=offsetPhotoHeadRow(frames,row,0,1,144);
    assert.ok(frames.every((f,i)=>f.neck[1]===original[i].neck[1]+1));
    for(let index=0;index<16;index++){
        const next=offsetPhotoHeadFrame(frames,index,-1,2,144);
        next.forEach((f,i)=>{assert.deepEqual(f.crop,frames[i].crop);assert.equal(f.height,frames[i].height);assert.deepEqual(f.neck,i===index?[frames[i].neck[0]-1,frames[i].neck[1]+2]:frames[i].neck);});
    }
    const bounded=offsetPhotoHeadFrame(frames,13,-10000,10000,144);
    assert.deepEqual(bounded[13].neck,[0,144]);assert.deepEqual(bounded[12],frames[12]);
});

test('per-frame mirroring survives public storage and resize without shifting calibrated anchors',()=>{
    const head=makeHead();head.frames[12].mirrorX=true;
    const saved=publicPhotoHead(head),scaled=scaleHeadFrames(saved,1152);
    assert.equal(saved.frames[12].mirrorX,true);assert.equal(scaled[12].mirrorX,true);
    assert.equal(saved.frames[11].mirrorX,undefined);
    assert.deepEqual(saved.frames[12].neck,head.frames[12].neck);
    assert.equal(offsetPhotoHeadRow(saved.frames,3,1,0,144)[12].mirrorX,true);
    const invalid=structuredClone(head);invalid.frames[12].mirrorX='yes';assert.throws(()=>publicPhotoHead(invalid));
    head.frames[12].mirrorX=false;assert.equal(publicPhotoHead(head).frames[12].mirrorX,undefined);
});
