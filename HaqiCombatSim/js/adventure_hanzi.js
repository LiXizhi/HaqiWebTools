import {hanziBattleDescription} from './hanzi_battle_core.js';
import {resolveParams} from './combat_params_core.js';
import {createHanziProgress,completeHanziAttempt,compareHanziWriting,speechMatches,equipHanziEffect,equipHanziBattleCard,validateHanziContent} from './hanzi_core.js';
import {createHanziView} from './view_hanzi.js';
import {createLearningVoice} from './language_adventure_voice.js';
import {createDialogueVoiceSession} from './dialogue_voice_session.js';
import {heroPortrait} from './hero_renderer.js';
import {createHanziPresentation} from './hanzi_presentation.js';

let loading;
export async function loadHanziContent(effects){
 if(!loading)loading=Promise.all([
  fetch(new URL('../data/adventure/hanzi/content.json',import.meta.url)).then(r=>{if(!r.ok)throw Error('汉字内容暂时无法加载');return r.json();}),
  fetch(new URL('../data/adventure/hanzi/strokes.json',import.meta.url)).then(r=>{if(!r.ok)throw Error('汉字笔画暂时无法加载');return r.json();}),
 ]).catch(e=>{loading=null;throw e;});
 const [data,strokes]=await loading;validateHanziContent(data,strokes,effects);return {data,strokes};
}
export function createHanziIsland({root,data,strokes,getState,commit,award,onClose,onLogin,voice=createLearningVoice({getSettings:()=>({...getState().save.languageLearning,target:'zh-CN'})}),viewFactory=createHanziView,now=()=>Date.now()}){
 const speech=createDialogueVoiceSession(voice);let session=null,opened=false,role=null,owner=null;
 const progress=()=>{if(getState().save.hanzi)return getState().save.hanzi;const p=createHanziProgress();if(getState().save.locale==='en'||getState().save.languageLearning?.native==='en'){p.locale='en';p.pinyin=true;}return p;};
 const t=(zh,en)=>progress().locale==='en'?en:zh;
 const valid=s=>opened&&session===s&&!s.abort.signal.aborted&&getState().role===role&&getState().owner===owner&&getState().stage==='world';
 const view=viewFactory(root,data,strokes,{progress,close:onClose,cancel,begin,write,speak,read,finish:()=>speech.finish(),recording:()=>speech.recording,online:()=>!!getState().owner,login:()=>onLogin(),reduced:()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches||getState().reduced,
  battleDescription:id=>hanziBattleDescription({id,params:resolveParams({cards:{},version:'kids'},getState().content?.balanceParams||{},{groups:['hanzi']}).hanzi}),
  equipBattle:id=>commit(equipHanziBattleCard(progress(),id)),
  preferences:patch=>commit({...progress(),...patch}),equip:(effect,base)=>commit(equipHanziEffect(progress(),effect,base)),
  portrait:()=>heroPortrait(getState().assets,getState().save,64,90,{facing:0,lookAround:false}),
  spellName:base=>{if(progress().locale==='en'&&data.spellNames?.[base])return data.spellNames[base];const assets=getState().assets,card=Object.values(assets.dataset.cards).find(c=>assets.effects.cards[c.key]?.base===base);return card?(assets.effects.cards[card.key]?.name||card.name||base):base;},
 });
 function begin(char,options){session?.abort.abort();void speech.dispose();session={char,...options,accepted:false,abort:new AbortController(),phase:'ready'};}
 function cancel(){void speech.dispose();if(session){session.abort.abort();session.abort=new AbortController();session.phase='ready';}view?.update({message:''});}
 function accept(s,method,hinted){
  if(!valid(s)||s.accepted||s.preview)return false;
  const result=completeHanziAttempt(progress(),{id:s.char.id,stage:s.stage,review:s.review,method,hinted,now:now()});
  if(!result.changed)return false;
  // Commit collection first. Failed durable writes cannot mint a daily reward.
  commit(result.progress);s.accepted=true;award(`hanzi:${s.char.id}`);
  view.update({accepted:true,collected:result.collected||s.review,message:result.collected?t('你把魔法封进了卡牌。它属于你了。','You sealed the magic in a card. It is yours.'):s.review?t('复习完成，新的相遇已记下。','Revisit complete. Your next encounter is scheduled.'):t('魔法记住了这次练习。去下一个地方再试一次。','The magic remembers this practice. Try again in a new place.')});return true;
 }
 function write(points,hinted){
  const s=session;if(!s||!valid(s)||s.accepted||s.preview)return;
  const median=strokes.characters[s.char.glyph].medians.map(row=>row.map(([x,y])=>[x/1024,(900-y)/1024]));
  const result=compareHanziWriting(points,median);
  if(!result.ok){view.update({message:result.reason==='count'?t(`这个字有 ${median.length} 笔，请写完整。`,`This character has ${median.length} strokes. Please complete them.`):t('再看看笔画的方向和位置。可以展开提示或观看笔顺。','Check stroke direction and position. You can reveal a hint or watch stroke order.')});return;}
  try{accept(s,'write',hinted);}catch(e){view.update({message:e.message});}
 }
 async function speak(hinted){
  const s=session;if(!s||!valid(s)||s.accepted||s.preview||s.phase!=='ready')return;
  if(!getState().owner){view.update({message:t('请登录使用语音，或直接选择写字。','Sign in for voice, or choose writing.')} );return;}
  await speech.start({signal:s.abort.signal,valid:()=>valid(s)&&!s.accepted,maxMs:20000,
   onState:phase=>{s.phase=phase;view.update({phase,message:phase==='recording'?t('说出这个字，或它的示例短词。','Say the character or its example word.'):t('正在连接或识别…','Connecting or recognizing…')});},
   onError:e=>{s.phase='ready';view.update({message:t('语音暂不可用，可以重试或写字。','Voice is unavailable. Retry or write instead.')+' '+e.message});},
   onCancel:()=>{s.phase='ready';view.update({message:t('已取消，没有记录本次练习。','Cancelled. This attempt was not recorded.')});},
   onText:text=>{s.phase='ready';if(!speechMatches(text,s.char)){view.update({message:t('没有听清目标表达，请再试一次，也可以写字。','The target expression was not recognized. Try again or write it.')});return;}try{accept(s,'speak',hinted);}catch(e){view.update({message:e.message});}},
  });
 }
 async function read(){const s=session;if(!s||!valid(s)||s.accepted||s.phase!=='ready')return;if(!getState().owner){view.update({message:t('登录后可以听示范，也可以先看笔顺。','Sign in to listen, or watch the stroke order.')});return;}
  await speech.speak({text:s.char.words[0],locale:'zh-CN',signal:s.abort.signal,valid:()=>valid(s),onState:phase=>{s.phase=phase;view.update({phase});},onError:e=>view.update({message:e.message}),onDone:()=>{s.phase='ready';view.update();}});
 }
 return {open(chapter=null,character=null){role=getState().role;owner=getState().owner;opened=true;view.open(Math.max(0,data.chapters.findIndex(c=>c.id===chapter)),character);},close(){opened=false;session?.abort.abort();session=null;void speech.dispose();view.close();},suspend(){cancel();},tick(){if(opened&&(getState().role!==role||getState().owner!==owner||getState().stage!=='world'))onClose();},get active(){return opened;}};
}
export function installHanziPresentation(assets,data,getSave){assets.hanziPresentation=createHanziPresentation(data,assets.effects,getSave);return assets.hanziPresentation;}
