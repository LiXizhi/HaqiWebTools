import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {projectQuestJournal} from '../js/adventure_quest_journal_core.js';
import {projectQuestRuntime} from '../js/adventure_catalog_quests_core.js';
export function prepareQuestJournal(root) {
    const catalog=JSON.parse(fs.readFileSync(path.join(root,'data/adventure/quest-catalog.json'),'utf8'));
    const chapter=JSON.parse(fs.readFileSync(path.join(root,'data/adventure/chapter.json'),'utf8'));
    const payload=projectQuestJournal(catalog);
    const runtime=projectQuestRuntime(catalog,chapter.quests.map(q=>q.id));
    fs.writeFileSync(path.join(root,'data/adventure/quest-journal.json'),JSON.stringify(payload,null,2)+'\n');
    fs.writeFileSync(path.join(root,'data/adventure/quest-runtime.json'),JSON.stringify(runtime,null,2)+'\n');
    return payload;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
    const root=fileURLToPath(new URL('../',import.meta.url));
    console.log(`已准备 ${prepareQuestJournal(root).quests.length} 条任务展示数据`);
}
