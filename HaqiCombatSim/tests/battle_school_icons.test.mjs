import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {loadSchoolIcons,drawSchoolAtlas} from '../js/school_icons.js';
import {drawSchoolIcon} from '../js/card_renderer.js';

test('HD six-school atlas stays below 32KB and retains reference and generation provenance',()=>{
    const m=JSON.parse(fs.readFileSync(new URL('../data/adventure/school-icons.json',import.meta.url)));
    const bytes=fs.readFileSync(new URL('../'+m.local,import.meta.url));
    assert.ok(bytes.length<32000);assert.equal(bytes.length,m.size);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),m.sha256);
    assert.equal(m.width,768);assert.equal(m.height,128);
    assert.equal(m.generation.method,'imagegen-reference-redraw');
    assert.deepEqual(Object.keys(m.frames),['fire','ice','storm','life','death','balance']);
    Object.values(m.frames).forEach((frame,i)=>{
        assert.deepEqual(frame.rect,[i*128,0,128,128]);
        assert.match(frame.sourceEntry,/texture\/aries\/(common\/themekid\/character|team)\/.+\.png\.p,[a-f0-9]{32},\d+/);
        assert.ok(!frame.source.includes('HPSlots'),'Do not restore circular HP-slot backgrounds');
    });
});

test('one image serves all callers, with correct crops, CORS and unknown-school fallback',async()=>{
    const manifest=JSON.parse(fs.readFileSync(new URL('../data/adventure/school-icons.json',import.meta.url)));
    let requests=0;
    const OriginalImage=globalThis.Image;
    globalThis.Image=class{
        naturalWidth=768;naturalHeight=128;
        set src(url){assert.equal(this.crossOrigin,'anonymous');assert.equal(url,manifest.local);queueMicrotask(()=>this.onload());}
    };
    try{
        const read=async()=>{requests++;return manifest;};
        await Promise.all([loadSchoolIcons('local',read),loadSchoolIcons('local',read)]);
        assert.equal(requests,1);
        const calls=[],context={drawImage(...args){calls.push(args.slice(1));}};
        Object.keys(manifest.frames).forEach(s=>drawSchoolIcon(context,s,24,24,36));
        calls.forEach((args,i)=>assert.deepEqual(args,[i*128,0,128,128,6,6,36,36]));
        drawSchoolAtlas(context,'unknown',16,16,24);
        assert.deepEqual(calls.at(-1),[640,0,128,128,4,4,24,24]);
    }finally{globalThis.Image=OriginalImage;}
});
