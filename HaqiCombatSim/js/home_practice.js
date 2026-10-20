import {languageTreeContext,languageTreeStore} from './language_tree_capture.js';
import {loadWordLexicon} from './word_lexicon.js';
import {wordTreeKey,seedWordLexicon,migrateWordLexicon,matchWordText} from './word_lexicon_core.js';
import {recordEffectivePractice} from './language_practice_core.js';
export async function recordHomePractice({id,input,item,language,at},valid=()=>true){
 const context=languageTreeContext();if(!context?.key)return false;
 const index=await loadWordLexicon(language);if(!valid()||languageTreeContext()?.key!==context.key)return false;
 const words=item.practiceWords?.[language]||matchWordText(index,item[language==='en'?'en':'zh']).map(w=>w.id);
 const result=await languageTreeStore.update(wordTreeKey(context.key,language),state=>{if(!valid())return;migrateWordLexicon(state,index);seedWordLexicon(state,index);return recordEffectivePractice(state,{id,input,words,at,valid:true},index);});
 if(!result.persisted)throw Error('词语练习尚未保存，请重试');
 return true;
}
