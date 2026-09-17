// Kids PvE port for the exported opening encounters. See docs/lua-mapping.md.
// arena_server.lua StartCombat L4208; AdvanceOneTurn L4520; PlayOneTurn L5100–5270.
import { createArena, validTargets } from './combat_arena_core.js';
import { defaultParams, resolveParams } from './combat_params_core.js';
import { generatePip } from './combat_formulas_core.js';
import { useCard, tickDots, tickHots, cardTargetKind, isSupportedType } from './combat_cards_core.js';
import * as U from './combat_unit_core.js';

const emit = (a,e) => { a.events.push({ turn:a.turn,...e }); };
export function createPveBattle({ dataset, player, monsters, seed = 1, firstSide = 'near' }) {
    const params = defaultParams('kids');
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
    const arena = createArena({ resolved, near:[player], far, seed, firstSide });
    arena.mode = 'pve'; arena.currentSide = 'near'; arena.firstActingSide = firstSide;
    arena.monsterTemplates = monsters;
    monsters.forEach((m,i) => {
        const u = arena.sides.far[i]; u.isMob = true; u.hp = u.maxHp = m.hp;
        u.template = m; u.aiMemory = { round:0, lastHp:m.hp };
        u.stats.powerPipPct = Number(m.attributes.power_pip_percent || 0);
        for (const key of [...m.pool.map(x=>x.key),...m.sequences.flat().map(x=>x.card),...m.genes.map(x=>x.card)].filter(Boolean)) {
            if (!resolved.cards[key] || !isSupportedType(resolved.cards[key].type)) throw new Error(`未支持的怪物卡牌：${key}`);
        }
    });
    const hero = arena.sides.near[0]; U.shuffleDeck(hero,arena.rng);
    for (const row of [...(player.fixedCards || [])].reverse()) {
        hero.deckSeq.unshift(row.key); hero.deckMap.unshift(0);
    }
    emit(arena,{type:'combat_start',firstSide,mode:'pve'});
    advancePveRound(arena); return arena;
}
function advancePveRound(a) {
    a.turn++; a.phase='pick';
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
    const u=a.sides.near[0], discarded=decision.discardSeqs || [];
    for(const seq of discarded) if(!Number.isInteger(seq)||u.deckMap[seq]!==1)throw new Error('无法弃掉这张牌');
    if(!decision.pass) {
        if(u.deckMap[decision.seq]!==1 || u.deckSeq[decision.seq]!==decision.key || discarded.includes(decision.seq))throw new Error('请选择手中的卡牌');
        const card=a.resolved.cards[decision.key];
        if(!U.canCast(u,card,a.resolved))throw new Error('魔力不足或技能尚在冷却');
        if(!validTargets(a,u,card).some(t=>t.id===decision.targetId))throw new Error('请选择有效目标');
    }
    a.phase='play';
    for(const seq of discarded)U.discardCard(u,seq);
    monstersAct(a,'before');
    const playerAct=()=>{
        if(finished(a)||!beforeAct(a,u))return;
        u.turnsPlayed++;
        if(decision.pass)emit(a,{type:'pass',caster:u.id,reason:'pass'});
        else {
            const card=a.resolved.cards[decision.key],target=a.unitsById[decision.targetId];
            if(U.isAlive(target))useCard(a,u,card,target,decision.seq);
        }
        finished(a);
    };
    if(a.firstActingSide==='far') {monstersAct(a,'normal');playerAct();}
    else {playerAct();monstersAct(a,'normal');}
    monstersAct(a,'after');
    if(!a.finished) {
        a.remainingRounds--;emit(a,{type:'turn_end'});
        if(!finished(a))advancePveRound(a);
    }
    return a;
}
export function restorePveBattle(dataset,content,checkpoint) {
    const encounter=content.encounters.find(e=>e.id===checkpoint.encounterId);
    if(!encounter)throw new Error('存档中的战斗地点不存在');
    const a=createPveBattle({dataset,player:checkpoint.player,monsters:[content.monsters[encounter.monsterId]],seed:checkpoint.seed});
    for(const decision of checkpoint.decisions)playPveRound(a,decision);
    return a;
}
