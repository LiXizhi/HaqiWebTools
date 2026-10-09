import test from 'node:test';
import assert from 'node:assert/strict';
import {assignPlayerInput,assignedKeyboardAction,createPadTransitions,normalizePlayerInputs,standardPadActions} from '../js/player_input_core.js';
import {DEFAULT_LOCAL_KEYS} from '../js/local_controls_core.js';
import {normalizeGameSettings} from '../js/game_settings_core.js';
const device={type:'gamepad',index:0,id:'Xbox standard test'};
const pad=(buttons=[],axes=[0,0])=>({index:0,id:device.id,connected:true,mapping:'standard',axes,buttons:Array.from({length:17},(_,i)=>({pressed:buttons.includes(i),value:buttons.includes(i)?1:0}))});
test('device assignments route either keyboard bank and swap occupied devices',()=>{
    let inputs=normalizePlayerInputs();inputs=assignPlayerInput(inputs,0,device);inputs=assignPlayerInput(inputs,1,{type:'keyboard-mouse'});
    assert.deepEqual(assignedKeyboardAction(inputs,DEFAULT_LOCAL_KEYS,'KeyW'),{owner:1,action:'up'});
    assert.deepEqual(assignedKeyboardAction(inputs,DEFAULT_LOCAL_KEYS,'Enter'),{owner:1,action:'confirm'});
    assert.deepEqual(assignPlayerInput(inputs,1,device),[{type:'keyboard-mouse'},device]);
    assert.deepEqual(assignPlayerInput(inputs,0,{type:'keyboard-left'}),[{type:'keyboard-left'},device]);
    assert.deepEqual(normalizeGameSettings({playerInputs:inputs}).playerInputs,inputs);
});
test('keyboard banks swap; full keyboard releases the other bank when swapping still overlaps',()=>{
    const defaults=normalizePlayerInputs();
    assert.deepEqual(assignPlayerInput(defaults,0,{type:'keyboard-right'}),[{type:'keyboard-right'},{type:'keyboard-left'}]);
    assert.deepEqual(assignPlayerInput(defaults,1,{type:'keyboard-left'}),[{type:'keyboard-right'},{type:'keyboard-left'}]);
    assert.deepEqual(assignPlayerInput(defaults,0,{type:'keyboard-mouse'}),[{type:'keyboard-mouse'},{type:'none'}]);
    assert.deepEqual(normalizePlayerInputs(),defaults);
});
test('standard pad dead zone and Xbox buttons map to gameplay actions',()=>{
    assert.deepEqual(standardPadActions(pad([],[.2,-.2])),[]);
    assert.deepEqual(standardPadActions(pad([0,5],[.8,-.8])),['confirm','pass','up','right']);
    assert.deepEqual(standardPadActions({...pad([0]),mapping:''}),[]);
});
test('held buttons do not retrigger selections; directions repeat; disconnect releases immediately',()=>{
    const state=createPadTransitions();assert.deepEqual(state.step(0,device,pad(),0),[]);
    assert.deepEqual(state.step(0,device,pad([0,15]),10),[{action:'confirm',down:true,repeat:false},{action:'right',down:true,repeat:false}]);
    assert.deepEqual(state.step(0,device,pad([0,15]),100),[]);
    assert.deepEqual(state.step(0,device,pad([0,15]),400),[{action:'right',down:true,repeat:true}]);
    assert.deepEqual(state.step(0,device,null,420),[{action:'confirm',down:false},{action:'right',down:false}]);
    assert.deepEqual(state.step(0,device,pad([0]),500),[]);
    state.step(0,device,pad(),600);assert.equal(state.step(0,device,pad([0]),700)[0].action,'confirm');
});
test('focus loss and device changes release old movement without adopting a replacement pad',()=>{
    const state=createPadTransitions();state.step(0,device,pad(),0);state.step(0,device,pad([12]),10);
    assert.deepEqual(state.step(0,device,pad([12]),20,false),[{action:'up',down:false}]);
    assert.deepEqual(state.step(0,device,{...pad([0]),id:'unrelated controller'},30),[]);
    assert.deepEqual(state.step(1,device,pad([0]),30),[]);
});
