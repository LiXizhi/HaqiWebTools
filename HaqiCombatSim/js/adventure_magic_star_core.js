// Web adaptation requested 2026-09-21: remaining calendar months, capped at 10.
// Original MagicStar used M points instead; combat bonuses below are preview only.
export function magicStarStatus(member,now) {
    const end=Date.parse(member?.expiresAt),active=member?.isVip===true&&(!Number.isFinite(end)||end>now);
    if(!active)return {level:0,days:0,expiresAt:null};
    if(!Number.isFinite(end))return {level:1,days:null,expiresAt:null};
    const start=new Date(now);
    let months=1;
    for(;months<10;months++){
        const boundary=new Date(now);boundary.setUTCDate(1);boundary.setUTCMonth(start.getUTCMonth()+months);
        const last=new Date(Date.UTC(boundary.getUTCFullYear(),boundary.getUTCMonth()+1,0)).getUTCDate();
        boundary.setUTCDate(Math.min(start.getUTCDate(),last));
        if(end<=boundary.getTime())break;
    }
    return {level:months,days:Math.ceil((end-now)/86400000),expiresAt:member.expiresAt};
}
export const magicStarWeek=now=>Math.floor((now+8*3600000+3*86400000)/(7*86400000));
export function validateMagicStarClaims(save,content) {
    const record=save.magicStarClaims;if(record===undefined)return;
    if(!record||!Array.isArray(record.items)||new Set(record.items).size!==record.items.length||
        record.items.some(id=>!content.magicStar?.rewards.some(r=>r.id===id))||
        (record.week!==null&&(!Number.isSafeInteger(record.week)||record.week<0)))throw Error('魔法星领取记录无效');
}
export function claimMagicStar(save,content,action,access) {
    const now=access.now,config=content.magicStar;
    if(!Number.isFinite(now)||!config||access.keepworkVip!==true)throw Error('请先登录会员账号，再领取魔法星奖励。');
    const star=magicStarStatus({isVip:access.keepworkVip,expiresAt:access.expiresAt},now);
    if(star.level===0)throw Error('会员已到期，请先升级会员。');
    validateMagicStarClaims(save,content);
    const record=save.magicStarClaims||{items:[],week:null};
    let itemId,count;
    if(action.rewardId==='weekly'){
        const week=magicStarWeek(now);
        if(record.week!==null&&record.week>=week)throw Error('本周仙豆已经领取。');
        itemId=config.weeklyItemId;count=config.levels[star.level].weekly_money;
    }else{
        const reward=config.rewards.find(r=>r.id===action.rewardId);
        if(!reward)throw Error('奖励不存在');
        if(record.items.includes(reward.id)||(save.inventory[reward.itemId]||0)>0)throw Error('已经拥有或领取过这件奖励。');
        if(star.level<reward.starLevel||save.level<reward.heroLevel)throw Error('魔法星或角色等级尚未达到领取条件。');
        itemId=reward.itemId;count=1;
    }
    if(!content.items[itemId])throw Error('奖励尚未配置');
    const total=(save.inventory[itemId]||0)+count;
    if(!Number.isSafeInteger(total))throw Error('物品数量超出上限');
    save.inventory[itemId]=total;
    save.magicStarClaims={items:action.rewardId==='weekly'?[...record.items]:[...record.items,action.rewardId],week:action.rewardId==='weekly'?magicStarWeek(now):record.week};
}
