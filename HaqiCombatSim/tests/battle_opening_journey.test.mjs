import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as A from '../js/adventure_core.js';
import * as P from '../js/combat_pve_core.js';
import {SimpleBot} from '../js/combat_policy_core.js';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {openingJourneyTarget,openingJourneyWon,openingJourneyMilestones,openingFriendAnswer,openingJourneyScene,openingCompanionEvent,openingGuideAnchor} from '../js/opening_journey_core.js';
import {checkedProgress} from '../js/adventure_cloud_core.js';
import {persistReward} from '../js/adventure_reward_persistence.js';
import {initializePetWorld} from '../js/adventure_pet_world_core.js';
const read=file=>JSON.parse(fs.readFileSync(new URL('../data/'+file,import.meta.url)));
test('guide leads toward Moni only during the outdoor guide step without changing the save',()=>{
 const save={zone:'camp',position:{x:0,y:0},openingJourney:{version:1,phase:'guide'}};
 assert.deepEqual(openingGuideAnchor(save,{x:300,y:0}),{x:96,y:0});
 assert.deepEqual(save.position,{x:0,y:0});
 assert.equal(openingGuideAnchor(save,{x:100,y:0}),null);
 save.openingJourney.phase='done';assert.equal(openingGuideAnchor(save,{x:300,y:0}),null);
});
test('English explanation does not count as a fire victory and old saves keep their original objectives',()=>{
 const save=fresh();guide(save,'talk');
 act(save,'explain',{text:'We are friends.',receipt:'credit-choice',at:1,choice:true});act(save,'rescue',{join:true});
 const q=content.quests.find(q=>q.id===63002);
 assert.equal(A.questProgress(save,q)[0].value,0);
 delete save.openingJourney;
 assert.equal(A.questProgress(save,content.quests.find(q=>q.id===63001)).find(g=>g.id===36201).value,0);
});
test('supplied English reply advances the story without claiming typed practice',()=>{
 const save=fresh();guide(save,'talk');
 act(save,'explain',{text:'We are friends.',receipt:'choice',at:1,choice:true});
 assert.equal(save.openingJourney.phase,'rescue');
 assert.equal(save.openingJourney.practice,undefined);
});
test('completed opening battles credit training without auto-accepting or duplicating rewards',()=>{
 const save=fresh();guide(save,'battle');fight(save,'fire-scout');act(save,'rescue',{join:true});fight(save,'ice-scout');
 const before=JSON.stringify(save.inventory);
 for(const id of [63002,63003]){
  const q=content.quests.find(q=>q.id===id);
  assert.equal(A.questReady(save,q),false);
  assert.ok(A.questProgress(save,q).every(g=>g.value===g.count));
 }
 assert.equal(JSON.stringify(save.inventory),before);
 const q=content.quests.find(q=>q.id===63001),progress=A.questProgress(save,q);
 assert.equal(progress.find(g=>g.id===36201).value,1);
 assert.equal(progress.find(g=>g.id!==36201).value,0);
});
test('friend answer accepts equivalent beginner expressions but never negations or unrelated answers',()=>{
 for(const text of ['We are friends.','Yes, WE’RE friends!',' we  are friends '])assert.equal(openingFriendAnswer(text).accepted,true);
 for(const text of ['', 'We are not friends', 'We are friend', 'friends', 'no'])assert.equal(openingFriendAnswer(text).accepted,false);
 assert.match(openingFriendAnswer('We are friend').message,/复数/);
});
test('scene companion responds to earned progress and disappears once a real pet exists',()=>{
 const save={zone:'camp',openingJourney:{version:1,phase:'offer'}},npc={x:100,y:100};
 assert.equal(openingJourneyScene(save,npc),null);
 save.openingJourney.phase='guide';const waiting=openingJourneyScene(save,npc);assert.equal(waiting.free,false);
 save.openingJourney.phase='rescue';const freed=openingJourneyScene(save,npc);assert.equal(freed.free,true);assert.notEqual(freed.x,waiting.x);
 save.openingJourney.petId='real-pet';assert.equal(openingJourneyScene(save,npc),null);
});
test('companion feedback comes only from its actual battle events',()=>{
 const save={openingJourney:{version:1,phase:'showcase'}},battle={unitsById:{pet:{speciesId:'legacy_gululu'},hero:{}}};
 assert.equal(openingCompanionEvent(save,battle,{type:'damage',caster:'hero',amount:90}),'');
 assert.match(openingCompanionEvent(save,battle,{type:'damage',caster:'pet',amount:28}),/28/);
 assert.match(openingCompanionEvent(save,battle,{type:'fizzle',caster:'pet'}),/失误/);
 assert.equal(openingCompanionEvent(save,battle,{type:'damage',caster:'pet',amount:0}),'');
 save.openingJourney.phase='done';assert.equal(openingCompanionEvent(save,battle,{type:'cast',caster:'pet'}),'');
});
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

test('completion handoff requires a win, persists acknowledgement and never awards twice',()=>{
 let save=fresh();guide(save,'talk');
 assert.throws(()=>act(save,'continue'),/先和新伙伴/);
 act(save,'explain',{text:'We are friends.',receipt:'handoff',at:4});
 act(save,'rescue',{join:true});fight(save,'ice-scout');
 const inventory=structuredClone(save.inventory),pets=structuredClone(save.pets);
 act(save,'continue');act(save,'continue');
 assert.deepEqual(save.inventory,inventory);assert.deepEqual(save.pets,pets);
 save=checkedProgress(save,content,dataset).save;
 assert.equal(save.openingJourney.celebrated,true);
 assert.equal(A.currentQuest(save,content).startNpc,36211);
});

test('failed completion handoff storage keeps the completion screen eligible on re-entry',()=>{
 const save=fresh();guide(save,'talk');
 act(save,'explain',{text:'We are friends.',receipt:'handoff-quota',at:5});
 act(save,'rescue',{join:true});fight(save,'ice-scout');
 const before=JSON.stringify(save);
 assert.throws(()=>persistReward(save,content,{type:'opening-journey',step:'continue'},{},{getItem:()=>null,setItem:()=>{throw Error('quota');}}),/quota/);
 assert.equal(JSON.stringify(save),before);
 assert.equal(save.openingJourney.celebrated,undefined);
});

test('visible milestones follow earned progress and survive save restore without rewarding inspection',()=>{
 const save=fresh(),before=JSON.stringify(save);
 assert.deepEqual(openingJourneyMilestones(save).map(x=>x.complete),[false,false,false]);
 assert.equal(JSON.stringify(save),before);
 guide(save,'talk');
 assert.throws(()=>act(save,'explain',{text:'wrong',receipt:'wrong',at:1}));
 assert.equal(openingJourneyMilestones(save).filter(x=>x.complete).length,0);
 act(save,'explain',{text:'We are friends.',receipt:'milestone',at:1});
 assert.deepEqual(openingJourneyMilestones(save).map(x=>x.complete),[true,false,false]);
 act(save,'rescue',{join:true});
 const restored=checkedProgress(JSON.stringify(save),content,dataset).save;
 assert.deepEqual(openingJourneyMilestones(restored).map(x=>x.complete),[true,true,false]);
 openingJourneyWon(restored,{encounterId:'ice-scout',party:[]});
 assert.equal(openingJourneyMilestones(restored)[2].complete,false);
 assert.equal(fight(restored,'ice-scout').winner,'near');
 assert.ok(openingJourneyMilestones(restored).every(x=>x.complete));
});
