import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {npcHasActiveQuest} from '../js/adventure_npc_core.js';

const renderer=fs.readFileSync(new URL('../js/adventure_renderer.js',import.meta.url),'utf8');
const start=renderer.indexOf('        const invitedNpc=');
const invitation=renderer.slice(start,renderer.indexOf('        if(!world.portal.hidden)',start));
test('NPC invitation follows the selected instance with no follower pet and stays above its portrait',()=>{
    const context=vm.createContext({world:{npcs:[{id:1,instanceId:'other',x:5,y:5},{id:1,instanceId:'wanted',x:200,y:300}]},companionBubble:{npcId:1,instanceId:'wanted'},title:false,motionHidden:false,nearbyPartnerBubble:null,socialGesture:null,gestureAt:0,socialGesturePose:()=>null,markerFor:()=>null,npcHasActiveQuest,save:{},assets:{content:{}},ctx:{},t:0,reducedMotion:{matches:true},bubbleTarget:null,drawSpeechBubble:(_ctx,at)=>({x:at.x,y:at.y-82,w:32,h:29})});
    vm.runInContext(invitation,context);
    assert.equal(context.bubbleTarget.x,200);
    assert.ok(context.bubbleTarget.y<300-86);
    context.world.npcs[1].x=240;
    vm.runInContext(`{${invitation}}`,context);
    assert.equal(context.bubbleTarget.x,240);
    context.assets.content.quests=[{id:10,startNpc:1,endNpc:2,goals:[]}];
    context.save.quests={10:{accepted:true}};
    context.bubbleTarget=null;
    vm.runInContext(`{${invitation}}`,context);
    assert.equal(context.bubbleTarget,null,'active quest removes the optional chat hit target');
    context.save.quests[10].claimed=true;
    vm.runInContext(`{${invitation}}`,context);
    assert.equal(context.bubbleTarget.x,240,'chat returns after quest reward is claimed');
    context.markerFor=()=>'?';context.bubbleTarget=null;
    vm.runInContext(`{${invitation}}`,context);
    assert.equal(context.bubbleTarget,null,'quest marker takes priority');
    context.bubbleTarget=null;context.motionHidden=true;
    vm.runInContext(`{${invitation}}`,context);
    assert.equal(context.bubbleTarget,null);
});

test('active NPC quests include untracked chapter and catalog tasks until claimed',()=>{
    for(const quest of [
        {id:10,startNpc:1,endNpc:2},
        {id:10,startNpc:2,endNpc:1},
        {id:10,goals:[{kind:'talk',id:1}]},
        {id:10,groups:[{kind:'talk',items:[{id:1}]}]},
        {id:10,talks:[{npcId:1}]},
    ])for(const content of [{quests:[quest]},{catalogQuests:{quests:[quest]}}]){
        const save={quests:{10:{accepted:true}},trackedQuestIds:[]};
        assert.equal(npcHasActiveQuest(save,content,1),true);
        assert.equal(npcHasActiveQuest(save,content,99),false);
        save.quests[10].claimed=true;
        assert.equal(npcHasActiveQuest(save,content,1),false);
        save.quests[10]={accepted:false};
        assert.equal(npcHasActiveQuest(save,content,1),false);
    }
});
