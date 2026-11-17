import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {openingTrainingMonsters,openingEnemyIntentInfo} from '../js/opening_training_core.js';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {createTacticsFieldBattle,tacticsFieldCue,TACTICS_FIELD_ENCOUNTERS} from '../js/tactics_field_battle_core.js';
const read=f=>JSON.parse(fs.readFileSync(new URL('../data/'+f,import.meta.url)));
const effects=read('adventure/spell-effects.json');
const {content,dataset}=installExpansion(...['adventure/chapter.json','adventure/combat.json','adventure/pets.json','adventure/shop-candidates.json','kids/cards.json','kids/charms.json'].map(read));
test('opening intent artwork follows the actual saved-version script through its fallback rounds',()=>{
 for(const version of [1,2,3])for(const id of ['fire-scout','ice-scout','storm-scout','life-scout']){
  const monsters=openingTrainingMonsters([content.monsters[id]],{openingTrainingVersion:version,encounterId:id});
  if(!monsters[0].openingLesson)continue;
  for(let turn=1;turn<=14;turn++){
   const battle={monsterTemplates:monsters,turn},info=openingEnemyIntentInfo(battle);
   const expected=id==='ice-scout'&&turn===1?'Ice_GlobalShield':monsters[0].sequences[0].find(row=>row.round===String(turn))?.card||monsters[0].pool[0].key;
   assert.equal(info.cardKey,expected,id+' v'+version+' turn '+turn);
   assert.ok(effects.cards[info.cardKey]?.base,'formal art exists: '+info.cardKey);
   assert.equal(openingEnemyIntentInfo({...battle,finished:true}),null);
  }
 }
});
test('field advice references an actually available spell with formal art',()=>{
 for(const lesson of TACTICS_FIELD_ENCOUNTERS){
  const battle=createTacticsFieldBattle(dataset,content,{lessonId:lesson.id});
  const info=tacticsFieldCue(battle);
  assert.ok(info?.label);
  assert.ok(effects.cards[info.cardKey]?.base,'formal advice art: '+lesson.id+' '+info.cardKey);
  assert.ok(battle.resolved.cards[info.cardKey]);
 }
});
