import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseLocaleFile,diffLocaleLines} from '../js/locale_core.js';
import {extractJsonStrings} from '../scripts/scan_locale.mjs';

const read=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
const dictionaries=Object.fromEntries(['en','ja','ko'].map(lang=>[lang,parseLocaleFile(read(`data/adventure/locale/${lang}.txt`))]));
const placeholders=text=>(text.match(/\{[^{}]+\}/g)||[]).sort();
for(const [file,fields,under] of [
    ['chapter.json',['title','description','text','label'],['quests']],
    ['quest-runtime.json',['title','text','label','speakerName','name'],['quests']],
    ['quest-journal.json',['title','description','startNpc','endNpc','name'],['quests']],
    ['dungeon-journeys.json',['title','text','speaker','name'],['entries']]
]){
    test(`all current island quest/story text has English, Japanese and Korean: ${file}`,()=>{
        const keys=[...new Set(extractJsonStrings(JSON.parse(read(`data/adventure/${file}`)),fields,under))];
        assert.ok(keys.length>0);
        for(const lang of ['en','ja','ko']){
            const missing=keys.filter(key=>!dictionaries[lang][key]);
            assert.deepEqual(missing,[],`${lang} missing ${missing.length} lines in ${file}`);
            for(const key of keys){
                assert.deepEqual(placeholders(dictionaries[lang][key]),placeholders(key),`${lang} placeholders: ${key}`);
                if(lang==='en')assert.doesNotMatch(dictionaries.en[key],/[\u3400-\u9fff]/u,`English still contains Chinese: ${key}`);
            }
        }
    });
}
test('UI language dictionaries stay aligned and preserve all named placeholder occurrences',()=>{
    const en=read('data/adventure/locale/en.txt');
    for(const lang of ['ja','ko']){
        assert.deepEqual(diffLocaleLines(en,read(`data/adventure/locale/${lang}.txt`)),{missing:[],extra:[]});
    }
    for(const [lang,table]of Object.entries(dictionaries))for(const [key,value]of Object.entries(table)){
        // Two historical internal SVG/prompt entries are deliberately blank, not displayed strings.
        if(!value)continue;
        assert.deepEqual(placeholders(value),placeholders(key),`${lang} placeholders: ${key}`);
    }
});
