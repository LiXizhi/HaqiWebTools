import {emptyLanguageTree,recordTreeExposure,wordAliases} from '../../js/language_tree_core.js';
export const TEN_EXAMPLE_IDS=['hello','friend','please','door','open','thanks','yes','help','mother','home'];
export function tenDictionaryExamples(entries){return TEN_EXAMPLE_IDS.map(id=>{const e=entries.find(e=>e.id===id);if(!e)throw Error(`缺少例句：${id}`);return {source:`dictionary:${id}`,label:`字典学习：${e.text}`,text:e.example,zh:e.translation};});}
export function buildExampleTree(rows,entries,at){const state=emptyLanguageTree(),aliases=wordAliases(entries);for(const [i,row] of rows.entries())recordTreeExposure(state,{...row,locale:'en',at:at+i*120000},aliases);return state;}
