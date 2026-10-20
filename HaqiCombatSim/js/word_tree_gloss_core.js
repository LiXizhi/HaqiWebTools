import {treeGlossary} from './language_tree_gloss_core.js';
import {wordLanguage} from './word_lexicon_core.js';

export function wordTreeGlossary(entries,index,{secondaryLanguage,englishIndex}={}){
 if(index.language!=='zh'){
  return treeGlossary(entries,Object.fromEntries(index.data.entries.map(e=>[e.id,e.meaning])));
 }
 // An explicit empty gloss means one label, not a missing-definition placeholder.
 const glossary=new Map([...entries,...index.data.entries].map(e=>[e.text.toLowerCase(),'']));
 if(wordLanguage(secondaryLanguage)!=='en'||!englishIndex)return glossary;
 for(const key of glossary.keys()){
  const ids=englishIndex.senses.get(`zh:${key}`);
  const first=ids?.values().next().value;
  if(first)glossary.set(key,englishIndex.entries.get(first).text);
 }
 return glossary;
}
