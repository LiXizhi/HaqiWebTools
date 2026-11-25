import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {guidanceCard} from '../js/views/adventure/view_adventure_guidance.js';
import {dungeonTacticsProfile,dungeonTacticsPreparation,nextTowerMilestone} from '../js/dungeon_tactics_core.js';
import {dungeonChallengeLines,dungeonChallengeMessages} from '../js/dungeon_challenge_core.js';
import {dungeonEnemyIntel,towerMilestoneBonus} from '../js/adventure_dungeon_journeys_core.js';
import {dungeonProgress} from '../js/adventure_coop_core.js';
import {dungeonHonorTitle} from '../js/adventure_honors_core.js';
import {dungeonFirstReward} from '../js/dungeon_first_rewards_core.js';
import {SPARK_DUNGEON} from '../js/spark_rescue_core.js';
import {dungeonWatchStory} from '../js/dungeon_watch_story_core.js';
import {tr,fill,setTranslator} from '../js/locale_runtime.js';
import {parseLocaleFile,lookup} from '../js/locale_core.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const dictionaries=Object.fromEntries(['en','ja','ko'].map(id=>[id,parseLocaleFile(read(`data/adventure/locale/${id}.txt`))]));
const blade='Fire_FireDamageBlade',trap='Fire_FireDamageTrap';
const record={clears:3,bestTurns:12,bestDefeats:0,lastTurns:17,lastDefeats:2};
const d={id:'journey:first-watch',name:'巡夜',kind:'elite',loaded:true,recommendedLevel:5,partySize:1,arenas:[{id:'a',monsterIds:['a']},{id:'b',monsterIds:['b','a']}]};
const content={items:{},learn:{fire:[{key:blade,level:7}]},monsters:{a:{name:'强化术',level:6,hp:120},b:{name:'陷阱',level:9,hp:1234}}};
const save=()=>({school:'fire',level:3,heroHp:415.9,cards:{},deck:[],formation:['pet'],heroSlot:0,pets:{pet:{hunger:0}},dungeonRuns:{[d.id]:{cleared:['a']}}});

// Only DOM and player equipment computation are fixture boundaries. The guidance,
// preparation, records, enemy-intel and journey renderer below are production code.
function dom(){
 const all=[];
 const createElement=tag=>{const n={tag,className:'',dataset:{},children:[],textContent:'',append(...rows){this.children.push(...rows);},replaceChildren(...rows){this.children=rows;},setAttribute(){},focus(){},querySelector(){return all.find(n=>n.className==='primary');}};all.push(n);return n;};
 function el(tag,cls='',...children){const n=createElement(tag);n.className=cls;for(const c of children)n.append(typeof c==='string'?tr(c):c);return n;}
 return {all,document:{createElement},el,button:(text,click,cls)=>Object.assign(el('button',cls,text),{click})};
}
function plain(message){return typeof message==='string'?message:message.source.replace(/\{(\w+)\}/g,(_,key)=>String(message.vars[key]));}
function assertMessage(node,message,locale){
 const source=typeof message==='string'?message:message.source;
 assert.ok(node,`view omitted ${source}`);
 assert.equal(node.dataset.zh,plain(message));
 assert.notEqual(lookup(source,locale,dictionaries),source,`missing ${locale}: ${source}`);
 assert.notEqual(node.textContent,node.dataset.zh);
 assert.doesNotMatch(node.textContent,/\{\w+\}/);
 for(const value of Object.values(message.vars||{}))if(typeof value==='number'||/^[\d,]+$/.test(String(value)))assert.ok(node.textContent.includes(String(value)),`${node.textContent} lost ${value}`);
}
function withLocale(locale,fn){
 const prior=globalThis.document,fixture=dom();globalThis.document=fixture.document;
 setTranslator(s=>lookup(s,locale,dictionaries),locale);
 try{fn(fixture);}finally{setTranslator(null);if(prior===undefined)delete globalThis.document;else globalThis.document=prior;}
}

for(const locale of ['en','ja','ko']){
 test(`real guidance translates all preparation branches and preserves legacy lines: ${locale}`,()=>withLocale(locale,()=>{
  const cases=[
   {player:{fixedCards:[{key:blade,count:1}],deck:[{key:trap,count:1}]},expected:['强化术由当前装备附带，已可在战斗中抽到；配合相同学派的攻击使用。','陷阱已装入当前卡组；配合相同学派的攻击使用。']},
   {player:{deck:[]},level:8,cards:{[blade]:1},expected:['强化术已学会，尚未装入当前卡组；可到卡组中加入。','陷阱尚未学会；课堂借用的卡牌不会带出课堂。']},
   {player:{deck:[]},expected:['强化术尚未学会，本学派 7 级解锁；课堂借用的卡牌不会带出课堂。','陷阱尚未学会；课堂借用的卡牌不会带出课堂。']}
  ];
  for(const row of cases){
   const state={...save(),level:row.level||3,cards:row.cards||{}},result=dungeonTacticsPreparation(state,content,d,row.player);
   assert.deepEqual(result.lines.slice(1,3),row.expected);
   assert.equal(result.lines[0],row.level?'当前 8 级，建议 5 级。等级建议已达到，仍需留意卡组和生命。':'当前 3 级，建议 5 级。可以先做岛上任务升级，再来挑战。');
   assert.equal(result.lines[3],'当前主角生命 415；副本内不会自动恢复生命；可先离开副本，在岛上休息恢复，再进入继续已有进度。');
   assert.match(result.lines[4],/^伙伴需有饱食/);
   const card=guidanceCard({steps:result.messages});
   card.children[0].children.forEach((n,i)=>assertMessage(n,result.messages[i],locale));
   assert.deepEqual(result.lines,result.messages.map(plain));
  }
  const owned={...save(),inventory:{1:1}};
  const gearContent={...content,schools:{fire:1},cardItems:{123:trap},items:{1:{id:1,kind:1,slot:5,stats:{139:123}}}};
  const gear=dungeonTacticsPreparation(owned,gearContent,d,{deck:[]});
  assert.match(gear.lines[2],/可由已拥有的装备附带/);
  assertMessage(guidanceCard({steps:gear.messages}).children[0].children[2],gear.messages[2],locale);
  const rested={...save(),heroHp:null,formation:[]};
  const messages=dungeonTacticsPreparation(rested,content,d,{deck:[]}).messages;
  assert.equal(messages.length,4);
  assert.equal(messages[3],'副本内不会自动恢复生命；可先离开副本，在岛上休息恢复，再进入继续已有进度。');
  assertMessage(guidanceCard({body:messages[3]}).children[0],messages[3],locale);
  const late=dungeonTacticsPreparation(rested,content,{id:'journey:ember-night',kind:'elite'},{deck:[]});
  assert.equal(late.messages[1],'这是后期四人挑战，末波包含 50 级敌人。建议准备四位等级与装备相称的出战单位；只提升主角等级仍可能失利。');
  assertMessage(guidanceCard({body:late.messages[1]}).children[0],late.messages[1],locale);
 }));
 test(`real guidance records and string compatibility: ${locale}`,()=>withLocale(locale,()=>{
  for(const row of [null,record]){
   const messages=dungeonChallengeMessages(row),card=guidanceCard({steps:messages});
   card.children[0].children.forEach((n,i)=>assertMessage(n,messages[i],locale));
   assert.deepEqual(dungeonChallengeLines(row),row?['完整通关 3 次','最快通关 12 回合 · 期间失利 0 次','最近通关 17 回合 · 期间失利 2 次']:['尚未完成整轮挑战；从头进入副本后开始记录。']);
  }
  const legacy=guidanceCard({eyebrow:'legacy eyebrow',title:'legacy title',body:'legacy body',steps:['legacy step 42'],footnote:'legacy footer'});
  assert.deepEqual(legacy.children.filter(n=>n.tag!=='ol').map(n=>n.textContent),['legacy eyebrow','legacy title','legacy body','legacy footer']);
  assert.equal(legacy.children[3].children[0].textContent,'legacy step 42');
 }));
 test(`actual journey view wires dynamic guidance and progress: ${locale}`,()=>withLocale(locale,fixture=>{
  const context=vm.createContext({...fixture,tr,fill,guidanceCard,dungeonTacticsProfile,dungeonTacticsPreparation,dungeonEnemyIntel,dungeonChallengeMessages,dungeonProgress,nextTowerMilestone,towerMilestoneBonus,dungeonHonorTitle,dungeonFirstReward,SPARK_DUNGEON,dungeonWatchStory,playerSpec:s=>({deck:s.deck}),createCloseButton:click=>fixture.button('',click)});
  vm.runInContext(read('js/views/adventure/view_dungeon_journey.js').replace(/^import .*;\r?\n/gm,'').replace('export function','function'),context);
  for(const id of ['journey:first-watch','journey:lost-spark'])for(const firstRewarded of [false,true]){
   fixture.all.length=0;
   const dungeon={...d,id},state={...save(),dungeonRuns:{[id]:{cleared:['a']}},dungeonChallengeRecords:{[id]:{...record,firstRewarded}}};
   const rewardContent={...content,items:{24002:{name:'pack'},1430:{name:'amulet'}}};
   context.renderDungeonJourney(fixture.el('root'),{assets:{content:rewardContent},save:state,dungeon},{close(){},prepare(){}});
   const nodes=fixture.all.filter(n=>n.dataset.zh);
   const required=['2 波 · 每波最多 2 名敌人','敌人等级 6–9；生命最高的「陷阱」有 1,234 生命。',id===d.id?'可独自挑战，也可带一位已出战伙伴；当前将有 1 个出战单位。检查各自的生命与卡组。':'本次需要 1 个出战单位。检查每位成员的等级、当前生命和卡组，主角等级达标并不代表全队准备好了。'];
   for(const zh of required){const n=nodes.find(n=>n.dataset.zh===zh);assert.ok(n,zh);assert.notEqual(n.textContent,zh);assert.doesNotMatch(n.textContent,/\{\w+\}/);for(const digits of zh.match(/[\d,]+/g)||[])assert.ok(n.textContent.includes(digits));}
   for(const message of [...dungeonTacticsPreparation(state,content,dungeon,{deck:[]}).messages,...dungeonChallengeMessages(record)])assertMessage(nodes.find(n=>n.dataset.zh===plain(message)),message,locale);
   for(const source of ['本轮真实敌情','先把课堂战术装进自己的卡组','这是准备建议，可以自由尝试其他打法。',firstRewarded?'首通奖励已领取':'整轮首通奖励','从头完成个人整轮挑战后领取一次；真实玩家协作另行记录。领取后可自行选择是否穿戴。','个人挑战实绩','用更少回合完成整轮挑战'])assertMessage(nodes.find(n=>n.dataset.zh===source),source,locale);
   assert.notEqual(tr('继续本轮'),'继续本轮');
   assert.ok(fixture.all.some(n=>n.tag==='button'&&n.children.includes(tr('继续本轮'))));
   const honor=nodes.find(n=>n.dataset.zh.startsWith('首次完整通关可获荣誉'));
   assert.ok(honor);assert.notEqual(honor.textContent,honor.dataset.zh);assert.doesNotMatch(honor.textContent,/\{\w+\}/);
   const progress=fill('继续本轮进度：已清理 {cleared} / {total} 处营地。',{cleared:1,total:2});
   assert.notEqual(progress.text,progress.zh);assert.ok(fixture.all.some(n=>n.children.includes(progress.text)));
  }
 }));
}
