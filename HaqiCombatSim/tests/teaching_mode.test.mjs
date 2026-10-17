import { test } from 'node:test';
import assert from 'node:assert/strict';
import { teachingMode, beginnerTeaching } from '../js/adventure_core.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
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

test('字源岛追踪指针覆盖接取、进行、交付，且只提示一条任务', () => {
    const source=readFileSync(new URL('../js/view_adventure.js',import.meta.url),'utf8');
    const renderer=source.slice(source.indexOf('function appendTrackerQuest('),source.indexOf('export function renderHeroTitle('));
    for (const state of [{accepted:false},{accepted:true},{accepted:true,ready:true},{claimed:true}]) {
        for (const level of [9,10]) {
            const nodes=[];
            const el=(tag,cls,...children)=>{const n={tag,cls,children,setAttribute(){},append(...items){this.children.push(...items);},classList:{add(){}}};nodes.push(n);return n;};
            const quest={id:873002,region:'hanzi',title:'脚下的土地'};
            const context=vm.createContext({beginnerTeaching,el,button:(children,run,cls)=>el('button',cls,children),
                questState:()=>state,catalogQuestReady:()=>!!state.ready,catalogStatSnapshot:()=>({}),catalogQuestStatus:()=>'',
                catalogTrackLines:()=>[{text:'去找石伯'}],fill:()=>({text:''}),tr:s=>s});
            vm.runInContext(renderer,context);
            const save={zone:'hanzi',level},c={quests:[],catalogQuests:{byId:{873002:quest}}},teach={allow:!!teachingMode(save,c)};
            for(let i=0;i<2;i++)context.appendTrackerQuest(el('div'),{id:873002},save,c,{},teach);
            assert.equal(nodes.filter(n=>n.cls==='teach-pointer').length,level<10&&!state.claimed?1:0);
        }
    }
});

test('低于10级在所有区域开启指引，完成营地任务也不关闭', () => {
    for (const zone of ['camp', 'town', 'hanzi', 'fire', 'earth']) {
        for (const level of [1, 9]) {
            assert.ok(teachingMode({zone, level, quests:{100:{claimed:true},63000:{claimed:true}}}, content), `${zone} level ${level}`);
        }
    }
    for (const level of [10, 50]) {
        assert.equal(teachingMode({zone:'hanzi',level,quests:{}}, content), null);
        assert.ok(teachingMode({zone:'camp',level,quests:{}}, content), '营地原指引保留');
    }
});

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
    for (const key of ['teachDeck', 'teachUpgrade', undefined]) {
        const clicks=[];
        const lowLevelTarget={...town,classList:{add(){},remove(){}},addEventListener:(...args)=>clicks.push(args)};
        let appended=0;
        lowLevelTarget.append=()=>appended++;
        teachPointer(lowLevelTarget,{zone:'hanzi',level:9,quests:{},tips:{}},content,{key});
        assert.equal(appended,1, `字源岛低等级面板指引：${key||'通用'}`);
    }
    globalThis.document = previous;
});
