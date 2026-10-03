import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {bindTouchMovement} from '../js/view_adventure_movement.js';
import {createStoryChat} from '../js/language_story.js';
import {recordLearningCompletion} from '../js/language_adventure_core.js';

const app=fs.readFileSync(new URL('../js/adventure_app.js',import.meta.url),'utf8');
// Execute the real application wiring: the isolated story fixture alone cannot
// catch HUD refresh -> conversation.close regressions.
const wiring=app.split(/\r?\n/).find(line=>line.startsWith('const touchMovement=bindTouchMovement'));
const reset=app.split(/\r?\n/).find(line=>line.startsWith('function resetMovementInput()'));
const hud=app.split(/\r?\n/).find(line=>line.startsWith('function paintHud()'));
const catalog=JSON.parse(fs.readFileSync(new URL('../data/adventure/camp-conversations.json',import.meta.url)));
const profile=catalog.profiles.find(row=>row.npcId===36205),story=profile.stories[0];

test('real HUD refresh preserves NPC dialogue after every spoken reward and final settlement',async()=>{
    const surface=new EventTarget();surface.hasPointerCapture=()=>false;
    let callbacks,ui,chat,awards=0,closed=0,transcript='';
    const state={stage:'world',role:'test',identity:'test',content:{},save:{zone:'camp',inventory:{},languageLearning:{enabled:true,target:'en',native:'zh-CN'},languageAdventure:{version:1,progress:{}}}};
    const context=vm.createContext({bindTouchMovement,nodes:{world:surface},touchIndicator:{hidden:true},stage:'world',panel:null,dialog:null,keys:new Set(),joystick:{x:0,y:0},heldPointer:null,path:['keep'],destination:'keep',talkApproach:null,
        languageAdventure:{get active(){return chat?.active;},close(){closed++;chat.close();}}});
    Object.assign(context,{V:{renderHud(){}},model:()=>({}),openPanel(){},track(){},untrack(){},exitDungeon(){},interactNearest(){}});
    vm.runInContext(wiring+'\n'+reset+'\n'+hud,context);
    const refreshHud=()=>vm.runInContext('paintHud()',context);
    chat=createStoryChat({getState:()=>state,onSpeech:()=>{awards++;refreshHud();return {key:'attack',percent:awards,total:awards};},
        voice:{cancel:async()=>{},speak:async()=>{},start:async()=>{},finish:async()=>transcript},
        commit:completion=>{const result=recordLearningCompletion(state.save,{},completion,{learningCompletion:completion});refreshHud();return result;},
        viewFactory:cb=>{callbacks=cb;return {close(){},render:s=>{ui=s;}};}});
    chat.open(profile,story,null);await new Promise(resolve=>setImmediate(resolve));
    for(const [index,turn] of story.turns.entries()){
        transcript=turn.answer.en;await callbacks.start();await callbacks.finish();chat.tick();
        assert.equal(chat.active,true,`spoken turn ${index+1} must stay open`);
        assert.equal(closed,0);assert.equal(ui.index,Math.min(index+1,2));
    }
    assert.equal(ui.done,true);assert.equal(awards,3);assert.equal(ui.received,10);
    for(let i=0;i<3;i++)refreshHud();
    assert.equal(chat.active,true);assert.equal(closed,0);
    assert.deepEqual(Array.from(context.path),['keep'],'stopping input does not clear unrelated navigation');
    callbacks.close();assert.equal(chat.active,false);
});
