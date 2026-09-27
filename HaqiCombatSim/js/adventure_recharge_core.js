// Keepwork HybridUnlockExpert: day-card amount is yuan; SDK converts to cents.
// The server determines the minimum price and duration, never a client estimate.
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
