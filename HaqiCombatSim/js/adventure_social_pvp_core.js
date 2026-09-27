import {createArena,startCombat,playTurn,castableCards,validTargets} from './combat_arena_core.js';
import {defaultParams,resolveParams} from './combat_params_core.js';
import {SimpleBot} from './combat_policy_core.js';
import {ReasoningBot} from './battle_ai/policy_core.js';
import {BattleReviewSession} from './battle_ai/session_core.js';
import {socialDataHash,snapshotUnit,utcDay,utcWeek} from './adventure_social_core.js';
export function startSocialPvp(dataset,player,opponent,seed,{version=2}={}){
    const replay={version,dataHash:socialDataHash(dataset),seed,player:structuredClone(player),opponent:structuredClone(opponent),actions:[]};
    const arena=createArena({resolved:resolveParams(dataset,defaultParams('kids')),near:[{...player,id:'hero'}],far:[snapshotUnit(opponent,dataset,'rival',0)],seed,firstSide:'near'});startCombat(arena);return {arena,replay,reviewSession:new BattleReviewSession()};
}
export function playSocialPvp(state,decision){
    const a=state.arena;if(a.finished||a.currentSide!=='near')throw Error('当前不能出牌');
    if(!decision.pass&&!castableCards(a,a.unitsById.hero).some(c=>c.seq===decision.seq&&c.key===decision.key&&validTargets(a,a.unitsById.hero,c.card).some(t=>t.id===decision.targetId)))throw Error('请选择有效卡牌与目标');
    const entry=structuredClone(decision),legacy=state.replay.version===1;
    state.reviewSession?.record(a,state.reviewSession.analyze(a,a.unitsById.hero),decision);
    state.replay.actions.push(entry);playTurn(a,{hero:decision});
    while(!a.finished&&a.currentSide==='far'){
        if(state.restoring&&!legacy&&!entry.rivalPick)throw Error('战报缺少对手行动');
        const pick=legacy?new SimpleBot().pick(a,a.unitsById.rival):entry.rivalPick||new ReasoningBot().pick(a,a.unitsById.rival);
        if(!legacy){if(!pick.pass&&!castableCards(a,a.unitsById.rival).some(c=>c.seq===pick.seq&&c.key===pick.key&&validTargets(a,a.unitsById.rival,c.card).some(t=>t.id===pick.targetId)))throw Error('战报对手行动无效');entry.rivalPick=structuredClone(pick);}
        playTurn(a,{rival:pick});
    }
    if(a.finished)state.review=state.reviewSession?.review(a);
    return state;
}
export function restoreSocialPvp(dataset,replay){
    if(![1,2].includes(replay?.version)||replay.dataHash!==socialDataHash(dataset)||!Array.isArray(replay.actions)||replay.actions.length>200)throw Error('赛场战报版本不兼容');
    const state=startSocialPvp(dataset,replay.player,replay.opponent,replay.seed,{version:replay.version});state.restoring=true;for(const action of replay.actions)playSocialPvp(state,action);state.restoring=false;return state;
}
export function recordPvpWin(records,state,now){
    if(!state.arena.finished||state.arena.winner!=='near'||state.replay.opponent.kind!=='account')return records;
    const key=`${utcDay(now)}:${state.replay.opponent.userId}`;return {...records,[key]:{day:utcDay(now),week:utcWeek(now),opponentId:state.replay.opponent.userId}};
}
