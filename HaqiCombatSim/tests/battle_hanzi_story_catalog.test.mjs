import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stories} from '../hanzi/source/stories.mjs';
import {translations,common} from '../hanzi/source/translations.mjs';
import {parseLocaleFile} from '../js/locale_core.js';
import {validateDictionary} from '../js/dictionary_core.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const dictionary=JSON.parse(read('data/adventure/dictionary/zh.json'));
test('all 30 island words resolve to their own standalone character, including dance rather than martial wu',()=>{
 assert.equal(dictionary.entries.length,30);
 assert.equal(validateDictionary(dictionary),dictionary);
 for(const entry of dictionary.entries){assert.ok(entry.animation,`${entry.text}: missing animation`);const filename=entry.animation.split('/').at(-1);const html=read('hanzi/'+filename);assert.match(html,new RegExp(`<title>${entry.text} `),`${entry.text}: wrong character in animation`);assert.match(html,/haqi-hanzi/);}
 assert.equal(dictionary.entries.find(e=>e.id==='wu').animation,'hanzi/hanzi_wu_dance.html');
 assert.match(read('hanzi/hanzi_wu.html'),/<title>武 /,'preserve the separate martial story');
});
test('animation paths admit disambiguated names but reject traversal, alternate hosts and queries',()=>{
 for(const animation of ['hanzi/../hanzi_ri.html','hanzi/hanzi_ri.html?x=1','https://example.com/hanzi_ri.html','//cdn.keepwork.com/keepwork/cdn/hanzi/hanzi_ri.html','hanzi/hanzi_mu__eye.html']){const data=structuredClone(dictionary);data.entries[0].animation=animation;assert.throws(()=>validateDictionary(data),/动画地址/);}
});
test('new standalone pages preserve dictionary stroke geometry and parse without network imports',()=>{
 const mapped=read('js/hanzi_story_animations.js');assert.equal(stories.length,23);assert.equal(new Set(stories.map(s=>s.theme)).size,23);
 for(const story of stories){const filename=`hanzi_${story.id.replaceAll('-','_')}.html`,html=read('hanzi/'+filename);const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];assert.equal(scripts.length,2);for(const [,script]of scripts)new vm.Script(script,{filename});
 const data=JSON.parse(html.match(/const STORY=(.*);\n/)[1]);assert.deepEqual(data.strokes,dictionary.entries.find(e=>e.text===story.glyph).strokes);
 assert.ok(mapped.includes(filename));assert.ok(read('hanzi/hanzi_index.html').includes(`href="${filename}"`));assert.doesNotMatch(scripts.map(m=>m[1]).join('\n'),/Math\.random\s*\(|\bfetch\s*\(|\bimport\s*\(/);assert.match(html,/ARPHIC PUBLIC LICENSE/);
 }
});
test('new subtitles, controls and stroke counts exist in all three real locale dictionaries',()=>{
 for(const [index,locale]of ['en','ja','ko'].entries()){const table=parseLocaleFile(read(`data/adventure/locale/${locale}.txt`));for(const [key]of common)assert.ok(table[key],`${locale}: ${key}`);for(const story of stories){for(const field of ['title','intro','action','change','form','finale'])assert.ok(table[story[field]],`${locale}: ${story[field]}`);assert.equal(translations[story.id][locale].length,6);const n=dictionary.entries.find(e=>e.text===story.glyph).strokes.strokes.length;for(let i=1;i<=n;i++)assert.ok(table[`第 ${i} 笔，共 ${n} 笔。`]);}}
});
test('each painting supplies nonempty scene contours for a continuous glyph morph',()=>{
 const context={};vm.runInNewContext(read('hanzi/source/contours.js')+';globalThis.get=storyContours',context);for(const s of stories){const paths=context.get(s.theme);assert.ok(paths.length>=2);for(const points of paths){assert.ok(points.length>=2);assert.ok(points.flat().every(Number.isFinite));}}
});
