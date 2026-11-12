import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../js/adventure_app.js',import.meta.url),'utf8');
const extract=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end));
test('tracking a camp toy only walks; explicit nearby interaction commits discovery once',()=>{
 const target={id:'mushroom',kind:'camp-toy',x:10,y:20};let calls=0,commits=0,prepared=0,walks=[];
 const ctx=vm.createContext({stage:'world',save:{zone:'camp',position:{x:10,y:20}},world:{},nodes:{hud:{querySelector:()=>null}},
 campDetourGoal:()=>calls?null:{id:'mushroom'},campDetour:()=>null,
 renderer:{campToys:{rows:[target],prepare:()=>prepared++,planInteraction:()=>commits?null:{response:{sound:'heal'},commit:()=>{commits++;return true;}},nearest:()=>target}},
 close(){},paintHud(){},toast(){},walkTo:(t,auto)=>walks.push({t,auto}),
 localPlay:{paused:false,tryGather:()=>false},encounterStarting:false,heroNavigation:{cancel(){}},path:[],destination:null,keys:new Set(),
 performance:{now:()=>1000},performAction:()=>{calls++;return true;},spellSound:{play(){}},matchMedia:()=>({matches:true}),
 W:{distance:(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),nearestInteraction:()=>({kind:'npc'})},panel:null,dialog:null,characterChat:{active:false},secondCharacterChat:null
 });
 vm.runInContext(extract('function trackCampDetour(', 'function trackOpeningJourney(')+extract('function interact(target)', 'function nearbySceneInteraction(')+extract('function nearbySceneInteraction(', 'function requestHeroPath('),ctx);
 ctx.trackCampDetour();assert.equal(prepared,1);assert.equal(walks.length,1);assert.equal(walks[0].auto,false);assert.equal(calls,0);assert.equal(commits,0);
 ctx.interactNearest();assert.equal(calls,1);assert.equal(commits,1);
 // Direct repeated tap has no new plan; it cannot issue a second discovery action.
 ctx.interact(target);assert.equal(calls,1);assert.equal(commits,1);
});
