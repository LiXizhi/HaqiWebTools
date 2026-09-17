import {createBattle,stepBattle,getObservation} from '../engine/battle.js';
import {chooseAction,BOT_VERSION} from '../bots/strategy.js';
import {rng,randomInt} from '../engine/random.js';
import {SCHOOLS,ENGINE_VERSION} from '../rules/formulas.js';
import {defaultBuild} from '../data/presets.js';

export function runBattle(scenario,ruleset,seed=1,{strategy='tactical',recordEvents=false}={}) {
  const state=createBattle(scenario,ruleset,seed,{recordEvents});
  while(!state.finished) {
    const actions=state.units.filter(u=>u.side===state.side&&u.hp>0).map(u=>chooseAction(getObservation(state,u.id),ruleset,strategy,seed));
    stepBattle(state,actions);
  }
  return recordEvents?state:state.result;
}
export function validateExperiment(e) {
  if(!Number.isInteger(e.count)||e.count<2||e.count>1000000||e.count%(e.population==='replacement'?4:2)!==0)throw new Error('场数须为偶数；职业替换实验须为 4 的倍数，上限一百万');
  if(!['fixed','matrix','mixed','replacement'].includes(e.population))throw new Error('未知实验类型');
  if(!['random','tactical'].includes(e.strategy??'tactical'))throw new Error('未知策略');
  if(!e.scenario||!Number.isInteger(e.scenario.size)||e.scenario.size<1||e.scenario.size>4)throw new Error('缺失有效场景');
  if(e.population==='replacement'&&!SCHOOLS.includes(e.replacementSchool))throw new Error('请选择替换职业');
}
export function matchAt(experiment,ruleset,index) {
  const groupSize=experiment.population==='replacement'?4:2;
  const pair=Math.floor(index/groupSize),reverse=index%2===1;
  const scenario=structuredClone(experiment.scenario),n=scenario.size;
  const random=rng(`${experiment.seed}:roster:${pair}`);
  const build=school=>structuredClone(experiment.profiles?.[school]??defaultBuild(school,ruleset));
  if(experiment.population==='matrix') {
    const k=pair%25;
    scenario.teams=[Array.from({length:n},()=>build(SCHOOLS[Math.floor(k/5)])),Array.from({length:n},()=>build(SCHOOLS[k%5]))];
  }
  if(experiment.population==='mixed') {
    scenario.teams=[0,1].map(side=>Array.from({length:n},(_,slot)=>build(SCHOOLS[(pair+side+slot+randomInt(random,0,4))%5])));
  }
  const original=scenario.teams.map(team=>team.map(c=>c.school));
  const variant=groupSize===4&&index%4>=2;
  if(variant)scenario.teams[0][0]=build(experiment.replacementSchool);
  const schools=scenario.teams.map(team=>team.map(c=>c.school));
  if(reverse)scenario.teams.reverse();
  scenario.firstSide=0;
  return {scenario,pair,reverse,variant,schools,original,seed:`${experiment.seed}:battle:${pair}:${index%2}`};
}
export function runBatch(experiment,ruleset,{start=0,count=experiment.count}={}) {
  validateExperiment(experiment);
  if(!Number.isInteger(start)||!Number.isInteger(count)||start<0||count<0||start+count>experiment.count)throw new Error('无效任务分片');
  const records=[];
  for(let i=start;i<start+count;i++) {
    const m=matchAt(experiment,ruleset,i);
    const result=runBattle(m.scenario,ruleset,m.seed,{strategy:experiment.strategy});
    records.push({index:i,pair:m.pair,variant:m.variant,schools:m.schools,seed:m.seed,score:result.winner==null?.5:(m.reverse?1-result.winner:result.winner)===0?1:0,turns:result.turns,units:result.units.map(u=>({...u,side:m.reverse?1-u.side:u.side}))});
  }
  return records;
}
function summarize(entries) {
  const wins=entries.filter(e=>e.score===1).length,losses=entries.filter(e=>e.score===0).length,draws=entries.length-wins-losses;
  const groups=new Map();for(const e of entries){const g=groups.get(e.pair)||[];g.push(e.score);groups.set(e.pair,g);}
  const values=[...groups.values()].map(g=>g.reduce((a,b)=>a+b,0)/g.length);
  const score=values.length?values.reduce((a,b)=>a+b,0)/values.length:0;
  const variance=values.length>1?values.reduce((n,v)=>n+(v-score)**2,0)/(values.length-1):0;
  const margin=values.length<2?1:1.96*Math.sqrt(variance/values.length);
  return {samples:entries.length,pairs:values.length,wins,losses,draws,winRate:entries.length?wins/entries.length:0,score,interval:values.length<30?[0,1]:[Math.max(0,score-margin),Math.min(1,score+margin)],intervalMethod:'paired-cluster-normal; <30 clusters => [0,1]'};
}
export function createReport(experiment,ruleset,records) {
  const sorted=[...records].sort((a,b)=>a.index-b.index),base=sorted.filter(r=>!r.variant),schools={},matrix={};
  for(const school of SCHOOLS) {
    const entries=[];
    for(const r of base)for(let side=0;side<2;side++)if(r.schools[side].includes(school))entries.push({pair:r.pair,score:side===0?r.score:1-r.score});
    schools[school]=summarize(entries);
  }
  for(const r of base) {
    const key=r.schools[0].join('+')+' / '+r.schools[1].join('+');(matrix[key]??=[]).push(r);
  }
  for(const key of Object.keys(matrix))matrix[key]=summarize(matrix[key]);
  const metrics={};
  for(const school of SCHOOLS){const units=base.flatMap(r=>r.units.filter(u=>u.school===school));metrics[school]={appearances:units.length,...Object.fromEntries(['damage','healing','control','received'].map(k=>[k,units.length?units.reduce((n,u)=>n+u[k],0)/units.length:0]))};}
  const delta=[];
  const paired=new Map();
  if(experiment.population==='replacement')for(const r of sorted){if(!paired.has(r.pair))paired.set(r.pair,[]);paired.get(r.pair).push(r);}
  for(const group of paired.values()) {
    const a=group.filter(r=>!r.variant),b=group.filter(r=>r.variant);
    if(a.length===2&&b.length===2)delta.push((b[0].score+b[1].score-a[0].score-a[1].score)/2);
  }
  const summary=summarize(base);
  return {schemaVersion:1,engineVersion:ENGINE_VERSION,botVersion:BOT_VERSION,version:ruleset.version,configHash:ruleset.hash,parityStatus:'experimental',experiment:structuredClone(experiment),completed:sorted.length,requested:experiment.count,partial:sorted.length<experiment.count,summary,schools,matrix,metrics,averageTurns:sorted.length?sorted.reduce((n,r)=>n+r.turns,0)/sorted.length:0,replacement:delta.length?{pairs:delta.length,meanDelta:delta.reduce((a,b)=>a+b,0)/delta.length}:null,records:sorted};
}
