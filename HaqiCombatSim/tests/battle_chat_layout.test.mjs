import test from 'node:test';
import assert from 'node:assert/strict';
import {battleSpeechController,updateBattleSpeech} from '../js/view_battle_pet_hint.js';
import {createActorSpeech} from '../js/view_actor_speech.js';

function bubble(id,width=120){return {dataset:{caster:id},style:{setProperty(){}},offsetWidth:width,offsetHeight:40,remove(){},hidden:false};}
function fixture(width=390){
    const hero=bubble('hero'),pet=bubble('pet');
    const root={clientWidth:width,clientHeight:500,querySelectorAll:()=>[hero,pet]};
    const battle={completedDecisions:1,sides:{near:[{id:'hero'}],far:[]}};
    const canvas={clientHeight:270,offsetLeft:10,offsetTop:30,battlePositions:{hero:{x:130,y:300}},battleSpeechAnchors:{hero:{x:145,y:140}}};
    return {root,battle,canvas,hero,pet};
}
test('speech uses the mounted rendered head rather than a fixed foot offset',()=>{
    const {root,battle,canvas,hero}=fixture();
    battleSpeechController(battle).say('hero','Heal me!');
    updateBattleSpeech(root,battle,canvas,0);
    assert.equal(hero.style.left,'95px');
    assert.equal(hero.style.top,'120px');
    canvas.battleSpeechAnchors.hero.y=100;
    updateBattleSpeech(root,battle,canvas,1);assert.equal(hero.style.top,'80px');
});
test('player speech stays above overlapping pet advice at desktop and mobile widths',()=>{
    for(const width of [390,1280]){
        const {root,battle,canvas,hero,pet}=fixture(width);
        pet.style.left='120px';pet.style.top='160px';root.battlePetHint=pet;
        canvas.battleSpeechAnchors.hero.y=220;
        battleSpeechController(battle).say('hero','Heal me!');
        // The passive hint is not an actor-speech DOM node.
        root.querySelectorAll=()=>[hero];
        updateBattleSpeech(root,battle,canvas,0);
        assert.equal(hero.hidden,false);assert.equal(pet.hidden,false);
        assert.ok(parseFloat(hero.style.top)+hero.offsetHeight<parseFloat(pet.style.top));
    }
});
test('hero stays above simultaneous pet speech regardless of queue insertion order',()=>{
    for(const order of [['hero','pet'],['pet','hero']]){
        const {root,hero,pet}=fixture(),speech=createActorSpeech();
        for(const id of order)speech.say(id,id);
        speech.render(root,{hero:{x:150,y:240,aboveOthers:true},pet:{x:150,y:240}},0);
        assert.equal(hero.hidden,false);assert.equal(pet.hidden,false);
        assert.ok(parseFloat(hero.style.top)+40<parseFloat(pet.style.top));
    }
});
test('insufficient vertical room suppresses pet advice instead of hiding player speech',()=>{
    const {root,battle,canvas,hero,pet}=fixture();
    pet.style.left='120px';pet.style.top='8px';root.battlePetHint=pet;
    root.querySelectorAll=()=>[hero];
    battleSpeechController(battle).say('hero','Help!');updateBattleSpeech(root,battle,canvas,0);
    assert.equal(hero.hidden,false);assert.equal(pet.hidden,true);
});
