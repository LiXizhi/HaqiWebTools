import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installExpansion } from '../js/adventure_expansion_core.js';
import { installNpcCatalog, npcOffers, npcOfferStatus } from '../js/adventure_npc_core.js';
import { installMountCatalog, validateMountCatalog, resolveMountDrawPose, mountIconCrop } from '../js/adventure_mounts_core.js';
import { projectRuntimeData } from '../scripts/package_runtime_data.mjs';
import { applyAction, createAdventure, parseSave, playerSpec } from '../js/adventure_core.js';
import { productPrice } from '../js/adventure_pets_core.js';

const read = path => JSON.parse(fs.readFileSync(new URL('../data/' + path, import.meta.url)));
const catalog = read('adventure/mount-catalog.json');
const { content: base } = installExpansion(read('adventure/chapter.json'), read('adventure/combat.json'), read('adventure/pets.json'), read('adventure/shop-candidates.json'), read('kids/cards.json'), read('kids/charms.json'));
installNpcCatalog(base, read('adventure/npc-catalog.json'));
const vip = { keepworkVip: true, expiresAt: '2099-01-01T00:00:00.000Z', now: Date.parse('2026-09-25T00:00:00.000Z') };

function contentFrom(source) {
    const content = structuredClone(base);
    installMountCatalog(content, source);
    return content;
}

test('mount item icons crop the right-facing side cell, never the front', () => {
    const content = contentFrom(catalog);
    const samples = [
        content.mountByItem[16051], // 冲锋大象 — right cell 1
        content.mountByItem[16071], // 霸王虎 — right cell 1
        content.mountByItem[16141], // 黄金猛犸 — right cell 2 (atlas cellOrder differs)
    ];
    for (const row of samples) {
        const mount = catalog.mounts.find(entry => entry.id === row.mountId);
        const item = content.items[row.itemId];
        assert.equal(item.art.id, `mount:${mount.id}`);
        assert.deepEqual(item.art.crop, mountIconCrop(mount));
        assert.notDeepEqual(item.art.crop, [0, 0, mount.art.width / 2, mount.art.height / 2]);
        assert.equal(item.art.crop[0] !== 0 || item.art.crop[1] !== 0, true);
    }
});

test('packaged mount catalog drops lab fields and keeps pose, art and stats', () => {
    const packed = projectRuntimeData('adventure/mount-catalog.json', catalog);
    validateMountCatalog(packed);
    const tiger = packed.mounts.find(mount => mount.commerce?.[16071]);
    assert.equal(tiger.description, undefined);
    assert.equal(tiger.source.model, undefined);
    assert.equal(tiger.source.items.includes(16071), true);
    assert.ok(tiger.art.cdn.startsWith('https://cdn.keepwork.com/'));
    assert.ok(tiger.stats[101] > 0 && tiger.stats[111] > 0 && tiger.stats[119] > 0);
    assert.equal(tiger.commerce[16071].modou, 300);
    assert.equal(tiger.commerce[16071].qidou, 0);
    const pose = resolveMountDrawPose(tiger, 2, { size: 180, gender: 'female' });
    assert.ok(pose.rider.w > 0 && pose.rider.w <= 180);
    assert.deepEqual(tiger.layoutBounds, catalog.mounts.find(m => m.id === tiger.id).layoutBounds);
    assert.deepEqual(pose, resolveMountDrawPose(catalog.mounts.find(m => m.id === tiger.id), 2, {size: 180, gender: 'female'}));
    assert.ok(pose.rider.w > 0);
    assert.equal(packed.mounts.filter(mount => mount.id === 'dragon').length, 1);
    assert.equal(packed.mounts.find(mount => mount.id === 'dragon').rideable, false);
});

test('tiger npc sale spends 300 modou and timed or free mounts stay blocked', () => {
    const content = contentFrom(catalog);
    const resident = content.npcCatalog.npcs.find(npc => npc.id === 36219);
    const offer = npcOffers(content, resident).find(row => row.itemId === 16071);
    const save = createAdventure(content);
    save.zone = resident.zone;
    save.inventory[984] = 299;
    assert.equal(npcOfferStatus(save, content, offer, vip).allowed, false);
    save.inventory[984] = 300;
    assert.equal(npcOfferStatus(save, content, offer).allowed, false);
    assert.match(npcOfferStatus(save, content, offer).reason, /会员/);
    assert.equal(npcOfferStatus(save, content, offer, vip).allowed, true);
    applyAction(save, content, { type: 'npc-purchase', npcInstanceId: resident.instanceId, offerId: offer.id }, vip);
    assert.equal(save.inventory[984], 0);
    assert.equal(save.inventory[16071], 1);
    const blocked = npcOffers(content, resident).filter(row => content.mountByItem?.[row.itemId] && !content.mountByItem[row.itemId].modou && !content.mountByItem[row.itemId].qidou);
    for (const row of blocked) assert.equal(npcOfferStatus(save, content, row, vip).allowed, false);
    const timed = Object.values(content.mountByItem).find(row => row.expireTime || row.expireType);
    if (timed) assert.equal(content.shop.some(product => product.itemId === timed.itemId), false);
    assert.match(content.mountByItem[16106].name, /7天/);
    assert.equal(content.shop.some(product => product.itemId === 16106), false);
    const week = npcOffers(content, resident).find(row => row.itemId === 16106);
    save.inventory[984] = 80;
    const weekStatus = npcOfferStatus(save, content, week, vip);
    assert.equal(weekStatus.allowed, true);
    assert.equal(weekStatus.price, '80魔豆');
    applyAction(save, content, { type: 'npc-purchase', npcInstanceId: resident.instanceId, offerId: week.id }, vip);
    assert.equal(save.inventory[16106], 1);
    assert.equal(save.inventory[984], 0);
});

test('mall sells one priced mount and riding adds combat stats without equipment', () => {
    const content = contentFrom(catalog);
    const product = content.shop.find(item => item.kind === 'mount' && item.itemId === 16071);
    assert.equal(productPrice(product, content), 300);
    assert.equal(product.currency, 984);
    const save = createAdventure(content);
    save.level = 50;
    save.inventory[984] = 300;
    assert.throws(() => applyAction(save, content, { type: 'buy', productId: product.id }));
    applyAction(save, content, { type: 'buy', productId: product.id }, vip);
    assert.equal(save.inventory[16071], 1);
    assert.equal(save.inventory[984], 0);
    const before = playerSpec(save, content);
    applyAction(save, content, { type: 'ride', itemId: 16071 });
    const after = playerSpec(save, content);
    assert.equal(save.equipment[16071], undefined);
    assert.ok(after.stats.hpFlat > before.stats.hpFlat);
    assert.ok(after.stats.damagePct.all > (before.stats.damagePct.all || 0));
    save.pendingEncounter = { id: 'pending' };
    assert.throws(() => applyAction(save, content, { type: 'dismount' }), /战斗/);
    delete save.pendingEncounter;
    applyAction(save, content, { type: 'dismount' });
    assert.equal(save.mountId, null);
    assert.equal(playerSpec(save, content).stats.hpFlat, before.stats.hpFlat);
    assert.equal(parseSave(JSON.stringify({ ...save, mountId: 16071, inventory: { ...save.inventory, 16071: 1 } }), content).mountId, 16071);
});

test('mall lists zodiac and other permanent unpriced mounts without mistaking 霸天龙 for timed SKUs', () => {
    const content = contentFrom(catalog);
    const mounts = content.shop.filter(item => item.kind === 'mount');
    const byId = Object.fromEntries(mounts.map(item => [item.itemId, item]));
    const zodiac = [16033, 16034, 16035, 16036, 16037, 16038, 16039, 16040, 16041, 16042, 16043, 16044];
    assert.equal(zodiac.every(id => byId[id]), true);
    assert.equal(byId[16033].name, '鼠');
    assert.equal(byId[16033].price, 100);
    assert.equal(byId[16033].currency, 984);
    assert.equal(byId[16128]?.name, '红玉霸天龙');
    assert.equal(byId[16128].price, 999999);
    assert.equal(byId[16130]?.name, '黄铜啸天龙');
    assert.equal(content.shop.some(item => item.kind === 'mount' && (item.itemId === 16106 || /[（(]\d+天[）)]/.test(item.name || ''))), false);
    assert.ok(mounts.length >= 60);
    const save = createAdventure(content);
    save.level = 1;
    save.inventory[984] = 100;
    applyAction(save, content, { type: 'buy', productId: byId[16033].id });
    assert.equal(save.inventory[16033], 1);
    assert.equal(save.inventory[984], 0);
});
