import {canonicalWord} from './word_lexicon_core.js';

export function validateLanguageCurriculum(data,index){
    if(data?.version!==1||data.language!==index.language||!data.id||!Number.isInteger(data.level)||data.level<0||!Array.isArray(data.words))throw Error('语言课程词表无效');
    const ids=new Set(),entries=new Set();
    for(const word of data.words){
        if(!word.id||ids.has(word.id)||!word.entryId||entries.has(word.entryId)||canonicalWord(index,word.word)!==word.entryId||!index.entries.has(word.entryId)||typeof word.meaning!=='string'||!word.meaning.trim())throw Error('课程词条未规范映射或重复');
        ids.add(word.id);entries.add(word.entryId);
    }
    return data;
}

// Availability is not eligibility: recentWordCards still requires actual
// practice evidence. No curriculum word is granted to a learner here.
export function curriculumWordCards(data,index,baseCardKey){
    validateLanguageCurriculum(data,index);
    return data.words.map(word=>({id:`${data.language}:${word.entryId}`,language:data.language,entryId:word.entryId,treeEntryId:word.entryId,title:word.word,readText:word.word,description:word.meaning,baseCardKey}));
}

export function mergeCurriculumWordCards(existing,additional){
    const ids=new Set(existing.map(row=>row.id));
    return [...existing,...additional.filter(row=>{if(ids.has(row.id))return false;ids.add(row.id);return true;})];
}
