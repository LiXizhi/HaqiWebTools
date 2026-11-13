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
const completed = new Set(['ri','yue','shan','shui','huo','mu','shi','tu','ren','kou','shou','men','yu','xiu','sen','guang','guo','ming','mu-eye','er','xin','tian-field','yun']);
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
 for(const id of ['ri','yue','shan','shui','huo','mu','shi','tu','ren','kou','shou','mu_eye','jing','xi','er','xin','tian_field','yun','li','zhi','zhi_peak','sun']){
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
test('ren writing embeds strokes.json outlines and medians without retuning',()=>{
 const ren=JSON.parse(read('data/adventure/hanzi/strokes.json')).characters['人'];
 const html=read('hanzi/hanzi_ren.html');
 assert.ok(html.includes(JSON.stringify({strokes:ren.strokes,medians:ren.medians})));
 assert.match(html,/translate\(0,\s*900\);\s*ctx\.scale\(1,\s*-1\)/);
 assert.equal(ren.medians.length,2);
});
test('shou writing embeds strokes.json outlines and medians without retuning',()=>{
 const shou=JSON.parse(read('data/adventure/hanzi/strokes.json')).characters['手'];
 const html=read('hanzi/hanzi_shou.html');
 assert.ok(html.includes(JSON.stringify({strokes:shou.strokes,medians:shou.medians})));
 assert.match(html,/translate\(0,\s*900\);\s*ctx\.scale\(1,\s*-1\)/);
 assert.equal(shou.medians.length,4);
 assert.match(html,/haqiHanziWritten\?\.\(\)/);
 assert.match(html,/haqiHanziComplete\(\)/);
 const intro=html.match(/async function introPlay[\s\S]*?\n\}/);
 assert.ok(intro);
 assert.doesNotMatch(intro[0],/haqiHanziWritten|haqiHanziComplete/);
});
test('mu_eye writing embeds strokes.json outlines and medians without retuning',()=>{
 const mu=JSON.parse(read('data/adventure/hanzi/strokes.json')).characters['目'];
 const html=read('hanzi/hanzi_mu_eye.html');
 assert.ok(html.includes(JSON.stringify({strokes:mu.strokes,medians:mu.medians})));
 assert.match(html,/translate\(0,\s*900\);\s*ctx\.scale\(1,\s*-1\)/);
 assert.equal(mu.medians.length,5);
 assert.match(html,/haqiHanziWritten\?\.\(\)/);
 assert.match(html,/haqiHanziComplete\(\)/);
 const intro=html.match(/async function introPlay[\s\S]*?\n\}/);
 assert.ok(intro);
 assert.doesNotMatch(intro[0],/haqiHanziWritten|haqiHanziComplete/);
});
test('xi writing embeds pinned makemeahanzi outlines and medians outside the dictionary',()=>{
 const html=read('hanzi/hanzi_xi.html');
 assert.match(html,/<title>西 xī /);
 assert.ok(html.includes('bddc96d41bef78427ed0e034e9f7e31d71fd1b92'));
 const xi=JSON.parse(html.match(/const XI = (\{.*\});/)[1]);
 assert.equal(xi.strokes.length,6);assert.equal(xi.medians.length,6);
 assert.equal(dictionary.entries.some(e=>e.text==='西'),false);
 assert.match(html,/translate\(0,\s*900\);\s*ctx\.scale\(1,\s*-1\)/);
 assert.match(html,/haqiHanziWritten\?\.\(\)/);
 assert.match(html,/haqiHanziComplete\(\)/);
 const intro=html.match(/async function introPlay[\s\S]*?\n\}/);
 assert.ok(intro);
 assert.doesNotMatch(intro[0],/haqiHanziWritten|haqiHanziComplete/);
});
test('kou writing embeds strokes.json outlines and medians without retuning',()=>{
 const kou=JSON.parse(read('data/adventure/hanzi/strokes.json')).characters['口'];
 const html=read('hanzi/hanzi_kou.html');
 assert.ok(html.includes(JSON.stringify({strokes:kou.strokes,medians:kou.medians})));
 assert.match(html,/translate\(0,\s*900\);\s*ctx\.scale\(1,\s*-1\)/);
 assert.equal(kou.medians.length,3);
 assert.match(html,/haqiHanziWritten\?\.\(\)/);
 assert.match(html,/haqiHanziComplete\(\)/);
});
test('er writing embeds strokes.json outlines and medians without retuning',()=>{
 const er=JSON.parse(read('data/adventure/hanzi/strokes.json')).characters['耳'];
 const html=read('hanzi/hanzi_er.html');
 assert.ok(html.includes(JSON.stringify({strokes:er.strokes,medians:er.medians})));
 assert.match(html,/translate\(0,\s*900\);\s*ctx\.scale\(1,\s*-1\)/);
 assert.equal(er.medians.length,6);
 assert.match(html,/haqiHanziWritten\?\.\(\)/);
 assert.match(html,/haqiHanziComplete\(\)/);
 const intro=html.match(/async function introPlay[\s\S]*?\n\}/);
 assert.ok(intro);
 assert.doesNotMatch(intro[0],/haqiHanziWritten|haqiHanziComplete/);
});
test('tian_field writing embeds strokes.json outlines and medians without retuning',()=>{
 const tian=JSON.parse(read('data/adventure/hanzi/strokes.json')).characters['田'];
 const html=read('hanzi/hanzi_tian_field.html');
 assert.ok(html.includes(JSON.stringify({strokes:tian.strokes,medians:tian.medians})));
 assert.match(html,/translate\(0,\s*900\);\s*ctx\.scale\(1,\s*-1\)/);
 assert.equal(tian.medians.length,5);
 assert.match(html,/haqiHanziWritten\?\.\(\)/);
 assert.match(html,/haqiHanziComplete\(\)/);
 const intro=html.match(/async function introPlay[\s\S]*?\n\}/);
 assert.ok(intro);
 assert.doesNotMatch(intro[0],/haqiHanziWritten|haqiHanziComplete/);
});
test('xin writing embeds strokes.json outlines and medians without retuning',()=>{
 const xin=JSON.parse(read('data/adventure/hanzi/strokes.json')).characters['心'];
 const html=read('hanzi/hanzi_xin.html');
 assert.ok(html.includes(JSON.stringify({strokes:xin.strokes,medians:xin.medians})));
 assert.match(html,/translate\(0,\s*900\);\s*ctx\.scale\(1,\s*-1\)/);
 assert.equal(xin.medians.length,4);
 assert.match(html,/haqiHanziWritten\?\.\(\)/);
 assert.match(html,/haqiHanziComplete\(\)/);
 const intro=html.match(/async function introPlay[\s\S]*?\n\}/);
 assert.ok(intro);
 assert.doesNotMatch(intro[0],/haqiHanziWritten|haqiHanziComplete/);
});
test('yun writing embeds strokes.json outlines and medians without retuning',()=>{
 const yun=JSON.parse(read('data/adventure/hanzi/strokes.json')).characters['云'];
 const html=read('hanzi/hanzi_yun.html');
 assert.ok(html.includes(JSON.stringify({strokes:yun.strokes,medians:yun.medians})));
 assert.match(html,/translate\(0,\s*900\);\s*ctx\.scale\(1,\s*-1\)/);
 assert.equal(yun.medians.length,4);
 assert.match(html,/haqiHanziWritten\?\.\(\)/);
 assert.match(html,/haqiHanziComplete\(\)/);
 const intro=html.match(/async function introPlay[\s\S]*?\n\}/);
 assert.ok(intro);
 assert.doesNotMatch(intro[0],/haqiHanziWritten|haqiHanziComplete/);
});
test('each painting supplies nonempty scene contours for a continuous glyph morph',()=>{
 const context={};vm.runInNewContext(read('hanzi/source/contours.js')+';globalThis.get=storyContours',context);for(const s of stories){const paths=context.get(s.theme);assert.ok(paths.length>=2);for(const points of paths){assert.ok(points.length>=2);assert.ok(points.flat().every(Number.isFinite));}}
});
test('jing, li, zhi, zhi_peak and chuan embed pinned makemeahanzi outlines and medians outside the dictionary',()=>{
 for(const [id,glyph,pinyin,varName,count] of [
  ['jing','径','jìng','JING',8],
  ['li','李','lǐ','LI',7],
  ['zhi','知','zhī','ZHI',8],
  ['zhi_peak','峙','zhì','ZHI_PEAK',9],
  ['chuan','传','chuán','CHUAN',6],
 ]){
  const html=read(`hanzi/hanzi_${id}.html`);
  assert.match(html,new RegExp(`<title>${glyph} ${pinyin} `));
  assert.ok(html.includes('bddc96d41bef78427ed0e034e9f7e31d71fd1b92'),id);
  const start=html.indexOf(`const ${varName} = {`);
  assert.ok(start>=0,`${id}: ${varName}`);
  let i=html.indexOf('{',start),depth=0;
  for(;i<html.length;i++){if(html[i]==='{')depth++;else if(html[i]==='}'&&--depth===0){i++;break;}}
  const data=vm.runInNewContext(`(${html.slice(html.indexOf('{',start),i)})`);
  assert.equal(data.strokes.length,count,id);
  assert.equal(data.medians.length,count,id);
  assert.equal(dictionary.entries.some(e=>e.text===glyph),false,id);
  assert.match(html,/haqiHanziWritten\?\.\(\)/,id);
  assert.match(html,/haqiHanziComplete(?:\?\.)?\(\)/,id);
  const intro=html.match(/async function introPlay[\s\S]*?\n\}/);
  assert.ok(intro,id);
  assert.doesNotMatch(intro[0],/haqiHanziWritten|haqiHanziComplete/,id);
 }
});
test('authored hanzi_*.html scripts compile cleanly and use forgiving trend-based stroke tracing without permanent drag.bad locks',()=>{
 const files=['chuan','er','guang','guo','huo','jing','kou','li','men','ming','mu','mu_eye','ren','ri','sen','shan','shi','shou','shui','tian_field','tu','wu','xi','xin','xiu','yu','yue','yun','zhi','zhi_peak'];
 for(const name of files){
  const html=read(`hanzi/hanzi_${name}.html`);
  const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  assert.ok(scripts.length>=1,`missing script in hanzi_${name}.html`);
  for(const code of scripts)assert.doesNotThrow(()=>new vm.Script(code.replace(/^\s*import\s+[^\n]+/gm,'')),`syntax error in hanzi_${name}.html`);
  assert.doesNotMatch(html,/drag\.bad\s*=\s*true|drag\.invalid\s*=\s*true/,`permanent poison flag remains in hanzi_${name}.html`);
 }
});
