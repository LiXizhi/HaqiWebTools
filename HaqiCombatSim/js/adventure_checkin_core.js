import { defaultParams, resolveParams } from './combat_params_core.js';

const DAY_MS=86400000;
const dayAt=now=>Math.floor((now+8*3600000)/DAY_MS);
function dayState(save,now){
    const day=dayAt(now),old=save.checkin;
    return old?.version===2&&old.day>=day?old:{version:2,day,onlineMs:0,claimed:[]};
}
// MiJiuHuLu.lua GetObtainAwardState L326-389: daily flags, strictly > threshold.
// MiJiuHuLu.html L332-482: five gourds, cumulative online 1/15/30/60/90 minutes.
// Web adaptation: visible gameplay time, China midnight reset, currency-only rewards.
export function checkinStatus(save,content,now){
    const {minutes,coins}=resolveParams({cards:{}},content.balanceParams||defaultParams('kids')).checkin;
    if(!Number.isSafeInteger(now)||now<0||!Array.isArray(minutes)||minutes.length!==5||minutes.some(x=>!Number.isSafeInteger(x)||x<1)||!Number.isSafeInteger(coins)||coins<1)throw new Error('签到参数无效');
    const state=dayState(save,now);
    const gourds=minutes.map((minute,index)=>{
        const claimed=state.claimed.includes(index),remainingMs=Math.max(0,minute*60000+1-state.onlineMs);
        return {index,minute,coins,claimed,remainingMs,ready:!claimed&&remainingMs===0};
    });
    const pending=gourds.filter(g=>!g.claimed);
    return {gourds,onlineMs:state.onlineMs,coins,ready:gourds.some(g=>g.ready),finished:!pending.length,remainingMs:pending.length?Math.min(...pending.map(g=>g.remainingMs)):0};
}
// Elapsed visible play time is supplied by the browser controller; never count offline gaps.
export function tickCheckin(save,now,elapsedMs){
    if(!Number.isSafeInteger(now)||now<0||!Number.isFinite(elapsedMs)||elapsedMs<0)throw new Error('签到时间无效');
    const state=dayState(save,now),sinceMidnight=(now+8*3600000)%DAY_MS;
    const delta=Math.min(Math.floor(elapsedMs),sinceMidnight);
    state.onlineMs=Math.min(DAY_MS,state.onlineMs+delta);
    save.checkin=state;
}
export function claimCheckin(save,content,now,index){
    const status=checkinStatus(save,content,now),gourd=status.gourds[index];
    if(!Number.isInteger(index)||!gourd)throw new Error('请选择一个葫芦');
    if(gourd.claimed)throw new Error('这个葫芦今天已经领取过了。');
    if(!gourd.ready)throw new Error('在线时间不足，葫芦还不能领取。');
    const balance=(save.inventory[100]||0)+gourd.coins;
    if(!Number.isSafeInteger(balance))throw new Error('签到数值超出范围');
    const state=dayState(save,now);
    save.inventory[100]=balance;
    save.checkin={...state,claimed:[...state.claimed,index]};
}
export function validateCheckin(save){
    const s=save.checkin;if(s===undefined)return;
    if(!s||typeof s!=='object'||Array.isArray(s))throw new Error('存档签到记录无效');
    // Previous single-reward saves keep their currency; the new daily track starts fresh.
    if(s.version===undefined&&Number.isSafeInteger(s.nextAt)&&s.nextAt>=0)return;
    if(s.version!==2||!Number.isSafeInteger(s.day)||s.day<0||!Number.isSafeInteger(s.onlineMs)||s.onlineMs<0||s.onlineMs>DAY_MS||!Array.isArray(s.claimed)||new Set(s.claimed).size!==s.claimed.length||s.claimed.some(i=>!Number.isInteger(i)||i<0||i>4))throw new Error('存档签到记录无效');
}
