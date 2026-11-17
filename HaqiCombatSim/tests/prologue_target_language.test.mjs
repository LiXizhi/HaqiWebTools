import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {prologueScriptForTarget,prologueLight} from '../js/prologue/prologue_target_language_core.js';
import {languagePair,bilingual,validateScript,prologueRequested} from '../js/prologue/prologue_script_core.js';
import {wordCardRow} from '../js/prologue/prologue_battle_core.js';
import {validateWordCards} from '../js/word_cards_core.js';
const script=JSON.parse(fs.readFileSync(new URL('../data/prologue/script.json',import.meta.url)));
const cards=JSON.parse(fs.readFileSync(new URL('../data/adventure/dictionary/word-cards.json',import.meta.url))).cards;
test('prologue keeps Japanese and Korean targets through narrative, forge and spoken words',()=>{
 const before=JSON.stringify(script);
 for(const [target,pattern]of [['ja',/[ぁ-んァ-ン一-龯]/],['ko',/[가-힣]/]]){const pair=languagePair('zh-CN',target);assert.equal(pair.target,target);assert.equal(languagePair('en',target).target,target);assert.equal(prologueRequested('?prologue&second='+target).second,target);const localized=prologueScriptForTarget(script,target);validateScript(localized);const lines=localized.scenes.flatMap(s=>s.beats).filter(b=>b.text);for(const b of lines)assert.match(bilingual(b.text,pair).secondary,pattern);const light=prologueLight(target);assert.match(light.sentence,pattern);assert.equal(light.lang,target==='ja'?'ja-JP':'ko-KR');const row=wordCardRow(cards,target);assert.equal(row.language,target);assert.equal(row.readText,light.sentence);validateWordCards([row],{[row.baseCardKey]:{}});const writePrompt=localized.scenes.flatMap(s=>s.beats).filter(b=>b.text?.['zh-CN']).map(b=>b.text['zh-CN']).join('');assert.doesNotMatch(writePrompt,/写出“光”/);}
 assert.equal(JSON.stringify(script),before);
});

test('Japanese and Korean prologue uses a target-language listening interaction without Chinese writing credit',async()=>{
 const source=fs.readFileSync(new URL('../js/prologue/prologue_stage.js',import.meta.url),'utf8');
 for(const target of ['ja','ko']){
  const shown=[],spoken=[];let finish,hidden=0;
  const context=vm.createContext({getPair:()=>({native:'zh-CN',target}),prologueLight,showPrompt:x=>shown.push(x),speakBrowserText:(...args)=>spoken.push(args),wait:seconds=>{assert.equal(seconds,0);return new Promise(r=>{finish=r;});},hideDialog:()=>hidden++});
  vm.runInContext(source.slice(source.indexOf('    async function hanzi('),source.indexOf('    async function cardForge(')),context);
  let done=false;const pending=context.hanzi({}).then(x=>{done=true;return x;});
  await Promise.resolve();assert.equal(done,false);assert.equal(hidden,0);
  assert.ok(shown[0].text[target].includes(prologueLight(target).word));
  assert.deepEqual(spoken[0],[prologueLight(target).sentence,prologueLight(target).lang]);
  finish();const result=await pending;assert.equal(result.written,false);assert.equal(hidden,1);
 }
});
