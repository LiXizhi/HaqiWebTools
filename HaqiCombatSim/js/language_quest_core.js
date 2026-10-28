import {coursePosition} from './language_course_core.js';
import {wordLanguage} from './word_lexicon_core.js';
import {islandFor} from './adventure_world_map_core.js';
import {catalogQuestStatus} from './adventure_catalog_quests_core.js';

export const isLanguageCourseId=id=>typeof id==='string'&&id.startsWith('course:');
export function languageQuestRows(data,state,language){
    return data.courses.filter(c=>c.language===language&&!c.legacyQuestIds).map(c=>{
        const next=coursePosition(state,c),progress=state.courses?.[c.id];
        return {id:`course:${c.id}`,courseId:c.id,learningLanguage:c.language,region:c.island,title:c.title,
            description:c.context||data.route.find(r=>r.island===c.island)?.theme||'',next,total:c.steps.length,
            status:next===c.steps.length?'已完成':next||progress?.acceptedAt?'进行中':'可接取',words:c.steps[next]?.words||[],objective:c.steps[next]?.objective||'',interaction:c.steps[next]?.interaction,battleWon:!!progress?.sceneWins?.[c.steps[next]?.id],course:c};
    });
}
// Display projection only: no synthetic numeric IDs or duplicate rewards in the adventure save.
export function recommendedLanguageQuest(save,content,rows,stats={}){
    if(!save.languageLearning?.enabled)return null;
    const language=wordLanguage(save.languageLearning.target),zone=islandFor(save.zone)?.id||save.zone;
    const legacy=(content.catalogQuests?.quests||[]).filter(q=>q.learningLanguage===language).map(q=>({...q,status:catalogQuestStatus(save,content,q,stats)}));
    const candidates=[...legacy,...rows.filter(q=>q.learningLanguage===language)];
    const available=candidates.filter(q=>['可接取','进行中','可交付'].includes(q.status));
    const active=q=>q.status==='进行中'||q.status==='可交付';
    return available.find(q=>q.region===zone&&active(q))||available.find(q=>q.region===zone)||available.find(active)||available[0]||candidates.find(q=>q.region===zone&&q.status==='已完成')||null;
}
export function withLanguageQuest(entries,quest){
    if(!quest)return entries;
    return [{id:quest.id,languageQuest:quest},...entries.filter(e=>e.id!==quest.id)].slice(0,3);
}
export function languageSceneTarget(row,world){
    if(!row?.interaction||world?.zone!==row.region)return null;
    const target=row.battleWon?row.course.steps[0].interaction:row.interaction;
    const list=target.kind==='npc'?world.npcs:target.kind==='landmark'?world.landmarks:world.encounters;
    const found=list?.find(o=>String(o.id)===String(target.id));
    return found?{...found,kind:target.kind,languageCourseId:row.id,questDialogue:true}:null;
}
