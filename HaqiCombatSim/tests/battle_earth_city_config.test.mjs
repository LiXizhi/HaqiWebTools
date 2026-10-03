import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {validateEarthCity,validateEarthCityProgress,earthCityChapterProgress,advanceEarthCityChapter,earthCityQuestOffers,earthCityQuestState,applyEarthCityQuest,earthCityNpcMarker,earthCityQuestTarget,earthCityStory} from '../js/adventure_earth_city_config_core.js';
import {splitRoleSave} from '../js/adventure_storage_core.js';
import {createAdventure,parseSave} from '../js/adventure_core.js';
import {createEarthService} from '../js/adventure_earth.js';
import {earthPoint} from '../js/adventure_earth_core.js';
const read=name=>JSON.parse(fs.readFileSync(new URL('../'+name,import.meta.url),'utf8'));
const city=read('data/adventure/earth/cities/shenzhen.json');
const content=read('data/adventure/chapter.json');
test('single city package links every resident, story, task and alpha atlas crop',()=>{
    assert.equal(validateEarthCity(city),city);assert.equal(city.npcs.length,8);
    const art=city.art.npcs,bytes=fs.readFileSync(new URL('../'+art.local,import.meta.url));
    assert.equal(bytes.toString('ascii',8,12),'WEBP');assert.equal(bytes.length,art.bytes);assert.ok(bytes.length<=200000);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),art.sha256);
    assert.equal(new URL(art.cdn).hostname,'cdn.keepwork.com');assert.equal(art.frames.length,8);
    assert.equal(city.languages.primary,'zh-CN');assert.equal(city.demographics.asOf,'2015-11-01');assert.equal(city.demographics.racePercentages,null);
    const invalid=structuredClone(city);invalid.npcs[1].id=invalid.npcs[0].id;assert.throws(()=>validateEarthCity(invalid),/编号/);
    const badCrop=structuredClone(city);badCrop.art.npcs.frames[0][0]=badCrop.art.npcs.width;assert.throws(()=>validateEarthCity(badCrop),/裁剪/);
});
test('city side quests require acceptance, the correct NPC, ordered goals and a single turn-in',()=>{
    const save={revision:0,inventory:{100:10}},q=city.sideQuests[0],inventory=structuredClone(save.inventory);
    assert.equal(earthCityNpcMarker(save,city,q.startNpc),'!');
    assert.throws(()=>applyEarthCityQuest(save,city,q.endNpc,q.id,'complete'),/不能/);
    applyEarthCityQuest(save,city,q.startNpc,q.id,'accept');
    assert.equal(earthCityQuestTarget(save,city).destination.name,'亚历克斯');
    assert.throws(()=>applyEarthCityQuest(save,city,q.startNpc,q.id,'talk'),/不能/);
    applyEarthCityQuest(save,city,q.objectives[0].npcId,q.id,'talk');
    assert.equal(earthCityNpcMarker(save,city,q.endNpc),'?');
    applyEarthCityQuest(save,city,q.endNpc,q.id,'complete');
    assert.equal(earthCityQuestState(save,city,q.id).complete,true);
    assert.equal(earthCityQuestOffers(save,city,q.startNpc).some(row=>row.quest.id===q.id),false);
    const after=JSON.stringify(save);assert.throws(()=>applyEarthCityQuest(save,city,q.endNpc,q.id,'complete'),/不能/);assert.equal(JSON.stringify(save),after);assert.deepEqual(save.inventory,inventory);
});
test('legacy Shenzhen progress migrates on advancement while another city remains independent',()=>{
    const save={revision:8,earthProgress:{version:1,step:4}};
    assert.equal(earthCityStory(save,city,city.npcs[0]).event,'return');
    assert.equal(earthCityChapterProgress(save,city.quests).step,4);
    assert.equal(advanceEarthCityChapter(save,city.quests,'return'),true);
    assert.equal(save.earthCityProgress.cities.shenzhen.chapters[city.quests.id].step,5);
    const second={id:'second-city-chapter',cityId:'second-city',steps:[{id:'start',event:'arrival'}]};
    assert.equal(earthCityChapterProgress(save,second).step,0);assert.equal(advanceEarthCityChapter(save,second,'arrival'),true);
    assert.equal(save.earthProgress.step,5);assert.equal(earthCityChapterProgress(save,city.quests).step,5);
    assert.equal(advanceEarthCityChapter(save,second,'arrival'),false);
});
test('city progress survives save validation and belongs to the records cloud shard',()=>{
    const save=createAdventure(content);const q=city.sideQuests[0];applyEarthCityQuest(save,city,q.startNpc,q.id,'accept');
    const parsed=parseSave(JSON.stringify(save),content),split=splitRoleSave(parsed);
    assert.deepEqual(split.records.earthCityProgress,save.earthCityProgress);assert.equal(split.state.earthCityProgress,undefined);
    assert.throws(()=>validateEarthCityProgress({version:1,cities:{shenzhen:{chapters:{},quests:{bad:{accepted:false,stage:0,complete:true}}}}}),/支线/);
});
test('entering a city loads one package, registers its atlas lazily and releases it on departure',async()=>{
    const requests=[],registered=[],released=[],source=structuredClone(content);
    const fetcher=async url=>{
        requests.push(url);
        if(url.startsWith('data/')){const value=read(url);if(url.endsWith('cities/shenzhen.json'))value.art.landmarks.atlas=null;return {ok:true,json:async()=>value};}
        if(/\.(png|webp)$/.test(url))return {ok:true,blob:async()=>({})};
        if(url.includes('.csv'))return {ok:true,text:async()=> 'id,name,country,lat,lon,native,population\n15174,深圳,中国,22.5431,114.0579,深圳,17494398'};
        throw Error('Unexpected '+url);
    };
    const service=createEarthService({content:source,fetcher,decodeOverview:async()=>({key:'overview',width:2,height:2,bytes:16}),decode:async(blob,palette,key)=>({key,width:2,height:2,indices:new Uint8Array(4),types:['grass'],bytes:20}),registerImage:(id,row)=>registered.push(id),releaseImage:id=>released.push(id)});
    assert.equal(requests.length,0);await service.atlas();assert.equal(registered.length,0);assert.equal(requests.some(url=>url.includes('cities/shenzhen.json')),false);
    const {world}=await service.prepare(city.center);assert.equal(world.city.id,'shenzhen');assert.deepEqual(registered,['earth-boat',city.art.npcs.id]);
    const count=requests.length;await service.story();await service.story();assert.equal(requests.length,count);
    assert.equal(requests.filter(url=>url.endsWith('cities/shenzhen.json')).length,1);
    await service.update(earthPoint(115,23),10000);assert.equal(world.city,null);assert.deepEqual(released,[city.art.npcs.id]);assert.equal(service.chapter,null);
    service.cancel();
    assert.ok(released.includes('earth-boat'));
});
