// PvE encounter: player (side 0) versus 1–4 arena mobs (side 1) on the shared deterministic engine.
import {createBattle,stepBattle,getObservation,getLegalActions} from '../../engine/battle.js';
import {chooseMobAction} from '../../bots/genes.js';
import {mobParty} from './mob-build.js';
import {playerBuild} from '../progression.js';
// mob_server.lua: kids experience = ceil(experience_pts * global_exp_bonus), global_exp_bonus = 2.
export const KIDS_EXP_BONUS=2;
export function createEncounter(profile,data,templates,seed,{random=Math.random}={}) {
  const ruleset=data.ruleset;
  const mobs=mobParty(templates,ruleset,data.gsidToCard);
  const scenario={schemaVersion:1,size:Math.max(1,mobs.length),pve:true,firstSide:0,teams:[[playerBuild(profile,ruleset)],mobs]};
  const state=createBattle(scenario,ruleset,seed);
  const memories={};
  const enc={state,scenario,seed,templates,ruleset,playerId:'0-0',log:[],finished:false,result:null};
  enc.observation=()=>getObservation(state,enc.playerId);
  enc.legal=()=>getLegalActions(state,enc.playerId);
  enc.unit=id=>state.units.find(u=>u.id===id);
  enc.mobOf=unit=>templates[unit.slot];
  // Player action then, unless the battle ended, the whole mob side acts. Returns grouped events for presentation.
  enc.playerTurn=(action)=>{
    if(state.finished)throw new Error('战斗已结束');
    const first=stepBattle(state,[action]);
    const groups=[{side:0,actions:[action],events:first.events}];
    if(!state.finished&&state.side===1) {
      const actions=state.units.filter(u=>u.side===1&&u.hp>0).map(u=>chooseMobAction(getObservation(state,u.id),ruleset,templates[u.slot],memories[u.id]??={},seed,data.gsidToCard));
      const second=stepBattle(state,actions);
      groups.push({side:1,actions,events:second.events});
    }
    enc.finished=state.finished;enc.result=state.result;
    return groups;
  };
  enc.rewards=()=>{
    if(!state.finished||state.result.winner!==0)return {exp:0,joybeans:0,loot:[]};
    let exp=0,joybeans=0;const loot=[];
    for(const mob of templates){exp+=Math.ceil(mob.exp*(ruleset.version==='kids'?KIDS_EXP_BONUS:1));joybeans+=mob.joybeans;for(const l of mob.loot)if(random()*100<l.weight)loot.push({gsid:l.gsid,count:l.count});}
    return {exp,joybeans,loot};
  };
  return enc;
}
export function describeEvent(e,state,ruleset) {
  const name=id=>state.units.find(u=>u.id===id)?.name??id;
  const card=key=>ruleset.cards[key]?.name??key;
  switch(e.type){
    case 'cast':return `${name(e.caster)} 施放 ${card(e.card)}${e.target!==e.caster?` → ${name(e.target)}`:''}`;
    case 'damage':return `${name(e.target)} 受到 ${e.actual} 伤害${e.absorbed?`（吸收 ${e.absorbed}）`:''}${e.mark?` ${e.mark}`:''}`;
    case 'heal':return `${name(e.target)} 恢复 ${e.amount}`;
    case 'fizzle':return `${name(e.caster)} 的 ${card(e.card)} 施放失败`;
    case 'pass':return `${name(e.caster)} 跳过回合`;
    case 'stun':return `${name(e.target)} 被眩晕，无法行动`;
    case 'death':return `${name(e.target)} 倒下了`;
    case 'end':return e.winner===0?'胜利！':e.winner===1?'战败……':'平局';
    default:return null;
  }
}
