import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../js/adventure_time_scroll_core.js';
import {createTimeScroll,loadTimeScroll} from '../js/adventure_time_scroll.js';
import {createAdventure,parseSave} from '../js/adventure_core.js';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {checkedProgress} from '../js/adventure_cloud_core.js';
import {durableSave,runtimeValues,restoreRuntime,splitRoleSave,joinRoleSave,coreCatalogKey} from '../js/adventure_storage_core.js';
import {awardDailySpeech} from '../js/language_daily_buff_core.js';
import {createStoryChat} from '../js/language_story.js';
const read=path=>JSON.parse(fs.readFileSync(new URL('../data/'+path,import.meta.url),'utf8'));
const data=read('adventure/earth/time-scroll/common.json');
const {content,dataset}=installExpansion(read('adventure/chapter.json'),read('adventure/combat.json'),read('adventure/pets.json'),read('adventure/shop-candidates.json'),read('kids/cards.json'),read('kids/charms.json'));
test('ordered segmented timeline, bounds, nearest station, bounded neighbours and deterministic movement',()=>{
    T.validateTimeScrollContent(data);assert.deepEqual(data.stations.map(s=>s.yearsAgo),[100,50,10,0]);
    assert.equal(T.clampTimePosition(data,-1),0);assert.equal(T.clampTimePosition(data,Infinity),1920);
    assert.equal(T.timeStationIndex(data,650),1);assert.equal(T.timeStationIndex(data,1800),3);
    assert.equal(T.visibleTimeStations(data,650).length,3);assert.equal(T.visibleTimeStations(data,1920).length,2);
    assert.equal(T.moveTimePosition(data,100,200,1),113);assert.equal(T.moveTimePosition(data,100,0,1),87);
    const bad=structuredClone(data);bad.stations[1].yearsAgo=101;assert.throws(()=>T.validateTimeScrollContent(bad));
    assert.throws(()=>T.validateTimeScrollReference('https://other.test/content.json'));
});
test('all city types use stable identity; surface and generated interior share discoveries',()=>{
    const city={id:'7',name:'测试城',lon:30,lat:40,x:10,y:20};
    const surface=T.timeScrollCity({isEarth:true,mapCities:[city]},{position:{x:10,y:20}});
    assert.equal(surface.id,'generated-7');assert.equal(T.timeScrollCity({isCityDungeon:true,city:{...city,id:'generated-7'}},{}).id,surface.id);
    assert.equal(T.timeScrollCity({isEarth:true,mapCities:[]},{position:{x:0,y:0}}),null);
    assert.equal(T.timeScrollCity({isEarth:true,mapCities:[city]},{position:{x:90000,y:0}}),null);
    assert.equal(T.timeScrollCity({isEarth:true,city:{id:'shenzhen',name:'深圳',entrance:{lon:114,lat:22}}},{}).id,'shenzhen');
});
test('discovery needs proximity, is idempotent, and remains city-specific',()=>{
    const save={revision:0};assert.throws(()=>T.discoverTimeClue(save,'a',data,'map',500));
    assert.equal(T.discoverTimeClue(save,'a',data,'map',160),true);assert.equal(T.discoverTimeClue(save,'a',data,'map',160),false);
    assert.equal(T.timeDiscoveries(save,'b').length,0);T.discoverTimeClue(save,'b',data,'map',160);assert.equal(save.revision,2);
    T.validateTimeScrollProgress(save.timeScrollProgress);assert.throws(()=>T.discoverTimeClue(save,'__proto__',data,'map',160));
});
function completion(story=data.stations[0].story){return {locale:'en',now:1000,score:100,answered:true,story:{id:story.id,turnIds:story.turns.map(t=>t.id),hintsUsed:true,proof:story.turns.map(t=>({turnId:t.id,input:'text',quote:t.answer.en}))}};}
test('shared story completion never mints currency; daily speech IDs are shared across cities',()=>{
    const save=createAdventure(content);save.languageLearning={...save.languageLearning,enabled:true,target:'en'};const before=structuredClone(save.inventory);
    T.completeTimeStory(save,data,completion());const revision=save.revision;T.completeTimeStory(save,data,completion());assert.equal(save.revision,revision);assert.deepEqual(save.inventory,before);
    const now=new Date(2026,9,12,12).getTime(),id='en:time-scroll:common:map:map-1';
    assert.ok(awardDailySpeech(save,content,id,now));assert.equal(awardDailySpeech(save,content,id,now),null);
    parseSave(save,content);const bad=completion();bad.story.proof.pop();assert.throws(()=>T.completeTimeStory(save,data,bad));
});
test('records split/cloud allowlist and local-only position roundtrip preserve old saves',()=>{
    const save=createAdventure(content);assert.equal(parseSave(save,content).timeScrollProgress,undefined);
    T.discoverTimeClue(save,'shenzhen',data,'map',160);
    save.timeScrollRuntime={version:1,cityId:'shenzhen',contentId:data.id,zone:save.zone,x:160,active:true,returnPosition:{...save.position}};
    const split=splitRoleSave(save);assert.equal(split.state.timeScrollProgress,undefined);assert.deepEqual(split.records.timeScrollProgress,save.timeScrollProgress);assert.equal(split.state.timeScrollRuntime,undefined);
    const joined=joinRoleSave(split.state,split,content);assert.deepEqual(joined.timeScrollProgress,save.timeScrollProgress);assert.equal(joined.timeScrollRuntime,undefined);
    const checked=checkedProgress(save,content,dataset).save;assert.deepEqual(checked.timeScrollRuntime,save.timeScrollRuntime);
    const restored=restoreRuntime(durableSave(save),content,runtimeValues(save));assert.deepEqual(restored.timeScrollRuntime,save.timeScrollRuntime);
    assert.equal(T.resumeTimePosition(restored,{id:'shenzhen'},data),160);assert.equal(T.resumeTimePosition(restored,{id:'other'},data),1920);
    const key=coreCatalogKey({roles:[{id:'one',save}]});save.timeScrollRuntime.x=900;assert.equal(coreCatalogKey({roles:[{id:'one',save}]}),key);
    assert.equal(restoreRuntime(durableSave(save),content).timeScrollRuntime,undefined);
    const missingReturn=runtimeValues(save);delete missingReturn.values.timeScrollRuntime.returnPosition;
    const safe=restoreRuntime(durableSave(save),content,missingReturn);assert.equal(safe.timeScrollRuntime,undefined);assert.deepEqual(safe.timeScrollProgress,save.timeScrollProgress);assert.deepEqual(safe.position,save.position);
    const corrupt=structuredClone(save);delete corrupt.timeScrollRuntime.returnPosition;assert.throws(()=>parseSave(corrupt,content));
});
function harness(){
    const state={save:createAdventure(content),role:'a',owner:'one',stage:'world',online:false};state.save.languageLearning={...state.save.languageLearning,enabled:true,target:'en'};
    const city={id:'sample',name:'示例城'},log=[];let cb,chatOptions,fail=false,now=0,scroll;
    scroll=createTimeScroll({root:{},data,city,assets:{content},getState:()=>state,persist:core=>{if(fail&&core)throw Error('disk full');},award:id=>log.push(id),onClose:()=>scroll.close(),isHidden:()=>false,requestFrame:()=>1,cancelFrame:()=>{},
        viewFactory:(_,options)=>{cb=options;return {draw(){},reading:(s,k)=>log.push(k||'talk'),message:m=>log.push(m),hideDetail(){},close(){},blocked:false};},voiceFactory:()=>({cancel:async()=>{}}),
        chatFactory:options=>{chatOptions=options;return {open(){},close(){},tick(){},active:false};}});
    return {state,scroll,cb,log,chat:()=>chatOptions,fail:()=>{fail=true;},walk:()=>{for(let i=0;i<160;i++)scroll.tick(now+=50);}};
}
test('controller walks to clues, persists once, returns to untouched modern position',()=>{
    const h=harness(),position={...h.state.save.position};h.cb.onTarget(1440,{kind:'clue',index:2});h.walk();assert.equal(T.timeDiscoveries(h.state.save,'sample').length,1);
    h.cb.onTarget(1440,{kind:'clue',index:2});h.walk();assert.equal(T.timeDiscoveries(h.state.save,'sample').length,1);
    h.scroll.close();assert.equal(h.state.save.timeScrollRuntime.active,false);assert.deepEqual(h.state.save.position,position);
});
test('failed commit rolls back discovery; late actions after role/account/zone changes cannot reward',()=>{
    const h=harness();h.fail();h.cb.onTarget(1440,{kind:'clue',index:2});h.walk();assert.equal(h.state.save.timeScrollProgress,undefined);assert.ok(h.log.includes('disk full'));h.scroll.close();
    for(const key of ['role','owner','stage']){const f=harness();f.cb.onPractice(data.stations[0]);f.state[key]='changed';assert.equal(f.chat().onSpeech('late'),null);assert.throws(()=>f.chat().commit(completion()));f.scroll.tick(100);assert.equal(f.scroll.active,false);assert.equal(f.state.save.timeScrollProgress,undefined);}
});
test('cancelled/failed lazy reads are retryable and never populate successful content cache',async()=>{
    const city={timeScroll:'data/adventure/earth/time-scroll/test-content.json'},abort=new AbortController();abort.abort();
    await assert.rejects(loadTimeScroll(city,{signal:abort.signal,fetcher:async()=>({ok:true,json:async()=>data})}));
    await assert.rejects(loadTimeScroll(city,{fetcher:async()=>({ok:false})}));
    assert.equal(await loadTimeScroll(city,{fetcher:async()=>({ok:true,json:async()=>data})}),data);
});
test('real shared chat opts out of coins, awards verified speech once across reopen/cities, and ignores late speech',async()=>{
    const state={save:createAdventure(content),content,role:'a',identity:'one',stage:'world'};
    state.save.languageLearning={...state.save.languageLearning,enabled:true,target:'en'};
    let callbacks,ui,transcript='',finish;
    const rewards=[],story=data.stations[0].story,profile={name:'旅人',stories:[story]};
    const voice={speak:async()=>{},cancel:async()=>{},start:async()=>{},finish:async()=>transcript};
    const chat=createStoryChat({practiceOnly:true,allowedZone:state.save.zone,getState:()=>state,voice,onSpeech:event=>{const result=awardDailySpeech(state.save,content,event);if(result)rewards.push(event);return result;},commit:c=>T.completeTimeStory(state.save,data,c),viewFactory:cb=>{callbacks=cb;return {render:s=>{ui=s;},close(){}};}});
    const inventory=structuredClone(state.save.inventory);
    const say=async text=>{transcript=text;await callbacks.start();await callbacks.finish();};
    chat.open(profile,story,null,{greeted:true});assert.equal(ui.reward,null);
    await say('unrelated speech');assert.equal(rewards.length,0);
    await say(story.turns[0].answer.en);assert.equal(rewards.length,1);chat.close();
    chat.open(profile,story,null,{greeted:true});
    for(const turn of story.turns)await say(turn.answer.en);
    assert.equal(ui.done,true);assert.equal(rewards.length,3);assert.deepEqual(state.save.inventory,inventory);assert.equal(ui.reward,null);
    chat.close();chat.open(profile,story,null,{greeted:true});await say(story.turns[0].answer.en);assert.equal(rewards.length,3);
    voice.finish=()=>new Promise(resolve=>{finish=resolve;});await callbacks.start();const waiting=callbacks.finish();chat.close();finish(story.turns[1].answer.en);await waiting;assert.equal(rewards.length,3);
});
