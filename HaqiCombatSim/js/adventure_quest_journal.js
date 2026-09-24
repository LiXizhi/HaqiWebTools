// Optional browser IO; failed requests are retryable and never affect saves.
import {createJsonReader} from './runtime_data.js';
export function createQuestJournalLoader(readJson=createJsonReader()) {
    let pending;
    return ()=>pending??=(readJson('data/adventure/quest-journal.json').then(data=>{
        if(data?.version!==1||!Array.isArray(data.quests)||!data.quests.length)throw Error('任务目录格式不正确');
        return data;
    }).catch(error=>{pending=null;throw error;}));
}
