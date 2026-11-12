import {createArena,validTargets} from './combat_arena_core.js';
import {defaultParams,resolveParams} from './combat_params_core.js';
import {isAttackCard,useCard} from './combat_cards_core.js';
import {canCast} from './combat_unit_core.js';

// A disposable rehearsal: no player inventory, quest, health or RNG is shared.
export function createCompanionPractice(dataset,{school='fire',seed=1}={}){
 const resolved=resolveParams(dataset,defaultParams('kids'));
 const attack=Object.values(resolved.cards).find(c=>c.spellSchool===school&&Number(c.pipcost)===0&&isAttackCard(c));
 const heal=resolved.cards.Life_SingleHeal_Level0;
 if(!attack||!heal)throw Error('练习卡牌尚未准备好，请稍后再试。');
 const spec=(id,school)=>({id,name:id,school,level:1,deck:[]});
 const arena=createArena({resolved,near:[spec('student',school),spec('companion','life')],far:[],seed});
 const hero=arena.unitsById.student,partner=arena.unitsById.companion;
 hero.pips={normal:resolved.global.maxPips,power:0};
 partner.hp=Math.max(1,partner.maxHp-80);
 return {arena,keys:[attack.key,heal.key],selected:null,done:false,recovered:0,message:'伙伴受伤了，选一张能恢复生命的牌。'};
}

export function selectCompanionPractice(state,key){
 if(state.done||!state.keys.includes(key))return false;
 state.selected=key;state.message='再点一下受伤的伙伴，看看这张牌能不能帮它。';return true;
}

export function castCompanionPractice(state,targetId){
 if(state.done)return false;
 const hero=state.arena.unitsById.student,partner=state.arena.unitsById.companion,card=state.arena.resolved.cards[state.selected];
 if(!card){state.message='先选一张牌，再点伙伴。';return false;}
 if(targetId!==partner.id||!validTargets(state.arena,hero,card).includes(partner)){
  state.message='这是攻击牌。伙伴需要恢复生命，换一张试试。';return false;
 }
 if(!canCast(hero,card,state.arena.resolved)){state.message='这张牌暂时不能用，重新选一张吧。';return false;}
 const before=partner.hp;
 useCard(state.arena,hero,card,partner);
 state.recovered=partner.hp-before;state.done=state.recovered>0;
 state.message=state.done?'好多了！战斗时，也可以用恢复牌帮我。':'这次没成功，再试一次吧。';
 return state.done;
}
