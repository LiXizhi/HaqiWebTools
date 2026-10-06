import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createAdventure,catalogStatSnapshot} from '../js/adventure_core.js';
import {questMarker} from '../js/adventure_renderer.js';
import {createQuestMarkerCache} from '../js/adventure_quest_marker_cache_core.js';

function fixture(){
    const content=JSON.parse(fs.readFileSync(new URL('../data/adventure/chapter.json',import.meta.url)));
    const save=createAdventure(content);content.quests=[];
    const quest={id:61080,region:'camp',startNpc:1,endNpc:2,prerequisites:[],requirements:[{id:214,min:10,max:null}],groups:[{kind:'talk',condition:0,items:[{id:1,count:1}]}]};
    content.catalogQuests={quests:[quest],byId:{61080:quest}};
    save.trackedQuestIds=[61080];save.level=10;
    let checks=0,stats=0;
    const cache=createQuestMarkerCache((...args)=>{checks++;return questMarker(...args);},(...args)=>{stats++;return catalogStatSnapshot(...args);});
    return {content,save,cache,counts:()=>({checks,stats})};
}

test('stationary, moving, health and clock frames reuse positive and absent NPC markers',()=>{
    const {content,save,cache,counts}=fixture();
    for(let frame=0;frame<300;frame++){
        save.position.x++;save.heroHp=frame;save.careAt=frame;save.revision++;
        const marker=cache.forState(save,content);
        assert.equal(marker(1),'!');assert.equal(marker(2),null);assert.equal(marker(99),null);
    }
    assert.deepEqual(counts(),{checks:3,stats:1},'each NPC once, all NPCs share one stat snapshot');
});

test('in-place level, acceptance, talk progress, claim and tracking edits refresh immediately',()=>{
    const {content,save,cache}=fixture();const read=id=>cache.forState(save,content)(id);
    assert.equal(read(1),'!');save.level=9;assert.equal(read(1),null);
    save.level=10;assert.equal(read(1),'!');save.trackedQuestIds=[];assert.equal(read(1),null);
    save.trackedQuestIds=[61080];assert.equal(read(1),'!');
    save.quests[61080]={accepted:true,claimed:false,progress:{}};assert.equal(read(1),'…');
    save.quests[61080].progress['talk:1']=1;assert.equal(read(1),null);assert.equal(read(2),'?');
    save.quests[61080].claimed=true;assert.equal(read(2),null);
});

test('stat dependency edits invalidate once and agree with uncached quest checks',()=>{
    const {content,save,cache,counts}=fixture();
    const edits=[
        ()=>{save.inventory[1912]=1;save.equipment[11]=1912;},
        ()=>{save.upgrades[1912]=1;},
        ()=>{save.equipmentInstances=[{guid:'a',gsid:1912,serverdata:{addlel:1}}];save.equipmentGuids[11]='a';},
        ()=>{save.equipmentInstances[0].serverdata.gem={ins:[],holecnt:1};},
        ()=>{save.equipmentInstances[0].serverdata.addlel=2;},
        ()=>{save.equipmentGuids[11]='b';},
        ()=>{save.mountId=999;},
        ()=>{save.inventory[1912]=0;},
        ()=>{save.school='ice';},
        ()=>{save.pendingEncounter={equipmentStatsVersion:2,progressionRulesVersion:3,magicStarLevel:0};},
        ()=>{save.pendingEncounter.progressionRulesVersion=2;},
        ()=>{save.zone='ice';},
    ];
    cache.forState(save,content)(1);
    for(const edit of edits){
        edit();const before=counts().checks;
        assert.equal(cache.forState(save,content)(1),questMarker(save,content,1));
        assert.equal(cache.forState(save,content)(1),questMarker(save,content,1));
        assert.equal(counts().checks,before+1);
    }
});

test('role replacement, scene/content replacement and explicit invalidation discard cached results',()=>{
    const {content,save,cache,counts}=fixture();let scope={};
    cache.forState(save,content,scope)(1);
    cache.forState(structuredClone(save),content,scope)(1);
    cache.forState(save,content,scope)(1);
    cache.forState(save,content,scope={})(1);
    content.catalogQuests={...content.catalogQuests};cache.forState(save,content,scope)(1);
    cache.invalidate();cache.forState(save,content,scope)(1);
    assert.equal(counts().checks,6);
});
