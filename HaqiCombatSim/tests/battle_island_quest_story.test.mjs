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

test('real controller delays accept, reward and talk actions until final reply; closing cancels',async()=>{
    const app=fs.readFileSync(new URL('../js/adventure_app.js',import.meta.url),'utf8');
    const code=app.slice(app.indexOf('function paintDialogue(){'),app.indexOf('function interact(target)'));
    let callbacks;const actions=[];
    const context=vm.createContext({dialog:{npcId:30517},dialogDone:null,assets:{content:{}},save:{},nodes:{overlay:{}},model:()=>({}),
        V:{renderDialogue:(a,b,c,cb)=>{callbacks=cb;}},close:()=>{context.dialog=null;context.dialogDone=null;},mapDialogue(){},dialogueVoice:{speak(){}},
        A:{applyAction:(s,c,a)=>{actions.push(a);return {};},currentQuest:()=>null},toast(){},paintHud(){},persist(){},queueCloudSave(){},
        finishTrackedDialogue:()=>false,rewardSnapshot:()=>({}),showRewards(){},islandSocial:{activity(){}},petScene:{dialogue(){}},
        missingRewardPets:()=>[],loadPet(){},safely:f=>f(),openPanel(){},travel(){},track(){}});
    vm.runInContext(code,context);context.paintDialogue();
    const quest=runtime.quests.find(q=>q.id===61076);
    for(const [key,type,lines] of [['startCatalog','accept-catalog',quest.startDialog],['finishCatalog','claim-catalog',quest.endDialog]]){
        actions.length=0;context.dialog={npcId:quest.startNpc};callbacks[key](quest);
        assert.equal(actions.length,0);
        for(let i=0;i<lines.length-1;i++){await context.nextDialogue();assert.equal(actions.length,0);}
        await context.nextDialogue();assert.equal(actions.length,1);assert.equal(actions[0].type,type);
    }
    actions.length=0;context.dialog={npcId:quest.startNpc};callbacks.startCatalog(quest);context.close();await context.nextDialogue();assert.equal(actions.length,0);
    const q=runtime.quests.find(q=>q.talks.length),talk=q.talks[0];context.dialog={npcId:talk.npcId};context.startQuestTalk(talk,true);
    assert.equal(actions.length,0);
    for(let i=0;i<talk.dialog.length;i++)await context.nextDialogue();
    assert.equal(actions[0].type,'talk');assert.equal(actions[0].npcId,talk.npcId);
});
