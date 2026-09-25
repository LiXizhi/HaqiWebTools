import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createFishingLoader } from '../js/adventure_fishing_loader.js';
const read = name => JSON.parse(fs.readFileSync(new URL(`../data/adventure/${name}.json`,import.meta.url)));

test('fishing keeps inventory metadata available and loads gameplay only once on demand',async()=>{
    const catalog=read('fishing'),items=read('fishing-items'),content={items:{}};
    assert.deepEqual(items,catalog.items);
    let requests=0;
    const load=createFishingLoader(content,items,async path=>{requests++;assert.equal(path,'data/adventure/fishing.json');return catalog;});
    assert.equal(requests,0);assert.equal(content.fishing,undefined);
    for(const item of Object.values(items))assert.equal(content.items[item.id].name,item.name);
    await Promise.all([load(),load()]);await load();
    assert.equal(requests,1);assert.equal(content.fishing,catalog);
});

test('failed first fishing load can retry without changing registered items',async()=>{
    const content={items:{}},catalog=read('fishing');let calls=0;
    const load=createFishingLoader(content,catalog.items,async()=>{if(++calls===1)throw Error('offline');return catalog;});
    const before=JSON.stringify(content.items);
    await assert.rejects(load(),/offline/);assert.equal(content.fishing,undefined);
    assert.equal(JSON.stringify(content.items),before);
    await load();assert.equal(calls,2);assert.equal(content.fishing,catalog);
});
