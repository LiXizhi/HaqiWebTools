import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {projectQuestRuntime, catalogTalksForNpc} from '../js/adventure_catalog_quests_core.js';
import {projectRuntimeData} from '../scripts/package_runtime_data.mjs';
const read = name => JSON.parse(fs.readFileSync(new URL(`../data/adventure/${name}.json`, import.meta.url)));
const archive=read('quest-catalog'), chapter=read('chapter');
const runtime=projectQuestRuntime(archive,chapter.quests.map(q=>q.id));
const child=(node,tag)=>node?.children?.find(n=>n.tag===tag);
const rows=node=>((child(node,'dialog')||node)?.children||[]).filter(row=>child(row,'content')?.text||child(row,'buttons')?.children?.length);

test('every active archived dialogue and reply survives runtime and publication projection',()=>{
    assert.deepEqual(runtime,read('quest-runtime'));
    const packed=projectRuntimeData('adventure/quest-runtime.json',runtime);
    let count=0;
    for(const q of runtime.quests){
        const source=archive.quests.find(s=>s.id===q.id).data;
        const pairs=[[q.startDialog,rows(child(source,'StartDialog'))],[q.endDialog,rows(child(source,'EndDialog'))]];
        for(const [i,talk] of q.talks.entries())pairs.push([talk.dialog,rows(child(source,'ClientDialogNPC').children[i])]);
        for(const [actual,original] of pairs){
            assert.equal(actual.length,original.length);
            for(const [i,line] of actual.entries()){
                assert.equal(line.text,child(original[i],'content')?.text||'');
                assert.deepEqual(line.buttons,(child(original[i],'buttons')?.children||[]).map(b=>b.attributes));
                count++;
            }
        }
        const published=packed.quests.find(s=>s.id===q.id);
        for(const key of ['startDialog','endDialog','talks','groups','rewards','prerequisites'])assert.deepEqual(published[key],q[key]);
    }
    assert.equal(count,2135);
});

test('unsupported source branching fails instead of selecting the first answer',()=>{
    const copy=structuredClone(archive),q=copy.quests.find(q=>q.id===61076);
    const buttons=child(rows(child(q.data,'StartDialog'))[0],'buttons');
    buttons.children.push(structuredClone(buttons.children[0]));
    assert.throws(()=>projectQuestRuntime(copy,chapter.quests.map(q=>q.id)),/对白分支/);
});

test('talk entry is available only for unfinished accepted talk goals',()=>{
    const q=runtime.quests.find(q=>q.talks.length),talk=q.talks[0];
    const content={catalogQuests:{quests:[q]}},save={quests:{},inventory:{}};
    assert.equal(catalogTalksForNpc(save,content,talk.npcId).length,0);
    save.quests[q.id]={accepted:true,claimed:false,progress:{}};
    assert.equal(catalogTalksForNpc(save,content,talk.npcId).length,1);
    save.quests[q.id].progress[`talk:${talk.npcId}`]=999;
    assert.equal(catalogTalksForNpc(save,content,talk.npcId).length,0);
    save.quests[q.id].progress={};save.quests[q.id].claimed=true;
    assert.equal(catalogTalksForNpc(save,content,talk.npcId).length,0);
});

import { createQuestDialogueController } from '../js/adventure/quest_dialogue_controller.js';

test('real controller delays accept, reward and talk actions until final reply; closing cancels',async()=>{
    let callbacks;const actions=[];
    let dialog={npcId:30517},dialogDone=null;
    const ctrl=createQuestDialogueController({
        nodes:{overlay:{}},
        getContext:()=>({dialog,dialogDone,assets:{content:{quests:[]}},save:{},setDialog:v=>{dialog=v;},setDialogDone:v=>{dialogDone=v;}}),
        model:()=>({}),
        renderDialogue:(a,b,c,cb)=>{callbacks=cb;},
        applyAction:(s,c,a)=>{actions.push(a);return {};},
        close:()=>{dialog=null;dialogDone=null;},
        dialogueVoice:{speak(){}},
        toast(){},paintHud(){},persist(){},queueCloudSave(){},
        showRewards(){},
        islandSocial:()=>({activity(){}}),
        petScene:()=>({dialogue(){}}),
        missingRewardPets:()=>[],loadPet(){},
        safely:f=>f(),
        openPanel(){},travel(){},
        opening:{},wordLearning:{refreshWordGoals(){}},rewardFeedback:{hasPendingItems:false},
        languageAdventure:{open(){}},
    });
    ctrl.paintDialogue();
    const quest=runtime.quests.find(q=>q.id===61076);
    for(const [key,type,lines] of [['startCatalog','accept-catalog',quest.startDialog],['finishCatalog','claim-catalog',quest.endDialog]]){
        actions.length=0;dialog={npcId:quest.startNpc};callbacks[key](quest);
        assert.equal(actions.length,0);
        for(let i=0;i<lines.length-1;i++){await ctrl.nextDialogue();assert.equal(actions.length,0);}
        await ctrl.nextDialogue();assert.equal(actions.length,1);assert.equal(actions[0].type,type);
    }
    actions.length=0;dialog={npcId:quest.startNpc};callbacks.startCatalog(quest);dialog=null;dialogDone=null;await ctrl.nextDialogue();assert.equal(actions.length,0);
    const q=runtime.quests.find(q=>q.talks.length),talk=q.talks[0];dialog={npcId:talk.npcId};ctrl.startQuestTalk(talk,true);
    assert.equal(actions.length,0);
    for(let i=0;i<talk.dialog.length;i++)await ctrl.nextDialogue();
    assert.equal(actions[0].type,'talk');assert.equal(actions[0].npcId,talk.npcId);
});
