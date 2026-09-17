import {esc,guard,notice} from './dom.js';
import {SCHOOL_COLORS,SCHOOL_NAMES} from '../rules/formulas.js';
import {createBattle,stepBattle,getLegalActions,getObservation,exportReplay} from '../engine/battle.js';
import {chooseAction} from '../bots/strategy.js';
import {drawArena} from '../render/arena.js';
import {statusBadges} from '../render/status.js';
import {autoConfigureDeck} from '../data/presets.js';
import {cardCategory,cardDescription,CATEGORY_NAMES} from '../data/card-categories.js';
import {download} from '../storage.js';
export function battleView(host,state,changeSize) {
  let disposed=false,replay=state.battle.finished?exportReplay(state.battle):null,replayIndex=replay?.actions.length??0;
  let discards={},presentation=[],presentationIndex=0,presentationTimer,lastPresentation=null;
  const clearPresentation=()=>{clearTimeout(presentationTimer);};
  const stop=()=>{state.running=false;clearTimeout(state.timer);clearPresentation();};
  const advance=()=>{
    if(state.battle.finished){stop();return;}
    const b=state.battle;
    if(replay){if(replayIndex<replay.actions.length){const result=stepBattle(b,replay.actions[replayIndex++]);render();present(result.events);}if(replayIndex>=replay.actions.length){state.running=false;clearTimeout(state.timer);}return;}
    const actions=b.units.filter(u=>u.side===b.side&&u.hp>0).map(u=>{const removed=discards[u.id]??[],obs=getObservation(b,u.id);obs.legalActions=obs.legalActions.filter(a=>a.kind!=='cast'||!removed.includes(a.seq));const action=state.manual[u.id]??chooseAction(obs,state.ruleset,state.strategy,state.seed);return {...action,discardSeqs:removed};});
    const result=stepBattle(b,actions);state.manual={};discards={};render();
    if(b.finished)stop();present(result.events);
  };
  const loop=()=>{if(disposed||!state.running)return;try{advance();}catch(e){stop();notice(e.message,true);render();return;}if(state.running)state.timer=setTimeout(loop,Math.max(state.speed,presentation.length*Math.max(300,state.speed)+100));};
  function present(events) {
    clearPresentation();presentation=events.filter(e=>['cast','fizzle'].includes(e.type));presentationIndex=0;
    const frame=()=>{if(disposed||!presentation[presentationIndex])return;const event=presentation[presentationIndex++],b=state.battle,card=state.ruleset.cards[event.card];
      const label=id=>{const u=b.units.find(x=>x.id===id);return u?`${u.side===0?'A':'B'}${u.slot+1} ${u.name}`:'—';};
      const el=host.querySelector('#cast-display');if(!el)return;
      lastPresentation=event;el.innerHTML=`<span class="cast-route">${esc(label(event.caster))} → ${event.target?esc(label(event.target)):'施法失败'}</span><strong>${esc(card?.name??event.card)}</strong><small>${event.type==='fizzle'?'失败 · 回到牌库末尾':`消耗 ${event.pips} 能量`} · ${presentationIndex}/${presentation.length}</small>`;
      el.classList.remove('playing');void el.offsetWidth;el.classList.add('playing');
      drawArena(host.querySelector('#arena'),b,state.selected,id=>{state.selected=id;render();},event);
      if(presentationIndex<presentation.length)presentationTimer=setTimeout(frame,Math.max(300,state.speed));
    };frame();
  }
  function render() {
    if(disposed)return;
    const b=state.battle;
    const selected=b.units.find(u=>u.id===state.selected)??b.units[0];
    const legal=getLegalActions(b,selected.id);
    const events=b.events.filter(e=>!['turn','draw'].includes(e.type)).slice(-35).reverse();
    const name=id=>b.units.find(u=>u.id===id)?.name??id;
    const describe=e=>({cast:`${esc(name(e.caster))} → ${esc(name(e.target))} 使用 <b>${esc(state.ruleset.cards[e.card]?.name??e.card)}</b>`,damage:`${esc(name(e.target))} <span class="amount">−${Math.ceil(e.amount)}</span> ${esc(e.mark)}`,heal:`${esc(name(e.target))} <span class="amount">+${Math.ceil(e.amount)}</span> 治疗`,discard:`${esc(name(e.caster))} 丢弃 ${esc(state.ruleset.cards[e.card]?.name??e.card)}`,pass:`${esc(name(e.caster))} 等待`,stun:`${esc(name(e.target))} 被控制`,fizzle:`${esc(name(e.caster))} 施法失败`,death:`${esc(name(e.target))} 倒下`,end:'战斗结束',skip:'目标已失效，跳过行动'}[e.type]??esc(e.type));
    host.innerHTML=`<div class="section-head"><div><div class="eyebrow">THE BATTLE SANDBOX</div><h1>每一场交锋，都可以重现。</h1><p>配置阵容，观察策略，在同一个战斗内核中寻找答案。</p></div><span class="pill">${b.scenario.size} vs ${b.scenario.size}</span></div>
    <div class="battle-layout"><div><div class="panel arena-panel"><div class="battle-toolbar"><div class="row"><span class="muted">对战规模</span><select id="size" aria-label="对战人数">${[1,2,3,4].map(n=>`<option ${n===b.scenario.size?'selected':''} value="${n}">${n}v${n}</option>`).join('')} </select></div><div class="row"><span class="muted">SEED</span><input id="seed" aria-label="随机种子" value="${esc(state.seed)}" style="width:112px"></div></div><div class="arena-header"><span class="team-a">A 队 · ${b.scenario.firstSide===0?'先手':'后手'}</span><span class="team-b">B 队 · ${b.scenario.firstSide===0?'后手':'先手'}</span></div><div class="arena-stage"><canvas id="arena" aria-label="2D 战场，点击角色选择"></canvas><div id="cast-display" class="cast-display"><small>本回合出牌</small><strong>等待施法</strong></div><div class="turn-label">SIDE TURN<strong>${String(b.turn).padStart(2,'0')}</strong></div></div><div class="arena-bottom"><button id="auto" class="primary" ${b.finished?'disabled':''}>${state.running?'Ⅱ 暂停':'▶ 全员托管'}</button><button id="step" ${b.finished?'disabled':''}>推进一回合</button><button id="restart">↻ 重置</button><select id="speed" class="speed" aria-label="播放速度"><option value="1000">1× 速度</option><option value="700" ${state.speed===700?'selected':''}>2× 速度</option><option value="100" ${state.speed===100?'selected':''}>8× 速度</option></select></div></div>
    <div class="stat-grid"><div class="stat-tile"><span class="label">当前行动</span><div class="number">${b.finished?'结束':b.side===0?'A 队':'B 队'}</div><small>按阵营与席位顺序结算</small></div><div class="stat-tile"><span class="label">存活角色</span><div class="number">${b.units.filter(u=>u.side===0&&u.hp>0).length} <span class="muted">/</span> ${b.units.filter(u=>u.side===1&&u.hp>0).length}</div><small>A 队 / B 队</small></div><div class="stat-tile"><span class="label">累计伤害</span><div class="number">${Math.round(b.units.reduce((n,u)=>n+u.metrics.damage,0)).toLocaleString()}</div><small>扣除护盾与过量伤害</small></div></div></div>
    <aside class="stack"><div class="panel"><div class="log-title"><h3>战斗记录</h3><span class="online-dot"></span></div><div class="log">${events.length?events.map(e=>`<div class="log-line"><small>R${String(e.turn).padStart(2,'0')}</small> ${describe(e)}</div>`).join(''):'<p>准备就绪。开始模拟以查看结算记录。</p>'}</div><div class="divider"></div><button id="replay-export" class="quiet" style="width:100%">导出可复现战报 ↗</button></div><div class="panel"><div class="eyebrow">RULESET</div><h3>${state.version==='kids'?'儿童版':'青年版'} · 五系 PvP</h3><p style="font-size:11px;margin-bottom:0">当前为实验性移植。完整战斗一致性验收仍在进行，结果请用于模型调试。</p></div></aside></div>
    ${replay?`<div class="panel" style="margin-top:16px"><label for="replay-position">回放进度 · ${replayIndex} / ${replay.actions.length}</label><input id="replay-position" type="range" min="0" max="${replay.actions.length}" value="${replayIndex}" style="width:100%"></div>`:''}<div class="row" style="margin-top:18px"><button id="auto-all-decks">全员自动配卡 · 含增益/减益</button><small>替换双方卡组并重置本场，保留角色属性和卡包设置。</small></div><div class="hand-header"><h3>选择角色与行动 <small> / ${esc(name(selected.id))}</small></h3><span class="muted" style="font-size:11px">未指定动作的角色由机器人操作</span></div><div class="unit-pills">${b.units.map(u=>`<button data-unit="${u.id}" class="${u.id===selected.id?'selected':''}" style="--school:${SCHOOL_COLORS[u.school]}"><span class="school-dot"></span>${u.side===0?'A':'B'}${u.slot+1} ${SCHOOL_NAMES[u.school]}</button>`).join('')}</div>
    <div class="row" style="margin:14px 0"><span class="muted">目标</span><select id="target" aria-label="技能目标">${b.units.map(u=>`<option value="${u.id}" ${(state.manual[selected.id]?.targetId?state.manual[selected.id].targetId===u.id:u.side!==selected.side)?'selected':''}>${u.side===0?'A':'B'}${u.slot+1} ${esc(u.name)}</option>`).join('')}</select><button id="pass">本回合等待</button><small id="pending">${state.manual[selected.id]?`已选：${esc(state.ruleset.cards[state.manual[selected.id].card]?.name??'等待')}${state.manual[selected.id].targetId?' → '+esc(name(state.manual[selected.id].targetId)):''}`:''}</small></div>
    <div class="deck-summary"><b>手牌 ${selected.hand.length} / ${selected.handSize}</b><span>牌库剩余 ${selected.deck.length-selected.drawIndex}</span><span>已用 ${selected.usedCount}</span><span>已弃 ${selected.discardedCount}</span><span>待弃 ${(discards[selected.id]??[]).length}</span><span>每轮最多补 ${selected.drawPerRound} 张</span></div>
    <p class="muted">点“弃牌”标记，再次点击可撤销；推进回合时确认，下个己方回合补牌。已用和已弃的卡不会循环抽回。</p>
    <div class="cards">${selected.hand.map(h=>{const card=state.ruleset.cards[h.key],can=legal.some(a=>a.seq===h.seq);return `<div class="hand-card ${(discards[selected.id]??[]).includes(h.seq)?'discard-marked':''}"><button class="spell-card ${state.manual[selected.id]?.seq===h.seq?'selected':''}" title="${esc(cardDescription(card,state.ruleset))}" data-seq="${h.seq}" ${!can||(discards[selected.id]??[]).includes(h.seq)||replay?'disabled':''} style="--school:${SCHOOL_COLORS[card.school]??'#a4b3c0'}"><span class="cost">${card.pipcost<0?'X':card.pipcost} ◈</span><span class="sigil">${({ice:'❄',fire:'♨',storm:'ϟ',death:'☽',life:'✧'})[card.school]??'◇'}</span><span class="card-name">${esc(card.name??card.key)}</span><span class="card-info">命中 ${card.accuracy}% · ${CATEGORY_NAMES[cardCategory(card,state.ruleset)]} · ${esc(cardDescription(card,state.ruleset))}</span></button><button class="discard-button" data-discard="${h.seq}" ${b.finished||selected.side!==b.side||selected.hp<=0||replay?'disabled':''}>${(discards[selected.id]??[]).includes(h.seq)?'撤销弃牌':'弃牌'}</button></div>`;}).join('')||`<p class="empty-hand">${selected.drawIndex>=selected.deck.length?'卡包耗尽：没有可出的卡片，只能等待。':'暂无手牌，等待下个己方回合抽牌。'}</p>`}</div><div class="effects-grid">${b.units.map(u=>`<section class="panel unit-effects"><h3>${u.side===0?'A':'B'}${u.slot+1} ${esc(u.name)} <small>${Math.ceil(u.hp)} HP</small></h3>${statusBadges(u,state.ruleset,b.aura)}</section>`).join('')}</div>`;
    drawArena(host.querySelector('#arena'),b,selected.id,id=>{state.selected=id;render();},lastPresentation);
    if(lastPresentation){const e=lastPresentation,card=state.ruleset.cards[e.card],label=id=>{const u=b.units.find(x=>x.id===id);return u?`${u.side===0?'A':'B'}${u.slot+1} ${u.name}`:'—';};host.querySelector('#cast-display').innerHTML=`<span class="cast-route">${esc(label(e.caster))} → ${e.target?esc(label(e.target)):'施法失败'}</span><strong>${esc(card?.name??e.card)}</strong><small>${card?.type.startsWith('Area')?'群体技能 · ':''}${e.type==='fizzle'?'施法失败':`消耗 ${e.pips} 能量`}</small>`;}
    host.querySelectorAll('[data-discard]').forEach(el=>el.onclick=()=>{const seq=Number(el.dataset.discard),list=discards[selected.id]??[];discards[selected.id]=list.includes(seq)?list.filter(x=>x!==seq):[...list,seq];if(state.manual[selected.id]?.seq===seq)delete state.manual[selected.id];render();});
    host.querySelectorAll('[data-unit]').forEach(el=>el.onclick=()=>{state.selected=el.dataset.unit;render();});
    host.querySelector('#auto-all-decks').onclick=guard(()=>{const next=structuredClone(state.scenario);next.teams=next.teams.map(team=>team.map(build=>autoConfigureDeck(build,state.ruleset)));const battle=createBattle(next,state.ruleset,state.seed);stop();discards={};lastPresentation=null;replay=null;state.scenario=next;state.battle=battle;state.manual={};render();notice('双方已配置攻击、增益和减益卡组，本场已重置');});
    host.querySelector('#auto').onclick=()=>{if(state.running){stop();render();}else{state.running=true;loop();}};
    if(replay)host.querySelector('#replay-position').oninput=e=>{stop();lastPresentation=null;replayIndex=Number(e.target.value);state.battle=createBattle(replay.scenario,state.ruleset,replay.seed);for(let i=0;i<replayIndex;i++)stepBattle(state.battle,replay.actions[i]);render();};
    host.querySelector('#step').onclick=guard(()=>{stop();advance();});
    host.querySelector('#restart').onclick=guard(()=>{stop();lastPresentation=null;discards={};replay=null;state.seed=host.querySelector('#seed').value;state.battle=createBattle(state.scenario,state.ruleset,state.seed);state.manual={};render();});
    host.querySelector('#size').onchange=guard(e=>{stop();changeSize(Number(e.target.value));});
    host.querySelector('#speed').onchange=e=>{state.speed=Number(e.target.value);};
    host.querySelector('#replay-export').onclick=()=>download(`haqi-${state.version}-replay.json`,exportReplay(b));
    host.querySelector('#pass').onclick=()=>{const action=legal.find(a=>a.kind==='pass');if(action){state.manual[selected.id]=action;render();}};
    host.querySelectorAll('[data-seq]').forEach(el=>el.onclick=()=>{
      const seq=Number(el.dataset.seq),targetId=host.querySelector('#target').value;
      const options=legal.filter(a=>a.seq===seq);const action=options.find(a=>a.targetId===targetId)??options.find(a=>a.targetId===selected.id)??options[0];
      if(!action){notice('此技能不能选择该目标，请先选择友方或敌方目标',true);return;}
      state.manual[selected.id]=action;render();
    });
  }
  render();return ()=>{disposed=true;stop();};
}
