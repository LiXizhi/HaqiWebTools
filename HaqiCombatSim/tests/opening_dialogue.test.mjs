import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=path=>JSON.parse(fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8'));
const chapter=read('data/adventure/chapter.json'),config=read('config/opening-dialogue.json');
test('opening dialogue stays compact and preserves speakers and completion actions',()=>{
    let count=0;
    for(const q of chapter.quests){
        const authored=config.quests[q.id];
        assert.equal(q.description,authored.description);
        const sections=[[q.startDialog,q.startNpc,'doaccept',authored.startDialog],
            [q.endDialog,q.endNpc,'dofinished',authored.endDialog],
            ...q.talks.map(t=>[t.dialog,t.npcId,'donpcdialoged',authored.talks[t.npcId].dialog])];
        for(const [lines,npcId,action,entries] of sections){
            assert.equal(lines.length,entries.length);
            assert.ok(lines.length>=1&&lines.length<=2);
            count+=lines.length;
            lines.forEach((line,i)=>{
                assert.equal(line.npcId,npcId);
                assert.equal(line.text,entries[i].text);
                assert.ok(line.text.length<=60);
                assert.doesNotMatch(line.text,/快捷键|鼠标|WASD|NEXT|旋转|选修|尚未开放|留待以后/);
                assert.ok(line.buttons[0].label.length<=6);
                assert.equal(line.buttons[0].action,i===lines.length-1?action:'gotonext');
            });
        }
        const row=read('data/adventure/quest-journal.json').quests.find(r=>r.id===q.id);
        assert.equal(row.description,q.description);
    }
    assert.equal(count,37);
});

test('life training dialogue points to the actual reward NPC name',()=>{
 const quest=chapter.quests.find(q=>q.id===63005),name=chapter.npcs[quest.endNpc].name;
 assert.ok(quest.description.includes(name));assert.ok(quest.startDialog.some(line=>line.text.includes(name)));
});
