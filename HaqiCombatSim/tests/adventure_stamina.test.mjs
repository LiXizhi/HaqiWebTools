import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installDungeons, enterDungeon } from '../js/adventure_dungeons_core.js';
import * as A from '../js/adventure_core.js';
import * as P from '../js/combat_pve_core.js';
import {
    applyCombatStamina, encounterStaminaCost, ensureDailyStamina, localDayKey, parseArenaStaminaCost, dungeonStaminaHint,
} from '../js/adventure_stamina_core.js';

const read = p => JSON.parse(fs.readFileSync(new URL('../data/' + p + '.json', import.meta.url)));
const content = read('adventure/chapter');
const dataset = read('adventure/combat');
const catalog = read('adventure/dungeons');
content.fishing = read('adventure/fishing');
content.worldMaps = Object.fromEntries(Object.entries(content.worldMapIndex.islands).map(([id, row]) => [id, JSON.parse(fs.readFileSync(new URL('../' + row.file, import.meta.url)))]));
installDungeons(content, dataset, catalog, read('kids/cards'));

const heroId = 'dungeon:HaqiTown_FireCavern_Hero';
const freeId = 'dungeon:HaqiTown_FireCavern';
const costlyId = 'dungeon:DarkForestIsland_MarshNest';

test('exported arenas keep original stamina_cost on playable encounters', () => {
    const hero = content.dungeons.find(d => d.id === heroId);
    assert.ok(hero?.playable);
    const costly = hero.arenas.filter(a => a.staminaCost > 0);
    assert.ok(costly.length >= 1);
    assert.equal(costly.at(-1).staminaCost, 25);
    const encounter = content.encounters.find(e => e.id === costly.at(-1).id);
    assert.equal(encounter.staminaCost, 25);
    assert.equal(encounterStaminaCost(content, encounter.id), 25);
    assert.deepEqual(dungeonStaminaHint(hero), { max: 25, min: 25, arenas: costly.length });
    assert.equal(dungeonStaminaHint(content.dungeons.find(d => d.id === freeId)), null);
});

test('applyCombatStamina matches kids gate: stamina<=0 skips loot; otherwise deduct full cost', () => {
    const save = A.createAdventure(content);
    save.stamina = 100;
    save.staminaRefillDay = localDayKey(1_700_000_000_000);
    assert.deepEqual(applyCombatStamina(save, content, 25, 1_700_000_000_000), { rewarded: true, insufficient: false, cost: 25, stamina: 75 });
    assert.equal(save.stamina, 75);
    save.stamina = 0;
    assert.deepEqual(applyCombatStamina(save, content, 25, 1_700_000_000_000), { rewarded: false, insufficient: true, cost: 0, stamina: 0 });
    save.stamina = 5;
    assert.deepEqual(applyCombatStamina(save, content, 25, 1_700_000_000_000), { rewarded: true, insufficient: false, cost: 25, stamina: 0 });
    assert.deepEqual(applyCombatStamina(save, content, 0, 1_700_000_000_000), { rewarded: true, insufficient: false, cost: 0, stamina: 0 });
});

test('local calendar day refills shared stamina to max', () => {
    const save = A.createAdventure(content);
    save.stamina = 10;
    save.staminaRefillDay = '2020-01-01';
    assert.equal(ensureDailyStamina(save, content, Date.parse('2026-09-27T12:00:00+08:00')), 100);
    assert.equal(save.staminaRefillDay, localDayKey(Date.parse('2026-09-27T12:00:00+08:00')));
    save.stamina = 40;
    assert.equal(ensureDailyStamina(save, content, Date.parse('2026-09-27T18:00:00+08:00')), 40);
});

test('zero-cost dungeon still grants xp/coins; costly arena denies loot when exhausted', () => {
    const free = content.encounters.find(e => e.zone === freeId && !e.blocked?.length);
    assert.equal(encounterStaminaCost(content, free.id), 0);
    const save = A.createAdventure(content);
    enterDungeon(save, content, freeId);
    A.beginEncounter(save, content, free.id);
    const battle = P.restorePveBattle(dataset, content, save.pendingEncounter);
    battle.finished = true; battle.winner = 'near';
    const beforeXp = save.xp, beforeCoins = save.inventory[100] || 0;
    const result = A.settleEncounter(save, content, battle);
    assert.equal(result.insufficientStamina, false);
    assert.ok(save.xp > beforeXp);
    assert.ok((save.inventory[100] || 0) > beforeCoins);

    const dungeon = content.dungeons.find(d => d.id === costlyId);
    const costly = dungeon.arenas.find(a => a.staminaCost > 0 && !a.blocked.length);
    assert.ok(costly, 'need a playable costly arena');
    const index = dungeon.arenas.findIndex(a => a.id === costly.id);
    const tired = A.createAdventure(content);
    tired.stamina = 0;
    tired.staminaRefillDay = localDayKey();
    enterDungeon(tired, content, costlyId);
    tired.dungeonRuns[costlyId].cleared = dungeon.arenas.slice(0, index).filter(a => !a.blocked.length).map(a => a.id);
    A.beginEncounter(tired, content, costly.id);
    const b2 = P.restorePveBattle(dataset, content, tired.pendingEncounter);
    b2.finished = true; b2.winner = 'near';
    const xp0 = tired.xp, coins0 = tired.inventory[100] || 0;
    const denied = A.settleEncounter(tired, content, b2);
    assert.equal(denied.insufficientStamina, true);
    assert.equal(tired.xp, xp0);
    assert.equal(tired.inventory[100] || 0, coins0);
    assert.ok(tired.dungeonRuns[costlyId].cleared.includes(costly.id));
    assert.equal(tired.stamina, 0);
});

test('parseArenaStaminaCost tolerates string attributes from export', () => {
    assert.equal(parseArenaStaminaCost({ attributes: { stamina_cost: '15' } }), 15);
    assert.equal(parseArenaStaminaCost({ staminaCost: 10 }), 10);
    assert.equal(parseArenaStaminaCost({ attributes: {} }), 0);
});
