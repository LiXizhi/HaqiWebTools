import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseLocaleFile} from '../js/locale_core.js';
import {setTranslator} from '../js/locale_runtime.js';
import {createWorldMapSwitch} from '../js/view_adventure_controls.js';

test('common world-name allowlist stays below 100 and every name has all UI languages',()=>{
    const data=JSON.parse(fs.readFileSync(new URL('../data/adventure/earth/common-names.json',import.meta.url),'utf8'));
    assert.ok(data.names.length>0&&data.names.length<=100);assert.equal(new Set(data.names.map(row=>row.name)).size,data.names.length);
    for(const lang of ['en','ja','ko']){
        const table=parseLocaleFile(fs.readFileSync(new URL(`../data/adventure/locale/${lang}.txt`,import.meta.url),'utf8'));
        for(const {name}of data.names){assert.ok(table[name],`${lang}: ${name}`);if(lang==='en')assert.doesNotMatch(table[name],/[\u3400-\u9fff]/u);}
    }
});
test('world switch labels and accessible names translate while callbacks preserve world IDs',()=>{
    const previous=globalThis.document;
    globalThis.document={createElement:tag=>({tag,children:[],dataset:{},attrs:{},append(...nodes){this.children.push(...nodes);},setAttribute(k,v){this.attrs[k]=v;}})};
    try{for(const lang of ['en','ja','ko']){
        const table=parseLocaleFile(fs.readFileSync(new URL(`../data/adventure/locale/${lang}.txt`,import.meta.url),'utf8'));
        setTranslator(text=>table[text]||text);const selected=[];
        const node=createWorldMapSwitch('haqi',id=>selected.push(id),'返回哈奇世界地图');
        for(const [index,key]of ['返回哈奇世界地图','现实世界'].entries()){
            assert.equal(node.children[index].children[1].textContent,table[key]);assert.equal(node.children[index].attrs['aria-label'],table[key]);
            assert.equal(node.children[index].children[1].dataset.zh,key);
        }
        assert.equal(node.attrs['aria-label'],table['切换世界地图']);node.children[1].onclick();assert.deepEqual(selected,['earth']);
    }}finally{globalThis.document=previous;setTranslator(null);}
});
