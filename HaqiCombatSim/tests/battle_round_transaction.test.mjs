import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createAdventure,beginEncounter,recordDecision} from '../js/adventure_core.js';
import {restorePveBattle,playPveRound} from '../js/combat_pve_core.js';
import {cardsInHand} from '../js/combat_unit_core.js';
import {resolveRecordedBattleRound} from '../js/battle_round_transaction.js';
import {bindBattleTargeting} from '../js/view_battle_targeting.js';

const read=path=>JSON.parse(fs.readFileSync(new URL('../'+path,import.meta.url)));
const content=read('data/adventure/chapter.json'),dataset=read('data/adventure/combat.json');
const key='Balance_Rune_AreaAttackCard_Elementary';
dataset.cards[key]=read('data/kids/cards.json')[key];

for(const failure of ['resolve','record'])test(`second-round lethal cast recovers after ${failure} failure and can target again`,()=>{
    const save=createAdventure(content,{seed:22});
    beginEncounter(save,content,'fire-scout');
    save.pendingEncounter.player.deck=[{key,count:1}];
    save.pendingEncounter.monster={...content.monsters[content.encounters.find(e=>e.id==='fire-scout').monsterId],hp:437,pool:[],sequences:[],genes:[],cardsets:{}};
    const restore=checkpoint=>restorePveBattle(dataset,content,checkpoint);
    let battle=restore(save.pendingEncounter);
    const run=(decision,fail)=>resolveRecordedBattleRound({save,battle,restore,
        resolve:()=>{playPveRound(battle,decision);if(fail==='resolve')throw Error('演出观察失败');},
        record:()=>{recordDecision(save,battle.lastDecision,battle);if(fail==='record')throw Error('记录失败');}});
    assert.equal(run({pass:true}).error,null);
    const before=structuredClone(save.pendingEncounter),revision=save.revision;
    const target=battle.sides.far[0].id;
    const decision={...cardsInHand(battle.sides.near[0])[0],targetId:target};
    const result=run(decision,failure);
    assert.ok(result.error);
    assert.equal(battle.finished,true,'failed round already killed the enemy');
    battle=result.battle;
    assert.equal(battle.finished,false);
    assert.equal(battle.sides.far[0].hp,437);
    assert.deepEqual(save.pendingEncounter,before);
    assert.equal(save.revision,revision);
    const canvas={clientWidth:800,clientHeight:600,getBoundingClientRect:()=>({left:0,top:0,width:800,height:600}),battlePositions:{[target]:{x:600,y:300}}};
    let retried;
    bindBattleTargeting(canvas,id=>{retried=run({...decision,targetId:id});});
    canvas.onclick({clientX:600,clientY:280});
    assert.equal(retried.error,null);
    assert.equal(battle.finished,true);
    assert.ok(retried.playback.events.some(e=>e.type==='damage'));
    assert.equal(save.pendingEncounter.decisions.length,2);
    const replayed=restore(save.pendingEncounter);
    assert.deepEqual(replayed.events,battle.events,'retry preserves deterministic replay');
});
