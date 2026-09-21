import {createAdventure, syncProgression, canEquip, deckLimits, recommendedDeck, parseSave, availableCardLessons} from './adventure_core.js';
import {syncEquipmentInstances} from './adventure_equipment_instances_core.js';
import {upgradeAt} from './adventure_upgrade_core.js';
import {isSupportedType} from './combat_cards_core.js';

// CombatInventorySubPage.lua L44: equipment inventory 1; Item_CombatApparel.lua
// L159: worn items use bag 0 and position. CombatCardDeckSubPage.lua L290,
// L1084, L1502–1505: worn deck at (0,24), learned cards 24, runes 25.
export const ORIGINAL_IMPORT_BAGS = Object.freeze([0, 1, 24, 25]);
const positive = value => Number.isSafeInteger(value) && value > 0;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function serverData(raw) {
    if (raw === undefined || raw === null || raw === '') return {};
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!record(value)) throw Error('invalid');
    return value;
}
// CombatCardDeckSubPage.lua L160–174/L222: clientdata is a flat Lua array
// of GSIDs, one entry per card copy. Never evaluate Lua or JavaScript.
function deckIds(raw) {
    if (Array.isArray(raw)) return raw.every(positive) ? raw : null;
    if (typeof raw !== 'string' || raw.length > 100000) return null;
    const text = raw.trim();
    if (!/^\{\s*(?:\d+\s*(?:,\s*\d+\s*)*,?\s*)?\}$/.test(text)) return null;
    const ids = text.slice(1, -1).split(',').map(x => x.trim()).filter(Boolean).map(Number);
    return ids.every(positive) ? ids : null;
}

export function prepareOriginalImport(snapshot, content, dataset) {
    if (!record(snapshot) || !Array.isArray(snapshot.inventory) || snapshot.inventory.length > 100 ||
        !Object.hasOwn(content.learn, snapshot.school) || !positive(snapshot.level)) throw Error('原服角色资料无效，未创建角色。');
    const warnings = [], warn = message => warnings.push(message);
    const save = createAdventure(content, {name:snapshot.name, school:snapshot.school});
    const level = Math.min(snapshot.level, content.progression.levelCap);
    // Web adventure experience curves differ: preserve level, not unverified raw XP.
    save.xp = content.progression.xpThresholds[level - 1];
    syncProgression(save, content);
    warn('新角色使用网页冒险经验曲线；任务、货币、VIP、图腾、原服宠物与其他成长数据不导入。');
    if (level !== snapshot.level) warn('原服等级超过网页上限，已按网页等级上限创建。');
    const lessons = new Map(availableCardLessons(save,content).map(row => [row.key,row]));
    const supportedCard = id => {
        const key = content.cardItems[id], card = dataset.cards[key];
        return key && lessons.has(key) && lessons.get(key).supported !== false && card && isSupportedType(card.type) ? key : null;
    };
    const seen = new Set(), seenBags = new Set(), cardIds = new Set();
    let equippedBag = null, equipment = 0, cards = 0, runes = 0, skipped = 0;
    for (const bag of snapshot.inventory) {
        if (!ORIGINAL_IMPORT_BAGS.includes(bag?.bag)) { warn('已忽略装备与卡牌范围外的背包。'); continue; }
        if (seenBags.has(bag.bag) || !Array.isArray(bag.items) || bag.items.length > 10000) throw Error('原服背包数据无效。');
        seenBags.add(bag.bag);
        for (const row of bag.items) {
            const reject = reason => { skipped++; warn(`背包 ${bag.bag}：${reason}`); };
            if (!record(row) || !positive(row.guid) || row.guid >= Number.MAX_SAFE_INTEGER || !positive(row.gsid) || !positive(row.copies)) { reject('物品实例或数量无效，已跳过。'); continue; }
            if (seen.has(row.guid)) { reject('重复实例，已跳过。'); continue; }
            seen.add(row.guid);
            const item = content.items[row.gsid];
            if (bag.bag === 24) {
                const key = supportedCard(row.gsid);
                if (!key) { reject(`卡牌 ${row.gsid} 未知或效果未支持。`); continue; }
                cardIds.add(row.gsid); save.cards[key] = Math.max(save.cards[key] || 0, Math.min(3,row.copies)); cards++; continue;
            }
            if (bag.bag === 25) {
                if (item?.kind !== 18 || item.subtype !== 2 || !supportedCard(row.gsid - 1000)) { reject(`符文 ${row.gsid} 未知或效果未支持。`); continue; }
                const count = (save.inventory[row.gsid] || 0) + row.copies;
                if (!Number.isSafeInteger(count)) { reject('符文数量超出范围。'); continue; }
                save.inventory[row.gsid] = count; runes += row.copies; continue;
            }
            if (!item || !(item.kind === 1 || item.slot === 24) || !positive(item.slot)) { reject(`物品 ${row.gsid} 不属于已支持装备。`); continue; }
            if (row.copies !== 1) { reject(`装备 ${row.gsid} 的实例数量无法核实。`); continue; }
            let data;
            try { data = serverData(row.serverdata); } catch { reject(`装备 ${row.gsid} 的强化数据格式无效。`); continue; }
            const n = data.addlel ?? 0;
            if (!Number.isInteger(n) || n < 0 || (n > 0 && !upgradeAt(content,row.gsid,n))) { reject(`装备 ${row.gsid} 的强化等级未支持。`); continue; }
            const serverdata = {addlel:n};
            if (data.gem !== undefined) {
                const gem = data.gem;
                const types = Array.isArray(gem?.ins) ? gem.ins.map(id => content.gemCatalog?.items[id]?.stats[42]) : [];
                const known = record(gem) && Array.isArray(gem.ins) && Number.isSafeInteger(gem.holecnt) && gem.holecnt >= 0 &&
                    gem.ins.every(id => positive(id) && content.items[id] && content.gemCatalog?.items[id]) &&
                    gem.ins.length <= Number(item.stats[36] || 0) && types.every(Boolean) && new Set(types).size === types.length;
                if (!known) { reject(`装备 ${row.gsid} 的镶嵌数据未支持，整件跳过以免丢失宝石属性。`); continue; }
                serverdata.gem = {holecnt:gem.holecnt,ins:[...gem.ins]};
            }
            if (Object.keys(data).some(key => !['addlel','gem'].includes(key))) warn(`装备 ${row.gsid} 的其他服务端字段未导入。`);
            if (item.unsupportedStats?.length) warn(`装备 ${row.gsid} 含网页尚未实现的属性。`);
            // Existing save schema requires equipment-N; N retains the original numeric GUID.
            const guid = `equipment-${row.guid}`;
            save.inventory[row.gsid] = (save.inventory[row.gsid] || 0) + 1;
            save.equipmentInstances.push({guid,gsid:row.gsid,serverdata});
            save.nextEquipmentGuid = Math.max(save.nextEquipmentGuid,row.guid + 1); equipment++;
            if (bag.bag === 0) {
                if (row.position !== item.slot || save.equipment[item.slot] || !canEquip(save,item,content)) warn(`装备 ${row.gsid} 的穿戴位置或条件不符，已保留在背包。`);
                else {
                    save.equipment[item.slot] = item.id; save.equipmentGuids[item.slot] = guid;
                    if (item.slot === 24) equippedBag = row;
                }
            }
        }
    }
    syncEquipmentInstances(save,content);
    const deck = [], limits = deckLimits(save,content);
    let total = 0;
    const ids = equippedBag ? deckIds(equippedBag.clientdata) : null;
    if (ids) for (const id of ids) {
        const key = supportedCard(id);
        if (!key || !cardIds.has(id)) { warn(`原卡组中的 ${id} 不在已核实的已学卡牌内，已跳过。`); continue; }
        let entry = deck.find(row => row.key === key);
        const max = content.cardLibrary ? limits.eachCapacity : Math.min(limits.eachCapacity,save.cards[key]);
        if (total >= limits.capacity || (entry?.count || 0) >= max) { warn('原卡组超过网页卡包容量，已裁剪。'); continue; }
        if (!entry) { entry = {key,count:0}; deck.push(entry); }
        entry.count++; total++;
    }
    if (equippedBag && !ids) warn('原卡组格式暂未支持。');
    if (!deck.length) warn('未找到可核验且可用的原卡组，已使用网页推荐卡组。');
    save.deck = deck.length ? deck : recommendedDeck(save,content);
    save.deckLayouts = [{name:'卡包一',deck:structuredClone(save.deck)}]; save.activeDeckLayout = 0;
    warn('网页按等级自动开放的本系技能与初始宠物仍保留，不代表原服已获得。');
    const validated = parseSave(save,content);
    return {save:validated,warnings:[...new Set(warnings)],summary:{name:validated.name,school:validated.school,level:validated.level,equipment,cards,runes,deckCards:validated.deck.reduce((n,row)=>n+row.count,0),skipped}};
}
