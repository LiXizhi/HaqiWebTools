import {magicStarStatus,magicStarWeek} from '../../adventure_magic_star_core.js';
import {setText} from '../../locale_runtime.js';

// A render-time summary only; the membership panel owns refresh and claims.
export function createShopMembershipSummary(model,cb,{el,button}) {
    const box=el('div','shop-membership-summary');
    const member=model.membership,now=model.now??Date.now();
    const config=model.assets?.content?.magicStar;
    const star=member?.status==='ready'&&Number.isFinite(now)?magicStarStatus(member,now):{level:0};
    const amount=config?.levels?.[star.level]?.weekly_money;
    const week=model.save?.magicStarClaims?.week;
    const recordValid=week==null||(Number.isSafeInteger(week)&&week>=0);
    if(star.level>0&&config?.weeklyItemId===17213&&Number.isSafeInteger(amount)&&amount>0&&recordValid){
        const claimed=week!=null&&week>=magicStarWeek(now);
        const summary=el('p','shop-item-meta');
        setText(summary,claimed?'魔法星{level}级 · 本周{amount}仙豆已领取':'魔法星{level}级 · 本周可领取{amount}仙豆',{level:star.level,amount});
        box.append(summary,el('small','muted','每角色每周领取一次；法杖需达到魔法星和角色等级，每件只领一次，已拥有不重复发放。'));
    }
    box.append(button('查看每周仙豆与法杖领取条件',()=>cb.panel('membership'),'secondary shop-membership'));
    return box;
}
