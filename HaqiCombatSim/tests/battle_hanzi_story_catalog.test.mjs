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
const completed = new Set(['ri','yue','shan','shui','huo','mu','men','yu','xiu','sen','guang','guo','ming']);
test('all 30 words retain writing data; only completed authored stories expose an animation',()=>{
 assert.equal(dictionary.entries.length,30);assert.equal(validateDictionary(dictionary),dictionary);
 for(const entry of dictionary.entries){
  assert.ok(entry.strokes.medians.length>0,entry.id);
  assert.equal(!!entry.animation,completed.has(entry.id),entry.id);
  if(!entry.animation)continue;
  const html=read('hanzi/'+entry.animation.split('/').at(-1));
  assert.match(html,new RegExp(`<title>${entry.text} `),entry.id);assert.match(html,/haqi-hanzi/,entry.id);
 }
 assert.equal(dictionary.entries.find(e=>e.id==='wu').animation,undefined,'dance is planned, never substitute martial wu');
 assert.match(read('hanzi/hanzi_wu.html'),/<title>武 /);
});

test('animation paths admit disambiguated names but reject traversal, alternate hosts and queries',()=>{
 for(const animation of ['hanzi/../hanzi_ri.html','hanzi/hanzi_ri.html?x=1','https://example.com/hanzi_ri.html','//cdn.keepwork.com/keepwork/cdn/hanzi/hanzi_ri.html','hanzi/hanzi_mu__eye.html']){const data=structuredClone(dictionary);data.entries[0].animation=animation;assert.throws(()=>validateDictionary(data),/动画地址/);}
});
test('authored replacements are standalone executable pages with writing and completion hooks',()=>{
 const mapped=read('js/hanzi_story_animations.js');
 for(const id of ['ri','yue','shan','shui','huo','mu']){
  const filename=`hanzi_${id}.html`,html=read('hanzi/'+filename);
  const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length>=2,filename);for(const [,script]of scripts)new vm.Script(script,{filename});
  const player=scripts.at(-1)[1];
  assert.match(player,/haqiHanziWritten/,filename);assert.match(player,/haqiHanziComplete/,filename);
  assert.doesNotMatch(player,/Math\.random\s*\(|\bfetch\s*\(|\bimport\s*\(/,filename);
  assert.doesNotMatch(html,/<script[^>]+src=/,filename);
  assert.ok(mapped.includes(filename));assert.ok(read('hanzi/hanzi_index.html').includes(`href="${filename}"`));
 }
});

test('new subtitles, controls and stroke counts exist in all three real locale dictionaries',()=>{
 for(const [index,locale]of ['en','ja','ko'].entries()){const table=parseLocaleFile(read(`data/adventure/locale/${locale}.txt`));for(const [key]of common)assert.ok(table[key],`${locale}: ${key}`);for(const story of stories){for(const field of ['title','intro','action','change','form','finale'])assert.ok(table[story[field]],`${locale}: ${story[field]}`);assert.equal(translations[story.id][locale].length,6);const n=dictionary.entries.find(e=>e.text===story.glyph).strokes.strokes.length;for(let i=1;i<=n;i++)assert.ok(table[`第 ${i} 笔，共 ${n} 笔。`]);}}
});
test('each painting supplies nonempty scene contours for a continuous glyph morph',()=>{
 const context={};vm.runInNewContext(read('hanzi/source/contours.js')+';globalThis.get=storyContours',context);for(const s of stories){const paths=context.get(s.theme);assert.ok(paths.length>=2);for(const points of paths){assert.ok(points.length>=2);assert.ok(points.flat().every(Number.isFinite));}}
});
