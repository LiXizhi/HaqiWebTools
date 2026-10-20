// Word-level dictionary meanings only. Never use a sentence translation as a word gloss.
export function treeGlossary(entries,supplement={}){const result=new Map(Object.entries(supplement));for(const e of entries){if(!e.meaning)continue;result.set(e.text.toLowerCase(),e.meaning);for(const form of e.forms||[])result.set(form.toLowerCase(),e.meaning);}return result;}
export function treeGloss(word,glossary){return glossary.get(String(word).toLowerCase())??'释义待补充';}
