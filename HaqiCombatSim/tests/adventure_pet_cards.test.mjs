import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installExpansion} from '../js/adventure_expansion_core.js';
import * as A from '../js/adventure_core.js';
import * as P from '../js/adventure_pets_core.js';
import * as B from '../js/combat_pve_core.js';
import * as U from '../js/combat_unit_core.js';
import {resolveHandSwipe} from '../js/adventure_hand_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../data/'+p,import.meta.url)));
const {content,dataset}=installExpansion(read('adventure/chapter.json'),read('adventure/combat.json'),read('adventure/pets.json'),read('adventure/shop-candidates.json'),read('kids/cards.json'),read('kids/charms.json'));
const fresh=()=>A.createAdventure(content,{school:'fire',starter:'dragon_green',seed:812});
function setup(){
    const save=fresh(),player=A.playerSpec(save,content);
    const monster={...content.monsters['fire-scout'],hp:10000,pool:[],sequences:[],genes:[]};
    const battle=B.createPveBattle({dataset,player,party:P.partySpecs(save,content,player),monsters:[monster],seed:9});
    return {save,battle,hero:battle.sides.near[0]};
}
test('all schools and starters deal only six player cards; pet pile is separately available',()=>{
    for(const school of ['fire','ice','storm','life','death'])for(const starter of P.STARTERS){
        const save=A.createAdventure(content,{school,starter});
        A.beginEncounter(save,content,'fire-scout');
        const battle=B.restorePveBattle(dataset,content,save.pendingEncounter),hero=battle.sides.near[0];
        assert.equal(U.cardsInHand(hero).length,6);assert.equal(U.deckRemaining(hero),6);
        assert.ok(U.cardsInHand(hero).every(h=>save.deck.some(row=>row.key===h.key)));
        assert.equal(U.petCardsInHand(hero).length,2);
        assert.ok(U.petCardsInHand(hero).every(h=>h.seq>=U.PET_CARD_SEQ_BASE&&save.pets[starter].deck.some(row=>row.key===h.key)));
        assert.deepEqual(A.parseSave(save,content).pendingEncounter,save.pendingEncounter);
    }
});
test('pet selection spends one chosen copy and hero mana without consuming or replacing player hand',()=>{
    const {battle,hero}=setup(),own=U.cardsInHand(hero),maps=[...hero.deckMap];
    const pick=U.petCardsInHand(hero).find(h=>battle.resolved.cards[h.key].pipcost===1);
    battle.resolved.cards[pick.key].accuracy=10000;
    const decision={...pick,targetId:'mob0'};
    assert.deepEqual(resolveHandSwipe(battle,pick).decision,{...decision,discardSeqs:[]});
    B.playPveRound(battle,decision);
    assert.equal(U.petCardsInHand(hero).length,1);
    assert.deepEqual(U.cardsInHand(hero),own);assert.deepEqual(hero.deckMap,maps);
    const cast=battle.events.find(e=>e.type==='cast'&&e.caster==='hero');
    assert.equal(cast.realcost,1);
    const before=battle.events.length;
    assert.throws(()=>B.playPveRound(battle,decision),/手中的卡牌/);
    assert.equal(battle.events.length,before);
    assert.equal(resolveHandSwipe(battle,pick),null);
});
test('pet fizzle retains the chosen copy; unavailable, discarded and forged pet selections fail',()=>{
    const {battle,hero}=setup(),own=JSON.stringify(hero.deckSeq);
    const pick=U.petCardsInHand(hero).find(h=>battle.resolved.cards[h.key].pipcost===1);
    const decision={...pick,targetId:'mob0'};
    hero.pips={normal:0,power:0};
    assert.throws(()=>B.playPveRound(battle,decision),/魔力不足/);
    hero.pips.normal=1;
    assert.throws(()=>B.playPveRound(battle,{...decision,discardSeqs:[pick.seq]}),/弃/);
    assert.throws(()=>B.playPveRound(battle,{...decision,key:hero.deckSeq[0]}),/手中的卡牌/);
    battle.resolved.cards[pick.key].accuracy=-10000;
    B.playPveRound(battle,decision);
    assert.ok(battle.events.some(e=>e.type==='fizzle'&&e.caster==='hero'));
    assert.equal(U.petCardsInHand(hero).length,2);assert.equal(JSON.stringify(hero.deckSeq),own);
});
test('normal hand can empty without hiding pet cards; replay preserves both piles and RNG',()=>{
    const save=fresh(),pet=save.pets.dragon_green;
    const free=P.petLessons(pet,content).find(lesson=>lesson.level<=pet.level&&dataset.cards[lesson.key].pipcost===0);
    A.applyAction(save,content,{type:'pet-deck',petId:'dragon_green',deck:[{key:free.key,count:2}]});
    A.beginEncounter(save,content,'fire-scout');
    const battle=B.restorePveBattle(dataset,content,save.pendingEncounter),hero=battle.sides.near[0];
    const pick=U.petCardsInHand(hero).find(h=>battle.resolved.cards[h.key].pipcost===0);
    const decision={...pick,targetId:'mob0',discardSeqs:U.cardsInHand(hero).map(h=>h.seq)};
    B.playPveRound(battle,decision);A.recordDecision(save,decision);
    assert.equal(U.cardsInHand(hero).length,0);assert.equal(U.petCardsInHand(hero).length,1);
    const replay=B.restorePveBattle(dataset,content,A.parseSave(save,content).pendingEncounter);
    assert.deepEqual(replay.events,battle.events);assert.equal(replay.rng.state(),battle.rng.state());
    assert.deepEqual(U.petCardsInHand(replay.sides.near[0]),U.petCardsInHand(hero));
});
