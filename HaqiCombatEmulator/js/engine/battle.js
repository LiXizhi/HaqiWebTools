import {compileCharacter} from '../rules/character.js';
import {ENGINE_VERSION,PARITY_STATUS,availablePips,costPips} from '../rules/formulas.js';
import {rng,randomInt,shuffle} from './random.js';
import {cardIssues} from './coverage.js';
import {emit,resolveEffect,eligibleTargets,hit,heal,stat,consume,canRevive} from './effects.js';

export function createBattle(scenario,ruleset,seed=1,{recordEvents=true}={}) {
  const size=scenario.size,pve=scenario.pve===true;
  // PvP requires equal teams. PvE (scenario.pve) allows 1–4 per side with the arena chosen by the larger side.
  if(!Number.isInteger(size)||size<1||size>4||scenario.teams?.length!==2||scenario.teams.some(t=>pve?(t.length<1||t.length>size):t.length!==size))throw new Error(pve?'PvE 阵容每方须为 1–4 人且不超过 size':'阵容须为 1v1 至 4v4，且双方人数相等');
  if(pve&&Math.max(...scenario.teams.map(t=>t.length))!==size)throw new Error('PvE 的 size 须等于较大一方的人数');
  if(scenario.firstSide!=null&&![0,1].includes(scenario.firstSide))throw new Error('先手方无效');
  const state={schemaVersion:1,engineVersion:ENGINE_VERSION,parityStatus:PARITY_STATUS,ruleset,configHash:ruleset.hash,scenario:structuredClone(scenario),seed,random:rng(seed),turn:0,side:scenario.firstSide??0,units:[],events:[],actions:[],recordEvents,finished:false,result:null,arena:ruleset.arenas[size],aura:null,pve};
  if(!state.arena)throw new Error('缺失竞技场配置');
  for(let side=0;side<2;side++)for(let slot=0;slot<scenario.teams[side].length;slot++) {
    const b=scenario.teams[side][slot],c=compileCharacter(b,ruleset);
    const kind=b.kind??'player';
    if(!['player','mob'].includes(kind))throw new Error('角色 kind 须为 player 或 mob');
    if(kind==='mob'&&!pve)throw new Error('怪物单位仅允许出现在 PvE 剧本中');
    if(c.pet)throw new Error('战宠切换尚未移植，不能静默忽略战宠');
    if(c.runes.length)throw new Error('独立符文栏尚未移植；不能将符文按普通卡牌替代');
    for(const key of new Set(c.deck)) {const issues=cardIssues(ruleset.cards[key],ruleset);if(issues.length)throw new Error(`${key}: ${issues.join('；')}`);}
    let pips=c.attributes.initialPips,powerPips=c.attributes.initialPowerPips;
    if(ruleset.version==='teen'){pips+=powerPips*2;powerPips=0;if(side!==state.side)pips+=state.arena.bonus_pips_starting_defensive_units??0;}
    const cap=ruleset.version==='teen'?14:7;
    if(!Number.isInteger(pips)||!Number.isInteger(powerPips)||pips<0||powerPips<0||pips+powerPips>cap)throw new Error('初始能量超出版本范围');
    // Mobs draw from an endless pool in the source (available_cards); recycleDeck appends a reshuffled copy of the compiled deck when exhausted. PvE only.
    state.units.push({...c,id:`${side}-${slot}`,side,slot,kind,recycleDeck:kind==='mob'?b.recycleDeck!==false:(pve&&b.recycleDeck===true),deckSource:[...c.deck],hp:c.attributes.maxHP,pips,powerPips,deck:shuffle(c.deck,state.random),hand:[],drawIndex:0,usedCount:0,discardedCount:0,cooldowns:{},charms:[],wards:[],absorbs:[],dots:[],hots:[],aura:null,stun:0,dodgeProtection:0,metrics:{damage:0,healing:0,control:0,received:0}});
  }
  beginTurn(state);return state;
}
function beginTurn(state) {
  state.turn++;
  for(const u of state.units.filter(u=>u.side===state.side)) {
    for(const key of Object.keys(u.cooldowns))u.cooldowns[key]=Math.max(0,u.cooldowns[key]-1);
    u.dodgeProtection=Math.max(0,u.dodgeProtection-1);
    for(const list of ['charms','wards'])u[list]=u[list].filter(s=>s.rounds==null||--s.rounds>0);
    if(u.aura&&--u.aura.rounds<=0)u.aura=null;
    if(u.hp<=0)continue;
    const power=randomInt(state.random,1,100)<=u.attributes.powerPip;
    if(state.ruleset.version==='teen')u.pips=Math.min(14,u.pips+(power?2:1));
    else if(u.pips+u.powerPips<7){if(power)u.powerPips++;else u.pips++;}
    for(const dot of [...u.dots]) {
      const source=state.units.find(x=>x.id===dot.caster),card=state.ruleset.cards[dot.card],value=dot.values.shift();
      const school=dot.schools.length>1?dot.schools.shift():dot.schools[0];
      if(value>=0)hit(state,source,u,card,value,{boosts:dot.boosts,school,dot:true});
      if(u.hp<=0)break;
    }
    u.dots=u.dots.filter(d=>d.values.length);
    if(u.hp>0)for(const hot of u.hots)heal(state,state.units.find(x=>x.id===hot.caster),u,state.ruleset.cards[hot.card],hot.values.shift(),hot.boosts);
    u.hots=u.hots.filter(h=>h.values.length);
    // Player:PrepareCard retains old cards; draw from the seeded finite deck.
    let drawn=0;
    if(u.recycleDeck&&u.drawIndex>=u.deck.length&&u.hand.length<u.handSize){u.deck.push(...shuffle(u.deckSource,state.random));emit(state,'recycle',{target:u.id});}
    while(u.hand.length<u.handSize&&drawn<u.drawPerRound&&u.drawIndex<u.deck.length) {const h={key:u.deck[u.drawIndex],seq:u.drawIndex};u.hand.push(h);u.drawIndex++;drawn++;emit(state,'draw',{target:u.id,card:h.key,seq:h.seq});}
  }
  emit(state,'turn',{side:state.side});checkEnd(state,false);
}
export function getLegalActions(state,unitId) {
  const u=state.units.find(x=>x.id===unitId);
  if(!u||state.finished||u.side!==state.side||u.hp<=0)return [];
  const actions=[{unitId,kind:'pass'}];
  if(u.stun)return actions;
  for(const h of u.hand) {
    const card=state.ruleset.cards[h.key],pips=availablePips(u,card.school,state.ruleset.version);
    if((u.cooldowns[card.spell]??0)>0||(card.pipcost>=0&&pips<card.pipcost))continue;
    for(const target of eligibleTargets(state,u,card))actions.push({unitId,kind:'cast',card:h.key,seq:h.seq,targetId:target.id});
  }
  return actions;
}
export function getObservation(state,unitId) {
  const own=state.units.find(x=>x.id===unitId);
  if(!own)throw new Error('未知角色');
  return {turn:state.turn,side:state.side,version:state.ruleset.version,unitId,units:state.units.map(u=>({id:u.id,side:u.side,slot:u.slot,kind:u.kind,name:u.name,school:u.school,level:u.level,hp:u.hp,maxHP:u.attributes.maxHP,pips:u.pips,powerPips:u.powerPips,charms:u.charms.map(x=>({...x})),wards:u.wards.map(x=>({...x})),absorbs:u.absorbs.map(x=>({...x})),stun:u.stun,dots:u.dots.length,hots:u.hots.length,aura:u.aura?{...u.aura}:null})),deckRemaining:own.deck.length-own.drawIndex,handSize:own.handSize,drawPerRound:own.drawPerRound,usedCount:own.usedCount,discardedCount:own.discardedCount,hand:own.hand.map(x=>({...x})),legalActions:getLegalActions(state,unitId)};
}
function sameAction(a,b){return a.kind===b.kind&&a.unitId===b.unitId&&a.card===b.card&&a.seq===b.seq&&a.targetId===b.targetId;}
export function stepBattle(state,actions) {
  if(state.finished)throw new Error('战斗已结束');
  const active=state.units.filter(u=>u.side===state.side&&u.hp>0);
  if(!Array.isArray(actions)||actions.length!==active.length||new Set(actions.map(a=>a.unitId)).size!==active.length)throw new Error('须为当前阵营每名存活角色提交一个动作');
  for(const u of active)if(!getLegalActions(state,u.id).some(a=>sameAction(a,actions.find(x=>x.unitId===u.id)??{})))throw new Error(`${u.id} 动作非法`);
  for(const u of active){const a=actions.find(x=>x.unitId===u.id),discard=a.discardSeqs??[];if(!Array.isArray(discard)||new Set(discard).size!==discard.length||discard.some(seq=>!Number.isInteger(seq)||!u.hand.some(h=>h.seq===seq)||(a.kind==='cast'&&a.seq===seq)))throw new Error('弃牌必须来自当前手牌，且不能丢弃已选择施放的卡片');}
  const start=state.events.length;
  if(state.recordEvents)state.actions.push(structuredClone(actions));
  for(const u of active) {
    const a=actions.find(x=>x.unitId===u.id);
    if(u.hp<=0)continue;
    for(const seq of a.discardSeqs??[]){const h=u.hand.find(h=>h.seq===seq);u.hand=u.hand.filter(h=>h.seq!==seq);u.discardedCount++;emit(state,'discard',{caster:u.id,card:h.key,seq});}
    if(u.stun){u.stun=0;emit(state,'stun',{target:u.id});continue;}
    if(a.kind==='pass'){emit(state,'pass',{caster:u.id});continue;}
    const card=state.ruleset.cards[a.card],target=state.units.find(x=>x.id===a.targetId);
    if(!target||(target.hp<=0&&!canRevive(card))){emit(state,'skip',{caster:u.id,card:a.card});continue;}
    const boosts=consume(u,'charms','boost_accuracy',card.school,state.ruleset).boosts;
    const chance=card.accuracy+stat(u,'accuracy',card.school,state.ruleset)+boosts.reduce((a,b)=>a+b,0);
    // Original inclusive 0..100 fizzle roll. Failed card goes to end of the deck.
    if(randomInt(state.random,0,100)>chance) {
      u.hand=u.hand.filter(h=>h.seq!==a.seq);u.deck.push(a.card);emit(state,'fizzle',{caster:u.id,card:a.card});continue;
    }
    const count=card.pipcost<0?Math.floor(availablePips(u,card.school,state.ruleset.version)):card.pipcost;
    const real=costPips(u,count,card.school,state.ruleset.version);
    u.hand=u.hand.filter(h=>h.seq!==a.seq);u.usedCount++;u.cooldowns[card.spell]=(card.params.cooldown??0)+1;
    emit(state,'cast',{caster:u.id,target:target.id,card:card.key,pips:real});
    resolveEffect(state,u,target,card,real);
  }
  if(!checkEnd(state,true)){state.side=1-state.side;beginTurn(state);}
  return {state,events:state.events.slice(start),result:state.result};
}
function checkEnd(state,checkLimit) {
  const alive=[0,1].map(s=>state.units.some(u=>u.side===s&&u.hp>0));
  const limit=state.ruleset.version==='kids'?100:80;
  if(alive.every(Boolean)&&(!checkLimit||state.turn<limit))return false;
  // Arena:FinishCombat_v weights survivor count first, then HP fraction.
  const weights=[0,1].map(s=>state.units.filter(u=>u.side===s&&u.hp>0).reduce((n,u)=>n+Math.ceil((10+u.hp/u.attributes.maxHP)*1000),0));
  const winner=weights[0]===weights[1]?(state.ruleset.version==='teen'&&weights[0]>0?1-(state.scenario.firstSide??0):null):weights[0]>weights[1]?0:1;
  state.finished=true;
  state.result={schemaVersion:1,winner,reason:alive.every(Boolean)?'turn-limit':'elimination',turns:state.turn,seed:state.seed,engineVersion:ENGINE_VERSION,configHash:state.configHash,version:state.ruleset.version,parityStatus:PARITY_STATUS,units:state.units.map(u=>({id:u.id,side:u.side,kind:u.kind,school:u.school,hp:u.hp,maxHP:u.attributes.maxHP,...u.metrics}))};
  emit(state,'end',{winner,reason:state.result.reason});return true;
}
export function replayBattle(replay,ruleset) {
  if(replay.configHash!==ruleset.hash||replay.engineVersion!==ENGINE_VERSION)throw new Error('回放版本或配置哈希不一致');
  const state=createBattle(replay.scenario,ruleset,replay.seed);
  for(const actions of replay.actions)stepBattle(state,actions);
  return state;
}
export function exportReplay(state) {return {schemaVersion:1,version:state.ruleset.version,engineVersion:ENGINE_VERSION,configHash:state.configHash,scenario:state.scenario,seed:state.seed,actions:state.actions,result:state.result};}
