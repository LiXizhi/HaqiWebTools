import {WALK_SPEED,distance} from './adventure_world_core.js';
import {samplePromoMotion} from './promo_motion_core.js';
import {beginEncounter,availableCardLessons,applyAction} from './adventure_core.js';
import {createLocalFormation,localParty,localHumanResources,createLocalReady} from './adventure_local_coop_core.js';
import {restorePveBattle,playPveRound} from './combat_pve_core.js';
import {prepareDebugEdit} from './adventure_debug_core.js';
import {castableCards,validTargets} from './combat_arena_core.js';

// Isolated film saves; party, hand draws and joint decisions follow production rules.
export function createPromoDuoBattle(dataset,content,saves){
    for(const save of saves){
        const lessons=availableCardLessons(save,content).filter(row=>row.supported!==false&&row.level<=15).slice(0,3);
        const patch={level:15,'inventory:24003':1};for(const row of lessons)patch['card:'+row.key]=row.copies;
        Object.assign(save,prepareDebugEdit(save,content,patch).save);
        applyAction(save,content,{type:'equip',itemId:24003});
        applyAction(save,content,{type:'deck',deck:lessons.map(row=>({key:row.key,count:row.copies}))});
    }
    beginEncounter(saves[0],content,'wild:dragon_orange');
    const formation=createLocalFormation(['promo-first','promo-second'],saves);
    const checkpoint={...structuredClone(saves[0].pendingEncounter),party:localParty(formation,saves,content),localHumans:localHumanResources(saves,content)};
    checkpoint.player=checkpoint.party[0];
    const battle=restorePveBattle(dataset,content,checkpoint),ready=createLocalReady();
    const ids=Object.keys(battle.localHumans);ready.reset(battle.turn);
    return {battle,ready,ids,checkpoint,
        choice(owner){
            const hero=battle.unitsById[ids[owner]];
            for(const card of castableCards(battle,hero)){
                const target=validTargets(battle,hero,battle.resolved.cards[card.key]).find(t=>t.side!==hero.side&&t.hp>0);
                if(target)return {...card,targetId:target.id};
            }
            throw Error('双人演示没有可用的攻击卡牌');
        },
        submit(owner,decision){
            ready.submit(ids[owner],decision,ids);
            if(!ready.complete(ids,battle.unitsById))return false;
            playPveRound(battle,{humanDecisions:ready.decisions(ids,battle.unitsById),aiVersion:1});
            checkpoint.decisions.push(structuredClone(battle.lastDecision));return true;
        },
    };
}

// Walk at the game's normal speed, pause at endpoints, then turn back continuously.
export function samplePromoDuoMotion(world,origin,path,elapsed){
    const length=path.reduce((sum,p,i)=>sum+distance(p,path[i-1]||origin),0),span=length/WALK_SPEED,cycle=span+.8;
    const points=[origin,...path];
    const pose=t=>{
        const leg=Math.floor(t/cycle),time=Math.min(span,t%cycle);
        const route=leg%2?points.slice(0,-1).reverse():path,start=leg%2?path.at(-1):origin;
        const p=samplePromoMotion(world,start,route,time);
        return {...p,moving:p.moving&&t%cycle<span};
    };
    const t=Math.max(0,elapsed);return [pose(t+.65),pose(t)];
}
