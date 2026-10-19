import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseLocaleFile} from '../js/locale_core.js';
for(const lang of ['en','ja','ko'])test(`product brand stays Magic Haqi throughout ${lang}`,()=>{
    const table=parseLocaleFile(fs.readFileSync(new URL(`../data/adventure/locale/${lang}.txt`,import.meta.url),'utf8'));
    assert.equal(table['魔法哈奇'],'Magic Haqi');
    assert.ok(table['小哈奇'].includes('Haqi'));
    for(const [key,value]of Object.entries(table)){
        if(key.includes('魔法哈奇'))assert.ok(value.includes('Magic Haqi'),`${key}: ${value}`);
        if(key.includes('哈奇'))assert.doesNotMatch(value,/ハ奇|ハ치|哈奇|ハーチー|ハーチ|ハチ|ハキ|하奇|하치|하키/u,`${key}: ${value}`);
    }
});
