import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {projectQuestJournal,journalQuestStatus,filterJournalQuests,focusJournalQuest} from '../js/adventure_quest_journal_core.js';
import {createQuestJournalLoader} from '../js/adventure_quest_journal.js';
import {createAdventure} from '../js/adventure_core.js';
const read=name=>JSON.parse(fs.readFileSync(new URL(`../data/adventure/${name}.json`,import.meta.url)));
const content=read('chapter'),catalog=read('quest-catalog'),journal=read('quest-journal');
test('compact journal excludes obsolete records and preserves original prerequisite and reward choices',()=>{
    const projected=projectQuestJournal(catalog);
    for(const row of projected.quests){
        const quest=content.quests.find(q=>q.id===row.id);
        if(quest){row.title=quest.title;row.description=quest.description;}
    }
    assert.deepEqual(projected,journal);
    assert.equal(journal.quests.length,427);
    const removed=new Set(catalog.quests.filter(q=>q.obsolete).map(q=>q.id));
    assert.equal(removed.size,257);
    assert.ok(journal.quests.every(q=>!removed.has(q.id)&&q.prerequisites.every(p=>!removed.has(p.id))));
    assert.equal(filterJournalQuests(catalog.quests).length,427);
    assert.equal(journal.quests.filter(q=>q.region==='fire').length,33);
    const boss=journal.quests.find(q=>q.id===62410);
    assert.ok(boss.objectives.some(g=>g.name==='冰魔伯爵'));
    assert.ok(boss.objectives.some(g=>g.name==='瘟疫领主真身'));
    const tutorial=journal.quests.find(q=>q.id===63001);
    assert.equal(tutorial.startNpc,'青龙');
    assert.ok(journal.quests.some(q=>q.rewards.some(r=>r.choice==='1'&&r.schoolFilter)));
    assert.ok(!JSON.stringify(journal).includes('dofunction'));
    assert.ok(JSON.stringify(journal).length<1000000);
});
test('displaying imported quests never grants eligibility or mutates character progress',()=>{
    const save=createAdventure(content,{name:'任务验收'}),before=JSON.stringify(save);
    assert.equal(journalQuestStatus(save,content,journal.quests.find(q=>q.id===63000)),'可接取');
    assert.equal(journalQuestStatus(save,content,journal.quests.find(q=>q.id===63001)),'未开启');
    assert.equal(journalQuestStatus(save,content,journal.quests.find(q=>q.id===62410)),'尚未开放');
    assert.equal(filterJournalQuests(journal.quests,{status:'原版已废除'},save,content).length,0);
    assert.equal(filterJournalQuests(journal.quests,{query:' 62410 '},save,content)[0].id,62410);
    assert.equal(filterJournalQuests(journal.quests,{region:'fire',query:'玄冰葫芦'},save,content).length>0,true);
    assert.equal(JSON.stringify(save),before);
    assert.equal(content.quests.length,14);
});
test('opening a tracked quest from another island selects that quest',()=>{
    const save=createAdventure(content,{name:'任务验收'});
    const quest=journal.quests.find(q=>q.title==='安格斯的困惑');
    const focused=focusJournalQuest(journal.quests,{region:'camp',status:''},quest.id,20,save,content);
    assert.equal(focused.filters.region,'fire');
    const visible=filterJournalQuests(journal.quests,focused.filters,save,content);
    assert.equal(visible.slice(focused.page*20,focused.page*20+20).some(q=>q.id===quest.id),true);
});
test('journal loader is lazy, shares downloads, and retries after network failure',async()=>{
    let calls=0;
    const loader=createQuestJournalLoader(async url=>{assert.equal(url,'data/adventure/quest-journal.json');calls++;if(calls===1)throw Error('offline');return journal;});
    assert.equal(calls,0);
    await assert.rejects(loader(),/offline/);
    const [a,b]=await Promise.all([loader(),loader()]);
    assert.equal(calls,2);assert.equal(a,b);assert.equal(a.quests.length,427);
});
