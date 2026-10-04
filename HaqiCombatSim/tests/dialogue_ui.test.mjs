import test from 'node:test';
import assert from 'node:assert/strict';
import {bindDialogue} from '../js/view_adventure_dialogue.js';
import fs from 'node:fs';
import vm from 'node:vm';

test('tracked NPC dialogue executes only one available quest choice and consumes intent',()=>{
    const source=fs.readFileSync(new URL('../js/view_adventure.js',import.meta.url),'utf8');
    const renderSource=source.slice(source.indexOf('export function renderDialogue('),source.indexOf('// 战斗卡牌说明')).replace('export function','function');
    const quest={id:1,title:'Quest',startNpc:10,endNpc:10};
    const npc={id:10,name:'NPC',zone:'camp',description:'Default greeting'};
    const element=(tag,cls,...children)=>({tag,children,dataset:{},textContent:'text',classList:{toggle(){},add(){}},style:{setProperty(){}},setAttribute(){},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},querySelector(){return element('button');}});
    for(const scenario of [
        {name:'tracked accept',tracked:true,chapter:quest,accepted:false,expected:'startQuest'},
        {name:'tracked claim',tracked:true,chapter:quest,accepted:true,ready:true,expected:'finishQuest'},
        {name:'catalog accept',tracked:true,accept:[quest],expected:'startCatalog'},
        {name:'catalog claim',tracked:true,claim:[quest],expected:'finishCatalog'},
        {name:'ordinary NPC click',chapter:quest,accepted:false},
        {name:'multiple choices',tracked:true,chapter:quest,accepted:false,accept:[{...quest,id:2}]},
        {name:'no available choices',tracked:true},
    ]){
        const calls=[],root=element('div'),dialog={npcId:10,questDialogue:!!scenario.tracked};
        const callbacks=Object.fromEntries(['startQuest','finishQuest','startCatalog','finishCatalog'].map(name=>[name,value=>calls.push([name,value.id])]));
        let bound=0;
        const context=vm.createContext({
            el:element,art:()=>element('canvas'),npcCharacter:()=>null,npcHasActiveQuest:()=>false,fill:()=>({text:'NPC'}),islandName:()=>'',createCloseButton:()=>element('button'),
            currentQuest:()=>scenario.chapter,questState:()=>({accepted:!!scenario.accepted}),questReady:()=>!!scenario.ready,
            catalogStatSnapshot:()=>({}),catalogQuestsForNpc:()=>({accept:scenario.accept||[],claim:scenario.claim||[]}),
            rewardsFor:()=>[],pendingQuestTalk:()=>null,catalogTalksForNpc:()=>[],npcServices:()=>['shop'],setText(){},
            button:(label,action)=>({...element('button'),click:action}),dialogueLearningLines:()=>[],bindDialogue:()=>bound++,
        });
        vm.runInContext(renderSource,context);
        const model={assets:{content:{npcs:{10:npc}}},save:{languageLearning:{}}};
        context.renderDialogue(root,model,dialog,callbacks);
        assert.deepEqual(calls,scenario.expected?[[scenario.expected,1]]:[],scenario.name);
        assert.equal(bound,scenario.expected?0:1,scenario.name);
        assert.equal(dialog.questDialogue,false,scenario.name);
        if(scenario.expected){
            context.renderDialogue(root,model,dialog,callbacks);
            assert.equal(calls.length,1,'refresh must not auto-execute again');
            assert.equal(bound,1);
        }
    }
    const controller=fs.readFileSync(new URL('../js/adventure_app.js',import.meta.url),'utf8');
    assert.match(controller,/dialog=\{npcId:target.id,npc:target,questDialogue:target.questDialogue===true,fromQuestTracking:target.questDialogue===true\}/);
});

test('tracking dialogue closes after success and follows only the sole updated tracker entry',async()=>{
    const source=fs.readFileSync(new URL('../js/adventure_app.js',import.meta.url),'utf8');
    const controller=source.slice(source.indexOf('function finishTrackedDialogue()'),source.indexOf('function interact(target)'));
    for(const scenario of [
        {name:'accept and follow objective',tracked:true,ids:[1],expected:1},
        {name:'claim opens next chapter',tracked:true,ids:[],chapter:2,expected:2,advance:'reward'},
        {name:'talk continues to next destination',tracked:true,ids:[1],expected:1,advance:true},
        {name:'multiple tracks only close',tracked:true,ids:[1,2]},
        {name:'finished all tasks only close',tracked:true,ids:[]},
        {name:'ordinary accept keeps menu',ids:[1]},
        {name:'catalog accept continues',tracked:true,ids:[1],expected:1,catalog:'startCatalog'},
        {name:'catalog claim follows successor',tracked:true,ids:[2],expected:2,catalog:'finishCatalog'},
        {name:'chapter reward popup prevents following successor',tracked:true,ids:[],chapter:2,advance:'reward',rewards:true},
        {name:'catalog reward popup prevents following successor',tracked:true,ids:[2],catalog:'finishCatalog',rewards:true},
        {name:'existing reward popup prevents following accepted quest',tracked:true,ids:[1],rewards:true},
    ]){
        const calls=[],quest={id:1,startNpc:10,endNpc:10,title:'Quest'},save={ids:[]};
        let callbacks;
        const update=()=>{save.ids=scenario.ids;return scenario.advance;};
        const context=vm.createContext({
            dialog:{npcId:10,fromQuestTracking:!!scenario.tracked,questDialogue:false,lines:[{}],index:0},dialogDone:update,
            save,assets:{content:{quests:[quest,{id:2}]}},trackedQuestIds:state=>state.ids,
            rewardFeedback:{hasPendingItems:!!scenario.rewards},
            A:{currentQuest:()=>scenario.chapter?{id:scenario.chapter}:null,applyAction:()=>{update();return {}; }},
            close:()=>{calls.push('close');context.dialog=null;},track:(id,options)=>{assert.equal(context.dialog,null);assert.equal(options.pin,false);calls.push(id);},
            persist(){},queueCloudSave(){},paintHud(){},petScene:{dialogue(){}},missingRewardPets:()=>[],loadPet(){},safely:callback=>callback(),
            nodes:{overlay:{}},model:()=>({}),V:{renderDialogue:(_root,_model,_dialog,cb)=>{callbacks=cb;calls.push('render');}},
            mapDialogue(){},dialogueVoice:{},openPanel(){},travel(){},toast(){},rewardSnapshot(){},showRewards(){},islandSocial:{activity(){}},
        });
        vm.runInContext(controller,context);
        if(scenario.catalog){context.paintDialogue();calls.length=0;callbacks[scenario.catalog](quest);await Promise.resolve();}
        else await context.nextDialogue();
        assert.deepEqual(calls,scenario.tracked?['close',...(scenario.expected?[scenario.expected]:[])]:['render'],scenario.name);
    }
});

function setup(t,reduced=false,options={}){
    const listeners=new Map(),classes=new Set();let calls=0;
    const node=()=>({textContent:'',style:{},addEventListener(){},remove(){},getClientRects:()=>[{left:10,right:50,top:20,bottom:40}],children:[],attributes:{},setAttribute(key,value){this.attributes[key]=value;},append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;}});
    const button={textContent:'继续',classList:{add(){}},click(){calls++;},focus(){document.activeElement=this;}};
    const backdrop={closest:()=>null};
    const box={isConnected:true,classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)},focus(){document.activeElement=this;},querySelectorAll:()=>[button],contains:node=>node!==backdrop};
    const root={addEventListener:(k,fn)=>listeners.set(k,fn),removeEventListener:k=>listeners.delete(k)};
    const text={textContent:'你好，年轻的魔法师。',replaceChildren(...children){this.children=children;},append(child){this.children.push(child);}};
    const hint=node();
    t.mock.method(globalThis,'setTimeout',()=>1);
    t.mock.method(globalThis,'clearTimeout',()=>{});
    const previousDocument=globalThis.document,previousMedia=globalThis.matchMedia;
    globalThis.document={createElement:node,createElementNS:node,activeElement:null};globalThis.matchMedia=()=>({matches:reduced});
    t.after(()=>{root.disposeDialogue?.();if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;if(previousMedia===undefined)delete globalThis.matchMedia;else globalThis.matchMedia=previousMedia;});
    const frames=[];text.getBoundingClientRect=()=>({left:0,top:0,width:300,height:140});
    text.classList={add(){},remove(){}};
    for(const [key,value] of Object.entries({ResizeObserver:class{observe(){} disconnect(){}},requestAnimationFrame:callback=>{frames.push(callback);return frames.length;},cancelAnimationFrame:()=>{}})){
        const previous=globalThis[key];globalThis[key]=value;t.after(()=>{if(previous===undefined)delete globalThis[key];else globalThis[key]=previous;});
    }
    bindDialogue(root,box,text,hint,button,options);
    const target={closest:()=>null};
    const event=extra=>({target,preventDefault(){},stopPropagation(){},stopImmediatePropagation(){},...extra});
    return {root,text,hint,classes,backdrop,drawLinks:()=>frames.splice(0).forEach(fn=>fn()),get calls(){return calls;},key:extra=>listeners.get('keydown')?.(event({key:' ',code:'Space',...extra})),click:extra=>listeners.get('click')?.(event(extra)),listeners};
}
test('first space reveals, held space never advances, second space advances once',t=>{
    const ui=setup(t);assert.ok(ui.classes.has('is-speaking'));
    ui.key();assert.equal(ui.calls,0);assert.equal(ui.text.children[0].textContent,ui.text.textContent);
    ui.key({repeat:true});assert.equal(ui.calls,0);
    ui.key();assert.equal(ui.calls,1);
});
test('inside click only reveals; backdrop click closes and never accepts; disposal removes handlers',t=>{
    let closed=0;const ui=setup(t,false,{close:()=>closed++});
    ui.click();assert.equal(ui.calls,0);ui.click();assert.equal(ui.calls,0);
    ui.click({target:ui.backdrop});assert.equal(closed,1);assert.equal(ui.calls,0);
    ui.click({target:ui.backdrop});assert.equal(closed,2);assert.equal(ui.calls,0);
    ui.key();assert.equal(ui.calls,1);
    ui.root.disposeDialogue();assert.equal(ui.listeners.size,0);
});
test('close stays immediate and reduced motion shows full text',t=>{
    const ui=setup(t,true);assert.equal(ui.text.children[0].textContent,ui.text.textContent);
    ui.click({target:{closest:selector=>selector==='.close-button'?{}:null}});
    assert.equal(ui.calls,0);ui.key();assert.equal(ui.calls,1);
});

test('NPC chat shortcut stays clickable while the dialogue text is typing',t=>{
    const ui=setup(t);let intercepted=false;
    ui.click({target:{closest:selector=>selector==='.dialogue-chat'?{}:null},preventDefault(){intercepted=true;}});
    assert.equal(intercepted,false);
    assert.ok(ui.classes.has('is-speaking'));
    assert.equal(ui.calls,0);
});

test('learning dialogue displays both languages; reading does not trigger quest action and closing cancels audio',async t=>{
    const calls=[];const ui=setup(t,false,{lines:[{text:'Hello!',locale:'en'},{text:'你好！',locale:'zh-CN'}],readAloud:async(text,locale,signal)=>{calls.push({text,locale,signal});}});
    assert.deepEqual(ui.text.children.slice(0,2).map(n=>n.textContent),['Hello!','你好！']);assert.equal(ui.classes.has('is-speaking'),false);
    ui.click({target:{closest:selector=>selector==='.camp-chat-replay'?ui.text.children[0].children[0]:null}});assert.equal(ui.calls,0);
    await ui.text.children[0].children[0].onclick();await ui.text.children[0].children[0].onclick();
    assert.equal(ui.text.children.length,2,'actions do not add another text row');assert.equal(ui.text.children[0].children[0].children.length,2,'clickable sentence contains text and speaker SVG');assert.equal(calls[0].signal.aborted,true);assert.equal(calls[1].locale,'en');assert.equal(ui.calls,0);
    ui.root.disposeDialogue();assert.equal(calls[1].signal.aborted,true);
});

for(const locale of ['en','zh-CN'])test(`auto read opens in the target language ${locale} and replay cancels previous audio`,async t=>{
    const calls=[],lines=locale==='en'?[{text:'Hello!',locale:'en'},{text:'你好！',locale:'zh-CN'}]:[{text:'你好！',locale:'zh-CN'},{text:'Hello!',locale:'en'}];
    const ui=setup(t,false,{lines,targetLocale:locale,autoReadDialogue:true,readAloud:async(text,language,signal)=>calls.push({text,language,signal})});
    assert.equal(calls.length,1);assert.equal(calls[0].language,locale);assert.equal(calls[0].text,lines[0].text);assert.equal(ui.calls,0);
    await ui.text.children[0].children[0].onclick();
    assert.equal(calls.length,2);assert.equal(calls[0].signal.aborted,true);
    ui.root.disposeDialogue();assert.equal(calls[1].signal.aborted,true);
});

test('auto read respects opt out and skips ordinary or untranslated dialogue',t=>{
    let spoken=0;const readAloud=()=>{spoken++;};
    setup(t,false,{lines:[{text:'Hello!',locale:'en'}],autoReadDialogue:false,readAloud});
    setup(t,false,{autoReadDialogue:true,readAloud});
    setup(t,false,{lines:[{text:'未翻译',locale:'zh-CN'}],targetLocale:'en',autoReadDialogue:true,readAloud});
    assert.equal(spoken,0);
});

test('automatic reading failure keeps manual retry available and late failures cannot update a closed dialogue',async t=>{
    let reject;let attempts=0;
    const ui=setup(t,false,{lines:[{text:'Hello!',locale:'en'}],autoReadDialogue:true,readAloud:()=>{attempts++;return attempts===1?Promise.reject(Error('请重试')):new Promise((_,fail)=>{reject=fail;});}});
    await new Promise(resolve=>setImmediate(resolve));assert.equal(ui.hint.textContent,'请重试');
    const pending=ui.text.children[0].children[0].onclick();assert.equal(attempts,2);
    ui.root.disposeDialogue();const hint=ui.hint.textContent;reject(Error('迟到的错误'));await pending;assert.equal(ui.hint.textContent,hint);
});

test('translation maps once without speaking or advancing and ignores late result after closing',async t=>{
    let resolve,calls=0,signal;const ui=setup(t,false,{lines:[{text:'Go',locale:'en'},{text:'走',locale:'zh-CN'}],readAloud:()=>{throw Error('must not speak');},mapWords:(_,s)=>{calls++;signal=s;return new Promise(r=>{resolve=r;});}});
    const pending=ui.text.children[1].children[1].onclick();await ui.text.children[1].children[1].onclick();assert.equal(calls,1);assert.equal(ui.calls,0);
    ui.root.disposeDialogue();assert.equal(signal.aborted,true);resolve([]);await pending;
    assert.equal(ui.text.children[0].textContent,'Go');
});

test('shared NPC mapping appears only after clicking and draws paired connectors',async t=>{
    let generated=0,peeked=0;const mapWords=async()=>{generated++;return [[{text:'Go',color:'#A23'}],[{text:'走',color:'#A23'}]];};
    mapWords.peek=async()=>{peeked++;};
    const ui=setup(t,false,{lines:[{text:'Go',locale:'en'},{text:'走',locale:'zh-CN'}],mapWords});
    assert.equal(generated,0);assert.equal(peeked,1);
    await ui.text.children[1].children[1].onclick();
    assert.equal(ui.text.children[0].children[0].children[0].children[0].style.color,'#A23');
    assert.equal(ui.text.children[1].children[1].title,'已映射');ui.drawLinks();
    const links=ui.text.children[2];assert.equal(links.attributes['aria-hidden'],'true');
    assert.equal(links.children.length,1);assert.equal(links.children[0].attributes.stroke,'#A23');
    assert.match(links.children[0].attributes.d,/^M /);
    await ui.text.children[1].children[1].onclick();assert.equal(generated,1);assert.equal(ui.calls,0);
});


test('cached mappings appear automatically after reveal without a model call',async t=>{
    let generated=0;const result=[[{text:'Go',color:'#A23'}],[{text:'走',color:'#A23'}]];
    const mapWords=async()=>{generated++;return result;};mapWords.peek=async()=>result;
    const ui=setup(t,false,{lines:[{text:'Go',locale:'en'},{text:'走',locale:'zh-CN'}],mapWords});
    await new Promise(resolve=>setImmediate(resolve));
    assert.notEqual(ui.text.children[1].children[1].title,'已映射');
    ui.key();
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(ui.text.children[1].children[1].title,'已映射');
    assert.equal(generated,0);ui.root.disposeDialogue();
});

test('late cached mappings do not update a closed dialogue',async t=>{
    let resolve;const mapWords=()=>{throw Error('no generation');};mapWords.peek=()=>new Promise(done=>resolve=done);
    const ui=setup(t,false,{lines:[{text:'Go',locale:'en'},{text:'走',locale:'zh-CN'}],mapWords});
    ui.root.disposeDialogue();resolve([[{text:'Go',color:'#A23'}],[{text:'走',color:'#A23'}]]);
    await new Promise(resolve=>setImmediate(resolve));
    assert.notEqual(ui.text.children[1].children[1].title,'已映射');
});
