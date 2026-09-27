import fs from 'node:fs/promises';
import {loadDataset} from '../js/data_core.js';
import {defaultParams,resolveParams} from '../js/combat_params_core.js';
import {createArena,startCombat,actingUnits,playTurn} from '../js/combat_arena_core.js';
import {createPolicy} from '../js/combat_policy_core.js';
import {unitSpec} from '../js/combat_presets_core.js';
import {evaluateEncounter} from '../js/battle_ai/index_core.js';
import {auditCards} from '../js/battle_ai/haqi_adapter_core.js';
import {runHaqiEncounter} from '../js/battle_ai/encounter_core.js';
const args=process.argv.slice(2),value=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const games=Number(value('--games','10')),size=Number(value('--size','1')),policy=value('--policy','reasoning_expert');
if(!Number.isInteger(games)||games<1||!Number.isInteger(size)||size<1||size>4)throw Error('games 必须为正整数，size 必须为 1–4');
const dataset=await loadDataset('data/kids',async path=>JSON.parse(await fs.readFile(path,'utf8'))),resolved=resolveParams(dataset,defaultParams('kids'));
const schools=['fire','ice','storm','life','death'];
const input=value('--input',null);
const scenarios=input?JSON.parse(await fs.readFile(input,'utf8')):args.includes('--all')?schools.flatMap(near=>schools.map(far=>({id:`${near}-${far}`,near,far}))):schools.map((near,i)=>({id:`${near}-${schools[(i+1)%5]}`,near,far:schools[(i+1)%5]}));
const seeds=Array.from({length:games},(_,i)=>Number(value('--seed','1009'))+i*7919);
const run=(scenario,seed,selected)=>{
 if(input)return runHaqiEncounter(dataset,scenario,seed,{policy:selected});
 const a=createArena({resolved,seed,firstSide:seed%2?'near':'far',near:Array.from({length:size},()=>unitSpec(dataset,scenario.near,{level:30})),far:Array.from({length:size},()=>unitSpec(dataset,scenario.far,{level:30})),keepEvents:false});
 startCombat(a);const near=createPolicy(selected),far=createPolicy('deck_attacker');
 while(!a.finished){const picks={};for(const u of actingUnits(a))picks[u.id]=(u.side==='near'?near:far).pick(a,u);playTurn(a,picks);}
 return {winner:a.winner,turns:a.turn,unsupported:a.unsupported};
};
const start=performance.now(),reports=[];
for(const scenario of scenarios){reports.push(...evaluateEncounter({scenarios:[scenario],seeds,run:(s,seed)=>run(s,seed,policy),baselineRun:(s,seed)=>run(s,seed,'simple')}));process.stderr.write(`已评估 ${scenario.id}\n`);}
const output={policy,size,seeds,elapsedMs:Math.round(performance.now()-start),reports,coverage:auditCards(resolved).reduce((counts,row)=>(counts[row.support]=(counts[row.support]||0)+1,counts),{})};
const path=value('--out',null);if(path)await fs.writeFile(path,JSON.stringify(output,null,2));else process.stdout.write(JSON.stringify(output,null,2)+'\n');
