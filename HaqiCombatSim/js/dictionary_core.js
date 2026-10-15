import {localBuffDay,awardDailySpeech} from './language_daily_buff_core.js';
import {createRng,hashSeed} from './rng_core.js';

export const REVIEW_DAYS=[1,3,7,14,30];
export const emptyDictionary=()=>({version:1,languages:{},buff:null});
export function validateDictionary(data){
    if(data?.version!==1||!['zh','en'].includes(data.language)||!Array.isArray(data.entries)||!data.entries.length)throw Error('字典内容无效');
    const ids=new Set();
    for(const e of data.entries){
        if(!/^[a-z0-9-]+$/.test(e.id)||ids.has(e.id)||!e.text||!e.meaning||!e.example||!e.context?.question||!e.context?.answer)throw Error('字典条目不完整');
        ids.add(e.id);
        if(data.language==='zh'&&(!e.strokes?.medians?.length||e.strokes.medians.length!==e.strokes.strokes?.length))throw Error('汉字缺少笔顺：'+e.text);
        if(e.animation&&!/^https:\/\/cdn\.keepwork\.com\/keepwork\/cdn\/hanzi\/hanzi_[a-z]+\.html$/.test(e.animation))throw Error('动画地址不在允许范围');
    }
    return data;
}
export function dictionaryLanguage(state,language){return state.languages[language]||=( {entries:{},plan:null,migrated:false} );}
export function importLegacy(state,legacy,now){
    const row=dictionaryLanguage(state,'zh');if(row.migrated)return;row.migrated=true;
    for(const [id,e] of Object.entries(legacy?.entries||{}))if(e.attempts?.length===3&&!row.entries[id])row.entries[id]={views:0,reviews:0,learned:true,stage:0,nextReviewAt:now,imported:true,lastViewedAt:0};
}
export function dailyDictionaryPlan(state,data,now){
    const row=dictionaryLanguage(state,data.language),day=localBuffDay(now);
    // A backwards clock must not regenerate an earlier reward day.
    if(row.plan?.day>=day)return row.plan;
    const known=data.entries.filter(e=>row.entries[e.id]?.learned),due=known.filter(e=>row.entries[e.id].nextReviewAt<=now).sort((a,b)=>row.entries[a.id].nextReviewAt-row.entries[b.id].nextReviewAt||a.id.localeCompare(b.id));
    const fresh=data.entries.filter(e=>!row.entries[e.id]?.learned).slice(0,3).map(e=>e.id);
    const review=due.slice(0,5).map(e=>e.id),target=fresh[0]||review[0]||data.entries[0].id;
    return row.plan={day,review,fresh,target,completed:[],contextDone:false};
}
export function recordDictionaryView(state,language,id,now){
    const row=dictionaryLanguage(state,language),e=row.entries[id]||={views:0,reviews:0,stage:0};
    e.views++;e.firstViewedAt??=now;e.lastViewedAt=now;
}
export const normalizeSpelling=value=>String(value).normalize('NFKC').trim().toLowerCase().replace(/[.!?。！？]+$/,'').trim();
export function dictionaryChoices(data,entry,kind='meaning',seed=''){
    const value=e=>kind==='context'?e.context.answer:e.meaning;
    const others=[...new Set(data.entries.filter(e=>e.id!==entry.id).map(value))].filter(v=>v!==value(entry));
    const rng=createRng(hashSeed(seed+entry.id+kind));
    const shuffle=items=>rng.shuffle(items);
    return shuffle([value(entry),...shuffle(others).slice(0,2)]);
}
export function mergeDictionaryBuff(state,save,content,now){
    const day=localBuffDay(now);if(state.buff?.day>day)return;
    const carrier={seed:save.seed,dailyLanguageBuff:state.buff?.day===day?structuredClone(state.buff):undefined};
    if(!carrier.dailyLanguageBuff&&save.dailyLanguageBuff?.day===day)carrier.dailyLanguageBuff=structuredClone(save.dailyLanguageBuff);
    else if(save.dailyLanguageBuff?.day===day)for(const id of save.dailyLanguageBuff.events||[])awardDailySpeech(carrier,content,id,now);
    state.buff=carrier.dailyLanguageBuff||null;
}
export function completeDictionary(state,data,id,{now,hinted=false,errors=0,context=false,save={},content={}}){
    const entry=data.entries.find(e=>e.id===id);if(!entry)throw Error('未知字词');
    const plan=dailyDictionaryPlan(state,data,now),day=localBuffDay(now);
    if(plan.day!==day)return {blocked:true,reward:null};
    const row=dictionaryLanguage(state,data.language),e=row.entries[id]||={views:0,reviews:0,stage:0};
    let eligible=false;
    if(context){if(id!==plan.target)throw Error('情境题目标不匹配');eligible=!plan.contextDone;plan.contextDone=true;}
    else{
        eligible=e.completedDay!==day;
        if(eligible){
            e.stage=!e.learned||hinted||errors?0:Math.min(4,(e.stage||0)+1);
            e.learned=true;e.reviews=(e.reviews||0)+1;e.lastReviewAt=now;e.lastResult={hinted,errors};e.completedDay=day;
            const next=new Date(now);next.setDate(next.getDate()+REVIEW_DAYS[e.stage]);e.nextReviewAt=next.getTime();
        }
        if(!plan.completed.includes(id))plan.completed.push(id);
    }
    mergeDictionaryBuff(state,save,content,now);
    const carrier={seed:save.seed,dailyLanguageBuff:state.buff||undefined};
    const reward=eligible?awardDailySpeech(carrier,content,`dictionary:${data.language}:${context?'context':id}:${day}`,now):null;
    state.buff=carrier.dailyLanguageBuff||null;
    return {reward,eligible};
}
export function validateContextQuestion(value,entry){
    if(value?.entryId!==entry.id||typeof value.question!=='string'||value.question.length<5||value.question.length>240||!value.question.includes(entry.text))throw Error('情境题格式无效');
    return value.question;
}
export function validateContextVerdict(value,entry,answer){
    if(value?.entryId!==entry.id||typeof value.correct!=='boolean'||typeof value.feedback!=='string'||value.feedback.length>240||typeof value.evidence!=='string'||(value.correct&&(!value.evidence.trim()||!answer.includes(value.evidence)||!normalizeSpelling(answer).includes(normalizeSpelling(entry.text)))))throw Error('判题结果无效');
    return value;
}
