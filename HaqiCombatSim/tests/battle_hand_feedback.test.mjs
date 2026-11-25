import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as A from '../js/adventure_core.js';
import * as P from '../js/combat_pve_core.js';
import * as U from '../js/combat_unit_core.js';
import { installExpansion } from '../js/adventure_expansion_core.js';
import { buildBattleHandViewModel } from '../js/adventure/presenters/battle_view_model.js';
import { parseLocaleFile, lookup } from '../js/locale_core.js';
import { fill, setTranslator } from '../js/locale_runtime.js';

const read = file => JSON.parse(fs.readFileSync(new URL('../data/' + file, import.meta.url)));
const { content, dataset } = installExpansion(...['adventure/chapter.json', 'adventure/combat.json', 'adventure/pets.json', 'adventure/shop-candidates.json', 'kids/cards.json', 'kids/charms.json'].map(read));
function fixture(school = 'ice') {
    const save = A.createAdventure(content, { starter: 'dragon_green', school, seed: 1 });
    save.openingJourney = { version: 1, phase: 'challenge' };
    A.beginEncounter(save, content, 'fire-scout');
    const battle = P.restorePveBattle(dataset, content, save.pendingEncounter);
    const hero = battle.sides.near[0];
    return { battle, hero, visibleHand: U.cardsInHand(hero) };
}

function model(state, selected = null, discarded = []) {
 return buildBattleHandViewModel({...state, selected, discarded, assets: {}});
}
test('hand availability and selected instructions share actual cast and target restrictions without mutating combat', () => {
 const state=fixture(), key='Ice_SingleAttack_Level1', card=state.battle.resolved.cards[key], selected={seq:0,key};
 state.hero.pips={normal:7,power:0};
 let vm=model(state,selected);assert.equal(vm.isCardAvailable(card),true);assert.equal(vm.canPlay,true);assert.equal(vm.blockedFeedback,null);
 for(const patch of [{pips:{normal:0,power:0}},{stunned:true},{freezeRounds:2},{cooldowns:{[card.spellName]:2}}]){
  const baseline={pips:{normal:7,power:0},stunned:false,freezeRounds:0,cooldowns:{}};
  Object.assign(state.hero,baseline,patch);const before=JSON.stringify(state.battle);vm=model(state,selected);
  assert.equal(vm.isCardAvailable(card),false);assert.equal(vm.canPlay,false);
  assert.deepEqual(vm.cardBlockedFeedback(card),vm.blockedFeedback);assert.ok(vm.blockedMessage);
  assert.equal(JSON.stringify(state.battle),before);
 }
 Object.assign(state.hero,{pips:{normal:7,power:0},stunned:false,freezeRounds:0,cooldowns:{}});
 for(const foe of state.battle.sides.far)foe.hp=0;
 vm=model(state,selected);assert.equal(vm.isCardAvailable(card),false);assert.equal(vm.canPlay,false);assert.match(vm.blockedMessage,/没有可选目标/);
 const selfCard=state.battle.resolved.cards.Ice_IceDamageBlade;
 assert.equal(vm.isCardAvailable(selfCard),true,'a self spell still has a valid target');
 assert.equal(model(state,{seq:0,key:'Ice_IceDamageBlade'},[0]).canPlay,false,'discarded selection stays unavailable');
});
test('parameterized cast reasons use real English, Japanese and Korean dictionaries', () => {
 const state=fixture(),key='Ice_SingleAttack_Level1',selected={seq:0,key};
 try{
  for(const locale of ['en','ja','ko']){
   const table=parseLocaleFile(fs.readFileSync(new URL('../data/adventure/locale/'+locale+'.txt',import.meta.url),'utf8'));
   setTranslator(source=>lookup(source,locale,{[locale]:table}),locale);
   for(const patch of [{pips:{normal:0,power:0}},{cooldowns:{[state.battle.resolved.cards[key].spellName]:2}},{stunned:true},{hp:0}]){
    Object.assign(state.hero,{hp:100,pips:{normal:7,power:0},stunned:false,freezeRounds:0,cooldowns:{}},patch);
    const feedback=model(state,selected).blockedFeedback;assert.ok(feedback);
    const translated=fill(feedback.key,feedback.vars).text;
    assert.notEqual(translated,feedback.message,locale);assert.doesNotMatch(translated,/\{(?:required|available|cooldown)\}/);
    if(feedback.vars.cooldown)assert.ok(translated.includes('2'));
   }
  }
 }finally{setTranslator(null);}
});
