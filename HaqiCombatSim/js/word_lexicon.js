import {wordLanguage,parseWordLexicon,buildWordIndex} from './word_lexicon_core.js';
// File URLs stay external assets in Vite and work with a plain HTTP server.
const urls={zh:new URL('../data/adventure/locale/word_zh.txt',import.meta.url),en:new URL('../data/adventure/locale/word_en.txt',import.meta.url),ja:new URL('../data/adventure/locale/word_ja.txt',import.meta.url),ko:new URL('../data/adventure/locale/word_ko.txt',import.meta.url)};
export function createWordLexiconLoader(fetchText=async url=>{const r=await fetch(url);if(!r.ok)throw Error('词库暂时无法加载');return r.text();}){
 const cache=new Map();
 return function load(language){language=wordLanguage(language);if(!urls[language])return Promise.reject(Error('不支持的词库语言'));
  if(!cache.has(language)){const task=Promise.resolve().then(()=>fetchText(urls[language])).then(async text=>{
   const data=parseWordLexicon(text,language);
   if(language!=='zh'){const chinese=await load('zh'),keys=new Set(chinese.data.keys);if(data.keys.length!==keys.size||data.keys.some(key=>!keys.has(key)))throw Error('词库中文键不一致');}
   return buildWordIndex(data);
  }).catch(error=>{cache.delete(language);throw error;});cache.set(language,task);}return cache.get(language);
 };
}
export const loadWordLexicon=createWordLexiconLoader();
