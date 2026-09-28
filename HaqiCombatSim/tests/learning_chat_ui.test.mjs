import test from 'node:test';
import assert from 'node:assert/strict';
import {createLearningChatView} from '../js/view_learning_chat.js';
import {setTranslator} from '../js/locale_runtime.js';

test('English UI never translates Chinese teaching text; translation toggle works both ways',t=>{
    class Node extends EventTarget{
        constructor(tag){super();this.tag=tag;this.children=[];this.dataset={};this.hidden=false;this.className='';this.textContent='';this.scrollHeight=100;this.scrollTop=0;this.clientHeight=100;this.classList={toggle(){}};}
        append(...rows){this.children.push(...rows);}
        replaceChildren(...rows){this.children=rows;}
        setAttribute(){}
        focus(){}
        querySelectorAll(selector){const all=this.children.flatMap(n=>[n,...n.querySelectorAll('*')]);return selector==='button'?all.filter(n=>n.tag==='button'):all;}
    }
    const old=globalThis.document;globalThis.document={body:new Node('body'),createElement:tag=>new Node(tag),createElementNS:(_,tag)=>new Node(tag)};
    t.after(()=>{setTranslator(null);if(old===undefined)delete globalThis.document;else globalThis.document=old;});
    setTranslator(s=>s==='你好！'?'Hello!':s==='回答提示'?'Answer hint':s);
    const noop=()=>{},view=createLearningChatView({close:noop,start:noop,finish:noop,cancel:noop,hint:noop,chinese:noop,next:noop,help:noop,speak:noop,settings:noop,useReward:noop,challenge:noop});
    const state={profile:{name:'导师',role:'居民'},story:{id:'one',title:'入门',context:'',turns:[{hint:'提示',pattern:'Hello.',answer:{en:'Hello!','zh-CN':'你好！'}}]},locale:'zh-CN',showChinese:true,messages:[{role:'npc',text:{en:'Hello!','zh-CN':'你好！'}}],index:0,hintLevel:3,status:'',busy:false,recording:false,done:false};
    const nodes=()=>document.body.querySelectorAll('*');
    view.render(state);
    assert.equal(nodes().some(n=>n.className==='camp-chat-reward'),false);
    assert.ok(nodes().filter(n=>n.className==='camp-chat-original').every(n=>n.textContent==='你好！'));
    assert.ok(nodes().some(n=>n.className==='camp-chat-translation'&&n.textContent==='Hello!'));
    view.render({...state,showChinese:false});
    assert.equal(nodes().filter(n=>n.className==='camp-chat-translation').length,0);
    view.render({...state,locale:'en',showChinese:true});
    assert.ok(nodes().some(n=>n.className==='camp-chat-translation'&&n.textContent==='你好！'));
    view.render({...state,reward:{amount:10,currency:100},messages:[...state.messages,{role:'npc',text:'Next question'}]});
    assert.equal(nodes().filter(n=>n.className==='camp-chat-reward-preview').length,1);
    assert.ok(nodes().some(n=>n.className==='camp-chat-reward-preview'&&n.textContent==='对话奖励：10 奇豆'));
    view.render({...state,reward:{amount:0,currency:100}});
    assert.ok(nodes().some(n=>n.className==='camp-chat-reward-preview'&&n.textContent==='对话奖励：0 奇豆'));
    view.render({...state,reward:{amount:30,currency:17213}});
    assert.ok(nodes().some(n=>n.className==='camp-chat-reward-preview'&&n.textContent==='对话奖励：30 仙豆'));
    const done={...state,done:true,received:10,reward:{currency:100},messages:[{role:'user',text:'Hello',feedback:'答对了 · +10 奇豆'}]};
    view.render(done);
    const popup=nodes().find(n=>n.className==='camp-chat-celebration');
    assert.equal(popup.hidden,false);
    assert.ok(nodes().some(n=>n.className==='camp-chat-answer-feedback'&&n.textContent.includes('+10 奇豆')));
    popup.hidden=true;view.render(done);assert.equal(popup.hidden,true,'rerender must not replay reward');
    view.close();assert.equal(popup.hidden,true);
    view.render({...done,received:0});
    assert.ok(nodes().some(n=>n.textContent==='练习完成，继续加油！'));
    view.close();
    view.render({...state,mode:'free',loginRequired:true,ready:false,remaining:null,hintLevel:0});
    assert.equal(nodes().find(n=>n.className==='camp-chat-login').hidden,false);
    assert.equal(nodes().find(n=>n.className==='camp-chat-input').hidden,true);
    assert.equal(nodes().find(n=>n.className==='camp-chat-actions').hidden,true);
    assert.equal(nodes().find(n=>n.className==='camp-chat-progress').textContent,'登录后可使用 AI 对话');
    view.render({...state,mode:'free',ready:true,remaining:2,hintLevel:0});
    assert.equal(nodes().find(n=>n.className==='camp-chat-login').hidden,true);
    assert.equal(nodes().find(n=>n.className==='camp-chat-input').hidden,false);
    view.close();
});
