import {state} from './state.js';
import {loadRuleset} from './data/loader.js';
import {defaultScenario,upgradeLegacyDecks} from './data/presets.js';
import {createBattle,replayBattle} from './engine/battle.js';
import {coverage} from './engine/coverage.js';
import {battleView} from './views/battle.js';
import {buildView} from './views/build.js';
import {experimentsView} from './views/experiments.js';
import {reportView} from './views/report.js';
import {tuningView} from './views/tuning.js';
import {guard,notice,esc} from './views/dom.js';
import {save,load,download,readJSON} from './storage.js';
const host=document.querySelector('#main');let cleanup=()=>{};
function setScenario(scenario){const battle=createBattle(scenario,state.ruleset,state.seed);state.scenario=structuredClone(scenario);state.battle=battle;state.manual={};state.selected='0-0';}
function navigate(view){cleanup();state.view=view;document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  cleanup=({battle:()=>battleView(host,state,size=>{setScenario(defaultScenario(state.ruleset,size));navigate('battle');}),build:()=>buildView(host,state,(side,slot,build)=>{const next=structuredClone(state.scenario);next.teams[side][slot]=build;setScenario(next);notice('角色已应用，战斗已重置');}),experiments:()=>experimentsView(host,state,navigate),report:()=>reportView(host,state,navigate),tuning:()=>tuningView(host,state)})[view]()??(()=>{});
}
function project(){return {schemaVersion:1,kind:'haqi-workspace',version:state.version,configHash:state.ruleset.hash,scenario:state.scenario,seed:state.seed};}
async function switchVersion(version){if(state.task)throw new Error('请先取消或完成当前实验');cleanup();const ruleset=await loadRuleset(version);state.version=version;state.ruleset=ruleset;state.report=null;state.evaluation=null;
  let saved;try{[saved,state.report,state.evaluation]=await Promise.all([load(`project:${version}`),load(`report:${version}`),load(`evaluation:${version}`)]);}catch(e){notice(`本地存储不可用：${e.message}`,true);}
  state.seed=saved?.seed??20260916;try{const upgraded=upgradeLegacyDecks(saved?.configHash===ruleset.hash?saved.scenario:defaultScenario(ruleset,4),ruleset);setScenario(upgraded.scenario);if(upgraded.count)notice(`已为 ${upgraded.count} 个旧默认卡组补上增益/减益；自定义卡组保留`);}catch{setScenario(defaultScenario(ruleset,4));notice('保存的配置不可用，已载入实验预设',true);}
  document.querySelector('#version').value=version;const c=coverage(ruleset);document.querySelector('#data-status').textContent=`${version} · ${Object.keys(ruleset.cards).length} 张卡牌 · ${c.status} · ${ruleset.hash.slice(0,12)}`;navigate(state.view);
}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=guard(()=>navigate(b.dataset.view)));
document.querySelector('#version').onchange=guard(async e=>{try{await switchVersion(e.target.value);}finally{e.target.value=state.version;}});
document.querySelector('#save-project').onclick=guard(async()=>{await save(`project:${state.version}`,project());notice('阵容与随机种子已保存到本机');});
document.querySelector('#export-project').onclick=()=>download('haqi-workspace.json',project());
document.querySelector('#import-project').onchange=guard(async e=>{try{if(state.task)throw new Error('请先完成或取消实验');const data=await readJSON(e.target.files[0]);if(data.schemaVersion!==1)throw new Error('不支持的文件版本');if(data.version!==state.version)throw new Error('请先切换到文件对应的游戏版本');if(data.configHash!==state.ruleset.hash)throw new Error('数据快照哈希不一致');
  if(data.kind==='haqi-workspace'){const battle=createBattle(data.scenario,state.ruleset,data.seed);state.manual={};state.seed=data.seed;state.scenario=data.scenario;state.battle=battle;navigate('battle');}
  else if(Array.isArray(data.actions)){state.manual={};state.battle=replayBattle(data,state.ruleset);state.scenario=data.scenario;state.seed=data.seed;navigate('battle');}
  else if(data.experiment&&Array.isArray(data.records)){const {validateExperiment,createReport}=await import('./simulation/runner.js');validateExperiment(data.experiment);const indices=new Set();for(const r of data.records){if(!Number.isInteger(r.index)||r.index<0||r.index>=data.experiment.count||indices.has(r.index)||![0,.5,1].includes(r.score)||!Array.isArray(r.schools)||r.schools.length!==2||!Number.isFinite(r.turns))throw new Error('报告记录无效');indices.add(r.index);}state.evaluation=null;state.report=createReport(data.experiment,state.ruleset,data.records);navigate('report');}
  else throw new Error('未知导入格式');notice('导入成功');
}finally{e.target.value='';}});
switchVersion('kids').catch(e=>{host.innerHTML=`<div class="panel"><h2>应用启动失败</h2><p>${esc(e.message)}</p><p>请通过静态 HTTP 服务打开本页面。</p></div>`;console.error(e);});
