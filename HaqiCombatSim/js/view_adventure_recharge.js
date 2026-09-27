import {setText,tr} from './locale_runtime.js';
import {beijingYmd,formatExchangeDate,magicBeanExchangeText,MAGIC_BEAN_ID} from './adventure_magic_bean_exchange_core.js';
import {rechargeAmount} from './adventure_recharge_core.js';
import {showExchange} from './view_adventure_membership.js';

export function renderRecharge(body,model,cb,{el,button}) {
    const member=model.membership||{status:'unknown'},now=model.now??Date.now();
    const view=model.rechargeView??={amount:'4'};
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
    const overview=el('section','recharge-summary',account,status,expiry,balance,exchange);
    const input=el('input','');input.type='text';input.inputMode='decimal';input.value=view.amount;input.autocomplete='off';input.id='membership-recharge-amount';
    const label=el('label','','充值金额（元）');label.htmlFor=input.id;
    const choices=el('div','gui-tabs recharge-amounts');
    const error=el('p','recharge-error');error.setAttribute('role','alert');
    const pay=button('前往安全收银台',()=>cb.recharge?.(view.amount),'primary');
    function update(){
        view.amount=input.value;
        try{const amount=rechargeAmount(view.amount);error.textContent='';input.removeAttribute('aria-invalid');setText(pay,'前往支付 ¥{amount}',{amount:amount.toFixed(2)});pay.disabled=!connected||!!member.rechargePending;}
        catch(e){setText(error,e.message);input.setAttribute('aria-invalid','true');setText(pay,'前往安全收银台');pay.disabled=true;}
        if(member.rechargePending)setText(pay,'正在打开充值页面…');
        for(const choice of choices.children)choice.setAttribute('aria-pressed',String(Number(view.amount)===Number(choice.dataset.amount)));
    }
    for(const amount of [4,20,50,100]){const choice=button(`¥${amount}`,()=>{input.value=String(amount);update();});choice.dataset.amount=amount;choices.append(choice);}
    input.addEventListener('input',update);input.disabled=!!member.rechargePending;
    for(const choice of choices.children)choice.disabled=!!member.rechargePending;
    const refresh=button('刷新会员状态',()=>cb.refreshMembership?.(),'secondary');refresh.disabled=member.status==='loading';
    const actions=el('div','recharge-actions',pay,refresh);
    if(!connected)actions.append(button('登录 / 连接账号',()=>cb.cloud?.(),'secondary'));
    body.append(el('div','recharge-layout',overview,el('section','recharge-form',el('h3','','开通或续费会员'),label,input,choices,error,
        el('p','muted','支持自定义金额，最低金额、可购买天数及最终实付以收银台为准。'),actions,
        el('p','muted','付款完成后返回此页，若到期日尚未更新，请点击“刷新会员状态”。'))),
        el('section','recharge-rules',el('h3','','会员天数折算魔豆'),el('p','','每新增 1 天会员有效期，自动获得 10 魔豆；会员有效期不会因此缩短。'),
        el('p','muted','首次从今天算到 VIP 到期日，按北京时间日历天数兑换。之后只计算超过已兑换日期的新增天数，同一段日期只兑换一次。'),
        el('p','muted','魔豆放入当前账号的当前角色背包；战斗中会在结束后兑换。')),
        button('查看会员权益',()=>cb.panel('membership'),'secondary'));
    update();
}
