import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseLocaleFile} from '../js/locale_core.js';
import {loadLocaleFiles,dialogueLearningLines} from '../js/locale.js';
import {extractJsonStrings} from '../scripts/scan_locale.mjs';
const read=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
const pack=JSON.parse(read('data/adventure/island-packs/hanzi.json'));
const quests=pack.quests.filter(q=>!q.retired);
const keys=new Set(extractJsonStrings({quests},['title','description','text','label','name'],[]));
for(const story of pack.memory.stories){
    keys.add(story.title);keys.add(story.problem);keys.add(story.completion);
    for(const memory of Object.values(story.memories)){
        keys.add(memory.restored);for(const text of memory.glimpses)keys.add(text);
    }
}
for(const lang of ['en','ja','ko'])test(`hanzi island live story and all 30 memories are translated: ${lang}`,async()=>{
    const table=parseLocaleFile(read(`data/adventure/locale/${lang}.txt`));
    assert.equal(quests.length,6);
    assert.equal(pack.memory.stories.reduce((n,s)=>n+Object.keys(s.memories).length,0),30);
    await loadLocaleFiles([lang],async()=>read(`data/adventure/locale/${lang}.txt`));
    for(const key of keys){
        assert.ok(table[key]?.trim(),`${lang}: ${key}`);
        if(lang==='en')assert.doesNotMatch(table[key],/[\u3400-\u9fff]/u);
        if(table[key]===key)continue; // Shared proper names may be identical across languages.
        const lines=dialogueLearningLines(key,{enabled:true,target:lang,native:'zh-CN'});
        assert.deepEqual(lines,[{text:table[key],locale:lang},{text:key,locale:'zh-CN'}]);
    }
});

