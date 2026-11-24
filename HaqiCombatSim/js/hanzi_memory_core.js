import {createRng,hashSeed} from './rng_core.js';
import {resolveParams} from './combat_params_core.js';

export const HANZI_WORD_HABITATS = {
    shan: { landmark: '石头路', glyph: '山', habitat: '山道石阶' },
    shang: { landmark: '石头路', glyph: '上', habitat: '高坡石阶' },
    xia: { landmark: '石头路', glyph: '下', habitat: '下坡归途' },
    zhong: { landmark: '石头路', glyph: '中', habitat: '岔路界碑' },
    shi: { landmark: '石头路', glyph: '石', habitat: '山崖石壁' },
    shui: { landmark: '溪边小村', glyph: '水', habitat: '清溪水渠' },
    'tian-field': { landmark: '溪边小村', glyph: '田', habitat: '村畔方田' },
    tu: { landmark: '溪边小村', glyph: '土', habitat: '渠岸泥垄' },
    mu: { landmark: '晨光林', glyph: '木', habitat: '林边古木' },
    sen: { landmark: '晨光林', glyph: '森', habitat: '晨光密林' },
    ri: { landmark: '晨光林', glyph: '日', habitat: '向阳晒场' },
    yue: { landmark: '晨光林', glyph: '月', habitat: '林间月影' },
    'tian-sky': { landmark: '晨光林', glyph: '天', habitat: '林间晴空' },
    yun: { landmark: '晨光林', glyph: '云', habitat: '高坡云霭' },
    yu: { landmark: '晨光林', glyph: '雨', habitat: '听雨树檐' },
    huo: { landmark: '远行灯塔', glyph: '火', habitat: '灯塔火盆' },
    guang: { landmark: '远行灯塔', glyph: '光', habitat: '引航灯晕' },
    ming: { landmark: '远行灯塔', glyph: '明', habitat: '夜归明窗' },
    men: { landmark: '远行灯塔', glyph: '门', habitat: '驿站木扉' },
    xiu: { landmark: '远行灯塔', glyph: '休', habitat: '树下歇亭' },
    ren: { landmark: '初生码头', glyph: '人', habitat: '渡口旅人' },
    kou: { landmark: '初生码头', glyph: '口', habitat: '码头问候' },
    shou: { landmark: '初生码头', glyph: '手', habitat: '家书石台' },
    'mu-eye': { landmark: '初生码头', glyph: '目', habitat: '望海栈桥' },
    xin: { landmark: '初生码头', glyph: '心', habitat: '归航信箱' },
    da: { landmark: '字源亭', glyph: '大', habitat: '亭左重鼓' },
    xiao: { landmark: '字源亭', glyph: '小', habitat: '亭右铃鼓' },
    er: { landmark: '字源亭', glyph: '耳', habitat: '听鼓长廊' },
    guo: { landmark: '字源亭', glyph: '国', habitat: '四方石坛' },
    wu: { landmark: '字源亭', glyph: '舞', habitat: '庆典广场' },
};

export function semanticMemoryWords(save, config, review = {}) {
    const quest = memoryQuest(save, config);
    const storyPool = quest ? quest.words.filter(id => !review[id]?.learned) : [];
    const restUnlearned = (config?.words || []).filter(id => !review[id]?.learned && !storyPool.includes(id));
    const ordered = [...storyPool, ...restUnlearned];
    if (ordered.length) return ordered;
    return [...(quest?.words || config?.words || [])].sort(
        (a, b) => (review[a]?.nextReviewAt || 0) - (review[b]?.nextReviewAt || 0) || a.localeCompare(b),
    );
}

export function decorateSemanticMemoryNodes(save, config, nodes, review = {}) {
    if (!Array.isArray(nodes) || !nodes.length) return [];
    const pool = semanticMemoryWords(save, config, review);
    if (!pool.length) return nodes.map((n, slot) => ({ ...n, slot }));
    return nodes.map((n, slot) => {
        const word = n.hintWord || pool[slot % pool.length];
        const meta = HANZI_WORD_HABITATS[word] || null;
        return {
            ...n,
            slot,
            hintWord: word,
            hintGlyph: meta?.glyph || '',
            habitat: meta?.habitat || '',
            landmark: meta?.landmark || '',
        };
    });
}

export function placeSemanticMemoryNodes(save, config, baseNodes, candidates, landmarks = [], review = {}) {
    if (!Array.isArray(landmarks) || !landmarks.length || !Array.isArray(candidates) || !candidates.length) {
        return baseNodes;
    }
    const pool = semanticMemoryWords(save, config, review);
    if (!pool.length) return baseNodes;
    const landmarkByName = new Map(landmarks.map(l => [l.name, l]));
    const chosen = [];
    return baseNodes.map((node, slot) => {
        const word = pool[slot % pool.length];
        const meta = HANZI_WORD_HABITATS[word];
        const mark = meta && landmarkByName.get(meta.landmark);
        if (!mark || slot === 0) {
            chosen.push(node);
            return { ...node, hintWord: word };
        }
        const nearby = candidates.filter(
            c => Math.hypot(c.x - mark.x, c.y - mark.y) <= 950
                && chosen.every(prev => Math.hypot(c.x - prev.x, c.y - prev.y) >= 85),
        );
        if (!nearby.length) {
            chosen.push(node);
            return { ...node, hintWord: word };
        }
        const rng = createRng(hashSeed(`${save.seed}:semantic:${node.key}:${node.cycle}:${word}`));
        const pick = nearby[rng.int(0, nearby.length - 1)];
        const placed = { ...node, x: pick.x, y: pick.y, hintWord: word };
        chosen.push(placed);
        return placed;
    });
}

// Web-authored collection rules, independent of dictionary mastery and combat RNG.
export function memoryParams(content){const params=resolveParams({version:'kids'},content?.balanceParams||{},{groups:['hanziMemory','monsterScene']});return {...params.hanziMemory,chantSeconds:Math.max(params.hanziMemory.chantSeconds,params.monsterScene.alertDelay+params.hanziMemory.guardianLeadSeconds)};}
export function memoryCount(progress,id,required=3){
    return Math.min(required,Math.max(progress?.memories?.fragments?.[id]||0,progress?.questCards?.includes(id)?required:0,progress?.entries?.[id]?.attempts?.length||0));
}
export function validateMemoryProgress(value){
    if(value===undefined)return;
    if(value?.version!==1||!value.fragments||!value.receipts||Object.keys(value.fragments).length>10000||Object.keys(value.receipts).length>10000)throw Error('文字记忆格式无效');
    for(const [id,n] of Object.entries(value.fragments))if(!/^[a-z0-9-]+$/.test(id)||!Number.isSafeInteger(n)||n<0||n>100)throw Error('文字碎片无效');
    for(const [id,n] of Object.entries(value.receipts))if(!/^[a-z0-9-]+:\d+$/.test(id)||!Number.isSafeInteger(n)||n<0)throw Error('文字领取记录无效');
}
export function memoryQuest(save,config){
    const active=config.stories.filter(s=>save.quests?.[s.questId]?.accepted&&!save.quests[s.questId].claimed);
    const tracked=save.trackedQuestIds||[];
    return active.find(s=>tracked.includes(s.questId)||save.trackedQuestId===s.questId)||active[0]||null;
}
// Fixed pairs: finish both cards before introducing the next pair. Old progress is reused.
export function memoryBatch(progress,words,required=3){
    for(let i=0;i<words.length;i+=2){const batch=words.slice(i,i+2);if(batch.some(id=>memoryCount(progress,id,required)<required))return batch;}
    return [];
}
export function chooseMemoryWord(save,config,review={},now=0,required=3){
    const quest=memoryQuest(save,config),target=(quest?memoryBatch(save.hanzi,quest.words,required):[]).filter(id=>memoryCount(save.hanzi,id,required)<required).sort((a,b)=>memoryCount(save.hanzi,a,required)-memoryCount(save.hanzi,b,required))[0];
    if(target)return target;
    const due=config.words.filter(id=>Number.isFinite(review[id]?.nextReviewAt)&&review[id].nextReviewAt<=now).sort((a,b)=>review[a].nextReviewAt-review[b].nextReviewAt||a.localeCompare(b));
    if(due.length)return due[0];
    return config.words.find(id=>memoryCount(save.hanzi,id,required)<required)||[...config.words].sort((a,b)=>(review[a]?.nextReviewAt??Infinity)-(review[b]?.nextReviewAt??Infinity)||a.localeCompare(b))[0];
}
export function createMemoryNodes(save,config,candidates,params){
    if(!candidates.length)return [];
    const used=new Set();return Array.from({length:Math.min(params.nodeCount,candidates.length)},(_,slot)=>{
        const key=`${config.island}:${slot}`,cycle=save.hanziMemoryRuntime?.cycles?.[key]||0,rng=createRng(hashSeed(`${save.seed}:${key}:${cycle}`));
        let index=rng.int(0,candidates.length-1);while(used.has(index))index=(index+1)%candidates.length;used.add(index);
        return {...candidates[index],key,cycle,id:`${key}:${cycle}`};
    });
}
export function advanceMemoryChant(previous,node,position,dt,enabled,params){
    if(!enabled||!node||!Number.isFinite(dt)||dt<=0||dt>.25)return null;
    const same=previous?.id===node.id&&Math.hypot(previous.x-position.x,previous.y-position.y)<.5;
    const elapsed=same?previous.elapsed+dt:0;
    return {id:node.id,x:position.x,y:position.y,elapsed,progress:Math.min(1,elapsed/params.chantSeconds),ready:elapsed>=params.chantSeconds};
}
export function releaseMemoryNodes(nodes,guardian,guardians,candidates,radius){
    const safe=candidates.filter(p=>guardians.every(g=>Math.hypot(p.x-g.x,p.y-g.y)>radius+24));
    return nodes.map(node=>{
        if(Math.hypot(node.x-guardian.x,node.y-guardian.y)>radius)return node;
        const target=[...safe].sort((a,b)=>Math.hypot(a.x-node.x,a.y-node.y)-Math.hypot(b.x-node.x,b.y-node.y))[0];
        return target?{...node,...target,released:true}:node;
    });
}
export function completeMemory(progress,pending,config,params,method){
    if(!['write','animation'].includes(method)||!config.words.includes(pending?.word)||!new RegExp(`^${config.island}:\\d+$`).test(pending?.key)||Number(pending.key.split(':')[1])>=params.nodeCount||!Number.isSafeInteger(pending.cycle)||pending.cycle<0)throw Error('文字记忆领取无效');
    const next=structuredClone(progress),m=next.memories||={version:1,fragments:{},receipts:{}};
    validateMemoryProgress(m);
    if((m.receipts[pending.key]||0)!==pending.cycle)return {progress:next,changed:false};
    const before=memoryCount(next,pending.word,params.fragmentsRequired);
    m.fragments[pending.word]=Math.min(params.fragmentsRequired,before+1);m.receipts[pending.key]=pending.cycle+1;
    return {progress:next,changed:true,collected:before<params.fragmentsRequired&&m.fragments[pending.word]===params.fragmentsRequired,count:m.fragments[pending.word]};
}
