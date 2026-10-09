// Keepwork HybridUnlockExpert: day-card amount is yuan; SDK converts to cents.
import {beijingYmd,magicBeanExchangeQuote} from './adventure_magic_bean_exchange_core.js';
// Estimates use the live official day-card price; checkout remains authoritative.
export const RECHARGE_PRODUCT_CODE='vip_common_1_day';

// coreservice/app/service/pay.js getNewClientVipPrice: floor(amount / product.price).
// permission.js extendUserRoleDeadline: extend common VIP from max(now, its deadline).
// Super VIP remains independent; the game uses the later effective deadline.
export function rechargeQuote(value,priceCents,member,record,now) {
    if(!Number.isSafeInteger(priceCents)||priceCents<=0)throw Error('会员价格暂时无法确认，请刷新重试。');
    const cents=Math.round(rechargeAmount(value)*100),days=Math.floor(cents/priceCents);
    if(days<1)throw Error(`充值金额至少为 ${(priceCents/100).toFixed(2)} 元，可购买 1 天会员。`);
    const result={days,beans:days*10,remainderCents:cents%priceCents,expiresAt:null,totalBeans:null};
    if(member?.status!=='ready')return result;
    if(!Number.isFinite(now))throw Error('日期无效');
    const current=Date.parse(member.expiresAt),common=Date.parse(member.commonExpiresAt);
    if(member.isVip&&!Number.isFinite(current))throw Error('会员到期日待确认，请刷新后查看续费预览。');
    // Legacy callers without separate common VIP use the effective expiry.
    const baseline=member.commonExpiresAt===undefined?current:common;
    const renewed=Math.max(now,Number.isFinite(baseline)?baseline:now)+days*86400000;
    const end=Math.max(renewed,Number.isFinite(current)?current:now);
    if(!Number.isFinite(end)||!Number.isSafeInteger(days*10))throw Error('充值金额超出可预览范围。');
    result.expiresAt=new Date(end).toISOString();
    const before=magicBeanExchangeQuote(member,record,now);
    const after=magicBeanExchangeQuote({...member,isVip:true,expiresAt:result.expiresAt},record,now);
    result.beans=after.beans-before.beans;
    result.totalBeans=after.beans;
    result.until=beijingYmd(end);
    return result;
}
export function rechargeAmount(value) {
    const text=String(value??'').trim();
    if(!/^\d+(?:\.\d{1,2})?$/.test(text))throw Error('请输入大于零的金额，最多两位小数。');
    const [yuan,fraction='']=text.split('.');
    const cents=Number(yuan)*100+Number(fraction.padEnd(2,'0'));
    if(!Number.isSafeInteger(cents)||cents<=0)throw Error('请输入有效的充值金额。');
    return cents/100;
}

// Official checkout contract from HybridUnlockExpert. Never use a CDN origin.
export function membershipCheckoutUrl(userId,value,referralUrl='/Haqi.html') {
    if(userId==null||String(userId)==='')throw Error('无法确认充值账号，请重新登录。');
    const params=new URLSearchParams({userId:String(userId),productCode:'vip_common_1_day',from:'haqi_adventure',referralUrl,amount:String(Math.round(rechargeAmount(value)*100))});
    return `https://keepwork.com/p/vb/vipPayOrder?${params}`;
}
