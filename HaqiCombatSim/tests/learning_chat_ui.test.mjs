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
    assert.ok(nodes().filter(n=>n.className==='camp-chat-original').every(n=>n.textContent==='你好！'));
    assert.ok(nodes().some(n=>n.className==='camp-chat-translation'&&n.textContent==='Hello!'));
    view.render({...state,showChinese:false});
    assert.equal(nodes().filter(n=>n.className==='camp-chat-translation').length,0);
    view.render({...state,locale:'en',showChinese:true});
    assert.ok(nodes().some(n=>n.className==='camp-chat-translation'&&n.textContent==='你好！'));
});
