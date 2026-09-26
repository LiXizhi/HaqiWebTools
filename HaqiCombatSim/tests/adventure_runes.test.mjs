import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { installExpansion } from '../js/adventure_expansion_core.js';
import { installNpcCatalog, npcOffers, npcOfferStatus } from '../js/adventure_npc_core.js';
import { installRuneCatalog, catchChanceMilli, runeObtainLines, runeStatus } from '../js/adventure_runes_core.js';
import { createAdventure, applyAction, beginEncounter, parseSave, recordDecision, settleParty } from '../js/adventure_core.js';
import { addPet, CAPTURE_ID } from '../js/adventure_pets_core.js';
import { playPveRound, restorePveBattle, runeCardsInHand } from '../js/combat_pve_core.js';

const read = path => JSON.parse(fs.readFileSync(new URL('../data/' + path, import.meta.url)));
const catalog = read('adventure/runes.json');
const { content, dataset } = installExpansion(read('adventure/chapter.json'), read('adventure/combat.json'), read('adventure/pets.json'), read('adventure/shop-candidates.json'), read('kids/cards.json'), read('kids/charms.json'));
installNpcCatalog(content, read('adventure/npc-catalog.json'));
installRuneCatalog(content, catalog);
const merchant = content.npcCatalog.npcs.find(npc => npc.id === 30429);

function catchBattle(itemId, petId, hp) {
    const save = createAdventure(content, { seed: 22 });
    save.inventory[itemId] = 1;
    beginEncounter(save, content, 'wild:' + petId);
    if (hp !== undefined) {
        save.pendingEncounter.monster.maxHp = save.pendingEncounter.monster.hp;
        save.pendingEncounter.monster.hp = hp;
    }
    const battle = restorePveBattle(dataset, content, save.pendingEncounter);
    const rune = runeCardsInHand(battle).find(row => row.runeId === itemId);
    return { save, battle, rune };
}

test('RuneList export keeps every grid entry and the original catch weights', () => {
    assert.equal(catalog.listed, 45);
    assert.equal(catalog.runes.length, 45);
    assert.equal(new Set(catalog.runes.map(row => row.gsid)).size, 45);
    assert.ok(catalog.unlisted.length > 0);
    const weights = Object.fromEntries(catalog.runes.filter(row => row.type === 'CatchPet').map(row => [row.gsid, row.baseWeight]));
    assert.deepEqual(weights, { 23439: 2, 23440: 5, 23441: 20 });
    const source = fs.readFileSync(new URL('../../../config/Aries/Cards/RuneList.xml', import.meta.url));
    assert.equal(catalog.sources['config/Aries/Cards/RuneList.xml'], createHash('sha256').update(source).digest('hex'));
    assert.match(runeObtainLines(content, 23439).join('；'), /哈奇岛·安卓婆婆，10仙豆/);
    assert.match(runeObtainLines(content, 23441).join('；'), /原服兑换未开放/);
    assert.equal(runeStatus(content.items[23439], content, dataset).catch, true);
});

test('kids catch chance follows base weight, remaining health and the force percent', () => {
    assert.equal(catchChanceMilli(2, 50, 100, 10, 10), 1000);
    assert.equal(catchChanceMilli(2, 100, 100, 10, 18), -100);
    assert.equal(catchChanceMilli(2, 0, 100, 8, 8), 2000);
    assert.equal(catchChanceMilli(2, 10, 100, 1, 1, 50), 500);
});

test('a wounded wild pet is caught by the top rune and the cast is replayed', () => {
    const { save, battle, rune } = catchBattle(23441, 'dragon_purple', 1);
    const decision = { ...rune, targetId: 'mob0' };
    playPveRound(battle, decision);
    recordDecision(save, decision, battle);
    assert.equal(save.inventory[23441], 1);
    assert.deepEqual(battle.captured, ['dragon_purple']);
    assert.equal(battle.unitsById.mob0.hp, 0);
    const restored = restorePveBattle(dataset, content, save.pendingEncounter);
    assert.deepEqual(restored.events, battle.events);
    assert.equal(restored.runeUsed[23441], 1);
});

test('a full-health general rune is still consumed when the pet escapes', () => {
    const { save, battle, rune } = catchBattle(23439, 'dragon_purple');
    save.pendingEncounter.monster.attributes.catch_pet_force_chance_percent = -1;
    const forced = restorePveBattle(dataset, content, save.pendingEncounter);
    const decision = { ...rune, targetId: 'mob0' };
    playPveRound(forced, decision);
    recordDecision(save, decision, forced);
    assert.equal(save.inventory[23439], 1);
    assert.deepEqual(forced.captured, []);
    assert.ok(forced.unitsById.mob0.hp > 0);
    assert.equal(forced.events.some(event => event.type === 'capture' && event.success === false && event.runeId === 23439), true);
});

test('an owned pet or a normal monster rejects the catch rune before it is consumed', () => {
    const owned = createAdventure(content, { seed: 22 });
    owned.inventory[23439] = 1;
    beginEncounter(owned, content, 'wild:dragon_green');
    const ownedBattle = restorePveBattle(dataset, content, owned.pendingEncounter);
    const ownedRune = runeCardsInHand(ownedBattle).find(row => row.runeId === 23439);
    assert.throws(() => playPveRound(ownedBattle, { ...ownedRune, targetId: 'mob0' }), /目标/);
    assert.equal(owned.inventory[23439], 1);

    const scout = createAdventure(content, { seed: 22 });
    scout.inventory[23439] = 1;
    beginEncounter(scout, content, 'ice-scout');
    const scoutBattle = restorePveBattle(dataset, content, scout.pendingEncounter);
    const scoutRune = runeCardsInHand(scoutBattle).find(row => row.runeId === 23439);
    assert.throws(() => playPveRound(scoutBattle, { ...scoutRune, targetId: 'mob0' }), /目标/);
    assert.equal(scout.inventory[23439], 1);
});

test('安卓婆婆 sells the priced catch runes and leaves the unpriced top rune closed', () => {
    const save = createAdventure(content, { seed: 22 });
    save.zone = merchant.zone;
    save.inventory[17213] = 10;
    const general = npcOffers(content, merchant).find(row => row.itemId === 23439);
    const top = npcOffers(content, merchant).find(row => row.itemId === 23441);
    assert.equal(npcOfferStatus(save, content, general).allowed, true);
    assert.equal(npcOfferStatus(save, content, top).allowed, false);
    applyAction(save, content, { type: 'npc-purchase', npcInstanceId: merchant.instanceId, offerId: general.id });
    assert.equal(save.inventory[17213], 0);
    assert.equal(save.inventory[23439], 1);
    assert.equal(parseSave(JSON.stringify(save), content).inventory[23439], 1);
});

test('unused capture crystals become general catch runes and the shop stops selling them', () => {
    const save = createAdventure(content, { seed: 22 });
    save.inventory[CAPTURE_ID] = 4;
    save.inventory[23439] = 1;
    const loaded = parseSave(save, content);
    assert.equal(loaded.inventory[CAPTURE_ID], undefined);
    assert.equal(loaded.inventory[23439], 5);
    const crystal = content.shop.find(row => row.itemId === CAPTURE_ID);
    assert.equal(crystal.retired, true);
    loaded.inventory[100] = 1000;
    assert.throws(() => applyAction(loaded, content, { type: 'buy', productId: crystal.id }), /抓宠符文/);
    assert.equal(loaded.inventory[CAPTURE_ID], undefined);
});

test('an in-progress crystal battle keeps its stock, then leftover crystals become runes', () => {
    const save = createAdventure(content, { seed: 22 });
    save.inventory[CAPTURE_ID] = 2;
    beginEncounter(save, content, 'wild:dragon_purple');
    const battle = restorePveBattle(dataset, content, save.pendingEncounter);
    const decision = { capture: true, targetId: 'mob0' };
    playPveRound(battle, decision);
    recordDecision(save, decision, battle);
    const mid = parseSave(save, content);
    assert.equal(mid.inventory[CAPTURE_ID], 2);
    assert.equal(mid.pendingEncounter.captureStock, 2);
    settleParty(mid, content, battle, { retreat: true });
    assert.equal(mid.inventory[CAPTURE_ID], undefined);
    assert.equal(mid.inventory[23439], 1);
});

test('a catch rune is cast before companions even when the hero stands in the fourth slot', () => {
    const save = createAdventure(content, { seed: 22, starter: null });
    const ids = Object.keys(content.pets).filter(id => id !== 'dragon_green').slice(0, 4);
    for (const id of ids) addPet(save, content, id);
    save.formation = ids;
    save.heroSlot = 3;
    save.inventory[23439] = 1;
    beginEncounter(save, content, 'wild:dragon_green');
    const battle = restorePveBattle(dataset, content, save.pendingEncounter);
    const rune = runeCardsInHand(battle).find(row => row.runeId === 23439);
    playPveRound(battle, { ...rune, targetId: 'mob0' });
    const capture = battle.events.findIndex(event => event.type === 'capture');
    const ally = battle.events.findIndex(event => event.type === 'cast' && event.caster !== 'hero' && event.caster !== 'mob0');
    assert.ok(capture >= 0 && (ally < 0 || capture < ally));
});
