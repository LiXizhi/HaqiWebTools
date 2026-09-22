import {ItemDetails} from './view_adventure_item_details.js';
import {magicStarStatus,magicStarWeek,magicPocketRemaining} from './adventure_magic_star_core.js';
import {magicBeanExchangeText} from './adventure_magic_bean_exchange_core.js';
// Layout reference: Aries/Desktop/CombatCharacterFrame/CombatMagicStarPage.html.
// Keepwork supplies the entitlement; remaining calendar months map to star levels.
export function membershipEmblem(el,level='V') {
    const icon=el('span','membership-emblem');icon.setAttribute('aria-hidden','true');
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
    svg.setAttribute('viewBox','0 0 48 48');
    const star=document.createElementNS(ns,'path');
    star.setAttribute('d','M24 3 30 16 45 18 34 29 37 44 24 37 11 44 14 29 3 18 18 16Z');
    star.setAttribute('fill','#f6cf63');star.setAttribute('stroke','#94631e');star.setAttribute('stroke-width','2');
    svg.append(star);icon.append(svg,el('b','',String(level)));return icon;
}

export function renderMembership(body,model,cb,ui) {
    const {el,button}=ui;
    const inspector=new ItemDetails(body,model,ui);
    const {assets,save}=model,config=assets.content.magicStar,member=model.membership||{status:'unknown'};
    const now=model.now??Date.now(),star=magicStarStatus(member,now),record=save.magicStarClaims||{items:[],week:null};
    body.closest('.modal').classList.add('magic-star-modal');
    const labels={unknown:'会员状态待确认',loading:'正在查询会员状态…',guest:'登录后查看会员状态',error:'查询失败，请刷新重试'};
    const identity=el('div','magic-star-identity',membershipEmblem(el,star.level),el('div','',el('h3','',`魔法星 ${star.level} 级`),el('p','',member.status==='ready'?(star.level?'魔法星已激活':'魔法星未激活'):labels[member.status]),el('p','muted',star.expiresAt?`有效期至 ${new Date(star.expiresAt).toLocaleDateString('zh-CN')}`:star.level?'有效日期待确认':'升级会员，点亮魔法星')));
    const energy=el('div','magic-star-energy',el('span','',star.days===null?'会员有效，剩余天数待确认':`剩余能量：${star.days} 天`),el('p','magic-bean-note',magicBeanExchangeText(member,model.magicBeanExchange||null,now,{inBattle:!!save.pendingEncounter})));
    const left=el('section','magic-star-left',identity,energy,el('h3','','专属左手法杖'));
    const rewards=el('div','magic-star-rewards');
    for(const reward of config.rewards){
        const item=assets.content.items[reward.itemId],owned=record.items.includes(reward.id)||(save.inventory[reward.itemId]||0)>0;
        const eligible=star.level>=reward.starLevel&&save.level>=reward.heroLevel;
        const picture=el('canvas','magic-star-item');picture.width=80;picture.height=80;picture.setAttribute('role','img');picture.setAttribute('aria-label',reward.name);
        if(item?.art)assets.draw(picture.getContext('2d'),item.art,0,0,80,80);
        const claim=button(owned?'已领取':eligible?'领取':'未解锁',()=>cb.action({type:'magic-star-claim',rewardId:reward.id}),'primary');claim.disabled=owned||!eligible;claim.setAttribute('aria-label',`${reward.name}：${claim.textContent}`);
        const inspect=button([picture,el('strong','',reward.name)],()=>inspector.show(item,{trigger:inspect,source:'魔法星专属左手法杖',requirements:`魔法星 ${reward.starLevel} 级 · 角色 ${reward.heroLevel} 级`}), 'item-inspect-button');
        inspect.setAttribute('aria-label',`查看${reward.name}详情`);inspect.setAttribute('aria-haspopup','dialog');
        rewards.append(el('article','magic-star-reward',inspect,el('small','',`魔法星 ${reward.starLevel} 级${reward.heroLevel>1?` · 角色 ${reward.heroLevel} 级`:''}`),claim));
    }
    left.append(rewards);
    const tabs=el('nav','gui-tabs magic-star-tabs'),detail=el('div','magic-star-detail');tabs.setAttribute('aria-label','魔法星权益');
    const right=el('section','magic-star-right',tabs,detail);
    function select(key){
        for(const tab of tabs.children)tab.setAttribute('aria-pressed',String(tab.dataset.key===key));
        detail.replaceChildren();
        if(key==='attributes'){
            detail.append(el('h3','','魔法星属性加成'),el('p','muted','生命、攻击、防御、治疗、受治疗和命中在新战斗中生效；经验加成暂未开放。'));
            const table=el('table','magic-star-table'),head=el('tr','');
            for(const title of ['等级','生命','攻击','防御','治疗','被治疗','命中','经验'])head.append(el('th','',title));
            table.append(el('thead','',head));const rows=el('tbody','');
            for(const row of config.levels){const tr=el('tr',star.level===row.level?'current':'');if(star.level===row.level)tr.setAttribute('aria-current','true');for(const field of ['level','HP','attack','guard','cure','becured','hit','exp'])tr.append(el('td','',field==='level'?`${row[field]}级`:`${row[field]}%`));rows.append(tr);}
            table.append(rows);detail.append(el('div','magic-star-table-scroll',table));
        }else if(key==='growth'){
            detail.append(el('h3','','魔法星如何成长'),el('p','','魔法星等级按会员剩余有效期计算。未开通或已到期为 0 级；一个月为 1 级，一年达到最高 10 级。'),el('p','','不足一个月按一个月计算，最高 10 级。剩余有效期变短时，魔法星等级也会随之变化。'),el('p','','有效日期暂时无法确认时，已确认的会员按 1 级显示。'),el('p','','剩余有效期按北京时间的日历天数自动兑换为魔豆，每天 10 颗。第一次从今天算到到期日；记下这次兑到的日期后，再次兑换只计算更晚的新增天数。'),el('p','muted','续期后点击“刷新会员状态”，查看最新等级。新增的会员天数会自动兑换。'));
        }else if(key==='features'){
            detail.append(el('h3','','魔法星独有功能'),el('p','','已开放：战斗属性加成、商城会员专属商品、专属左手法杖、每周仙豆和魔法口袋礼物。'),el('p','','法杖需同时达到魔法星和角色等级要求，每个角色每件领取一次。已有同款法杖不重复发放。'),el('p','muted','魔法星环绕表现暂未开放。'),button('前往商城',()=>cb.panel('shop'),'primary'));
        }else{
            const amount=config.levels[star.level].weekly_money;
            detail.append(el('h3','','魔法储物罐'),el('p','',`当前等级每周可领取 ${amount} 仙豆`),el('p','muted','每个角色每周领取一次，每周一 00:00（北京时间）重置。'));
            const claimed=record.week!==null&&record.week>=magicStarWeek(now);
            const claim=button(claimed?'本周已领取':star.level?'领取仙豆':'会员可领取',()=>cb.action({type:'magic-star-claim',rewardId:'weekly'}),'primary');claim.disabled=claimed||star.level===0;detail.append(claim);
            const remaining=magicPocketRemaining(record.pocket,star.level,now);
            const pocket=button('领取神秘礼物',()=>cb.action({type:'magic-star-claim',rewardId:'pocket'}),'primary');
            pocket.disabled=member.status!=='ready'||remaining===0;
            detail.append(el('h3','','魔法口袋'),el('p','',`本周剩余 ${remaining} 次`),pocket,el('p','muted','每周次数为魔法星等级加一。礼物存入背包，道具使用玩法暂未开放。'));
            const list=el('div','magic-star-weekly-list');for(const row of config.levels)list.append(el('div',star.level===row.level?'current':'',`${row.level} 级`,el('strong','',`${row.weekly_money} 仙豆`)));detail.append(list);
        }
    }
    for(const [key,title] of [['attributes','属性加成'],['growth','成长秘籍'],['features','独有功能'],['gifts','免费领取']]){const tab=button(title,()=>{model.membershipView.tab=key;select(key);});tab.dataset.key=key;tabs.append(tab);}
    model.membershipView??={tab:'attributes'};select(model.membershipView.tab);
    const refresh=button('刷新会员状态',()=>cb.refreshMembership?.(),'secondary');refresh.disabled=member.status==='loading';
    const become=button('成为VIP',()=>cb.becomeVip?.(),'primary');
    body.append(el('div','magic-star-layout',left,right),el('footer','magic-star-footer',el('p','muted','会员开通暂未开放，点击“成为VIP”可查看个人资料。'),refresh,become));
}
