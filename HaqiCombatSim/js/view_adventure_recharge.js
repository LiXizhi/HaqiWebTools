import {setText,tr} from './locale_runtime.js';
import {beijingYmd,formatExchangeDate,magicBeanExchangeText,MAGIC_BEAN_ID} from './adventure_magic_bean_exchange_core.js';
import {rechargeAmount,rechargeQuote} from './adventure_recharge_core.js';
import {showExchange,membershipEmblem} from './view_adventure_membership.js';
import {magicStarStatus} from './adventure_magic_star_core.js';

export function renderRecharge(body,model,cb,{el,button}) {
    const member=model.membership||{status:'unknown'},now=model.now??Date.now();
    const view=model.rechargeView??={amount:'108'};
    body.closest('.modal')?.classList.add('recharge-modal');
    const star=magicStarStatus(member,now);
    const connected=member.status==='ready'&&!!model.accountOwner&&member.username===model.accountOwner;
    const status=el('p','muted');status.setAttribute('role','status');
    const labels={unknown:'会员状态待确认',loading:'正在查询会员状态…',guest:'登录后查看会员状态',error:'查询失败，请刷新重试'};
    setText(status,member.status==='ready'?(member.isVip?'会员已激活':'会员尚未开通'):labels[member.status]);
    const account=el('p','');setText(account,'充值账号：{name}',{name:member.username||tr('尚未登录')});
    const expiry=el('strong','');
    if(member.isVip&&Number.isFinite(Date.parse(member.expiresAt)))setText(expiry,'VIP 到期日：{date}（北京时间）',{date:formatExchangeDate(beijingYmd(Date.parse(member.expiresAt)))});
    else setText(expiry,member.isVip?'有效日期待确认':'开通后显示 VIP 到期日');
    const balance=el('strong','');setText(balance,'当前魔豆：{count}',{count:model.save.inventory[MAGIC_BEAN_ID]||0});
    const exchange=el('p','');showExchange(exchange,magicBeanExchangeText(member,model.magicBeanExchange||null,now,{inBattle:!!model.save.pendingEncounter}));
    const starLabel=el('strong','recharge-star-level');
    setText(starLabel,star.level?'魔法星 {level} 级':'等待点亮',{level:star.level});
    const emblem=el('div','recharge-star-orbit',membershipEmblem(el,model.assets,star.level));
    const identity=el('div','recharge-star-identity',emblem,el('div','',el('span','recharge-eyebrow','魔法星 VIP'),el('h3','','点亮魔法之旅'),starLabel,status));
    const overview=el('section','recharge-summary',identity,account,
        el('div','recharge-account-scope',el('strong','','账号绑定 · 全角色共享'),el('p','','同一账号下的所有角色共享 VIP 有效期，无需分别开通。')),expiry,
        el('div','recharge-balance',balance),exchange,
        button('探索魔法星权益',()=>cb.panel('membership'),'secondary'));
    const input=el('input','');input.type='text';input.inputMode='decimal';input.value=view.amount;input.autocomplete='off';input.id='membership-recharge-amount';
    const label=el('label','','充值金额（元）');label.htmlFor=input.id;
    const choices=el('div','gui-tabs recharge-amounts');
    const error=el('p','recharge-error');error.setAttribute('role','alert');
    const pricing=member.rechargePricing||{status:'unknown'};
    const quoteBox=el('section','recharge-quote');quoteBox.setAttribute('aria-live','polite');quoteBox.setAttribute('aria-atomic','true');
    const priceNote=el('p','muted');
    if(pricing.status==='ready')setText(priceNote,'当前单价：¥{price} / 天，每新增 1 天有效期获得 10 魔豆。',{price:(pricing.priceCents/100).toFixed(2)});
    else setText(priceNote,pricing.status==='error'?'会员价格读取失败，请点击“刷新会员状态”重试。':'正在读取官方会员价格…');
    const pay=button('前往安全收银台',()=>cb.recharge?.(view.amount),'primary');
    function update(){
        view.amount=input.value;
        quoteBox.replaceChildren();
        try{
            const amount=rechargeAmount(view.amount);error.textContent='';input.removeAttribute('aria-invalid');
            setText(pay,'前往支付 ¥{amount}',{amount:amount.toFixed(2)});pay.disabled=!connected||!!member.rechargePending||pricing.status!=='ready';
            if(pricing.status==='ready'){
                const quote=rechargeQuote(view.amount,pricing.priceCents,connected?member:null,model.magicBeanExchange||null,now);
                const duration=el('strong',''),beans=el('strong',''),after=el('strong','');
                setText(duration,'购买 VIP：{days} 天',{days:quote.days});
                setText(beans,quote.expiresAt?'预计新增魔豆：{beans} 颗':'新增有效期可获魔豆：{beans} 颗',{beans:quote.beans});
                setText(after,quote.expiresAt?'付款后 VIP 到期日：{date}（北京时间）':'付款后到期日：登录账号后显示',{date:quote.until?formatExchangeDate(quote.until):''});
                quoteBox.append(duration,beans,after);
                if(quote.totalBeans>quote.beans){const pending=el('p','muted');setText(pending,'付款后预计共到账 {total} 魔豆，其中 {pending} 颗为已有有效期尚未兑换的魔豆。',{total:quote.totalBeans,pending:quote.totalBeans-quote.beans});quoteBox.append(pending);}
                if(quote.beans===0)quoteBox.append(el('p','muted','本次普通 VIP 续费未超过已有会员有效期或已兑换日期，因此不会新增魔豆。'));
                if(quote.remainderCents){const rounding=el('p','recharge-rounding');setText(rounding,'按完整天数计算，¥{remainder} 余款不会增加会员天数；可修改金额为 ¥{whole}。',{remainder:(quote.remainderCents/100).toFixed(2),whole:(amount-quote.remainderCents/100).toFixed(2)});quoteBox.append(rounding);}
                quoteBox.append(el('p','muted','按当前价格和会员状态预估；支付完成并刷新会员后到账，战斗中延后至结束。最终以收银台和支付后状态为准。'));
            }else quoteBox.append(el('p','',pricing.status==='error'?'暂时无法预览天数、魔豆与到期日，请刷新价格。':'价格确认后显示天数、魔豆与到期日。'));
        }
        catch(e){setText(error,e.message);input.setAttribute('aria-invalid','true');setText(pay,'前往安全收银台');pay.disabled=true;quoteBox.append(el('p','','请输入可购买至少 1 天会员的有效金额。'));}
        if(member.rechargePending)setText(pay,'正在打开充值页面…');
        for(const choice of choices.children)choice.setAttribute('aria-pressed',String(Number(view.amount)===Number(choice.dataset.amount)));
    }
    for(const [amount,name] of [[25,'轻装启程'],[108,'魔法之旅'],[498,'星光进阶'],[898,'璀璨远行']]){
        const choice=button([el('span','recharge-tier-name',name),el('strong','recharge-tier-price',`¥${amount}`)],()=>{input.value=String(amount);update();});
        if(pricing.status==='ready'){
            const detail=el('small','recharge-tier-detail');
            try{const quote=rechargeQuote(amount,pricing.priceCents,connected?member:null,model.magicBeanExchange||null,now);setText(detail,'{days} 天 · +{beans} 魔豆',{days:quote.days,beans:quote.beans});}
            catch{setText(detail,'暂时无法预览');}
            choice.append(detail);
        }
        choice.dataset.amount=amount;choices.append(choice);
    }
    input.addEventListener('input',update);input.disabled=!!member.rechargePending;
    for(const choice of choices.children)choice.disabled=!!member.rechargePending;
    const refresh=button('刷新会员状态',()=>cb.refreshMembership?.(),'secondary');refresh.disabled=member.status==='loading';
    const actions=el('div','recharge-actions',pay,refresh);
    if(!connected)actions.append(button('登录 / 连接账号',()=>cb.cloud?.(),'secondary'));
    body.append(el('div','recharge-layout',overview,el('section','recharge-form',el('span','recharge-eyebrow','开启星光旅程'),el('h3','','选择充值金额'),
        priceNote,choices,label,input,error,quoteBox,actions,
        el('p','muted','付款完成后返回此页，若到期日尚未更新，请点击“刷新会员状态”。'))),
        el('section','recharge-rules',el('h3','','会员天数折算魔豆'),el('p','','每新增 1 天会员有效期，自动获得 10 魔豆；会员有效期不会因此缩短。'),
        el('p','muted','首次从今天算到 VIP 到期日，按北京时间日历天数兑换。之后只计算超过已兑换日期的新增天数，同一段日期只兑换一次。'),
        el('p','muted','VIP 有效期由账号下所有角色共享；魔豆放入当前角色背包，不会为每个角色重复兑换。战斗中会在结束后兑换。')));
    update();
}
