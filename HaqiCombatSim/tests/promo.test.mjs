import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compileFilm,locateShot,filmText,srtFor,frameDelta} from '../js/promo_timeline_core.js';
const script=JSON.parse(fs.readFileSync(new URL('../data/promo/film.json',import.meta.url)));
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
