import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as A from '../js/adventure_core.js';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {installIslandEncounters} from '../js/adventure_island_encounters_core.js';
import {fieldTacticsProfile} from '../js/adventure_field_tactics_core.js';
import {restorePveBattle,playPveRound} from '../js/combat_pve_core.js';
import {tacticalEnemyIntents,tacticalNextIntents} from '../js/tactical_encounter_core.js';
const read=f=>JSON.parse(fs.readFileSync(new URL('../data/'+f,import.meta.url)));
function setup(){
 const {content,dataset}=installExpansion(...['adventure/chapter.json','adventure/combat.json','adventure/pets.json','adventure/shop-candidates.json','kids/cards.json','kids/charms.json'].map(read));
 installIslandEncounters(content,dataset,read('adventure/island-encounters.json'),read('kids/cards.json'));
 return {content,dataset};
}
function checkpoint(content,encounter){
 const save=A.createAdventure(content,{seed:23});save.zone=encounter.zone;
 A.beginEncounter(save,content,encounter.id);
 return save;
}
test('six curated field elites publish locked intentions and retain deterministic saves',()=>{
 const {content:c,dataset:d}=setup(),rows=c.encounters.filter(e=>fieldTacticsProfile(e,c));
 assert.equal(rows.length,6);
 for(const e of rows){
  const save=checkpoint(c,e),a=restorePveBattle(d,c,save.pendingEncounter);
  assert.equal(save.pendingEncounter.fieldTacticsVersion,1,e.id);
  assert.equal(a.tacticalEncounter.id,'elite');
  assert.ok(tacticalEnemyIntents(a).length&&tacticalNextIntents(a).length,e.id);
  const next=structuredClone(tacticalNextIntents(a));
  playPveRound(a,{pass:true});A.recordDecision(save,{pass:true},a);
  assert.deepEqual(tacticalEnemyIntents(a),next,e.id);
  const replay=restorePveBattle(d,c,A.parseSave(save,c).pendingEncounter);
  assert.deepEqual(replay.events,a.events,e.id);
  assert.equal(a.unsupported?.total||0,0,e.id);
 }
});
test('new field policy leaves old active battles and authored boss scripts intact',()=>{
 const {content:c,dataset:d}=setup(),e=c.encounters.find(e=>fieldTacticsProfile(e,c));
 const before=structuredClone(c.monsters),save=checkpoint(c,e);
 delete save.pendingEncounter.fieldTacticsVersion;delete save.pendingEncounter.tacticalEncounter;
 const legacy=A.parseSave(save,c),a=restorePveBattle(d,c,legacy.pendingEncounter);
 assert.equal(a.tacticalEncounter,undefined);
 assert.deepEqual(c.monsters,before);
 const scripted=c.encounters.find(e=>e.zone==='fire'&&c.monsters[e.monsterId]?.genes?.length&&!e.legacyOnly&&!e.blocked?.length);
 assert.ok(scripted);assert.equal(fieldTacticsProfile(scripted,c),null);
 const fake={...e,monsterIds:[e.monsterId,scripted.monsterId]};
 assert.equal(fieldTacticsProfile(fake,c),null);
});
test('field tactical snapshot rejects mismatches before a battle is restored',()=>{
 const {content:c}=setup(),e=c.encounters.find(e=>fieldTacticsProfile(e,c));
 const save=checkpoint(c,e);save.pendingEncounter.tacticalEncounter.preparationBoost++;
 assert.throws(()=>A.parseSave(save,c),/野外精英战术快照/);
});
