import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { installExpansion } from '../js/adventure_expansion_core.js';
import { installNpcCatalog, npcOffers, npcOfferStatus } from '../js/adventure_npc_core.js';
import { installMountCatalog } from '../js/adventure_mounts_core.js';
import { installDragonTotemItems, dragonTotemItemExperience } from '../js/adventure_progression_bonuses_core.js';
import { installCatalogQuests } from '../js/adventure_catalog_quests_core.js';
import { installFishing } from '../js/adventure_fishing_core.js';
import { installDungeonIndex } from '../js/adventure_dungeons_core.js';
import { tickCheckin } from '../js/adventure_checkin_core.js';
import { awardDailySpeech } from '../js/language_daily_buff_core.js';
import { gemCompatibility, isGem, GEM_FILTERS } from '../js/adventure_gems_core.js';
import { upgradeLevels, upgradeAt } from '../js/adventure_upgrade_core.js';
import { applyAction, canEquip, createAdventure } from '../js/adventure_core.js';

const read = p => JSON.parse(fs.readFileSync(new URL('../data/' + p, import.meta.url)));

function buildContent() {
    const { content, dataset } = installExpansion(
        read('adventure/chapter.json'),
        read('adventure/combat.json'),
        read('adventure/pets.json'),
        read('adventure/shop-candidates.json'),
        read('kids/cards.json'),
        read('kids/charms.json'),
        read('kids/card_names.json'),
    );
    content.worldMaps = {
        camp: read('adventure/maps/camp.json'),
        town: read('adventure/maps/town.json'),
    };
    installDungeonIndex(content, read('adventure/dungeon-index.json'));
    installNpcCatalog(content, read('adventure/npc-catalog.json'));
    installMountCatalog(content, read('adventure/mount-catalog.json'));
    content.shopConfig = read('adventure/shop.json');
    content.magicStar = read('adventure/magic-star.json');
    content.progressionBonuses = read('adventure/progression-bonuses.json');
    installDragonTotemItems(content);
    content.checkinConfig = read('adventure/checkin.json');
    for (const [id, item] of Object.entries(content.checkinConfig.items)) content.items[id] ??= item;
    for (const [id, item] of Object.entries(content.progressionBonuses.giftItems || {})) content.items[id] ??= item;
    content.gemCatalog = read('adventure/gems.json');
    Object.assign(content.items, content.gemCatalog.items);
    installFishing(content, read('adventure/fishing.json'));
    installCatalogQuests(content, read('adventure/quest-runtime.json'));
    return { content, dataset };
}

const { content } = buildContent();
const NOW = Date.parse('2026-10-20T04:00:00Z');
const VIP_ACCESS = { keepworkVip: true, expiresAt: '2027-10-20', now: NOW };
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);

function runScenarios() {
    const out = {};
    const record = (name, fn) => {
        const save = createAdventure(content, { school: 'fire', seed: 530 });
        const result = fn(save);
        out[name] = hash({ result, save });
    };

    record('companion-wordplay', save => {
        save.openingJourney = { version: 1, phase: 'done', celebrated: true };
        return applyAction(save, content, {
            type: 'companion-wordplay',
            step: 'answer',
            expectedStep: 0,
            language: 'en',
            text: 'hello',
            input: 'text',
            receipt: 'r-1',
            at: NOW,
        });
    });

    record('camp-detour', save => {
        save.openingJourney = { version: 1, phase: 'done', celebrated: true };
        return applyAction(save, content, { type: 'camp-detour', step: 'start' });
    });

    record('forest-commission', save => {
        save.openingJourney = { version: 1, phase: 'done', celebrated: true };
        return applyAction(save, content, { type: 'forest-commission', step: 'accept' }, {
            forestTarget: { id: 36201, kind: 'npc', x: save.position.x, y: save.position.y },
        });
    });

    record('language-complete', save => {
        save.languageLearning = { ...save.languageLearning, enabled: true, target: 'en' };
        const completion = { course: { id: 'c-1', tier: 'beginner' }, mode: 'listening', heard: true, score: 100, attemptId: 'att-1', locale: 'en', now: NOW };
        return applyAction(save, content, { type: 'language-complete', completion }, { learningCompletion: completion });
    });

    record('npc-purchase', save => {
        const npc = content.npcCatalog.npcs.find(n => n.zone === save.zone && npcOffers(content, n).some(o => o.kind === 'shop' && !o.gated));
        const offer = npcOffers(content, npc).find(o => o.kind === 'shop' && !o.gated);
        save.inventory[100] = 50000;
        save.inventory[17213] = 5000;
        save.level = 50;
        for (const [id, count] of npcOfferStatus(save, content, offer, VIP_ACCESS).costs || []) {
            save.inventory[id] = (save.inventory[id] || 0) + count;
        }
        return applyAction(save, content, { type: 'npc-purchase', npcInstanceId: npc.instanceId, offerId: offer.id }, VIP_ACCESS);
    });

    record('fish', save => {
        const net = content.fishing.nets[0];
        save.inventory[net.id] = 3;
        return applyAction(save, content, { type: 'fish', netId: net.id, hit: true, now: NOW });
    });

    record('stamina-potion', save => {
        const potion = content.fishing.potions.find(row => !row.blocked);
        save.inventory[potion.id] = 2;
        save.stamina = 10;
        return applyAction(save, content, { type: 'stamina-potion', itemId: potion.id });
    });

    record('magic-star-claim', save => applyAction(save, content, { type: 'magic-star-claim', rewardId: 'weekly' }, VIP_ACCESS));
    record('choose-totem', save => applyAction(save, content, { type: 'choose-totem', professionId: 50351 }));
    record('customize-hero', save => {
        save.inventory[984] = 200;
        return applyAction(save, content, { type: 'customize-hero', name: '新哈奇', appearance: 'boy', headId: 'elf-boy' });
    });

    record('use-totem-item', save => {
        save.inventory[50359] = 600000;
        applyAction(save, content, { type: 'choose-totem', professionId: 50351 });
        const itemId = Number(Object.keys(content.items).find(id => dragonTotemItemExperience(save, content, Number(id)) > 0));
        save.inventory[itemId] = 1;
        return applyAction(save, content, { type: 'use-totem-item', itemId });
    });

    record('checkin', save => {
        tickCheckin(save, NOW, 60001);
        return applyAction(save, content, { type: 'checkin', index: 0, now: NOW }, VIP_ACCESS);
    });

    record('speech-reward', save => {
        save.languageLearning = { ...save.languageLearning, enabled: true, target: 'en' };
        for (let i = 0; i < 10; i++) awardDailySpeech(save, content, `ev-${i}`, NOW, 'attack');
        return applyAction(save, content, { type: 'speech-reward', index: 0, now: NOW });
    });

    record('opening-journey', save => {
        save.openingJourney = { version: 1, phase: 'offer' };
        const [x, y] = content.worldMaps.camp.npcPositions[36211];
        save.position = { x, y };
        return applyAction(save, content, { type: 'opening-journey', step: 'accept' });
    });

    record('accept', save => applyAction(save, content, { type: 'accept', questId: 63000, npcId: 36211 }));

    record('talk', save => {
        applyAction(save, content, { type: 'accept', questId: 63000, npcId: 36211 });
        return applyAction(save, content, { type: 'talk', npcId: 36200 });
    });

    record('claim', save => {
        applyAction(save, content, { type: 'accept', questId: 63000, npcId: 36211 });
        applyAction(save, content, { type: 'talk', npcId: 36200 });
        return applyAction(save, content, { type: 'claim', questId: 63000, npcId: 36211 });
    });

    const prepCatalog = save => {
        save.xp = content.progression.xpThresholds.at(-1);
        save.level = content.progression.xpThresholds.length;
        save.graduated = true;
        return content.catalogQuests.quests.find(q => !q.prereq && (!q.prereqQuests || !q.prereqQuests.length) && (!q.minLevel || q.minLevel <= save.level));
    };

    record('accept-catalog', save => {
        const cq = prepCatalog(save);
        return applyAction(save, content, { type: 'accept-catalog', questId: cq.id, npcId: cq.startNpc });
    });

    record('track-catalog', save => {
        const cq = prepCatalog(save);
        applyAction(save, content, { type: 'accept-catalog', questId: cq.id, npcId: cq.startNpc });
        return applyAction(save, content, { type: 'track-catalog', questId: cq.id });
    });

    record('abandon-quest', save => {
        const cq = prepCatalog(save);
        applyAction(save, content, { type: 'accept-catalog', questId: cq.id, npcId: cq.startNpc });
        return applyAction(save, content, { type: 'abandon-quest', questId: cq.id });
    });

    record('claim-catalog', save => {
        prepCatalog(save);
        const cq = content.catalogQuests.quests.find(q => !q.prereq && (!q.prereqQuests || !q.prereqQuests.length) && q.goals?.length === 1 && q.goals[0].kind === 'talk');
        if (!cq) return { skipped: true };
        applyAction(save, content, { type: 'accept-catalog', questId: cq.id, npcId: cq.startNpc });
        save.quests[cq.id].progress[0] = cq.goals[0].count;
        return applyAction(save, content, { type: 'claim-catalog', questId: cq.id, npcId: cq.endNpc });
    });

    const pickGear = (save, extra = () => true) => Object.values(content.items).find(i => {
        save.inventory[i.id] = 1;
        const ok = i.slot && i.slot !== 24 && canEquip(save, i, content) && extra(i);
        delete save.inventory[i.id];
        return ok;
    });

    record('equip', save => {
        const gear = pickGear(save);
        save.inventory[gear.id] = 1;
        return applyAction(save, content, { type: 'equip', itemId: gear.id });
    });

    record('unequip', save => {
        const gear = pickGear(save);
        save.inventory[gear.id] = 1;
        applyAction(save, content, { type: 'equip', itemId: gear.id });
        return applyAction(save, content, { type: 'unequip', slot: gear.slot });
    });

    record('ride', save => {
        const mountId = Number(Object.keys(content.mountByItem).find(id => content.mountCatalog.mounts.find(m => m.id === content.mountByItem[id].mountId)?.art?.cdn));
        save.inventory[mountId] = 1;
        return applyAction(save, content, { type: 'ride', itemId: mountId });
    });

    record('dismount', save => {
        const mountId = Number(Object.keys(content.mountByItem).find(id => content.mountCatalog.mounts.find(m => m.id === content.mountByItem[id].mountId)?.art?.cdn));
        save.inventory[mountId] = 1;
        applyAction(save, content, { type: 'ride', itemId: mountId });
        return applyAction(save, content, { type: 'dismount' });
    });

    const pickSocketPair = save => {
        save.xp = content.progression.xpThresholds.at(-1);
        save.level = content.progression.xpThresholds.length;
        const gems = Object.values(content.gemCatalog.items).filter(g => isGem(g) && g.stats[41] === 1);
        for (const gear of Object.values(content.items)) {
            if (!(gear.stats?.[36] > 0) || !GEM_FILTERS[0][1].includes(gear.subtype ?? gear.slot)) continue;
            save.inventory[gear.id] = 1;
            const ok = canEquip(save, gear, content);
            delete save.inventory[gear.id];
            if (!ok) continue;
            const gem = gems.find(g => gemCompatibility(gear, g) === null);
            if (gem) return { gear, gem };
        }
        return null;
    };

    record('mount-gem', save => {
        const { gear, gem } = pickSocketPair(save);
        save.inventory[gear.id] = 1;
        save.inventory[gem.id] = 1;
        save.inventory[100] = 50000;
        applyAction(save, content, { type: 'equip', itemId: gear.id });
        return applyAction(save, content, { type: 'mount-gem', itemId: gear.id, guid: save.equipmentGuids[gear.slot], gemId: gem.id });
    });

    record('remove-gems', save => {
        const { gear, gem } = pickSocketPair(save);
        save.inventory[gear.id] = 1;
        save.inventory[gem.id] = 1;
        save.inventory[17179] = 1;
        save.inventory[100] = 50000;
        applyAction(save, content, { type: 'equip', itemId: gear.id });
        applyAction(save, content, { type: 'mount-gem', itemId: gear.id, guid: save.equipmentGuids[gear.slot], gemId: gem.id });
        return applyAction(save, content, { type: 'remove-gems', guid: save.equipmentGuids[gear.slot], gemIds: [gem.id] });
    });

    record('upgrade', save => {
        save.xp = content.progression.xpThresholds.at(-1);
        save.level = content.progression.xpThresholds.length;
        const gear = pickGear(save, i => upgradeLevels(content, i.id).length > 0);
        save.inventory[gear.id] = 1;
        const [cur, cost] = upgradeAt(content, gear.id, 1).cost;
        save.inventory[cur] = (save.inventory[cur] || 0) + cost + 100;
        applyAction(save, content, { type: 'equip', itemId: gear.id });
        return applyAction(save, content, { type: 'upgrade', itemId: gear.id, guid: save.equipmentGuids[gear.slot] });
    });

    record('hatch', save => {
        save.inventory[17307] = 1;
        return applyAction(save, content, { type: 'hatch' });
    });

    record('feed', save => {
        save.inventory[17307] = 1;
        applyAction(save, content, { type: 'hatch' });
        save.inventory[content.pet.foodId] = 2;
        return applyAction(save, content, { type: 'feed' });
    });

    record('deck', save => applyAction(save, content, { type: 'deck', deck: [...save.deck] }));

    record('deck-layouts', save => {
        const layouts = structuredClone(save.deckLayouts);
        return applyAction(save, content, { type: 'deck-layouts', layouts, active: save.activeDeckLayout });
    });

    record('travel', save => {
        save.graduated = true;
        save.level = 50;
        return applyAction(save, content, { type: 'travel', zone: 'town' });
    });

    record('retreat', save => {
        const enc = content.encounters.find(e => e.zone === 'camp');
        save.pendingEncounter = { encounterId: enc.id, zone: 'camp' };
        return applyAction(save, content, { type: 'retreat' });
    });

    return out;
}

const GOLDEN = {
    'companion-wordplay': '9b501066a8c069e6',
    'camp-detour': '22a5ec3842c0179b',
    'forest-commission': '2fc154831722883d',
    'language-complete': '1e875c7cfb96bdd7',
    'npc-purchase': 'f03f41a4e06672fe',
    // A dated catch also initializes the daily bounty ledger; catch rewards are unchanged.
    fish: 'f1ab201790778b61',
    'stamina-potion': '40a02e0f9dc236a6',
    'magic-star-claim': '18def34c85d07b00',
    'choose-totem': '10074ac4a90fb2b6',
    'customize-hero': 'a63995491c276ed8',
    'use-totem-item': 'e4c5e3f2ec968834',
    checkin: 'ac4136475e51a58c',
    'speech-reward': '0daf3c2bcadd474f',
    'opening-journey': '607e27102b75af8a',
    accept: 'a070505a0b96ca70',
    talk: '32e5928ef6318014',
    claim: '8224ea222a7db3d1',
    'accept-catalog': '4d5bebe08f8c11f3',
    'track-catalog': '3f5e83983219700b',
    'abandon-quest': 'af54b675bc5aa73c',
    'claim-catalog': '80d65556f698a26a',
    equip: '56152efb2e14dcfb',
    unequip: '698adf2e862303e7',
    ride: '565207777c2d9bb6',
    dismount: 'c07cca7952597fcb',
    'mount-gem': '77bef0fb8f9176b3',
    'remove-gems': 'a8f7f663de171ef5',
    upgrade: 'e6b9d12074c4e3dd',
    hatch: '5a442393c5d99887',
    feed: '7f32b6e70942398a',
    deck: 'f798713f169d10aa',
    'deck-layouts': 'f798713f169d10aa',
    travel: 'b9fb9ed26ea65e8b',
    retreat: '3c555ce38117486b',
};

test('all 34 adventure action types and guards match golden behavior', () => {
    const save = createAdventure(content, { school: 'fire', seed: 530 });
    assert.throws(() => applyAction(save, content, { type: 'talk', npcId: 36200, paidByTest: true }), /语言课程/);
    save.pendingEncounter = { encounterId: 'e1' };
    assert.throws(() => applyAction(save, content, { type: 'talk', npcId: 36200 }), /请先完成当前战斗/);
    delete save.pendingEncounter;
    assert.throws(() => applyAction(save, content, { type: 'not-a-real-action' }), /未知操作/);

    const actual = runScenarios();
    if (!GOLDEN) {
        console.log('GOLDEN_SNAPSHOTS=' + JSON.stringify(actual));
    } else {
        assert.deepEqual(actual, GOLDEN);
    }
});
