import {selectableCards,canCast,isAlive} from './combat_unit_core.js';
import {validTargets} from './combat_arena_core.js';
import {isHealCard} from './combat_cards_core.js';

// Web companion requests, not original spell formulas. Each request lasts one decision.
export const BATTLE_CHAT = [
    {id:'heal',text:'给我加血',intent:'heal'},
    {id:'help',text:'救我',intent:'protect'},
    {id:'charge',text:'我在憋大招',intent:'protect'},
    {id:'attack',text:'一起进攻吧'},
    {id:'thanks',text:'谢谢你'},
    {id:'cheer',text:'加油'},
    {id:'smile',text:'微笑',emoji:'😊'},
    {id:'heart',text:'爱心',emoji:'❤️'},
    {id:'thumb',text:'干得漂亮',emoji:'👍'},
    {id:'cry',text:'哭泣',emoji:'😭'},
];
export function chatSupportPick(battle,unit,id){
    const intent=BATTLE_CHAT.find(row=>row.id===id)?.intent,hero=battle.sides.near[0];
    if(!intent||battle.finished||unit===hero||unit.side!==hero.side||!isAlive(unit)||!isAlive(hero))return null;
    const choices=selectableCards(unit).filter(h=>{
        const card=battle.resolved.cards[h.key];
        return card&&canCast(unit,card,battle.resolved)&&validTargets(battle,unit,card).some(t=>t.id===hero.id);
    });
    const healing=choices.find(h=>isHealCard(battle.resolved.cards[h.key])&&hero.hp<hero.maxHp);
    const protection=choices.find(h=>{
        const card=battle.resolved.cards[h.key];
        if(/^(Absorb|AreaAbsorb|SingleStealth)$/.test(card.type))return true;
        return card.type==='Wards'&&String(card.params.wards).split(',').every(id=>battle.resolved.wards[id]?.positive===true&&!hero.wards.some(ward=>ward.id===Number(id)));
    });
    const boost=choices.find(h=>{
        const card=battle.resolved.cards[h.key];
        if(card.type!=='Charms')return false;
        return String(card.params.charms).split(',').every(id=>{
            const charm=battle.resolved.charms[id];
            return charm?.positive&&charm.boost_damage>0&&['all',hero.school].includes(charm.school)&&!hero.charms.includes(Number(id));
        });
    });
    const pick=intent==='heal'?healing:(id==='help'?healing||protection:boost||protection||healing);
    return pick?{...pick,targetId:hero.id}:null;
}
