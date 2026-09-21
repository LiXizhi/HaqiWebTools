// combat_params_core.js — BalanceParams 覆盖层。
// 数据集（cards/charms/...）只读；所有可调数值集中在这里，引擎只读取 resolveParams() 的结果。
// 常量来源见 docs/lua-mapping.md §1。

export const SCHOOLS = ['fire', 'ice', 'storm', 'life', 'death'];
export const ALL_SCHOOLS = ['fire', 'ice', 'storm', 'myth', 'life', 'death', 'balance'];
export const VERSIONS = ['kids', 'teen'];

function perSchoolDefaults() {
    const out = {};
    for (const s of SCHOOLS) {
        out[s] = { hp: 1, damage: 1, heal: 1, accuracy: 0, powerPip: 0, resist: 0, crit: 0 };
    }
    return out;
}

/**
 * 默认参数（按版本）。
 * global 常量对照：
 *   maxPips            player_server.lua L58/L173/L186 (kids 7 / teen 14)
 *   maxRounds          player_server.lua L184/L188, arena_server.lua L96/L319 (kids 100 / teen 80)，单位为“半回合”（每边各出一次牌为 2）
 *   handSize           player_server.lua L295 (8)
 *   deckCapacity       卡包总容量：来自卡包道具 stats[167]（arena_server.lua L8011/L8154），本地无道具表；
 *                      初始卡包为 kids 14 / teen 18（CombatCardDeckSubPage.lua L38 / CombatCardManager.teen.lua L41），
 *                      正常玩家卡包约 40 张，默认 40
 *   deckEachCapacity   单卡上限：stats[170]（arena_server.lua L8087-8107），初始卡包 3 / 5，正常约 6，默认 6；teen 同名 spell_name 共享上限（L8119）
 *   deckPresetCopies   模拟器项：未自定义配卡时，官方 Aggressive 卡组每种卡带几份（带满不一定最好——抽不到想要的牌）
 *   critDamageRatio    card_server.lua L96 (1.3)
 *   dodgeDamageRatio   card_server.lua L99, InitConstants L191-200 (teen 0.5 / kids 0.00001)
 *   maxSpellPenetration card_server.lua L69 (70)
 *   protectRounds      card_server.lua L103 (6) kids PvP 绝对防御/致命一击保护回合
 *   arenaDamageBoostPerRound arena_server.lua L1405 (kids 4 / teen 2，teen 仅 bIncreasingDamage 时启用)
 *   startupPipsNormal  玩家开局 pips（Lua 来自装备 stat 184/185，此处给默认 0）
 */
export function defaultParams(version = 'teen') {
    const teen = version === 'teen';
    return {
        version,
        // Web island unlock levels; original world configuration is unavailable.
        worldTravel: { camp:1, town:1, fire:10, ice:20, desert:30, dark:40 },
        checkin: { minutes: [1, 15, 30, 60, 90], coins: 100 },
        // Web progression schedule; original server training-point grant table is unavailable.
        skillLearning: { pointLevels: [4,8,12,16,20,25,30,35,40,45,50] },
        // SueSue_equipment_extend_panel.lua GetAllOdds: kids level 1–5.
        gems: { odds: [100,80,60,40,25] },
        adventure: {
            iceAreaAttackThreatRatio:2,
            damageThreatRatio:1, splashDamageThreatRatio:0.05,
            singleHealThreatRatio:0.3,
            areaHealThreatRatio:0.2,
            splashManipulationThreatRatio:0.2,
            effectThreatGlobal:200,
            effectThreatMiniAura:80,
            effectThreatRemovePositiveCharm:100,
            effectThreatRemoveNegativeCharm:100,
            effectThreatStealCharm:100,
            effectThreatCharms:80,
            effectThreatWards:80,
            effectThreatAreaCharm:60,
            effectThreatAreaWard:60,
            effectThreatAbsorb:400,
            effectThreatStun:500,
            effectThreatRemovePositiveWard:100,
            effectThreatStealWard:100,
            effectThreatSymmetryWards:200,
            effectThreatReflectionShield:100,
            effectThreatAreaPowerPipBoost:50,
            effectThreatAreaCleanse:100,
            defensiveThreatWeight:3,
            tauntThreatWeight:5,
            levelCap: 50, stageLevels: [1,10,25,40], petCapacities: [2,4,6,8],
            petCopies: 3, heroRegenPerSecond: .02, regenPerMinute: .05, hungerPerMinute: 1, feedThreshold: 30,
            foodRestore: 40, defeatHp: .1, captureBase: .2, captureWounded: .65,
            foodPrice: 10, capturePrice: 25, petPriceBase: 100, petPriceLevel: 40,
            gearPriceBase: 30, gearPriceLevel: 15, duplicateXp: 50,
            encounterXpBase: 25, encounterXpLevel: 12, encounterCoinsBase: 30, encounterCoinsLevel: 8,
            xpGrowth: 300, petXpStep: 30,
        },
        global: {
            maxReflectDamage: teen ? 5000 : 4500,
            maxPips: teen ? 14 : 7,
            maxRounds: teen ? 80 : 100,
            handSize: 8,
            deckCapacity: 40,
            deckEachCapacity: 6,
            deckPresetCopies: 3,
            critDamageRatio: 1.3,
            dodgeDamageRatio: teen ? 0.5 : 0.00001,
            maxSpellPenetration: 70,
            protectRounds: 6,
            arenaDamageBoostPerRound: teen ? 0 : 4,
            healPenalty: 0,
            forceAccuracy100: teen, // teen 版 Lua 强制卡牌 accuracy=100（研究结论）
            startupPipsNormal: 0,
            startupPipsPower: 0,
        },
        perSchool: perSchoolDefaults(),
        cardOverrides: {},
        fairPlay: null,
    };
}

export function cloneParams(params) {
    return JSON.parse(JSON.stringify(params));
}

/** 深合并：patch 覆盖 base（对象递归，数组/标量替换） */
export function mergeParams(base, patch) {
    const out = cloneParams(base);
    (function walk(dst, src) {
        for (const k of Object.keys(src || {})) {
            const v = src[k];
            if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object') {
                walk(dst[k], v);
            } else {
                dst[k] = v;
            }
        }
    })(out, patch);
    return out;
}

/** 列出 cur 相对 base 的差异 [{path, from, to}] */
export function diffParams(base, cur) {
    const diffs = [];
    (function walk(a, b, path) {
        const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
        for (const k of keys) {
            const av = a ? a[k] : undefined;
            const bv = b ? b[k] : undefined;
            const p = path ? `${path}.${k}` : k;
            if (av && bv && typeof av === 'object' && typeof bv === 'object') {
                walk(av, bv, p);
            } else if (av !== bv && !(av === undefined && bv === null) && !(av === null && bv === undefined)) {
                if (typeof av === 'object' || typeof bv === 'object') {
                    if (JSON.stringify(av) !== JSON.stringify(bv)) diffs.push({ path: p, from: av, to: bv });
                } else {
                    diffs.push({ path: p, from: av, to: bv });
                }
            }
        }
    })(base, cur, '');
    return diffs;
}

export function serializeParams(params) {
    return JSON.stringify(params, null, 2);
}

export function parseParams(text, fallbackVersion = 'teen') {
    const obj = JSON.parse(text);
    const version = VERSIONS.includes(obj.version) ? obj.version : fallbackVersion;
    return mergeParams(defaultParams(version), obj);
}

/** 读取 school 的系数条目（未知系回退到 balance 的空系数） */
export function schoolFactor(params, school) {
    return params.perSchool[school] || { hp: 1, damage: 1, heal: 1, accuracy: 0, powerPip: 0, resist: 0, crit: 0 };
}

function numberish(v) {
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
    return v;
}

/**
 * 单体 charm / ward 类卡的目标阵营由模板 positive 决定：
 * 增益（盾、专注）→ friendly；减益（诅咒/陷阱、虚弱）→ hostile。
 * 与官方 AI 表（deck_attacker_ai/*.csv 首列 target）一致；原版由客户端选目标，服务器不校验。
 * @return 'friendly' | 'hostile' | undefined（非 charm/ward 卡交由 cardTargetKind 按 type 推断）
 */
export function inferTargetKind(card, charmsRoot) {
    const t = card.type;
    if (!/^(Charms|Wards|StandingWards|SymmetryWards)$/.test(t)) return undefined;
    const p = card.params || {};
    const list = (v) => v === undefined || v === null || v === '' ? [] : String(v).split(',').map(s => s.trim()).filter(Boolean);
    let ids, table;
    if (t === 'Charms') { ids = list(p.charms ?? p.charm); table = charmsRoot.charm || {}; }
    else { ids = list(p.target_wards ?? p.wards ?? p.ward); table = charmsRoot.ward || {}; }
    if (!ids.length) return t === 'SymmetryWards' ? 'hostile' : undefined;
    const negative = ids.some(id => { const tpl = table[id]; return tpl && (tpl.positive === false || tpl.positive === 'false'); });
    return negative ? 'hostile' : 'friendly';
}

/**
 * 合并数据集与参数，产出引擎实际读取的 resolved 结构：
 * { version, global, perSchool, cards, charms, wards, miniauras, globalauras, aiDecks, statsByGear, manifest }
 * 单卡覆盖：cardOverrides[key] = { pipcost?, accuracy?, params?: {damage_min?...} }
 */
export function resolveParams(dataset, params) {
    const version = params.version || dataset.version || 'teen';
    const cards = {};
    for (const key of Object.keys(dataset.cards || {})) {
        const src = dataset.cards[key];
        const ov = params.cardOverrides[key];
        const card = {
            key: src.key || key,
            spellName: src.spellName || src.spell_name || key,
            type: src.type,
            target: src.target,
            pipcost: numberish(src.pipcost ?? 0),
            accuracy: numberish(src.accuracy ?? 100),
            hitchance: numberish(src.hitchance ?? 100),
            spellSchool: (src.spellSchool || src.spell_school || 'balance').toLowerCase(),
            requireLevel: numberish(src.requireLevel ?? src.require_level ?? 0),
            canLearn: src.canLearn ?? src.can_learn,
            params: { ...(src.params || {}) },
        };
        if (params.global.forceAccuracy100) card.accuracy = 100;
        if (ov) {
            if (ov.pipcost !== undefined) card.pipcost = numberish(ov.pipcost);
            if (ov.accuracy !== undefined) card.accuracy = numberish(ov.accuracy);
            if (ov.params) Object.assign(card.params, ov.params);
        }
        for (const k of Object.keys(card.params)) card.params[k] = numberish(card.params[k]);
        if (!card.target) card.target = inferTargetKind(card, dataset.charms || {});
        cards[key] = card;
    }
    const charmsRoot = dataset.charms || {};
    return {
        version,
        global: { ...params.global },
        // Web island unlock levels; original world configuration is unavailable.
        worldTravel: { ...defaultParams(version).worldTravel, ...params.worldTravel },
        checkin: { ...defaultParams(version).checkin, ...params.checkin },
        adventure: { ...defaultParams(version).adventure, ...params.adventure },
        perSchool: params.perSchool,
        fairPlay: params.fairPlay || null,
        cards,
        charms: charmsRoot.charm || {},
        wards: charmsRoot.ward || {},
        miniauras: charmsRoot.miniaura || {},
        globalauras: charmsRoot.globalaura || {},
        aiDecks: dataset.aiDecks || {},
        statsByGear: dataset.statsByGear || {},
        hpTable: dataset.hpTable || {},
        manifest: dataset.manifest || {},
    };
}
