import {createRng,hashSeed} from '../rng_core.js';
import {AI_VERSION,compareDecision} from './inference_core.js';

export function reviewBattle({winner,side='near',frames=[],decisions=[],events=[],settings={},evidence=[],improvements=[]}={}) {
    const result=winner==='draw'?'draw':winner===side?'win':winner?'loss':'unknown';
    const comparisons=decisions.filter(d=>d.analysis&&d.action).map(d=>({turn:d.turn,...compareDecision(d.analysis,d.action)}));
    const mistakes=comparisons.filter(c=>c.shouldPrompt);
    const observed=frames.filter(f=>Number.isFinite(f.nearStrength)&&Number.isFinite(f.farStrength)&&f.nearStrength+f.farStrength>0);
    const margins=observed.map(f=>(f.nearStrength-f.farStrength)/(f.nearStrength+f.farStrength));
    const competitive=margins.filter(x=>Math.abs(x)<(settings.closeMargin??0.25)).length;
    const reversals=margins.slice(1).filter((x,i)=>x*margins[i]<0).length;
    const late=observed.slice(-3);
    // Starting full HP alone is not evidence of a close contest: both sides must
    // have demonstrated offensive pressure in the recorded decision history.
    const pressureBoth=observed.some(f=>f.nearPressure>0)&&observed.some(f=>f.farPressure>0);
    const close=observed.length>=(settings.minimumCloseFrames??3)&&pressureBoth&&competitive/observed.length>=0.5&&late.slice(-2).every(f=>Math.abs(f.nearStrength-f.farStrength)/(f.nearStrength+f.farStrength)<(settings.closeMargin??0.25));
    const supported=evidence.filter(e=>e.verified===true&&Array.isArray(e.eventIndices)&&e.eventIndices.length&&e.eventIndices.every(i=>Number.isInteger(i)&&events[i]));
    const luck=supported.find(e=>e.kind==='luck'&&e.counterfactualVerified===true)||null;
    const highlights=supported.filter(e=>e.kind==='highlight');
    const diagnoses=mistakes.map(m=>({kind:'decision',priority:0,text:m.reason,turn:m.turn,evidence:m.alternativeEvidence}));
    for(const item of supported.filter(e=>e.kind==='diagnosis'))diagnoses.push({...item,priority:item.priority??2});
    for(const item of improvements.filter(x=>x.games>=8&&x.improvementInterval?.[0]>0))diagnoses.push({kind:'diagnosis',category:item.category,text:item.title,priority:item.priority??1,validation:item});
    diagnoses.sort((a,b)=>a.priority-b.priority);
    return {version:AI_VERSION,result,close,competitiveFrames:competitive,frames:observed.length,reversals,
        confidence:observed.length>=3?'observed':'insufficient',luck,highlights,mistakes,
        diagnoses,suggestions:close&&!mistakes.length?[]:diagnoses.slice(0,3),
        limitations:['未验证的属性、容量与阵容不足不会自动归为败因']};
}
/** Paired counterfactual preparation experiments; no full deck enumeration. */
export function evaluateImprovements({baseline,variants,seeds,run}){
    if(!seeds?.length||typeof run!=='function')throw Error('缺少对照种子或战斗运行器');
    const base=seeds.map(seed=>run(baseline,seed));
    const outcome=r=>r.winner==='near'?1:r.winner==='draw'?0.5:0;
    return variants.map(variant=>{
        const trials=seeds.map(seed=>run(variant.scenario,seed)),deltas=trials.map((r,i)=>outcome(r)-outcome(base[i]));
        const n=deltas.length,mean=deltas.reduce((s,x)=>s+x,0)/n;
        const variance=n>1?deltas.reduce((s,x)=>s+(x-mean)**2,0)/(n-1):1;
        // Conservative bounded paired interval, especially for small samples.
        const radius=Math.sqrt(2*Math.log(40)/n);
        return {id:variant.id,title:variant.title,category:variant.category,priority:variant.priority,games:n,improvement:mean,
            improvementInterval:[Math.max(-1,mean-radius),Math.min(1,mean+radius)],pairedVariance:variance,
            baselineScore:base.reduce((s,r)=>s+outcome(r),0)/n,variantScore:trials.reduce((s,r)=>s+outcome(r),0)/n};
    });
}
export function explainResult(result,{seed=1}={}) {
    if(result.candidates)return result.candidates.map(c=>({action:c.action,title:c.label,text:c.evidence.map(e=>e.text).join('；')}));
    const texts=result.close?(result.result==='win'?
        (result.luck?.direction==='favorable'?['太幸运了，真是一场精彩的比赛！']:['真是一场精彩的比赛！我们顶住了最后的压力。','双方都打得很出色，我们赢下了这场较量！']):
        result.result==='loss'?['好遗憾，我们差一点就能赢了。下次再加油吧！','这是一场精彩的较量，虽然惜败，仍然值得再挑战一次。']:
        ['真是旗鼓相当！这次谁也没能拿下比赛。']):
        result.result==='win'?['我们赢了！继续下一场冒险吧。']:
        result.result==='draw'?['比赛结束了，这次双方未分胜负。']:
        result.result==='loss'?['这次没能获胜，休息一下，再来挑战吧。']:['比赛记录还不完整，暂时无法判断结果。'];
    const rng=createRng(hashSeed(`${AI_VERSION}:${seed}:${result.result}:${result.frames}`));
    return {headline:rng.pick(texts),detail:result.luck?.text||'',highlights:result.highlights.map(h=>h.text),suggestions:result.suggestions};
}
export function recommendProgression(review,{routes=[],owned={},mode}={}) {
    if(review.close&&!review.mistakes.length)return [];
    const kinds=new Set(review.diagnoses.map(d=>d.kind==='diagnosis'?d.category:d.kind));
    return routes.filter(route=>route.available===true&&kinds.has(route.addresses)&&(!route.mode||route.mode===mode)&&
        (!route.requires||route.requires.every(key=>owned[key]))).map(route=>({id:route.id,title:route.title,
            reason:review.diagnoses.find(d=>(d.category||d.kind)===route.addresses)?.text,
            cost:route.cost??null,entry:route.entry??null,priority:route.owned?0:route.priority??2,automatic:false}))
        .sort((a,b)=>a.priority-b.priority||String(a.id).localeCompare(String(b.id))).slice(0,3);
}

export function evaluateEncounter({scenarios,seeds,run,baselineRun}={}) {
    if(!Array.isArray(scenarios)||!seeds?.length||typeof run!=='function')throw Error('请提供关卡、种子和真实战斗运行适配器');
    return scenarios.map(scenario=>{
        const results=seeds.map(seed=>run(scenario,seed));
        const wins=results.filter(r=>r.winner==='near').length,draws=results.filter(r=>r.winner==='draw').length,n=results.length,p=wins/n;
        // Wilson 95% interval for observed wins, with draws counted as non-wins.
        const z=1.96,den=1+z*z/n,center=(p+z*z/(2*n))/den,half=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den;
        const baseline=baselineRun?seeds.map(seed=>baselineRun(scenario,seed)):null;
        return {id:scenario.id,games:n,wins,losses:n-wins-draws,draws,winRate:p,winInterval:[center-half,center+half],
            meanTurns:results.reduce((sum,r)=>sum+r.turns,0)/n,
            baselineWinRate:baseline?baseline.filter(r=>r.winner==='near').length/n:null,
            unsupported:results.reduce((out,r)=>{for(const [key,value]of Object.entries(r.unsupported||{}))out[key]=(out[key]||0)+(value.count??value);return out;},{}),
            reviews:results.filter(r=>r.review).slice(0,3).map(r=>r.review)};
    });
}
