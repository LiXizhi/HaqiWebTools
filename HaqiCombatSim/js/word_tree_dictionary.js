import {WordTree} from './word_tree.js';
import {seedDictionaryTree} from './language_tree_dictionary_core.js';
import {createMasterySync} from './language_tree_mastery_sync.js';
import {masteryCloud} from './language_tree_mastery_cloud.js';
import {languageTreeStore,flushLanguageTreeCapture} from './language_tree_capture.js';
import {loadWordLexicon} from './word_lexicon.js';
import {wordTreeKey,migrateWordLexicon,seedWordLexicon} from './word_lexicon_core.js';
export async function mountDictionaryWordTree({root,key,getKey,online,request,data,onUnknown,owner,role,onConfirmed,secondaryLanguage}){
 await flushLanguageTreeCapture();if(!root.isConnected||getKey()!==key)return ()=>{};
 const language=data.language,localKey=wordTreeKey(key,language),index=await loadWordLexicon(language);
 if(!root.isConnected||getKey()!==key)return ()=>{};
 await languageTreeStore.update(localKey,state=>{if(getKey()!==key||!root.isConnected)return;migrateWordLexicon(state,index);seedWordLexicon(state,index);seedDictionaryTree(state,data);});
 if(!root.isConnected||getKey()!==key)return ()=>{};
 let active=true;const valid=()=>active&&root.isConnected&&getKey()===key;
 const sync=owner&&['en','zh'].includes(language)?createMasterySync({key:localKey,getKey:()=>valid()?localKey:null,store:languageTreeStore,language,onConfirmed:(language,words)=>{if(valid())return onConfirmed?.(language,words);},remote:masteryCloud({owner,role,valid}),index}):null;
 const tree=new WordTree(root,{key:localKey,getKey:()=>valid()?localKey:null,online,request,store:languageTreeStore,data,index,secondaryLanguage,onUnknown,onMastery:()=>sync?.sync(),syncMastery:()=>sync?.sync()});
 root.wordTree=tree;
 void tree.ready.catch(error=>{if(valid()){tree.dispose();root.textContent=error.message;delete root.wordTree;}});
 return ()=>{active=false;tree.dispose();delete root.wordTree;};
}
