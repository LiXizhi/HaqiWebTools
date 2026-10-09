import {createArena,startCombat,playTurn,castableCards} from './combat_arena_core.js';
import {resolveParams} from './combat_params_core.js';

// A staged teaching match. Decks and decisions are presets; all effects use real kids cards.
export function createPromoTactics(dataset,params,seed=531){
    const shield='Ice_GlobalShield',trap='Fire_FireDamageTrap',steal='Ice_StealPositiveWard',attack='Fire_SingleAttack_Level0_70',heal='Life_SingleHeal_Level0';
    const spec=(id,name,school,keys,appearance)=>({id,name,school,level:15,appearance,deck:keys.map(key=>({key,count:5}))});
    const near=[{...spec('hero','小星','ice',[shield,steal,trap,attack],'girl'),bodyId:'female10',headId:'wave-girl'},{...spec('ally','生命伙伴','life',[heal],'boy'),bodyId:'male2',headId:'jade-boy'}];
    const far=[{...spec('rival','抱抱龙小橙','fire',[trap,attack]),speciesId:'dragon_orange'},{...spec('guard','抱抱龙小紫','ice',[shield]),speciesId:'dragon_purple'}];
    const arena=createArena({resolved:resolveParams(dataset,params),near,far,seed,firstSide:'near',keepEvents:true});
    for(const s of [...near,...far]){
        if(s.speciesId){arena.unitsById[s.id].speciesId=s.speciesId;arena.unitsById[s.id].appearanceStage=1;}
        else arena.unitsById[s.id].arenaProfile=s;
    }
    arena.redMushroom=true;
    startCombat(arena);
    const scripts=[[['hero',shield,'hero']],[['rival',trap,'hero'],['guard',shield,'rival']],[['hero',steal,'rival']],[['rival',attack,'hero']],[['ally',heal,'hero'],['hero',trap,'rival']],[],[['hero',attack,'rival']]];
    const groups=[];
    for(const instructions of scripts){
        const snapshots=[],picks={};
        for(const [id,key,targetId]of instructions){const card=castableCards(arena,arena.unitsById[id]).find(c=>c.key===key);if(!card)throw Error('教学卡牌不可出牌：'+key);picks[id]={...card,targetId};}
        const before=JSON.parse(JSON.stringify(arena));
        arena.onEvent=event=>{if(['cast','damage','heal','ward','steal_ward','fizzle'].includes(event.type)){const {onEvent,...state}=arena;snapshots.push({arena:JSON.parse(JSON.stringify(state)),event:{...event}});}};
        playTurn(arena,picks);delete arena.onEvent;
        if(instructions.length)groups.push({before,picks:structuredClone(picks),snapshots,after:JSON.parse(JSON.stringify(arena))});
    }
    const events=arena.events;
    if(!events.some(e=>e.type==='steal_ward')||!events.some(e=>e.type==='heal'&&e.amount>0)||events.some(e=>e.type==='fizzle'))throw Error('教学种子未完整演示破盾与有效回血 '+JSON.stringify(events.filter(e=>['heal','damage','steal_ward','fizzle'].includes(e.type))));
    return {groups,arena};
}


