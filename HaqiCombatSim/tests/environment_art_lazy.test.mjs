import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadEnvironmentArt} from '../js/adventure_environment_art.js';

test('environment art loads the manifest only until warm or draw', async () => {
    const originals=Object.fromEntries(['fetch','Image'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
    const requests=[];
    const read=async path=>JSON.parse(fs.readFileSync(new URL('../'+path,import.meta.url)));
    const manifest=await read('data/adventure/building-art.json');
    globalThis.fetch=async url=>({ok:true,json:async()=>read(url)});
    globalThis.Image=class{set src(url){
        requests.push(url);
        const match=Object.values(manifest.atlases).find(a=>url.includes(a.local.split('/').pop())||url===a.cdn);
        queueMicrotask(()=>{this.naturalWidth=match?.width||768;this.naturalHeight=match?.height||768;this.onload?.();});
    }};
    try{
        const art=await loadEnvironmentArt('local',read,'data/adventure/building-art.json');
        assert.equal(requests.length,0);
        assert.deepEqual(Object.keys(art.images),[]);
        await art.warm(['town']);
        assert.equal(requests.length,1);
        assert.ok(requests[0].includes('buildings-town'));
        assert.ok(art.images.town);
        assert.equal(art.draw({drawImage(){}},'ice','harbor',0,0,10,10),false);
        await art.ensure('ice');
        assert.ok(requests.some(url=>url.includes('buildings-ice')));
        assert.ok(art.images.ice);
    }finally{
        for(const [key,descriptor] of Object.entries(originals)){
            if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
        }
    }
});
