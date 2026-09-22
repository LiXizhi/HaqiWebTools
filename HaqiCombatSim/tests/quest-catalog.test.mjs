import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { validateMedia } from '../scripts/lib/asset_decode.mjs';
import { projectRuntimeData } from '../scripts/package_runtime_data.mjs';
const read = name => fs.readFileSync(new URL(`../data/adventure/${name}`, import.meta.url));
const quests = JSON.parse(read('quest-catalog.json'));
const monsters = JSON.parse(read('monster-catalog.json'));
const chapter = JSON.parse(read('chapter.json'));
const pets = JSON.parse(read('pets.json')).pets;
const bosses = JSON.parse(read('boss-art-plan.json'));
const digest = raw => createHash('sha256').update(raw).digest('hex');
const child = (node, tag) => node.children?.find(c => c.tag === tag);
const quest = id => quests.quests.find(q => q.id === id);

test('full kids catalog includes all island, public, trial and obsolete quests without enabling them', () => {
  assert.equal(quests.quests.length, 684);
  assert.equal(new Set(quests.quests.map(q => q.id)).size, 684);
  assert.equal(quests.quests.filter(q => q.obsolete).length, 257);
  assert.deepEqual(Object.fromEntries(Object.entries(quests.islands).map(([k,v]) => [k,v.length])),
    {camp:62, town:86, fire:38, ice:53, desert:64, dark:12});
  assert.deepEqual(quests.quests.filter(q => q.runtimeStatus === 'opening-adaptation').map(q => q.id), chapter.quests.map(q => q.id).sort((a,b) => a-b));
  assert.equal(quest(62410).runtimeStatus, 'catalog-only');
  for (const q of quests.quests) {
    assert.equal(Number(child(q.data, 'Id').text), q.id);
    assert.ok(child(q.data, 'StartDialog'));
    assert.ok(child(q.data, 'EndDialog'));
    assert.ok(child(q.data, 'Reward'));
    assert.ok(child(q.data, 'RequestAttr'));
  }
});

test('source goal/drop conditions and dialogue commands are preserved without adaptation', () => {
  const drop = child(quest(62102).data, 'GoalItem');
  assert.equal(drop.attributes.condition, '0');
  assert.deepEqual(drop.children[0].attributes, {id:'70008',value:'1',producer_id:'40010',append_producer_id_list:'',producer_odds:'1',producer_num:'1',producer_value:'1'});
  assert.ok(quests.goalQuestIds['40010'].includes(62102));
  const items = child(quest(62407).data, 'CustomGoal').children;
  assert.ok(items.some(i => i.attributes.id === '17258' && i.attributes.value === '999' && i.attributes.need_destroy === '1'));
  const opening = JSON.stringify(child(quest(63000).data, 'StartDialog'));
  assert.ok(opening.includes('doaccept'));
  assert.ok(!opening.includes('WASD'));
});

test('current Excel goals and world NPCs resolve source references; malformed auxiliary XML remains explicit', () => {
  const goal = quests.tables['goal_list_excel.xml'].goals.find(g => g.id === '40285');
  assert.equal(goal.name, '瘟疫领主真身');
  assert.equal(goal.path, 'config/Aries/Mob/DarkForestIslandMarshNest/MobTemplate_MarshNestBoss_Set_Death_Lv55.xml');
  assert.equal(quests.report.missingReferences.length, 2);
  assert.ok(quests.report.missingReferences.every(r => r.id === '30529'));
  assert.ok(quests.tables['growrec.xml'].rawXml.length > 0);
  assert.ok(quests.tables['growrec.xml'].parseError);
});

test('monster export retains original stats and links to quest drops and arena instances', () => {
  assert.equal(monsters.report.templates, 607);
  assert.equal(monsters.monsters.length, 611);
  assert.equal(monsters.report.unparsedTemplates, 0);
  assert.equal(monsters.placements.length, 540);
  const boss = monsters.monsters.find(m => m.goalIds.includes('40285'));
  assert.equal(boss.attributes.hp, '551240');
  assert.ok(boss.mainStoryQuestIds.includes(62401));
  assert.ok(boss.mainStoryQuestIds.includes(62410));
  assert.equal(boss.art.status, 'original-model-required');
  assert.ok(monsters.monsters.some(m => m.source.endsWith('PharaohFortress/MobTemplate_Anubis.xml')));
  assert.equal(monsters.report.missingTemplates.length, 3);
  const roots = Object.values(monsters.templates);
  for (const tag of ['cardsets', 'sequences', 'genes']) assert.ok(roots.some(root => child(root, tag)), `${tag} must not be lost outside the mob element`);
});

test('pet reuse remains an explicit visual proposal with real existing assets', () => {
  const reused = monsters.monsters.filter(m => m.art.status === 'pet-reuse-proposal');
  assert.equal(reused.length, 530);
  for (const m of reused) {
    assert.ok(pets[m.art.petId]);
    assert.ok(pets[m.art.petId].art.cdn.startsWith('https://cdn.keepwork.com/'));
    assert.ok(m.attributes.asset);
    assert.ok(!(m.bossCandidate && m.mainStoryQuestIds.length));
  }
});

test('catalog and boss plan dependencies cannot silently drift', () => {
  assert.equal(monsters.questCatalogSha256, digest(read('quest-catalog.json')));
  assert.equal(monsters.petCatalogSha256, digest(read('pets.json')));
  assert.equal(bosses.monsterCatalogSha256, digest(read('monster-catalog.json')));
  assert.equal(bosses.jobs.length, 23);
  assert.equal(new Set(bosses.jobs.map(j => j.id)).size, 23);
  for (const job of bosses.jobs) {
    const monster = monsters.monsters.find(m => m.id === job.monsterId);
    assert.equal(job.model, monster.model);
    assert.equal(job.sourceSha256, monsters.sources[job.source]);
    assert.ok(['awaiting-native-render', 'prepared-local', 'cdn-verified'].includes(job.status));
    assert.equal(job.output.byteLimitExclusive, 48000);
  }
});

// These complete source archives are not yet consumed by gameplay.
test('source catalogs do not add unused megabytes to the startup adventure pack', () => {
  for (const file of ['quest-catalog.json', 'monster-catalog.json', 'boss-art-plan.json', 'boss-art.json']) {
    assert.equal(projectRuntimeData(`adventure/${file}`, JSON.parse(read(file))), null);
  }
});

test('all 23 original boss portraits have native provenance, full resolution and bounded WebP files', () => {
  const art = JSON.parse(read('boss-art.json'));
  assert.equal(Object.keys(art.entries).length, bosses.jobs.length);
  for (const job of bosses.jobs) {
    const entry = art.entries[job.id];
    assert.equal(entry.model, job.model);
    assert.equal(entry.templateSha256, job.sourceSha256);
    assert.equal(entry.method, 'original-model-mini-scene');
    assert.equal(entry.renderSize, 512);
    assert.match(entry.renderSha256, /^[a-f0-9]{64}$/);
    const raw = fs.readFileSync(new URL(`../${entry.local}`, import.meta.url));
    assert.equal(digest(raw), entry.sha256);
    assert.equal(raw.length, entry.size);
    assert.ok(raw.length < art.byteLimitExclusive);
    assert.deepEqual(validateMedia(entry.local, raw), {width:256, height:256});
    assert.equal(job.status, entry.cdn ? 'cdn-verified' : 'prepared-local');
    if (entry.cdn) assert.ok(entry.cdn.startsWith('https://cdn.keepwork.com/'));
  }
});
