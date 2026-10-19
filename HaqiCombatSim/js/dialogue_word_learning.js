import {loadWordLexicon} from './word_lexicon.js';
import {wordLanguage,wordTreeKey,migrateWordLexicon,seedWordLexicon,localWordMapping} from './word_lexicon_core.js';
import {languageTreeStore,languageTreeContext} from './language_tree_capture.js';
import {setTreeMark} from './language_tree_core.js';
// Shared state/IO adapter: views emit intent and never choose persistence paths.
export async function createDialogueWordLearning(lines){
 const context=languageTreeContext();if(!context?.key)return null;
 const valid=()=>{const now=languageTreeContext();return now?.key===context.key&&now?.epoch===context.epoch;};
 const indexes=await Promise.all(lines.map(line=>loadWordLexicon(line.locale)));if(!valid())return null;
 const language=wordLanguage(lines[0].locale),key=wordTreeKey(context.key,language),index=indexes[0];
 let result=await languageTreeStore.read(key);if(!valid())return null;
 if(result.state.lexiconVersion!==1||result.state.lexiconSeedVersion!==1)result=await languageTreeStore.update(key,state=>{if(!valid())return;migrateWordLexicon(state,index);seedWordLexicon(state,index);});if(!valid())return null;
 let state=result.state;
 return {valid,language,index,indexes,get state(){return state;},mapping:()=>localWordMapping(lines,indexes,state),subscribe:listener=>languageTreeStore.subscribe(key,result=>{if(valid()){state=result.state;listener();}}),async refresh(){const r=await languageTreeStore.read(key);if(valid())state=r.state;},
  async mark(id,mark){if(!valid())return;const r=await languageTreeStore.update(key,s=>{if(!valid())return;if(!Object.hasOwn(s.words,id))s.words[id]={id,ordinal:s.sequence++,source:'dialogue:model',label:'对话词语',count:0,firstAt:0,lastAt:0,interval:0,mark:null,contexts:[],relations:[],evidence:[]};setTreeMark(s,id,mark);});if(valid())state=r.state;return r;}};
}
