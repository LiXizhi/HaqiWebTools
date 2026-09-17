import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {assetMode,assetUrl,validateMediaManifest} from '../js/adventure_media_core.js';
import {validateMedia} from '../scripts/lib/asset_decode.mjs';
const load=n=>JSON.parse(fs.readFileSync(new URL(`../data/adventure/${n}.json`,import.meta.url)));
test('online uses permanent Keepwork CDN; local art mode is explicit or loopback',()=>{
    assert.equal(assetMode('game.keepwork.com'),'cdn');assert.equal(assetMode('192.168.1.8'),'cdn');
    for(const host of ['localhost','127.0.0.1','[::1]'])assert.equal(assetMode(host),'local');
    assert.equal(assetMode('localhost','?assets=cdn'),'cdn');assert.equal(assetMode('192.168.1.8','?assets=local'),'local');assert.throws(()=>assetMode('localhost','?assets=wrong'));
});
test('asset policy rejects temporary/offsite URLs, traversal and missing required references',()=>{
    const media=load('media'),source=load('assets');assert.equal(validateMediaManifest(media,source,'cdn'),92);
    for(const cdn of ['https://unpkg.com/image.webp','https://cdn.keepwork.com/image.webp?token=x','http://cdn.keepwork.com/x.webp',null])assert.throws(()=>assetUrl({cdn},'cdn'));
    assert.throws(()=>assetUrl({local:'assets/adventure/../private.webp'},'local'));
    const broken=structuredClone(media);delete broken.entries.sprites;assert.throws(()=>validateMediaManifest(broken,source));
});
test('all prepared WebP/audio files match published hashes, sizes, dimensions and source entries',()=>{
    const media=load('media');
    for(const [id,row]of Object.entries(media.entries)){
        const bytes=fs.readFileSync(new URL(`../${row.local}`,import.meta.url));
        assert.equal(bytes.length,row.size,id);assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256,id);
        const dimensions=validateMedia(row.local,bytes);if(dimensions){assert.deepEqual(dimensions,{width:row.width,height:row.height},id);assert.ok(bytes.length<=200000,`${id} exceeds 200KB`);}
    }
});
