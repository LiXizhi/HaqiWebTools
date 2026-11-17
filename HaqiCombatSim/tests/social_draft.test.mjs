import test from 'node:test';
import assert from 'node:assert/strict';
import {createSocialDraftEditor} from '../js/social_draft.js';
import {renderSocial} from '../js/view_adventure_social.js';

function harness(target='ja'){
    let ctx={save:{languageLearning:{target}},owner:'tester',roleId:'role-a'},draft='明天去森林找靴子。',resolve,reject,request;
    const editor=createSocialDraftEditor({getContext:()=>ctx,read:()=>draft,write:(_key,value)=>{draft=value;},voice:{judge:(messages,signal)=>{request={messages,signal};return new Promise((a,b)=>{resolve=a;reject=b;});}}});
    return {editor,get request(){return request;},get resolve(){return resolve;},get draft(){return draft;},set draft(value){draft=value;},get ctx(){return ctx;},set ctx(value){ctx=value;},finish:reply=>resolve({reply}),fail:error=>reject(error)};
}
for(const [target,language,reply]of [['en','English','Find the boots tomorrow.'],['ja','Japanese','明日、森でブーツを探そう。'],['ko','Korean','내일 숲에서 부츠를 찾아요.'],['zh-CN','Chinese','明天去森林找靴子。']]){
    test('mail draft follows '+target,async()=>{
        const h=harness(target),done=h.editor.translate('mailDraft','target');
        assert.match(h.request.messages[0].content,new RegExp('natural simple '+language));
        assert.equal(h.request.messages[1].content,h.draft);
        h.finish(reply);assert.equal(await done,true);assert.equal(h.draft,reply);
    });
}
test('Chinese polish remains available while learning Korean',async()=>{
    const h=harness('ko'),done=h.editor.translate('mailDraft','zh');
    assert.match(h.request.messages[0].content,/simple Chinese/);h.finish('我们明天一起去森林。');assert.equal(await done,true);
});
for(const [name,change]of [
    ['target',h=>{h.ctx.save.languageLearning.target='ko';}],
    ['role',h=>{h.ctx.roleId='role-b';}],
    ['owner',h=>{h.ctx.owner='other';}],
    ['save',h=>{h.ctx={...h.ctx,save:{languageLearning:{target:'ja'}}};}],
    ['typed draft',h=>{h.draft='已经手动修改';}]
])test('old response cannot overwrite after changing '+name,async()=>{
    const h=harness(),done=h.editor.translate('mailDraft');change(h);const expected=h.draft;
    h.finish('明日、出かけましょう。');assert.equal(await done,false);assert.equal(h.draft,expected);
});
test('closing cancels pending work and ignores late errors',async()=>{
    const h=harness(),done=h.editor.translate('mailDraft');h.editor.cancel();assert.equal(h.request.signal.aborted,true);
    h.fail(Error('aborted'));assert.equal(await done,false);
});
test('new request invalidates old result',async()=>{
    const h=harness(),old=h.editor.translate('mailDraft'),resolveOld=h.resolve,oldRequest=h.request;
    const deferred=h.editor.translate('mailDraft');assert.equal(oldRequest.signal.aborted,true);
    h.finish('新しい手紙です。');assert.equal(await deferred,true);
    resolveOld({reply:'古い手紙です。'});assert.equal(await old,false);assert.equal(h.draft,'新しい手紙です。');
});
for(const reply of ['', 'Find the boots.'])test('Japanese rejects empty or English-only result '+JSON.stringify(reply),async()=>{
    const h=harness(),done=h.editor.translate('mailDraft');h.finish(reply);await assert.rejects(done,/日语草稿/);assert.equal(h.draft,'明天去森林找靴子。');
});
test('empty source fails without making a request',async()=>{
    const h=harness();h.draft=' ';await assert.rejects(h.editor.translate('mailDraft'),/填写草稿/);assert.equal(h.request,undefined);
});

class Element{
    constructor(tag,text=''){this.tag=tag;this.text=text;this.children=[];this.dataset={};this.attributes={};this.classList={add(){}};}
    append(...nodes){this.children.push(...nodes);}
    replaceChildren(...nodes){this.children=[...nodes];}
    setAttribute(key,value){this.attributes[key]=value;}
}
const nodes=root=>[root,...root.children.flatMap(nodes)];
const content=node=>node.text+node.children.map(content).join('');
test('compose button names the target and resolves it at click time',t=>{
    const old={document:globalThis.document,Node:globalThis.Node};
    Object.assign(globalThis,{Node:Element,document:{createElement:tag=>new Element(tag),createElementNS:(_ns,tag)=>new Element(tag),createTextNode:text=>new Element('text',text)}});
    t.after(()=>Object.assign(globalThis,old));
    for(const [target,label]of [['en','英语'],['ja','日语'],['ko','韩语'],['zh-CN','中文']]){
        let clicked;const root=new Element('div');
        renderSocial(root,{owner:'test',learningTarget:target,mailAvailable:true,mailTab:'compose',friends:[]},'mail',{polish:(...args)=>{clicked=args;}});
        const translate=nodes(root).find(n=>n.tag==='button'&&content(n)==='翻译成'+label+'草稿');
        assert.ok(translate);translate.onclick();assert.deepEqual(clicked,['mailDraft','target']);
    }
});
