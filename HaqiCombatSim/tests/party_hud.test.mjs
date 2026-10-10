import test from 'node:test';
import assert from 'node:assert/strict';
import {sceneMountSave} from '../js/adventure_mounts_core.js';
import {teamHudButton} from '../js/view_adventure_social_hud.js';

test('party walking is temporary and does not unequip the mount or change preference',()=>{
    for(const mountHidden of [false,true]){
        const save=Object.freeze({mountId:123,mountHidden});
        assert.equal(sceneMountSave(save,{inParty:true}).mountId,null);
        assert.equal(sceneMountSave({...save,coopRun:{members:[]}}).mountId,null);
        assert.equal(save.mountId,123);
        assert.equal(save.mountHidden,mountHidden);
        assert.equal(sceneMountSave(save).mountId,mountHidden?null:123);
    }
});

test('team HUD counts only occupied members plus hero and opens team management',t=>{
    class Element{
        constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.attributes={};this.classList={add(){}};}
        append(...children){this.children.push(...children);}
        setAttribute(key,value){this.attributes[key]=value;}
        querySelector(tag){return this.children.find(c=>c.tag===tag)||this.children.map(c=>c.querySelector(tag)).find(Boolean);}
    }
    const previous=globalThis.document;
    globalThis.document={createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag)};
    t.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
    const calls=[],open=id=>calls.push(id);
    assert.equal(teamHudButton([],null,open),null);
    for(const [team,coop,count] of [
        [[{id:'peer'},null],null,2],
        [[{id:'a'},{id:'b'},{id:'c'}],null,4],
        [[],{members:[{profile:{id:'peer'}}]},2],
    ]){
        const button=teamHudButton(team,coop,open);
        assert.equal(button.attributes['aria-label'],`队伍管理（${count}人）`);
        assert.equal(button.children.at(-1).textContent,String(count));
        button.onclick();
    }
    assert.deepEqual(calls,['social-party','social-party','social-party']);
    for(const count of [1,2]){
        const team=Array.from({length:count},(_,i)=>({id:`guest${i}`}));
        const button=teamHudButton(team,null,open,{name:'第二位玩家'});
        assert.equal(button.attributes['aria-label'],`队伍管理（${count+2}人）`);
    }
    assert.equal(teamHudButton([],null,open),null,'leaving removes the entry');
});
