import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpeningController} from '../js/adventure/opening_controller.js';
import {createSceneNavigationController} from '../js/adventure/scene_navigation_controller.js';

test('tracking a camp toy only walks; explicit nearby interaction commits discovery once',()=>{
 const target={id:'mushroom',kind:'camp-toy',x:10,y:20};let calls=0,commits=0,prepared=0,walks=[];
 const save={zone:'camp',position:{x:10,y:20},openingJourney:{phase:'done',detour:{step:0,crystals:0,paused:false}}};
 const renderer={campToys:{rows:[target],prepare:()=>prepared++,planInteraction:()=>commits?null:{response:{sound:'heal'},commit:()=>{commits++;return true;}},nearest:()=>target}};
 const state={
  stage:'world',save,world:{},renderer,panel:null,dialog:null,encounterStarting:false,
  characterChat:{active:false},secondCharacterChat:null,keys:new Set(),
  clearMovementPath(){},
 };
 const previousMatchMedia=globalThis.matchMedia;
 globalThis.matchMedia=()=>({matches:true});
 try{
  const opening=createOpeningController({
   nodes:{hud:{querySelector:()=>null}},
   getContext:()=>state,
   close(){},paintHud(){},toast(){},
   walkTo:(t,auto)=>walks.push({t,auto}),
  });
  const nav=createSceneNavigationController({
   nodes:{hud:{querySelector:()=>null}},
   getContext:()=>state,
   close(){},paintHud(){},toast(){},
   performAction:()=>{calls++;save.openingJourney.detour.step=3;return true;},
   heroNavigation:{cancel(){}},
   adaptiveGraphics:{effects:()=>({particles:false})},
   gameSettings:{value:{}},
   spellSound:{play(){}},
   localPlay:()=>({paused:false,tryGather:()=>false}),
  });
  opening.trackCampDetour();assert.equal(prepared,1);assert.equal(walks.length,1);assert.equal(walks[0].auto,false);assert.equal(calls,0);assert.equal(commits,0);
  nav.interactNearest();assert.equal(calls,1);assert.equal(commits,1);
  // Direct repeated tap has no new plan; it cannot issue a second discovery action.
  nav.interact(target);assert.equal(calls,1);assert.equal(commits,1);
 }finally{
  if(previousMatchMedia===undefined)delete globalThis.matchMedia;
  else globalThis.matchMedia=previousMatchMedia;
 }
});
