import {createArena,startCombat,playTurn} from '../combat_arena_core.js';
import {createPveBattle,playPveRound} from '../combat_pve_core.js';
import {defaultParams,mergeParams,resolveParams} from '../combat_params_core.js';
import {createPolicy} from '../combat_policy_core.js';
import {coordinateTeam} from './policy_core.js';
import {BattleReviewSession} from './session_core.js';

/** Pure encounter runner for designers. Specs/data are supplied, never fetched. */
export function runHaqiEncounter(dataset,scenario,seed,{policy='reasoning_advanced',opponentPolicy='deck_attacker',review=true}={}){
    const pve=scenario.mode==='pve';
    const resolved=resolveParams(dataset,mergeParams(defaultParams('kids'),scenario.params||{}));
    const arena=pve?createPveBattle({dataset,player:scenario.player,party:scenario.party,monsters:scenario.monsters,seed,
        adventureParams:resolved.adventure,threatRulesVersion:5,reflectionRulesVersion:1,stealthRulesVersion:1,dispelRulesVersion:1,specialCardRulesVersion:1}):
        createArena({resolved,near:scenario.near,far:scenario.far,seed,firstSide:scenario.firstSide||(seed%2?'near':'far')});
    if(!pve)startCombat(arena);
    const policies=Object.fromEntries(Object.values(arena.unitsById).map(u=>[u.id,createPolicy(u.side==='near'?policy:opponentPolicy)]));
    const session=review?new BattleReviewSession():null;
    while(!arena.finished){
        const hero=arena.sides.near.find(u=>u.hp>0)||arena.sides.near[0];
        if(pve){const pick=policies[arena.sides.near[0].id].pick(arena,arena.sides.near[0]);if(session)session.record(arena,session.analyze(arena,hero),pick);playPveRound(arena,{...pick,aiVersion:1});}
        else {const picks=coordinateTeam(arena,policies);if(session&&arena.currentSide==='near')session.record(arena,session.analyze(arena,hero),picks[hero.id]||{pass:true});playTurn(arena,picks);}
    }
    return {winner:arena.winner,turns:arena.turn,unsupported:arena.unsupported,review:session?.review(arena),
        remainingHp:Object.fromEntries(Object.values(arena.unitsById).map(u=>[u.id,u.hp]))};
}
