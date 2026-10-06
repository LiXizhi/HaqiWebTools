import test from 'node:test';
import assert from 'node:assert/strict';
import {createDungeonStory} from '../js/adventure_dungeon_story.js';
import {loadLocaleFiles,configureLocale} from '../js/locale.js';
import {formatLocaleLine} from '../js/locale_core.js';
import {translatedGoal,translatedQuestMessage} from '../js/view_adventure_quests.js';
import {setTranslator} from '../js/locale_runtime.js';

test('dungeon stories use the chosen target and native languages, and UI locale without learning',async()=>{
    const row={id:'test:line',role:'player',text:'我准备好了。',en:'I am ready.',reward:'hp'};
    const dictionary={ja:'準備できたよ。',ko:'준비됐어.'};
    await loadLocaleFiles(['ja','ko'],async file=>formatLocaleLine(row.text,dictionary[file.includes('/ja.')?'ja':'ko']));
    for(const [locale,target,native,expected,translation] of [
        ['en','ja','zh-CN',dictionary.ja,row.text],
        ['zh-CN','ko','en',dictionary.ko,row.en],
        ['ja','en','ko',row.en,dictionary.ko],
        ['en',null,null,row.en,'']
    ]){
        const dungeon={id:'test-dungeon',story:[row]},save={zone:dungeon.id,locale,languageLearning:{enabled:!!target,target,native}};
        configureLocale(save);let visible;
        const controller=createDungeonStory({root:{},getState:()=>({save,owner:'test',role:'role',assets:{content:{}}}),voice:{cancel:async()=>{}},award(){throw Error('Reading must never award');},onDone(){},viewFactory:()=>({open(){},line:(line,value)=>{visible=value;},update(){},close(){}})});
        try{controller.open(dungeon);assert.equal(visible.target,expected);assert.equal(visible.translation,translation);assert.equal(visible.learning,!!target);assert.equal(visible.locale,target||locale);}
        finally{controller.close();}
    }
    configureLocale({locale:'zh-CN'});
});
test('missing target translations keep story reading available without microphone or rewards',()=>{
    const dungeon={id:'missing-dungeon',story:[{id:'missing-line',role:'player',text:'没有翻译的测试台词',en:'Missing test translation',reward:'hp'}]};
    const save={zone:dungeon.id,languageLearning:{enabled:true,target:'ja',native:'en'}};
    let visible,actions,starts=0;
    const controller=createDungeonStory({root:{},getState:()=>({save,owner:'test',role:'role',assets:{content:{}}}),voice:{start:async()=>{starts++;},cancel:async()=>{}},award(){throw Error('Missing translations cannot award');},onDone(){},viewFactory:(_,cb)=>{actions=cb;return {open(){},line:(line,value)=>{visible=value;},update(){},close(){}};}});
    try{controller.open(dungeon);assert.equal(visible.target,dungeon.story[0].text);assert.equal(visible.learning,false);void actions.start();assert.equal(starts,0);}
    finally{controller.close();}
});
test('quest conditions and blocked goal descriptions translate before numeric/name substitution',()=>{
    const table={'需要等级 {level}':'Level {level} required','条件 {id} 尚未接入':'Condition {id} is unavailable','{name}需要原服功能，单人冒险无法推进':'{name} needs the original service','击败{name}':'Defeat {name}','章鱼守卫':'Octopus Guard','{goal}（{reason}）':'{goal} ({reason})'};
    setTranslator(source=>table[source]||source);
    try{
        assert.equal(translatedQuestMessage('需要等级 20'),'Level 20 required');
        assert.equal(translatedQuestMessage('条件 965 尚未接入'),'Condition 965 is unavailable');
        assert.equal(translatedGoal({kind:'kill',name:'章鱼守卫',blocked:true,blockReason:'章鱼守卫需要原服功能，单人冒险无法推进'}),'Defeat Octopus Guard (Octopus Guard needs the original service)');
        assert.equal(translatedQuestMessage('a custom message'),'a custom message');
    }finally{setTranslator(value=>value);}
});
