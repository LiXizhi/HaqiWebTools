import {npcCharacter} from '../js/adventure_city_people_core.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createLearningVoice} from '../js/language_adventure_voice.js';
import {selectDialogueVoice} from '../js/dialogue_speaker_core.js';
import {npcHasActiveQuest} from '../js/adventure_npc_core.js';

// Exercise the actual task-dialogue renderer and app callback, not just the
// separate course/free-chat controllers. This is the NPC speech-button path.
test('task dialogue forwards Azure Dragon and each subsequent speaker to SDK synthesis',async()=>{
 const source=fs.readFileSync(new URL('../js/view_adventure.js',import.meta.url),'utf8');
 const renderSource=source.slice(source.indexOf('export function renderDialogue('),source.indexOf('// 战斗卡牌说明')).replace('export function','function');
 const app=fs.readFileSync(new URL('../js/adventure_app.js',import.meta.url),'utf8');
 const controller=app.slice(app.indexOf('function finishTrackedDialogue()'),app.indexOf('function interact(target)'));
 const chapter=JSON.parse(fs.readFileSync(new URL('../data/adventure/chapter.json',import.meta.url)));
 const calls=[],oldAudio=globalThis.Audio;
 globalThis.Audio=class{play(){queueMicrotask(()=>this.onended());return Promise.resolve();}pause(){}};
 const voice=createLearningVoice({getSettings:()=>({voiceType:'zh_female_tianmeiyueyue_moon_bigtts'}),load:async()=>({speechRTC:{createSession(config){return {synthesize:async text=>{calls.push({text,config});return {audioUrl:'blob:dialogue-test'};},stop:async()=>{}};}}})});
 const element=()=>({children:[],dataset:{},textContent:'I am Azure Dragon.',classList:{toggle(){},add(){}},style:{setProperty(){}},setAttribute(){},append(...items){this.children.push(...items);},replaceChildren(){},querySelector(){return element();}});
 let readAloud;
 const portraitCalls=[],heroCalls=[];
 const view=vm.createContext({npcCharacter,heroPortrait:(...args)=>{heroCalls.push(args);return element();},npcHasActiveQuest,el:element,art:(...args)=>{portraitCalls.push(args);return element();},fill:()=>({text:'NPC'}),islandName:()=>'',createCloseButton:element,button:element,
  currentQuest:()=>null,catalogStatSnapshot:()=>({}),catalogQuestsForNpc:()=>({accept:[],claim:[]}),catalogTalksForNpc:()=>[],pendingQuestTalk:()=>null,npcServices:()=>[],
  dialogueLearningLines:()=>[{text:'I am Azure Dragon.',locale:'en'}],bindDialogue:(_root,_box,_text,_hint,_button,options)=>{readAloud=options.readAloud;}});
 vm.runInContext(renderSource,view);
 const model={assets:{content:chapter},save:{languageLearning:{enabled:true,target:'en'}}};
 const context=vm.createContext({dialog:{npcId:36211},nodes:{overlay:element()},model:()=>model,V:{renderDialogue:view.renderDialogue},dialogueVoice:voice,
  close(){},mapDialogue(){},openPanel(){},track(){},travel(){}});
 vm.runInContext(controller,context);
 try{
  // Initial resident greeting, then quest lines with changing NPC IDs.
  for(const dialog of [{npcId:36211},{npcId:36211,lines:[{npcId:36211,text:'Hello'},{npcId:36209,text:'Hello'}],index:0,finishLabel:'完成'},{npcId:36211,lines:[{npcId:36211,text:'Hello'},{npcId:36209,text:'Hello'}],index:1,finishLabel:'完成'}]){
   context.dialog=dialog;context.paintDialogue();await readAloud('Hello','en',new AbortController().signal);
   const npc=chapter.npcs[dialog.lines?.[dialog.index]?.npcId||dialog.npcId];assert.equal(calls.at(-1).config.voiceType,selectDialogueVoice(npc));
  }
  assert.match(calls[0].config.voiceType,/_male_/);assert.match(calls[1].config.voiceType,/_male_/);assert.match(calls[2].config.voiceType,/_female_/);
  assert.equal(heroCalls.length,0);assert.equal(portraitCalls.length,3);assert.deepEqual(portraitCalls[0][1],chapter.npcs[36211].portrait);
 }finally{await voice.cancel();globalThis.Audio=oldAudio;}
});
