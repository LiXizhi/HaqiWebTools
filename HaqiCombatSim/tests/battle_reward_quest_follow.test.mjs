import test from 'node:test';
import assert from 'node:assert/strict';
import {createRewardFeedback} from '../js/views/adventure/view_adventure_rewards.js';
import {createQuestDialogueController} from '../js/adventure/quest_dialogue_controller.js';
import {createWorldInteractionController} from '../js/adventure/world_interaction_controller.js';

class NodeStub {
    constructor(){this.children=[];this.hidden=false;this.classList={add(){},remove(){}};}
    append(...children){this.children.push(...children);}
    replaceChildren(...children){this.children=children;}
    setAttribute(){}
}

function fixture(t,{activate=()=>true}={}){
    const previous=globalThis.document;
    globalThis.document=Object.assign(new EventTarget(),{createElement:()=>new NodeStub()});
    t.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
    const root=new NodeStub();
    const feedback=createRewardFeedback(root,{describe:item=>({name:item.name,label:'查看'}),activate});
    const state={
        stage:'world',roleEpoch:1,panel:null,destination:null,path:[],
        save:{zone:'camp',position:{x:10,y:20},ids:[1]},
        assets:{content:{quests:[{id:1},{id:2}]}},
        dialog:{npcId:10,fromQuestTracking:true,lines:[{}],index:0},
        setDialog(next){this.dialog=next;},setDialogDone(next){this.dialogDone=next;},
    };
    const followed=[];
    const controller=createQuestDialogueController({
        nodes:{overlay:{}},getContext:()=>state,model:()=>({}),
        close:()=>{state.dialog=null;},rewardFeedback:feedback,
        trackedQuestIdsFn:save=>save.ids,
        onTrack:(id,options)=>{
            assert.equal(feedback.hasPendingItems,false);
            assert.equal(state.dialog,null);
            followed.push({id,options});
        },
        missingRewardPets:()=>[],loadPet(){},persist(){},queueCloudSave(){},paintHud(){},
        currentQuestFn:()=>null,petScene:()=>({dialogue(){}}),safely:callback=>callback(),
        renderDialogue(){},opening:{},
    });
    const push=(id='fire')=>feedback.push({items:[{kind:'card',key:id,name:id,count:1}]});
    const click=label=>{
        const button=root.children[1].children.find(node=>node.textContent===label);
        assert.ok(button,`missing reward button: ${label}`);button.onclick();
    };
    return {state,feedback,controller,followed,push,click};
}

function movementFixture(t){
    const f=fixture(t);
    Object.assign(f.state,{
        world:{zone:'camp'},keys:new Set(),
        setDestination(next){this.destination=next;},
        setPath(next){this.path=next;},
        clearMovementPath(){this.path=[];this.destination=null;},
        setHeldPointer(next){this.heldPointer=next;},
        setTalkApproach(next){this.talkApproach=next;},
    });
    const requests=[];
    const surface=Object.assign(new EventTarget(),{
        focus(){},getBoundingClientRect:()=>({left:0,top:0}),setPointerCapture(){},
    });
    const movement=createWorldInteractionController({
        nodes:{world:surface},getContext:()=>f.state,
        close:()=>{f.state.dialog=null;},
        onMovementIntent:()=>f.controller.cancelRewardFollow(),
        heroNavigation:{cancel(){},request(_world,_from,_target,options){requests.push(options.onResult);}},
        framePacer:{wake(){}},toast(){},
        localPlay:()=>({key:()=>false}),languageAdventure:{active:false,close(){}},
        sceneLoading:{active:false},sceneFishing:{key:()=>false},
    });
    f.push();f.controller.finishTrackedDialogue();f.feedback.tick(0,true);
    return {...f,movement,requests,surface};
}

test('a blank map walk awaiting its path cancels the old reward continuation before movement starts',t=>{
    const f=movementFixture(t);
    f.movement.walkTo({x:300,y:100});
    assert.equal(f.requests.length,1);
    assert.equal(f.state.destination,null);assert.deepEqual(f.state.path,[]);
    assert.deepEqual(f.state.save.position,{x:10,y:20});
    f.click('收下');assert.deepEqual(f.followed,[]);
    const route=[{x:300,y:100}];f.requests[0](route);
    assert.deepEqual(f.state.path,route);assert.deepEqual(f.followed,[]);
});

test('a direction press and release before a frame cancels the old reward continuation',t=>{
    const f=movementFixture(t);
    f.movement.controllerAction('right',true);
    f.movement.controllerAction('right',false);
    assert.equal(f.state.keys.size,0);
    assert.deepEqual(f.state.save.position,{x:10,y:20});
    f.click('收下');assert.deepEqual(f.followed,[]);
});

for(const input of ['keyboard','mouse hold'])test(`${input} cancels reward following before the player changes position`,t=>{
    const previous=globalThis.window;
    globalThis.window=new EventTarget();
    t.after(()=>{if(previous===undefined)delete globalThis.window;else globalThis.window=previous;});
    const f=movementFixture(t);f.movement.bindEvents();
    if(input==='keyboard'){
        const event=new Event('keydown');Object.assign(event,{key:'d'});
        window.dispatchEvent(event);
        const release=new Event('keyup');Object.assign(release,{key:'d'});window.dispatchEvent(release);
        assert.equal(f.state.keys.size,0);
    }else{
        const event=new Event('pointerdown');
        Object.assign(event,{pointerType:'mouse',pointerId:1,button:0,clientX:300,clientY:100});
        f.surface.dispatchEvent(event);
        assert.equal(f.state.heldPointer.active,false);
    }
    assert.deepEqual(f.state.save.position,{x:10,y:20});
    f.click('收下');assert.deepEqual(f.followed,[]);
});

test('tracked dialogue resumes its sole accepted quest once after the last queued reward is collected',async t=>{
    const f=fixture(t);f.push();
    await f.controller.nextDialogue();
    assert.deepEqual(f.followed,[]);assert.equal(f.state.dialog,null);
    f.feedback.tick(0,false);assert.deepEqual(f.followed,[]);
    f.feedback.tick(100,true);assert.deepEqual(f.followed,[]);
    f.click('收下');
    assert.deepEqual(f.followed,[{id:1,options:{pin:false}}]);
    f.feedback.tick(5000,true);assert.equal(f.followed.length,1);
});

test('another pending reward delays continuation until both receipts are handled',t=>{
    const f=fixture(t);f.push();f.controller.finishTrackedDialogue();f.feedback.tick(0,true);
    f.push('ice');f.click('收下');assert.deepEqual(f.followed,[]);
    f.feedback.tick(100,true);f.click('收下');assert.equal(f.followed.length,1);
});

test('opening the card panel from a receipt keeps the player in that panel',t=>{
    let state;
    const f=fixture(t,{activate:()=>{state.panel='deck';return true;}});state=f.state;
    f.push();f.controller.finishTrackedDialogue();f.feedback.tick(0,true);f.click('查看');
    assert.equal(state.panel,'deck');assert.deepEqual(f.followed,[]);
});

test('reset discards an old continuation instead of reviving it with a later reward',t=>{
    const f=fixture(t);f.push();f.controller.finishTrackedDialogue();f.feedback.reset();
    f.push('ice');f.feedback.tick(0,true);f.click('收下');assert.deepEqual(f.followed,[]);
});

for(const [name,change] of [
    ['role epoch',s=>s.roleEpoch++],
    ['save identity',s=>s.save=structuredClone(s.save)],
    ['zone',s=>s.save.zone='forest'],
    ['horizontal movement',s=>s.save.position.x++],
    ['vertical movement',s=>s.save.position.y++],
    ['stage',s=>s.stage='battle'],
    ['panel',s=>s.panel='inventory'],
    ['dialogue',s=>s.dialog={npcId:20}],
    ['destination',s=>s.destination={x:30,y:40}],
    ['path',s=>s.path.push({x:30,y:40})],
    ['untracked quest',s=>s.save.ids=[]],
    ['multiple tracked quests',s=>s.save.ids=[1,2]],
    ['changed quest',s=>s.save.ids=[2]],
])test(`deferred following is cancelled after ${name} changes`,t=>{
    const f=fixture(t);f.push();f.controller.finishTrackedDialogue();change(f.state);
    f.feedback.tick(0,true);f.click('收下');assert.deepEqual(f.followed,[]);
});

test('starting another dialogue cancels the previous follow request even after that dialogue closes',t=>{
    const f=fixture(t);f.push();f.controller.finishTrackedDialogue();
    f.state.dialog={npcId:20};f.controller.startLines([{}],'继续',()=>{});f.state.dialog=null;
    f.feedback.tick(0,true);f.click('收下');assert.deepEqual(f.followed,[]);
});

test('a new tracked reply replaces an older continuation rather than stacking two walks',t=>{
    const f=fixture(t);f.push();f.controller.finishTrackedDialogue();
    f.state.dialog={npcId:20,fromQuestTracking:true};f.state.save.ids=[2];f.controller.finishTrackedDialogue();
    f.feedback.tick(0,true);f.click('收下');assert.deepEqual(f.followed,[{id:2,options:{pin:false}}]);
});

test('pending rewards do not pick a quest when none or several are tracked',t=>{
    const f=fixture(t);f.push();f.state.save.ids=[1,2];f.controller.finishTrackedDialogue();
    f.state.save.ids=[1];f.feedback.tick(0,true);f.click('收下');assert.deepEqual(f.followed,[]);
});

test('banner expiry does not dismiss an unhandled receipt or resume walking',t=>{
    const f=fixture(t);f.push();f.controller.finishTrackedDialogue();f.feedback.tick(0,true);
    f.feedback.tick(6000,true);
    assert.equal(f.feedback.hasPendingItems,true);assert.deepEqual(f.followed,[]);
    f.click('收下');assert.equal(f.followed.length,1);
});

test('a reward arriving after the banner window preserves both pending receipts',t=>{
    const f=fixture(t);f.push();f.controller.finishTrackedDialogue();f.feedback.tick(0,true);
    f.push('ice');f.feedback.tick(6000,true);
    f.click('下一件（1）');assert.equal(f.feedback.hasPendingItems,true);assert.deepEqual(f.followed,[]);
    f.click('收下');assert.equal(f.followed.length,1);
});

test('rejected reward activation leaves the receipt pending until explicitly collected',t=>{
    const f=fixture(t,{activate:()=>false});f.push();f.controller.finishTrackedDialogue();f.feedback.tick(0,true);
    f.click('查看');assert.equal(f.feedback.hasPendingItems,true);assert.deepEqual(f.followed,[]);
    f.click('收下');assert.equal(f.followed.length,1);
});

test('in-place equipment mutation with a synchronous refresh resumes only after activation succeeds',t=>{
    let f;
    f=fixture(t,{activate:reward=>{
        f.state.save.equipment={boots:reward.id};
        f.feedback.tick(100,true);
        assert.deepEqual(f.followed,[]);
        return true;
    }});
    const original=f.state.save;
    f.feedback.push({items:[{kind:'item',gear:true,id:42,name:'boots',count:1}]});
    f.controller.finishTrackedDialogue();f.feedback.tick(0,true);f.click('查看');
    assert.equal(f.state.save,original);assert.equal(f.state.save.equipment.boots,42);
    assert.deepEqual(f.followed,[{id:1,options:{pin:false}}]);
    f.feedback.tick(6000,true);assert.equal(f.followed.length,1);
});
