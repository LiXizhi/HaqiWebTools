import {createArena,startCombat,playTurn,castableCards} from './combat_arena_core.js';
import {resolveParams} from './combat_params_core.js';

// A staged teaching match. Decks and decisions are presets; all effects use real kids cards.
export function createPromoTactics(dataset,params,seed=531){
    const shield='Ice_GlobalShield',trap='Fire_FireDamageTrap',steal='Ice_StealPositiveWard',attack='Fire_SingleAttack_Level0_70',heal='Life_SingleHeal_Level0';
    const spec=(id,name,school,keys,appearance)=>({id,name,school,level:15,appearance,deck:keys.map(key=>({key,count:1}))});
    const near=[spec('hero','小星','ice',[shield,steal,trap,attack],'girl'),spec('ally','生命伙伴','life',[heal],'boy')];
    const far=[spec('rival','烈火对手','fire',[trap,attack],'boy'),spec('guard','守护伙伴','ice',[shield],'girl')];
    const arena=createArena({resolved:resolveParams(dataset,params),near,far,seed,firstSide:'near',keepEvents:true});
    for(const s of [...near,...far])arena.unitsById[s.id].arenaProfile=s;
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
        if(instructions.length)groups.push({before,snapshots,after:JSON.parse(JSON.stringify(arena))});
    }
    const events=arena.events;
    if(!events.some(e=>e.type==='steal_ward')||!events.some(e=>e.type==='heal'&&e.amount>0)||events.some(e=>e.type==='fizzle'))throw Error('教学种子未完整演示破盾与有效回血 '+JSON.stringify(events.filter(e=>['heal','damage','steal_ward','fizzle'].includes(e.type))));
    re