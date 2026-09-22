import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {projectQuestRuntime,installCatalogQuests,catalogQuestStatus,catalogQuestReady,noteCatalogKills,catalogGoalRows} from '../js/adventure_catalog_quests_core.js';
import {createRng} from '../js/rng_core.js';
import * as A from '../js/adventure_core.js';
import {installFishing} from '../js/adventure_fishing_core.js';

const read = name => JSON.parse(fs.readFileSync(new URL(`../data/adventure/${name}.json`, import.meta.url)));
const catalog = read('quest-catalog');
const chapter = read('chapter');
const runtime = projectQuestRuntime(catalog, chapter.quests.map(q => q.id));

function playableContent() {
    const content = structuredClone(chapter);
    installCatalogQuests(content, runtime);
    return content;
}
function raise(save, content, level) {
    const caps = content.progression.xpThresholds;
    save.xp = caps[Math.min(caps.length, level) - 1] ?? caps.at(-1);
    A.syncProgression(save, content);
}

test('runtime keeps every active quest except the chapter lessons and omits story scripts', () => {
    assert.equal(runtime.version, 1);
    assert.equal(runtime.quests.length, 413);
    assert.equal(runtime.quests.some(q => q.id >= 63000 && q.id <= 63013), false);
    assert.equal(Object.keys(runtime.paths).length > 100, true);
    assert.equal(JSON.stringify(runtime).includes('dofunction'), false);
    assert.equal(JSON.stringify(runtime).includes('StartDialog'), false);
});

test('kills, delivery, talk and unsupported goals update only catalog quests', () => {
    const content = playableContent();
    const save = A.createAdventure(content, {name: '全岛任务'});
    raise(save, content, content.progression.levelCap);
    const kill = runtime.quests.find(q => q.requirements.every(r => r.id === 214 && (r.max === null || r.max >= save.level)) && q.groups.some(g => g.kind === 'kill') && q.prerequisites.length === 0);
    assert.ok(kill, '需要一条仅受等级限制的击败任务');
    for (const prerequisite of kill.prerequisites) save.quests[prerequisite.id] = {accepted: true, claimed: true, progress: {}};
    assert.equal(catalogQuestStatus(save, content, kill, A.catalogStatSnapshot(save, content)), '可接取');
    A.applyAction(save, content, {type: 'accept-catalog', questId: kill.id, npcId: kill.startNpc});
    const goal = kill.groups.find(g => g.kind === 'kill').items[0];
    const path = Object.entries(runtime.paths).find(([, id]) => id === goal.id)?.[0];
    assert.ok(path, '击败目标应能对应怪物模板');
    noteCatalogKills(save, content, Array.from({length: goal.count}, () => ({source: path})), createRng(7));
    assert.equal(catalogQuestReady(save, content, kill, A.catalogStatSnapshot(save, content)), true);
    const before = save.xp;
    A.applyAction(save, content, {type: 'claim-catalog', questId: kill.id, npcId: kill.endNpc});
    assert.equal(save.quests[kill.id].claimed, true);
    assert.equal(save.xp > before, true);
    assert.equal(A.currentQuest(save, content).id, 63000);

    const delivery = runtime.quests.find(q => !q.groups.length && q.requirements.every(r => r.id === 214) && q.prerequisites.every(p => content.catalogQuests.byId[p.id]));
    assert.ok(delivery);
    const levelReq = delivery.requirements.find(r => r.id === 214);
    if (levelReq) raise(save, content, Math.min(content.progression.levelCap, Math.max(levelReq.min, 1)));
    for (const prerequisite of delivery.prerequisites) save.quests[prerequisite.id] = {accepted: true, claimed: true, progress: {}};
    A.applyAction(save, content, {type: 'accept-catalog', questId: delivery.id, npcId: delivery.startNpc});
    assert.equal(catalogQuestStatus(save, content, delivery, A.catalogStatSnapshot(save, content)), '可交付');

    const talk = runtime.quests.find(q => q.groups.length === 1 && q.groups[0].kind === 'talk' && q.requirements.every(r => r.id === 214) && q.prerequisites.every(p => content.catalogQuests.byId[p.id]));
    assert.ok(talk);
    const talkLevel = talk.requirements.find(r => r.id === 214);
    if (talkLevel) raise(save, content, Math.min(content.progression.levelCap, Math.max(talkLevel.min, 1)));
    for (const prerequisite of talk.prerequisites) save.quests[prerequisite.id] = {accepted: true, claimed: true, progress: {}};
    content.npcs[talk.groups[0].items[0].id] ??= {id: talk.groups[0].items[0].id, name: '居民', zone: 'camp'};
    A.applyAction(save, content, {type: 'accept-catalog', questId: talk.id, npcId: talk.startNpc});
    A.applyAction(save, content, {type: 'talk', npcId: talk.groups[0].items[0].id});
    assert.equal(catalogGoalRows(save, content, talk)[0].value, 1);

    const blocked = runtime.quests.find(q => q.groups.some(g => g.items.some(i => i.id === 79038)));
    save.quests[blocked.id] = {accepted: true, claimed: false, progress: {}};
    assert.equal(catalogQuestStatus(save, content, blocked, A.catalogStatSnapshot(save, content)), '无法推进');
    installFishing(content, read('fishing'));
    const fishingQuest = runtime.quests.find(q => q.id === 61153);
    assert.equal(catalogGoalRows(save, content, fishingQuest, A.catalogStatSnapshot(save, content))[0].blocked, false);
    A.parseSave(save, content);
});

test('loot rolls are reproducible and harder than the web fight does not count', () => {
    const content = {quests: [], items: {113: {id: 113, name: '经验', stats: {}}}, schools: {fire: 1}, catalogQuests: null, progression: chapter.progression, learn: chapter.learn};
    installCatalogQuests(content, {version: 1, paths: {'config/mob.xml': 40001}, quests: [
        {id: 1, title: '收集', region: 'camp', startNpc: 1, endNpc: 1, repeat: false, prerequisites: [], requirements: [], rewards: [], groups: [{kind: 'loot', condition: 0, mode: 0, items: [{id: 70, name: '泪水', count: 5, producers: [40001], odds: 1, unit: 1, amount: 1}]}]},
        {id: 2, title: '噩梦', region: 'camp', startNpc: 1, endNpc: 1, repeat: false, prerequisites: [], requirements: [], rewards: [], groups: [{kind: 'kill', condition: 0, mode: 4, items: [{id: 40001, name: '守卫', count: 1}]}]}
    ]});
    const save = {quests: {1: {accepted: true, claimed: false, progress: {}}, 2: {accepted: true, claimed: false, progress: {}}}, inventory: {}, level: 1};
    noteCatalogKills(save, content, [{source: 'Config/Mob.xml'}, {source: 'config/mob.xml'}], createRng(3));
    const rolled = save.quests[1].progress['loot:70'];
    save.quests[1].progress = {};
    noteCatalogKills(save, content, [{source: 'config/mob.xml'}, {source: 'config/mob.xml'}], createRng(3));
    assert.equal(save.quests[1].progress['loot:70'], rolled);
    assert.equal(rolled, 2);
    assert.equal(save.quests[2].progress['kill:40001'], undefined);
});
