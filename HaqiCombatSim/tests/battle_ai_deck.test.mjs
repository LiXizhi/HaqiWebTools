import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installExpansion} from '../js/adventure_expansion_core.js';
import * as A from '../js/adventure_core.js';
import {recommendAdventureDeck} from '../js/battle_ai/adventure_adapter_core.js';
import {cardSemantics,observeBattle,haqiRulesAdapter} from '../js/battle_ai/haqi_adapter_core.js';
import {resolveParams,defaultParams} from '../js/combat_params_core.js';
import {createArena,startCombat} from '../js/combat_arena_core.js';
import {analyzeDecision} from '../js/battle_ai/inference_core.js';
const read=name=>JSON.parse(fs.readFileSync(new URL(`../data/${name}.json`,import.meta.url)));
const {content,dataset}=installExpansion(...['adventure/chapter','adventure/combat','adventure/pets','adventure/shop-candidates','kids/cards','kids/charms','kids/card_names'].map(read));
test('owned universal shield, school blade and trap survive high damage/healing competition',()=>{
 for(const school of ['fire','ice','storm','life','death']){
 const save=A.createAdventure(content,{school});save.xp=content.progression.xpThresholds[49];A.syncProgression(save,content);
 save.inventory[24014]=1;save.equipment[24]=24014;
 for(const row of A.availableCardLessons(save,content))save.cards[row.key]=1;
 const before=JSON.stringify(save),result=recommendAdventureDeck(save,content,dataset),keys=result.deck.map(r=>r.key);
 const R=resolveParams(dataset,content.balanceParams||defaultParams('kids'));
 assert.ok(keys.some(k=>cardSemantics(R.cards[k],R).effects.some(e=>e.kind==='ward'&&e.school==='all'&&e.boost_damage<0)),'universal shield');
 for(const kind of ['blade','trap'])assert.ok(keys.some(k=>cardSemantics(R.cards[k],R).roles.includes(kind)&&cardSemantics(R.cards[k],R).effects.some(e=>e.boost_damage>0&&[school,'all'].includes(e.school))),kind);
 assert.ok(keys.some(k=>cardSemantics(R.cards[k],R).roles.includes('attack')));
 const attackCount=result.deck.reduce((sum,r)=>sum+(cardSemantics(R.cards[r.key],R).roles.includes('attack')?r.count:0),0);assert.ok(attackCount>=Math.ceil(A.deckLimits(save,content).capacity*R.battleAI.deckAttackShare));
 A.validDeck(save,content,result.deck);assert.equal(JSON.stringify(save),before);
 }
});
test('starter recommendations do not invent unlearned setup spells',()=>{
 const save=A.createAdventure(content),result=recommendAdventureDeck(save,content,dataset);
 assert.ok(result.deck.every(r=>save.cards[r.key]));A.validDeck(save,content,result.deck);
 assert.ok(result.requirements.some(r=>!r.satisfied));
});
test('saving pips values a blade before burst over spending pips on a weak attack',()=>{
 const R=resolveParams(dataset,defaultParams('kids'));
 R.cards.burst={key:'burst',spellName:'burst',type:'SingleAttack',spellSchool:'fire',pipcost:5,accuracy:1000,params:{damage_min:600,damage_max:600,damage_school:'fire'}};
 R.cards.weak={key:'weak',spellName:'weak',type:'SingleAttack',spellSchool:'fire',pipcost:2,accuracy:1000,params:{damage_min:80,damage_max:80,damage_school:'fire'}};
 const a=createArena({resolved:R,near:[{id:'hero',school:'fire',level:50,deck:[{key:'burst',count:1},{key:'weak',count:1},{key:'Fire_FireDamageBlade',count:1},{key:'Fire_FireDamageTrap',count:1}]}],far:[{id:'enemy',school:'ice',level:50,deck:[]}],seed:31,firstSide:'near'});
 startCombat(a);const u=a.sides.near[0];u.pips={normal:2,power:0};u.deckSeq=['burst','weak','Fire_FireDamageBlade','Fire_FireDamageTrap'];u.deckMap=[1,1,1,1];
 const before=JSON.stringify(a.sides),state=a.rng.state(),analysis=analyzeDecision(observeBattle(a,u.id),{rulesAdapter:haqiRulesAdapter,difficulty:'expert'});
 const weak=analysis.evaluated.find(r=>r.action.key==='weak'),blade=analysis.evaluated.find(r=>r.action.key==='Fire_FireDamageBlade');
 assert.ok(blade.score>weak.score,`${blade.score} <= ${weak.score}`);
 assert.ok(blade.forecast.tactic.after.damagePerPip>600/5);
 assert.equal(JSON.stringify(a.sides),before);assert.equal(a.rng.state(),state);
});
