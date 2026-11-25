// Pure rules for the Campfire Cooking & Alchemy Cauldron ("营火烹饪 / 魔药锅").
// Connects fishing catches (17106..17111) and gathered materials (flower/herb/stone/ore)
// directly into multi-battle party meal buffs, instant pet feasts, and useful runes/pearls.

import { applyHpStats } from './combat_formulas_core.js';
import { petMaxHp, petXpLevel, FOOD_ID } from './adventure_pets_core.js';
import { specMaxHp } from './adventure_pets_core.js';

const assert = (ok, message) => {
    if (!ok) throw new Error(message);
};

export const PANTRY_KEYS = ['flower', 'herb', 'stone', 'ore'];
export const PANTRY_NAMES = {
    flower: '野花',
    herb: '草药',
    stone: '砾石',
    ore: '原矿',
};

// Accepted fish groups for flexible cooking so every catch has a culinary home.
const COMMON_FISH_IDS = [17107, 17108, 17109]; // 胖乎乎水母 / 小毛头泥鳅 / 呆呆大头鱼
const CRAB_OR_BIG_FISH_IDS = [17110, 17109]; // 大个头螃蟹 / 呆呆大头鱼

export const CAMPFIRE_RECIPES = [
    {
        id: 'warm-fish-soup',
        category: 'meal',
        name: '鲜鱼暖汤',
        subtitle: '持续 4 场战斗 · 经验 +25% · 全队生命 +8%',
        ingredientLabel: '任一常见渔获（水母/泥鳅/大头鱼）×1 +（草药×2 或 30 奇豆）',
        fishPool: COMMON_FISH_IDS,
        fishCount: 1,
        pantryPool: ['herb', 'flower'],
        pantryCount: 2,
        fallbackCoins: 30,
        buff: {
            battles: 4,
            xpBonusPct: 25,
            hpPct: 8,
            postBattleFullHeal: false,
            stats: {},
        },
    },
    {
        id: 'roasted-crab-claw',
        category: 'meal',
        name: '炙烤蟹钳',
        subtitle: '持续 4 场战斗 · 全队伤害 +10% · 暴击 +5%',
        ingredientLabel: '大个头螃蟹×1 +（原矿/砾石×2 或 50 奇豆）',
        fishPool: [17110],
        fishCount: 1,
        pantryPool: ['ore', 'stone'],
        pantryCount: 2,
        fallbackCoins: 50,
        buff: {
            battles: 4,
            xpBonusPct: 0,
            hpPct: 0,
            postBattleFullHeal: false,
            stats: { damagePct: 10, critPct: 5 },
        },
    },
    {
        id: 'crown-feast',
        category: 'meal',
        name: '皇冠海鲜宴',
        subtitle: '持续 5 场战斗 · 全队攻防 +10% · 经验 +35% · 开局 +1 强力球',
        ingredientLabel: '闪闪皇冠鱼×1 +（野花/草药×2 或 80 奇豆）',
        fishPool: [17111],
        fishCount: 1,
        pantryPool: ['flower', 'herb'],
        pantryCount: 2,
        fallbackCoins: 80,
        buff: {
            battles: 5,
            xpBonusPct: 35,
            hpPct: 0,
            postBattleFullHeal: false,
            stats: { damagePct: 10, resistPct: 10, startupPower: 1 },
        },
    },
    {
        id: 'herbal-dew-tea',
        category: 'meal',
        name: '草本轻露茶',
        subtitle: '持续 3 场战斗 · 全队减伤 +8% · 治疗 +15% · 战后自动回满生命',
        ingredientLabel: '野花/草药×3（或 40 奇豆直接向营地采购配料）',
        fishPool: [],
        fishCount: 0,
        pantryPool: ['herb', 'flower'],
        pantryCount: 3,
        fallbackCoins: 40,
        buff: {
            battles: 3,
            xpBonusPct: 0,
            hpPct: 0,
            postBattleFullHeal: true,
            stats: { resistPct: 8, outputHealPct: 15 },
        },
    },
    {
        id: 'seafood-pet-banquet',
        category: 'pet',
        name: '秘制海味宠粮',
        subtitle: '出战战宠饱食与生命全满 · 每只 +150 经验 · 另赠营养餐 ×2',
        ingredientLabel: '任一常见渔获×1 +（草药/野花×1 或 25 奇豆）',
        fishPool: COMMON_FISH_IDS,
        fishCount: 1,
        pantryPool: ['herb', 'flower'],
        pantryCount: 1,
        fallbackCoins: 25,
        petFeast: {
            xp: 150,
            bonusFood: 2,
        },
    },
    {
        id: 'boot-rune-alchemy',
        category: 'alchemy',
        name: '旧靴炼符法',
        subtitle: '变废为宝：炼成抓宠符文 ×1 + 捕鱼网 ×1',
        ingredientLabel: '臭脚丫马靴×1 +（砾石/原矿×2 或 25 奇豆）',
        fishPool: [17106],
        fishCount: 1,
        pantryPool: ['stone', 'ore'],
        pantryCount: 2,
        fallbackCoins: 25,
        outputs: [
            { id: 23439, count: 1 },
            { id: 17113, count: 1 },
        ],
    },
    {
        id: 'crystal-blessing-brew',
        category: 'alchemy',
        name: '晶石祝福露',
        subtitle: '炼成祝福魔珠 ×1 + 宠物营养餐 ×3',
        ingredientLabel: '大个头螃蟹或大头鱼×1 +（原矿/砾石×3 或 1 仙豆）',
        fishPool: CRAB_OR_BIG_FISH_IDS,
        fishCount: 1,
        pantryPool: ['ore', 'stone'],
        pantryCount: 3,
        fallbackFairyBeans: 1,
        outputs: [
            { id: 17487, count: 1 },
            { id: FOOD_ID, count: 3 },
        ],
    },
];

export const CAMPFIRE_RECIPE_BY_ID = Object.fromEntries(CAMPFIRE_RECIPES.map(r => [r.id, r]));

export function recordGatherPantry(save, itemId, count = 1) {
    if (!save || !PANTRY_KEYS.includes(itemId) || !Number.isInteger(count) || count <= 0) return false;
    save.gatherPantry ??= {};
    save.gatherPantry[itemId] = Math.min(999, (save.gatherPantry[itemId] || 0) + count);
    return true;
}

export function validateGatherPantry(save) {
    if (save?.gatherPantry === undefined) return;
    assert(save.gatherPantry && typeof save.gatherPantry === 'object' && !Array.isArray(save.gatherPantry), '采集食材袋无效');
    for (const [k, v] of Object.entries(save.gatherPantry)) {
        assert(PANTRY_KEYS.includes(k) && Number.isInteger(v) && v >= 0 && v <= 9999, '采集食材数量无效');
    }
}

export function validateCampfireBuff(buff) {
    if (buff === undefined || buff === null) return;
    assert(
        buff && typeof buff === 'object' && !Array.isArray(buff)
            && typeof buff.id === 'string' && Object.hasOwn(CAMPFIRE_RECIPE_BY_ID, buff.id)
            && Number.isInteger(buff.remainingBattles) && buff.remainingBattles >= 1 && buff.remainingBattles <= 10,
        '营火料理增益无效',
    );
}

export function validateCampfireBuffSnapshot(snapshot) {
    if (snapshot === undefined || snapshot === null) return;
    assert(
        snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
            && snapshot.version === 1
            && typeof snapshot.id === 'string' && Object.hasOwn(CAMPFIRE_RECIPE_BY_ID, snapshot.id)
            && CAMPFIRE_RECIPE_BY_ID[snapshot.id].buff,
        '营火料理战斗快照无效',
    );
}

export function campfireCountCooked(save) {
    return Number.isInteger(save?.campfireCookedCount) ? save.campfireCookedCount : 0;
}

function findFishToConsume(save, recipe) {
    if (!recipe.fishCount) return null;
    for (const id of recipe.fishPool) {
        if ((save.inventory?.[id] || 0) >= recipe.fishCount) return id;
    }
    return null;
}

function pantryTotal(save, keys) {
    return keys.reduce((sum, key) => sum + (save.gatherPantry?.[key] || 0), 0);
}

export function canCookRecipe(save, recipeOrId) {
    const recipe = typeof recipeOrId === 'string' ? CAMPFIRE_RECIPE_BY_ID[recipeOrId] : recipeOrId;
    if (!recipe || !save) return { ok: false, reason: '未知配方' };
    if (save.pendingEncounter) return { ok: false, reason: '战斗中无法生火烹饪' };
    const fishId = findFishToConsume(save, recipe);
    if (recipe.fishCount > 0 && !fishId) {
        return { ok: false, reason: '缺少所需渔获，先去海边钓一竿吧' };
    }
    const havePantry = pantryTotal(save, recipe.pantryPool || []);
    const usePantry = (recipe.pantryCount || 0) > 0 && havePantry >= recipe.pantryCount;
    if (!usePantry) {
        if (recipe.fallbackCoins && (save.inventory?.[100] || 0) < recipe.fallbackCoins) {
            return { ok: false, reason: `采集食材不足，且奇豆不足 ${recipe.fallbackCoins}` };
        }
        if (recipe.fallbackFairyBeans && (save.inventory?.[17213] || 0) < recipe.fallbackFairyBeans) {
            return { ok: false, reason: `采集食材不足，且仙豆不足 ${recipe.fallbackFairyBeans}` };
        }
    }
    return {
        ok: true,
        fishId,
        usePantry,
        fallbackCoins: usePantry ? 0 : (recipe.fallbackCoins || 0),
        fallbackFairyBeans: usePantry ? 0 : (recipe.fallbackFairyBeans || 0),
    };
}

function consumePantry(save, keys, needed) {
    let left = needed;
    save.gatherPantry ??= {};
    for (const key of keys) {
        if (left <= 0) break;
        const take = Math.min(left, save.gatherPantry[key] || 0);
        if (take > 0) {
            save.gatherPantry[key] -= take;
            left -= take;
        }
    }
}

export function cookCampfireRecipe(save, content, recipeId) {
    const recipe = CAMPFIRE_RECIPE_BY_ID[recipeId];
    assert(recipe, '未知营火配方');
    const check = canCookRecipe(save, recipe);
    assert(check.ok, check.reason);

    if (check.fishId) save.inventory[check.fishId] -= recipe.fishCount;
    if (check.usePantry) consumePantry(save, recipe.pantryPool, recipe.pantryCount);
    else if (check.fallbackCoins) save.inventory[100] -= check.fallbackCoins;
    else if (check.fallbackFairyBeans) save.inventory[17213] -= check.fallbackFairyBeans;

    const rewards = [];
    let message = `营火烹饪完成：「${recipe.name}」！`;

    if (recipe.buff) {
        save.campfireBuff = {
            id: recipe.id,
            remainingBattles: recipe.buff.battles,
        };
        message = `「${recipe.name}」出锅了！接下来 ${recipe.buff.battles} 场战斗生效：${recipe.subtitle}。`;
    } else if (recipe.petFeast) {
        let fedCount = 0;
        for (const petId of save.formation || []) {
            if (!petId || !save.pets?.[petId]) continue;
            const pet = save.pets[petId];
            pet.hunger = 100;
            pet.hp = petMaxHp(pet, content);
            pet.xp = (pet.xp || 0) + recipe.petFeast.xp;
            pet.level = petXpLevel(pet.xp, content);
            fedCount++;
        }
        if (recipe.petFeast.bonusFood > 0 && (!content?.items || content.items[FOOD_ID])) {
            save.inventory[FOOD_ID] = (save.inventory[FOOD_ID] || 0) + recipe.petFeast.bonusFood;
            rewards.push({
                id: FOOD_ID,
                count: recipe.petFeast.bonusFood,
                name: content?.items?.[FOOD_ID]?.name || '宠物营养餐',
            });
        }
        message = fedCount > 0
            ? `「${recipe.name}」大受欢迎！${fedCount} 位出战伙伴饱食与生命全满，各获 ${recipe.petFeast.xp} 经验。`
            : `「${recipe.name}」做好了，并装好了额外宠物营养餐。`;
    } else if (recipe.outputs) {
        for (const out of recipe.outputs) {
            if (out.id !== 100 && content?.items && !content.items[out.id]) continue;
            save.inventory[out.id] = (save.inventory[out.id] || 0) + out.count;
            rewards.push({
                id: out.id,
                count: out.count,
                name: content?.items?.[out.id]?.name || String(out.id),
            });
        }
        message = `魔药锅炼成「${recipe.name}」！`;
    }

    save.campfireCookedCount = campfireCountCooked(save) + 1;
    save.revision = (save.revision || 0) + 1;
    return { changed: true, recipe, rewards, message };
}

export function campfireBuffSnapshot(save) {
    const buff = save?.campfireBuff;
    if (!buff || !buff.remainingBattles || buff.remainingBattles <= 0) return null;
    const recipe = CAMPFIRE_RECIPE_BY_ID[buff.id];
    if (!recipe?.buff) return null;
    return { version: 1, id: recipe.id };
}

export function campfireBuffDetail(buffOrSnapshot) {
    if (!buffOrSnapshot?.id) return null;
    const recipe = CAMPFIRE_RECIPE_BY_ID[buffOrSnapshot.id];
    if (!recipe?.buff) return null;
    return {
        id: recipe.id,
        name: recipe.name,
        subtitle: recipe.subtitle,
        remainingBattles: buffOrSnapshot.remainingBattles ?? null,
        ...recipe.buff,
    };
}

export function applyCampfireBuffToParty(arena, snapshot) {
    if (!snapshot) return;
    validateCampfireBuffSnapshot(snapshot);
    const recipe = CAMPFIRE_RECIPE_BY_ID[snapshot.id];
    const buff = recipe?.buff;
    if (!buff) return;
    const s = buff.stats || {};
    for (const unit of arena?.sides?.near || []) {
        if (s.damagePct) unit.stats.damagePct.all = (unit.stats.damagePct.all || 0) + s.damagePct;
        if (s.resistPct) unit.stats.resistPct.all = (unit.stats.resistPct.all || 0) + s.resistPct;
        if (s.critPct) {
            unit.stats.critPct ??= {};
            unit.stats.critPct.all = (unit.stats.critPct.all || 0) + s.critPct;
        }
        if (s.outputHealPct) unit.stats.outputHealPct = (unit.stats.outputHealPct || 0) + s.outputHealPct;
        if (s.startupPower && unit.id === 'hero') unit.stats.startupPower = (unit.stats.startupPower || 0) + s.startupPower;
        if (buff.hpPct) {
            const baseMax = unit.languageBaseMaxHp ?? unit.maxHp;
            unit.languageBaseMaxHp = baseMax;
            const newMax = applyHpStats(unit.maxHp, buff.hpPct, 0, 'kids');
            const ratio = unit.maxHp > 0 ? unit.hp / unit.maxHp : 1;
            unit.maxHp = newMax;
            unit.hp = unit.hp > 0 ? Math.max(1, Math.min(newMax, Math.round(newMax * ratio))) : 0;
        }
    }
    arena.campfireBuff = { version: 1, id: recipe.id };
}

export function consumeCampfireBuffOnVictory(save, content, pending, heroSpec) {
    if (!pending?.campfireBuff) return { xpBonusPct: 0, healed: false };
    const recipe = CAMPFIRE_RECIPE_BY_ID[pending.campfireBuff.id];
    const buff = recipe?.buff;
    if (!buff) return { xpBonusPct: 0, healed: false };

    let healed = false;
    if (buff.postBattleFullHeal) {
        if (heroSpec) save.heroHp = specMaxHp(heroSpec);
        for (const petId of save.formation || []) {
            const pet = petId ? save.pets?.[petId] : null;
            if (pet) pet.hp = petMaxHp(pet, content);
        }
        healed = true;
    }

    if (save.campfireBuff && save.campfireBuff.id === pending.campfireBuff.id) {
        save.campfireBuff.remainingBattles = Math.max(0, (save.campfireBuff.remainingBattles || 1) - 1);
        if (save.campfireBuff.remainingBattles <= 0) delete save.campfireBuff;
    }

    return { xpBonusPct: buff.xpBonusPct || 0, healed };
}
