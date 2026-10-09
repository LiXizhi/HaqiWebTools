import test from 'node:test';
import assert from 'node:assert/strict';
import {GlobalRewardNotice} from '../js/view_global_reward.js';
import {equipmentGainLines} from '../js/adventure_reward_feedback_core.js';
import {setTranslator} from '../js/locale_runtime.js';

test('global rewards queue above UI and auto-hide without closing or focusing it',t=>{
    t.mock.timers.enable({apis:['setTimeout']});
    class Node {constructor(){this.children=[];this.attrs={};this.hidden=false;this.open=false;this.dataset={};}setAttribute(k,v){this.attrs[k]=v;}append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}showPopover(){this.open=true;}hidePopover(){this.open=false;}matches(){return this.open;}remove(){this.removed=true;}}
    const doc={body:new Node(),createElement:()=>new Node()};
    const notice=new GlobalRewardNotice({document:doc});
    notice.show({title:'学习加成已生效',lines:['攻击 +1%']});notice.show({title:'装备属性提升',lines:['最大生命 +20']});
    assert.equal(doc.body.children[0],notice.root);assert.equal(notice.root.open,true);assert.equal(notice.root.attrs.popover,'manual');
    assert.equal(notice.root.children[1].textContent,'攻击 +1%');
    t.mock.timers.tick(3000);assert.equal(notice.root.children[1].textContent,'最大生命 +20');
    t.mock.timers.tick(3000);assert.equal(notice.root.hidden,true);assert.equal(notice.root.open,false);
    notice.show({lines:[]});assert.equal(notice.root.hidden,true);
    notice.show({lines:['防御 +1%']});notice.show({lines:['生命 +1%']});notice.reset();t.mock.timers.tick(9000);assert.equal(notice.root.hidden,true);
    notice.dispose();assert.equal(notice.root.removed,true);
});

test('global reward fill templates translate level, exp and item lines',t=>{
    t.mock.timers.enable({apis:['setTimeout']});
    const table={
        '获得奖励':'Reward received',
        '等级 {from} → {to}':'Level {from} → {to}',
        '经验 +{xp}':'EXP +{xp}',
        '{name} +{count}':'{name} +{count}',
        '仙豆':'Fairy beans',
        '烈火术':'Fire Blade',
    };
    setTranslator(key=>table[key]||key);
    t.after(()=>setTranslator(null));
    class Node {constructor(){this.children=[];this.attrs={};this.hidden=false;this.open=false;this.dataset={};}setAttribute(k,v){this.attrs[k]=v;}append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}showPopover(){this.open=true;}hidePopover(){this.open=false;}matches(){return this.open;}remove(){this.removed=true;}}
    const doc={body:new Node(),createElement:()=>new Node()};
    const notice=new GlobalRewardNotice({document:doc});
    notice.show({title:'获得奖励',lines:[
        ['等级 {from} → {to}',{from:1,to:2}],
        ['经验 +{xp}',{xp:32}],
        ['{name} +{count}',{name:'仙豆',count:100}],
        ['{name} +{count}',{name:'烈火术',count:1}],
    ]});
    assert.deepEqual(notice.root.children.map(row=>row.textContent),[
        'Reward received','Level 1 → 2','EXP +32','Fairy beans +100','Fire Blade +1',
    ]);
    notice.dispose();
});

test('equipment notice shows only actual positive deltas and preserves units',()=>{
    const before=[{key:'hp',value:100},{key:'attack',value:5},{key:'defense',value:10}];
    const after=[{key:'hp',label:'最大生命',value:120,unit:''},{key:'attack',label:'攻击',value:7,unit:'%'},{key:'defense',label:'防御',value:8,unit:'%'}];
    assert.deepEqual(equipmentGainLines(before,after),[{label:'最大生命',delta:20,unit:''},{label:'攻击',delta:2,unit:'%'}]);
    assert.deepEqual(equipmentGainLines(after,after),[]);
});
