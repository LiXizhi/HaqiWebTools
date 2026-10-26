import {loadWordLexicon} from './word_lexicon.js';
import {WORD_LANGUAGES,wordTreeKey,migrateWordLexicon,seedWordLexicon,canonicalWord} from './word_lexicon_core.js';
import {languageTreeStore,languageTreeContext} from './language_tree_capture.js';
import {recordEffectivePractice,recordComprehensionPractice} from './language_practice_core.js';
import {validateLanguageCourses,courseWordCards} from './language_course_core.js';
import {curriculumWordCards} from './language_curriculum_core.js';

let source;
let englishCurriculum;
function loadEnglishCurriculum(){
    englishCurriculum??=fetch(new URL('../data/adventure/curriculum/english-level-one.json',import.meta.url)).then(r=>{if(!r.ok)throw Error('英语基础词表暂时无法加载');return r.json();}).catch(error=>{englishCurriculum=null;throw error;});
    return englishCurriculum;
}
const pending=new Map();
export function loadLanguageCourses(language=null){
    const languages=language?[language]:WORD_LANGUAGES,key=languages.join(',');
    if(languages.some(l=>!WORD_LANGUAGES.includes(l)))return Promise.reject(Error('该语言的岛屿学习故事正在准备中'));
    source??=fetch(new URL('../data/adventure/island-language-courses.json',import.meta.url)).then(r=>{if(!r.ok)throw Error('学习路线加载失败');return r.json();}).catch(e=>{source=null;throw e;});
    if(!pending.has(key))pending.set(key,Promise.all([source,Promise.all(languages.map(loadWordLexicon))]).then(([data,values])=>{
        const indexes=Object.fromEntries(languages.map((l,i)=>[l,values[i]]));return {data:validateLanguageCourses(data,indexes),indexes};
    }).catch(e=>{pending.delete(key);throw e;}));
    return pending.get(key);
}
export async function loadCourseCards(baseCardKey,language=null){
    const [{data,indexes},curriculum]=await Promise.all([loadLanguageCourses(language),!language||language==='en'?loadEnglishCurriculum():null]);
    const rows=courseWordCards(data,indexes,baseCardKey),ids=new Set(rows.map(r=>r.id));
    // Keep existing story card definitions and frozen checkpoints unchanged.
    if(curriculum)rows.push(...curriculumWordCards(curriculum,indexes.en,baseCardKey).filter(r=>!ids.has(r.id)));
    return rows;
}
export async function readPracticeCards(key,language,legacy,rows){
    const {state,persisted}=await languageTreeStore.read(wordTreeKey(key,language));
    if(!persisted)throw Error('词语记录暂时无法读取');
    const result=structuredClone(legacy);result.languages??={};result.languages[language]??={entries:{}};result.languages[language].entries??={};
    const index=await loadWordLexicon(language);
    for(const row of rows.filter(r=>r.language===language)){
        const id=row.treeEntryId||canonicalWord(index,row.entryId)||canonicalWord(index,row.title),word=state.words?.[id],at=word?.lastPractice?.at;
        if(at){const entries=result.languages[language].entries;entries[row.entryId]={...entries[row.entryId],lastAttemptAt:Math.max(entries[row.entryId]?.lastAttemptAt||0,at)};}
    }
    return result;
}
export async function recordWordPractice({language,words,id,input='text',at=Date.now(),source='word-card',review,assisted,attempts,heard},valid=()=>true){
    const context=languageTreeContext();if(!context?.key)throw Error('当前角色尚未准备好');
    const index=await loadWordLexicon(language),same=()=>valid()&&languageTreeContext()?.key===context.key&&languageTreeContext()?.epoch===context.epoch;
    if(!same())throw Error('练习已结束');
    const result=await languageTreeStore.update(wordTreeKey(context.key,language),state=>{
        if(!same())throw Error('练习已结束');migrateWordLexicon(state,index);seedWordLexicon(state,index);
        return (['read','listen'].includes(input)?recordComprehensionPractice:recordEffectivePractice)(state,{id,input,at,source,review,assisted,attempts,heard,valid:true,words},index);
    });
    if(!result.persisted)throw Error('词语练习尚未保存，请重试');return result;
}
