// AdventureContent / AdventureSave v1. Pure chapter rules; no browser or storage APIs.
import { SCHOOLS } from './combat_params_core.js';
import { normalizeStats, statIdToEntry, clampDeck } from './combat_unit_core.js';
import * as Pets from './adventure_pets_core.js';
import { hashSeed } from './rng_core.js';
import { equipmentRequirements } from './adventure_item_rules_core.js';
import { upgradeAt, upgradeLevels, applyUpgradeStats } from './adventure_upgrade_core.js';
import { claimCheckin, validateCheckin } from './adventure_checkin_core.js';
import { resolvePetReward, migrateQuestPetRewards } from './adventure_rewards_core.js';
export { rewardLabel } from './adventure_rewards_core.js';

export const SAVE_VERSION = 2;
export const SCHOOL_NAMES = { fire: '烈火', ice: '寒冰', storm: '风暴', life: '生命', death: '死亡' };
const clone = value => JSON.parse(JSON.stringify(value));
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const owns = (s, id) => (s.inventory[id] || 0) > 0;
export function currentQuest(save, content) {
    return content.quests.find(q => !save.quests[q.id]?.claimed) || null;
}
export function questState(save, id) { return save.quests[id] || { accepted: false, claimed: false, progress: {} }; }
export function questProgress(save, quest) {
    const state = questState(save, quest.id);
    return quest.goals.map(g => ({ ...g, value: Math.min(g.count, state.progress[`${g.kind}:${g.id}`] || 0) }));
}
export function pendingQuestTalk(save, quest, npcId) {
    if (!quest || !questState(save, quest.id).accepted || questState(save, quest.id).claimed) return null;
    const pending = questProgress(save, quest).some(g => g.kind === 'talk' && g.id === npcId && g.value < g.count);
    return pending ? quest.talks.find(t => t.npcId === npcId) || null : null;
}
export function questReady(save, quest) {
    return !!quest && questState(save, quest.id).accepted && questProgress(save, quest).every(g => g.value >= g.count);
}
export function createAdventure(content, { name = '小哈奇', school = 'fire', appearance = 'boy', seed = 530, starter = 'dragon_green' } = {}) {
    assert(SCHOOLS.includes(school), '请选择魔法学系');
    const save = { schemaVersion: SAVE_VERSION, contentVersion: content.contentVersion, seed: hashSeed(String(seed)),
        name: String(name).trim().slice(0, 16) || '小哈奇', school, appearance: appearance === 'girl' ? 'girl' : 'boy',
        xp: 0, level: 1, inventory: {}, equipment: {}, upgrades: {}, cards: {}, deck: [], quests: {},
        pet: null, zone: 'camp', position: { x: 860, y: 850 }, facing: 3,
        encounterSerial: 0, pendingEncounter: null, rewardedEncounters: [], graduated: false,
        visitedTown: false, music: false, tips: {}, revision: 0, bagRulesVersion: 1 };
    syncProgression(save, content);
    save.deck = recommendedDeck(save, content);
    syncDeckLayouts(save,content);
    if(content.pets)Pets.initializePets(save,content,starter);
    return save;
}
export function deckLimits(save, content) {
    const bag = content.items[save.equipment[24]];
    return { capacity: Number(bag?.stats[167] || 14), eachCapacity: Number(bag?.stats[170] || 3), handSize: 8 };
}
// arena_server.lua L8080-8086: learned spells are qualifications, not consumed copies.
// Preserve the original chapter-only inventory mode for its standalone fixtures.
export function deckCardCopies(save, content, key) {
    if (!save.cards[key]) return 0;
    return content.cardLibrary ? deckLimits(save,content).eachCapacity : save.cards[key];
}
export function syncProgression(save, content) {
    save.level = Math.min(content.progression.levelCap, content.progression.xpThresholds.filter(x => save.xp >= x).length);
    for (const lesson of content.learn[save.school]) {
        if (lesson.level <= save.level && !save.cards[lesson.key]) save.cards[lesson.key] = lesson.copies;
    }
}
export function availableCardLessons(save,content) {
    return content.cardLibrary || content.learn[save.school].map(row=>({...row,school:save.school,supported:true}));
}
export function learnDeckCards(save,content,keys=[]) {
    assert(Array.isArray(keys)&&keys.length<=Object.keys(content.cardLibrary||{}).length,'学习卡牌列表无效');
    const lessons=new Map(availableCardLessons(save,content).map(row=>[row.key,row]));
    for(const key of keys){
        const lesson=lessons.get(key);
        assert(lesson&&lesson.supported!==false,'此卡牌效果暂未开放');
        assert(save.level>=lesson.level,'尚未达到学习等级');
        save.cards[key]=Math.max(save.cards[key]||0,lesson.copies);
    }
}
export function recommendedDeck(save, content) {
    // The chapter unlock order introduces wand, attacks, blade, trap, healing and shield.
    const lessons = content.learn[save.school].filter(x => save.cards[x.key]);
    const priority = lessons.length>7?[...lessons].reverse():[3,5,1,0,2,4,6].map(i => lessons[i]).filter(Boolean);
    const limits = deckLimits(save, content), result = [];
    let n = 0;
    for (const lesson of priority) {
        const count = Math.min(deckCardCopies(save,content,lesson.key), limits.eachCapacity, limits.capacity - n);
        if (count) result.push({ key: lesson.key, count });
        n += count;
    }
    return result;
}
export function validDeck(save, content, deck) {
    const limits = deckLimits(save, content);
    assert(Array.isArray(deck) && deck.length > 0, '卡包至少需要一张卡牌');
    const seen = new Set(); let total = 0;
    for (const entry of deck) {
        assert(!seen.has(entry.key) && Number.isInteger(entry.count) && entry.count > 0, '卡牌份数无效'); seen.add(entry.key);
        assert(!content.cardLibrary||content.cardLibrary.some(row=>row.key===entry.key&&row.supported!==false),'此卡牌效果暂未开放');
        assert(entry.count <= deckCardCopies(save,content,entry.key) && entry.count <= limits.eachCapacity, '超过拥有数量或单卡上限');
        total += entry.count;
    }
    assert(total <= limits.capacity, '卡包已满'); return true;
}
// Original CombatCardDeckSubPage: named bag tabs and one icon per card copy.
// The active deck remains the battle/legacy-save source of truth.
export function syncDeckLayouts(save, content) {
    if (!save.deckLayouts) { save.deckLayouts = [{name:'卡包一',deck:clone(save.deck)}]; save.activeDeckLayout = 0; }
    const limits = {...deckLimits(save,content),version:'kids'};
    for (let i=0;i<save.deckLayouts.length;i++) {
        const layout=save.deckLayouts[i],source=i===save.activeDeckLayout?save.deck:layout.deck;
        layout.deck=clampDeck(source.map(row=>({...row,count:Math.min(row.count,deckCardCopies(save,content,row.key))})).filter(row=>row.count>0),limits).deck;
        if(!layout.deck.length)layout.deck=recommendedDeck(save,content);
    }
    save.deck=clone(save.deckLayouts[save.activeDeckLayout].deck);
}
function validateDeckLayouts(save,content,layouts,active) {
    assert(Array.isArray(layouts)&&layouts.length>=1&&layouts.length<=6,'请保留一至六个卡包');
    assert(Number.isInteger(active)&&active>=0&&active<layouts.length,'请选择有效卡包');
    for(const row of layouts){
        assert(row&&typeof row.name==='string'&&row.name.trim().length>0&&row.name.length<=16,'卡包名称需为一至十六字');
        validDeck(save,content,row.deck);
    }
}
export function canEquip(save, item, content) {
    return !equipmentBlockReason(save, item, content);
}
export function equipmentBlockReason(save, item, content) {
    if (!item || !(item.kind === 1 || item.slot === 24) || !Number.isInteger(item.slot) || item.slot <= 0) return '这不是可穿戴的装备';
    if (!owns(save,item.id)) return '尚未获得这件装备';
    // Old in-flight checkpoints must replay with the rules used to snapshot them.
    const requirements=item.slot===24&&save.pendingEncounter&&save.bagRulesVersion===undefined
        ? {level:Number(item.stats[138]||1),school:Number(item.stats[137]||0)} : equipmentRequirements(item);
    if (requirements.level > save.level) return `需要等级 ${requirements.level}`;
    if (requirements.school && requirements.school !== content.schools[save.school]) return '不符合学系要求';
    return '';
}
function migrateBagRules(save,content) {
    if(save.bagRulesVersion===1||save.pendingEncounter)return;
    const bag=content.items[save.equipment[24]];
    if(bag&&!canEquip(save,bag,content)){
        delete save.equipment[24];
        save.tips.bagRulesAdjusted=true;
        syncDeckLayouts(save,content);
    }
    save.bagRulesVersion=1;
}
export function playerSpec(save, content) {
    const stats = normalizeStats(), fixed = [];
    for (const iid of Object.values(save.equipment)) {
        const item = content.items[iid];
        if (!canEquip(save,item,content)) continue;
        for (const [id,value] of Object.entries(item.stats)) {
            const entry = statIdToEntry(id); if (!entry) continue;
            if (typeof stats[entry.stat] === 'object') stats[entry.stat][entry.school] = (stats[entry.stat][entry.school] || 0) + Number(value);
            else stats[entry.stat] += Number(value);
        }
        applyUpgradeStats(stats,upgradeAt(content,iid,save.upgrades[iid]));
        for (const id of [139,140,141]) {
            const key = content.cardItems[item.stats[id]];
            if (key) fixed.push({ key, count: 1 });
        }
    }
    const limits = deckLimits(save,content);
    return { id: 'hero', name: save.name, school: save.school, level: save.level, isBot: false, stats,
        deck: clone(save.deck), fixedCards: fixed, deckCapacity: limits.capacity, deckEachCapacity: limits.eachCapacity };
}
function signal(save, content, kind, id, count = 1) {
    const q = currentQuest(save, content); if (!q || !questState(save,q.id).accepted) return;
    const state = save.quests[q.id];
    for (const goal of q.goals) if (goal.kind === kind && String(goal.id) === String(id)) {
        const key = `${kind}:${id}`; state.progress[key] = Math.min(goal.count, (state.progress[key] || 0) + count);
    }
}
function syncGoals(save,content) {
    if (save.equipment[11] === 1912) signal(save,content,'action','equip-staff');
    if (save.pet) signal(save,content,'action','hatch-pet');
    if (save.pet?.xp > 0) signal(save,content,'action',79019);
    if (save.equipment[24] === 24003 && save.tips.deckEditedWithBag) signal(save,content,'action',79037);
}
// CombatPetProvider.lua GetLevelInfo L749–780: XML max_level is zero-based.
export function petLevel(xp,content) {
    const levels=content.pet.levels;
    if(xp>=levels.max_exp)return levels.max_level+1;
    let total=0,level=0;
    for(let i=1;i<=levels.max_level;i++){total+=levels[`exp_level_${i}`];if(xp<total)break;level=i;}
    return level;
}
export function rewardsFor(save, content, quest) {
    const rewards = [];
    for (const group of quest.rewards) {
        const rows = group.items.filter(e => {
            const school = Number(content.items[e.id]?.stats?.[137] || 0);
            return !group.schoolFilter || !school || school === content.schools[save.school];
        });
        // Original choice count after school filtering; all included chapter choices are unambiguous.
        rewards.push(...(group.choice > 0 ? rows.slice(0, group.choice) : rows));
    }
    return rewards.map(reward => resolvePetReward(content, reward));
}
export function applyAction(save, content, action) {
    assert(!save.pendingEncounter || ['settle-encounter','retreat'].includes(action.type), '请先完成当前战斗');
    if(content.pets&&Pets.petAction(save,content,action)){save.revision++;return {changed:true};}
    const q = currentQuest(save,content);
    switch (action.type) {
    case 'checkin': claimCheckin(save, content, action.now, action.index); break;
    case 'accept': {
        assert(q && q.id === Number(action.questId) && q.startNpc === Number(action.npcId), '当前没有可接取的任务');
        if (!save.quests[q.id]) save.quests[q.id] = { accepted: true, claimed: false, progress: {} };
        syncGoals(save,content); break;
    }
    case 'talk':
        assert(content.npcs[action.npcId], '找不到这位居民');
        signal(save,content,'talk',action.npcId); break;
    case 'claim': {
        const target = content.quests.find(x => x.id === Number(action.questId));
        if (save.quests[target?.id]?.claimed) return { changed: false };
        assert(target === q && questReady(save,q) && q.endNpc === Number(action.npcId), '任务尚未完成');
        for (const r of rewardsFor(save,content,q)) {
            if (r.kind === 'pet') { for (let i = 0; i < r.count; i++) Pets.addPet(save,content,r.petId); }
            else if (r.id === 113) save.xp += r.count;
            else save.inventory[r.id] = (save.inventory[r.id] || 0) + r.count;
        }
        save.quests[q.id].claimed = true;
        if(content.pets) {
            for(const r of rewardsFor(save,content,q)) if(r.kind==='pet') {
                save.questPetConversions ??= {};
                save.questPetConversions[r.id] = (save.questPetConversions[r.id] || 0) + r.count;
            }
        }
        syncProgression(save,content);
        if (q.id === 63013) save.graduated = true;
        break;
    }
    case 'equip': {
        const item = content.items[action.itemId];
        assert(canEquip(save,item,content), equipmentBlockReason(save,item,content));
        save.equipment[item.slot] = item.id;
        save.deck = clampDeck(save.deck, { ...deckLimits(save,content), version:'kids' }).deck;
        syncGoals(save,content); break;
    }
    case 'unequip': {
        const slot = Number(action.slot);
        assert(Number.isInteger(slot) && save.equipment[slot], '这个部位没有装备');
        delete save.equipment[slot];
        save.deck = clampDeck(save.deck, { ...deckLimits(save,content), version:'kids' }).deck;
        break;
    }
    case 'upgrade': {
        const iid = Number(action.itemId), level = save.upgrades[iid] || 0;
        assert(content.items[iid] && owns(save,iid) && upgradeLevels(content,iid).length, '请选择已拥有且支持强化的装备');
        const upgrade = upgradeAt(content,iid,level+1);
        assert(upgrade, '装备已达到强化上限');
        const [currency,cost] = upgrade.cost;
        assert((save.inventory[currency] || 0) >= cost, `${content.items[currency]?.name||'强化材料'}不足`);
        save.inventory[currency] -= cost; save.upgrades[iid] = level + 1;
        // PowerAPI_client.lua L191–199: goal 79016 only follows a successful upgrade.
        signal(save,content,'action',79016); syncGoals(save,content); break;
    }
    case 'hatch':
        assert(owns(save,17307) && !save.pet, '需要一枚出奇蛋');
        save.inventory[17307]--; save.inventory[content.pet.itemId] = 1;
        save.pet = { itemId: content.pet.itemId, name: content.pet.name, xp: 0, level: 0 }; if(content.pets?.legacy_gululu)Pets.addPet(save,content,'legacy_gululu'); syncGoals(save,content); break;
    case 'feed': {
        assert(save.pet && owns(save,content.pet.foodId), '需要宠物和战宠口粮');
        assert(save.pet.xp < content.pet.levels.max_exp, '宠物已经长大了！');
        save.inventory[content.pet.foodId]--; save.pet.xp = Math.min(content.pet.levels.max_exp, save.pet.xp + content.pet.foodXp);
        save.pet.level = petLevel(save.pet.xp,content); if(save.pets?.legacy_gululu){save.pets.legacy_gululu.xp+=content.pet.foodXp;save.pets.legacy_gululu.level=Pets.petXpLevel(save.pets.legacy_gululu.xp,content);} syncGoals(save,content); break;
    }
    case 'deck-layouts': {
        const next={...save,cards:{...save.cards},equipment:{...save.equipment}};
        if(action.bagItemId!==undefined){
            const bag=content.items[action.bagItemId];
            assert(bag?.slot===24&&canEquip(save,bag,content),'卡包尚未拥有或不符合使用条件');
            next.equipment[24]=bag.id;
        }
        if(action.learnedKeys?.length)learnDeckCards(next,content,action.learnedKeys);
        validateDeckLayouts(next,content,action.layouts,action.active);
        save.cards=next.cards;
        save.equipment=next.equipment;
        save.deckLayouts=clone(action.layouts);save.activeDeckLayout=action.active;
        save.deck=clone(save.deckLayouts[action.active].deck);
        save.tips.deckEdited=true;save.tips.deckEditedWithBag=save.equipment[24]===24003;syncGoals(save,content);break;
    }
    case 'deck':
        validDeck(save,content,action.deck); save.deck = clone(action.deck); save.tips.deckEdited = true; save.tips.deckEditedWithBag = save.equipment[24] === 24003; syncGoals(save,content); break;
    case 'travel':
        assert(['camp','town'].includes(action.zone), '目的地不存在');
        assert(action.zone !== 'town' || save.graduated, '完成最后的考核后即可前往哈奇小镇');
        save.zone = action.zone; save.position = action.zone === 'town' ? {x:800,y:810} : {x:950,y:1330};
        if (action.zone === 'town') save.visitedTown = true;
        break;
    case 'retreat':
        save.pendingEncounter = null; save.position = save.zone === 'camp' ? {x:860,y:850} : {x:800,y:810}; break;
    default: throw new Error('未知操作');
    }
    migrateBagRules(save,content);
    syncDeckLayouts(save,content);
    save.revision++;
    return { changed: true, quest: currentQuest(save,content), level: save.level };
}
export function beginEncounter(save,content,encounterId) {
    assert(!save.pendingEncounter, '已有进行中的战斗');
    const encounter = content.encounters.find(e => e.id === encounterId) || specialEncounter(save,content,encounterId);
    assert(encounter && encounter.zone === save.zone, '这里没有这个敌人');
    const monster = encounter.monster || content.monsters[encounter.monsterId];
    assert(encounterId !== 'death-scout' || (save.quests[63012]?.claimed), '请先完成考核前的准备');
    validDeck(save,content,save.deck);
    const initialParty=content.pets?Pets.partySpecs(save,content,playerSpec(save,content)):null;
    if(initialParty)assert(initialParty.some(u=>u.hp>0),'伙伴们需要休息恢复生命');
    const serial = ++save.encounterSerial;
    save.pendingEncounter = { id: `${save.seed}:${serial}`, encounterId,
        seed: hashSeed(`${save.seed}:encounter:${serial}`), player: playerSpec(save,content), decisions: [] };
    if(content.pets){
        const party=initialParty;
        assert(party.some(u=>u.hp>0),'伙伴们需要休息恢复生命');
        Object.assign(save.pendingEncounter,{party,monster,petIds:save.formation.filter(Boolean),captureStock:save.inventory[Pets.CAPTURE_ID]||0,heroLevel:save.level,adventureParams:clone(Pets.petParams(content))});
    }
    save.revision++; return { encounter, monster, checkpoint: save.pendingEncounter };
}
export function recordDecision(save, decision) {
    assert(save.pendingEncounter,'没有进行中的战斗'); save.pendingEncounter.decisions.push(clone(decision)); save.revision++;
}
export function settleEncounter(save,content,battle) {
    const pending = save.pendingEncounter;
    assert(pending && battle.finished && battle.seed === pending.seed,'战斗尚未结束');
    if (save.rewardedEncounters.includes(pending.id)) { save.pendingEncounter = null; return false; }
    const encounter = content.encounters.find(e => e.id === pending.encounterId), monster = pending.monster || content.monsters[encounter.monsterId];
    if(content.pets)settleParty(save,content,battle);
    if (battle.winner === 'near') {
        save.xp += monster.xp; save.inventory[100] = (save.inventory[100] || 0) + monster.coins;
        if (monster.goalId) signal(save,content,'defeat',monster.goalId);
        // Original water-bubble loot1 = {[17114,1]=20}; draw remains on the encounter's seeded RNG.
        if (monster.id === 'water-bubble' && battle.rng.int(1,100) <= 20) save.inventory[17114] = (save.inventory[17114] || 0) + 1;
        syncProgression(save,content);
    } else save.position = save.zone === 'camp' ? {x:860,y:850} : {x:800,y:810};
    save.rewardedEncounters.push(pending.id); save.pendingEncounter = null; migrateBagRules(save,content); save.revision++; return true;
}
export function parseSave(raw,content) {
    const s = typeof raw === 'string' ? JSON.parse(raw) : clone(raw);
    if(s?.schemaVersion===1){s.schemaVersion=SAVE_VERSION;if(content.pets){Pets.initializePets(s,content);if(s.pet&&content.pets.legacy_gululu)Pets.addPet(s,content,'legacy_gululu',s.pet.xp);}}
    assert(s && s.schemaVersion === SAVE_VERSION && s.contentVersion === content.contentVersion,'存档版本不兼容');
    validateCheckin(s);
    assert(SCHOOLS.includes(s.school) && ['camp','town'].includes(s.zone),'存档角色无效');
    assert(typeof s.name === 'string' && s.name.length <= 16 && ['boy','girl'].includes(s.appearance),'存档外观无效');
    assert(Number.isSafeInteger(s.xp) && s.xp >= 0 && Number.isInteger(s.seed),'存档经验无效');
    assert(Number.isFinite(s.position?.x) && Number.isFinite(s.position?.y) && s.position.x >= 0 && s.position.x <= 1800 && s.position.y >= 0 && s.position.y <= 1600,'存档位置无效');
    for (const field of ['inventory','equipment','upgrades','cards','quests','tips']) assert(s[field] && typeof s[field] === 'object' && !Array.isArray(s[field]),'存档数据不完整');
    for (const [id,n] of Object.entries(s.inventory)) assert(content.items[id] && Number.isInteger(n) && n >= 0,'存档物品无效');
    for (const [slot,id] of Object.entries(s.equipment)) assert(content.items[id]?.slot === Number(slot) && owns(s,id),'存档装备无效');
    for (const [key,n] of Object.entries(s.cards)) assert(availableCardLessons(s,content).some(x => x.key === key) && Number.isInteger(n) && n >= 1 && n <= 3,'存档卡牌无效');
    assert(Array.isArray(s.rewardedEncounters) && Number.isInteger(s.encounterSerial) && s.encounterSerial >= 0,'存档战斗记录无效');
    assert(new Set(s.rewardedEncounters).size === s.rewardedEncounters.length && s.rewardedEncounters.every(x=>typeof x==='string'), '存档奖励记录无效');
    for(const [id,n] of Object.entries(s.upgrades))assert(content.items[id] && upgradeLevels(content,id).length && owns(s,id) && Number.isInteger(n) && n>=0 && (n===0||upgradeAt(content,id,n)),'存档强化记录无效');
    syncProgression(s,content);
    assert(s.bagRulesVersion===undefined||s.bagRulesVersion===1,'卡包规则版本无效');
    migrateBagRules(s,content);
    for(const id of Object.values(s.equipment))assert(canEquip(s,content.items[id],content),'存档装备条件无效');
    let previous = true;
    for (const q of content.quests) {
        const state = s.quests[q.id];
        if (state) {
            assert(previous && typeof state.accepted === 'boolean' && typeof state.claimed === 'boolean' && state.progress && typeof state.progress === 'object','存档任务顺序无效');
            for (const n of Object.values(state.progress)) assert(Number.isInteger(n) && n >= 0,'存档任务进度无效');
        }
        if(state?.claimed)assert(state.accepted&&questProgress(s,q).every(g=>g.value===g.count),'存档任务未达标');
        previous = !!state?.claimed;
    }
    assert(!s.graduated || s.quests[63013]?.claimed,'毕业记录无效');
    assert(s.zone !== 'town' || s.graduated,'未解锁哈奇小镇');
    if (s.pendingEncounter) {
        assert(s.pendingEncounter.id === `${s.seed}:${s.encounterSerial}` && s.pendingEncounter.seed === hashSeed(`${s.seed}:encounter:${s.encounterSerial}`),'存档战斗种子无效');
        assert(JSON.stringify(s.pendingEncounter.player) === JSON.stringify(playerSpec(s,content)), '存档战斗角色无效');
        assert((content.encounters.some(e => e.id === s.pendingEncounter.encounterId && e.zone === s.zone)||specialEncounter(s,content,s.pendingEncounter.encounterId)) && Array.isArray(s.pendingEncounter.decisions) && s.pendingEncounter.decisions.length <= 200 && Number.isInteger(s.pendingEncounter.seed),'存档战斗无效');
    }
    if (s.pet) assert(s.pet.itemId === content.pet.itemId && Number.isSafeInteger(s.pet.xp) && s.pet.xp >= 0 && s.pet.xp <= content.pet.levels.max_exp && s.pet.level === petLevel(s.pet.xp,content),'存档宠物无效');
    if(content.pets){Pets.validatePets(s,content);if(s.pendingEncounter?.party){assert(JSON.stringify(s.pendingEncounter.party)===JSON.stringify(Pets.partySpecs(s,content,playerSpec(s,content))),'存档阵容无效');const encounter=content.encounters.find(e=>e.id===s.pendingEncounter.encounterId)||specialEncounter(s,content,s.pendingEncounter.encounterId);assert(JSON.stringify(s.pendingEncounter.monster)===JSON.stringify(encounter.monster||content.monsters[encounter.monsterId]),'存档敌人无效');assert(s.pendingEncounter.captureStock===(s.inventory[Pets.CAPTURE_ID]||0)&&s.pendingEncounter.heroLevel===s.level,'存档捕获记录无效');}}
    if(s.pendingEncounter?.party){
        assert(JSON.stringify(s.pendingEncounter.petIds)===JSON.stringify(s.formation.filter(Boolean)),'存档宠物奖励阵容无效');
        if(s.pendingEncounter.adventureParams)assert(JSON.stringify(s.pendingEncounter.adventureParams)===JSON.stringify(Pets.petParams(content)),'存档养成参数无效');
    }
    syncProgression(s,content); validDeck(s,content,s.deck);
    if(s.deckLayouts!==undefined)validateDeckLayouts(s,content,s.deckLayouts,s.activeDeckLayout);
    syncDeckLayouts(s,content);
    migrateQuestPetRewards(s,content,rewardsFor);
    return s;
}

export function specialEncounter(save,content,id){
    if(!content.pets||typeof id!=='string')return null;
    const wild=id.startsWith('wild:')?content.pets[id.slice(5)]:null;
    const level=wild?Math.max(wild.unlockLevel,save.level):Number(id.slice(6));
    if(!wild&&!id.startsWith('trial:'))return null;
    assert(Number.isInteger(level)&&level>=1&&level<=save.level,'挑战等级尚未解锁');
    const school=wild?.school||save.school,p=Pets.petParams(content);
    const lessons=(wild?.lessons||content.learn[school]).filter(x=>x.level<=level);
    const pool=lessons.slice(-8).map(x=>({key:x.key,weight:10}));
    const monster={id:wild?'wild:'+wild.id:'trial:'+level,name:wild?.name||`${level}级魔法试炼`,school,level,hp:Pets.specMaxHp({school,level,stats:{}}),attributes:{ai_module:'Genes_Attacker',power_pip_percent:0,startup_pips_normal:1},pool,sequences:[],genes:[],cardsets:{},xp:p.encounterXpBase+p.encounterXpLevel*level,coins:p.encounterCoinsBase+p.encounterCoinsLevel*level};
    if(wild)Object.assign(monster,{speciesId:wild.id,unlockLevel:wild.unlockLevel});
    return {id,zone:save.zone,monster};
}
export function settleParty(save,content,battle,{retreat=false}={}){
    const pending=save.pendingEncounter,p=Pets.petParams(content);
    save.heroHp=battle.unitsById.hero.hp;
    if(battle.winner!=='near'||retreat)save.heroHp=Math.max(save.heroHp,Math.ceil(battle.unitsById.hero.maxHp*p.defeatHp));
    for(const u of battle.sides.near)if(u.speciesId&&save.pets[u.speciesId])save.pets[u.speciesId].hp=u.hp;
    save.inventory[Pets.CAPTURE_ID]=Math.max(0,(save.inventory[Pets.CAPTURE_ID]||0)-(battle.captureUsed||0));
    if(!retreat){
        for(const id of battle.captured||[])Pets.addPet(save,content,id);
        if(battle.winner==='near')for(const id of pending.petIds||[]){const pet=save.pets[id];pet.xp+=battle.monsterTemplates[0].xp;pet.level=Pets.petXpLevel(pet.xp,content);}
    }
}
