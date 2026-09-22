import { SimpleBot } from './combat_policy_core.js';
import {appendThreat,advanceThreat,threatTarget} from './combat_threat_core.js';
// Kids PvE port for the exported opening encounters. See docs/lua-mapping.md.
// arena_server.lua StartCombat L4208; AdvanceOneTurn L4520; PlayOneTurn L5100–5270.
import { createArena, validTargets } from './combat_arena_core.js';
import { defaultParams, resolveParams } from './combat_params_core.js';
import { generatePip } from './combat_formulas_core.js';
import { useCard, tickDots, tickHots, cardTargetKind, isSupportedType } from './combat_cards_core.js';
import * as U from './combat_unit_core.js';

const emit = (a,e) => { a.events.push({ turn:a.turn,...e }); };
export function runeCardsInHand(battle) {
    return (battle.runes||[]).filter(row=>row.count>(battle.runeUsed[row.itemId]||0)&&isSupportedType(battle.resolved.cards[row.key]?.type)).map(row=>({key:row.key,runeId:row.itemId,seq:-row.itemId,count:row.count-(battle.runeUsed[row.itemId]||0)}));
}
export function createPveBattle({ dataset, player, monsters, monsterSlots = null, seed = 1, firstSide = 'near', party = null, captureStock = 0, heroLevel = 1, adventureParams = null, runes = [], threatRulesVersion = 0, reflectionRulesVersion = 0, stealthRulesVersion = 0 }) {
    if(monsterSlots&&(!Array.isArray(monsterSlots)||monsterSlots.length!==monsters.length||new Set(monsterSlots).size!==monsterSlots.length||monsterSlots.some(n=>!Number.isInteger(n)||n<0||n>3)))throw Error('怪物卡位无效');
    if(![0,1].includes(stealthRulesVersion))throw Error('隐身规则版本无效');
    if(![0,1].includes(reflectionRulesVersion))throw Error('反射规则版本无效');
    if(![0,1,2,3,4,5].includes(threatRulesVersion))throw Error('仇恨规则版本无效');
    if(!Array.isArray(runes)||runes.some(row=>!row||!Number.isSafeInteger(row.itemId)||row.itemId<=0||!Number.isSafeInteger(row.count)||row.count<=0||typeof row.key!=='string'||!row.key)||new Set(runes.map(row=>row.itemId)).size!==runes.length)throw Error('符文检查点无效');
    if(party){
        if(!Array.isArray(party)||party.length<1||party.length>4||party[0].id!==player.id||new Set(party.map(u=>u.id)).size!==party.length||new Set(party.map(u=>u.slot)).size!==party.length||party.some(u=>!Number.isInteger(u.slot)||u.slot<0||u.slot>3))throw Error('我方阵容必须使用四个不同卡位');
    }
    const params = defaultParams('kids');
    if(adventureParams)params.adventure={...params.adventure,...adventureParams};
    // PvE has neither the PvP escalating damage clock nor simulator balance overrides.
    params.global.arenaDamageBoostPerRound = 0;
    params.global.stormChargingWardIds = dataset.pve?.stormChargingWardIds || [];
    params.global.deckCapacity = player.deckCapacity;
    params.global.deckEachCapacity = player.deckEachCapacity;
    const resolved = resolveParams(dataset,params);
    const far = monsters.map((m,i) => {
        const stats = U.normalizeStats();
        for (const school of ['fire','ice','storm','life','death','all']) {
            stats.damagePct[school] = Number(m.attributes[`damage_${school}_percent`] || 0);
            stats.resistPct[school] = Number(m.attributes[`resist_${school}_percent`] || 0);
            stats.accuracyPct[school] = Number(m.attributes[`accuracy_${school}_percent`] || 0);
        }
        return { id:`mob${i}`, name:m.name, school:m.school, level:m.level, stats, deck:[], deckCapacity:0, deckEachCapacity:0 };
    });
    const arena = createArena({ resolved, near:party||[player], far, seed, firstSide });
    arena.mode = 'pve'; arena.currentSide = 'near'; arena.firstActingSide = firstSide;
    arena.threatRulesVersion=threatRulesVersion;
    arena.reflectionRulesVersion=reflectionRulesVersion;
    arena.stealthRulesVersion=stealthRulesVersion;
    if(threatRulesVersion>=4)arena.advanceCasterThreat=caster=>{
        if(caster.isMob)advanceThreat(caster,arena.sides.near);
    };
    const threatWeight=caster=>threatRulesVersion<4?1:caster.stance?.name==='defensive'?resolved.adventure.defensiveThreatWeight:caster.stance?.name==='taunt'?resolved.adventure.tauntThreatWeight:1;
    if(threatRulesVersion>=4)arena.onDotThreat=(caster,target,ticks,area=false,absolute=true)=>{
        if(caster.isMob||!arena.sides.far.includes(target))return;
        const direct=ticks.map(damage=>Math.ceil((absolute?Math.abs(damage):damage)*arena.resolved.adventure.damageThreatRatio)).reverse();
        const splash=direct.map(value=>Math.ceil(value*arena.resolved.adventure.splashDamageThreatRatio));
        for(const mob of arena.sides.far)if(U.isAlive(mob)&&(!area||mob===target))appendThreat(mob,caster,0,mob===target?direct:splash);
    };
    if(threatRulesVersion>=4)arena.onHotThreat=(caster,ticks,area=false)=>{
        if(caster.isMob)return;
        const pending=ticks.map(heal=>Math.ceil((area?Math.ceil(heal*arena.resolved.adventure.areaHealThreatRatio):heal)*arena.resolved.adventure.singleHealThreatRatio)).reverse();
        for(const mob of arena.sides.far)if(U.isAlive(mob))appendThreat(mob,caster,0,pending);
    };
    if(threatRulesVersion>=3)arena.onAreaHealThreat=(caster,total)=>{
        if(caster.isMob)return;
        const amount=Math.ceil(total*arena.resolved.adventure.areaHealThreatRatio);
        for(const mob of arena.sides.far)if(U.isAlive(mob))appendThreat(mob,caster,amount,[],threatWeight(caster));
    };
    if(threatRulesVersion>=3)arena.onEffectThreat=(caster,target,key,area=false,targetOnly=false)=>{
        if(caster.isMob)return;
        if(threatRulesVersion<4&&['Stun','RemovePositiveWard','StealWard','SymmetryWards','ReflectionShield','AreaPowerPipBoost','AreaCleanse'].includes(key))return;
        const count=['AreaPowerPipBoost','AreaCleanse'].includes(key)?arena.sides.near.filter(U.isAlive).length:1;
        const amount=arena.resolved.adventure[`effectThreat${key}`]*count;
        if(!Number.isFinite(amount))return;
        for(const mob of arena.sides.far)if(U.isAlive(mob)&&(!targetOnly||mob===target))appendThreat(mob,caster,area||mob===target?amount:Math.ceil(amount*arena.resolved.adventure.splashManipulationThreatRatio),[],threatWeight(caster));
    };
    if(threatRulesVersion>=1)arena.onDamageThreat=(caster,target,damage,area=false,ratio=1)=>{
        if(caster.isMob)return;
        if(threatRulesVersion>=2&&!arena.sides.far.includes(target))return;
        const base=Math.ceil(Math.ceil(damage*arena.resolved.adventure.damageThreatRatio)*ratio);
        for(const mob of arena.sides.far)if(U.isAlive(mob)&&(!area||mob===target))appendThreat(mob,caster,mob===target?base:Math.ceil(base*arena.resolved.adventure.splashDamageThreatRatio),[],threatWeight(caster));
    };
    arena.runes=structuredClone(runes);arena.runeUsed={};arena.completedDecisions=0;
    if(threatRulesVersion>=2)arena.onSingleHealThreat=(caster,heal)=>{
        if(caster.isMob)return;
        const amount=Math.ceil(heal*arena.resolved.adventure.singleHealThreatRatio);
        for(const mob of arena.sides.far)if(U.isAlive(mob))appendThreat(mob,caster,amount,[],threatWeight(caster));
    };
    arena.monsterTemplates = monsters;arena.captureStock=captureStock;arena.captureUsed=0;arena.captured=[];arena.heroLevel=heroLevel;
    for(const [i,spec] of (party||[player]).entries()){const unit=arena.sides.near[i];unit.slot=spec.slot??i;unit.speciesId=spec.speciesId;if(Number.isFinite(spec.hp))unit.hp=Math.max(0,Math.min(unit.maxHp,Math.floor(spec.hp)));}
    monsters.forEach((m,i) => {
        const u = arena.sides.far[i]; if(monsterSlots)u.slot=monsterSlots[i]; u.isMob = true; u.hp = u.maxHp = m.hp;
        u.template = m; u.aiMemory = { round:0, lastHp:m.hp };
        u.stats.powerPipPct = Number(m.attributes.power_pip_percent || 0);
        for (const key of [...m.pool.map(x=>x.key),...m.sequences.flat().map(x=>x.card),...m.genes.map(x=>x.card)].filter(Boolean)) {
            if (!resolved.cards[key] || !isSupportedType(resolved.cards[key].type)) throw new Error(`未支持的怪物卡牌：${key}`);
        }
    });
    for(const [i,spec] of (party||[player]).entries()){const unit=arena.sides.near[i];U.shuffleDeck(unit,arena.rng);for(const row of [...(spec.fixedCards||[])].reverse())for(let n=0;n<(row.count||1);n++){unit.deckSeq.unshift(row.key);unit.deckMap.unshift(0);}}
    for(const [i,spec] of (party||[player]).entries())if(spec.petCards)U.preparePetCards(arena.sides.near[i],spec.petCards,arena.rng);
    emit(arena,{type:'combat_start',firstSide,mode:'pve'});
    advancePveRound(arena); return arena;
}
function advancePveRound(a) {
    a.turn++; a.phase='pick';
    if(a.threatRulesVersion>=1&&a.threatRulesVersion<4)for(const mob of a.sides.far)advanceThreat(mob,a.sides.near);
    for (const u of [...a.sides.near,...a.sides.far]) {
        if (!U.isAlive(u)) continue;
        if (!u.hasStartupPips) {
            if (u.isMob) {
                u.pips={normal:Number(u.template.attributes.startup_pips_normal || 0),power:Number(u.template.attributes.startup_pips_power || 0)};
                u.hasStartupPips=true;
            } else U.setStartupPips(u,a.resolved);
        }
        const kind = u.isMob ? generatePip(a.rng,u.pips,u.stats.powerPipPct,a.resolved.global.maxPips,'kids') : U.generateUnitPip(u,a,a.resolved,a.rng);
        U.validateCooldown(u); U.validateRounds(u);
        if (!u.isMob) { U.validateDiscardedCards(u); U.prepareCard(u,a.resolved.global.handSize); }
        emit(a,{type:'pip',unit:u.id,kind,pips:{...u.pips}});
    }
    emit(a,{type:'turn_begin',side:'near'});
}
// mob_server.lua PickFromCards L4474: inclusive [0,total] weighted draw.
function weighted(a, rows) {
    if (!rows.length) return null;
    let value=a.rng.int(0,rows.reduce((n,x)=>n+x.weight,0));
    for (const row of rows) { value-=row.weight; if(value<=0)return row.key; }
    return null;
}
function fromPool(a,u,pool) {
    const nonzero=pool.filter(x=>a.resolved.cards[x.key].pipcost !== 0), zero=pool.filter(x=>a.resolved.cards[x.key].pipcost === 0);
    const key=weighted(a,nonzero), fallback=weighted(a,zero);
    return key && U.canCast(u,a.resolved.cards[key],a.resolved) ? key : fallback;
}
// mob_server.lua L4759–5040: independent before/normal/after sequences, then HP genes, then pool.
export function pickMonsterCard(a,u,phase='normal') {
    const memory=u.aiMemory,m=u.template,round=phase==='normal'?++memory.round:(phase==='before'?memory.round+1:memory.round);
    const suffix=phase==='before'?'-':phase==='after'?'+':'';
    const candidates=m.sequences.filter(rows=>rows.some(r=>String(r.round).endsWith(suffix) && (suffix || !/[+-]$/.test(r.round))));
    const indexKey=`sequence_${phase}`;
    if (candidates.length) {
        if (memory[indexKey] === undefined) memory[indexKey]=a.rng.int(0,candidates.length-1);
        const entry=candidates[memory[indexKey]].find(r=>r.round===String(round)+suffix);
        if (entry) { memory.lastHp=u.hp; return { ...entry, key:entry.card, scripted:true }; }
    }
    if (phase!=='normal')return null;
    const priorities=[...new Set(m.genes.map(g=>Number(g.priority)))].sort((x,y)=>x-y);
    for (const priority of priorities) {
        let roll=a.rng.int(0,100);
        for (const gene of m.genes.filter(g=>Number(g.priority)===priority)) {
            const weight=Number(gene.priority_weight_percent ?? 100);
            const pct=u.hp*100/u.maxHp, previous=memory.lastHp*100/u.maxHp;
            const range=gene.hp_range?.split(',').map(Number);
            const matches=gene.hp_drop !== undefined ? previous>=Number(gene.hp_drop) && pct<=Number(gene.hp_drop) : range && pct>=range[0] && pct<=range[1];
            if(roll<=weight && matches) {
                const key=gene.card || fromPool(a,u,m.cardsets[gene.card_set] || []);
                memory.lastHp=u.hp;return { ...gene,key,scripted:!!gene.card };
            }
            roll-=weight;
        }
    }
    memory.lastHp=u.hp;
    return {key:fromPool(a,u,m.pool),target_hostile:'threat_highest',target_friendly:'self'};
}
function targetFor(a,u,card,pick) {
    const targets=validTargets(a,u,card); if(!targets.length)return null;
    const friendly=cardTargetKind(card)!=='hostile';
    const tag=friendly?pick.target_friendly:pick.target_hostile;
    if(tag==='self')return targets.find(t=>t.id===u.id)||targets[0];
    if(tag==='max_max_hp')return [...targets].sort((x,y)=>y.maxHp-x.maxHp)[0];
    if(tag==='lowest_hp')return [...targets].sort((x,y)=>x.hp-y.hp)[0];
    if(tag==='random_friendly'||tag==='random_hostile')return a.rng.pick(targets);
    if(a.threatRulesVersion>=1&&(tag==='threat_highest'||tag==='threat_lowest'))return threatTarget(u,targets,tag==='threat_lowest');
    return targets[0]; // One solo player means threat_highest has exactly one hostile candidate.
}
function finished(a) {
    if(a.finished)return true;
    if(!a.sides.near.some(U.isAlive))a.winner='far';
    else if(!a.sides.far.some(U.isAlive))a.winner='near';
    else if(a.remainingRounds<=0)a.winner=null;
    else return false;
    a.finished=true;a.phase='done';emit(a,{type:'combat_end',winner:a.winner});return true;
}
function beforeAct(a,u) {
    tickDots(a,u); if(finished(a))return false;
    tickHots(a,u);
    if(u.stunned) {u.stunned=false;emit(a,{type:'pass',caster:u.id,reason:'stunned'});return false;}
    return U.isAlive(u);
}
function monstersAct(a,phase) {
    for(const u of a.sides.far) {
        if(finished(a))return;
        if(!U.isAlive(u))continue;
        const pick=pickMonsterCard(a,u,phase);
        if(!pick?.key){if(phase==='normal'&&beforeAct(a,u))emit(a,{type:'pass',caster:u.id,reason:'no_spell'});continue;}
        if(!beforeAct(a,u))continue;
        const base=a.resolved.cards[pick.key];
        if(!base)throw new Error(`未支持的怪物技能：${pick.key}`);
        const card={...base,accuracy:Number(base.accuracy)+Number(pick.accuracy_boost||0)};
        if(pick.force_pip_cost!==undefined)card.pipcost=Number(pick.force_pip_cost);
        if(pick.speak)emit(a,{type:'speak',caster:u.id,text:pick.speak});
        useCard(a,u,card,targetFor(a,u,card,pick));
        finished(a);
    }
}
export function playPveRound(a,decision) {
    if(a.finished)throw new Error('战斗已经结束');
    if(!decision||typeof decision!=='object'||Array.isArray(decision)||decision.discardSeqs!==undefined&&!Array.isArray(decision.discardSeqs))throw Error('战斗决定无效');
    const u=a.sides.near[0], discarded=decision.discardSeqs || [];
    const rune=decision.runeId===undefined?null:a.runes.find(row=>row.itemId===decision.runeId);
    if(decision.runeId!==undefined&&(!rune||rune.key!==decision.key||decision.pass||decision.capture||!U.isAlive(u)||(a.runeUsed[rune.itemId]||0)>=rune.count||!isSupportedType(a.resolved.cards[rune.key]?.type)))throw Error('符文不可用或数量不足');
    for(const seq of discarded) if(!Number.isInteger(seq)||u.deckMap[seq]!==1)throw new Error('无法弃掉这张牌');
    if(decision.capture){
        const target=a.unitsById[decision.targetId];
        if(!U.isAlive(u)||!target?.isMob||!U.isAlive(target)||!target.template.speciesId||target.template.unlockLevel>a.heroLevel||a.captureUsed>=a.captureStock)throw Error('无法捕获：需要晶球、存活的野生宠物和解锁等级');
    }
    if(!decision.pass&&!decision.capture&&U.isAlive(u)) {
        if(!rune&&(!Number.isInteger(decision.seq)||!U.selectableCards(u).some(h=>h.seq===decision.seq&&h.key===decision.key)||discarded.includes(decision.seq)))throw new Error('请选择手中的卡牌');
        const card=a.resolved.cards[decision.key];
        if(!U.canCast(u,card,a.resolved))throw new Error('魔力不足或技能尚在冷却');
        if(!validTargets(a,u,card).some(t=>t.id===decision.targetId))throw new Error('请选择有效目标');
    }
    a.phase='play';
    for(const seq of discarded)U.discardCard(u,seq);
    monstersAct(a,'before');
    const playerAct=()=>{
        if(finished(a)||!U.isAlive(u)||!beforeAct(a,u))return;
        u.turnsPlayed++;
        if(decision.capture){
            a.captureUsed++;const target=a.unitsById[decision.targetId],p=a.resolved.adventure;
            const success=U.isAlive(target)&&a.rng.float()<p.captureBase+p.captureWounded*(1-target.hp/target.maxHp);
            if(success){a.captured.push(target.template.speciesId);target.hp=0;}
            emit(a,{type:'capture',caster:u.id,target:target.id,success});
        }
        else if(decision.pass)emit(a,{type:'pass',caster:u.id,reason:'pass'});
        else {
            const card=a.resolved.cards[decision.key],target=a.unitsById[decision.targetId];
            if(U.isAlive(target)){
                const start=a.events.length;
                useCard(a,u,card,target,rune?undefined:decision.seq);
                if(rune&&a.events.slice(start).some(event=>event.type==='cast'&&event.caster===u.id&&event.card===rune.key))a.runeUsed[rune.itemId]=(a.runeUsed[rune.itemId]||0)+1;
            }
        }
        finished(a);
    };
    const partyAct=()=>{
        // A capture order takes priority over automatic companions to avoid an unintended kill.
        if(decision.capture)playerAct();
        for(const unit of [...a.sides.near].sort((x,y)=>(x.slot??0)-(y.slot??0))){
            if(finished(a))return;
            if(unit.id===u.id){if(!decision.capture)playerAct();continue;}
            if(!U.isAlive(unit)||!beforeAct(a,unit))continue;
            const pick=new SimpleBot().pick(a,unit);unit.turnsPlayed++;
            if(pick.pass)emit(a,{type:'pass',caster:unit.id,reason:'pass'});
            else useCard(a,unit,a.resolved.cards[pick.key],a.unitsById[pick.targetId],pick.seq);
        }
    };
    if(a.firstActingSide==='far') {monstersAct(a,'normal');partyAct();}
    else {partyAct();monstersAct(a,'normal');}
    monstersAct(a,'after');
    if(!a.finished) {
        a.remainingRounds--;emit(a,{type:'turn_end'});
        if(!finished(a))advancePveRound(a);
    }
    a.completedDecisions++;
    return a;
}
export function restorePveBattle(dataset,content,checkpoint) {
    const encounter=content.encounters.find(e=>e.id===checkpoint.encounterId);
    if(!encounter&&!checkpoint.monster)throw new Error('存档中的战斗地点不存在');
    const a=createPveBattle({dataset,player:checkpoint.player,monsters:checkpoint.dungeonMonsterIds?checkpoint.dungeonMonsterIds.map(id=>content.monsters[id]):[checkpoint.monster||content.monsters[encounter.monsterId]],monsterSlots:checkpoint.dungeonMonsterSlots,seed:checkpoint.seed,party:checkpoint.party,captureStock:checkpoint.captureStock,heroLevel:checkpoint.heroLevel,adventureParams:checkpoint.adventureParams,runes:checkpoint.runes,threatRulesVersion:checkpoint.threatRulesVersion,reflectionRulesVersion:checkpoint.reflectionRulesVersion,stealthRulesVersion:checkpoint.stealthRulesVersion});
    for(const decision of checkpoint.decisions)playPveRound(a,decision);
    return a;
}
