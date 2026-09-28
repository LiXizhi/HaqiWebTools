import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compileFilm,locateShot,filmText,srtFor,frameDelta} from '../js/promo_timeline_core.js';
import {samplePromoMotion} from '../js/promo_motion_core.js';
import {WALK_SPEED} from '../js/adventure_world_core.js';
const script=JSON.parse(fs.readFileSync(new URL('../data/promo/film.json',import.meta.url)));
const motionWorld={layout:{route:[{x:0,y:0},{x:10000,y:0}]},paths:[{a:{x:0,y:0},b:{x:10000,y:0},width:20000}],encounters:[]};
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
    const world=motionWorld,origin={x:1000,y:1000};
    const path=[{x:1100,y:1000},{x:1100,y:2000}];
    const early=samplePromoMotion(world,origin,path,50/WALK_SPEED);
    assert.equal(early.facing,2);
    assert.equal(samplePromoMotion(world,origin,path,200/WALK_SPEED).facing,0);
    const end=samplePromoMotion(world,origin,path,2000/WALK_SPEED);
    assert.deepEqual(end.position,path[1]);assert.equal(end.facing,0);assert.equal(end.moving,false);
    assert.deepEqual(samplePromoMotion(world,origin,path,50/WALK_SPEED),early);
    assert.deepEqual(samplePromoMotion(world,origin,path,0),{position:origin,facing:0,moving:false});
});
test('异步镜头准备之后旧动画时间戳不能倒退播放时间',()=>{
    assert.equal(frameDelta(100,130,8),0);assert.equal(frameDelta(116,100,1),.016);assert.equal(frameDelta(10000,100,8),.8);
});
test('宣传片两个版本时长、语言和六岛覆盖完整',()=>{
    const long=compileFilm(script),short=compileFilm(script,'short');
    assert.ok(long.duration>=180&&long.duration<=300);assert.equal(short.duration,80);
    for(const film of [long,short])for(const shot of film.shots){assert.ok(shot.subtitle.en);assert.ok(shot.title.en);for(const cue of shot.cues)assert.ok(cue.time<shot.duration);}
    assert.deepEqual(script.shots.filter(s=>s.zone).map(s=>s.zone).sort(),['camp','dark','desert','fire','ice','town']);
});
test('时间轴精确边界与拖动越界不遗漏最后镜头',()=>{
    const film=compileFilm(script);assert.equal(locateShot(film,-3).index,0);
    for(const [i,shot] of film.shots.entries()){assert.equal(locateShot(film,shot.start).index,i);assert.equal(locateShot(film,shot.start+shot.duration-.001).index,i);}
    assert.equal(locateShot(film,Infinity).time,0);assert.equal(locateShot(film,9999).time,film.duration);assert.equal(locateShot(film,film.duration).index,film.shots.length-1);
});
test('未知语言回退中文，SRT 使用各版本连续时间码',()=>{
    assert.equal(filmText({en:'Hello','zh-CN':'你好'},'fr'),'你好');
    const film=compileFilm(script,'short'),srt=srtFor(film,'en');assert.match(srt,/00:00:00,000 --> 00:00:07,000/);assert.match(srt,/00:01:20,000/);assert.ok(srt.includes(script.shots[0].subtitle.en));
});
test('不接受重名、无时长、缺字幕和镜头外动作',()=>{
    const change=fn=>{const copy=structuredClone(script);fn(copy);assert.throws(()=>compileFilm(copy));};
    change(s=>s.shots[1].id=s.shots[0].id);change(s=>s.shots[0].duration.long=NaN);change(s=>delete s.shots[0].subtitle['zh-CN']);change(s=>s.shots[0].cues=[{at:1,action:'bad'}]);
});
