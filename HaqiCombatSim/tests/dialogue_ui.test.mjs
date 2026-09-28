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
    const element=(tag,cls,...children)=>({tag,children,dataset:{},textContent:'text',classList:{toggle(){}},style:{setProperty(){}},setAttribute(){},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},querySelector(){return element('button');}});
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
            el:element,art:()=>element('canvas'),fill:()=>({text:'NPC'}),islandName:()=>'',createCloseButton:()=>element('button'),
            currentQuest:()=>scenario.chapter,questState:()=>({accepted:!!scenario.accepted}),questReady:()=>!!scenario.ready,
            catalogStatSnapshot:()=>({}),catalogQuestsForNpc:()=>({accept:scenario.accept||[],claim:scenario.claim||[]}),
            rewardsFor:()=>[],pendingQuestTalk:()=>null,npcServices:()=>['shop'],setText(){},
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
        if(scenario.catalog){context.paintDialogue();calls.length=0;callbacks[scenario.catalog](quest);}
        else await context.nextDialogue();
        assert.deepEqual(calls,scenario.tracked?['close',...(scenario.expected?[scenario.expected]:[])]:['render'],scenario.name);
    }
});

function setup(t,reduced=false,options={}){
    const listeners=new Map(),classes=new Set();let calls=0;
    const node=()=>({textContent:'',style:{},children:[],setAttribute(){},append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;}});
    const button={textContent:'继续',classList:{add(){}},click(){calls++;},focus(){document.activeElement=this;}};
    const backdrop={closest:()=>null};
    const box={isConnected:true,classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)},focus(){document.activeElement=this;},querySelectorAll:()=>[button],contains:node=>node!==backdrop};
    const root={addEventListener:(k,fn)=>listeners.set(k,fn),removeEventListener:k=>listeners.delete(k)};
    const text={textContent:'你好，年轻的魔法师。',replaceChildren(...children){this.children=children;},append(child){this.children.push(child);}};
    const hint=node();
    t.mock.method(globalThis,'setTimeout',()=>1);
    t.mock.method(globalThis,'clearTimeout',()=>{});
    const previousDocument=globalThis.document,previousMedia=globalThis.matchMedia;
    globalThis.document={createElement:node,activeElement:null};globalThis.matchMedia=()=>({matches:reduced});
    t.after(()=>{root.disposeDialogue?.();if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;if(previousMedia===undefined)delete globalThis.matchMedia;else globalThis.matchMedia=previousMedia;});
    bindDialogue(root,box,text,hint,button,options);
    const target={closest:()=>null};
    const event=extra=>({target,preventDefault(){},stopPropagation(){},stopImmediatePropagation(){},...extra});
    return {root,text,hint,classes,backdrop,get calls(){return calls;},key:extra=>listeners.get('keydown')?.(event({key:' ',code:'Space',...extra})),click:extra=>listeners.get('click')?.(event(extra)),listeners};
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

test('learning dialogue displays both languages; reading does not trigger quest action and closing cancels audio',async t=>{
    const calls=[];const ui=setup(t,false,{lines:[{text:'Hello!',locale:'en'},{text:'你好！',locale:'zh-CN'}],readAloud:async(text,locale,signal)=>{calls.push({text,locale,signal});}});
    assert.deepEqual(ui.text.children.map(n=>n.children[0].textContent),['Hello!','你好！']);assert.equal(ui.classes.has('is-speaking'),false);
    ui.click({target:{closest:selector=>selector==='.dialogue-read'?ui.text.children[0]:null}});assert.equal(ui.calls,0);
    await ui.text.children[0].onclick();await ui.text.children[0].onclick();
    assert.equal(calls[0].signal.aborted,true);assert.equal(calls[1].locale,'en');assert.equal(ui.calls,0);
    ui.root.disposeDialogue();assert.equal(calls[1].signal.aborted,true);
});

test('translation maps once without speaking or advancing and ignores late result after closing',async t=>{
    let resolve,calls=0,signal;const ui=setup(t,false,{lines:[{text:'Go',locale:'en'},{text:'走',locale:'zh-CN'}],readAloud:()=>{throw Error('must not speak');},mapWords:(_,s)=>{calls++;signal=s;return new Promise(r=>{resolve=r;});}});
    const pending=ui.text.children[1].onclick();await ui.text.children[1].onclick();assert.equal(calls,1);assert.equal(ui.calls,0);
    ui.root.disposeDialogue();assert.equal(signal.aborted,true);resolve([]);await pending;
    assert.equal(ui.text.children[0].children[0].textContent,'Go');
});

test('opening dialogue shows cached mapping without generating or clicking',async t=>{
    let generated=0;const mapWords=async()=>{generated++;};
    mapWords.peek=async()=>[[{text:'Go',color:'#A23'}],[{text:'走',color:'#A23'}]];
    const ui=setup(t,false,{lines:[{text:'Go',locale:'en'},{text:'走',locale:'zh-CN'}],mapWords});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(ui.text.children[0].children[0].children[0].style.color,'#A23');
    assert.equal(ui.text.children[1].children[2].textContent,'已映射');
    await ui.text.children[1].onclick();assert.equal(generated,0);assert.equal(ui.calls,0);
});

test('late cache lookup cannot repaint a closed dialogue',async t=>{
    let finish;const mapWords=()=>{};mapWords.peek=()=>new Promise(resolve=>{finish=resolve;});
    const ui=setup(t,false,{lines:[{text:'Go',locale:'en'},{text:'走',locale:'zh-CN'}],mapWords});
    ui.root.disposeDialogue();finish([[{text:'Go',color:'#A23'}],[{text:'走',color:'#A23'}]]);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(ui.text.children[0].children[0].children.length,0);
});
