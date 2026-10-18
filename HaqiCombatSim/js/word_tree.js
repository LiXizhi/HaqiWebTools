import {emptyLanguageTree} from './language_tree_core.js';
import {treeGlossary,treeGloss} from './language_tree_gloss_core.js';
import {createLanguageTreeSession} from './language_tree_session.js';
import {createWordTreeView} from './view_word_tree.js';
/** One reusable tree implementation. Each instance owns its DOM, audio and session. */
export class WordTree {
 #controller;
 constructor(root,options){
  if(!root?.append||!options?.store||!options?.key)throw new TypeError('WordTree 需要挂载容器、key 和 store');
  this.#controller=createWordTree(root,options);
  this.ready=this.#controller.ready.then(()=>this);
 }
 get state(){return structuredClone(this.#controller.state);}
 get camera(){return this.#controller.camera;}
 get hits(){return this.#controller.hits;}
 get fruits(){return this.#controller.fruits;}
 get stats(){return this.#controller.stats;}
 refresh(){return this.#controller.refresh();}
 dispose(){this.#controller.dispose();}
}
function createWordTree(root,options){
const loadAbort=new AbortController();
const host=document.createElement('div');host.className='word-tree-instance';host.style.cssText='width:100%;height:100%;min-height:0';root.append(host);
const shadow=host.attachShadow({mode:'open'});
const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('../css/word_tree.css',import.meta.url).href;
let finishStyles;const stylesReady=new Promise((resolve,reject)=>{finishStyles=resolve;style.onload=resolve;style.onerror=()=>reject(Error('语言树样式加载失败'));});shadow.append(style);
const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
const surface=el('section');surface.className='word-tree';shadow.append(surface);
// Keep dictionary / game hotkeys outside this component's interactions.
surface.addEventListener('keydown',event=>event.stopPropagation());
const canvas=el('canvas');canvas.id='tree';canvas.tabIndex=0;canvas.setAttribute('aria-label','双语语言树，拖动旋转，滚轮缩放，Shift拖动平移。点击单词选择理解程度，点击果实答题。');
const popup=el('dialog');popup.className='tree-choice-popup';popup.setAttribute('aria-label','词语理解');popup.addEventListener('cancel',e=>e.preventDefault());
const toast=el('p');toast.className='tree-toast';toast.hidden=true;toast.setAttribute('role','status');surface.append(canvas,popup,toast);
let session,state=emptyLanguageTree(),glossary=new Map(),closed=false,preparing=false,nextPrepare=0,toastTimer;
const view=createWordTreeView(canvas,{select:word=>showWord(word.id),selectFruit:showFruit});
function message(text){clearTimeout(toastTimer);toast.textContent=text;toast.hidden=!text;toastTimer=setTimeout(()=>toast.hidden=true,4500);}
function button(text,run){const b=el('button',text);b.type='button';b.onclick=async()=>{for(const n of popup.querySelectorAll('button'))n.disabled=true;try{await run();}catch(e){message(e.message);}finally{for(const n of popup.querySelectorAll('button'))n.disabled=false;}};return b;}
function openPopup(title){if(popup.open)return false;popup.replaceChildren(el('h2',title));popup.showModal();return true;}
let speech=null,speechAbort=null;
function stopSpeech(){speechAbort?.abort();speechAbort=null;void speech?.cancel();}
popup.addEventListener('close',stopSpeech);
function addPronunciation(text){
 const heading=popup.querySelector('h2'),row=el('div');row.className='tree-word-heading';heading.replaceWith(row);row.append(heading);
 const read=el('button');read.type='button';read.className='tree-pronounce';read.title='朗读';read.setAttribute('aria-label',`朗读：${text}`);
 // Same speaker artwork as the NPC bilingual dialogue's read icon.
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS('http://www.w3.org/2000/svg','path');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');path.setAttribute('d','M4 9h4l5-4v14l-5-4H4z M16 8c2 2 2 6 0 8 M19 5c4 4 4 10 0 14');for(const [key,value] of Object.entries({fill:'none',stroke:'currentColor','stroke-width':'1.8','stroke-linecap':'round','stroke-linejoin':'round'}))path.setAttribute(key,value);svg.append(path);read.append(svg);row.append(read);
 read.onclick=async()=>{stopSpeech();const abort=new AbortController();speechAbort=abort;read.disabled=true;read.setAttribute('aria-busy','true');try{
  if(!speech){const {createLearningVoice}=await import('./language_adventure_voice.js');speech??=createLearningVoice();}
  if(abort.signal.aborted)return;await speech.speak(text,options.data?.language==='zh'?'zh-CN':'en-US',abort.signal);
 }catch(error){if(!abort.signal.aborted)message(error.message||'朗读暂时不可用');}finally{read.disabled=false;read.removeAttribute('aria-busy');}};
}
function showWord(id){const word=state.words[id];if(!word||!openPopup(id))return;popup.setAttribute('aria-label','词语理解');addPronunciation(id);popup.append(el('p',treeGloss(id,glossary)));const choices=el('div');choices.className='tree-rating-choices';for(const [mark,label] of [['know','我全掌握了'],['basic','基本理解'],['unknown','不认识']])choices.append(button(label,async()=>{await session.mark(id,mark);stopSpeech();popup.close();if(mark==='unknown'){if(!options.onUnknown?.(id))showLearningCard(id);return;}canvas.focus({preventScroll:true});void prepare();}));popup.append(choices);}
function showLearningCard(id){if(!openPopup(id))return;popup.setAttribute('aria-label','词语学习卡');addPronunciation(id);popup.append(el('p',treeGloss(id,glossary)));for(const c of (state.words[id]?.contexts||[]).slice(0,2)){popup.append(el('p',c.text));if(c.zh&&c.zh!==c.text)popup.append(el('small',c.zh));}popup.append(button('返回语言树',async()=>{stopSpeech();popup.close();canvas.focus({preventScroll:true});}));}
function showFruit(q){if(!openPopup(q.sentence))return;popup.setAttribute('aria-label','果实题目');if(q.demo)popup.append(el('small','演示题'));for(const [word,meaning] of Object.entries(q.glosses||{}))popup.append(el('small',`${word}：${meaning}`));const choices=el('div');choices.className='tree-fruit-choices';q.options.forEach((option,index)=>choices.append(button(option.text,async()=>{const r=await session.answer(q.id,index);stopSpeech();popup.close();canvas.focus({preventScroll:true});if(r?.result)message(r.result.correct?'答对了':`正确含义：${q.translation}`);})));popup.append(choices);}
async function prepare(){if(closed||document.hidden||preparing||Date.now()<nextPrepare)return;preparing=true;nextPrepare=Date.now()+60000;try{await session.prepare();}finally{preparing=false;}}
function changed(result){if(closed)return;state=result.state;view.setState(state);view.setQuestions(state.questions.filter(q=>['know','basic'].includes(state.words[q.target]?.mark)));if(result.warning.includes('未保存')||result.warning.includes('未同步'))message(result.warning);}
async function start(){
 await stylesReady;if(closed)return;
 let entries=options.data?.entries;
 if(!entries){const response=await fetch(new URL('../data/adventure/dictionary/en.json',import.meta.url),{signal:loadAbort.signal});if(!response.ok)throw Error('词语加载失败');entries=(await response.json()).entries;}
 let supplement={};
 if(options.data?.language!=='zh'){const response=await fetch(new URL('../data/adventure/dictionary/tree-glosses.json',import.meta.url),{signal:loadAbort.signal});if(!response.ok)throw Error('词义加载失败');supplement=(await response.json()).meanings;}
 if(closed)return;glossary=treeGlossary(entries,supplement);view.setGlossary(glossary);
 session=createLanguageTreeSession({...options,onChange:changed});await session.open();if(closed)return;
 if(options.syncMastery){try{await options.syncMastery();if(!closed)await session.open();}catch{if(!closed)message('掌握清单暂未同步，本地记录仍可使用。');}}
 if(!closed)await prepare();
}
const timer=setInterval(()=>{if(session)void prepare();},15000);
function close(){if(closed)return;closed=true;loadAbort.abort();finishStyles();stopSpeech();session?.close();view.dispose();clearInterval(timer);clearTimeout(toastTimer);popup.close();host.remove();window.removeEventListener('pagehide',close);}
window.addEventListener('pagehide',close);
const ready=start().catch(error=>{if(closed)return;message(error.message);throw error;});
return {ready,dispose:close,async refresh(){await ready;if(!closed)await session.open();},get state(){return state;},get camera(){return view.camera;},get hits(){return view.hits;},get fruits(){return view.fruits;},get stats(){return view.stats;}};
}
