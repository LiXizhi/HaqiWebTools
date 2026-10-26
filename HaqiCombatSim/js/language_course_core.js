import {WORD_LANGUAGES,canonicalWord,matchWordText} from './word_lexicon_core.js';
import {recordEffectivePractice} from './language_practice_core.js';
import {wordReadingMatches} from './word_cards_core.js';
import {defaultParams} from './combat_params_core.js';

export function validateLanguageCourses(data,indexes){
    if(data?.version!==1||!Array.isArray(data.route)||!Array.isArray(data.courses))throw Error('学习路线无效');
    const ids=new Set(),zones=new Set(data.route.map(r=>r.island));
    for(const c of data.courses){
        if(ids.has(c.id)||!WORD_LANGUAGES.includes(c.language)||!zones.has(c.island)||!c.steps?.length)throw Error('学习故事无效');
        ids.add(c.id);const steps=new Set(),index=indexes[c.language];
        for(const s of c.steps){
            if(steps.has(s.id)||![s.prompt,s.answer,s.ending].every(v=>typeof v==='string'&&v.trim())||!s.words?.length||s.words.length>3)throw Error('学习对白无效');
            if(c.sceneVersion&&(!['npc','landmark','encounter'].includes(s.interaction?.kind)||!s.interaction.id||!s.interaction.name||![s.intro,s.objective,s.hint,s.promptGloss,s.answerGloss,s.endingGloss].every(v=>typeof v==='string'&&v.trim())))throw Error('场景任务缺少真实互动对象或入门引导');
            steps.add(s.id);
            if(s.alternatives!==undefined&&(!Array.isArray(s.alternatives)||s.alternatives.some(a=>!a||typeof a.id!=='string'||!a.id.trim()||typeof a.answer!=='string'||!a.answer.trim()||typeof a.answerGloss!=='string'||!a.answerGloss.trim())||new Set(s.alternatives.map(a=>a.id)).size!==s.alternatives.length))throw Error('替代表达缺少唯一编号、台词或释义');
            if(index)for(const reply of [s,...(s.alternatives||[])]){const heard=new Set(matchWordText(index,reply.answer).map(w=>w.id));if(s.words.some(w=>!canonicalWord(index,w)||!heard.has(canonicalWord(index,w))))throw Error(`学习词条未核验：${c.id}/${s.id}`);}
        }
    }
    return data;
}
export function coursePosition(state,course){const progress=state.courses?.[course.id];return Math.min(course.steps.length,(course.sceneVersion?progress?.scene?.next:progress?.next)||0);}
// Author-reviewed alternatives are local and deterministic. They must retain
// this round's explicit targets; an AI judgement cannot grant course progress.
export function courseAcceptedAnswer(step,text){return [step,...(step.alternatives||[])].find(reply=>wordReadingMatches(text,reply.answer))||null;}
export function courseInteractionMatches(course,step,event){
    if(!course.sceneVersion)return true;
    const target=step.interaction,proof=event?.interaction;
    const range=event.interactionRange??defaultParams('kids').languageAdventure.interactionRange;
    return !!target&&proof?.zone===course.island&&proof.kind===target.kind&&String(proof.id)===String(target.id)&&(target.kind==='encounter'?proof.won===true:Number.isFinite(proof.distance)&&proof.distance<=range);
}
export function completeCourseStep(state,course,stepId,answer,event,index){
    const next=coursePosition(state,course),step=course.steps[next];
    if(index.language!==course.language||!step||step.id!==stepId||!courseInteractionMatches(course,step,event)||!courseAcceptedAnswer(step,answer))return false;
    if(!recordEffectivePractice(state,{...event,valid:true,words:step.words,source:'island-course'},index))return false;
    state.courses??={};state.courses[course.id]={...state.courses[course.id],...(course.sceneVersion?{scene:{version:course.sceneVersion,next:next+1}}:{next:next+1}),updatedAt:event.at};return true;
}
export function courseWordCards(data,indexes,baseCardKey){
    const rows=new Map();
    for(const course of data.courses.filter(c=>indexes[c.language]))for(const step of course.steps)for(const word of step.words){
        const entryId=canonicalWord(indexes[course.language],word);if(!entryId)throw Error('学习词条未收录');
        const entry=indexes[course.language].entries.get(entryId),id=`${course.language}:${entryId}`;
        if(!rows.has(id))rows.set(id,{id,language:course.language,entryId,treeEntryId:entryId,title:entry.text,readText:step.answer,description:entry.meaning||entry.text,baseCardKey});
    }
    return [...rows.values()];
}
