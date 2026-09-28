import { test } from 'node:test';
import assert from 'node:assert/strict';
import { teachingMode } from '../js/adventure_core.js';
import { teachPointer } from '../js/view_teaching.js';

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

test('卡包装配与强化指引点一次后不再出现', () => {
    const previous = globalThis.document;
    globalThis.document = {createElement:() => ({className:'',textContent:'',setAttribute(){},remove(){},classList:{add(){}}})};
    const save = {zone:'camp', quests:{}, tips:{}};
    const listeners = [];
    const target = {
        classList:{added:[],add(name){this.added.push(name);},remove(name){this.added=this.added.filter(item=>item!==name);}},
        querySelector(){return null;},
        append(){},
        addEventListener(type, fn, options){listeners.push({type, fn, options});}
    };
    let seen = 0;
    teachPointer(target, save, content, {key:'teachDeck', onSeen:key => {save.tips[key]=true; seen++;}});
    assert.equal(listeners.length, 1);
    assert.equal(listeners[0].options.capture, true);
    listeners[0].fn();
    assert.equal(save.tips.teachDeck, true);
    assert.equal(seen, 1);
    teachPointer(target, save, content, {key:'teachDeck', onSeen:() => seen++});
    assert.equal(seen, 1, '点过一次后不再挂指针');
    const upgrade = {...target, classList:{added:[],add(name){this.added.push(name);},remove(){}}};
    const again = [];
    upgrade.addEventListener = (type, fn, options) => again.push({type, fn, options});
    teachPointer(upgrade, save, content, {key:'teachUpgrade'});
    again[0].fn();
    assert.equal(save.tips.teachUpgrade, true);
    teachPointer(upgrade, save, content, {key:'teachUpgrade', onSeen:() => {throw new Error('不应再次出现');}});
    const finished = {zone:'camp', quests:{100:{claimed:true}, 63000:{claimed:true}}, tips:{}};
    const camp = {...target, classList:{added:[],add(name){this.added.push(name);},remove(){}}, querySelector(){return null;}};
    const campClicks = [];
    camp.addEventListener = (type, fn, options) => campClicks.push({type, fn, options});
    teachPointer(camp, finished, content, {key:'teachDeck'});
    assert.equal(campClicks.length, 1, '营地任务完成后仍提示点一次卡包');
    const town = {...camp, classList:{added:[],add(){},remove(){}}};
    const townClicks = [];
    town.addEventListener = () => townClicks.push(1);
    teachPointer(town, {zone:'town', quests:{}, tips:{}}, content, {key:'teachDeck'});
    assert.equal(townClicks.length, 0);
    globalThis.document = previous;
});
