import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {installNpcCatalog} from '../js/adventure_npc_core.js';
import {installNpcArt} from '../js/adventure_npc_art_core.js';
import {createWorld} from '../js/adventure_world_core.js';
import {assetUrl} from '../js/adventure_media_core.js';
import {validateMedia} from '../scripts/lib/asset_decode.mjs';
import {projectRuntimeData} from '../scripts/package_runtime_data.mjs';
const root=new URL('../',import.meta.url);
const read=name=>JSON.parse(fs.readFileSync(new URL(`data/adventure/${name}.json`,root)));
const art=read('npc-art'),catalog=read('npc-catalog');
function content(packed=false){
    const c=read('chapter');
    installNpcCatalog(c,packed?projectRuntimeData('adventure/npc-catalog.json',catalog):structuredClone(catalog));
    installNpcArt(c,packed?projectRuntimeData('adventure/npc-art.json',art):art);
    c.worldMaps=Object.fromEntries(['camp','town','fire','ice','desert','dark'].map(z=>[z,read('maps/'+z)]));return c;
}
test('all NPC appearances have verified 256px transparent WebPs below 48,000 bytes',()=>{
    assert.equal(Object.keys(art.instances).length,catalog.npcs.length);
    for(const [id,entry] of Object.entries(art.entries)){
        const file=new URL(assetUrl(entry,'local'),root),raw=fs.readFileSync(file);
        assert.ok(raw.length>0&&raw.length<48000,id);assert.equal(raw.length,entry.size);
        assert.ok(entry.width>=256&&entry.height>=256,id);
        assert.equal(createHash('sha256').update(raw).digest('hex'),entry.sha256);
        assert.deepEqual(validateMedia(entry.local,raw),{width:entry.width,height:entry.height});
        assert.ok(assetUrl(entry).endsWith('.webp'));
        const source=art.sources[id];assert.ok(source.model);
        if(source.method==='original-image'){
            assert.ok(source.original.entry.includes(source.original.md5));
            assert.ok(Math.min(...source.sourceSize)>=256);
        }else{
            assert.match(source.renderSha256,/^[a-f0-9]{64}$/);
            assert.ok(source.renderSize>=512);
        }
    }
});
test('all six scenes and their packed release data resolve the same small NPC portraits',()=>{
    const c=content(),packed=content(true);
    for(const zone of Object.keys(c.worldMaps)){
        const world=createWorld(zone,c),release=createWorld(zone,packed);
        assert.deepEqual(world.npcs.map(n=>[n.instanceId,n.portrait]),release.npcs.map(n=>[n.instanceId,n.portrait]));
        for(const npc of world.npcs)assert.ok(art.entries[npc.portrait.id],npc.name);
    }
    for(const id of [30510,30511,30519]){
        const npc=createWorld('fire',c).npcs.find(n=>n.id===id);
        assert.ok(npc.portrait.id.startsWith('npc:'));
    }
    for(const row of art.hidden)assert.equal(c.npcCatalog.npcs.find(n=>n.instanceId===row.instanceId).artVisible,false);
});
test('an oversized or missing NPC binding fails before rendering instead of silently using a placeholder',()=>{
    const c=read('chapter');installNpcCatalog(c,structuredClone(catalog));
    const broken=structuredClone(art);Object.values(broken.entries)[0].size=48000;
    assert.throws(()=>installNpcArt(c,broken),/48KB/);
    delete broken.instances[catalog.npcs[0].instanceId];
    assert.throws(()=>installNpcArt(c,broken),/缺少居民图片/);
});

test('low-resolution NPC images are rejected in source and packed data',()=>{
    for(const packed of [false,true]){
        const c=read('chapter');installNpcCatalog(c,structuredClone(catalog));
        const broken=structuredClone(art);Object.values(broken.entries)[0].height=255;
        assert.throws(()=>installNpcArt(c,packed?projectRuntimeData('adventure/npc-art.json',broken):broken),/256×256/);
    }
});
