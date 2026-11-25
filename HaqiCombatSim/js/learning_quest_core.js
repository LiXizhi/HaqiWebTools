import {wordLanguage} from './word_lexicon_core.js';

export function isHanziIslandStory(quest){
    if(!quest||quest.learningLanguage!=='zh')return false;
    if(quest.island==='hanzi'||quest.region==='hanzi')return true;
    const id=Number(quest.id);
    return Number.isInteger(id)&&id>=873100&&id<=873105;
}

export function learningQuestMatches(save,quest){
    if(!quest?.learningLanguage)return true;
    if(wordLanguage(save?.languageLearning?.target)===quest.learningLanguage)return true;
    return !!(save?.hanziStoryExplore&&isHanziIslandStory(quest));
}

export function toggleHanziStoryExplore(save,enabled){
    const next=enabled===undefined?!save.hanziStoryExplore:Boolean(enabled);
    if(next)save.hanziStoryExplore=true;
    else delete save.hanziStoryExplore;
    save.revision=(save.revision||0)+1;
    return {
        changed:true,
        enabled:next,
        message:next
            ?'已开启字源岛汉字故事探索（保留你原本的主学习语言），现在可以收集 30 个象形字与 6 集字源故事。'
            :'已关闭字源岛跨语种故事探索，已完成的进度仍会保留。',
    };
}
