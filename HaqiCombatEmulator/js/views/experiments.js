import {esc,section,guard,notice} from './dom.js';
import {SCHOOLS,SCHOOL_NAMES} from '../rules/formulas.js';
import {defaultBuild} from '../data/presets.js';
import {startExperiment} from '../simulation/pool.js';
import {save} from '../storage.js';
export function experimentsView(host,state,navigate) {
  let disposed=false;
  host.innerHTML=section('批量实验','把直觉变成可复验的数据。交换先手与阵营，分别观察单系和混编阵容。',`
    <div class="two-col"><div class="panel"><h3>选择实验设计</h3><div class="experiment-options">${[['fixed','当前阵容对照','使用你已编辑的双方角色、配装和卡组。'],['matrix','五系对抗矩阵','同系队伍两两对抗，按 25 个有向组合轮换。'],['mixed','混编阵容采样','采样包含重复职业的混编队伍，统计职业参与胜率。'],['replacement','替换一个职业','固定其余角色，对比 A1 替换为指定职业后的变化。']].map(([value,title,desc],i)=>`<label class="experiment-option"><input type="radio" name="population" value="${value}" ${i===0?'checked':''}>${title}<p>${desc}</p></label>`).join('')}</div></div>
    <div class="stack"><div class="panel"><h3>运行参数</h3><div class="form-grid"><label><span class="label">实际场数</span><select id="count"><option value="1000">1,000</option><option value="5000">5,000</option><option value="10000" selected>10,000</option></select></label><label><span class="label">随机种子</span><input id="experiment-seed" value="${esc(state.seed)}"></label><label><span class="label">机器人策略</span><select id="strategy"><option value="tactical">战术评分</option><option value="random">随机合法对照</option></select></label><label><span class="label">替换职业</span><select id="replacement-school">${SCHOOLS.map(s=>`<option value="${s}">${SCHOOL_NAMES[s]}</option>`).join('')}</select></label></div><div class="divider"></div><p style="font-size:12px">当前为 ${state.scenario.size}v${state.scenario.size}，${state.version==='kids'?'儿童版':'青年版'}。矩阵和混编使用各系实验预设；当前阵容实验使用配装页的角色。</p><div class="row"><button id="run-experiment" class="primary">▶ 开始实验</button><button id="cancel-experiment" disabled>取消并保留已完成结果</button></div></div>
    <div class="panel"><div class="eyebrow">SIMULATION ENGINE</div><h3 id="run-label">等待运行</h3><div id="progress-number" class="big-progress">0 <small>/ 10,000</small></div><div class="progress-track"><div id="progress" class="progress-fill"></div></div><p id="run-detail" style="margin-top:15px;font-size:11px">使用后台 Worker，界面无需等待动画。</p></div><div class="warning">统计报告会保留数据版本与验证状态。混编中的“含该系队伍胜率”不是该职业的独立因果胜率。</div></div></div>`);
  host.querySelector('#run-experiment').onclick=guard(async()=>{
    if(state.task)throw new Error('已有实验正在运行');
    const experiment={schemaVersion:1,count:Number(host.querySelector('#count').value),seed:host.querySelector('#experiment-seed').value,strategy:host.querySelector('#strategy').value,population:host.querySelector('[name=population]:checked').value,replacementSchool:host.querySelector('#replacement-school').value,scenario:structuredClone(state.scenario),profiles:Object.fromEntries(SCHOOLS.map(s=>[s,defaultBuild(s,state.ruleset)]))};
    const start=performance.now();
    const task=startExperiment(experiment,state.ruleset,{onProgress:(n,total)=>{if(disposed)return;host.querySelector('#progress-number').innerHTML=`${n.toLocaleString()} <small>/ ${total.toLocaleString()}</small>`;host.querySelector('#progress').style.width=`${100*n/total}%`;host.querySelector('#run-detail').textContent=`已运行 ${((performance.now()-start)/1000).toFixed(1)} 秒 · ${(n/Math.max(.001,(performance.now()-start)/1000)).toFixed(0)} 场/秒`;}});
    state.task=task;host.querySelector('#run-experiment').disabled=true;host.querySelector('#cancel-experiment').disabled=false;host.querySelector('#run-label').textContent='计算中';
    try {state.report=await task.promise;state.report.elapsedMs=performance.now()-start;state.evaluation=null;await save(`report:${state.version}`,state.report);notice(state.report.partial?'已取消，已保存完成的场次':'实验完成，报告已保存');if(!disposed)navigate('report');}
    finally{state.task=null;if(!disposed){host.querySelector('#run-experiment').disabled=false;host.querySelector('#cancel-experiment').disabled=true;}}
  });
  host.querySelector('#cancel-experiment').onclick=()=>state.task?.cancel();
  return ()=>{disposed=true;};
}
