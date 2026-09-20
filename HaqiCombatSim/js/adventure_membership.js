import {loadKeepwork} from './adventure_cloud.js';

// Keepwork core SDK: getUserProfile; VIP = commonVip || vip.
// Account entitlement is transient browser state, never character/save data.
export function createMembershipClient({loadSDK=loadKeepwork,onChange=()=>{},now=Date.now,timeoutMs=15000}={}) {
    let sdk,version=0,request=0,subscribed=false,profilePending=false;
    let state={status:'unknown',isVip:false,username:null};
    const publish=next=>{state=next;onChange({...state});return {...state};};
    const deadlineValid=value=>!value||Number.isFinite(Date.parse(value))&&Date.parse(value)>now();
    const enabled=value=>value===true||value===1;
    async function refresh() {
        const id=++request;
        publish({status:'loading',isVip:false,username:null});
        let timer;
        try {
            const next=await Promise.race([(async()=>{
                sdk=await loadSDK();
                if(!subscribed){
                    sdk.onAuthStateChange(()=>{version++;request++;publish({status:'unknown',isVip:false,username:null});});
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
                return {status:'ready',isVip,username:profile.username,expiresAt};
            })(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),timeoutMs);})]);
            if(id!==request)throw Error('stale request');
            return publish(next);
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
            return await refresh();
        }finally{profilePending=false;}
    }
    return {get state(){return {...state};},refresh,openProfile};
}
