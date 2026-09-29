import * as A from './adventure_core.js';
import {prepareDebugEdit} from './adventure_debug_core.js';

export const PROMO_STRATEGY_KEYS=['Fire_FireDamageBlade','Fire_FireDamageTrap','Ice_ReflectionShield','Fire_AreaAccuracyWeakness','Fire_SingleAttackWithDOT_Level3'];
// Only the isolated film character receives this collection. All cards and limits come from kids data.
export function preparePromoDeck(save,content,dataset){
    const lessons=A.availableCardLessons(save,content).filter(row=>row.supported!==false&&row.level<=save.level&&dataset.cards[row.key]);
    const featured=PROMO_STRATEGY_KEYS.map(key=>{const row=lessons.find(row=>row.key===key);if(!row)throw Error(`宣传片策略卡不可用：${key}`);return row;});
    const names=new Set(featured.map(row=>dataset.cards[row.key].name));
    const collection=[...featured];
    const groups=['fire','ice','storm','life','death'].map(school=>lessons.filter(row=>row.school===school&&!/_(gold|Blue|Green|Purple|adv|Binding|1000Accuracy)/.test(row.key)&&!/_Level0_/.test(row.key)));
    while(collection.length<24&&groups.some(group=>group.length))for(const group of groups){
        const row=group.shift();if(!row||collection.length>=24)continue;
        const name=dataset.cards[row.key].name;if(names.has(name))continue;
        names.add(name);collection.push(row);
    }
    const patch={'inventory:24003':1};for(const row of collection)patch['card:'+row.key]=row.copies;
    const next=prepareDebugEdit(save,content,patch).save;
    A.applyAction(next,content,{type:'equip',itemId:24003});
    // Leave five slots for the filmed clicks, one extra copy of each strategy card.
    const deck=collection.slice(0,15).map(row=>({key:row.key,count:1}));
    A.applyAction(next,content,{type:'deck',deck});A.syncDeckLayouts(next,content);
    return {save:next,keys:collection.map(row=>row.key),featured:PROMO_STRATEGY_KEYS};
}
