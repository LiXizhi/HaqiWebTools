import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {publicPhotoHead,scaleHeadFrames,offsetPhotoHeadPose,photoHeadPrompt} from '../js/photo_head_core.js';
import {removeHeadBackground,checkHeadPixels} from '../js/photo_head_pixels_core.js';
import {headFrameIndex} from '../js/hero_pose_core.js';
import {HeroRenderer} from '../js/hero_renderer.js';
import {createAdventure,parseSave} from '../js/adventure_core.js';
import {splitRoleSave,joinRoleSave} from '../js/adventure_storage_core.js';
import {validatePublicProfile} from '../js/adventure_social_core.js';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url)));
const refs=read('data/adventure/photo-head.json').references;
const manifest=read('data/adventure/hero-art.json'),catalog=read('data/adventure/mount-catalog.json');
const content=read('data/adventure/chapter.json');
const custom=(appearance='boy')=>publicPhotoHead({...refs[appearance],version:1,id:`photo-simple-${appearance}`,owner:'tester'});

test('prepacked four-direction references preserve reviewed front/back/left/right geometry and hashes',()=>{
    for(const appearance of ['boy','girl']){
        const ref=refs[appearance],original=manifest.heads['elf-'+appearance],cell=ref.width/2;
        const bytes=readFileSync(new URL('../'+ref.local,import.meta.url));
        assert.equal(bytes.length,ref.bytes);assert.ok(bytes.length<=200000);
        assert.equal(createHash('sha256').update(bytes).digest('hex'),ref.sha256);
        assert.match(ref.cdn,/^https:\/\/cdn\.keepwork\.com\//);
        [0,8,4,12].forEach((source,i)=>{
            assert.deepEqual(ref.frames[i].neck,original.frames[source].neck);
            assert.equal(ref.frames[i].height,original.frames[source].height);
            assert.deepEqual(ref.frames[i].crop,[i%2*cell,Math.floor(i/2)*cell,cell,cell]);
        });
        assert.match(photoHeadPrompt(ref),/左上正面、右上背面、左下面朝画面左侧、右下面朝画面右侧/);
        assert.doesNotMatch(photoHeadPrompt(ref),/16方向|4列4行/);
    }
});

test('simple heads validate, resize and independently calibrate all four poses',()=>{
    const head=custom(),original=structuredClone(head.frames),scaled=scaleHeadFrames(head,576);
    for(let index=0;index<4;index++){
        const frames=offsetPhotoHeadPose(head.frames,index,0,1,-1,head.width/2);
        for(let i=0;i<4;i++)assert.deepEqual(frames[i],i===index?{...original[i],neck:[original[i].neck[0]+1,original[i].neck[1]-1],offsetAdjusted:true}:original[i]);
        assert.deepEqual(scaled[index].neck,original[index].neck.map(n=>n*2));
        assert.deepEqual(publicPhotoHead({...head,frames}).frames,frames);
    }
    for(const patch of [{directionCount:8},{directionCount:16},{width:289},{frames:head.frames.slice(0,3)}])assert.throws(()=>publicPhotoHead({...head,...patch}));
    const wrong=structuredClone(head);wrong.frames[1].crop=[0,0,144,144];assert.throws(()=>publicPhotoHead(wrong));
    const save=createAdventure(content,{headId:head.id,customHead:head});
    assert.deepEqual(parseSave(JSON.stringify(save),content).customHead,head);
    const {state,...parts}=splitRoleSave(save);assert.deepEqual(joinRoleSave(state,parts,content).customHead,head);
    const profile={version:1,userId:'1',username:'tester',name:'测试',school:'fire',appearance:'boy',level:1,native:'zh',target:'en',visible:true,headId:head.id,customHead:head};
    assert.deepEqual(validatePublicProfile(profile).customHead,head);
    const alias=publicPhotoHead({...head,id:'photo-simple-girl',gender:'female'},{appearance:'girl'});
    assert.equal(alias.directionCount,4);assert.deepEqual(alias.frames,head.frames);
});

test('four-cell flood fill preserves enclosed white details and rejects any empty cell',()=>{
    const width=64,cell=32,data=new Uint8ClampedArray(width*width*4).fill(255);
    for(let row=0;row<2;row++)for(let col=0;col<2;col++)for(let y=6;y<28;y++)for(let x=8;x<24;x++){
        const p=((row*cell+y)*width+col*cell+x)*4;data[p]=100;data[p+1]=60;data[p+2]=30;
        if(x===16&&y===14)data[p]=data[p+1]=data[p+2]=255;
    }
    const out=removeHeadBackground(data,width,width,{directionCount:4});
    checkHeadPixels(out,width,width,{directionCount:4});
    assert.equal(out[3],0);assert.equal(out[(14*width+16)*4+3],255);
    assert.deepEqual(removeHeadBackground(out,width,width,{directionCount:4}),out);
    for(let y=32;y<64;y++)for(let x=32;x<64;x++)out[(y*width+x)*4+3]=0;
    assert.throws(()=>checkHeadPixels(out,width,width,{directionCount:4}),/空白格/);
});

function context(){const draws=[];return {draws,save(){},restore(){},translate(){},rotate(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},clip(){},drawImage(...args){draws.push(args);}};}
test('shared renderer locks simple photo and NPC heads to walking and mounted bodies regardless of gaze',()=>{
    const hero=new HeroRenderer(structuredClone(manifest),catalog);
    for(const [key,b] of Object.entries(manifest.bodies)){
        hero.images.set('body:'+(b.atlas||key),{id:'body:'+key});
        if(b.walk)hero.images.set('walk:'+key.split('-')[0],{id:'walk:'+key});
    }
    const mounts=catalog.mounts.filter(m=>m.rideable);
    for(const mount of mounts)hero.images.set('mount:'+mount.id,{id:mount.id});
    for(const appearance of ['boy','girl']){
        const head=custom(appearance),gender=head.gender;
        hero.registerHead(head);hero.images.set('head:'+head.id,{id:head.id});
        const npcId='simple-npc-'+appearance;hero.manifest.heads[npcId]=refs[appearance];hero.images.set('head:'+npcId,{id:npcId});
        for(const headId of [head.id,npcId])for(const mount of [null,...mounts])for(let facing=0;facing<4;facing++){
            const expected=[0,2,3,1][facing],options={facing,moving:true,time:1.3,reducedMotion:true};
            const baseline=hero.draw(context(),{gender,headId,mount},{...options,head:0});
            for(const headAngle of [1,4,8,12,15]){
                assert.equal(headFrameIndex(4,facing,headAngle),expected);
                const ctx=context(),result=hero.draw(ctx,{gender,headId,mount},{...options,head:headAngle});
                assert.equal(result.ready,true);assert.deepEqual(result.headRect,baseline.headRect);
                assert.deepEqual(ctx.draws.find(args=>args[0].id===headId).slice(1,5),head.frames[expected].crop);
            }
        }
    }
    for(let angle=0;angle<16;angle++)assert.equal(headFrameIndex(16,0,angle),angle);
});
