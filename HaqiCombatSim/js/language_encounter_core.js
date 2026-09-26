import {learningParams,rewardStatus} from './language_adventure_core.js';
import {petParams} from './adventure_pets_core.js';
import {strengtheningItems,strengtheningPreview} from './adventure_strengthening_core.js';

export function eligibleStories(profile,save) {
    const progress=save.languageAdventure?.stories?.[save.languageLearning.target]||{};
    return profile.stories.filter(s=>(!s.requiresQuest||save.quests?.[s.requiresQuest]?.claimed)
        &&(!s.requiresPet||Object.keys(save.pets||{}).length>0)
        &&(!s.requiresStory||progress[s.requiresStory]?.completed));
}
export function selectStory(profile,save) {
    const rows=save.languageAdventure?.stories?.[save.languageLearning.target]||{};
    return [...eligibleStories(profile,save)].sort((a,b)=>Number(!!rows[a.id]?.completed)-Number(!!rows[b.id]?.completed)||(rows[a.id]?.lastAt||0)-(rows[b.id]?.lastAt||0))[0];
}
export function nearbyLearningNpc(npcs,profiles,save,content,preferredId=null) {
    const range=learningParams(content).inviteRange;
    return npcs.filter(n=>!n.hidden&&profiles.some(p=>(p.id===n.instanceId||(!n.instanceId&&String(p.npcId)===String(n.id)))&&selectStory(p,save)))
        .map(n=>({npc:n,distance:Math.hypot(n.x-save.position.x,n.y-save.position.y)}))
        .filter(n=>n.distance<=range).sort((a,b)=>Number(b.npc.instanceId===preferredId)-Number(a.npc.instanceId===preferredId)||a.distance-b.distance)[0]?.npc||null;
}
export function storyReward(save,content,story,now,awarded=null) {
    const mode=story.mode||'basic';
    const status=rewardStatus(save,content,{id:story.rewardGroup,tier:'beginner'},mode,now);
    if(awarded!==null)status.amount=awarded;
    const p=learningParams(content),nominal=mode==='basic'?p.basicReward:p.beginnerReward;
    const reason=status.count>=status.limit?'同组课程今日奖励次数已用完':status.amount<nominal?'今日奖励额度不足':'';
    let use='仙豆可用于强化已有装备。',action=null,guid=null,useKey=use,useVars={};
    if(status.currency===100){
        const price=petParams(content).foodPrice, count=price>0?Math.floor(status.amount/price):0;
        use=`宠物营养餐每份 ${price} 奇豆。`+(count?`本次奖励可买 ${count} 份。`:'可以攒起来购买营养餐。');
        useKey=count?'宠物营养餐每份 {price} 奇豆。本次奖励可买 {count} 份。':'宠物营养餐每份 {price} 奇豆。可以攒起来购买营养餐。';useVars={price,count};
        if(content.shop?.some(p=>p.id==='food'||p.itemId===990001||p.id===990001))action='food';
    }else if(content.items&&save.equipmentInstances){
        const info=strengtheningItems(save,content).map(row=>strengtheningPreview(save,content,row.guid)).find(info=>info.next?.cost[0]===17213);
        if(info){guid=info.instance.guid;use=`${info.item.name}强化需要 ${info.next.cost[1]} 仙豆，当前 ${info.held}，还差 ${Math.max(0,info.next.cost[1]-info.held)}。`;useKey='{item}强化需要 {price} 仙豆，当前 {held}，还差 {missing}。';useVars={item:info.item.name,price:info.next.cost[1],held:info.held,missing:Math.max(0,info.next.cost[1]-info.held)};action='upgrade';}
    }
    return {remaining:Math.max(0,status.limit-status.count),dailyRemaining:Math.max(0,(mode==='basic'?p.basicDailyCap:p.challengeDailyCap)-(status.ledger.totals[status.currency]||0)),amount:status.amount,currency:status.currency,balance:save.inventory?.[status.currency]||0,reason,use,useKey,useVars,action,guid};
}

export function learningModeDraft(save,locale=save.locale) {
    const old=save.languageLearning||{};
    const target=old.selectionConfirmed?old.target:locale==='en'?'zh-CN':'en';
    return {locale,target,native:old.selectionConfirmed?old.native:locale,selectionConfirmed:!!old.selectionConfirmed};
}
