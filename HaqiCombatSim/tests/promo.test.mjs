import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compileFilm,locateShot,filmText,srtFor,frameDelta,captionAt,narrationLimitedTime} from '../js/promo_timeline_core.js';
import {samplePromoMotion,planPromoPath,samplePromoZoom} from '../js/promo_motion_core.js';
import {presentationEventDurationMs,samplePresentationClock} from '../js/battle_presentation_core.js';
import {WALK_SPEED} from '../js/adventure_world_core.js';
const effects={cards:{bolt:{base:'bolt',name:'火弹',variant:{rank:'normal',level:0}}},bases:{bolt:{duration:1800,scale:1,kind:'bolt',count:8}},palettes:{fire:['#f00','#faa','#800']},variantAuras:{normal:{color:null,rings:0}},summons:{}};
const spell={key:'bolt',spellSchool:'fire',pipcost:1,type:'SingleAttack'},quick={...spell,pipcost:0};
const script=JSON.parse(fs.readFileSync(new URL('../data/promo/film.json',import.meta.url)));
test('朗读等待覆盖下一动作、字幕、镜头和片尾，结束后正常继续',()=>{
 const film=compileFilm(script),shot=film.shots.find(s=>s.cues.length>0&&s.cues[0].time>0);
 const edge=shot.start+shot.cues[0].time;
 const held=narrationLimitedTime(film,edge-.05,.1,0,true);
 assert.ok(held<edge);assert.equal(narrationLimitedTime(film,held,.1,0,true),held);
 assert.ok(narrationLimitedTime(film,held,.1,0,false)>edge);
 const end=shot.start+shot.duration;
 assert.ok(narrationLimitedTime(film,end-.05,.1,shot.cues.length,true)<end);
 const last=film.shots.at(-1);
 assert.ok(narrationLimitedTime(film,film.duration-.05,.1,last.cues.length,true)<film.duration);
 assert.equal(narrationLimitedTime(film,film.duration-.05,.1,last.cues.length,false),film.duration);
 assert.equal(narrationLimitedTime(film,shot.start,.01,0,true),shot.start+.01);
});
const motionWorld={layout:{route:[{x:0,y:0},{x:10000,y:0}]},paths:[{a:{x:0,y:0},b:{x:10000,y:0},width:20000}],encounters:[]};
test('宣传片路线途中和停步都与居民保持距离',()=>{
    const world={...motionWorld,npcs:[{x:500,y:0}],center:{x:1000,y:0}},origin={x:0,y:0};
    const path=planPromoPath(world,origin);
    assert.ok(path.length>0);
    for(let t=0;t<=10;t+=.1){
        const {position}=samplePromoMotion(world,origin,path,t);
        assert.ok(Math.hypot(position.x-500,position.y)>=110);
    }
    assert.deepEqual(planPromoPath(world,origin),path);
});
test('镜头推近按时间采样，暂停和倒退无累计误差，减少动态时关闭',()=>{
    assert.equal(samplePromoZoom(0,8,.3),1);
    assert.equal(samplePromoZoom(8,8,.3),1.3);
    const mid=samplePromoZoom(3,8,.3);assert.ok(mid>1&&mid<1.3);
    assert.equal(samplePromoZoom(3,8,.3),mid);
    assert.equal(samplePromoZoom(8,8,.3,true),1);
    assert.equal(samplePromoZoom(8,8),1);
});
test('宣传片移动使用正式步行速度、坐骑倍率与四方向',()=>{
    const world=motionWorld,origin={x:5000,y:5000};
    for(const [dx,dy,facing] of [[0,1,0],[-1,0,1],[1,0,2],[0,-1,3]]){
        const path=[{x:origin.x+dx*4000,y:origin.y+dy*4000}];
        for(const [mountId,multiplier] of [[null,1],['mount',1.35]]){
            const state=samplePromoMotion(world,origin,path,1,{mountId});
            assert.ok(Math.abs(Math.hypot(state.position.x-origin.x,state.position.y-origin.y)-WALK_SPEED*multiplier)<1e-6);
            assert.equal(state.facing,facing);assert.equal(state.moving,true);
        }
    }
});
test('宣传片转弯、停止和倒退跳转的朝向保持确定性',()=>{
    const world={...motionWorld,paths:[{a:{x:1000,y:1000},b:{x:1100,y:1000},width:40},{a:{x:1100,y:1000},b:{x:1100,y:2000},width:40}],layout:{route:[{x:1000,y:1000},{x:1100,y:1000},{x:1100,y:2000}]}},origin={x:1000,y:1000};
    const path=[{x:1100,y:1000},{x:1100,y:2000}];
    const early=samplePromoMotion(world,origin,path,50/WALK_SPEED);
    assert.equal(early.facing,2);
    assert.equal(samplePromoMotion(world,origin,path,200/WALK_SPEED).facing,0);
    const end=samplePromoMotion(world,origin,path,2000/WALK_SPEED);
    assert.deepEqual(end.position,path[1]);assert.equal(end.facing,0);assert.equal(end.moving,false);
    assert.deepEqual(samplePromoMotion(world,origin,path,50/WALK_SPEED),early);
    assert.deepEqual(samplePromoMotion(world,origin,path,0),{position:origin,facing:0,moving:false});
});
test('宣传片战斗特效使用游戏事件时长，不按镜头均分',()=>{
    assert.equal(presentationEventDurationMs({type:'cast'},{effects,card:quick}),550);
    assert.equal(presentationEventDurationMs({type:'cast'},{effects,card:spell}),1800);
    assert.equal(presentationEventDurationMs({type:'cast'},{effects,card:spell,reducedMotion:true}),500);
    assert.equal(presentationEventDurationMs({type:'damage'},{hp:40}),220);
    assert.equal(presentationEventDurationMs({type:'damage'},{hp:0}),600);
    assert.equal(presentationEventDurationMs({type:'fizzle'}),600);
    assert.equal(presentationEventDurationMs({type:'heal'}),600);
    assert.equal(presentationEventDurationMs(null),0);
    assert.equal(presentationEventDurationMs({type:'combat_end'}),0);
    const frames=[{duration:0},{duration:550},{duration:220},{duration:1800},{duration:600},{duration:0}];
    assert.deepEqual(samplePresentationClock(frames,0),{index:1,progress:0});
    assert.equal(samplePresentationClock(frames,.275).index,1);
    assert.ok(Math.abs(samplePresentationClock(frames,.275).progress-.5)<1e-12);
    assert.equal(samplePresentationClock(frames,.55).index,2);
    assert.equal(samplePresentationClock(frames,23).index,5);
    assert.equal(samplePresentationClock(frames,23).progress,0);
});
test('异步镜头准备之后旧动画时间戳不能倒退播放时间',()=>{
    assert.equal(frameDelta(100,130,8),0);assert.equal(frameDelta(116,100,1),.016);assert.equal(frameDelta(10000,100,8),.8);
});
test('宣传片两个版本时长、语言和主要功能覆盖完整',()=>{
    const long=compileFilm(script),short=compileFilm(script,'short');
    assert.equal(long.shots.length,35);assert.equal(long.duration,432);assert.equal(long.shots.some(s=>s.scene==='account'),false);
    assert.equal(short.shots.length,15);assert.equal(short.duration,202);
    for(const film of [long,short])for(const shot of film.shots){assert.ok(shot.subtitle.en);assert.ok(shot.title.en);for(const cue of shot.cues)assert.ok(cue.time<shot.duration);}
    assert.deepEqual(script.shots.filter(s=>s.zone).map(s=>s.zone).sort(),['camp','dark','desert','fire','float','ice','sail','tide','town']);
});
test('时间轴精确边界与拖动越界不遗漏最后镜头',()=>{
    const film=compileFilm(script);assert.equal(locateShot(film,-3).index,0);
    for(const [i,shot] of film.shots.entries()){assert.equal(locateShot(film,shot.start).index,i);assert.equal(locateShot(film,shot.start+shot.duration-.001).index,i);}
    assert.equal(locateShot(film,Infinity).time,0);assert.equal(locateShot(film,9999).time,film.duration);assert.equal(locateShot(film,film.duration).index,film.shots.length-1);
});
test('未知语言回退中文，SRT 使用各版本连续时间码',()=>{
    assert.equal(filmText({en:'Hello','zh-CN':'你好'},'fr'),'你好');
    const film=compileFilm(script,'short'),srt=srtFor(film,'en');assert.match(srt,/00:00:00,000 --> 00:00:07,000/);assert.match(srt,/00:03:22,000/);assert.ok(srt.includes(script.shots[0].subtitle.en));
});
test('不接受重名、无时长、缺字幕和镜头外动作',()=>{
    const change=fn=>{const copy=structuredClone(script);fn(copy);assert.throws(()=>compileFilm(copy));};
    change(s=>s.shots[1].id=s.shots[0].id);change(s=>s.shots[0].duration.long=NaN);change(s=>delete s.shots[0].subtitle['zh-CN']);change(s=>s.shots[0].cues=[{at:1,action:'bad'}]);
});

test('操作解说在暂停、回跳和SRT中保持一致',()=>{
 const film=compileFilm(script),s=film.shots.find(s=>s.id==='food'),cue=s.cues[0];
 assert.equal(captionAt(s,0,'zh-CN'),s.subtitle['zh-CN']);
 assert.equal(captionAt(s,cue.time,'en'),cue.caption.en);
 assert.equal(captionAt(s,s.duration,'en'),s.cues.at(-1).caption.en);
 assert.equal(captionAt(s,0,'en'),s.subtitle.en);
 assert.ok(srtFor(film,'en').includes(cue.caption.en));
 const entries=srtFor(film,'zh-CN').trim().split('\n\n');
 assert.equal(entries.length,film.shots.reduce((n,s)=>n+1+s.cues.filter(c=>c.caption&&c.time>0).length,0));
});
test('完整导览包含双世界、养成、生活、战斗与交流操作',()=>{
 const film=compileFilm(script);
 for(const id of ['atlas','earth','quests','pets','food','equipment','upgrade','gems','deck','battle','arena','dungeons','friends','learning','learning-rewards','shop','checkin','fishing','settings'])assert.ok(film.shots.some(s=>s.id===id),id);
 for(const id of ['atlas','pets','food','upgrade','gems','arena'])assert.ok(film.shots.find(s=>s.id===id).cues.some(c=>c.action==='ui-click'),id);
 for(const s of film.shots)for(const c of s.cues)if(c.caption)assert.ok(c.caption.en&&c.caption['zh-CN']);
});

test('精华保留社交、2对2、漩涡深圳沿路进城与真实学习奖励',()=>{
 const short=compileFilm(script,'short'),by=id=>short.shots.find(s=>s.id===id);
 for(const id of ['party','friends','pets','learning'])assert.ok(by(id));
 assert.equal(by('skills').scene,'skills-battle');
 assert.match(by('atlas').cues[0].selector,/map-vortex/);
 const earth=by('earth'),walk=earth.cues.find(c=>c.name==='earth-walk'),enter=earth.cues.find(c=>c.name==='earth-enter'),exit=earth.cues.find(c=>c.name==='earth-exit');
 assert.ok(walk.time-earth.cues.find(c=>c.action==='ui-click').time>=3);
 assert.ok(enter.time-walk.time>=5&&enter.time-walk.time<=10);assert.ok(exit.time-enter.time>=3);
 assert.equal(earth.cues.some(c=>c.name==='earth-focus'),false);assert.equal(by('city'),undefined);
 assert.deepEqual(by('skills').cues.map(c=>c.group),[1,2,3,4,5]);
 assert.ok(by('learning').cues.some(c=>c.action==='learning-battle'));
});
