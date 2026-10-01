import test from 'node:test';
import assert from 'node:assert/strict';
import {createLanguageAdventure} from '../js/language_adventure.js';

function harness(load) {
    const state={stage:'battle',role:'r',identity:'guest',save:{zone:'camp',languageLearning:{enabled:true,target:'en',native:'zh-CN'},inventory:{},pets:{}},content:{items:{}}};
    let renders=0,loads=0;
    const controller=createLanguageAdventure({getState:()=>state,commit:()=>assert.fail('battle must not grant dialogue rewards'),notify:()=>{},
        load:async()=>{loads++;return load();},voice:{cancel:async()=>{}},
        viewFactory:()=>({render(){renders++;},close(){}})});
    return {state,controller,get renders(){return renders;},get loads(){return loads;}};
}
const catalog=()=>({languages:{en:{content:true}},dictionaries:{en:{hello:'hello'}},profiles:[],npcs:{},courses:[]});

test('battle cannot open old dialogue courses even through a direct controller call',async()=>{
    const h=harness(catalog);
    await h.controller.open();
    assert.equal(h.loads,0);
    assert.equal(h.renders,0);
    assert.equal(h.controller.active,false);
});

test('entering battle during a pending dialogue load cannot reopen it',async()=>{
    let resolve;
    const h=harness(()=>new Promise(r=>{resolve=r;}));
    h.state.stage='world';
    const pending=h.controller.open();
    h.state.stage='battle';
    resolve(catalog());
    await pending;
    assert.equal(h.renders,0);
    assert.equal(h.controller.active,false);
});

test('entering battle closes an existing world lesson',async()=>{
    const h=harness(catalog);
    h.state.stage='world';
    await h.controller.open();
    assert.equal(h.controller.active,true);
    h.state.stage='battle';
    h.controller.tick(1);
    assert.equal(h.controller.active,false);
    assert.equal(h.controller.invitation,null);
});
