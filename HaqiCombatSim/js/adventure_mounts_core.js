// Rideable mounts. Pose math matches demos/mount-lab/mount_core.js.
// Prices: paraworld.globalstore.lua o[3] count = 魔豆, o[8] ebuyprice = 奇豆.
import { statIdToEntry } from './combat_unit_core.js';
import { mountLayout } from './mount_layout_core.js';

export const MOUNT_DIRECTIONS = ['down', 'left', 'right', 'up'];
const FACING = ['down', 'left', 'right', 'up'];

function finite(value, name) {
    if (!Number.isFinite(value)) throw new Error(`${name} 必须是有限数值`);
}
export function validateMountCatalog(catalog) {
    if (catalog?.version !== 1 || !Array.isArray(catalog.mounts) || !catalog.mounts.length) throw new Error('坐骑配置版本或列表无效');
    const ids = new Set();
    for (const key of ['rider', 'standing', 'female-rider', 'female-standing']) if (!catalog.sheets?.[key]?.cdn) throw new Error(`坐骑缺少角色图集 ${key}`);
    for (const mount of catalog.mounts) {
        if (!mount.id || ids.has(mount.id)) throw new Error('坐骑编号重复或缺失');
        ids.add(mount.id);
        for (const key of ['ground', 'lift', 'bob']) finite(Number(mount[key]), key);
        if (mount.rideable) {
            if (!mount.art?.cdn || !(mount.art.width > 0) || !(mount.art.height > 0)) throw new Error(`坐骑 ${mount.id} 缺少图集`);
            if (!mount.stats || !Object.entries(mount.stats).every(([id, value]) => statIdToEntry(id) && Number.isFinite(Number(value)))) throw new Error(`坐骑 ${mount.id} 的战斗属性无效`);
            if (!Object.keys(mount.commerce || {}).length) throw new Error(`坐骑 ${mount.id} 缺少物品`);
        }
        for (const direction of MOUNT_DIRECTIONS) {
            const pose = mount.directions?.[direction];
            if (!pose) throw new Error(`${mount.id} 缺少 ${direction}`);
            for (const key of ['seat', 'anchor']) {
                if (!Array.isArray(pose[key]) || pose[key].length !== 2) throw new Error(`${mount.id} 的 ${key} 需要二维坐标`);
                pose[key].forEach(value => finite(Number(value), key));
            }
            finite(Number(pose.scale), 'scale');
            if (!(pose.scale > 0 && pose.scale <= 2)) throw new Error(`${mount.id} 的角色缩放超出范围`);
            if (!Number.isInteger(pose.cell) || pose.cell < 0 || pose.cell > 3) throw new Error(`${mount.id} 的图集格号无效`);
        }
    }
    return catalog;
}
export function resolveMountDrawPose(mount, facing, { size = 78, time = 0, moving = false, gender = 'male' } = {}) {
    const direction = FACING[Number(facing)] || 'down';
    if (!MOUNT_DIRECTIONS.includes(direction)) throw new Error('朝向无效');
    if (!['male', 'female'].includes(gender)) throw new Error('角色类型无效');
    finite(size, 'size');
    const source = mount.directions[direction];
    const pose = { ...source, ...source.characters?.[gender] };
    const bob = Math.sin(time * (moving ? 9 : 2)) * (moving ? mount.bob : mount.bob * .25);
    const layout = mountLayout(mount, pose, size, bob, {gender});
    return {
        mount: { art: mount.id, cell: pose.cell, ...layout.mount },
        rider: { art: (gender === 'female' ? 'female-' : '') + (pose.riderArt || 'rider'), cell: pose.riderCell ?? pose.cell, ...layout.rider },
        foreground: pose.foreground || [],
    };
}
export function mountShopPrice(row) {
    // expiretime/expiretype are globalstore template t[27]/t[30]. Names like “（7天）” still have a real 魔豆 price.
    if (!row || row.expireTime || row.expireType) return null;
    if (row.qidou > 0) return { currency: 100, amount: row.qidou };
    if (row.modou > 0) return { currency: 984, amount: row.modou };
    return null;
}
export function installMountCatalog(content, catalog) {
    validateMountCatalog(catalog);
    content.mountCatalog = catalog;
    content.mountByItem = {};
    for (const mount of catalog.mounts) {
        if (!mount.rideable) continue;
        let listed = false;
        for (const [id, row] of Object.entries(mount.commerce || {})) {
            if (!((row.kind === 2 && row.subtype === 6) || (row.kind === 10 && row.subtype === 1))) continue;
            const itemId = Number(id);
            content.items[itemId] ??= { id: itemId, name: row.name, description: '', stats: {}, slot: 0, kind: row.kind, subtype: row.subtype };
            const item = content.items[itemId];
            item.mountId = mount.id;
            if (mount.art?.cdn) item.art = { id: `mount:${mount.id}`, crop: [0, 0, mount.art.width / (mount.art.columns || 2), mount.art.height / (mount.art.rows || 2)] };
            content.mountByItem[itemId] = { ...row, itemId, mountId: mount.id, stats: mount.stats, art: mount.art };
            const price = mountShopPrice(row);
            // The mall lists one long-term item per mount. NPC shops still sell the 7-day row at its own price.
            if (listed || !price || /天/.test(row.name || '')) continue;
            listed = true;
            content.shop?.push({ id: `mount:${itemId}`, kind: 'mount', itemId, name: row.name || mount.name, level: 1, vipOnly: row.vip === true, currency: price.currency, price: price.amount, school: 'all' });
        }
    }
    return content;
}
export function mountDirectSale(content, offer) {
    if (offer?.kind !== 'shop' || Number(offer.exchangeId)) return null;
    if (offer.npcId <= 0 || offer.platform || offer.timeRange || offer.dailyLimit >= 0) return null;
    const row = content.mountByItem?.[offer.itemId];
    const price = mountShopPrice(row);
    return row && price ? { row, price } : null;
}
export function applyMountStats(stats, save, content) {
    const row = content.mountByItem?.[save.mountId];
    if (!row) return;
    for (const [id, value] of Object.entries(row.stats || {})) {
        const entry = statIdToEntry(id);
        if (!entry) continue;
        if (typeof stats[entry.stat] === 'object') stats[entry.stat][entry.school] = (stats[entry.stat][entry.school] || 0) + Number(value);
        else stats[entry.stat] = (stats[entry.stat] || 0) + Number(value);
    }
}
