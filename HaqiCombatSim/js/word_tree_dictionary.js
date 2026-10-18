import {WordTree} from './word_tree.js';
import {seedDictionaryTree} from './language_tree_dictionary_core.js';
import {createMasterySync} from './language_tree_mastery_sync.js';
import {masteryCloud} from './language_tree_mastery_cloud.js';
import {languageTreeStore,flushLanguageTreeCapture} from './language_tree_capture.js';
export async function mountDictionaryWordTree({root,key,getKey,online,request,data,onUnknown,owner,role}){
 await flushLanguageTreeCapture();if(!root.isConnected||getKey()!==key)return ()=>{};
 const language=data.language,localKey=language==='en'?key:key+':zh';
 await languageTreeStore.update(localKey,state=>seedDictionaryTree(state,data));
 if(!root.isConnected||getKey()!==key)return ()=>{};
 let active=true;const valid=()=>active&&root.isConnected&&getKey()===key;
 const sync=owner?createMasterySync({key:localKey,getKey:()=>valid()?localKey:null,store:languageTreeStore,language,remote:masteryCloud({owner,role,valid})}):null;
 const tree=new WordTree(root,{key:localKey,getKey:()=>valid()?localKey:null,online,request,store:languageTreeStore,data,onUnknown,onMastery:()=>sync?.sync(),syncMastery:()=>sync?.sync()});
 root.wordTree=tree;
 void tree.ready.catch(error=>{if(valid()){tree.dispose();root.textContent=error.message;delete root.wordTree;}});
 return ()=>{active=false;tree.dispose();delete root.wordTree;};
}
