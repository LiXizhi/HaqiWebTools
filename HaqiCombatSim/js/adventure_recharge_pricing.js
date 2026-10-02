import {RECHARGE_PRODUCT_CODE} from './adventure_recharge_core.js';

// Same public catalog used by keepwork-nuxt VipPayOrder.vue, no order/token creation.
export async function loadRechargePrice({fetchImpl=globalThis.fetch,timeoutMs=10000}={}) {
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
        const response=await fetchImpl('https://api.keepwork.com/core/v0/pay/systemProducts/search',{
            method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',
            body:JSON.stringify({codes:[RECHARGE_PRODUCT_CODE]}),signal:controller.signal
        });
        if(!response.ok)throw Error('无法读取会员价格');
        const data=await response.json(),product=data.products?.find(row=>row.code===RECHARGE_PRODUCT_CODE);
        if(!Number.isSafeInteger(product?.price)||product.price<=0||product.canPurchase===false)throw Error('会员商品暂时不可购买');
        return product.price;
    }finally{clearTimeout(timer);}
}
