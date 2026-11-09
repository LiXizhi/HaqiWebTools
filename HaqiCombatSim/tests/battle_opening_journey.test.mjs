import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as A from '../js/adventure_core.js';
import * as P from '../js/combat_pve_core.js';
import {SimpleBot} from '../js/combat_policy_core.js';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {openingJourneyTarget,openingJourneyWon} from '../js/opening_journey_core.js';
import {checkedProgress} from '../js/adventure_cloud_core.js';
import {persistReward} from '../js/adventure_reward_persistence.js';
import {initializePetWorld} from '../js/adventure_pet_world_core.js';
const read=file=>JSON.parse(fs.readFileSync(new URL('../data/'+file,import.meta.url)));
const {content,dataset}=installExpansion(read('adventure/chapter.json'),read('adventure/combat.json'),read('adventure/pets.json'),read('adventure/shop-candidates.json'),read('kids/cards.json'),read('kids/charms.json'));
content.worldMaps={camp:read('adventure/maps/camp.json')};
function fresh(){
 const save=A.createAdventure(content,{starter:'dragon_green',seed:812});
 save.openingJourney={version:1,phase:'offer'};
 return save;
}
function act(save,step,extra={}){
 const id={accept:36211,meet:36201,route:36201,explain:36201,rescue:36201}[step];
 if(id){const [x,y]=content.worldMaps.camp.npcPositions[id];save.position={x,y};}
 return A.applyAction(save,content,{type:'opening-journey',step,...extra});
}
function guide(save,route){
 act(save,'accept');act(save,'meet');act(save,'route',{route});
}
function fight(save,id){
 A.beginEncounter(save,content,id);
 const battle=P.restorePveBattle(dataset,content,save.pendingEncounter),bot=new SimpleBot();
 let rounds=0;
 while(!battle.finished&&rounds++<120){
  const pick=bot.pick(battle,battle.sides.near[0]);
  P.playPveRound(battle,pick);A.recordDecision(save,pick,battle);
 }
 assert.equal(battle.finished,true);
 A.settleEncounter(save,content,battle,{now:1000000});
 return {winner:battle.winner,rounds};
}
test('English route recruits one usable companion and a real second fight completes the journey',()=>{
 const save=fresh();guide(save,'talk');
 assert.throws(()=>act(save,'explain',{text:'We are enemies.',receipt:'bad',at:1}),/We are friends/);
 assert.throws(()=>act(save,'explain',{text:'We are not friends.',receipt:'bad',at:1}),/We are friends/);
 assert.equal(save.openingJourney.phase,'explain');
 act(save,'explain',{text:'We are friends.',receipt:'friend-one',at:1});
 const before=Object.keys(save.pets).length;
 act(save,'rescue',{join:true});
 assert.equal(Object.keys(save.pets).length,before+1);
 assert.ok(save.formation.includes('legacy_gululu'));
 assert.equal(save.quests[63000].claimed,true);
 const count=save.inventory[17213];
 assert.throws(()=>act(save,'rescue',{join:true}),/先帮/);
 assert.equal(save.inventory[17213],count);
 assert.equal(openingJourneyTarget(save).id,'ice-scout');
 const result=fight(save,'ice-scout');
 assert.equal(result.winner,'near');
 assert.equal(save.openingJourney.phase,'done');
});
test('battle route requires an actual matching victory and survives a saved checkpoint',()=>{
 let save=fresh();guide(save,'battle');
 assert.throws(()=>act(save,'rescue'),/先帮/);
 assert.throws(()=>A.applyAction(save,content,{type:'claim',questId:63000,npcId:36211}),/先和莫尼/);
 assert.equal(fight(save,'fire-scout').winner,'near');
 assert.equal(save.openingJourney.phase,'rescue');
 save=checkedProgress(JSON.stringify(save),content,dataset).save;
 act(save,'rescue',{join:false});
 assert.equal(save.formation.includes('legacy_gululu'),false);
 act(save,'join');assert.ok(save.formation.includes('legacy_gululu'));
});
test('unrelated encounters do not finish a journey and interactions require proximity',()=>{
 const save=fresh();
 assert.throws(()=>A.applyAction(save,content,{type:'opening-journey',step:'accept'}),/走到/);
 guide(save,'battle');
 openingJourneyWon(save,{encounterId:'ice-scout',party:[]});
 assert.equal(save.openingJourney.phase,'challenge');
});
test('failed reward storage leaves both recruitment and quest rewards untouched',()=>{
 const save=fresh();guide(save,'talk');
 act(save,'explain',{text:"We're friends!",receipt:'friend-two',at:2});
 const [x,y]=content.worldMaps.camp.npcPositions[36201];save.position={x,y};
 const before=JSON.stringify(save);
 assert.throws(()=>persistReward(save,content,{type:'opening-journey',step:'rescue',join:true},{},{getItem:()=>null,setItem:()=>{throw Error('quota');}}),/quota/);
 assert.equal(JSON.stringify(save),before);
});
test('live individual-pet roles recruit a saved individual and field it in the next battle',()=>{
 let save=fresh();initializePetWorld(save,content);
 guide(save,'talk');act(save,'explain',{text:'We are friends.',receipt:'individual',at:3});
 act(save,'rescue',{join:true});
 const petId=save.openingJourney.petId;
 assert.equal(save.pets[petId].speciesId,'legacy_gululu');
 assert.ok(save.formation.includes(petId));
 save=checkedProgress(save,content,dataset).save;
 assert.equal(save.openingJourney.petId,petId);
 assert.equal(fight(save,'ice-scout').winner,'near');
 assert.equal(save.openingJourney.phase,'done');
});
