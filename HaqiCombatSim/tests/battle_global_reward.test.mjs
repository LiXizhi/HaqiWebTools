import test from 'node:test';
import assert from 'node:assert/strict';
import {GlobalRewardNotice} from '../js/view_global_reward.js';
import {equipmentGainLines} from '../js/adventure_reward_feedback_core.js';

test('global rewards queue above UI and auto-hide without closing or focusing it',t=>{
    t.mock.timers.enable({apis:['setTimeout']});
    class Node {constructor(){this.children=[];this.attrs={};this.hidden=false;this.open=false;}setAttribute(k,v){this.attrs[k]=v;}append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}showPopover(){this.open=true;}hidePopover(){this.open=false;}matches(){return this.open;}remove(){this.removed=true;}}
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

test('equipment notice shows only actual positive deltas and preserves units',()=>{
    const before=[{key:'hp',value:100},{key:'attack',value:5},{key:'defense',value:10}];
    const after=[{key:'hp',label:'最大生命',value:120,unit:''},{key:'attack',label:'攻击',value:7,unit:'%'},{key:'defense',label:'防御',value:8,unit:'%'}];
    assert.deepEqual(equipmentGainLines(before,after),['最大生命 +20','攻击 +2%']);
    assert.deepEqual(equipmentGainLines(after,after),[]);
});
