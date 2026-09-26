import { test } from 'node:test';
import assert from 'node:assert/strict';
import { teachingMode } from '../js/adventure_core.js';

const content = {
    npcs: { 1: { zone: 'camp' }, 2: { zone: 'town' } },
    quests: [
        { id: 100, startNpc: 1, goals: [] },   // camp chapter quest
        { id: 101, startNpc: 2, goals: [] }    // town chapter quest
    ],
    catalogQuests: { quests: [{ id: 63000, region: 'camp' }, { id: 63100, region: 'town' }] }
};
const base = { zone: 'camp', quests: {} };

test('teachingMode 关闭：不在魔法营地', () => {
    assert.equal(teachingMode({ ...base, zone: 'town' }, content), null);
});

test('teachingMode 开启：营地章节任务未交付', () => {
    const save = { ...base, quests: {} };
    assert.equal(teachingMode(save, content).id, 100);
});

test('teachingMode 开启：章节任务交付后回落到营地目录任务', () => {
    const save = { ...base, quests: { 100: { claimed: true } } };
    assert.equal(teachingMode(save, content).id, 63000);
});

test('teachingMode 关闭：营地任务链全部交付（镇上任务不影响）', () => {
    const save = { ...base, quests: { 100: { claimed: true }, 63000: { claimed: true } } };
    assert.equal(teachingMode(save, content), null);
});

test('teachingMode 容错：缺少目录任务表或空存档', () => {
    assert.equal(teachingMode({ ...base, quests: { 100: { claimed: true } } }, { npcs: content.npcs, quests: content.quests }), null);
    assert.equal(teachingMode(null, content), null);
    assert.equal(teachingMode(base, null), null);
});
