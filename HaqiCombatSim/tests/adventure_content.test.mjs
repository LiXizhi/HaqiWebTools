import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateAdventureContent } from '../js/adventure_content_core.js';
import { validateMedia } from '../scripts/lib/asset_decode.mjs';
const load=n=>JSON.parse(fs.readFileSync(new URL(`../data/adventure/${n}.json`,import.meta.url)));
test('chapter validator rejects missing references and unsupported effects, actions and AI',()=>{
    const c=load('chapter'),d=load('combat'),assets=load('assets');assert.equal(validateAdventureContent(c,d,assets).quests,14);
    for(const mutate of [x=>delete x.npcs[36211],x=>x.quests[2].goals[0].id=999,x=>x.monsters['death-scout'].sequences[0][0].motion='unsupported',x=>x.quests[0].startDialog[0].buttons[0].action='execute_lua']){
        const copy=structuredClone(c);mutate(copy);assert.throws(()=>validateAdventureContent(copy,d,assets));
    }
    const bad=structuredClone(d);Object.values(bad.cards)[0].type='UnknownSpell';assert.throws(()=>validateAdventureContent(c,bad,assets));
    assert.throws(()=>validateAdventureContent(c,d,{}));
});
test('local PNG images decode and corrupted data fails validation',()=>{
    const file=new URL('../assets/adventure/sprites.png',import.meta.url),data=fs.readFileSync(file);
    assert.deepEqual(validateMedia('sprites.png',data),{width:1254,height:1254});
    const corrupt=Buffer.from(data);corrupt[100]^=1;assert.throws(()=>validateMedia('sprites.png',corrupt));
});
