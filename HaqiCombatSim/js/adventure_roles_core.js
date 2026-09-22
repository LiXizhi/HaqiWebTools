// Account-owned role catalog; clocks, identifiers and persistence are supplied by IO.
import { checkedProgress } from './adventure_cloud_core.js';
import { validateMagicBeanExchange } from './adventure_magic_bean_exchange_core.js';

export const MAX_ROLES = 5;
export const roleIdValid = id => typeof id === 'string' && /^[a-f0-9-]{16,64}$/.test(id);
export function emptyRoles() { return { schemaVersion: 1, activeId: null, roles: [] }; }
export function validateRoles(value, content, dataset) {
    if (!value || value.schemaVersion !== 1 || !Array.isArray(value.roles) || value.roles.length > MAX_ROLES) throw Error('角色列表版本或数量无效');
    const ids = new Set();
    const roles = value.roles.map(row => {
        if (!roleIdValid(row.id) || ids.has(row.id) || !Number.isFinite(row.lastPlayedAt) || row.lastPlayedAt < 0) throw Error('角色记录无效');
        ids.add(row.id);
        return { id: row.id, lastPlayedAt: row.lastPlayedAt, save: checkedProgress(row.save, content, dataset).save };
    });
    if (value.activeId !== null && !ids.has(value.activeId)) throw Error('最近使用的角色不存在');
    const magicBeanExchange = validateMagicBeanExchange(value.magicBeanExchange);
    return { schemaVersion: 1, activeId: value.activeId, roles, ...(magicBeanExchange ? { magicBeanExchange } : {}) };
}
export function grantMagicBeans(catalog, roleId, nextSave, exchangedUntil) {
    const magicBeanExchange = validateMagicBeanExchange({ exchangedUntil });
    const previous = validateMagicBeanExchange(catalog.magicBeanExchange);
    if (!catalog.roles.some(row => row.id === roleId)) throw Error('角色不存在');
    if (previous && magicBeanExchange.exchangedUntil <= previous.exchangedUntil) throw Error('兑换日期不能早于上次记录');
    return {
        ...catalog,
        magicBeanExchange,
        roles: catalog.roles.map(row => row.id === roleId ? { ...row, save: nextSave } : row),
    };
}
export function addRole(catalog, id, save, now) {
    if (catalog.roles.length >= MAX_ROLES) throw Error('最多可创建5个主角，当前名额已满。');
    if (!roleIdValid(id) || catalog.roles.some(row => row.id === id)) throw Error('角色编号无效或重复');
    return { ...catalog, activeId: id, roles: [...catalog.roles, { id, save, lastPlayedAt: now }] };
}
export function selectRole(catalog, id, now) {
    if (!catalog.roles.some(row => row.id === id)) throw Error('角色不存在');
    return { ...catalog, activeId: id, roles: catalog.roles.map(row => row.id === id ? { ...row, lastPlayedAt: now } : row) };
}
