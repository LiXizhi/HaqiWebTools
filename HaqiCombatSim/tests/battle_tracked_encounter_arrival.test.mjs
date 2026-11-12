import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as W from '../js/adventure_world_core.js';
import {stepMonsterWander,releaseFieldPursuit,monsterScenePositions} from '../js/adventure_monster_motion_core.js';
const app=fs.readFileSync(new URL('../js/adventure_app.js',import.meta.url),'utf8');
const source=app.slice(app.indexOf('function trackedDestinationInteraction('),app.indexOf('// Walk to the resident named'));
function setup(x=300){
 const monster={id:'ice-scout',monsterId:'ice',x:300,y:300},world={encounters:[monster]},save={position:{x,y:300}};let entered=0;
 const context=vm.createContext({world,save,W,destination:null,path:[],close(){releaseFieldPursuit(world,save.position);W.resetAutoInteraction(world,save.position);},interact:()=>entered++,requestHeroPath:(_target,cb)=>cb([{x:300,y:300}]),toast(){}});
 vm.runInContext(source,context);return {context,world,save,monster,get entered(){return entered;}};
}
test('explicit tracked challenge works beside a monster held after closing a panel',()=>{
 const t=setup();for(let i=0;i<10;i++)stepMonsterWander(t.world,t.monster,.05,{x:0,y:0,w:800,h:600},{hero:t.save.position,ambient:false});
 releaseFieldPursuit(t.world,t.save.position);assert.equal(monsterScenePositions(t.world,t.monster)[0].holdUntilExit,true);assert.equal(W.takeAutoInteraction(t.world,t.save.position),null);
 t.context.walkTo({...t.monster,kind:'encounter'},true);assert.equal(t.entered,1);
});
test('explicit distant tracking challenges on arrival; ordinary movement keeps contact rules',()=>{
 const t=setup(500);t.context.walkTo({...t.monster,kind:'encounter'},true);assert.equal(t.entered,0);assert.equal(t.context.destination.explicitChallenge,true);
 assert.equal(t.context.trackedDestinationInteraction(t.context.destination,82),null);t.save.position.x=300;
 assert.equal(t.context.trackedDestinationInteraction(t.context.destination,82).id,'ice-scout');
 assert.equal(t.context.trackedDestinationInteraction({...t.monster,kind:'encounter'},82),null);
 for(const invalid of ['hidden','blocked','missing']){if(invalid==='hidden')t.monster.hidden=true;if(invalid==='blocked'){t.monster.hidden=false;t.monster.blocked=['quest'];}if(invalid==='missing')t.world.encounters=[];assert.equal(t.context.trackedDestinationInteraction(t.context.destination,82),null);}
});
