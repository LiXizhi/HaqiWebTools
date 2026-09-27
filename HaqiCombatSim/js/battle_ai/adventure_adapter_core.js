import {deckLimits,deckCardCopies,availableCardLessons} from '../adventure_core.js';
import {defaultParams,resolveParams} from '../combat_params_core.js';
import {expectedBaseDamage,expectedBaseHeal,isSupportedType} from '../combat_cards_core.js';
import {optimizeDeck} from './deck_core.js';
import {cardSemantics} from './haqi_adapter_core.js';
import {upgradeLevels} from '../adventure_upgrade_core.js';
export function recommendAdventureDeck(save,content,dataset,{locked=[],role='balanced'}={}){
    const resolved=resolveParams(dataset,content.balanceParams||defaultParams('kids'));
    const cards=availableCardLessons(save,content).filter(row=>save.cards[row.key]&&row.supported!==false&&isSupportedType(resolved.cards[row.key]?.type))
        .map(row=>({...resolved.cards[row.key],maxCopies:deckCardCopies(save,content,row.key)}));
    const limits=deckLimits(save,content),settings=resolved.battleAI;
    const semantics=card=>cardSemantics(card,resolved);
    const matches=effect=>!effect.school||effect.school==='all'||effect.school===save.school;
    const ownAttacks=cards.filter(c=>c.spellSchool===save.school&&semantics(c).roles.includes('attack'));
    const burstDamage=Math.max(1,...ownAttacks.map(expectedBaseDamage));
    const keys=predicate=>cards.filter(predicate).map(c=>c.key);
    const universal=keys(c=>semantics(c).effects.some(e=>e.kind==='ward'&&Number(e.boost_damage)<0&&(!e.school||e.school==='all')));
    const shield=universal.length?universal:keys(c=>semantics(c).roles.includes('shield'));
    const blade=keys(c=>semantics(c).effects.some(e=>e.kind==='charm'&&Number(e.boost_damage)>0&&matches(e)));
    const trap=keys(c=>semantics(c).effects.some(e=>e.kind==='ward'&&Number(e.boost_damage)>0&&matches(e)));
    const attack=ownAttacks.length?ownAttacks.map(c=>c.key):keys(c=>semantics(c).roles.includes('attack'));
    const burst=ownAttacks.filter(c=>expectedBaseDamage(c)>=burstDamage*settings.deckBurstThreshold).map(c=>c.key);
    const supportCopies=Math.max(1,Math.ceil((limits.capacity||cards.length)*settings.deckSupportShare/3));
    const attackCopies=Math.max(1,Math.ceil((limits.capacity||cards.length)*settings.deckAttackShare));
    const requirements=[
        {id:'shield',keys:shield,min:1},
        {id:'attack',keys:attack,min:1},
        {id:'blade',keys:blade,min:1},
        {id:'trap',keys:trap,min:1},
        {id:'burst',keys:burst,min:1},
        {id:'breakShield',keys:keys(c=>semantics(c).roles.includes('breakShield')),min:1},
        {id:'breakBoost',keys:keys(c=>semantics(c).roles.includes('breakBoost')),min:1},
        {id:'attack',keys:attack,min:attackCopies},
        ...Array.from({length:supportCopies-1},(_,i)=>[
            {id:'shield',keys:shield,min:i+2},{id:'blade',keys:blade,min:i+2},{id:'trap',keys:trap,min:i+2},
        ]).flat(),
    ];
    return optimizeDeck({cards,limits,current:save.deck,locked,role,requirements},{
        semantics,
        scoreCard:(card,{deck,roles:chosen})=>{
            const semantic=semantics(card),roles=semantic.roles,cost=Math.max(0,Math.abs(card.pipcost));
            const copiesOf=keys=>deck.reduce((sum,r)=>sum+(keys.includes(r.key)?r.count:0),0);
            if(roles.includes('attack')&&(!attack.includes(card.key)||copiesOf(attack)>=attackCopies))return 0;
            if(roles.includes('blade')&&(!blade.includes(card.key)||copiesOf(blade)>=supportCopies))return 0;
            if(roles.includes('trap')&&(!trap.includes(card.key)||copiesOf(trap)>=supportCopies))return 0;
            if(roles.includes('shield')&&(!shield.includes(card.key)||copiesOf(shield)>=supportCopies))return 0;
            if(roles.some(r=>['breakShield','breakBoost','cleanse'].includes(r)&&(chosen[r]||0)>=settings.deckCounterCopies))return 0;
            if(roles.includes('heal')&&(chosen.heal||0)>=settings.deckHealCopies)return 0;
            const schoolEfficiency=card.spellSchool===save.school?1:0.65;
            const damage=expectedBaseDamage(card),heal=expectedBaseHeal(card);
            // A preparation spell earns its value through the later burst, not its zero direct damage.
            const setup=semantic.effects.filter(e=>Number(e.boost_damage)>0&&matches(e)).reduce((sum,e)=>sum+burstDamage*Number(e.boost_damage)/100,0);
            const protection=semantic.effects.filter(e=>e.kind==='ward'&&Number(e.boost_damage)<0).reduce((sum,e)=>sum+burstDamage*Math.abs(Number(e.boost_damage))/100,0);
            const counters=roles.filter(r=>['breakShield','breakBoost','cleanse'].includes(r)).length*burstDamage*settings.deckSetupDiscount;
            return (damage*schoolEfficiency+(role==='healer'?1.5:0.7)*heal+settings.deckSetupDiscount*(setup+protection)+counters)/(1+cost)
                +roles.filter(r=>!['attack','boost','blade','trap','shield'].includes(r)).length*settings.pipValue;
        },
    });
}
// These identifiers are mapped to actual panels by the application. No shopping,
// remote requests or progression writes are performed by the recommendation API.
export function adventureProgressionRoutes(save,content){
    return [
        {id:'deck',addresses:'decision',title:'检查已有卡牌与配置',owned:true,available:true,entry:'deck'},
        {id:'deck-counter',addresses:'deck',title:'调整卡牌应对对手',owned:true,available:true,entry:'deck'},
        {id:'equipment',addresses:'capacity',title:'查看已拥有口袋的容量',owned:true,available:true,entry:'inventory'},
        {id:'pet',addresses:'formation',title:'检查宠物编队与状态',owned:true,available:!!content.pets&&Object.keys(save.pets||{}).length>0,entry:'pet'},
        {id:'party',addresses:'formation',title:'查看可用的副本伙伴',available:true,entry:'social-party',priority:1},
        {id:'quests',addresses:'attributes',title:'查看当前任务与成长目标',available:true,entry:'quests',priority:2},
        {id:'upgrade',addresses:'attributes',title:'查看已装备物品的强化选项',available:Object.values(save.equipment||{}).some(id=>upgradeLevels(content,id).length),entry:'upgrade',priority:1},
    ];
}
