import test from 'node:test';
import assert from 'node:assert/strict';
import {openingResultGuidance} from '../js/opening_result_guidance_core.js';
import {openingJourneyTarget} from '../js/opening_journey_core.js';

function fixture(phase='challenge',winner='near',party=[]){
 return {save:{zone:'camp',openingJourney:{version:1,phase,petId:'companion-instance'},formation:['hero',null,null,null],pendingEncounter:{encounterId:phase==='challenge'?'fire-scout':'ice-scout',party}},battle:{finished:true,winner,monsterTemplates:[{openingLesson:'先看对手准备做什么。'}]}};
}
test('result guidance predicts the real next phase without awarding or changing progress',()=>{
 for(const [phase,party,title] of [['challenge',[],'咕噜噜可以进入营地了'],['showcase',[],'挑战赢了，搭档还没上场'],['showcase',[{speciesId:'legacy_gululu'}],'第一次搭档挑战成功']]){
  const {save,battle}=fixture(phase,'near',party),before=JSON.stringify({save,battle});
  assert.equal(openingResultGuidance(save,battle).title,title);
  assert.equal(JSON.stringify({save,battle}),before);
 }
});
test('defeat and draw offer recovery without claiming a victory or restored pet health',()=>{
 for(const phase of ['challenge','showcase'])for(const winner of ['far',null]){
  const {save,battle}=fixture(phase,winner),result=openingResultGuidance(save,battle);
  assert.equal(result.title,'这段旅程还在继续');
  assert.match(result.body,phase==='challenge'?/换个办法/:/检查自己和伙伴的生命/);
  assert.equal(result.lesson,battle.monsterTemplates[0].openingLesson);
 }
});
test('unrelated, unfinished and already completed journeys receive no opening result',()=>{
 const {save,battle}=fixture();
 for(const changed of [{zone:'forest'},{openingJourney:{version:1,phase:'done'}},{pendingEncounter:null},{pendingEncounter:{encounterId:'ice-scout'}},{openingJourney:{version:0,phase:'challenge'}}])assert.equal(openingResultGuidance({...save,...changed},battle),null);
 for(const changed of [{finished:false},{redMushroom:true},{tacticsField:{}}])assert.equal(openingResultGuidance(save,{...battle,...changed}),null);
});
test('a stored companion directs the tracker to preparation before a paired challenge',()=>{
 const {save}=fixture('showcase'),before=JSON.stringify(save);
 assert.deepEqual(openingJourneyTarget(save),{id:36201,kind:'npc',objective:'先安排咕噜噜上场，再一起挑战。'});
 assert.equal(JSON.stringify(save),before);
 save.formation[1]=save.openingJourney.petId;
 assert.equal(openingJourneyTarget(save).id,'ice-scout');
});
