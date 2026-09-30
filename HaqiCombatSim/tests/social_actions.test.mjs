import test from 'node:test';
import assert from 'node:assert/strict';
import {socialActionOptions,socialGesturePose} from '../js/adventure_social_actions_core.js';

test('strangers get free expressions, actual friendship unlocks exclusive expressions',()=>{
    const options=friend=>socialActionOptions({profile:{kind:'account'},friend,affinity:0});
    assert.ok(options(false).filter(a=>['greet','smile','clap','jump'].includes(a.id)).every(a=>!a.disabled));
    assert.ok(options(false).filter(a=>a.friend).every(a=>a.disabled));
    assert.ok(options(true).filter(a=>a.friend).every(a=>!a.disabled));
});
test('AI characters have no friend-only actions and use verified affinity tiers',()=>{
    const options=affinity=>socialActionOptions({profile:{kind:'companion'},affinity});
    assert.ok(options(100).every(a=>!a.friend));
    assert.equal(options(null).find(a=>a.id==='dance').disabled,true);
    assert.equal(options(29).find(a=>a.id==='dance').disabled,true);
    assert.equal(options(30).find(a=>a.id==='dance').disabled,false);
    assert.equal(options(59).find(a=>a.id==='cheer').disabled,true);
    assert.equal(options(60).find(a=>a.id==='cheer').disabled,false);
});
test('paired jumps have bounded lifetime and respect reduced motion',()=>{
    const effect={ids:['hero','peer'],action:'jump',at:1000,until:4600};
    assert.ok(socialGesturePose(effect,'hero',1200).hop>0);
    assert.ok(socialGesturePose(effect,'peer',1400).hop>0);
    assert.equal(socialGesturePose(effect,'hero',1200,true).hop,0);
    assert.equal(socialGesturePose(effect,'outsider',1200),null);
    assert.equal(socialGesturePose(effect,'hero',4600),null);
});

import {renderSocialActions,socialActionsHeading} from '../js/view_social_actions.js';
class Element{
    constructor(tag,text=''){this.tag=tag;this.text=text;this.children=[];this.attributes={};this.dataset={};this.classList={add(){}};}
    append(...nodes){this.children.push(...nodes);}
    setAttribute(key,value){this.attributes[key]=value;}
}
const nodes=root=>[root,...root.children.flatMap(nodes)];
test('heading names the person and relation, dock invites before greeting',t=>{
    const old={document:globalThis.document,Node:globalThis.Node,requestAnimationFrame:globalThis.requestAnimationFrame};
    Object.assign(globalThis,{Node:Element,document:{createElement:tag=>new Element(tag),createTextNode:text=>new Element('text',text)},requestAnimationFrame:()=>{}});
    t.after(()=>{for(const [key,value]of Object.entries(old))if(value===undefined)delete globalThis[key];else globalThis[key]=value;});
    for(const kind of ['account','companion']){
        const body=new Element('div'),box=new Element('section'),calls=[];
        const p={id:'peer',userId:'42',kind,name:'伙伴'},state={selected:p,friends:[],team:[],actionAffinity:0};
        renderSocialActions(box,body,state,{assets:()=>({content:{}}),gesture:id=>calls.push(id),profile:peer=>calls.push(peer.id),invite(){}});
        const buttons=nodes(body).filter(n=>n.tag==='button');
        assert.equal(socialActionsHeading(state),'伙伴 · 陌生人 · 临时好感 0');
        assert.equal(nodes(body).some(n=>n.text==='伙伴 · 陌生人'),false);
        assert.equal(buttons[0].attributes['aria-label'],'邀请组队');
        assert.equal(buttons[1].attributes['aria-label'],'打招呼');
        assert.equal(buttons.at(-1).attributes['aria-label'],'查看信息');
        assert.equal(buttons.some(b=>b.attributes['aria-label']==='加好友'),kind==='account');
        buttons[1].onclick();buttons.at(-1).onclick();assert.deepEqual(calls,['greet','peer']);
    }
});

import {socialBubble,pickSocialBubble} from '../js/adventure_social_motion_core.js';
import {socialHeadAnchor} from '../js/adventure_social_actions_core.js';
test('paired expressions replace the invitation visually and in hit testing until they finish',()=>{
    const leader={x:100,y:150},actors=[{profile:{id:'peer'},position:{x:140,y:150}}];
    const bubble=socialBubble(actors,leader),point={x:bubble.x+20,y:bubble.y+15};
    assert.deepEqual(point,socialHeadAnchor(actors[0].position));
    assert.equal(socialHeadAnchor(leader).y,point.y,'both actors use the same overhead height');
    for(const action of ['greet','clap','jump']){
        const gesture={ids:['hero','peer'],action,at:1000,until:4600};
        assert.equal(socialBubble(actors,leader,{gesture,at:1200}),null);
        assert.equal(pickSocialBubble(actors,leader,point,{gesture,at:1200}),null);
        assert.equal(pickSocialBubble(actors,leader,point,{gesture,at:4600})?.id,'peer');
    }
});

test('party membership hides only the member invitation and hit target, and leaving restores them',()=>{
    const leader={x:100,y:150},actors=[{profile:{id:'peer'},position:{x:140,y:150},inParty:false}];
    const head=socialHeadAnchor(actors[0].position);
    assert.equal(pickSocialBubble(actors,leader,head)?.id,'peer');
    // The captain being grouped does not make every nearby person a teammate.
    assert.equal(socialBubble(actors,leader,{inParty:true})?.profile.id,'peer');
    assert.equal(pickSocialBubble(actors,leader,head,{inParty:true})?.id,'peer');
    actors[0].inParty=true;
    assert.equal(socialBubble(actors,leader),null);
    assert.equal(pickSocialBubble(actors,leader,head),null);
    actors[0].inParty=false;
    assert.equal(pickSocialBubble(actors,leader,head,{inParty:false})?.id,'peer');
});

test('a closer teammate does not hide the nearby outsider invitation or intercept its hit target',()=>{
    const leader={x:100,y:150},actors=[
        {profile:{id:'teammate'},position:{x:110,y:150},inParty:true},
        {profile:{id:'outsider'},position:{x:160,y:150},inParty:false},
    ];
    const options={inParty:true};
    assert.equal(socialBubble(actors,leader,options)?.profile.id,'outsider');
    assert.equal(pickSocialBubble(actors,leader,socialHeadAnchor(actors[1].position),options)?.id,'outsider');
    assert.equal(pickSocialBubble(actors,leader,socialHeadAnchor(actors[0].position),options),null);
    actors[1].position.x=1000;
    assert.equal(socialBubble(actors,leader,options),null);
});

import {heroSocialLookPeers} from '../js/adventure_social_motion_core.js';
import {createHeroActor,updateHeroActor} from '../js/hero_pose_core.js';
test('captain drops peer gaze while grouped, preserves movement facing and restores solo gaze',()=>{
    const actors=[{profile:{id:'teammate'},position:{x:-40,y:0},moving:false,inParty:false}];
    const actor=createHeroActor(1),pose=(time,options={})=>updateHeroActor(actor,{id:'hero',x:0,y:0,time,facing:2,lookAround:false,lookPeers:heroSocialLookPeers(actors,options),...options});
    assert.equal(pose(1).targetId,'teammate');
    const grouped=pose(2,{inParty:true});assert.equal(grouped.targetId,null);assert.equal(grouped.facing,2);
    assert.equal(pose(3,{inParty:true,dx:1,dy:0}).facing,2);
    actors[0].inParty=true;assert.equal(pose(4).targetId,null);
    actors[0].inParty=false;assert.equal(pose(5).targetId,'teammate');
});
