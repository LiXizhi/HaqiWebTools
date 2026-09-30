import {loadKeepwork} from './adventure_cloud.js';
import {rechargeAmount,membershipCheckoutUrl} from './adventure_recharge_core.js';

// Keepwork core SDK: getUserProfile; VIP = commonVip || vip.
// Account entitlement is transient browser state, never character/save data.
export function createMembershipClient({loadSDK=loadKeepwork,onChange=()=>{},now=Date.now,timeoutMs=15000,eventTarget=globalThis.window,visibility=globalThis.document}={}) {
    let sdk,version=0,request=0,subscribed=false,profilePending=false,pending=null,memberToken=null;
    let rechargePending=false,watchUntil=0,watching=false,returnPending=false;
    let state={status:'unknown',isVip:false,username:null};
    const snapshot=()=>({...state,rechargePending});
    const publish=next=>{state=next;onChange(snapshot());return snapshot();};
    const deadlineValid=value=>!value||Number.isFinite(Date.parse(value))&&Date.parse(value)>now();
    const enabled=value=>value===true||value===1;
    function refresh({force=false}={}) {
        if(pending)return pending;
        if(!force&&sdk?.token===memberToken&&['ready','guest'].includes(state.status)){
            if(state.isVip&&!deadlineValid(state.expiresAt))publish({...state,isVip:false});
            return Promise.resolve(snapshot());
        }
        const task=fetchMembership().finally(()=>{if(pending===task)pending=null;});pending=task;return task;
    }
    async function fetchMembership() {
        const id=++request;
        publish({status:'loading',isVip:false,username:null});
        let timer;
        try {
            const next=await Promise.race([(async()=>{
                sdk=await loadSDK();
                if(!subscribed){
                    sdk.onAuthStateChange(()=>{version++;request++;watchUntil=0;pending=null;memberToken=null;publish({status:'unknown',isVip:false,username:null});});
                    subscribed=true;
                }
                if(!sdk.token)return {status:'guest',isVip:false,username:null};
                const token=sdk.token,epoch=version;
                const profile=await sdk.getUserProfile({forceRefresh:true,useCache:false});
                if(epoch!==version||token!==sdk.token||!sdk.token)throw Error('account changed');
                if(!profile?.username)throw Error('invalid profile');
                const isVip=enabled(profile.commonVip)&&deadlineValid(profile.commonVipDeadline)||enabled(profile.vip)&&deadlineValid(profile.vipDeadline);
                const deadlines=[[profile.commonVip,profile.commonVipDeadline],[profile.vip,profile.vipDeadline]].filter(([flag,date])=>enabled(flag)&&deadlineValid(date)&&Number.isFinite(Date.parse(date))).map(([,date])=>Date.parse(date));
                const expiresAt=deadlines.length?new Date(Math.max(...deadlines)).toISOString():null;
                return {status:'ready',isVip,username:profile.username,userId:profile.id,expiresAt};
            })(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),timeoutMs);})]);
            if(id!==request)throw Error('stale request');
            memberToken=sdk.token;return publish(next);
        }catch{
            if(id===request)publish({status:'error',isVip:false,username:null});
            throw Error('无法确认会员状态，请检查网络或重新登录后重试。');
        }finally{clearTimeout(timer);}
    }
    async function openProfile(){
        if(profilePending)return;
        profilePending=true;
        try{
            sdk=await loadSDK();
            await sdk.showProfileWindow({title:'个人资料',enableVip:true});
            return await refresh({force:true});
        }finally{profilePending=false;}
    }
    async function refreshOnReturn(){
        if(now()>watchUntil||!watchUntil||returnPending||visibility?.hidden)return;
        returnPending=true;
        try{await refresh({force:true});}catch{/* State exposes the error and manual retry remains available. */}
        finally{returnPending=false;}
    }
    async function openRecharge(value,expectedUsername){
        if(rechargePending)throw Error('充值页面正在处理中，请稍候。');
        const amountYuan=rechargeAmount(value);
        rechargePending=true;publish(state);
        try{
            const member=await refresh({force:true});
            if(member.status!=='ready'||!expectedUsername||member.username!==expectedUsername)throw Error('请先连接当前角色所属的会员账号。');
            if(typeof sdk.ads?.openVipMembership!=='function')throw Error('充值服务暂时不可用，请刷新页面后重试。');
            const token=sdk.token,epoch=version;
            watchUntil=now()+10*60*1000;
            if(!watching){eventTarget?.addEventListener('focus',refreshOnReturn);visibility?.addEventListener('visibilitychange',refreshOnReturn);watching=true;}
            // true only means VIP, including a pre-existing VIP. It is NOT a payment receipt.
            // Current SDK treats cdn.keepwork.com as a checkout host. Route subdomain
            // deployments to the documented main-site checkout until SDK fixes this.
            const location=eventTarget?.location,host=location?.hostname||'';
            if(/\.(keepwork\.com|keepwork\.cn)$/i.test(host)){
                const url=membershipCheckoutUrl(member.userId,amountYuan,`${location.pathname}${location.search}`);
                const popup=eventTarget.open(url,'_blank','width=400,height=600');
                if(popup)popup.opener=null;
                else throw Error('浏览器拦截了收银台窗口，请允许弹窗后重试。');
            }else await sdk.ads.openVipMembership({productCode:'vip_common_1_day',amountYuan,from:'haqi_adventure'});
            if(token!==sdk.token||epoch!==version)throw Error('登录账号已变化，请重新确认会员状态。');
            return await refresh({force:true});
        }finally{rechargePending=false;publish(state);}
    }
    return {get state(){return snapshot();},refresh,openProfile,openRecharge};
}
