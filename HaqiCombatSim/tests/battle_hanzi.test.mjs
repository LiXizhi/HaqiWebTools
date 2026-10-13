import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {HANZI_IDS,createHanziProgress,completeHanziAttempt,compareHanziWriting,speechMatches,validateHanziProgress,validateHanziContent,chapterOpen,equipHanziEffect,parseHanziRoute} from '../js/hanzi_core.js';
import {createHanziPresentation} from '../js/hanzi_presentation.js';
import {awardDailySpeech,dailyBuffs} from '../js/language_daily_buff_core.js';
import {durableSave,runtimeValues,restoreRuntime,splitRoleSave,joinRoleSave} from '../js/adventure_storage_core.js';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {createAdventure,parseSave} from '../js/adventure_core.js';
import {checkedProgress} from '../js/adventure_cloud_core.js';
import {createPveBattle,playPveRound} from '../js/combat_pve_core.js';
import {cardsInHand} from '../js/combat_unit_core.js';
import {useCard} from '../js/combat_cards_core.js';
import {defaultParams} from '../js/combat_params_core.js';
import {hanziBattleSpec,validateHanziBattleSpec} from '../js/hanzi_battle_core.js';
import {grantHanziQuestCard,equipHanziBattleCard} from '../js/hanzi_core.js';
import {battleStatusEffects} from '../js/view_adventure_overhead_status.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../data/'+p,import.meta.url),'utf8'));
const data=read('adventure/hanzi/content.json'),strokes=read('adventure/hanzi/strokes.json'),effects=read('adventure/spell-effects.json');
const template=id=>strokes.characters[data.characters.find(c=>c.id===id).glyph].medians.map(s=>s.map(([x,y])=>[x/1024,(900-y)/1024]));
const collect=(p,id)=>{for(let stage=0;stage<3;stage++)p=completeHanziAttempt(p,{id,stage,method:stage%2?'speak':'write',hinted:stage===0,now:1000+stage}).progress;return p;};

test('Hanzi battle cards: successful casts stack to a cap; heal clamps; pass/fizzle never reward',()=>{
 const dataset=read('adventure/combat.json'),key='Fire_SingleAttack_Level0_120_adv';
 for(const id of ['huo','tu','shui']){
  const save={};grantHanziQuestCard(save,id);grantHanziQuestCard(save,id);assert.equal(save.hanzi.questCards.length,1);
  const spec=hanziBattleSpec(save,{});
  const battle=createPveBattle({dataset,player:{id:'hero',school:'fire',level:5,hanziBattle:spec,deck:[{key,count:8}]},monsters:[{id:'foe',school:'ice',level:1,hp:50000,attributes:{},pool:[],sequences:[],genes:[],cardsets:{}}],seed:77});
  const hero=battle.sides.near[0],enemy=battle.sides.far[0],baseDamage=hero.stats.damagePct.all||0,baseDefense=hero.stats.resistPct.all||0;
  hero.hp=hero.maxHp-1;
  const card={...battle.resolved.cards[key],accuracy:100};
  useCard(battle,hero,{...card,accuracy:-100},enemy);assert.equal(hero.hanziBattle.triggers,0);
  useCard(battle,hero,{...card,type:'Pass'},hero);assert.equal(hero.hanziBattle.triggers,0);
  for(let i=0;i<5;i++){hero.pips.normal=7;useCard(battle,hero,card,enemy);}
  assert.equal(hero.hanziBattle.triggers,3);assert.equal(battle.events.filter(e=>e.type==='hanzi_buff').length,3);
  if(id==='huo')assert.equal(hero.stats.damagePct.all,baseDamage+9);
  if(id==='tu')assert.equal(hero.stats.resistPct.all,baseDefense+9);
  if(id==='shui'){assert.equal(hero.hp,hero.maxHp);assert.equal(battle.events.filter(e=>e.type==='heal'&&e.label==='hanzi').reduce((n,e)=>n+e.amount,0),1);}
  assert.ok(battleStatusEffects(hero,battle).some(e=>e.desc.includes('3/3')));
  assert.deepEqual(spec.params,defaultParams('kids').hanzi);assert.equal(spec.triggers,undefined);
  save.hanzi=equipHanziBattleCard(save.hanzi,id);assert.equal(hanziBattleSpec(save,{}),null);
 }
 assert.throws(()=>equipHanziBattleCard(createHanziProgress(),'huo'));
 assert.throws(()=>validateHanziBattleSpec({version:1,id:'huo',params:{...defaultParams('kids').hanzi,maxTriggers:Infinity}}));
});

test('quest cards survive records/cloud roundtrip without inventing learning attempts',()=>{
 const {content,dataset}=installExpansion(read('adventure/chapter.json'),read('adventure/combat.json'),read('adventure/pets.json'),read('adventure/shop-candidates.json'),read('kids/cards.json'),read('kids/charms.json'));
 const save=createAdventure(content);grantHanziQuestCard(save,'tu');
 const split=splitRoleSave(save),restored=joinRoleSave(split.state,split,content);
 assert.deepEqual(checkedProgress(restored,content,dataset).save.hanzi,save.hanzi);assert.deepEqual(save.hanzi.entries,{});
 const legacy={...save,pendingEncounter:{player:{}}};assert.equal(hanziBattleSpec(legacy,content),null);
});
test('Hanzi route defaults, invalid chapters and all content references',()=>{
 assert.deepEqual(parseHanziRoute(''),{active:false,chapter:null});assert.equal(parseHanziRoute('?product=nope').active,false);assert.equal(parseHanziRoute('?product=hanzi&chapter=secret').chapter,null);
 assert.deepEqual(parseHanziRoute('?product=hanzi&chapter=hz-02'),{active:true,chapter:'hz-02'});assert.equal(validateHanziContent(data,strokes,effects),true);
});
for(const char of data.characters)test(`writing ${char.glyph}: scale/translation and small pointer variation pass; reversal/scribble fail`,()=>{
 const points=template(char.id);assert.equal(compareHanziWriting(points,points).ok,true);
 const jitter=points.map(s=>s.map(([x,y],i)=>[x*.72+.12+Math.sin(i)*.004,y*.72+.1+Math.cos(i)*.004]));assert.equal(compareHanziWriting(jitter,points).ok,true);
 assert.equal(compareHanziWriting(points.map(s=>[...s].reverse()),points).ok,false);
 assert.equal(compareHanziWriting(points.map(()=>[[.1,.1],[.9,.9],[.1,.9],[.9,.1]]),points).ok,false);
 assert.equal(compareHanziWriting(points.map(()=>[[.3,.3],[.3001,.3001]]),points).ok,false);
});
test('three distinct stages, any modality, idempotent callbacks and immutable input',()=>{
 for(const methods of [['write','write','write'],['speak','speak','speak'],['speak','write','speak']]){
  let p=createHanziProgress();for(let stage=0;stage<3;stage++){
   const before=JSON.stringify(p),args={id:'huo',stage,method:methods[stage],hinted:stage===1,now:1000+stage};const result=completeHanziAttempt(p,args);assert.equal(JSON.stringify(p),before);assert.equal(result.changed,true);p=result.progress;
   assert.equal(completeHanziAttempt(p,args).changed,false);assert.equal(p.entries.huo.attempts.length,stage+1);
  }assert.equal(p.entries.huo.attempts[1].hinted,true);assert.equal(completeHanziAttempt(p,{id:'huo',stage:3,method:'write',now:5000}).changed,false);
 }
});
test('chapter locks and review scheduling do not allow skipped stages',()=>{
 let p=createHanziProgress();assert.equal(completeHanziAttempt(p,{id:'ren',stage:0,method:'write',now:1000}).changed,false);
 assert.equal(completeHanziAttempt(p,{id:'ri',stage:2,method:'write',now:1000}).changed,false);
 for(const id of HANZI_IDS.slice(0,8))p=collect(p,id);assert.equal(chapterOpen(p,1),true);assert.equal(chapterOpen(p,2),false);
 const due=p.entries.ri.review.due;assert.equal(completeHanziAttempt(p,{id:'ri',stage:0,review:true,method:'write',now:due-1}).changed,false);
 p=completeHanziAttempt(p,{id:'ri',stage:0,review:true,method:'write',now:due}).progress;assert.equal(p.entries.ri.review.due,due+3*86400000);assert.equal(p.entries.ri.attempts.length,3);
 assert.equal(completeHanziAttempt(p,{id:'ri',stage:0,review:true,method:'write',now:due}).changed,false);
});
test('speech accepts only reviewed target expressions; blanks and unrelated sentences fail',()=>{
 const fire=data.characters.find(c=>c.id==='huo');for(const text of ['火','火苗','火。','这是火苗'])assert.equal(speechMatches(text,fire),true);
 for(const text of ['', '水', '我不想说火', '火车'])assert.equal(speechMatches(text,fire),false);
});
test('daily Hanzi award shares cap, dedupes after runtime reload, resets next day',()=>{
 const at=new Date(2026,9,12,12).getTime(),save={seed:9,zone:'camp',revision:1};awardDailySpeech(save,{},'hanzi:huo',at);assert.equal(awardDailySpeech(save,{},'hanzi:huo',at),null);
 const runtime=runtimeValues(save),content={worldMapIndex:{islands:{camp:{initialSpawn:{x:0,y:0}}}}};
 // restoreRuntime's day is intentionally real-time; validate persistence directly as well.
 assert.deepEqual(runtime.dailyLanguageBuff,save.dailyLanguageBuff);assert.equal(durableSave(save).dailyLanguageBuff,undefined);
 const restored=restoreRuntime(durableSave(save),content);restored.dailyLanguageBuff=runtime.dailyLanguageBuff;assert.equal(awardDailySpeech(restored,{},'hanzi:huo',at),null);
 for(let i=0;i<50;i++)awardDailySpeech(restored,{},'existing-language:'+i,at);assert.equal(Object.values(dailyBuffs(restored,at)).reduce((a,b)=>a+b),40);
 assert.equal(awardDailySpeech(restored,{},'hanzi:huo',at+86400000).total,1);
});
test('Hanzi persists through actual core parsing/cloud allowlist and split records, old saves unchanged',()=>{
 const {content,dataset}=installExpansion(read('adventure/chapter.json'),read('adventure/combat.json'),read('adventure/pets.json'),read('adventure/shop-candidates.json'),read('kids/cards.json'),read('kids/charms.json'));
 const save=createAdventure(content),original=structuredClone(save);assert.equal(parseSave(save,content).hanzi,undefined);save.hanzi=collect(createHanziProgress(),'huo');
 const split=splitRoleSave(save);assert.equal(split.state.hanzi,undefined);assert.deepEqual(split.records.hanzi,save.hanzi);assert.deepEqual(joinRoleSave(split.state,split,content).hanzi,save.hanzi);assert.deepEqual(checkedProgress(save,content,dataset).save.hanzi,save.hanzi);assert.deepEqual(save.inventory,original.inventory);
 const broken=structuredClone(save.hanzi);broken.entries.huo.attempts[1].stage=0;assert.throws(()=>validateHanziProgress(broken));
});
test('all six skins bind real spells, require collection, toggle and never mutate combat inputs',()=>{
 let p=createHanziProgress();assert.throws(()=>equipHanziEffect(p,data.effects[0],data.effects[0].bases[0]));for(const id of HANZI_IDS)p=collect(p,id);
 const save={hanzi:p},presentation=createHanziPresentation(data,effects,()=>save),cards=read('kids/cards.json').cards;
 for(const fx of data.effects){const base=fx.bases[0];save.hanzi=equipHanziEffect(save.hanzi,fx,base);const key=Object.keys(effects.cards).find(k=>effects.cards[k].base===base),card=cards?.[key]||{key};
  const before=JSON.stringify({card,effects,save});assert.equal(presentation.effect(card).id,fx.id);assert.equal(JSON.stringify({card,effects,save}),before);save.hanzi=equipHanziEffect(save.hanzi,fx,base);assert.equal(presentation.effect(card),null);
 }
});
test('same seeded battle stays identical while equipped skins render cards and casts',()=>{
 let p=createHanziProgress();for(const id of HANZI_IDS)p=collect(p,id);
 const fx=data.effects[1],save={hanzi:equipHanziEffect(p,fx,'Fire_SingleAttack_Level0')};
 const presentation=createHanziPresentation(data,effects,()=>save),dataset=read('adventure/combat.json');
 const options={dataset,player:{id:'hero',school:'fire',level:10,slot:0,deck:[{key:'Fire_SingleAttack_Level0_120_adv',count:8}]},monsters:[{id:'foe',school:'ice',level:1,hp:5000,attributes:{},pool:[],sequences:[],genes:[],cardsets:{}}],seed:791};
 const plain=createPveBattle(options),dressed=createPveBattle(options),canvas=new Proxy({},{get:()=>()=>{},set:()=>true});let rendered=0;
 for(let round=0;round<6&&!plain.finished;round++){
  const card=cardsInHand(plain.sides.near[0])[0],decision=card?{...card,targetId:plain.sides.far[0].id}:null;
  if(card){assert.ok(presentation.effect(card));presentation.badge(canvas,card);for(let f=0;f<=10;f++)presentation.spell(canvas,{card,progress:f/10,from:{x:20,y:30},to:{x:120,y:140}});rendered++;}
  playPveRound(plain,decision);playPveRound(dressed,decision);
  assert.equal(JSON.stringify(dressed),JSON.stringify(plain));
 }
 assert.ok(rendered>0);
});
