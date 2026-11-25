// Pure rules for Pet Formation Synergies / School Resonance ("战宠阵型羁绊").
// Evaluates the active party (hero + formation pets) and snapshots active bonds into
// pendingEncounter so PvE combat and replays remain 100% deterministic.

import { applyHpStats } from './combat_formulas_core.js';

const assert = (ok, message) => {
    if (!ok) throw new Error(message);
};

const SCHOOL_CN = {
    fire: '烈火',
    ice: '寒冰',
    storm: '风暴',
    life: '生命',
    death: '死亡',
    balance: '平衡',
};

export const PET_SYNERGY_DEFS = {
    'school-pair': {
        id: 'school-pair',
        name: '双星同调',
        effectText: '全队伤害 +6%',
        stats: { damagePct: 6 },
    },
    'school-trio': {
        id: 'school-trio',
        name: '三曜同鸣',
        effectText: '全队伤害 +10% · 暴击 +5%',
        stats: { damagePct: 10, critPct: 5 },
    },
    'element-trio': {
        id: 'element-trio',
        name: '元素交响',
        effectText: '全队减伤 +6% · 超级魔力 +10%',
        stats: { resistPct: 6, powerPipPct: 10 },
    },
    'guardian-bond': {
        id: 'guardian-bond',
        name: '铁壁护卫',
        effectText: '全队最大生命 +8% · 治疗 +10%',
        stats: { hpPct: 8, outputHealPct: 10 },
    },
    'full-squad': {
        id: 'full-squad',
        name: '满编协战',
        effectText: '全队命中 +6% · 伤害 +5%',
        stats: { accuracyPct: 6, damagePct: 5 },
    },
};

export function evaluatePartySynergies(members) {
    if (!Array.isArray(members) || members.length < 2) return [];
    const pets = members.filter(m => m && m.id !== 'hero' && (m.speciesId || m.isPet));
    if (pets.length < 1) return [];

    const schoolCounts = {};
    for (const m of members) {
        const sc = m?.school;
        if (!sc) continue;
        schoolCounts[sc] = (schoolCounts[sc] || 0) + 1;
    }

    const active = [];
    const sortedSchools = Object.entries(schoolCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const topSchool = sortedSchools[0];
    if (topSchool && topSchool[1] >= 3) {
        const def = PET_SYNERGY_DEFS['school-trio'];
        active.push({ ...def, school: topSchool[0], label: `${SCHOOL_CN[topSchool[0]] || ''}·${def.name}` });
    } else if (topSchool && topSchool[1] >= 2) {
        const def = PET_SYNERGY_DEFS['school-pair'];
        active.push({ ...def, school: topSchool[0], label: `${SCHOOL_CN[topSchool[0]] || ''}·${def.name}` });
    }

    const uniqueSchools = Object.keys(schoolCounts).length;
    if (uniqueSchools >= 3) {
        const def = PET_SYNERGY_DEFS['element-trio'];
        active.push({ ...def, label: def.name });
    }

    if (members.length >= 3 && pets.some(p => p.school === 'life' || p.school === 'ice')) {
        const def = PET_SYNERGY_DEFS['guardian-bond'];
        active.push({ ...def, label: def.name });
    }

    if (members.length >= 4 && pets.length >= 3) {
        const def = PET_SYNERGY_DEFS['full-squad'];
        active.push({ ...def, label: def.name });
    }

    return active;
}

export function formationSynergyPreview(save, content) {
    if (!save) return { active: [], nextHint: '' };
    const members = [{ id: 'hero', school: save.school }];
    for (const petId of save.formation || []) {
        if (!petId) continue;
        const pet = save.pets?.[petId];
        if (!pet) continue;
        const def = content?.pets?.[pet.speciesId];
        members.push({ id: petId, speciesId: pet.speciesId, isPet: true, school: def?.school || 'balance' });
    }
    const active = evaluatePartySynergies(members);
    const activeIds = new Set(active.map(a => a.id));
    let nextHint = '';
    if (members.length < 2) {
        nextHint = '上阵 1 只伙伴即可触发阵型羁绊（同系触发「双星同调」，3 系触发「元素交响」）。';
    } else if (!activeIds.has('element-trio') && members.length < 4) {
        nextHint = '再上阵不同学派伙伴满 3 系可激活「元素交响」（减伤 +6% · 超级魔力 +10%）。';
    } else if (!activeIds.has('guardian-bond') && members.length < 4) {
        nextHint = '3 人以上阵容带 1 只生命或寒冰系战宠可激活「铁壁护卫」（生命 +8% · 治疗 +10%）。';
    } else if (!activeIds.has('full-squad')) {
        nextHint = '上阵满 3 只伙伴凑齐 4 席可激活「满编协战」（命中 +6% · 伤害 +5%）。';
    }
    return { active, nextHint };
}

export function petSynergiesSnapshot(party) {
    const active = evaluatePartySynergies(party);
    if (!active.length) return null;
    return {
        version: 1,
        ids: active.map(a => a.id),
    };
}

export function validatePetSynergiesSnapshot(snapshot) {
    if (snapshot === undefined || snapshot === null) return;
    assert(
        snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
            && snapshot.version === 1
            && Array.isArray(snapshot.ids)
            && snapshot.ids.length > 0
            && new Set(snapshot.ids).size === snapshot.ids.length
            && snapshot.ids.every(id => typeof id === 'string' && Object.hasOwn(PET_SYNERGY_DEFS, id)),
        '战宠阵型羁绊战斗快照无效',
    );
}

export function applyPetSynergiesToParty(arena, snapshot) {
    if (!snapshot) return;
    validatePetSynergiesSnapshot(snapshot);
    let damagePct = 0;
    let resistPct = 0;
    let critPct = 0;
    let accuracyPct = 0;
    let powerPipPct = 0;
    let outputHealPct = 0;
    let hpPct = 0;

    for (const id of snapshot.ids) {
        const s = PET_SYNERGY_DEFS[id]?.stats || {};
        damagePct += s.damagePct || 0;
        resistPct += s.resistPct || 0;
        critPct += s.critPct || 0;
        accuracyPct += s.accuracyPct || 0;
        powerPipPct += s.powerPipPct || 0;
        outputHealPct += s.outputHealPct || 0;
        hpPct += s.hpPct || 0;
    }

    for (const unit of arena?.sides?.near || []) {
        if (damagePct) unit.stats.damagePct.all = (unit.stats.damagePct.all || 0) + damagePct;
        if (resistPct) unit.stats.resistPct.all = (unit.stats.resistPct.all || 0) + resistPct;
        if (critPct) {
            unit.stats.critPct ??= {};
            unit.stats.critPct.all = (unit.stats.critPct.all || 0) + critPct;
        }
        if (accuracyPct) {
            unit.stats.accuracyPct ??= {};
            unit.stats.accuracyPct.all = (unit.stats.accuracyPct.all || 0) + accuracyPct;
        }
        if (powerPipPct) unit.stats.powerPipPct = (unit.stats.powerPipPct || 0) + powerPipPct;
        if (outputHealPct) unit.stats.outputHealPct = (unit.stats.outputHealPct || 0) + outputHealPct;
        if (hpPct) {
            const baseMax = unit.languageBaseMaxHp ?? unit.maxHp;
            unit.languageBaseMaxHp = baseMax;
            const newMax = applyHpStats(unit.maxHp, hpPct, 0, 'kids');
            const ratio = unit.maxHp > 0 ? unit.hp / unit.maxHp : 1;
            unit.maxHp = newMax;
            unit.hp = unit.hp > 0 ? Math.max(1, Math.min(newMax, Math.round(newMax * ratio))) : 0;
        }
    }
    arena.petSynergies = { version: 1, ids: [...snapshot.ids] };
}
