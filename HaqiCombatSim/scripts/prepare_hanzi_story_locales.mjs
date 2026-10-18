import fs from 'node:fs';
import {stories} from '../hanzi/source/stories.mjs';
import {translations,common} from '../hanzi/source/translations.mjs';
import {parseLocaleFile,formatLocaleLine} from '../js/locale_core.js';
const dictionary=JSON.parse(fs.readFileSync(new URL('../data/adventure/dictionary/zh.json',import.meta.url),'utf8'));
const fields=['title','intro','action','change','form','finale'];
const rows=[...common];
for(const s of stories){for(let i=0;i<fields.length;i++)rows.push([s[fields[i]],...['en','ja','ko'].map(l=>translations[s.id][l][i])]);const n=dictionary.entries.find(e=>e.text===s.glyph).strokes.strokes.length;for(let i=1;i<=n;i++)rows.push([`第 ${i} 笔，共 ${n} 笔。`,`Stroke ${i} of ${n}.`,`${n}画中の${i}画目。`,`${n}획 중 ${i}번째 획.`]);}
for(const [index,locale]of ['en','ja','ko'].entries()){
  const file=new URL(`../data/adventure/locale/${locale}.txt`,import.meta.url),text=fs.readFileSync(file,'utf8'),table=parseLocaleFile(text),add=[];
  for(const row of rows){if(!row[index+1])throw Error(`Missing ${locale}: ${row[0]}`);if(!table[row[0]]){table[row[0]]=row[index+1];add.push(formatLocaleLine(row[0],row[index+1]));}}
  if(process.argv.includes('--check')){if(add.length)throw Error(`${locale}: ${add.length} missing story translations`);}else if(add.length)fs.appendFileSync(file,`\n# 2026-10-18 字源岛独立动画\n${add.join('\n')}\n`);
  console.log(`${locale}: ${add.length} ${process.argv.includes('--check')?'missing':'added'}`);
}
